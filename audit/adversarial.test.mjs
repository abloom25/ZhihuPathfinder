import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../backend/server.mjs';
import {validDraft,freshDraft,buildInitialText,freezeChoice} from '../frontend/src/lib/flow.js';
import {validShare,createShare} from '../frontend/src/lib/shares.js';
import {searchCandidates} from '../frontend/src/lib/search.js';
import * as records from '../frontend/src/lib/records.js';
import {beforeEachReset,storageMock,locks,KEY} from '../frontend/test/helpers.js';

const seed=Number(process.env.FUZZ_SEED||20260914);
let state=seed>>>0;
const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state>>>8};
function recursive(depth=0){const k=next()%(depth>=8?5:8);return k===0?null:k===1?false:k===2?next():k===3?'😀'.repeat(next()%5):k===4?'':k===5?[recursive(depth+1),recursive(depth+1)]:k===6?{query:recursive(depth+1)}:{nested:recursive(depth+1)}}
async function app(work,opts={}){
 const dir=mkdtempSync(join(tmpdir(),'pathfinder-audit-')),file=join(dir,'shares.json');const server=createApp({shareFile:file,minIntervalMs:0,...opts});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body,token='a'.repeat(64))=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});
 try{await work({post,base,file})}finally{server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}
}
test(`recursive search / variable body shapes seed=${seed} 512 cases, invalid input never reaches upstream`,async()=>{
 let calls=0,expected=0;
 await app(async({post})=>{
  for(let i=0;i<512;i++){
   const query=i%32===0?'control-'+i:recursive();const body=i%3?{query}:{query,extra:recursive()};
   const valid=i%3!==0&&typeof query==='string'&&query.trim().length>0;
   const r=await post('/api/v1/search',body);assert.equal(r.status,valid?200:400,`seed=${seed} case=${i}`);if(valid)expected++;
  }
  assert.equal(calls,expected);
 },{secret:'synthetic',cacheTtlMs:0,fetchImpl:async()=>{calls++;return Response.json({Code:0,Data:{Items:[]}})}});
});
test('same-id parallel retries create exactly one snapshot; foreign token cannot replace it',async()=>{
 await app(async({post,file})=>{
  const p={id:randomUUID(),text:'test-only',situation:'audit',demo:true,consent:true,sourceUrl:null,sourceExcerpt:null};
  const replies=await Promise.all(Array.from({length:32},()=>post('/api/v1/shares',p)));
  assert.equal(replies.filter(r=>r.status===201).length,1);assert.equal(replies.filter(r=>r.status===200).length,31);
  const old=readFileSync(file,'utf8');assert.equal((await post('/api/v1/shares',{...p,text:'overwrite'},'b'.repeat(64))).status,403);assert.equal(readFileSync(file,'utf8'),old);
 });
});
test('corrupt store is preserved; service health survives; no false successful write',async()=>{
 await app(async({post,file,base})=>{
  for(const bytes of ['{','{}','[null]']){
   writeFileSync(file,bytes);assert.equal((await fetch(base+'/api/v1/shares')).status,503);
   assert.equal((await post('/api/v1/shares',{id:randomUUID(),text:'test',situation:'audit',demo:true,consent:true,sourceUrl:null,sourceExcerpt:null})).status,503);
   assert.equal(readFileSync(file,'utf8'),bytes);assert.equal((await fetch(base+'/healthz')).status,200);
  }
 });
});
test('recursive backups and burst writes retain existing records; invalid structures never partially import',async()=>{
 beforeEachReset();const created=await Promise.all(Array.from({length:32},(_,i)=>records.createRecord({initialText:'audit'+i,sourceUrl:null,sourceTitle:null})));
 assert.equal(records.loadRecords().records.length,32);const initial=records.exportRecordsJson();
 for(let i=0;i<128;i++){await assert.rejects(records.importRecordsJson(JSON.stringify({schemaVersion:1,records:[recursive()]})));assert.equal(records.exportRecordsJson(),initial)}
 for(const r of created){const updated=await records.appendEntry(r,'later');await assert.rejects(records.appendEntry(r,'stale'),records.StorageConflictError);assert.equal(updated.initialText,r.initialText)}
});
test('actual object-shaped flow API supports 8 action subsets x 3 post-reading modes',()=>{
 for(let mask=0;mask<8;mask++)for(const mode of ['keep','change','unsure']){
  const f=freezeChoice(['A','B','C'].filter((_,i)=>mask&(1<<i)),'原话');
  const out=buildInitialText({frozen:f,after:{mode,text:'自己的打算',reason:'仍未知'},context:'处境',disagreement:'异议'});
  assert.ok(out.includes('原话'));assert.ok(out.includes('仍未知'));assert.ok(out.includes('不代表这些求职事件已经发生在我身上'));
 }
});
test('malformed draft UUID should be rejected before later record-save failure',()=>{
 assert.equal(validDraft({...freshDraft(),creationId:'-'.repeat(36)}),false);
});
test('successful-but-invalid share response must not be accepted as completed publication',async()=>{
 beforeEachReset();const previous=globalThis.fetch;
 try{globalThis.fetch=async()=>Response.json({});await assert.rejects(createShare({content:{text:'test'}}));}
 finally{globalThis.fetch=previous}
});
test('repeated cancelled searches release external abort listeners',async()=>{
 const previous=globalThis.fetch;let active=0,max=0;
 const external={aborted:false,addEventListener(){active++;max=Math.max(max,active)},removeEventListener(){active--}};
 try{globalThis.fetch=async()=>{throw new DOMException('cancel','AbortError')};
  for(let i=0;i<256;i++)await assert.rejects(searchCandidates('test',external));
  assert.equal(active,0);assert.equal(max,1);
 }finally{globalThis.fetch=previous}
});
