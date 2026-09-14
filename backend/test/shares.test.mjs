import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID,randomBytes} from 'node:crypto';import {createApp} from '../server.mjs';
test('independent receiving, durable immutable snapshot, authorization, retry and withdrawal',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'later-shares-')),file=join(dir,'shares.json');let server;
 const start=async()=>{server=createApp({shareFile:file});await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port};let base=await start();
 const token=randomBytes(32).toString('hex'),id=randomUUID(),payload={id,situation:'测试处境',text:'【测试】已发生：练习一次。结果仍未知。',demo:true,consent:true,sourceUrl:'https://www.zhihu.com/question/1',sourceExcerpt:'原文'};
 const request=(path='',method='GET',data,auth)=>fetch(base+'/api/v1/shares'+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(data?{body:JSON.stringify(data)}:{})});
 try{
 assert.equal((await request('','POST',{...payload,consent:false},token)).status,400);
 assert.equal((await request('','POST',payload,token)).status,201);
 assert.equal((await request('','POST',payload,token)).status,200);
 assert.equal((await request('','POST',{...payload,text:'changed'},token)).status,409);
 let list=await (await request()).json();assert.equal(list.data.length,1);assert.equal(JSON.stringify(list).includes(token),false);assert.equal(JSON.stringify(list).includes('tokenHash'),false);
 assert.equal((await request('/'+id,'DELETE',{},randomBytes(32).toString('hex'))).status,403);
 await new Promise(r=>server.close(r));base=await start();
 assert.equal((await (await request('/'+id)).json()).data.text,payload.text);
 assert.equal((await request('/'+id,'DELETE',{},token)).status,200);
 assert.equal((await request('/'+id)).status,404);assert.equal((await (await request()).json()).data.length,0);
 assert.equal(readFileSync(file,'utf8').includes(payload.text),false);
 assert.equal((await request('','POST',payload,token)).status,409);
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true})}
});
