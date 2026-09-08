import fs from 'node:fs';

const API='https://api.zeabur.com/graphql';
const token=process.env.ZEABUR_API_TOKEN||'';
const out=process.env.ZEABUR_OUTPUT_DIR||'ops/zeabur/out';
const commandPath=process.env.ZEABUR_COMMAND_PATH||'ops/zeabur/command.json';
const environmentID='6a720a3e5f062718bc7b3421';
const targets=[
  {serviceID:'6a8211c9bdeaa87e2c52df34',service:'api-gateway',key:'API_GATEWAY_CORS_ORIGINS',value:'https://desapp.zeabur.app,https://v2-web.zeabur.app,https://v2222.zeabur.app,https://v2-admin.zeabur.app'},
  {serviceID:'6a8211cfbdeaa87e2c52df39',service:'identity-service',key:'IDENTITY_TRUSTED_ORIGINS',value:'https://desapp.zeabur.app,https://v2-web.zeabur.app,https://v2-admin.zeabur.app,https://v2-api.zeabur.app,https://v2222.zeabur.app'},
];
fs.mkdirSync(out,{recursive:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function finish(payload,code=0){fs.writeFileSync(`${out}/result.json`,JSON.stringify(payload,null,2));fs.writeFileSync(`${out}/summary.md`,`# Persistent origin repair\n\n${payload.ok?'✅':'❌'} ${payload.message||''}\n`);process.exit(code)}
if(!token)finish({ok:false,message:'missing Zeabur token'},1);
const command=JSON.parse(fs.readFileSync(commandPath,'utf8'));
if(command.confirm!=='ZEABUR_WRITE_APPROVED')finish({ok:false,message:'missing write approval'},1);
async function gql(query,variables={}){const r=await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables})});const b=await r.json();if(!r.ok||b.errors?.length)throw new Error((b.errors||[]).map(e=>e.message).join('; ')||`HTTP ${r.status}`);return b.data}
async function readService(t){return (await gql(`query Read($serviceID:ObjectID!,$environmentID:ObjectID!){service(_id:$serviceID){name variables(environmentID:$environmentID){key value readonly exposed}}}`,{serviceID:t.serviceID,environmentID})).service}
function configuredMap(service){const map={};for(const v of service.variables||[]){if(v.readonly===false&&typeof v.key==='string')map[v.key]=String(v.value??'')}return map}
async function persist(t){const before=await readService(t);const data=configuredMap(before);const beforeKeys=Object.keys(data).sort();if(!Object.hasOwn(data,t.key))throw new Error(`${t.service}.${t.key} is not a configured service variable`);data[t.key]=t.value;const result=await gql(`mutation Persist($serviceID:ObjectID!,$environmentID:ObjectID!,$data:Map!){updateEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,data:$data)}`,{serviceID:t.serviceID,environmentID,data});if(result.updateEnvironmentVariable!==true)throw new Error(`${t.service}: persistent environment update returned false`);let after;for(let i=0;i<8;i++){await sleep(1000);after=await readService(t);const configured=configuredMap(after);if(configured[t.key]===t.value){const afterKeys=Object.keys(configured).sort();const missing=beforeKeys.filter(k=>!afterKeys.includes(k));if(missing.length)throw new Error(`${t.service}: configured variable set lost ${missing.length} keys`);return {service:t.service,key:t.key,configuredCount:afterKeys.length,verified:true}}}throw new Error(`${t.service}.${t.key} did not persist via updateEnvironmentVariable`)}
try{const actions=[];for(const t of targets)actions.push(await persist(t));finish({ok:true,message:'persistent origin maps updated and verified',actions})}catch(error){finish({ok:false,message:error?.message||String(error)},1)}
