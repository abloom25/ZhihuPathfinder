// Bounded real-HTTP cache churn probe; measurements, not proof of no leaks.
import {mkdtempSync,rmSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {createApp} from '../backend/server.mjs';
if(!global.gc)throw new Error('Run with --expose-gc');
const dir=mkdtempSync(join(tmpdir(),'pathfinder-memory2-'));
let upstreamCalls=0;
const app=createApp({secret:'synthetic',shareFile:join(dir,'shares.json'),minIntervalMs:0,maxCacheEntries:100,fetchImpl:async()=>{
 upstreamCalls++;
 return Response.json({Code:0,Data:{Items:Array.from({length:10},(_,i)=>({Title:'synthetic',AuthorName:'fixture',Url:'https://www.zhihu.com/question/1/answer/'+i,ContentText:'合成负载'.repeat(256)}))}});
}});
await new Promise(r=>app.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.address().port;
const samples=[];
try {
 for(let batch=0;batch<6;batch++){
  for(let i=0;i<160;i++){
   const r=await fetch(base+'/api/v1/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'batch-'+batch+'-'+i})});
   if(r.status!==200)throw Error('unexpected '+r.status);await r.arrayBuffer();
  }
  global.gc();await new Promise(r=>setImmediate(r));global.gc();
  samples.push({batch,...process.memoryUsage()});
 }
 const report={requests:960,upstreamCalls,cacheLimit:100,samples,scope:'single Node process, real local HTTP, synthetic cache churn; not browser memory or absence-of-leaks proof'};
 const out=resolve(process.env.AUDIT_RESULTS||'audit/round2-results');mkdirSync(out,{recursive:true});writeFileSync(join(out,'deep-memory-probe.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{app.closeAllConnections();await new Promise(r=>app.close(r));rmSync(dir,{recursive:true,force:true})}
