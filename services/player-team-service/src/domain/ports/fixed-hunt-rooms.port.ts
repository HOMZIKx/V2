export type FixedHuntRoomState = Record<string, unknown>;

export type FixedHuntRoomRecord = {
  readonly roomKey: string;
  readonly state: FixedHuntRoomState;
  readonly revision: number;
  readonly updatedByUserId: string | null;
  readonly updatedAtIso: string;
};

export type UpdateFixedHuntRoomInput = {
  readonly roomKey: string;
  readonly viewerId: string;
  readonly state: FixedHuntRoomState;
  readonly expectedRevision: number;
};

export interface FixedHuntRoomsRepositoryPort {
  getOrCreateFixedHuntRoom(roomKey: string): Promise<FixedHuntRoomRecord>;
  updateFixedHuntRoom(input: UpdateFixedHuntRoomInput): Promise<FixedHuntRoomRecord>;
}
