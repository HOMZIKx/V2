export type HuntMarkerKind = 'boss' | 'metin';
export type HuntMarkerStatus = 'ready' | 'running' | 'unknown';
export type HuntMarkerScope = 'all' | HuntMarkerStatus;

export interface HuntMarker {
  readonly id: string;
  readonly name: string;
  readonly kind: HuntMarkerKind;
  readonly status: HuntMarkerStatus;
  readonly position: { readonly x: number; readonly y: number };
  readonly respawnLabel: string;
  readonly intervalLabel: string;
  readonly lastConfirmedBy: string | null;
  readonly lastConfirmedLabel: string | null;
}

export interface MapHuntSession {
  readonly id: string;
  readonly title: string;
  readonly mapName: string;
  readonly description: string;
  readonly participantCount: number;
  readonly notificationTarget: string;
  readonly notificationPolicy: string;
  readonly markers: readonly HuntMarker[];
}

export interface MapHuntingSnapshot {
  readonly viewerName: string;
  readonly sessions: readonly MapHuntSession[];
  readonly canManageSessions: boolean;
}

export interface MapHuntingSummary {
  readonly sessionCount: number;
  readonly readyMarkers: number;
  readonly runningMarkers: number;
  readonly participantCount: number;
}

export const mapHuntingFixture: MapHuntingSnapshot = {
  viewerName: 'Mateusz',
  canManageSessions: true,
  sessions: [
    {
      id: 'red-forest-evening',
      title: 'Wieczorny objazd',
      mapName: 'Czerwony Las',
      description: 'Wspólny monitoring bossów i metinów na dzisiejszy wieczór.',
      participantCount: 5,
      notificationTarget: '#wb-czerwony-las',
      notificationPolicy: 'Tylko osoby zapisane do tej sesji',
      markers: [
        {
          id: 'red-forest-boss-1',
          name: 'Drzewiec',
          kind: 'boss',
          status: 'ready',
          position: { x: 69, y: 29 },
          respawnLabel: 'gotowy teraz',
          intervalLabel: 'co 4 godziny',
          lastConfirmedBy: 'XiaoHu',
          lastConfirmedLabel: 'przed 2 min',
        },
        {
          id: 'red-forest-metin-1',
          name: 'Metin Czerwonego Lasu',
          kind: 'metin',
          status: 'running',
          position: { x: 41, y: 58 },
          respawnLabel: 'za 38 min',
          intervalLabel: 'co 90 min',
          lastConfirmedBy: 'Mateusz',
          lastConfirmedLabel: 'przed 52 min',
        },
        {
          id: 'red-forest-metin-2',
          name: 'Metin Czerwonego Lasu',
          kind: 'metin',
          status: 'unknown',
          position: { x: 23, y: 31 },
          respawnLabel: 'wymaga sprawdzenia',
          intervalLabel: 'co 90 min',
          lastConfirmedBy: null,
          lastConfirmedLabel: null,
        },
      ],
    },
    {
      id: 'haunted-forest',
      title: 'Trasa Zjawy',
      mapName: 'Nawiedzony Las',
      description: 'Niezależna sesja dla niższych poziomów i ekipy Zjawy.',
      participantCount: 3,
      notificationTarget: '#wb-zjawa',
      notificationPolicy: 'Przypomnienie do roli WB: Zjawa',
      markers: [
        {
          id: 'haunted-boss-1',
          name: 'Zjawa',
          kind: 'boss',
          status: 'running',
          position: { x: 55, y: 44 },
          respawnLabel: 'za 1 godz. 12 min',
          intervalLabel: 'co 3 godziny',
          lastConfirmedBy: 'Wicek',
          lastConfirmedLabel: 'przed 1 godz. 48 min',
        },
        {
          id: 'haunted-metin-1',
          name: 'Metin Cienia',
          kind: 'metin',
          status: 'unknown',
          position: { x: 28, y: 68 },
          respawnLabel: 'brak potwierdzenia',
          intervalLabel: 'co 60 min',
          lastConfirmedBy: null,
          lastConfirmedLabel: null,
        },
      ],
    },
  ],
};

export function getMapHuntingSummary(snapshot: MapHuntingSnapshot): MapHuntingSummary {
  const markers = snapshot.sessions.flatMap((session) => session.markers);

  return {
    sessionCount: snapshot.sessions.length,
    readyMarkers: markers.filter((marker) => marker.status === 'ready').length,
    runningMarkers: markers.filter((marker) => marker.status === 'running').length,
    participantCount: snapshot.sessions.reduce((sum, session) => sum + session.participantCount, 0),
  };
}

export function filterHuntMarkers(
  markers: readonly HuntMarker[],
  scope: HuntMarkerScope,
): readonly HuntMarker[] {
  return scope === 'all' ? markers : markers.filter((marker) => marker.status === scope);
}

export function confirmHuntMarker(
  session: MapHuntSession,
  markerId: string,
  confirmedBy: string,
): MapHuntSession {
  return {
    ...session,
    markers: session.markers.map((marker) =>
      marker.id === markerId
        ? {
            ...marker,
            status: 'running',
            respawnLabel: 'odliczanie rozpoczęte',
            lastConfirmedBy: confirmedBy,
            lastConfirmedLabel: 'teraz',
          }
        : marker,
    ),
  };
}
