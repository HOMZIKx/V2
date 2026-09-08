import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';

import { createLogger } from '@v2/observability';

import { TeamEconomyRepository } from '../db/team-economy.repository.js';
import { loadLegacyEconomyCatalog } from './legacy-economy-catalog.js';

@Injectable()
export class LegacyEconomyCatalogSeeder implements OnApplicationBootstrap {
  private readonly logger = createLogger('legacy-economy-catalog-seeder');

  public constructor(private readonly economy: TeamEconomyRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;

    const items = await loadLegacyEconomyCatalog();
    if (items.length === 0) {
      this.logger.info('legacy DOBRYTEMAT catalogue unavailable; continuing with local V2 catalogue.');
      return;
    }

    const result = await this.economy.importItems({
      items,
      createdBy: 'system:dobry-temat-seed',
    });
    this.logger.info(
      `legacy DOBRYTEMAT catalogue synchronized: ${result.imported} added, ${result.total} total.`,
    );
  }
}
