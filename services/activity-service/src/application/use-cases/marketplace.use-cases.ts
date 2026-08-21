import { randomUUID } from 'node:crypto';

import { ActivityError } from '../../domain/errors.js';
import { offerMatchesWatch } from '../../domain/marketplace.js';
import type { ActivityTx, ActorSubject } from '../ports/activity.ports.js';
import { enqueueUserNotification } from './notification.use-cases.js';

function requireDiscord(actor: ActorSubject): string {
  if (actor.discordUserId === undefined || actor.discordUserId.trim().length === 0) {
    throw new ActivityError('UNAUTHENTICATED', 'Discord actor required');
  }
  return actor.discordUserId;
}

export async function createMarketplaceOffer(
  tx: ActivityTx,
  actor: ActorSubject,
  input: {
    guildId: string;
    organizationId: string;
    side: 'BUY' | 'SELL';
    categoryKey: string;
    itemLabel: string;
    priceAmount?: number | null;
    budgetAmount?: number | null;
    quantity: number;
    description: string;
    expiresAt?: Date | null;
  },
  now: Date,
): Promise<{ id: string; matchedWatches: number }> {
  const owner = requireDiscord(actor);
  const id = await tx.insertMarketplaceOffer({
    id: randomUUID(),
    guildId: input.guildId,
    organizationId: input.organizationId,
    ownerDiscordUserId: owner,
    side: input.side,
    categoryKey: input.categoryKey,
    itemLabel: input.itemLabel,
    priceAmount: input.priceAmount ?? null,
    budgetAmount: input.budgetAmount ?? null,
    quantity: input.quantity,
    description: input.description,
    expiresAt: input.expiresAt ?? null,
  });

  const watches = await tx.listActiveMarketplaceWatches(input.guildId);
  let matched = 0;
  for (const watch of watches) {
    if (watch.recipientDiscordUserId === owner) {
      continue;
    }
    const ok = offerMatchesWatch(
      {
        side: input.side,
        categoryKey: input.categoryKey,
        itemLabel: input.itemLabel,
        priceAmount: input.priceAmount ?? null,
        budgetAmount: input.budgetAmount ?? null,
        status: 'open',
      },
      {
        ...(watch.side !== null ? { side: watch.side } : {}),
        ...(watch.categoryKey !== null ? { categoryKey: watch.categoryKey } : {}),
        ...(watch.itemQuery !== null ? { itemQuery: watch.itemQuery } : {}),
        ...(watch.maxPrice !== null ? { maxPrice: watch.maxPrice } : {}),
        ...(watch.minBudget !== null ? { minBudget: watch.minBudget } : {}),
      },
    );
    if (!ok) {
      continue;
    }
    const result = await enqueueUserNotification(
      tx,
      {
        guildId: input.guildId,
        recipientDiscordUserId: watch.recipientDiscordUserId,
        notificationClass: 'DISCOVERY',
        kind: 'marketplace.match',
        title: `${input.side === 'SELL' ? 'Oferta' : 'Poszukuję'}: ${input.itemLabel}`,
        body: input.description.slice(0, 200),
        dedupeKey: `market:${id}:${watch.id}`,
        deepLink: `v2://marketplace/${id}`,
        interestKey: input.categoryKey,
      },
      now,
    );
    if (result.created) {
      matched += 1;
    }
  }
  return { id, matchedWatches: matched };
}
