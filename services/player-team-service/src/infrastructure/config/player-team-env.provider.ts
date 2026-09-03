import { Injectable } from '@nestjs/common';

import { parsePlayerTeamEnv, type PlayerTeamEnv } from './player-team-env.js';

@Injectable()
export class PlayerTeamEnvProvider {
  public get(): PlayerTeamEnv {
    return parsePlayerTeamEnv(process.env);
  }
}

