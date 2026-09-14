import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import {createApp} from '../server.mjs';
const payload=()=>({id:randomUUID(),situation:'synthetic',text:'test only',demo:true,consent:true,sourceUrl:null,sourceExcerpt:null});
async function withApp(work,options={}) {
 const dir=mkdtempSync(join(tmpdir(),'pathfinder-chaos2-')),file=join(dir,'shares.json');
 const app=createApp({shareFile:file,minIntervalMs:0,...options});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.address().port;
 const request=(method,path,body)=>fetch(base+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+'a'.repeat(64)},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try {await work({file,base,request})} finally {app.closeAllConnections();await new Promise(r=>app.close(r));rmSync(dir,{recursive:true,force:true})}
}
test('corrupt-but-parseable store never leaks arbitrary fields, mutates bytes or reports success',async()=>{
 await withApp(async({file,request})=>{
  await request('POST','/api/v1/shares',payload());const valid=JSON.parse(readFileSync(file,'utf8'))[0];
  for(const rows of [[{}],[42],['bad'],[{...valid,internalSecret:'synthetic-never-public'}],[valid,valid],[{...valid,tokenHash:'bad'}]]){
   const raw=JSON.stringify(rows);writeFileSync(file,raw);
   for(const [method,path,body] of [['GET','/api/v1/shares'],['POST','/api/v1/shares',payload()],['DELETE','/api/v1/shares/'+valid.id,{}]]) {
    const res=await request(method,path,body);assert.equal(res.status,503,JSON.stringify(rows));
    assert.ok(!(await res.text()).includes('synthetic-never-public'));assert.equal(readFileSync(file,'utf8'),raw);
   }
  }
 });
});
test('128 distinct concurrent writes + revoke/retry races preserve all snapshots and never resurrect',async()=>{
 await withApp(async({file,request})=>{
  const inputs=Array.from({length:128},payload);
  const rs=await Promise.all(inputs.map(p=>request('POST','/api/v1/shares',p)));
  assert.ok(rs.every(r=>r.status===201));assert.equal(JSON.parse(readFileSync(file,'utf8')).length,128);
  const p=inputs[0];await Promise.all(Array.from({length:32},(_,i)=>i%2?request('POST','/api/v1/shares',p):request('DELETE','/api/v1/shares/'+p.id,{})));
  assert.equal((await request('GET','/api/v1/shares/'+p.id)).status,404);
  assert.equal((await request('POST','/api/v1/shares',p)).status,409);
  assert.equal(JSON.parse(readFileSync(file,'utf8')).length,128);
 });
});
test('temporary-file write failure leaves previous database unchanged and retry recovers after storage repair',async()=>{
 await withApp(async({file,request})=>{
  await request('POST','/api/v1/shares',payload());const raw=readFileSync(file,'utf8');mkdirSync(file+'.tmp');
  const p=payload();assert.equal((await request('POST','/api/v1/shares',p)).status,503);assert.equal(readFileSync(file,'utf8'),raw);
  rmSync(file+'.tmp',{recursive:true});assert.equal((await request('POST','/api/v1/shares',p)).status,201);
 });
});
test('real upstream body stalls time out and release the search concurrency gate',async()=>{
 let calls=0;
 const upstream=http.createServer((req,res)=>{calls++;res.writeHead(200,{'Content-Type':'application/json'});if(calls===1)res.write('{');else res.end(JSON.stringify({Code:0,Data:{Items:[]}}))});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 try {await withApp(async({request})=>{
  assert.equal((await request('POST','/api/v1/search',{query:'first'})).status,504);
  assert.equal((await request('POST','/api/v1/search',{query:'second'})).status,200);
 },{secret:'synthetic',timeoutMs:100,fetchImpl:(_url,init)=>fetch('http://127.0.0.1:'+upstream.address().port,init)})}
 finally {upstream.closeAllConnections();await new Promise(r=>upstream.close(r))}
});

test('seeded recursive variadic share bodies: 768 cases, stable rejection and no accidental writes',async()=>{
 for(const seed of [20260914,42,9001]) {
  let state=seed>>>0, budget=0;
  const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state};
  function value(depth=0) {
   if(++budget>80||depth>=6)return [null,false,next(),'😀',''][next()%5];
   const kind=next()%7;
   if(kind<5)return [null,false,next(),'😀',''][kind];
   const args=Array.from({length:next()%5},()=>value(depth+1));
   return kind===5?args:Object.fromEntries(args.map((v,i)=>['field'+i,v]));
  }
  // Vary both the number of supplied fields and recursively nested argument values.
  function variadicBody(...args) {return Object.fromEntries(args.map((v,i)=>['extra'+i,v]))}
  await withApp(async({file,request})=>{
   const control=payload();assert.equal((await request('POST','/api/v1/shares',control)).status,201);
   const original=readFileSync(file,'utf8');
   for(let i=0;i<256;i++) {
    budget=0;const args=Array.from({length:1+next()%7},()=>value());
    const p=i%2?{...payload(),...variadicBody(...args)}:value();
    const res=await request('POST','/api/v1/shares',p);
    assert.equal(res.status,400,`seed=${seed} case=${i}`);
    assert.equal(readFileSync(file,'utf8'),original,`seed=${seed} case=${i}`);
   }
   assert.equal((await request('GET','/healthz')).status,200);
  });
 }
});
