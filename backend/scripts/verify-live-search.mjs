// Opt-in smoke test against an already configured backend. No credentials are read or logged.
import assert from 'node:assert/strict';
import {validSearch} from '../../frontend/src/lib/search.js';
const base=process.env.LIVE_BASE_URL || 'http://127.0.0.1:8787';
const query=process.env.LIVE_QUERY || '等offer 后来 收到';
const started=Date.now();
const r=await fetch(new URL('/api/v1/search',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
const body=await r.json();
assert.equal(r.status,200,`backend status ${r.status}, code ${body.error?.code || 'unknown'}`);
assert.ok(validSearch(body),'frontend response contract');
assert.equal(body.data.query,query.trim());
assert.ok(body.data.candidates.length>0,'must return actual candidates');
if(process.env.LIVE_EXPECT_MODE)assert.equal(body.meta.mode,process.env.LIVE_EXPECT_MODE);
console.log(JSON.stringify({at:new Date().toISOString(),query,status:r.status,mode:body.meta.mode,fetchedAt:body.meta.fetchedAt,requestId:body.meta.requestId,count:body.data.candidates.length,frontEndContractValid:true,elapsedMs:Date.now()-started,candidates:body.data.candidates.map(c=>({id:c.id,title:c.source.title,url:c.source.url,author:c.source.authorName,excerptCharacters:[...c.source.rawText].length,reviewStatus:c.reviewStatus}))},null,2));
