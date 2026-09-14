// Isolated audit server. Never use for production. A one-shot file enables a
// response-loss fault AFTER the real backend has accepted a share.
import http from 'node:http';
import {readFileSync,existsSync,unlinkSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../backend/server.mjs';
const dir=fileURLToPath(new URL('./',import.meta.url));
const results=resolve(dir,'..',process.env.AUDIT_RESULTS || 'audit/results')+'/';
mkdirSync(results,{recursive:true});
const apiPort=Number(process.env.AUDIT_API_PORT || 18102), uiPort=Number(process.env.AUDIT_UI_PORT || 18101);
const api=createApp({shareFile:results+'local-shares.json'});
api.listen(apiPort,'127.0.0.1');
const root=resolve(dir,'../frontend/dist');
http.createServer((req,res)=>{
 if(req.url.startsWith('/api/')||req.url==='/healthz') {
  const upstream=http.request({hostname:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers:req.headers},r=>{
   const chunks=[];r.on('data',c=>chunks.push(c));r.on('end',()=>{
    const drop=req.method==='POST'&&req.url==='/api/v1/shares'&&r.statusCode===201&&existsSync(dir+'drop-next-share');
    appendFileSync(results+'http-events.jsonl',JSON.stringify({at:new Date().toISOString(),method:req.method,path:req.url,status:r.statusCode,dropped:drop})+'\n');
    if(drop){unlinkSync(dir+'drop-next-share');res.destroy();return;}
    res.writeHead(r.statusCode,r.headers);res.end(Buffer.concat(chunks));
   });
  });upstream.on('error',()=>{res.writeHead(502);res.end('{}')});req.pipe(upstream);return;
 }
 let path;try{path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);res.end();return}
 let file=resolve(root,'.'+path);if(!file.startsWith(root+'/'))file=root+'/index.html';
 if(!existsSync(file)||!extname(file))file=root+'/index.html';
 try{res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(readFileSync(file))}catch{res.writeHead(404);res.end()}
}).listen(uiPort,'127.0.0.1',()=>console.log('Isolated audit UI http://127.0.0.1:'+uiPort+'; API '+apiPort+'; no live credentials'));
