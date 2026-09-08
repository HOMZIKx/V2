import { PlayerTeamError } from '../../domain/errors.js';
import {
  type FixedHuntRoomRecord,
  type FixedHuntRoomsRepositoryPort,
  type FixedHuntRoomState,
} from '../../domain/ports/fixed-hunt-rooms.port.js';

export type FixedHuntRoomsDemoAccessConfig = {
  readonly allowDemoWrite: boolean;
};

export const FIXED_HUNT_ROOM_KEYS = [
  'metin-red-las',
  'metin-v1',
  'general-v1',
  'metin-v2',
  'general-v2',
] as const;

export type FixedHuntRoomKey = (typeof FIXED_HUNT_ROOM_KEYS)[number];

export class FixedHuntRoomsUseCases {
  public constructor(
    private readonly repository: FixedHuntRoomsRepositoryPort,
    private readonly demoAccess: FixedHuntRoomsDemoAccessConfig,
  ) {}

  public assertDemoAccess(demoHeaderValue: string | undefined): string {
    if (!this.demoAccess.allowDemoWrite) {
      throw new PlayerTeamError(
        'DEMO_ACCESS_DENIED',
        'player-team online demo persistence is not enabled',
      );
    }
    if (demoHeaderValue === undefined || demoHeaderValue.trim().length === 0) {
      throw new PlayerTeamError('UNAUTHORIZED', 'missing demo viewer header');
    }
    return demoHeaderValue.trim();
  }

  public assertRoomKey(roomKey: string): FixedHuntRoomKey {
    if (!FIXED_HUNT_ROOM_KEYS.includes(roomKey as FixedHuntRoomKey)) {
      throw new PlayerTeamError('NOT_FOUND', 'fixed hunt room not found');
    }
    return roomKey as FixedHuntRoomKey;
  }

  public getRoom(roomKey: string): Promise<FixedHuntRoomRecord> {
    return this.repository.getOrCreateFixedHuntRoom(this.assertRoomKey(roomKey));
  }

  public updateRoom(input: {
    readonly roomKey: string;
    readonly viewerId: string;
    readonly state: FixedHuntRoomState;
    readonly expectedRevision: number;
  }): Promise<FixedHuntRoomRecord> {
    const roomKey = this.assertRoomKey(input.roomKey);
    if (input.state.roomKey !== roomKey) {
      throw new PlayerTeamError('VALIDATION_FAILED', 'fixed hunt room state key mismatch');
    }
    return this.repository.updateFixedHuntRoom({ ...input, roomKey });
  }
}
