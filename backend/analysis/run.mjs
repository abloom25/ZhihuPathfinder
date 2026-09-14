import {readFileSync,writeFileSync} from 'node:fs';
import{generate,hash,prompt}from './split.mjs';
const rows=JSON.parse(readFileSync(new URL('../test/fixtures/historical-40.json',import.meta.url)));
const cases=[['H01-01','development','multiple_supported'],['H02-05','development','multiple_supported'],['H02-10','development','not_personal'],['H03-02','development','no_second_found'],['H03-06','reserved','not_personal'],['H04-10','reserved','no_second_found']];
const protocol={frozenAt:new Date().toISOString(),promptHash:hash(prompt),implementationHash:hash(readFileSync(new URL('./split.mjs',import.meta.url))),cases,note:'Reserved cases do not participate in prompt adjustment. Historical materials previously visible; not a blinded study. No output-driven adjustment this run.'};
writeFileSync(new URL('./protocol.json',import.meta.url),JSON.stringify(protocol,null,2));
const results=[];
for(let i=0;i<cases.length;i+=2){
 const batch=await Promise.all(cases.slice(i,i+2).map(async([id,split,expected])=>{
  const item=rows.find(r=>r.id===id),start=Date.now();const result=await generate(item);
  const record={id,split,expected,elapsedMs:Date.now()-start,...result};
  console.log(JSON.stringify({id,state:result.state,assessment:result.proposal?.assessment,elapsedMs:record.elapsedMs,errors:result.check?.errors}));return record;
 }));results.push(...batch);
 writeFileSync(new URL('./results.json',import.meta.url),JSON.stringify(results,null,2));
}
