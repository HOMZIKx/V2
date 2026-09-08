import { tmpdir } from 'node:os';

export type GatewayPersistenceSource = 'configured' | 'legacy' | 'temporary';

export type GatewayPersistenceStatus = {
  readonly source: GatewayPersistenceSource;
  readonly temporaryFallback: boolean;
  readonly dataDirConfigured: boolean;
};

export function resolveGatewayPersistenceBaseDir(): {
  readonly baseDir: string;
  readonly status: GatewayPersistenceStatus;
} {
  const configured = (process.env.DISCORD_GATEWAY_DATA_DIR ?? '').trim();
  if (configured) {
    return {
      baseDir: configured,
      status: {
        source: 'configured',
        temporaryFallback: false,
        dataDirConfigured: true,
      },
    };
  }

  const legacy = (process.env.DESTILED_DATA_DIR ?? '').trim();
  if (legacy) {
    return {
      baseDir: legacy,
      status: {
        source: 'legacy',
        temporaryFallback: false,
        dataDirConfigured: true,
      },
    };
  }

  return {
    baseDir: tmpdir(),
    status: {
      source: 'temporary',
      temporaryFallback: true,
      dataDirConfigured: false,
    },
  };
}

export function getGatewayPersistenceStatus(): GatewayPersistenceStatus {
  return resolveGatewayPersistenceBaseDir().status;
}
