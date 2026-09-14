import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{audit,composeLocal,hash}from'./audit.mjs';import{analyze}from'../v3/pipeline.mjs';
const dir=new URL('./',import.meta.url),cases=JSON.parse(readFileSync(new URL('cases.json',dir))),rows=JSON.parse(readFileSync(new URL('../../test/fixtures/historical-40.json',dir)));
const run=new URL(`runs/${new Date().toISOString().replaceAll(':','-')}/`,dir);mkdirSync(run,{recursive:true});
const files=['audit.mjs','prompt.txt','cases.json','run.mjs','../v3/pipeline.mjs','../v3/extract-b.txt','../v3/relations.txt'];
writeFileSync(new URL('protocol.json',run),JSON.stringify({frozenAt:new Date().toISOString(),cases,hashes:Object.fromEntries(files.map(f=>[f,hash(readFileSync(new URL(f,dir)))])),inputHash:hash(readFileSync(new URL('../../test/fixtures/historical-40.json',dir))),note:'The reviewer is a separate stateless call using the same model, not an independent judge or external truth source.'},null,2));writeFileSync(new URL('latest-run.txt',dir),run.pathname);
const paired=[];const order=[...cases.pairs].sort((a,b)=>hash(a.text).localeCompare(hash(b.text)));
for(let i=0;i<order.length;i+=2){const batch=await Promise.all(order.slice(i,i+2).map(async c=>{
 const r=await audit(rows.find(x=>x.id===c.sourceId),c);console.log(JSON.stringify({id:c.id,expected:c.expected,verdict:r.review.value?.verdict,action:r.decision.action,error:r.review.error}));return {...r,expected:c.expected,sourceId:c.sourceId};}));paired.push(...batch);writeFileSync(new URL('pairs.json',run),JSON.stringify(paired,null,2));}
const raw=[];
for(const id of cases.rawValidationIds){const item=rows.find(x=>x.id===id),extraction=await analyze(item,{variant:'b'});const candidates=[];
 for(const c of extraction.claims.kept)candidates.push({id:c.id,type:'claim',refs:c.refs,text:`将以下原文解释为作者本人的${c.kind==='occurred'?'已发生行动或状态':'意愿、条件或计划'}：${c.evidence.map(e=>e.text).join('')}`});
 const index=new Map(extraction.claims.kept.map(c=>[c.id,c]));
 for(const [i,r]of(extraction.relations?.kept||[]).entries())candidates.push({id:`r${i+1}`,type:'relation',refs:r.refs,text:`以下两条${r.relation==='same_event'?'属于同一次经历的连续进展':'属于不同的独立经历'}：一、${index.get(r.left).evidence.map(e=>e.text).join('')}；二、${index.get(r.right).evidence.map(e=>e.text).join('')}`});
 const audits=[];
 for(let i=0;i<candidates.length;i+=2)audits.push(...await Promise.all(candidates.slice(i,i+2).map(c=>audit(item,c))));
 raw.push({id,extraction,audits,workspace:composeLocal(item.ContentText,audits)});writeFileSync(new URL('raw.json',run),JSON.stringify(raw,null,2));console.log(JSON.stringify({raw:id,candidates:candidates.length,retained:audits.filter(a=>a.decision.action==='retain_for_experiment').length}));
}
console.log(run.pathname);
