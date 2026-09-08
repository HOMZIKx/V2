import { Module } from '@nestjs/common';

import { HuntRoomsUseCases } from '../application/use-cases/hunt-rooms.use-cases.js';
import { MetinGeneralHuntsUseCases } from '../application/use-cases/metin-general-hunts.use-cases.js';
import { PlayerTeamStateUseCases } from '../application/use-cases/player-team-state.use-cases.js';
import { TeamEconomyUseCases } from '../application/use-cases/team-economy.use-cases.js';
import { TeamInvitationsUseCases } from '../application/use-cases/team-invitations.use-cases.js';
import { PlayerTeamEnvProvider } from '../infrastructure/config/player-team-env.provider.js';
import { HuntRoomsRepository } from '../infrastructure/db/hunt-rooms.repository.js';
import { MetinGeneralHuntsRepository } from '../infrastructure/db/metin-general-hunts.repository.js';
import { PlayerTeamStateRepository } from '../infrastructure/db/player-team-state.repository.js';
import { TeamEconomyRepository } from '../infrastructure/db/team-economy.repository.js';
import { TeamInvitationsRepository } from '../infrastructure/db/team-invitations.repository.js';

import { HealthController } from './health.controller.js';
import { HuntRoomsController } from './hunt-rooms.controller.js';
import { MetinGeneralHuntsController } from './metin-general-hunts.controller.js';
import { PlayerTeamController } from './player-team.controller.js';
import { TeamEconomyController } from './team-economy.controller.js';
import { TeamInvitationsController } from './team-invitations.controller.js';
import { WorkspaceLiveBus } from './workspace-live.bus.js';
import { WorkspaceLiveController } from './workspace-live.controller.js';
import {
  HUNT_ROOMS_USE_CASES,
  METIN_GENERAL_HUNTS_USE_CASES,
  PLAYER_TEAM_ENV,
  PLAYER_TEAM_STATE_USE_CASES,
  TEAM_ECONOMY_USE_CASES,
  TEAM_INVITATIONS_USE_CASES,
} from './player-team.tokens.js';

@Module({
  controllers: [
    HealthController,
    PlayerTeamController,
    HuntRoomsController,
    MetinGeneralHuntsController,
    WorkspaceLiveController,
    TeamInvitationsController,
    TeamEconomyController,
  ],
  providers: [
    PlayerTeamEnvProvider,
    {
      provide: PLAYER_TEAM_ENV,
      useFactory: (provider: PlayerTeamEnvProvider) => provider.get(),
      inject: [PlayerTeamEnvProvider],
    },
    PlayerTeamStateRepository,
    HuntRoomsRepository,
    MetinGeneralHuntsRepository,
    TeamInvitationsRepository,
    TeamEconomyRepository,
    WorkspaceLiveBus,
    {
      provide: PLAYER_TEAM_STATE_USE_CASES,
      useFactory: (
        repository: PlayerTeamStateRepository,
        env: ReturnType<PlayerTeamEnvProvider['get']>,
      ) => new PlayerTeamStateUseCases(repository, { allowDemoWrite: env.PLAYER_TEAM_ALLOW_DEMO_WRITE }),
      inject: [PlayerTeamStateRepository, PLAYER_TEAM_ENV],
    },
    {
      provide: HUNT_ROOMS_USE_CASES,
      useFactory: (repository: HuntRoomsRepository, env: ReturnType<PlayerTeamEnvProvider['get']>) =>
        new HuntRoomsUseCases(repository, { allowDemoWrite: env.PLAYER_TEAM_ALLOW_DEMO_WRITE }),
      inject: [HuntRoomsRepository, PLAYER_TEAM_ENV],
    },
    {
      provide: METIN_GENERAL_HUNTS_USE_CASES,
      useFactory: (repository: MetinGeneralHuntsRepository, env: ReturnType<PlayerTeamEnvProvider['get']>) =>
        new MetinGeneralHuntsUseCases(repository, { allowDemoWrite: env.PLAYER_TEAM_ALLOW_DEMO_WRITE }),
      inject: [MetinGeneralHuntsRepository, PLAYER_TEAM_ENV],
    },
    {
      provide: TEAM_INVITATIONS_USE_CASES,
      useFactory: (repository: TeamInvitationsRepository, env: ReturnType<PlayerTeamEnvProvider['get']>) =>
        new TeamInvitationsUseCases(repository, { allowDemoWrite: env.PLAYER_TEAM_ALLOW_DEMO_WRITE }),
      inject: [TeamInvitationsRepository, PLAYER_TEAM_ENV],
    },
    {
      provide: TEAM_ECONOMY_USE_CASES,
      useFactory: (repository: TeamEconomyRepository, stateUseCases: PlayerTeamStateUseCases) =>
        new TeamEconomyUseCases(repository, stateUseCases),
      inject: [TeamEconomyRepository, PLAYER_TEAM_STATE_USE_CASES],
    },
  ],
})
export class AppModule {}
