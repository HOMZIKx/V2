import fs from 'node:fs';

const API = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const commandPath = process.env.ZEABUR_COMMAND_PATH || 'ops/zeabur/command.json';
const projectId = '6a720a3e472e2c91a9e660d5';
const environmentId = '6a720a3e5f062718bc7b3421';
const sourceServiceName = 'discord-gateway';
const targetServiceName = 'player-team-service';
const sourceKey = 'DISCORD_NOTIFY_SHARED_SECRET';
const targetKey = 'PLAYER_TEAM_DISCORD_GATEWAY_SHARED_SECRET';

fs.mkdirSync(outDir, { recursive: true });

function finish(result, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(result, null, 2));
  const lines = [
    '# Player Team ↔ Discord gateway secret bridge',
    '',
    `- Result: **${result.ok ? 'OK' : 'FAILED'}**`,
    `- Source secret present: **${String(result.sourceSecretPresent ?? false)}**`,
    `- Target configured: **${String(result.targetConfigured ?? false)}**`,
    `- Values match after write: **${String(result.valuesMatch ?? false)}**`,
    `- Player Team redeploy requested: **${String(result.playerTeamRedeployRequested ?? false)}**`,
    `- Discord gateway redeploy requested: **${String(result.discordGatewayRedeployRequested ?? false)}**`,
  ];
  if (result.error) lines.push('', `Error: ${result.error}`);
  fs.writeFileSync(`${outDir}/summary.md`, `${lines.join('\n')}\n`);
  process.exit(code);
}

async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors?.length) {
    throw new Error(
      body.errors?.map((entry) => entry.message).join('; ') || `Zeabur HTTP ${response.status}`,
    );
  }
  return body.data;
}

async function loadServices() {
  const data = await gql(
    `query PlayerTeamDiscordSecretBridge($projectID:ObjectID!,$environmentID:ObjectID!){services(projectID:$projectID){edges{node{_id name variables(environmentID:$environmentID){key value readonly exposed}}}}}`,
    { projectID: projectId, environmentID: environmentId },
  );
  return data.services.edges.map((entry) => entry.node);
}

function variableValue(service, key) {
  return String((service.variables || []).filter((entry) => entry.key === key).at(-1)?.value || '');
}

async function setEnv(service, key, value) {
  const entries = (service.variables || []).filter((entry) => entry.key === key);
  if (entries.some((entry) => entry.readonly)) throw new Error(`${key} is readonly`);
  if (entries.length === 0) {
    await gql(
      `mutation CreateEnv($serviceID:ObjectID!,$environmentID:ObjectID!,$key:String!,$value:String!){createEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,key:$key,value:$value){key}}`,
      { serviceID: service._id, environmentID: environmentId, key, value },
    );
    return;
  }
  await gql(
    `mutation UpdateEnv($serviceID:ObjectID!,$environmentID:ObjectID!,$oldKey:String!,$newKey:String!,$value:String!){updateSingleEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,oldKey:$oldKey,newKey:$newKey,value:$value){key}}`,
    {
      serviceID: service._id,
      environmentID: environmentId,
      oldKey: key,
      newKey: key,
      value,
    },
  );
}

async function redeploy(service) {
  await gql(
    `mutation Redeploy($serviceID:ObjectID!,$environmentID:ObjectID!){redeployService(serviceID:$serviceID,environmentID:$environmentID)}`,
    { serviceID: service._id, environmentID: environmentId },
  );
}

try {
  const command = JSON.parse(fs.readFileSync(commandPath, 'utf8'));
  if (command.confirm !== 'ZEABUR_WRITE_APPROVED') {
    finish({ ok: false, error: 'missing ZEABUR_WRITE_APPROVED confirmation' }, 1);
  }
  if (!token) finish({ ok: false, error: 'missing Zeabur API token' }, 1);

  let services = await loadServices();
  const gateway = services.find((service) => service.name === sourceServiceName);
  const playerTeam = services.find((service) => service.name === targetServiceName);
  if (!gateway) throw new Error(`${sourceServiceName} service not found`);
  if (!playerTeam) throw new Error(`${targetServiceName} service not found`);

  const sourceSecret = variableValue(gateway, sourceKey).trim();
  if (sourceSecret.length < 20) {
    finish({ ok: false, sourceSecretPresent: false, error: 'gateway source secret is missing or invalid' }, 1);
  }

  await setEnv(playerTeam, targetKey, sourceSecret);

  services = await loadServices();
  const gatewayAfter = services.find((service) => service.name === sourceServiceName);
  const playerTeamAfter = services.find((service) => service.name === targetServiceName);
  const valuesMatch =
    gatewayAfter !== undefined &&
    playerTeamAfter !== undefined &&
    variableValue(gatewayAfter, sourceKey) === variableValue(playerTeamAfter, targetKey) &&
    variableValue(playerTeamAfter, targetKey).length >= 20;
  if (!valuesMatch) throw new Error('secret bridge verification failed');

  await redeploy(playerTeamAfter);
  await redeploy(gatewayAfter);

  finish({
    ok: true,
    sourceSecretPresent: true,
    targetConfigured: true,
    valuesMatch: true,
    playerTeamRedeployRequested: true,
    discordGatewayRedeployRequested: true,
  });
} catch (error) {
  finish(
    {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    },
    1,
  );
}
