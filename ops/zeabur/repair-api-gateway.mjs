import fs from 'node:fs';

const API='https://api.zeabur.com/graphql';
const token=process.env.ZEABUR_API_TOKEN||'';
const out=process.env.ZEABUR_OUTPUT_DIR||'ops/zeabur/out';
const environmentId='6a720a3e5f062718bc7b3421';
const serviceId='6a8211c9bdeaa87e2c52df34';
const repoId=1323125581;
const branch='preview/destiled-web';
const cors='https://desapp.zeabur.app,https://v2-web.zeabur.app,https://v2222.zeabur.app,https://v2-admin.zeabur.app';
fs.mkdirSync(out,{recursive:true});

function finish(payload,code=0){
  fs.writeFileSync(`${out}/result.json`,JSON.stringify(payload,null,2));
  fs.writeFileSync(`${out}/summary.md`,`# API Gateway repair\n\n${payload.ok?'✅':'❌'} ${payload.message||''}\n`);
  process.exit(code);
}
if(!token)finish({ok:false,message:'missing Zeabur token'},1);
const command=JSON.parse(fs.readFileSync(process.env.ZEABUR_COMMAND_PATH||'ops/zeabur/command.json','utf8'));
if(command.confirm!=='ZEABUR_WRITE_APPROVED')finish({ok:false,message:'missing write approval'},1);

async function gql(query,variables={}){
  const r=await fetch(API,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables})});
  const b=await r.json();
  if(!r.ok||b.errors?.length)throw new Error((b.errors||[]).map(e=>e.message).join('; ')||`HTTP ${r.status}`);
  return b.data;
}
const ids={serviceID:serviceId,environmentID:environmentId};
const readService=()=>gql(`query State($serviceID:ObjectID!,$environmentID:ObjectID!){service(_id:$serviceID){name status gitTrigger(environmentID:$environmentID){repoID branchName} variables(environmentID:$environmentID){key value readonly}}}`,ids);
const readCors=(state)=>String((state.service.variables||[]).filter(v=>v.key==='API_GATEWAY_CORS_ORIGINS').at(-1)?.value||'').trim();

try{
  const before=await readService();
  const vars=before.service.variables||[];
  const entry=vars.find(v=>v.key==='API_GATEWAY_CORS_ORIGINS');
  if(entry?.readonly)throw new Error('API_GATEWAY_CORS_ORIGINS is readonly');

  if(before.service.gitTrigger?.branchName!==branch){
    await gql(`mutation Git($serviceID:ObjectID!,$environmentID:ObjectID!,$trigger:TriggerInput!){updateGitTrigger(serviceID:$serviceID,environmentID:$environmentID,trigger:$trigger)}`,
      {...ids,trigger:{repoID:repoId,branchName:branch}});
  }

  if(entry){
    await gql(`mutation Env($serviceID:ObjectID!,$environmentID:ObjectID!,$value:String!){updateSingleEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,oldKey:"API_GATEWAY_CORS_ORIGINS",newKey:"API_GATEWAY_CORS_ORIGINS",value:$value){key}}`,{...ids,value:cors});
  } else {
    await gql(`mutation Env($serviceID:ObjectID!,$environmentID:ObjectID!,$key:String!,$value:String!){createEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,key:$key,value:$value){key}}`,{...ids,key:'API_GATEWAY_CORS_ORIGINS',value:cors});
  }

  let after=await readService();
  if(readCors(after)!==cors){
    if((after.service.variables||[]).some(v=>v.key==='API_GATEWAY_CORS_ORIGINS')){
      await gql(`mutation DeleteEnv($serviceID:ObjectID!,$environmentID:ObjectID!){deleteSingleEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,key:"API_GATEWAY_CORS_ORIGINS")}`,ids);
    }
    await gql(`mutation CreateEnv($serviceID:ObjectID!,$environmentID:ObjectID!,$value:String!){createEnvironmentVariable(serviceID:$serviceID,environmentID:$environmentID,key:"API_GATEWAY_CORS_ORIGINS",value:$value){key}}`,{...ids,value:cors});
    after=await readService();
  }

  if(after.service.gitTrigger?.branchName!==branch)throw new Error(`branch verification failed: ${after.service.gitTrigger?.branchName||'(none)'}`);
  if(readCors(after)!==cors)throw new Error(`CORS verification failed after write`);

  await gql(`mutation Restart($serviceID:ObjectID!,$environmentID:ObjectID!){restartService(serviceID:$serviceID,environmentID:$environmentID)}`,ids);
  finish({ok:true,message:'branch and CORS verified; restart/resume requested',service:'api-gateway',branch,cors,beforeStatus:before.service.status,verified:true});
}catch(error){finish({ok:false,message:error?.message||String(error)},1)}
