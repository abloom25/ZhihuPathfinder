import{readFileSync,writeFileSync,mkdirSync}from 'node:fs';
import{analyze,hash}from './pipeline.mjs';
const dir=new URL('./',import.meta.url),criteria=JSON.parse(readFileSync(new URL('criteria.json',dir)));
const rows=JSON.parse(readFileSync(new URL('../../test/fixtures/historical-40.json',dir)));
const runDir=new URL(`runs/${new Date().toISOString().replaceAll(':','-')}/`,dir);mkdirSync(runDir,{recursive:true});
const frozen={frozenAt:new Date().toISOString(),criteria,thresholds:{unsafeAccepted:0,minUsefulPersonal:6,personalTotal:9,minUsefulValidationPersonal:3,validationPersonalTotal:5,nonPersonalCorrectRequired:3},hashes:Object.fromEntries(['pipeline.mjs','group-prompt.txt','outcome-prompt.txt','criteria.json','run.mjs'].map(f=>[f,hash(readFileSync(new URL(f,dir)))])),inputHash:hash(readFileSync(new URL('../../test/fixtures/historical-40.json',dir))),note:'No tuning after this freeze. Thresholds for advancing experiment, not proof of production safety.'};
writeFileSync(new URL('protocol.json',runDir),JSON.stringify(frozen,null,2));
writeFileSync(new URL('latest-run.txt',dir),runDir.pathname);
const results=[];
for(let i=0;i<criteria.criteria.length;i+=2){
 const batch=await Promise.all(criteria.criteria.slice(i,i+2).map(async c=>{
 const start=Date.now(),result=await analyze(rows.find(r=>r.id===c.id));const record={...c,...result,elapsedMs:Date.now()-start};
 console.log(JSON.stringify({id:c.id,set:c.set,state:result.state,assessment:result.grouping?.value?.assessment,episodes:result.grouping?.value?.episodes?.length,errors:result.groupCheck?.errors,outcomeErrors:result.outcomes?.flatMap(o=>o.check.errors),ms:record.elapsedMs}));return record;}));
 results.push(...batch);writeFileSync(new URL('results.json',runDir),JSON.stringify(results,null,2));
}
console.log('Results: '+runDir.pathname);
