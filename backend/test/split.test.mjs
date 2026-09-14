import{test}from 'node:test';import assert from 'node:assert/strict';
import{checkProposal,presentation,generate}from '../analysis/split.mjs';
const raw='我去年申请甲公司，拿到offer。今年再次申请乙公司，还在等待。希望拿到offer。';
const proof=q=>({text:q,quote:q});
const ep=(id,q,outcome)=>({id,subject:'author',event:proof(q),time:null,action:null,outcome:outcome?{status:'stated',text:outcome,quote:outcome}:{status:'missing',text:'片段未包含结果',quote:null},unknowns:['是否入职未知']});
const good=()=>({assessment:'multiple_supported',episodes:[ep('e1','我去年申请甲公司','拿到offer'),ep('e2','今年再次申请乙公司')],boundaries:[{left:'e1',right:'e2',quote:'今年再次申请乙公司',reason:'不同公司和年份'}],unknowns:['第二次结果未知']});
test('split: valid evidence remains unverified, with original text and no confirmed episodes',()=>{
 const result=presentation(raw,good());assert.equal(result.state,'review_required');assert.equal(result.rawText,raw);assert.deepEqual(result.confirmedEpisodes,[]);
});
test('split: invented quote, foreign subject, missing boundary and wishes rejected',()=>{
 for(const mutate of [x=>x.episodes[0].event.quote='原文不存在',x=>x.episodes[0].subject='other',x=>x.boundaries=[],x=>x.episodes[1].outcome={status:'stated',text:'成功',quote:'希望拿到offer'}]){
 const x=good();mutate(x);assert.equal(checkProposal(raw,x).passed,false);assert.equal(presentation(raw,x).proposal,null);
 }
});
test('split: unknown outcome has no quote; one episode is not a confirmed single lifetime story',()=>{
 const x=good();x.episodes[1].outcome.quote='拿到offer';assert.equal(checkProposal(raw,x).passed,false);
 const one={...good(),assessment:'no_second_found',episodes:[good().episodes[0]],boundaries:[]};
 assert.equal(checkProposal(raw,one).passed,true);assert.equal(presentation(raw,one).state,'review_required');
 assert.deepEqual(presentation(raw,one).confirmedEpisodes,[]);
});
test('split: a real quote assigned to wrong event cannot be certified by the mechanical gate',()=>{
 const x=good();x.episodes[1].outcome={status:'stated',text:'拿到offer',quote:'拿到offer'};
 // This adversarial case demonstrates the deliberate limit: textual existence cannot prove ownership.
 assert.equal(checkProposal(raw,x).passed,true);assert.deepEqual(presentation(raw,x).confirmedEpisodes,[]);
});
test('split: duplicate IDs, missing structure and impossible assessments rejected',()=>{
 for(const mutate of [x=>x.episodes[1].id='e1',x=>delete x.episodes[0].event,x=>x.assessment='confirmed_single',x=>x.boundaries[0].right='missing']){
 const x=good();mutate(x);assert.equal(checkProposal(raw,x).passed,false);
 }
});
test('split: unavailable, invalid JSON and truncated generation retain raw input',async()=>{
 const item={Title:'test',ContentText:raw};
 const unavailable=await generate(item,{apiKey:''});assert.equal(unavailable.rawText,raw);assert.equal(unavailable.proposal,null);
 for(const body of ['bad',JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]})]){
 const result=await generate(item,{apiKey:'test',fetchImpl:async()=>new Response(body)});assert.equal(result.state,'unavailable');assert.equal(result.rawText,raw);assert.deepEqual(result.confirmedEpisodes,[]);
 }
});
