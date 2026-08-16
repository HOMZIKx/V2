import { Client } from 'pg';
import { describe, expect, it } from 'vitest';

const identityDatabaseUrl =
  process.env.IDENTITY_DATABASE_URL ??
  'postgresql://identity:identity_dev_password@127.0.0.1:5432/identity';
const authorizationDatabaseUrl =
  process.env.AUTHORIZATION_DATABASE_URL ??
  'postgresql://authorization:authorization_dev_password@127.0.0.1:5432/authorization';
const activityDatabaseUrl =
  process.env.ACTIVITY_DATABASE_URL ??
  'postgresql://activity:activity_dev_password@127.0.0.1:5432/activity';
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

async function connectAndQuery(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => undefined);
  }
}

const describeInfra = process.env.RUN_INFRA_TESTS === 'true' ? describe : describe.skip;

describeInfra('database isolation', () => {
  it('allows the identity user to connect to the identity database', async () => {
    await expect(connectAndQuery(identityDatabaseUrl)).resolves.toBeUndefined();
  });

  it('allows the authorization user to connect to the authorization database', async () => {
    await expect(connectAndQuery(authorizationDatabaseUrl)).resolves.toBeUndefined();
  });

  it('allows the activity user to connect to the activity database', async () => {
    await expect(connectAndQuery(activityDatabaseUrl)).resolves.toBeUndefined();
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
});
