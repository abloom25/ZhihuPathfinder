// Read-only checks. Browser writes, actual sharing and mobile UX remain a separate acceptance step.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base=(process.env.BASE_URL||'http://127.0.0.1:18089').replace(/\/$/,'');
const results=[];
async function get(path){const r=await fetch(base+path,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,path);results.push({path,status:r.status});return r;}
try{
 const health=await (await get('/healthz')).json();assert.equal(health.status,'ok');
 const home=await (await get('/api/v1/stories')).json();assert.equal(home.data.stories.length,3);
 for(const s of home.data.stories){const d=await(await get('/api/v1/stories/'+s.id)).json();assert.equal(d.data.id,s.id);}
 const shares=await(await get('/api/v1/shares')).json();assert.ok(Array.isArray(shares.data));
 let index;
 for(const path of ['/','/levels/waiting-week','/records','/record/new','/shares']){
  const r=await get(path);assert.match(r.headers.get('content-type')||'',/text\/html/);const text=await r.text();
  if(index===undefined)index=text;else assert.equal(text,index,'SPA fallback '+path);
 }
 const srcs=[...index.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(m=>m[1]);assert.ok(srcs.length,'built JS/CSS');
 for(const path of srcs){assert.ok(path.startsWith('/')&&!path.startsWith('//'),'same-origin absolute asset');const r=await get(path);assert.ok(!(r.headers.get('content-type')||'').includes('text/html'),'asset returned HTML');}
 assert.equal((await fetch(base+'/assets/handoff-nonexistent.js')).status,404);
}catch(e){results.push({passed:false,message:e.message});process.exitCode=1;}
const report={at:new Date().toISOString(),base,passed:!process.exitCode,checks:results,searchChecked:false,userJourneyVerified:false,publicDeploymentVerified:false};
if(process.env.REPORT_PATH)writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
