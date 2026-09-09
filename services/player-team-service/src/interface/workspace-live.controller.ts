import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Put,
  Sse,
  UseFilters,
  type MessageEvent,
} from '@nestjs/common';
import {
  concat,
  distinctUntilChanged,
  from,
  map,
  merge,
  mergeMap,
  timer,
  type Observable,
} from 'rxjs';
import { z } from 'zod';

import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { evaluateEquipmentFeedback } from '../domain/ai-observation-feedback.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import {
  AiObservationRepository,
  type PendingAiObservation,
} from '../infrastructure/db/ai-observation.repository.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import { PLAYER_TEAM_ENV, PLAYER_TEAM_STATE_USE_CASES } from './player-team.tokens.js';
import { resolvePlayerTeamRequestDiscordId } from './request-auth.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';

const putWorkspaceStateBodySchema = z.object({
  state: z.record(z.string(), z.unknown()),
  expectedRevision: z.number().int().nonnegative().nullable().optional(),
});

type RequestHeaders = Record<string, string | string[] | undefined>;
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function itemRecords(state: JsonRecord): readonly JsonRecord[] {
  return Array.isArray(state.items)
    ? state.items.map(asRecord).filter((entry): entry is JsonRecord => entry !== null)
    : [];
}

function newlyAddedItem(previous: JsonRecord, next: JsonRecord): JsonRecord | null {
  const previousIds = new Set(itemRecords(previous).map((item) => asString(item.id)).filter(Boolean));
  const added = itemRecords(next).filter((item) => {
    const id = asString(item.id);
    return id !== null && !previousIds.has(id);
  });
  return added.length === 1 ? added[0]! : null;
}

function hasCharacter(state: JsonRecord, characterId: string | null): boolean {
  if (characterId === null) return true;
  const characters = Array.isArray(state.characters) ? state.characters : [];
  return characters.some((entry) => asString(asRecord(entry)?.id) === characterId);
}

function equipmentFinalOutput(item: JsonRecord) {
  return {
    name: asString(item.name) ?? '',
    enhancement: typeof item.enhancement === 'number' ? item.enhancement : Number(item.enhancement ?? 0),
    category: asString(item.category) ?? '',
    bonuses: Array.isArray(item.bonuses)
      ? item.bonuses.filter((entry): entry is string => typeof entry === 'string')
      : [],
    catalogLayer: asString(item.catalogLayer),
  };
}

@Controller('player-team/v1/workspaces')
@UseFilters(PlayerTeamExceptionFilter)
export class WorkspaceLiveController {
  public constructor(
    @Inject(PLAYER_TEAM_STATE_USE_CASES) private readonly useCases: PlayerTeamStateUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
    private readonly liveBus: WorkspaceLiveBus,
    @Inject(AiObservationRepository) private readonly observations: AiObservationRepository,
  ) {}

  private viewerId(headers: RequestHeaders): Promise<string> {
    return resolvePlayerTeamRequestDiscordId({
      headers,
      env: this.env,
      assertDemoAccess: (value) => this.useCases.assertDemoAccess(value),
    });
  }

  @Get(':workspaceId/state')
  public async getState(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.useCases.getWorkspaceSnapshot(await this.viewerId(headers), workspaceId);
  }

  private async pendingEquipmentObservation(
    viewerId: string,
    workspaceId: string,
  ): Promise<PendingAiObservation | null> {
    try {
      return await this.observations.latestPending(viewerId, {
        analysisType: 'equipment',
        workspaceId,
        maxAgeMinutes: 15,
      });
    } catch (error) {
      console.error('EQ AI pending observation lookup failed', error);
      return null;
    }
  }

  private async saveEquipmentFeedback(input: {
    readonly viewerId: string;
    readonly pending: PendingAiObservation;
    readonly previousState: JsonRecord;
    readonly nextState: JsonRecord;
  }): Promise<void> {
    if (!hasCharacter(input.nextState, input.pending.characterId)) return;
    const item = newlyAddedItem(input.previousState, input.nextState);
    if (!item) return;
    const finalOutput = equipmentFinalOutput(item);
    const decision = evaluateEquipmentFeedback(input.pending.aiOutput, finalOutput);
    try {
      await this.observations.addFeedback(input.viewerId, input.pending.id, {
        status: decision.status,
        finalOutput,
        changedFields: decision.changedFields,
      });
    } catch (error) {
      console.error('EQ AI feedback persistence failed', error);
    }
  }

  @Put(':workspaceId/state')
  @HttpCode(200)
  public async putState(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
    @Body() rawBody: unknown,
  ) {
    const parsed = putWorkspaceStateBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }

    const viewerId = await this.viewerId(headers);
    const pending = await this.pendingEquipmentObservation(viewerId, workspaceId);
    const previous = pending ? await this.useCases.getWorkspaceSnapshot(viewerId, workspaceId) : null;

    const record = await this.useCases.upsertWorkspaceSnapshot({
      ownerUserId: viewerId,
      workspaceId,
      state: parsed.data.state,
      expectedRevision: parsed.data.expectedRevision ?? null,
    });
    this.liveBus.publish(record);

    if (pending && previous) {
      await this.saveEquipmentFeedback({
        viewerId,
        pending,
        previousState: previous.state,
        nextState: record.state,
      });
    }

    return record;
  }

  @Sse(':workspaceId/events')
  public events(
    @Headers() headers: RequestHeaders,
    @Param('workspaceId') workspaceId: string,
  ): Observable<MessageEvent> {
    return from(this.viewerId(headers)).pipe(
      mergeMap((ownerUserId) => {
        const readCurrent = () => from(this.useCases.getWorkspaceSnapshot(ownerUserId, workspaceId));

        // Local bus gives near-instant updates on a single instance. The database
        // poll makes the stream correct across multiple Player Team instances and
        // after process restarts/redeploys because PostgreSQL is authoritative.
        const initial = readCurrent();
        const localUpdates = this.liveBus.events(workspaceId).pipe(mergeMap(readCurrent));
        const databaseUpdates = timer(1_000, 1_000).pipe(mergeMap(readCurrent));

        return concat(initial, merge(localUpdates, databaseUpdates)).pipe(
          distinctUntilChanged((previous, next) => previous.revision === next.revision),
          map((record) => ({ type: 'workspace', data: record }) satisfies MessageEvent),
        );
      }),
    );
  }
}
