import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';
const proof = {type:'object',additionalProperties:false,required:['text','quote'],properties:{text:{type:'string',minLength:1},quote:{type:'string',minLength:1}}};
const nullableProof={anyOf:[proof,{type:'null'}]};
const strings={type:'array',items:{type:'string',minLength:1},minItems:1};
export const schema={type:'object',additionalProperties:false,required:['assessment','episodes','boundaries','unknowns'],properties:{
 assessment:{enum:['multiple_supported','no_second_found','uncertain','not_personal']},unknowns:strings,
 episodes:{type:'array',maxItems:8,items:{type:'object',additionalProperties:false,required:['id','subject','event','time','action','outcome','unknowns'],properties:{
 id:{type:'string',minLength:1},subject:{enum:['author','other','uncertain']},event:proof,time:nullableProof,action:nullableProof,unknowns:strings,
 outcome:{type:'object',additionalProperties:false,required:['status','text','quote'],properties:{status:{enum:['stated','missing','uncertain']},text:{type:'string',minLength:1},quote:{type:['string','null']}}}
 }}},boundaries:{type:'array',items:{type:'object',additionalProperties:false,required:['left','right','quote','reason'],properties:{left:{type:'string'},right:{type:'string'},quote:{type:'string',minLength:1},reason:{type:'string',minLength:1}}}}
}};
const validator=new Ajv({allErrors:true}).compile(schema);
export const prompt=readFileSync(new URL('./prompt.txt',import.meta.url),'utf8');
export const hash=x=>createHash('sha256').update(x).digest('hex');
export function checkProposal(rawText, proposal){
 const errors=[];
 if(!validator(proposal))return {passed:false,errors:['schema_invalid'],schemaErrors:validator.errors};
 const ids=new Set();
 function quote(q,label){if(typeof q!=='string'||!q.length||!rawText.includes(q))errors.push(label+':quote_not_found');}
 for(const ep of proposal.episodes){
  if(ids.has(ep.id))errors.push('duplicate_episode_id');ids.add(ep.id);
  if(ep.subject!=='author')errors.push(ep.id+':subject_not_author');
  for(const field of ['event','time','action'])if(ep[field])quote(ep[field].quote,ep.id+':'+field);
  if(ep.outcome.status==='stated'){
   quote(ep.outcome.quote,ep.id+':outcome');
   if(/希望|许愿|假如|如果|但愿|期待|打算|计划/.test(ep.outcome.quote||''))errors.push(ep.id+':outcome_contains_modal_language');
  }else if(ep.outcome.quote!==null)errors.push(ep.id+':unknown_outcome_has_quote');
 }
 for(const b of proposal.boundaries){quote(b.quote,'boundary');if(!ids.has(b.left)||!ids.has(b.right)||b.left===b.right)errors.push('invalid_boundary_ids');}
 if(proposal.assessment==='multiple_supported'){
  if(ids.size<2)errors.push('multiple_requires_two');
  const visited=new Set(ids.size?[proposal.episodes[0].id]:[]);
  for(let i=0;i<ids.size;i++)for(const b of proposal.boundaries)if(visited.has(b.left)||visited.has(b.right)){visited.add(b.left);visited.add(b.right);}
  if([...ids].some(id=>!visited.has(id)))errors.push('unsupported_split_boundary');
 }
 if(proposal.assessment==='no_second_found'&&ids.size!==1)errors.push('no_second_found_requires_one');
 if(proposal.assessment==='not_personal'&&(ids.size||proposal.boundaries.length))errors.push('not_personal_has_episodes');
 return {passed:errors.length===0,errors};
}
export function presentation(rawText,proposal){
 const check=checkProposal(rawText,proposal);
 // Mechanical validity is not proof of semantic attribution. No confirmed output.
 return {rawText,sourceHash:hash(rawText),state:!check.passed?'rejected':proposal.assessment==='uncertain'?'uncertain':'review_required',
 displayMode:'raw_with_optional_unverified_proposal',confirmedEpisodes:[],
 proposal:check.passed?proposal:null,check,
 notice:'模型提出的待核对解释。未发现第二段不等于确认只有一段；引文存在不代表事件和结果归属已核实。'};
}
export async function generate(item,{fetchImpl=fetch,apiKey=process.env.DEEPSEEK_API_KEY,model='deepseek-v4-flash'}={}){
 const rawText=item.ContentText;
 if(!apiKey)return {rawText,state:'unavailable',confirmedEpisodes:[],proposal:null,reason:'model_not_configured'};
 try{
  const r=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',signal:AbortSignal.timeout(55000),redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify({Title:item.Title,ContentText:rawText})}],response_format:{type:'json_object'},max_tokens:3500,thinking:{type:'disabled'}})});
  if(!r.ok)throw Error('model_http_'+r.status);
  const body=await r.json();
  if(body.choices?.[0]?.finish_reason!=='stop')throw Error('incomplete_model_output');
  const result=presentation(rawText,JSON.parse(body.choices[0].message.content));
  return {...result,model:body.model,usage:body.usage,rawModelContent:body.choices[0].message.content};
 }catch{return {rawText,state:'unavailable',confirmedEpisodes:[],proposal:null,reason:'model_request_or_parse_failed'};}
}
