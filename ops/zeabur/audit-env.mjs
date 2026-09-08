import fs from 'node:fs';

const API='https://api.zeabur.com/graphql';
const token=process.env.ZEABUR_API_TOKEN||'';
const out=process.env.ZEABUR_OUTPUT_DIR||'ops/zeabur/out';
const projectId='6a720a3e472e2c91a9e660d5';
const environmentId='6a720a3e5f062718bc7b3421';
const expectedBranch='preview/destiled-web';
const managedBranch=new Set(['discord-gateway','activity-service','api-gateway','identity-service','authorization-service','webapp-dest','player-team-service']);
const runtimeExpected=new Set(['discord-gateway','activity-service','api-gateway','identity-service','authorization-service','webapp-dest','player-workspace-service','player-team-service']);
const intentionalLegacyBranch=new Map([['player-workspace-service','cursor/player-workspace-team-character-board-foundation']]);
const bools=new Set(['1','0','true','false','yes','no','on','off']);
fs.mkdirSync(out,{recursive:true});

function finish(payload,code=0){
  fs.writeFileSync(`${out}/result.json`,JSON.stringify(payload,null,2));
  const s=payload.summary||{};
  fs.writeFileSync(`${out}/summary.md`,`# Zeabur production env audit\n\nServices: **${s.services??0}**  \nCritical: **${s.critical??0}**  \nWarnings: **${s.warning??0}**  \nInfo: **${s.info??0}**\n`);
  process.exit(code);
}
function sensitive(k){return /SECRET|PASSWORD|TOKEN|PRIVATE_KEY|API_KEY|DATABASE_URL|REDIS_URL|CONNECTION_STRING|CLIENTS_JSON|CLIENTS_B64|KEYRING_JSON|COOKIE/i.test(k)}
function safe(k,v){
  if(sensitive(k)) return undefined;
  if(!/(?:_URL|_ORIGIN|_ORIGINS|_BASE_URL|_ISSUER|_AUD|_HOST|_PORT|_ENABLED|NODE_ENV|ALLOW_PRODUCTION_CONNECTIONS|_HEADER)$/i.test(k)) return undefined;
  try{const u=new URL(v);if(u.username||u.password){u.username='[REDACTED]';u.password='[REDACTED]'}return u.toString()}catch{return v}
}
async function gql(q,variables){
  const r=await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:q,variables})});
  const b=await r.json();
  if(!r.ok||b.errors?.length) finish({ok:false,error:'Zeabur GraphQL audit query failed',details:b.errors?.map(e=>e.message)??[r.status]},1);
  return b.data;
}
function mapVars(vars){const m=new Map();for(const v of vars||[]){if(!m.has(v.key))m.set(v.key,[]);m.get(v.key).push(String(v.value??''))}return m}
const val=(m,k)=>String((m.get(k)||[]).at(-1)??'').trim();
const has=(m,k)=>(m.get(k)||[]).some(v=>v.trim()!=='');
const on=(m,k,d=false)=>{const v=val(m,k).toLowerCase();return v?['1','true','yes','on'].includes(v):d};
function need(findings,service,m,keys,why){for(const key of keys)if(!has(m,key))findings.push({severity:'critical',service,key,issue:`missing ${why}`})}
function validateOriginList(findings,service,key,value){
  if(!value.trim())return;
  for(const raw of value.split(',').map(v=>v.trim()).filter(Boolean)){
    try{
      const u=new URL(raw);
      if(!['http:','https:'].includes(u.protocol)||!u.hostname)throw new Error('invalid origin');
    }catch{
      findings.push({severity:'critical',service,key,issue:`malformed origin: ${raw}`});
    }
  }
}
if(!token)finish({ok:false,error:"GitHub secret 'zebur' is missing"},1);

const query=`query Audit($projectID:ObjectID!,$environmentID:ObjectID!){services(projectID:$projectID){edges{node{_id name status gitTrigger(environmentID:$environmentID){branchName repoURL} variables(environmentID:$environmentID){key value exposed readonly} domains(environmentID:$environmentID){domain status} ports(environmentID:$environmentID){id port type forwardedPort} healthCheckV2{type port} resourceLimit{cpu memory} autoRestart(environmentID:$environmentID){enabled restartHour}}}}}`;
const data=await gql(query,{projectID:projectId,environmentID:environmentId});
const services=data.services.edges.map(e=>e.node),findings=[],report=[];

for(const s of services){
  const m=mapVars(s.variables),names=[...m.keys()].sort(),safeConfig={};
  for(const k of names){
    const x=safe(k,val(m,k)); if(x!==undefined)safeConfig[k]=x;
    const arr=m.get(k)||[];
    if(arr.length>1){
      const unique=[...new Set(arr.map(v=>v.trim()))];
      if(unique.length>1)findings.push({severity:'warning',service:s.name,key:k,issue:`conflicting duplicate key (${arr.length} entries, ${unique.length} values)`});
      else if(!/_HOST$/i.test(k))findings.push({severity:'info',service:s.name,key:k,issue:`duplicate key with identical value (${arr.length})`});
    }
    if((/_ENABLED$/.test(k)||k==='ALLOW_PRODUCTION_CONNECTIONS')&&val(m,k)&&!bools.has(val(m,k).toLowerCase()))findings.push({severity:'critical',service:s.name,key:k,issue:'invalid boolean spelling'});
    if(/(?:_ORIGIN|_ORIGINS|TRUSTED_ORIGINS)$/i.test(k))validateOriginList(findings,s.name,k,val(m,k));
  }
  if(runtimeExpected.has(s.name)&&s.status!=='RUNNING')findings.push({severity:'critical',service:s.name,key:'service.status',issue:`expected RUNNING, got ${s.status||'(unknown)'}`});
  if(managedBranch.has(s.name)&&s.gitTrigger?.branchName!==expectedBranch)findings.push({severity:'critical',service:s.name,key:'git.branch',issue:`drift: ${s.gitTrigger?.branchName||'(none)'} != ${expectedBranch}`});
  const legacy=intentionalLegacyBranch.get(s.name);
  if(legacy){
    if(s.gitTrigger?.branchName===legacy)findings.push({severity:'info',service:s.name,key:'git.branch',issue:`intentional legacy branch retained because service source is absent on ${expectedBranch}`});
    else findings.push({severity:'warning',service:s.name,key:'git.branch',issue:`unexpected legacy-service branch: ${s.gitTrigger?.branchName||'(none)'}`});
  }
  for(const [k,x] of Object.entries(safeConfig))if(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(x)&&/(?:_URL|_ORIGIN|_ORIGINS|_BASE_URL|_ISSUER|_AUD)$/i.test(k))findings.push({severity:'critical',service:s.name,key:k,issue:'loopback/local URL in production'});
  if(names.includes('UTHORIZATION_ASSERTION_AUD'))findings.push({severity:'warning',service:s.name,key:'UTHORIZATION_ASSERTION_AUD',issue:'stale typo; correct key is AUTHORIZATION_ASSERTION_AUD'});
  if(names.includes('V2_OVE_HOST'))findings.push({severity:'info',service:s.name,key:'V2_OVE_HOST',issue:'stale/generated host key; unused by current config'});

  if(s.name==='identity-service'){
    need(findings,s.name,m,['NODE_ENV','IDENTITY_DATABASE_URL','IDENTITY_AUTH_BASE_URL','IDENTITY_BETTER_AUTH_SECRET','IDENTITY_DISCORD_CLIENT_ID','IDENTITY_DISCORD_CLIENT_SECRET','IDENTITY_TRUSTED_ORIGINS'],'for Discord auth');
    if(!on(m,'IDENTITY_AUTH_ENABLED'))findings.push({severity:'critical',service:s.name,key:'IDENTITY_AUTH_ENABLED',issue:'Discord OAuth disabled'});
    if(on(m,'IDENTITY_INTERNAL_JWT_ENABLED'))need(findings,s.name,m,['IDENTITY_INTERNAL_JWT_ISSUER','IDENTITY_INTERNAL_JWT_KEYRING_JSON','IDENTITY_INTERNAL_JWT_ACTIVE_KID','IDENTITY_INTERNAL_JWT_ISSUE_URL','IDENTITY_SERVICE_CLIENTS_JSON'],'for internal JWT');else findings.push({severity:'critical',service:s.name,key:'IDENTITY_INTERNAL_JWT_ENABLED',issue:'internal JWT issuance disabled'});
  }
  if(s.name==='webapp-dest'){
    need(findings,s.name,m,['IDENTITY_PROXY_TARGET','PLAYER_TEAM_PROXY_TARGET'],'for server proxies');
    if(!on(m,'INTERNAL_JWT_CLIENT_ENABLED'))findings.push({severity:'critical',service:s.name,key:'INTERNAL_JWT_CLIENT_ENABLED',issue:'web internal JWT client disabled'});else need(findings,s.name,m,['INTERNAL_JWT_CLIENT_ID','INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM','INTERNAL_JWT_CLIENT_ACTIVE_KID','INTERNAL_JWT_ASSERTION_AUD','INTERNAL_JWT_IDENTITY_BASE_URL','INTERNAL_JWT_JWKS_URL','INTERNAL_JWT_ISSUER','INTERNAL_JWT_DEFAULT_AUDIENCE'],'for web internal JWT client');
  }
  if(s.name==='player-team-service'){
    need(findings,s.name,m,['PLAYER_TEAM_DATABASE_URL'],'for persistence');
    if(!on(m,'PLAYER_TEAM_INTERNAL_JWT_ENABLED'))findings.push({severity:'critical',service:s.name,key:'PLAYER_TEAM_INTERNAL_JWT_ENABLED',issue:'verified internal JWT auth disabled'});else need(findings,s.name,m,['PLAYER_TEAM_INTERNAL_JWT_ISSUER','PLAYER_TEAM_INTERNAL_JWT_JWKS_URL'],'for Player Team internal JWT');
    if(on(m,'PLAYER_TEAM_ALLOW_DEMO_WRITE',true))findings.push({severity:'critical',service:s.name,key:'PLAYER_TEAM_ALLOW_DEMO_WRITE',issue:'legacy demo write enabled'});
  }
  if(s.name==='activity-service'){
    need(findings,s.name,m,['ACTIVITY_DATABASE_URL'],'for Activity persistence');
    if(on(m,'ACTIVITY_ENABLED'))need(findings,s.name,m,['ACTIVITY_AUTHORIZATION_BASE_URL','ACTIVITY_AUTHORIZATION_ASSERTION_AUD','ACTIVITY_TO_AUTHZ_PRIVATE_KEY_PEM','ACTIVITY_TO_AUTHZ_ACTIVE_KID','ACTIVITY_IDENTITY_BASE_URL','ACTIVITY_IDENTITY_CHARACTER_ASSERTION_AUD','ACTIVITY_TO_IDENTITY_PRIVATE_KEY_PEM','ACTIVITY_TO_IDENTITY_ACTIVE_KID','ACTIVITY_REDIS_URL'],'when Activity enabled');
    if(val(m,'NODE_ENV')==='production'&&on(m,'ACTIVITY_TRUST_ACTOR_HEADERS'))findings.push({severity:'critical',service:s.name,key:'ACTIVITY_TRUST_ACTOR_HEADERS',issue:'must be false in production'});
  }
  if(s.name==='authorization-service'){
    need(findings,s.name,m,['AUTHORIZATION_DATABASE_URL'],'for Authorization persistence');
    if(on(m,'AUTHORIZATION_ENABLED'))need(findings,s.name,m,['AUTHORIZATION_BOOTSTRAP_DISCORD_USER_ID','AUTHORIZATION_INBOUND_CLIENTS_JSON','AUTHORIZATION_SYSTEM_ACTIVE_KID','AUTHORIZATION_SYSTEM_PRIVATE_KEY_PEM','AUTHORIZATION_IDENTITY_BASE_URL','AUTHORIZATION_IDENTITY_REVOKE_URL'],'when Authorization enabled');
  }
  report.push({id:s._id,name:s.name,status:s.status,branch:s.gitTrigger?.branchName??null,variableCount:s.variables?.length??0,variableNames:names,safeConfig,domains:s.domains||[],ports:s.ports||[],healthCheck:s.healthCheckV2||null,resourceLimit:s.resourceLimit||null,autoRestart:s.autoRestart||null});
}
const summary={services:services.length,critical:findings.filter(f=>f.severity==='critical').length,warning:findings.filter(f=>f.severity==='warning').length,info:findings.filter(f=>f.severity==='info').length};
finish({ok:true,at:new Date().toISOString(),projectId,environmentId,summary,findings,services:report});
