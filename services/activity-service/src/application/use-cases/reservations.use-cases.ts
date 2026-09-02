import { randomUUID } from 'node:crypto';

import { ActivityError } from '../../domain/errors.js';
import { assertNoDoubleBooking } from '../../domain/reservations.js';
import type { ActivityTx, ActorSubject } from '../ports/activity.ports.js';
import { enqueueUserNotification } from './notification.use-cases.js';

/** PROTOTYPE / FOUNDATION WIP — RESERVATIONS_OWNER_DISCOVERY_REQUIRED. Do not expand. */

function requireDiscord(actor: ActorSubject): string {
  if (actor.discordUserId === undefined || actor.discordUserId.trim().length === 0) {
    throw new ActivityError('UNAUTHENTICATED', 'Discord actor required');
  }
  return actor.discordUserId;
}

export async function createReservation(
  tx: ActivityTx,
  actor: ActorSubject,
  input: {
    guildId: string;
    organizationId: string;
    resourceId: string;
    spotId: string;
    startsAt: Date;
    endsAt: Date;
  },
  now: Date,
): Promise<{ id: string }> {
  const owner = requireDiscord(actor);
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    throw new ActivityError('VALIDATION_FAILED', 'endsAt must be after startsAt');
  }
  const scope = await tx.getReservationSpotScope(input.spotId);
  if (scope === null) {
    throw new ActivityError('NOT_FOUND', 'Reservation spot not found');
  }
  if (!scope.spotEnabled || !scope.resourceEnabled) {
    throw new ActivityError('VALIDATION_FAILED', 'Reservation spot is not available');
  }
  if (scope.resourceId !== input.resourceId) {
    throw new ActivityError('VALIDATION_FAILED', 'spotId does not belong to resourceId');
  }
  if (scope.guildId !== input.guildId || scope.organizationId !== input.organizationId) {
    throw new ActivityError('FORBIDDEN', 'Reservation scope mismatch');
  }
  const existing = await tx.listReservationsForSpot(input.spotId, ['pending', 'confirmed']);
  const conflict = assertNoDoubleBooking({
    candidate: {
      startsAtMs: input.startsAt.getTime(),
      endsAtMs: input.endsAt.getTime(),
    },
    existing: existing.map((row) => ({
      startsAtMs: row.startsAt.getTime(),
      endsAtMs: row.endsAt.getTime(),
    })),
  });
  if (!conflict.ok) {
    throw new ActivityError('CONFLICT', 'Spot already reserved for that time window');
  }
  const id = await tx.insertReservation({
    id: randomUUID(),
    guildId: scope.guildId,
    organizationId: scope.organizationId,
    resourceId: scope.resourceId,
    spotId: scope.spotId,
    ownerDiscordUserId: owner,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: 'confirmed',
  });
  await enqueueUserNotification(
    tx,
    {
      guildId: scope.guildId,
      recipientDiscordUserId: owner,
      notificationClass: 'TRANSACTIONAL',
      kind: 'reservation.confirmed',
      title: 'Rezerwacja potwierdzona',
      body: `Termin ${input.startsAt.toISOString()} – ${input.endsAt.toISOString()}`,
      dedupeKey: `reservation:${id}:confirmed`,
      deepLink: `v2://reservations/${id}`,
    },
    now,
  );
  return { id };
}

export async function cancelReservation(
  tx: ActivityTx,
  actor: ActorSubject,
  reservationId: string,
  now: Date,
): Promise<void> {
  const owner = requireDiscord(actor);
  await tx.cancelReservation(reservationId, owner, now);
}
