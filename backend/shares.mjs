import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const short=(v,n)=>typeof v==='string' && v.trim().length>0 && [...v].length<=n;
export function createShares(file) {
 const read=()=>{if(!existsSync(file))return [];const v=JSON.parse(readFileSync(file,'utf8'));if(!Array.isArray(v))throw Error('invalid store');return v};
 const write=rows=>{mkdirSync(dirname(file),{recursive:true});writeFileSync(file+'.tmp',JSON.stringify(rows),{mode:0o600,flush:true});renameSync(file+'.tmp',file)};
 const publicRow=({tokenHash,...row})=>row;
 return async (req,res,path,reply)=>{
  if(!path.startsWith('/api/v1/shares'))return false;
  try {
   const id=path.slice('/api/v1/shares/'.length);
   if(req.method==='GET') {
    const rows=read().filter(x=>!x.revoked);
    if(path==='/api/v1/shares')reply(200,{data:rows.map(publicRow).reverse()});
    else {const r=rows.find(x=>x.id===id);if(!r)throw fail(404,'分享不存在或已撤回');reply(200,{data:publicRow(r)})}
    return true;
   }
   if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)throw fail(403,'来源不匹配');
   if(req.headers['content-type']?.split(';')[0]!=='application/json')throw fail(400,'请使用 JSON');
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>16384)throw fail(413,'内容过长');chunks.push(c)}
   let body;try{body=JSON.parse(Buffer.concat(chunks))}catch{throw fail(400,'格式错误')}
   const token=req.headers.authorization?.replace(/^Bearer /,'');
   if(!/^[a-f0-9]{64}$/.test(token||''))throw fail(403,'缺少管理凭据');
   if(req.method==='POST' && path==='/api/v1/shares') {
    if(!body || (typeof body.id!=='string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id)) || !short(body.situation,80) || !short(body.text,2000) || typeof body.demo!=='boolean' || body.consent!==true || Object.keys(body).some(k=>!['id','situation','text','demo','consent','sourceUrl','sourceExcerpt'].includes(k)))throw fail(400,'请填写处境、分享内容并确认公开');
    if(body.sourceUrl!==null){let u;try{u=new URL(body.sourceUrl)}catch{throw fail(400,'来源链接无效')}if(u.protocol!=='https:'||u.username||u.password||!(u.hostname==='zhihu.com'||u.hostname.endsWith('.zhihu.com')))throw fail(400,'仅支持知乎来源')}
    if(body.sourceExcerpt!==null && (!short(body.sourceExcerpt,500)||!body.sourceUrl))throw fail(400,'摘录须有来源，最多 500 字');
    const rows=read(),old=rows.find(r=>r.id===body.id);
    const data={id:body.id,situation:body.situation,text:body.text,demo:body.demo,sourceUrl:body.sourceUrl,sourceExcerpt:body.sourceExcerpt};
    if(old){if(old.tokenHash!==hash(token))throw fail(403,'管理凭据不匹配');if(old.revoked || Object.keys(data).some(k=>data[k]!==old[k]))throw fail(409,'该次分享已存在或已撤回，请勿覆盖');reply(200,{data:publicRow(old)});return true}
    if(rows.length>=500)throw fail(429,'本次试运行分享容量已满');
    const r={...data,createdAt:new Date().toISOString(),tokenHash:hash(token)};write([...rows,r]);reply(201,{data:publicRow(r)});return true;
   }
   if(req.method==='DELETE') {
    const rows=read(),old=rows.find(r=>r.id===id);if(!old)throw fail(404,'分享不存在');if(old.tokenHash!==hash(token))throw fail(403,'管理凭据不匹配');
    write(rows.map(r=>r.id===id?{id,tokenHash:r.tokenHash,revoked:true}:r));reply(200,{data:{revoked:true}});return true;
   }
   throw fail(405,'不支持的操作');
  }catch(e){reply(e.status||503,{error:{message:e.status?e.message:'分享存储暂不可用，请保留本地记录后重试'}});return true}
 };
}
