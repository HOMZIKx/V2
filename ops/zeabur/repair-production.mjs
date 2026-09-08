import fs from 'node:fs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const API='https://api.zeabur.com/graphql';
const token=process.env.ZEABUR_API_TOKEN||'';
const out=process.env.ZEABUR_OUTPUT_DIR||'ops/zeabur/out';
const commandPath=process.env.ZEABUR_COMMAND_PATH||'ops/zeabur/command.json';
const projectId='6a720a3e472e2c91a9e660d5';
const environmentId='6a720a3e5f062718bc7b3421';
fs.mkdirSync(out,{recursive:true});

function finish(payload,code=0){
  fs.writeFileSync(`${out}/result.json`,JSON.stringify(payload,null,2));
  const lines=['# Zeabur production repair','',payload.ok?'✅ Repair phase completed':'❌ Repair phase failed','',`Phase: \`${payload.phase||'unknown'}\``];
  if(payload.actions?.length){lines.push('','Actions:');for(const a of payload.actions)lines.push(`- ${a}`)}
  if(payload.error)lines.push('',`Error: ${payload.error}`);
  fs.writeFileSync(`${out}/summary.md`,lines.join('\n')+'\n');
  process.exit(code);
}
if(!token)finish({ok:false,error:'missing Zeabur token'},1);
const command=JSON.parse(fs.readFileSync(commandPath,'utf8'));
if(command.confirm!=='ZEABUR_WRITE_APPROVED')finish({ok:false,phase:command.phase,error:'missing write approval'},1);

async function gql(query,variables={}){
  const r=await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables})});
  const b=await r.json();
  if(!r.ok||b.errors?.length)throw new Error((b.errors||[]).map(e=>e.message).join('; ')||`HTTP ${r.status}`);
  return b.data;
}
const q=`query RepairInventory($projectID:ObjectID!,$environmentID:ObjectID!){services(projectID:$projectID){edges{node{_id name status gitTrigger(environmentID:$environmentID){branchName} variables(environmentID:$environmentID){key value readonly exposed}}}}}`;
const data=await gql(q,{projectID:projectId,environmentID:environmentId});
const services=new Map(data.services.edges.map(e=>[e.node.name,e.node]));
const actions=[];
function svc(name){const s=services.get(name);if(!s)throw new Error(`service ${name} not found`);return s}
function vars(name){const m=new Map();for(const v of svc(name).variables||[]){if(!m.has(v.key))m.set(v.key,[]);m.get(v.key).push(v)}return m}
function lastValue(name,key){const arr=vars(name).get(key)||[];return String(arr.at(-1)?.value??'')}

async function setEnv(name,key,value){
  const service=svc(name);const entries=vars(name).get(key)||[];
  if(entries.some(e=>e.readonly))throw new Error(`${name}.${key} is readonly`);
  if(entries.length===0){
    await gql(`mutation Set($serviceID:ObjectID!,$environmentID:ObjectID!,$key:String!,$value:String!){createEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,key:$key,value:$value){key}}`,{serviceID:service._id,environmentID:environmentId,key,value});
    service.variables.push({key,value,readonly:false,exposed:false});
    actions.push(`${name}: created ${key}`);
  }else{
    await gql(`mutation Set($serviceID:ObjectID!,$environmentID:ObjectID!,$oldKey:String!,$newKey:String!,$value:String!){updateSingleEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,oldKey:$oldKey,newKey:$newKey,value:$value){key}}`,{serviceID:service._id,environmentID:environmentId,oldKey:key,newKey:key,value});
    for(const e of entries)e.value=value;
    actions.push(`${name}: updated ${key}`);
  }
}
async function setBranch(name,branch){
  const service=svc(name);if(service.gitTrigger?.branchName===branch){actions.push(`${name}: branch already ${branch}`);return}
  await gql(`mutation Branch($serviceID:ObjectID!,$branch:String!){updateServiceBranch(serviceID:$serviceID,branch:$branch)}`,{serviceID:service._id,branch});
  actions.push(`${name}: branch -> ${branch}`);
}
async function redeploy(name){const service=svc(name);await gql(`mutation Redeploy($serviceID:ObjectID!,$environmentID:ObjectID!){redeployService(serviceID:$serviceID,environmentID:$environmentID)}`,{serviceID:service._id,environmentID:environmentId});actions.push(`${name}: redeploy requested`)}

async function identitySetup(){
  const identity='identity-service',web='webapp-dest';
  await setEnv(identity,'IDENTITY_TRUSTED_ORIGINS','https://desapp.zeabur.app,https://v2-web.zeabur.app,https://v2-admin.zeabur.app,https://v2-api.zeabur.app,https://v2222.zeabur.app');
  const rawClients=lastValue(identity,'IDENTITY_SERVICE_CLIENTS_JSON');
  if(!rawClients.trim())throw new Error('IDENTITY_SERVICE_CLIENTS_JSON is empty');
  let clients;try{clients=JSON.parse(rawClients)}catch{throw new Error('IDENTITY_SERVICE_CLIENTS_JSON is invalid JSON')}
  if(!Array.isArray(clients))throw new Error('IDENTITY_SERVICE_CLIENTS_JSON must be an array');

  const clientId='v2.webapp-dest';
  let client=clients.find(c=>c?.client_id===clientId);
  const existingPrivate=lastValue(web,'INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM').trim();
  const existingKid=lastValue(web,'INTERNAL_JWT_CLIENT_ACTIVE_KID').trim();
  let privatePem=existingPrivate,kid=existingKid;
  let registryChanged=false;
  const hasMatchingKey=client&&kid&&Array.isArray(client.keys)&&client.keys.some(k=>k?.kid===kid&&k?.status!=='retired');
  if(!privatePem||!kid||!hasMatchingKey){
    const pair=generateKeyPairSync('ed25519');
    privatePem=pair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
    const publicPem=pair.publicKey.export({type:'spki',format:'pem'}).toString();
    kid=`webapp-dest-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomBytes(4).toString('hex')}`;
    if(!client){client={client_id:clientId,allowed_audiences:['v2.api-gateway'],keys:[]};clients.push(client)}
    client.allowed_audiences=Array.from(new Set([...(Array.isArray(client.allowed_audiences)?client.allowed_audiences:[]),'v2.api-gateway']));
    if(!Array.isArray(client.keys))client.keys=[];
    client.keys.push({kid,status:'active',public_key_pem:publicPem});
    registryChanged=true;
  }
  if(registryChanged)await setEnv(identity,'IDENTITY_SERVICE_CLIENTS_JSON',JSON.stringify(clients));
  else actions.push('identity-service: existing web JWT client/key retained');

  const issueUrl=lastValue(identity,'IDENTITY_INTERNAL_JWT_ISSUE_URL').trim();
  const issuer=lastValue(identity,'IDENTITY_INTERNAL_JWT_ISSUER').trim();
  if(!issueUrl||!issuer)throw new Error('Identity internal JWT issuer/issue URL missing');
  const identityPrivate='http://service-6a8211cfbdeaa87e2c52df39:8080';
  await setEnv(web,'INTERNAL_JWT_CLIENT_ID',clientId);
  await setEnv(web,'INTERNAL_JWT_CLIENT_PRIVATE_KEY_PEM',privatePem);
  await setEnv(web,'INTERNAL_JWT_CLIENT_ACTIVE_KID',kid);
  await setEnv(web,'INTERNAL_JWT_ASSERTION_AUD',issueUrl);
  await setEnv(web,'INTERNAL_JWT_IDENTITY_BASE_URL',identityPrivate);
  await setEnv(web,'INTERNAL_JWT_JWKS_URL',`${identityPrivate}/identity/.well-known/jwks.json`);
  await setEnv(web,'INTERNAL_JWT_ISSUER',issuer);
  await setEnv(web,'INTERNAL_JWT_DEFAULT_AUDIENCE','v2.api-gateway');
  await setEnv(web,'INTERNAL_JWT_CLIENT_ENABLED','false');
  await setEnv(web,'PLAYER_TEAM_INTERNAL_JWT_ENABLED','false');
  await redeploy(identity);
}

async function coreBranches(){
  for(const name of ['activity-service','authorization-service','api-gateway'])await setBranch(name,'preview/destiled-web');
  for(const name of ['activity-service','authorization-service','api-gateway'])await redeploy(name);
  actions.push('player-workspace-service intentionally left on its current branch: source is absent from preview/destiled-web');
}

async function playerTeamSetup(){
  const pt='player-team-service';const web='webapp-dest';const identity='identity-service';
  await setBranch(pt,'preview/destiled-web');
  const issuer=lastValue(identity,'IDENTITY_INTERNAL_JWT_ISSUER').trim();if(!issuer)throw new Error('Identity issuer missing');
  const jwks='http://service-6a8211cfbdeaa87e2c52df39:8080/identity/.well-known/jwks.json';
  await setEnv(pt,'PLAYER_TEAM_INTERNAL_JWT_ENABLED','true');
  await setEnv(pt,'PLAYER_TEAM_INTERNAL_JWT_ISSUER',issuer);
  await setEnv(pt,'PLAYER_TEAM_INTERNAL_JWT_AUDIENCE','v2.api-gateway');
  await setEnv(pt,'PLAYER_TEAM_INTERNAL_JWT_JWKS_URL',jwks);
  await setEnv(pt,'PLAYER_TEAM_AUTHENTICATED_DISCORD_HEADER','x-authenticated-discord-id');
  await setEnv(pt,'PLAYER_TEAM_ALLOW_DEMO_WRITE','false');
  await setEnv(pt,'PLAYER_TEAM_CORS_ORIGINS','https://desapp.zeabur.app');
  await redeploy(pt);
  await setEnv(web,'PLAYER_TEAM_INTERNAL_JWT_ENABLED','true');
  await setEnv(web,'PLAYER_TEAM_INTERNAL_JWT_AUDIENCE','v2.api-gateway');
  await setEnv(web,'INTERNAL_JWT_CLIENT_ENABLED','true');
  await redeploy(web);
}

try{
  if(command.phase==='identity_jwt_setup')await identitySetup();
  else if(command.phase==='core_branches')await coreBranches();
  else if(command.phase==='player_team_jwt_cutover')await playerTeamSetup();
  else throw new Error(`unknown repair phase ${command.phase}`);
  finish({ok:true,phase:command.phase,actions});
}catch(error){finish({ok:false,phase:command.phase,actions,error:error?.message||String(error)},1)}
