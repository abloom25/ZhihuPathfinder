import{readFileSync}from'node:fs';
import{numberSource,hash}from'../v2/pipeline.mjs';
export{hash};
export const prompts={a:readFileSync(new URL('./extract-a.txt',import.meta.url),'utf8'),b:readFileSync(new URL('./extract-b.txt',import.meta.url),'utf8'),relations:readFileSync(new URL('./relations.txt',import.meta.url),'utf8')};
export function clauses(raw){const base=numberSource(raw),units=[];for(const p of base.units){let n=0;for(const m of p.text.matchAll(/[^，,；;]+[，,；;]*|[，,；;]+/g)){if(!m[0].trim())continue;units.push({id:`${p.id}.c${++n}`,start:p.start+m.index,end:p.start+m.index+m[0].length,text:m[0],contextId:p.id,context:p.text});}}return{sourceHash:hash(raw),units};}
const strings=x=>Array.isArray(x)&&x.every(v=>typeof v==='string');
const modal=/希望|许愿|打算|计划|假如|如果|看情况|有想法|目标|期待|但愿|要是/;
export function filterClaims(source,value){
 const kept=[],pending=[],rejected=[],excluded=[],issues=[];const byId=new Map(source.units.map(u=>[u.id,u]));
 if(!value||!Array.isArray(value.claims))return{kept,pending,rejected,excluded,issues:['missing_claims_array'],unknowns:[]};
 const counts=new Map();for(const c of value.claims)if(c&&typeof c.id==='string')counts.set(c.id,(counts.get(c.id)||0)+1);
 for(const c of value.claims){let reason;
  if(!c||typeof c.id!=='string'||!c.id||!strings(c.refs)||!c.refs.length||!['author','other','example','uncertain'].includes(c.subject)||!['occurred','intention','advice','uncertain'].includes(c.kind))reason='invalid_claim_shape';
  else if(counts.get(c.id)>1)reason='duplicate_claim_id';
  else if(c.refs.some(id=>!byId.has(id)))reason='unknown_reference';
  if(reason){rejected.push({claim:c,reason});continue;}
  const evidence=[...new Set(c.refs)].map(id=>({...byId.get(id)}));const claim={id:c.id,refs:[...new Set(c.refs)],subject:c.subject,kind:c.kind,evidence};
  if(c.subject==='other'||c.subject==='example'||c.kind==='advice'){excluded.push({...claim,reason:'not_author_experience'});continue;}
  if(c.subject==='uncertain'||c.kind==='uncertain'){pending.push({...claim,reason:'uncertain_attribution'});continue;}
  if(c.kind==='occurred'&&evidence.some(e=>modal.test(e.text))){pending.push({...claim,reason:'claim_contains_modal_language'});continue;}
  kept.push({...claim,status:'evidence_linked_unverified'});
 }
 return{kept,pending,rejected,excluded,issues,unknowns:strings(value.unknowns)?value.unknowns:[]};
}
export function filterRelations(source,claims,value){
 const kept=[],pending=[],rejected=[];const byId=new Map(claims.map(c=>[c.id,c])),units=new Map(source.units.map(u=>[u.id,u]));
 if(!value||!Array.isArray(value.relations))return{kept,pending,rejected,issues:['missing_relations_array']};
 const pairs=new Map();
 for(const r of value.relations){let reason;
  if(!r||!byId.has(r.left)||!byId.has(r.right)||r.left===r.right||!strings(r.refs)||!r.refs.length||r.refs.some(id=>!units.has(id)))reason='invalid_relation_reference';
  else if(!r.refs.some(id=>byId.get(r.left).refs.includes(id)||byId.get(r.right).refs.includes(id)))reason='unrelated_evidence';
  else if(!(r.relation==='same_event'&&r.basis==='continuation'||r.relation==='separate_event'&&['different_opportunity','explicit_restart'].includes(r.basis)||r.relation==='uncertain'&&r.basis==='insufficient'))reason='invalid_relation_basis';
  if(reason){rejected.push({relation:r,reason});continue;}
  const item={...r,evidence:r.refs.map(id=>({...units.get(id)})),status:'evidence_linked_unverified'};
  if(r.relation==='uncertain'){pending.push(item);continue;}
  const pair=[r.left,r.right].sort().join('|');if(!pairs.has(pair))pairs.set(pair,[]);pairs.get(pair).push(item);
 }
 for(const rows of pairs.values()){if(new Set(rows.map(r=>r.relation)).size>1)for(const r of rows)pending.push({...r,reason:'conflicting_pair'});else kept.push(rows[0]);}
 // A separate edge contradicting a chain of same-event links is not allowed to define groups.
 const component=new Map(claims.map(c=>[c.id,c.id]));const root=id=>{while(component.get(id)!==id)id=component.get(id);return id;};
 for(const r of kept)if(r.relation==='same_event')component.set(root(r.left),root(r.right));
 const conflicts=new Set();for(const r of kept)if(r.relation==='separate_event'&&root(r.left)===root(r.right))conflicts.add(root(r.left));
 const valid=kept.filter(r=>{if(conflicts.has(root(r.left))||conflicts.has(root(r.right))){pending.push({...r,reason:'inconsistent_component'});return false;}return true;});
 return{kept:valid,pending,rejected,issues:[]};
}
export async function modelCall(prompt,input,{apiKey=process.env.DEEPSEEK_API_KEY,fetchImpl=fetch}={}){
 const start=Date.now();if(!apiKey)return{ok:false,error:'not_configured',elapsedMs:0};let body;
 try{const r=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(55000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-v4-flash',messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_object'},max_tokens:3500,thinking:{type:'disabled'}})});if(!r.ok)return{ok:false,error:'http_'+r.status,elapsedMs:Date.now()-start};body=await r.text();}
 catch(e){return{ok:false,error:e.name==='TimeoutError'?'timeout':'network_error',elapsedMs:Date.now()-start};}
 try{const response=JSON.parse(body),rawContent=response.choices?.[0]?.message?.content;const meta={elapsedMs:Date.now()-start,model:response.model,usage:response.usage,rawContent};if(response.choices?.[0]?.finish_reason!=='stop')return{...meta,ok:false,error:'incomplete_output'};return{...meta,ok:true,value:JSON.parse(rawContent)};}
 catch{return{ok:false,error:'json_parse_error',elapsedMs:Date.now()-start};}
}
export async function analyze(item,{variant='b',caller=modelCall}={}){
 const source=clauses(item.ContentText),base={id:item.id,variant,source,rawText:item.ContentText,confirmedEpisodes:[],displayMode:'raw_with_review_workspace'};
 const extraction=await caller(prompts[variant],{Title:item.Title,units:source.units.map(({id,text,context})=>({id,text,context}))});
 if(!extraction.ok)return{...base,state:'unavailable',extraction,claims:{kept:[],pending:[],rejected:[],excluded:[],unknowns:[]}};
 const claims=filterClaims(source,extraction.value);let relationCall=null,relations={kept:[],pending:[],rejected:[],issues:[]};
 if(claims.kept.length>1){relationCall=await caller(prompts.relations,{claims:claims.kept.map(({id,refs,kind,evidence})=>({id,refs,kind,evidence})),sourceUnits:source.units.map(({id,text})=>({id,text}))});relations=relationCall.ok?filterRelations(source,claims.kept,relationCall.value):{...relations,issues:['relation_service_unavailable']};}
 return{...base,state:claims.kept.length?'partial_review':claims.pending.length?'uncertain':'raw_only',extraction,claims,relationCall,relations};
}
