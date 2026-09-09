import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';

import { type PrivateEconomyUseCases } from '../application/use-cases/private-economy.use-cases.js';
import { type PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { type PlayerTeamEnv } from '../infrastructure/config/player-team-env.js';
import { PlayerTeamExceptionFilter } from './player-team-exception.filter.js';
import {
  PLAYER_TEAM_ENV,
  PLAYER_TEAM_STATE_USE_CASES,
  PRIVATE_ECONOMY_USE_CASES,
} from './player-team.tokens.js';
import { resolvePlayerTeamRequestDiscordId } from './request-auth.js';

const currency = z.enum(['yang', 'won', 'gem']);
const itemSchema = z
  .object({
    itemId: z.string().min(1).nullable(),
    displayName: z.string().trim().min(1).max(160),
    totalQuantity: z.number().int().positive(),
    ourQuantity: z.number().int().nonnegative(),
    unitPrice: z.number().nonnegative(),
    currency,
    aiConfidence: z.number().min(0).max(1).nullable().optional(),
  })
  .refine((value) => value.ourQuantity <= value.totalQuantity, {
    message: 'ourQuantity cannot exceed totalQuantity',
  });
const moneySchema = z.object({
  currency,
  totalAmount: z.number().nonnegative(),
  ourShareBasisPoints: z.number().int().min(0).max(10_000),
});
const participantSchema = z.object({
  participantId: z.string().min(1),
  displayName: z.string().trim().min(1).max(120),
  isTeamMember: z.boolean(),
});
const createDropSchema = z
  .object({
    source: z.string().trim().min(1).max(120),
    occurredAtIso: z.string().datetime(),
    notes: z.string().trim().max(600).nullable().optional(),
    screenshotRef: z.string().max(500).nullable().optional(),
    ourShareBasisPoints: z.number().int().min(0).max(10_000),
    pileCount: z.number().int().min(1).max(100),
    splitMode: z.enum(['max_equal', 'strict_equal']),
    participants: z.array(participantSchema).max(100).default([]),
    items: z.array(itemSchema).max(200).default([]),
    money: z.array(moneySchema).max(12).default([]),
  })
  .refine((value) => value.items.length > 0 || value.money.some((entry) => entry.totalAmount > 0), {
    message: 'drop must contain at least one item or money entry',
  });
const createExpenseSchema = z.object({
  dropSessionId: z.string().min(1).nullable().optional(),
  label: z.string().trim().min(1).max(160),
  expenseType: z.enum(['item', 'yang', 'gem', 'other']),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  currency,
  ourShareBasisPoints: z.number().int().min(0).max(10_000),
  occurredAtIso: z.string().datetime(),
});
const createItemSchema = z.object({
  canonicalName: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(120),
  imageUrl: z.string().max(800).nullable().optional(),
  alias: z.string().trim().max(160).nullable().optional(),
});
const priceSchema = z.object({
  itemId: z.string().min(1),
  unitPrice: z.number().nonnegative(),
  currency,
});

type RequestHeaders = Record<string, string | string[] | undefined>;

@Controller('player-team/v1/economy/private')
@UseFilters(PlayerTeamExceptionFilter)
export class PrivateEconomyController {
  public constructor(
    @Inject(PRIVATE_ECONOMY_USE_CASES) private readonly economy: PrivateEconomyUseCases,
    @Inject(PLAYER_TEAM_STATE_USE_CASES) private readonly state: PlayerTeamStateUseCases,
    @Inject(PLAYER_TEAM_ENV) private readonly env: PlayerTeamEnv,
  ) {}

  private viewerId(headers: RequestHeaders): Promise<string> {
    return resolvePlayerTeamRequestDiscordId({
      headers,
      env: this.env,
      assertDemoAccess: (value) => this.state.assertDemoAccess(value),
    });
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(`invalid request body: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  @Get('items')
  public async items(@Headers() headers: RequestHeaders, @Query('q') q?: string) {
    return this.economy.searchItems(await this.viewerId(headers), q ?? '');
  }

  @Post('items')
  public async createItem(@Headers() headers: RequestHeaders, @Body() body: unknown) {
    return this.economy.createItem(
      await this.viewerId(headers),
      this.parse(createItemSchema, body),
    );
  }

  @Post('prices')
  @HttpCode(201)
  public async addPrice(@Headers() headers: RequestHeaders, @Body() body: unknown) {
    return this.economy.addPrice(
      await this.viewerId(headers),
      this.parse(priceSchema, body),
    );
  }

  @Get('drops')
  public async drops(@Headers() headers: RequestHeaders, @Query('since') since?: string) {
    return this.economy.listDrops(await this.viewerId(headers), since);
  }

  @Post('drops')
  public async createDrop(@Headers() headers: RequestHeaders, @Body() body: unknown) {
    return this.economy.createDrop(
      await this.viewerId(headers),
      this.parse(createDropSchema, body),
    );
  }

  @Get('expenses')
  public async expenses(@Headers() headers: RequestHeaders, @Query('since') since?: string) {
    return this.economy.listExpenses(await this.viewerId(headers), since);
  }

  @Post('expenses')
  public async createExpense(@Headers() headers: RequestHeaders, @Body() body: unknown) {
    return this.economy.createExpense(
      await this.viewerId(headers),
      this.parse(createExpenseSchema, body),
    );
  }

  @Get('summary')
  public async summary(@Headers() headers: RequestHeaders, @Query('since') since?: string) {
    return this.economy.summary(await this.viewerId(headers), since);
  }
}
