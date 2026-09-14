import {test} from 'node:test';import assert from 'node:assert/strict';
import {numberSource,checkGroups,checkOutcome,hydrate,analyze} from '../analysis/v2/pipeline.mjs';
const raw='去年申请甲，已经拿到offer。\\n今年申请乙。\n希望拿到offer。';
const src=numberSource(raw);
const grouping=()=>({assessment:'multiple_supported',episodes:[{id:'e1',label:'甲',refs:['p1.s1'],anchorRefs:['p1.s1']},{id:'e2',label:'乙',refs:['p2.s1','p3.s1'],anchorRefs:['p2.s1']}],boundaries:[{left:'e1',right:'e2',refs:['p2.s1'],basis:'different_opportunity',reason:'不同机会'}],excludedRefs:[],unassignedRefs:[],unknowns:['乙结果未知']});
const outcome=()=>({episodeId:'e2',actions:[{refs:['p2.s1'],summary:'申请乙'}],changes:[{kind:'conditional_or_wish',refs:['p3.s1'],summary:'希望拿offer'}],outcome:{status:'missing',refs:[],summary:'未见结果'},unknowns:['入职未知']});
test('v2 numbering: actual/literal newlines, punctuation and emoji roundtrip without rewriting',()=>{
 for(const text of [raw,'\r\n 😀原文！\n\n末段','只有一段','a\\nb\r\nc'])for(const u of numberSource(text).units)assert.equal(text.slice(u.start,u.end),u.text);
 assert.equal(src.units.length,3);assert.equal(hydrate(src,{refs:['p1.s1']}).evidence[0].text,'去年申请甲，已经拿到offer。');
});
test('v2 grouping: exact coverage, disjoint assignment, boundaries and assessment',()=>{
 assert.equal(checkGroups(src,grouping()).passed,true);
 for(const mutate of [g=>g.episodes[1].refs.push('p1.s1'),g=>g.episodes[1].refs.pop(),g=>g.episodes[1].refs.push('p999.s1'),g=>g.boundaries=[],g=>g.assessment='no_second_found']){
 const g=grouping();mutate(g);assert.equal(checkGroups(src,g).passed,false);
 }
});
test('v2 outcomes: foreign old result rejected even when it exists in raw source',()=>{
 const ep=grouping().episodes[1];assert.equal(checkOutcome(src,ep,outcome()).passed,true);
 const o=outcome();o.outcome={status:'stated',refs:['p1.s1'],summary:'拿到offer'};
 assert.ok(checkOutcome(src,ep,o).errors.some(e=>e.startsWith('cross_episode_reference')));
});
test('v2 outcomes: wishes/plans/conditional work do not become occurred actions or outcomes',()=>{
 for(const text of ['希望拿到offer。','有想法的话发消息，看情况上班。','目标2028年辞职。']){
 const s=numberSource(text),ep={id:'e1',refs:['p1.s1']};const o={episodeId:'e1',actions:[],changes:[],outcome:{status:'stated',refs:['p1.s1'],summary:'完成'},unknowns:['其他未知']};
 assert.ok(checkOutcome(s,ep,o).errors.includes('modal_language_requires_uncertainty'));
 }
});
test('v2 process: stage two never receives sibling evidence and never publishes confirmed split',async()=>{
 let calls=0;
 const result=await analyze({id:'test',ContentText:raw,Title:'t'},{caller:async(prompt,input)=>{
 calls++;if(calls===1)return {ok:true,value:grouping()};
 const owned=grouping().episodes.find(e=>e.id===input.episodeId);assert.deepEqual(input.units.map(u=>u.id),owned.refs);
 return {ok:true,value:input.episodeId==='e2'?outcome():{...outcome(),episodeId:'e1',actions:[],changes:[],outcome:{status:'stated',refs:['p1.s1'],summary:'拿到offer'}}};
 }});
 assert.equal(calls,3);assert.equal(result.state,'review_required');assert.equal(result.displayMode,'raw_only');assert.deepEqual(result.confirmedEpisodes,[]);
});
test('v2 abstention or invalid first stage skips outcome generation and retains original',async()=>{
 for(const response of [{ok:false,error:'timeout'},{ok:true,value:{}},{ok:true,value:{assessment:'uncertain',episodes:[],boundaries:[],excludedRefs:[],unassignedRefs:src.units.map(u=>u.id),unknowns:['无法确定']}}]){
 let calls=0;const result=await analyze({id:'test',ContentText:raw},{caller:async()=>{calls++;return response;}});
 assert.equal(calls,1);assert.equal(result.rawText,raw);assert.equal(result.proposal,undefined);assert.deepEqual(result.confirmedEpisodes,[]);
 }
});
