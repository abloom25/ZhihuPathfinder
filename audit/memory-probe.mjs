import {searchCandidates} from '../frontend/src/lib/search.js';
import {writeFileSync} from 'node:fs';
if(!global.gc)throw Error('Use node --expose-gc audit/memory-probe.mjs');
const real=globalThis.fetch;globalThis.fetch=async()=>{throw new DOMException('synthetic','AbortError')};
let added=0,removed=0;const signal={aborted:false,addEventListener(){added++},removeEventListener(){removed++}};
const samples=[];
try{for(let batch=0;batch<6;batch++){for(let i=0;i<1000;i++){try{await searchCandidates('synthetic',signal)}catch{}}global.gc();samples.push({batch,heapUsed:process.memoryUsage().heapUsed,outstandingExternalListeners:added-removed});await new Promise(r=>setImmediate(r));}}
finally{globalThis.fetch=real}
writeFileSync(new URL('../' + (process.env.AUDIT_RESULTS || 'audit/results') + '/memory-probe.json',import.meta.url),JSON.stringify({requests:6000,samples,scope:'bounded Node cancellation workload; not browser heap or proof of absence of leaks'},null,2));console.log(JSON.stringify(samples));
