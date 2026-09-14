import{test}from'node:test';import assert from'node:assert/strict';import{clauses,filterClaims,filterRelations,analyze,modelCall}from'../analysis/v3/pipeline.mjs';
const raw='我开始背调了，希望能通过。\n去年拿到offer。',source=clauses(raw);
const claim=(id,ref,kind='occurred')=>({id,refs:[ref],subject:'author',kind});
test('v3 empty/omitted unknowns and extra descriptive fields do not reject evidence',()=>{
 for(const extra of [{unknowns:[]},{},{unknowns:null}])assert.equal(filterClaims(source,{claims:[{...claim('c1',source.units[0].id),note:'optional'}],...extra}).kept.length,1);
});
test('v3 mixed sentence retains actual start and separately marks wish',()=>{
 assert.equal(source.units[0].text,'我开始背调了，');
 const r=filterClaims(source,{claims:[claim('c1',source.units[0].id),claim('c2',source.units[1].id,'intention')]});assert.equal(r.kept.length,2);assert.equal(r.kept[1].kind,'intention');
 const bad=filterClaims(source,{claims:[claim('c1',source.units[0].id),claim('c2',source.units[1].id)]});assert.equal(bad.kept.length,1);assert.equal(bad.pending.length,1);
});
test('v3 local failure retains unrelated valid claim and source exact offsets',()=>{
 const r=filterClaims(source,{claims:[claim('c1',source.units[0].id),claim('bad','nonexistent'),{}]});assert.equal(r.kept.length,1);assert.equal(r.rejected.length,2);
 for(const u of source.units)assert.equal(raw.slice(u.start,u.end),u.text);
});
test('v3 advice and quoted examples never count as author facts',()=>{
 const r=filterClaims(source,{claims:[{...claim('a',source.units[0].id),subject:'example'},{...claim('b',source.units[0].id),kind:'advice'}]});assert.equal(r.kept.length,0);assert.equal(r.excluded.length,2);
});
test('v3 a bad relationship does not remove valid facts; date-only basis is not a boundary',()=>{
 const c=filterClaims(source,{claims:[claim('a',source.units[0].id),claim('b',source.units[2].id)]}).kept;
 const r=filterRelations(source,c,{relations:[{left:'a',right:'b',relation:'separate_event',basis:'date_changed',refs:[source.units[0].id]}]});assert.equal(r.rejected.length,1);assert.equal(c.length,2);
});
test('v3 contradictory relations become pending while independent pair remains',()=>{
 const c=['a','b','c','d'].map(id=>({...claim(id,source.units[0].id)}));
 const rel=(a,b,kind)=>({left:a,right:b,relation:kind,basis:kind==='same_event'?'continuation':'explicit_restart',refs:[source.units[0].id]});
 const r=filterRelations(source,c,{relations:[rel('a','b','same_event'),rel('a','b','separate_event'),rel('c','d','same_event')]});assert.equal(r.pending.length,2);assert.equal(r.kept.length,1);
});
test('v3 relationship provider failure preserves extracted claims; never certifies',async()=>{
 let calls=0;const r=await analyze({id:'test',ContentText:raw},{caller:async()=>++calls===1?{ok:true,value:{claims:[claim('a',source.units[0].id),claim('b',source.units[2].id)]}}:{ok:false,error:'network_error'}});
 assert.equal(r.claims.kept.length,2);assert.equal(r.state,'partial_review');assert.equal(r.rawText,raw);assert.deepEqual(r.confirmedEpisodes,[]);
});
test('v3 distinguishes transport errors from parse errors',async()=>{
 assert.equal((await modelCall('',{},{apiKey:'test',fetchImpl:async()=>{throw Error('private detail');}})).error,'network_error');
 assert.equal((await modelCall('',{},{apiKey:'test',fetchImpl:async()=>new Response('invalid')})).error,'json_parse_error');
});
