export interface MapHuntingSnapshot {
  readonly viewerName: string;
  readonly canManageTimers: boolean;
}
export const mapHuntingFixture: MapHuntingSnapshot = {
  viewerName: 'Mateusz',
  canManageTimers: true,
};
