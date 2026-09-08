import fs from 'node:fs';

const API_URL = 'https://api.zeabur.com/graphql';
const token = process.env.ZEABUR_API_TOKEN || '';
const outDir = process.env.ZEABUR_OUTPUT_DIR || 'ops/zeabur/out';
const projectId = '6a720a3e472e2c91a9e660d5';
const environmentId = '6a720a3e5f062718bc7b3421';

fs.mkdirSync(outDir, { recursive: true });

const activeCodeServices = new Set([
  'discord-gateway',
  'activity-service',
  'api-gateway',
  'identity-service',
  'authorization-service',
  'webapp-dest',
  'player-workspace-service',
  'player-team-service',
]);
const expectedBranch = 'preview/destiled-web';
const boolValues = new Set(['1','0','true','false','yes','no','on','off']);

function writeAndExit(payload, code = 0) {
  fs.writeFileSync(`${outDir}/result.json`, JSON.stringify(payload, null, 2));
  const counts = payload.summary || {};
  fs.writeFileSync(`${outDir}/summary.md`, `# Zeabur production env audit\n\nServices: **${counts.services ?? 0}**  \nCritical: **${counts.critical ?? 0}**  \nWarnings: **${counts.warning ?? 0}**  \nInfo: **${counts.info ?? 0}**\n`);
  process.exit(code);
}

function safeUrl(value) {
  try {
    const u = new URL(value);
    if (u.username || u.password) { u.username = '[REDACTED]'; u.password = '[REDACTED]'; }
    return u.toString();
  } catch { return value; }
}

function isSensitiveKey(key) {
  return /(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|API_KEY|DATABASE_URL|REDIS_URL|CONNECTION_STRING|CLIENTS_JSON|CLIENTS_B64|KEYRING_JSON|COOKIE)/i.test(key);
}

function safeDisplay(key, value) {
  if (isSensitiveKey(key)) return undefined;
  if (/(?:_URL|_ORIGIN|_ORIGINS|_BASE_URL|_ISSUER|_AUD|_HOST|_PORT|_ENABLED|NODE_ENV|ALLOW_PRODUCTION_CONNECTIONS|_HEADER)$/i.test(key)) return safeUrl(value);
  return undefined;
}

async function gql(query, variables = {}) {
  const response = await fetch(API_URL, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify({query,variables}) });
  const body = await response.json();
  if (!response.ok || body?.errors?.length) writeAndExit({ ok:false, error:'Zeabur GraphQL audit query failed', details:body?.errors?.map(e=>e.message) ?? [response.status] },1);
  return body.data;
}

function envMap(vars) { const map=new Map(); for(const v of vars){ if(!map.has(v.key)) map.set(v.key,[]); map.get(v.key).push(v.value ?? ''); } return map; }
function present(map,key){ return (map.get(key)||[]).some(v=>String(v).trim()!==''); }
function value(map,key){ return String((map.get(key)||[]).at(-1) ?? '').trim(); }
function enabled(map,key,defaultValue=false){ const v=value(map,key).toLowerCase(); if(!v) return defaultValue; return ['1','true','yes','on'].includes(v); }
function requireKeys(findings,service,map,keys,when){ for(const key of keys) if(!present(map,key)) findings.push({severity:'critical',service,key,issue:`missing ${when}`}); }

if (!token) writeAndExit({ok:false,error:"GitHub secret 'zebur' is missing"},1);

const query = `query Audit($projectID: ObjectID!, $environmentID: ObjectID!) {
  services(projectID: $projectID) {
    edges { node {
      _id name status
      gitTrigger(environmentID: $environmentID) { branchName repoURL }
      variables(environmentID: $environmentID) { key value exposed readonly }
      domains(environmentID: $environmentID) { domain status }
      ports(environmentID: $environmentID) { id port type forwardedPort }
      healthCheckV2 { type port }
      resourceLimit { cpu memory }
      autoRestart(environmentID: $environmentID) { enabled restartHour }
    } }
  }
}`;

const data = await gql(query,{projectID:projectId,environmentID});
const services=data.services.edges.map(e=>e.node);
const findings=[];
const reportServices=[];

for(const svc of services){
  const map=envMap(svc.variables||[]);
  const names=[...map.keys()].sort();
  const safeConfig={};
  for(const key of names){
    const shown=safeDisplay(key,value(map,key));
    if(shown!==undefined) safeConfig[key]=shown;
    const vals=map.get(key)||[];
    if(vals.length>1) findings.push({severity:'warning',service:svc.name,key,issue:`duplicate key (${vals.length} entries)`});
    if((/_ENABLED$/.test(key)||key==='ALLOW_PRODUCTION_CONNECTIONS')&&value(map,key)&&!boolValues.has(value(map,key).toLowerCase())) findings.push({severity:'critical',service:svc.name,key,issue:'invalid boolean spelling'});
  }

  if(activeCodeServices.has(svc.name)&&svc.gitTrigger?.branchName!==expectedBranch) findings.push({severity:'critical',service:svc.name,key:'git.branch',issue:`drift: ${svc.gitTrigger?.branchName||'(none)'} != ${expectedBranch}`});
  for(const [key,shown] of Object.entries(safeConfig)) if(typeof shown==='string'&&/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(shown)&&/(?:_URL|_ORIGIN|_ORIGINS|_BASE_URL|_ISSUER|_AUD)$/i.test(key)) findings.push({severity:'critical',service:svc.name,key,issue:'loopback/local URL configured in production'});
  if(names.includes('UTHORIZATION_ASSERTION_AUD')) findings.push({severity:'warning',service:svc.name,key:'UTHORIZATION_ASSERTION_AUD',issue:'probable stale typo; correct key is AUTHORIZATION_ASSERTION_AUD'});
  if(names.includes('V2_OVE_HOST')) findings.push({severity:'info',service:svc.name,key:'V2_OVE_HOST',issue:'stale/generated host key; not referenced by current app config'});

  if(svc.name==='identity-service'){
    requireKeys(findings,svc.name,map,['NODE_ENV','IDENTITY_DATABASE_URL','IDENTITY_AUTH_BASE_URL','IDENTITY_BETTER_AUTH_SECRET','IDENTITY_DISCORD_CLIENT_ID','IDENTITY_DISCORD_CLIENT_SECRET','IDENTITY_TRUSTED_ORIGINS'],'for production Discord auth');
    if(!enabled(map,'IDENTITY_AUTH_ENABLED')) findings.push({severity:'critical',service:svc.name,key:'IDENTITY_AUTH_ENABLED',issue:'Discord OAuth auth is disabled'});
    if(enabled(map,'IDENTITY_INTERNAL_JWT_ENABLED')) requireKeys(findings,svc.name,map,['IDENTITY_INTERNAL_JWT_ISSUER','IDENTITY_INTERNAL_JWT_KEYRING_JSON','IDENTITY_INTERNAL_JWT_ACTIVE_KID','IDENTITY_INTERNAL_JWT_ISSUE_URL','IDENTITY_SERVICE_CLIENTS_JSON'],'when internal JWT is enabled'); else findings.push({severity:'critical',service:svc.name,key:'IDENTITY_INTERNAL_JWT_ENABLED',issue:'internal JWT issuance is disabled'});
  }
  if(svc.name==='player-team-service'){
    requireKeys(findings,svc.name,map,['PLAYER_TEAM_DATABASE_URL'],'for persistence');
    if(!enabled(map,'PLAYER_TEAM_INTERNAL_JWT_ENABLED')) findings.push({severity:'critical',service:svc.name,key:'PLAYER_TEAM_INTERNAL_JWT_ENABLED',issue:'verified internal JWT auth is disabled/missing'}); else requireKeys(findings,svc.name,map,['PLAYER_TEAM_INTERNAL_JWT_ISSUER','PLAYER_TEAM_INTERNAL_JWT_JWKS_URL'],'when Player Team internal JWT is enabled');
    if(enabled(map,'PLAYER_TEAM_ALLOW_DEMO_WRITE',true)) findings.push({severity:'critical',service:svc.name,key:'PLAYER_TEAM_ALLOW_DEMO_WRITE',issue:'legacy demo write remains enabled'});
  }
  if(svc.name==='webapp-dest'){
    requireKeys(findings,svc.name,map,['IDENTITY_PROXY_TARGET','PLAYER_TEAM_PROXY_TARGET'],'for server-side proxies');
    if(!enabled(map,'INTERNAL_JWT_CLIENT_ENABLED')) findings.push({severity:'critical',service:svc.name,key:'INTERNAL_JWT_CLIENT_ENABLED',issue:'web cannot mint Identity internal tokens'}); else requireKeys(findings,svc.name,map,['INTERNAL_JWT_CLIENT_ID','INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM','INTERNAL_JWT_CLIENT_ACTIVE_KID','INTERNAL_JWT_ASSERTION_AUD','INTERNAL_JWT_IDENTITY_BASE_URL','INTERNAL_JWT_JWKS_URL','INTERNAL_JWT_ISSUER','INTERNAL_JWT_DEFAULT_AUDIENCE'],'when web internal JWT client is enabled');
  }
  if(svc.name==='activity-service'){
    requireKeys(findings,svc.name,map,['ACTIVITY_DATABASE_URL'],'for Activity persistence');
    if(enabled(map,'ACTIVITY_ENABLED')) requireKeys(findings,svc.name,map,['ACTIVITY_AUTHORIZATION_BASE_URL','ACTIVITY_AUTHORIZATION_ASSERTION_AUD','ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM','ACTIVITY_TO_AUTHZ_ACTIVE_KID','ACTIVITY_IDENTITY_BASE_URL','ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD','ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM','ACTIVITY_TO_IDENTITY_ACTIVE_KID','ACTIVITY_REDIS_URL'],'when ACTIVITY_ENABLED=true');
    if(value(map,'NODE_ENV')==='production'&&enabled(map,'ACTIVITY_TRUST_ACTOR_HEADERS')) findings.push({severity:'critical',service:svc.name,key:'ACTIVITY_TRUST_ACTOR_HEADERS',issue:'must be false in production'});
  }
  if(svc.name==='authorization-service'){
    requireKeys(findings,svc.name,map,['AUTHORIZATION_DATABASE_URL'],'for Authorization persistence');
    if(enabled(map,'AUTHORIZATION_ENABLED')) requireKeys(findings,svc.name,map,['AUTHORIZATION_BOOTSTRAP_DISCORD_USER_ID','AUTHORIZATION_INBOUND_CLIENTS_JSON','AUTHORIZATION_SYSTEM_ACTIVE_KID','AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM','AUTHORIZATION_IDENTITY_BASE_URL','AUTHORIZATION_IDENTITY_REVOKE_URL'],'when AUTHORIZATION_ENABLED=true');
  }

  reportServices.push({id:svc._id,name:svc.name,status:svc.status,branch:svc.gitTrigger?.branchName??null,variableCount:svc.variables?.length??0,variableNames:names,safeConfig,domains:(svc.domains||[]).map(d=>({domain:d.domain,status:d.status})),ports:svc.ports||[],healthCheck:svc.healthCheckV2||null,resourceLimit:svc.resourceLimit||null,autoRestart:svc.autoRestart||null});
}

const summary={services:services.length,critical:findings.filter(f=>f.severity==='critical').length,warning:findings.filter(f=>f.severity==='warning').length,info:findings.filter(f=>f.severity==='info').length};
writeAndExit({ok:true,at:new Date().toISOString(),projectId,environmentId,summary,findings,services:reportServices});
