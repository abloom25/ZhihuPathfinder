import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const groupPrompt=readFileSync(new URL('./group-prompt.txt',import.meta.url),'utf8');
export const outcomePrompt=readFileSync(new URL('./outcome-prompt.txt',import.meta.url),'utf8');
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
const str={type:'string',minLength:1};
const refs={type:'array',uniqueItems:true,items:str};
const nonempty={...refs,minItems:1};
const list=items=>({type:'array',items});
const claim=obj({refs:nonempty,summary:str});
export const groupSchema=obj({assessment:{enum:['multiple_supported','no_second_found','not_personal','uncertain']},episodes:{...list(obj({id:str,label:str,refs:nonempty,anchorRefs:nonempty})),maxItems:8},boundaries:list(obj({left:str,right:str,refs:nonempty,basis:{enum:['different_opportunity','explicit_restart','different_goal']},reason:str})),excludedRefs:refs,unassignedRefs:refs,unknowns:nonempty});
export const outcomeSchema=obj({episodeId:str,actions:list(claim),changes:list(obj({kind:{enum:['occurred','conditional_or_wish']},refs:nonempty,summary:str})),outcome:obj({status:{enum:['stated','missing','uncertain']},refs,summary:str}),unknowns:nonempty});
const ajv=new Ajv({allErrors:true});const vg=ajv.compile(groupSchema),vo=ajv.compile(outcomeSchema);
export function numberSource(raw){
 if(typeof raw!=='string'||!raw.trim())throw Error('empty_source');
 const units=[];let start=0,p=0;
 const add=(end)=>{p++;let s=0;const text=raw.slice(start,end);for(const m of text.matchAll(/[^。！？!?]+[。！？!?]*|[。！？!?]+/g)){
  if(!m[0].trim())continue;units.push({id:`p${p}.s${++s}`,start:start+m.index,end:start+m.index+m[0].length,text:m[0]});
 }};
 // Distinguish literal backslash-n from actual newline, while preserving exact source slices.
 for(const m of raw.matchAll(/\\n|\r\n|\n|\r/g)){add(m.index);start=m.index+m[0].length;}add(raw.length);
 return {sourceHash:hash(raw),units};
}
export function checkGroups(source,g){
 if(!vg(g))return {passed:false,errors:['group_schema_invalid'],details:structuredClone(vg.errors)};
 const errors=[],known=new Set(source.units.map(u=>u.id)),owners=new Map(),ids=new Set();
 const own=(id,owner)=>{if(!known.has(id))errors.push('unknown_reference:'+id);if(owners.has(id))errors.push('duplicate_assignment:'+id);owners.set(id,owner);};
 for(const e of g.episodes){if(ids.has(e.id))errors.push('duplicate_episode');ids.add(e.id);for(const id of e.refs)own(id,e.id);for(const id of e.anchorRefs)if(!e.refs.includes(id))errors.push('anchor_outside_episode');}
 for(const id of g.excludedRefs)own(id,'excluded');for(const id of g.unassignedRefs)own(id,'unassigned');
 for(const id of known)if(!owners.has(id))errors.push('unaccounted_reference:'+id);
 for(const b of g.boundaries){if(!ids.has(b.left)||!ids.has(b.right)||b.left===b.right)errors.push('boundary_episode_invalid');for(const id of b.refs)if(!known.has(id)||![b.left,b.right].includes(owners.get(id)))errors.push('boundary_reference_invalid');}
 if(g.assessment==='multiple_supported'){
  if(ids.size<2)errors.push('multiple_requires_two');const seen=new Set(g.episodes.slice(0,1).map(e=>e.id));
  for(let i=0;i<ids.size;i++)for(const b of g.boundaries)if(seen.has(b.left)||seen.has(b.right)){seen.add(b.left);seen.add(b.right);}if([...ids].some(id=>!seen.has(id)))errors.push('boundary_not_connected');
 }else if(g.boundaries.length)errors.push('unexpected_boundary');
 if(g.assessment==='no_second_found'&&ids.size!==1)errors.push('one_required');
 if(['not_personal','uncertain'].includes(g.assessment)&&ids.size)errors.push('abstention_has_episode');
 return {passed:!errors.length,errors};
}
const modal=/如果|假如|希望|许愿|但愿|期待|打算|计划|目标|有想法|看情况|才能|要是/;
export function checkOutcome(source,episode,o){
 if(!vo(o))return {passed:false,errors:['outcome_schema_invalid'],details:structuredClone(vo.errors)};
 const errors=[],byId=new Map(source.units.map(u=>[u.id,u]));
 if(o.episodeId!==episode.id)errors.push('wrong_episode_id');
 for(const c of [...o.actions,...o.changes,o.outcome])for(const id of c.refs){
  if(!byId.has(id))errors.push('unknown_reference:'+id);else if(!episode.refs.includes(id))errors.push('cross_episode_reference:'+id);
 }
 if(o.outcome.status==='stated'&&!o.outcome.refs.length)errors.push('stated_requires_evidence');
 if(o.outcome.status!=='stated'&&o.outcome.refs.length)errors.push('unknown_cannot_cite_result');
 for(const c of [...o.actions,...o.changes.filter(c=>c.kind==='occurred'),...(o.outcome.status==='stated'?[o.outcome]:[])]){
  if(c.refs.some(id=>modal.test(byId.get(id)?.text||'')))errors.push('modal_language_requires_uncertainty');
 }
 return {passed:!errors.length,errors};
}
export function hydrate(source,value){
 const byId=new Map(source.units.map(u=>[u.id,u]));
 const walk=x=>{if(Array.isArray(x))return x.map(walk);if(x&&typeof x==='object'){
 const copy=Object.fromEntries(Object.entries(x).map(([k,v])=>[k,walk(v)]));
 if(Array.isArray(x.refs))copy.evidence=x.refs.map(id=>{const u=byId.get(id);if(!u)throw Error('unknown_reference');return {...u};});return copy;}return x;};
 return walk(value);
}
export async function callModel(prompt,input,{apiKey=process.env.DEEPSEEK_API_KEY,fetchImpl=fetch}={}){
 const start=Date.now();if(!apiKey)return {ok:false,error:'not_configured',elapsedMs:0};
 try{const r=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-v4-flash',messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_object'},max_tokens:4500,thinking:{type:'disabled'}})});
 if(!r.ok)return {ok:false,error:'http_'+r.status,elapsedMs:Date.now()-start};const data=await r.json();const content=data.choices?.[0]?.message?.content;
 if(data.choices?.[0]?.finish_reason!=='stop')return{ok:false,error:'incomplete_output',elapsedMs:Date.now()-start};
 return {ok:true,value:JSON.parse(content),rawContent:content,model:data.model,usage:data.usage,elapsedMs:Date.now()-start};
 }catch{return {ok:false,error:'request_or_parse_failed',elapsedMs:Date.now()-start};}
}
export async function analyze(item,{caller=callModel}={}){
 const source=numberSource(item.ContentText);const base={id:item.id,sourceHash:source.sourceHash,rawText:item.ContentText,confirmedEpisodes:[],displayMode:'raw_only',source};
 const grouping=await caller(groupPrompt,{Title:item.Title,units:source.units.map(({id,text})=>({id,text}))});
 if(!grouping.ok)return {...base,state:'unavailable',grouping};
 const groupCheck=checkGroups(source,grouping.value);
 if(!groupCheck.passed)return {...base,state:'rejected',grouping,groupCheck};
 if(['not_personal','uncertain'].includes(grouping.value.assessment))return {...base,state:grouping.value.assessment,grouping,groupCheck,outcomes:[]};
 const outcomes=[];
 for(const episode of grouping.value.episodes){
  // Second stage sees only the owning episode's units; no outcomes from sibling episodes.
  const result=await caller(outcomePrompt,{episodeId:episode.id,label:episode.label,units:source.units.filter(u=>episode.refs.includes(u.id)).map(({id,text})=>({id,text}))});
  const check=result.ok?checkOutcome(source,episode,result.value):{passed:false,errors:['model_unavailable']};
  outcomes.push({episodeId:episode.id,result,check});
 }
 const passed=outcomes.every(o=>o.check.passed);
 return {...base,state:passed?'review_required':'rejected',grouping,groupCheck,outcomes,
 proposal:passed?hydrate(source,{grouping:grouping.value,outcomes:outcomes.map(o=>o.result.value)}):null,
 notice:'编号保证取回原文，不能保证语义归属；未经语义核对仍不自动展示确定拆分。'};
}
