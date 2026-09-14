import test from 'node:test';import assert from 'node:assert/strict';
import {validSearch,searchCandidates} from '../src/lib/search.js';
const response=(query='question')=>({meta:{requestId:'test',mode:'live',fetchedAt:new Date().toISOString()},data:{query,hasMore:false,candidates:[]}});
test('mode must be a string, not a coercible recursive array',()=>{
 for(const mode of [['live'],[['live']],['cached'],{toString:()=> 'live'}]) assert.equal(validSearch({...response(),meta:{...response().meta,mode}}),false);
});
test('a valid-shaped response for another query must not be shown as this query',async()=>{
 const real=globalThis.fetch;
 try {globalThis.fetch=async()=>Response.json(response('different'));await assert.rejects(searchCandidates('question'),e=>e.code==='BAD_RESPONSE')}
 finally {globalThis.fetch=real}
});
