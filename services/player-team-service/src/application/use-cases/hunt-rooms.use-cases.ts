import { PlayerTeamError } from '../../domain/errors.js';
import {
  type ConfirmTimerKillInput,
  type CreatePartyRoomInput,
  type HuntRoomsRepositoryPort,
  type JoinPartyRoomInput,
  type PartyRoomPin,
  type PartyRoomRecord,
  type PatchPartyRoomInput,
  type TimerRoomSnapshot,
} from '../../domain/ports/hunt-rooms.port.js';

export type HuntRoomsDemoAccessConfig = {
  readonly allowDemoWrite: boolean;
};

/**
 * Application layer for shared Party + Timers rooms (HuntRoomsController).
 * Demo access mirrors PlayerTeamStateUseCases until Identity JWT wiring.
 */
export class HuntRoomsUseCases {
  public constructor(
    private readonly repository: HuntRoomsRepositoryPort,
    private readonly demoAccess: HuntRoomsDemoAccessConfig,
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

  public createPartyRoom(input: CreatePartyRoomInput): Promise<PartyRoomRecord> {
    return this.repository.createPartyRoom(input);
  }

  public joinPartyRoom(input: JoinPartyRoomInput): Promise<PartyRoomRecord> {
    return this.repository.joinPartyRoom(input);
  }

  public async getPartyRoom(roomId: string): Promise<PartyRoomRecord | null> {
    return this.repository.getPartyRoom(roomId);
  }

  public leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null> {
    return this.repository.leavePartyRoom(roomId, viewerId);
  }

  public patchPartyRoom(input: PatchPartyRoomInput): Promise<PartyRoomRecord> {
    return this.repository.patchPartyRoom(input);
  }

  public addPartyRoomPin(roomId: string, pin: PartyRoomPin): Promise<PartyRoomRecord> {
    return this.repository.addPartyRoomPin(roomId, pin);
  }

  public removePartyRoomPin(roomId: string, pinId: string): Promise<PartyRoomRecord> {
    return this.repository.removePartyRoomPin(roomId, pinId);
  }

  public getOrCreateTimerRoom(
    mapKey: string,
    channel: number,
    roomCode: string | null,
  ): Promise<TimerRoomSnapshot> {
    return this.repository.getOrCreateTimerRoom(mapKey, channel, roomCode);
  }

  public confirmTimerKill(input: ConfirmTimerKillInput): Promise<TimerRoomSnapshot> {
    return this.repository.confirmTimerKill(input);
  }
}
