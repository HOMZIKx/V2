import { Client } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

const identityDatabaseUrl =
  process.env.IDENTITY_DATABASE_URL ??
  'postgresql://identity:identity_dev_password@127.0.0.1:5432/identity';
const authorizationDatabaseUrl =
  process.env.AUTHORIZATION_DATABASE_URL ??
  'postgresql://authorization:authorization_dev_password@127.0.0.1:5432/authorization';
const activityDatabaseUrl =
  process.env.ACTIVITY_DATABASE_URL ??
  'postgresql://activity:activity_dev_password@127.0.0.1:5432/activity';
const playerWorkspaceDatabaseUrl =
  process.env.PLAYER_WORKSPACE_DATABASE_URL ??
  'postgresql://player_workspace:player_workspace_dev_password@127.0.0.1:5432/player_workspace';
const identityOnAuthorizationDatabaseUrl =
  process.env.IDENTITY_ON_AUTHORIZATION_DATABASE_URL ??
  'postgresql://identity:identity_dev_password@127.0.0.1:5432/authorization';
const authorizationOnIdentityDatabaseUrl =
  process.env.AUTHORIZATION_ON_IDENTITY_DATABASE_URL ??
  'postgresql://authorization:authorization_dev_password@127.0.0.1:5432/identity';
const identityOnActivityDatabaseUrl =
  process.env.IDENTITY_ON_ACTIVITY_DATABASE_URL ??
  'postgresql://identity:identity_dev_password@127.0.0.1:5432/activity';
const authorizationOnActivityDatabaseUrl =
  process.env.AUTHORIZATION_ON_ACTIVITY_DATABASE_URL ??
  'postgresql://authorization:authorization_dev_password@127.0.0.1:5432/activity';
const activityOnIdentityDatabaseUrl =
  process.env.ACTIVITY_ON_IDENTITY_DATABASE_URL ??
  'postgresql://activity:activity_dev_password@127.0.0.1:5432/identity';
const activityOnAuthorizationDatabaseUrl =
  process.env.ACTIVITY_ON_AUTHORIZATION_DATABASE_URL ??
  'postgresql://activity:activity_dev_password@127.0.0.1:5432/authorization';
const identityOnPlayerWorkspaceDatabaseUrl =
  process.env.IDENTITY_ON_PLAYER_WORKSPACE_DATABASE_URL ??
  'postgresql://identity:identity_dev_password@127.0.0.1:5432/player_workspace';
const playerWorkspaceOnIdentityDatabaseUrl =
  process.env.PLAYER_WORKSPACE_ON_IDENTITY_DATABASE_URL ??
  'postgresql://player_workspace:player_workspace_dev_password@127.0.0.1:5432/identity';
const activityOnPlayerWorkspaceDatabaseUrl =
  process.env.ACTIVITY_ON_PLAYER_WORKSPACE_DATABASE_URL ??
  'postgresql://activity:activity_dev_password@127.0.0.1:5432/player_workspace';
const playerWorkspaceOnActivityDatabaseUrl =
  process.env.PLAYER_WORKSPACE_ON_ACTIVITY_DATABASE_URL ??
  'postgresql://player_workspace:player_workspace_dev_password@127.0.0.1:5432/activity';

/** Fail fast in CI instead of hanging on the default pg / vitest timeouts. */
const PG_CONNECT_TIMEOUT_MS = 3_000;

async function connectAndQuery(connectionString: string): Promise<void> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: PG_CONNECT_TIMEOUT_MS,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function waitForDatabaseReady(connectionString: string, label: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await connectAndQuery(connectionString);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(
    `Postgres not ready for ${label} after 30s: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

const describeInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;

describeInfra('database isolation', () => {
  beforeAll(async () => {
    await waitForDatabaseReady(identityDatabaseUrl, 'identity');
  }, 35_000);

  it('allows the identity user to connect to the identity database', async () => {
    await expect(connectAndQuery(identityDatabaseUrl)).resolves.toBeUndefined();
  });

  it('allows the authorization user to connect to the authorization database', async () => {
    await expect(connectAndQuery(authorizationDatabaseUrl)).resolves.toBeUndefined();
  });

  it('allows the activity user to connect to the activity database', async () => {
    await expect(connectAndQuery(activityDatabaseUrl)).resolves.toBeUndefined();
  });

  it('allows the player_workspace user to connect to the player_workspace database', async () => {
    await expect(connectAndQuery(playerWorkspaceDatabaseUrl)).resolves.toBeUndefined();
  });

  it('denies the identity user access to the authorization database', async () => {
    await expect(connectAndQuery(identityOnAuthorizationDatabaseUrl)).rejects.toThrow();
  });

  it('denies the authorization user access to the identity database', async () => {
    await expect(connectAndQuery(authorizationOnIdentityDatabaseUrl)).rejects.toThrow();
  });

  it('denies the identity user access to the activity database', async () => {
    await expect(connectAndQuery(identityOnActivityDatabaseUrl)).rejects.toThrow();
  });

  it('denies the authorization user access to the activity database', async () => {
    await expect(connectAndQuery(authorizationOnActivityDatabaseUrl)).rejects.toThrow();
  });

  it('denies the activity user access to the identity database', async () => {
    await expect(connectAndQuery(activityOnIdentityDatabaseUrl)).rejects.toThrow();
  });

  it('denies the activity user access to the authorization database', async () => {
    await expect(connectAndQuery(activityOnAuthorizationDatabaseUrl)).rejects.toThrow();
  });

  it('denies the identity user access to the player_workspace database', async () => {
    await expect(connectAndQuery(identityOnPlayerWorkspaceDatabaseUrl)).rejects.toThrow();
  });

  it('denies the player_workspace user access to the identity database', async () => {
    await expect(connectAndQuery(playerWorkspaceOnIdentityDatabaseUrl)).rejects.toThrow();
  });

  it('denies the activity user access to the player_workspace database', async () => {
    await expect(connectAndQuery(activityOnPlayerWorkspaceDatabaseUrl)).rejects.toThrow();
  });

  it('denies the player_workspace user access to the activity database', async () => {
    await expect(connectAndQuery(playerWorkspaceOnActivityDatabaseUrl)).rejects.toThrow();
  });
});
