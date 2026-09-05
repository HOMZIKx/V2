export type PartyRoomMember = {
  readonly id: string;
  readonly displayName: string;
  readonly role: 'leader' | 'member';
};

export type PartyRoomRequest = {
  readonly id: string;
  readonly displayName: string;
  readonly status: 'pending' | 'accepted' | 'rejected';
};

export type PartyRoomPin = {
  readonly id: string;
  readonly partyId: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly location: { readonly x: number; readonly y: number };
  readonly placedAt: number;
  readonly placedBy: string;
  readonly label: string;
  readonly kind: 'metin' | 'boss' | 'spot';
};

export type PartyRoomRecord = {
  readonly id: string;
  readonly joinCode: string;
  readonly name: string;
  readonly leaderId: string;
  readonly visibility: 'open' | 'closed';
  readonly mapKey: string;
  readonly activeChannel: number;
  readonly sessionKills: number;
  readonly members: readonly PartyRoomMember[];
  readonly requests: readonly PartyRoomRequest[];
  readonly pins: readonly PartyRoomPin[];
  readonly revision: number;
  readonly updatedAtIso: string;
};

export type TimerRoomRecord = {
  readonly key: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly kind: 'boss' | 'metin';
  readonly entityName?: string;
  readonly confirmedAt: number | null;
  readonly confirmedBy: string | null;
  readonly location: { readonly x: number; readonly y: number } | null;
  readonly operationId?: string | null;
};

export type TimerRoomSnapshot = {
  readonly id: string;
  readonly mapKey: string;
  readonly channel: number;
  readonly roomCode: string | null;
  readonly timers: Readonly<Record<string, TimerRoomRecord>>;
  readonly appliedOps: readonly string[];
  readonly revision: number;
  readonly updatedAtIso: string;
};

export type CreatePartyRoomInput = {
  readonly leaderId: string;
  readonly displayName: string;
  readonly mapKey: string;
  readonly activeChannel: number;
  readonly visibility: 'open' | 'closed';
};

export type JoinPartyRoomInput = {
  readonly viewerId: string;
  readonly displayName: string;
  readonly joinCode: string;
};

export type PatchPartyRoomInput = {
  readonly roomId: string;
  readonly viewerId: string;
  readonly expectedRevision: number;
  readonly mapKey?: string;
  readonly activeChannel?: number;
  readonly sessionKills?: number;
  readonly visibility?: 'open' | 'closed';
};

export type ConfirmTimerKillInput = {
  readonly mapKey: string;
  readonly channel: number;
  readonly roomCode: string | null;
  readonly record: TimerRoomRecord;
  readonly operationId: string;
  readonly expectedRevision: number | null;
};

export interface HuntRoomsRepositoryPort {
  createPartyRoom(input: CreatePartyRoomInput): Promise<PartyRoomRecord>;
  joinPartyRoom(input: JoinPartyRoomInput): Promise<PartyRoomRecord>;
  getPartyRoom(roomId: string): Promise<PartyRoomRecord | null>;
  leavePartyRoom(roomId: string, viewerId: string): Promise<PartyRoomRecord | null>;
  patchPartyRoom(input: PatchPartyRoomInput): Promise<PartyRoomRecord>;
  addPartyRoomPin(roomId: string, pin: PartyRoomPin): Promise<PartyRoomRecord>;
  removePartyRoomPin(roomId: string, pinId: string): Promise<PartyRoomRecord>;

  getOrCreateTimerRoom(
    mapKey: string,
    channel: number,
    roomCode: string | null,
  ): Promise<TimerRoomSnapshot>;
  confirmTimerKill(input: ConfirmTimerKillInput): Promise<TimerRoomSnapshot>;
}
