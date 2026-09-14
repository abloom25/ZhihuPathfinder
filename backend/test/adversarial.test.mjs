import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp, mapItems} from '../server.mjs';

const token='a'.repeat(64);
const sample=()=>({id:randomUUID(),situation:'测试',text:'仅用于自动测试',demo:true,consent:true,sourceUrl:null,sourceExcerpt:null});
async function fixture(work, options={}) {
 const dir=mkdtempSync(join(tmpdir(),'later-adversarial-')), file=join(dir,'shares.json');
 const app=createApp({shareFile:file,minIntervalMs:0,...options});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.address().port;
 const request=(path,body,method='POST',headers={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});
 try {await work({file,base,request});} finally {app.closeAllConnections();await new Promise(r=>app.close(r));rmSync(dir,{recursive:true,force:true});}
}
// Deterministic bounded recursive generator; every seed can be replayed.
function generator(seed) {
 let x=seed>>>0;
 const next=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x};
 function value(depth=0) {
  const k=(next()>>>16)%(depth>=6?5:8);
  return k===0?null:k===1?false:k===2?next():k===3?'😀'.repeat(next()%4):k===4?'':k===5?[value(depth+1),value(depth+1)]:k===6?{query:value(depth+1)}:{nested:value(depth+1)};
 }
 return value;
}
test('seeded recursive search inputs distinguish valid controls from invalid structures (256 cases)',async()=>{
 let calls=0;const gen=generator(Number(process.env.FUZZ_SEED||20260914));
 await fixture(async({request})=>{
  for(let i=0;i<256;i++) {
   const query=i%16===0?"有效对照":gen();const body=i%2?{query,extra:gen()}:{query};
   const valid=i%2===0 && typeof query==='string' && query.trim().length>0;
   assert.equal((await request('/api/v1/search',body)).status,valid?200:400,`seed=${process.env.FUZZ_SEED||20260914} case=${i}`);
  }
  assert.ok(calls>0,'valid controls must reach upstream');
 },{secret:'test-only',fetchImpl:async()=>{calls++;return Response.json({Code:0,Data:{Items:[]}})}});
});
test('recursive share fields and Unicode boundaries preserve existing bytes',async()=>{
 await fixture(async({file,request})=>{
  const p=sample();assert.equal((await request('/api/v1/shares',p)).status,201);
  const before=readFileSync(file,'utf8');const gen=generator(71);
  for(let i=0;i<128;i++) {
   const v=gen();const invalid=typeof v==='string'?{nested:v}:v;
   assert.equal((await request('/api/v1/shares',{...sample(),text:invalid})).status,400,`case=${i}`);
   assert.equal(readFileSync(file,'utf8'),before);
  }
  for(const [field,n] of [['situation',80],['text',2000]]) {
   assert.equal((await request('/api/v1/shares',{...sample(),[field]:'😀'.repeat(n)})).status,201);
   const old=readFileSync(file,'utf8');
   assert.equal((await request('/api/v1/shares',{...sample(),[field]:'😀'.repeat(n+1)})).status,400);
   assert.equal(readFileSync(file,'utf8'),old);
  }
 });
});
test('share hostile URLs, missing consent, foreign origin, wrong token and retry identity',async()=>{
 await fixture(async({file,request,base})=>{
  const p=sample();
  for(const url of ['javascript:alert(1)','http://zhihu.com/','https://zhihu.com.evil.test/','https://evil.test@zhihu.com/','https://zhihu.com@evil.test/']) {
   assert.equal((await request('/api/v1/shares',{...p,sourceUrl:url})).status,400);
  }
  assert.equal((await request('/api/v1/shares',{...p,consent:false})).status,400);
  assert.equal((await request('/api/v1/shares',p,'POST',{Origin:'https://evil.test'})).status,403);
  assert.equal((await request('/api/v1/shares',p,'POST',{Authorization:'Bearer bad'})).status,403);
  assert.equal(existsSync(file),false);
  assert.equal((await request('/api/v1/shares',p,'POST',{Origin:base})).status,201);
  const before=readFileSync(file,'utf8');
  assert.equal((await request('/api/v1/shares',p,'POST',{Authorization:'Bearer '+'b'.repeat(64)})).status,403);
  assert.equal((await request('/api/v1/shares',{...p,text:'覆盖'})).status,409);
  assert.equal(readFileSync(file,'utf8'),before);
  assert.equal((await request('/api/v1/shares/'+p.id,{},'DELETE')).status,200);
  assert.equal((await request('/api/v1/shares',p)).status,409);
  assert.equal((await request('/api/v1/shares/missing',{},'DELETE')).status,404);
  assert.equal((await request('/api/v1/shares',{},'PUT')).status,405);
 });
});
test('share UUID must not accept arrays or all-hyphen identifiers',async()=>{
 await fixture(async({request})=>{
  for(const id of ['-'.repeat(36),[randomUUID()]]) assert.equal((await request('/api/v1/shares',{...sample(),id})).status,400);
 });
});
test('deep JSON, oversized request, malformed JSON, and corrupt store degrade without erasure',async()=>{
 await fixture(async({file,request,base})=>{
  let deep=null;for(let i=0;i<64;i++)deep={x:deep};
  assert.equal((await request('/api/v1/search',{query:deep})).status,400);
  assert.equal((await request('/api/v1/search',{query:'x'.repeat(9000)})).status,400);
  assert.equal((await request('/api/v1/shares',{...sample(),text:'x'.repeat(17000)})).status,413);
  for(const path of ['/api/v1/search','/api/v1/shares']) {
   assert.equal((await fetch(base+path,{method:'POST',body:'{',headers:{'Content-Type':'application/json'}})).status,400);
   assert.equal((await fetch(base+path,{method:'POST',body:'{}'})).status,400);
  }
  for(const corrupt of ['{','{}']) {
   writeFileSync(file,corrupt);
   assert.equal((await request('/api/v1/shares',undefined,'GET')).status,503);
   assert.equal((await request('/api/v1/shares',sample())).status,503);
   assert.equal(readFileSync(file,'utf8'),corrupt);
  }
  assert.equal((await fetch(base+'/healthz')).status,200);
  assert.equal((await fetch(base+'/not-found')).status,404);
 });
});
test('mapping preserves evidence and unreviewed status; rejects hostile URLs and types',()=>{
 const item={Title:'title',AuthorName:'',ContentText:'结果未知。',Url:'https://www.zhihu.com/question/1',EditTime:'not-number'};
 for(const Url of ['bad','http://zhihu.com','https://zhihu.com.evil.test','https://u:p@zhihu.com']) assert.throws(()=>mapItems([{...item,Url}],'now'));
 for(const change of [{ContentText:''},{ContentText:{}},{AuthorName:null},{Title:2},{Url:[]}]) assert.throws(()=>mapItems([{...item,...change}],'now'));
 const rows=mapItems(Array.from({length:15},(_,i)=>({...item,Url:item.Url+'/'+i})),'now');
 assert.equal(rows.length,10);
 for(const r of rows){assert.equal(r.reviewStatus,'unreviewed');assert.equal(r.source.rawText,item.ContentText);assert.equal(r.source.apiEditTime,null);assert.equal(r.possibleMultipleEvents,false)}
});
test('bounded cache eviction and oversized upstream body',async()=>{
 let calls=0;
 await fixture(async({request})=>{
  for(const query of ['a','b','a']) assert.equal((await request('/api/v1/search',{query})).status,200);
  assert.equal(calls,3);
 },{secret:'test-only',maxCacheEntries:1,fetchImpl:async()=>{calls++;return Response.json({Code:0,Data:{Items:[]}})}});
 await fixture(async({request})=>assert.equal((await request('/api/v1/search',{query:'a'})).status,502),{secret:'test-only',fetchImpl:async()=>new Response('x'.repeat(2*1024*1024+1))});
});
