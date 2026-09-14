import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{analyze,hash}from'./pipeline.mjs';
const dir=new URL('./',import.meta.url),criteria=JSON.parse(readFileSync(new URL('criteria.json',dir))),rows=JSON.parse(readFileSync(new URL('../../test/fixtures/historical-40.json',dir)));
const run=new URL(`runs/${new Date().toISOString().replaceAll(':','-')}/`,dir);mkdirSync(run,{recursive:true});
const protocol={frozenAt:new Date().toISOString(),criteria,hashes:Object.fromEntries(['pipeline.mjs','rules.md','extract-a.txt','extract-b.txt','relations.txt','criteria.json','run.mjs'].map(f=>[f,hash(readFileSync(new URL(f,dir)))])),numberingDependencyHash:hash(readFileSync(new URL('../v2/pipeline.mjs',dir))),inputHash:hash(readFileSync(new URL('../../test/fixtures/historical-40.json',dir))),note:'No tuning after freeze; previous materials visible; one paired run per case; no retries.'};
writeFileSync(new URL('protocol.json',run),JSON.stringify(protocol,null,2));writeFileSync(new URL('latest-run.txt',dir),run.pathname);
const results=[];
for(let i=0;i<criteria.cases.length;i++){
 const c=criteria.cases[i];for(const variant of i%2?['b','a']:['a','b']){
  const start=Date.now(),r=await analyze(rows.find(x=>x.id===c.id),{variant});const entry={...c,...r,elapsedMs:Date.now()-start};results.push(entry);
  writeFileSync(new URL('results.json',run),JSON.stringify(results,null,2));
  console.log(JSON.stringify({id:c.id,variant,state:r.state,kept:r.claims.kept.length,pending:r.claims.pending.length,rejected:r.claims.rejected.length,relations:r.relations?.kept.length,ms:entry.elapsedMs,error:r.extraction.error}));
 }
}
console.log(run.pathname);
