import{readFileSync}from'node:fs';import{clauses,modelCall,hash}from'../v3/pipeline.mjs';export{hash};
const prompt=readFileSync(new URL('./prompt.txt',import.meta.url),'utf8');
const arrays=x=>Array.isArray(x)&&x.every(v=>typeof v==='string');
export function validateVerdict(source,decision){
 const errors=[],ids=new Map(source.units.map(u=>[u.id,u]));
 if(!decision||!['supported','unsupported','uncertain'].includes(decision.verdict)||typeof decision.reason!=='string'||!decision.reason.trim()||!arrays(decision.supportRefs)||!arrays(decision.counterRefs)||!arrays(decision.uncertainties))return{passed:false,errors:['invalid_review_shape']};
 for(const key of ['subject','event','modality','attribution','scope'])if(!['supported','unsupported','uncertain','not_applicable'].includes(decision.checks?.[key]))errors.push('missing_or_invalid_check:'+key);
 for(const id of [...decision.supportRefs,...decision.counterRefs])if(!ids.has(id))errors.push('unknown_reference:'+id);
 if(decision.verdict==='supported'){
  if(!decision.supportRefs.length)errors.push('support_without_evidence');
  if(decision.counterRefs.length||decision.uncertainties.length)errors.push('unresolved_counterevidence');
  if(Object.values(decision.checks||{}).some(v=>!['supported','not_applicable'].includes(v)))errors.push('contradictory_checks');
  if(Object.values(decision.checks||{}).every(v=>v==='not_applicable'))errors.push('nothing_checked');
 }
 return{passed:!errors.length,errors};
}
export function degrade(source,candidate,review){
 const byId=new Map(source.units.map(u=>[u.id,u]));
 const excerpts=(candidate.refs||[]).filter(id=>byId.has(id)).map(id=>({...byId.get(id)}));
 const base={candidateId:candidate.id,sourceHash:source.sourceHash,sourceExcerpts:excerpts,automaticDisplayAllowed:false};
 if(!review?.ok)return{...base,action:'source_only',retainedInterpretation:null,reason:review?.error||'review_unavailable'};
 const check=validateVerdict(source,review.value);
 if(!check.passed)return{...base,action:'source_only',retainedInterpretation:null,reason:'invalid_review',check};
 if(review.value.verdict==='supported')return{...base,action:'retain_for_experiment',retainedInterpretation:candidate,reason:review.value.reason,check};
 return{...base,action:candidate.type==='relation'?'unlink':candidate.type==='outcome'?'outcome_unknown':'source_only',retainedInterpretation:null,reason:review.value.reason,check};
}
export async function audit(item,candidate,{caller=modelCall}={}){
 const source=clauses(item.ContentText);const review=await caller(prompt,{Title:item.Title,sourceUnits:source.units.map(({id,text,context})=>({id,text,context})),candidate:{type:candidate.type,text:candidate.text,refs:candidate.refs}});
 return{sourceHash:source.sourceHash,candidate,review,decision:degrade(source,candidate,review)};
}
export function composeLocal(rawText,audits){
 // Each audit is independent: no whole-article pass/fail, and no inferred new story.
 return{rawText,retained:audits.filter(a=>a.decision.action==='retain_for_experiment').map(a=>a.decision.retainedInterpretation),downgraded:audits.filter(a=>a.decision.action!=='retain_for_experiment').map(a=>a.decision),automaticDisplayAllowed:false};
}
