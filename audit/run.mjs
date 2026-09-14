import {spawnSync}from'node:child_process';import{readdirSync,mkdirSync,writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';import{join}from'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=join(root,process.env.AUDIT_RESULTS || 'audit/results');mkdirSync(out,{recursive:true});const rows=[];
function run(name,cmd,args,cwd=root,env={}){const r=spawnSync(cmd,args,{cwd,env:{...process.env,...env},encoding:'utf8',timeout:120000});const log=(r.stdout||'')+(r.stderr||'');writeFileSync(join(out,name+'.log'),log);rows.push({name,exitCode:r.status,error:r.error?.message,tests:Number(log.match(/# tests (\d+)/)?.[1]||0),fail:Number(log.match(/# fail (\d+)/)?.[1]||0)});console.log(name+': exit '+r.status)}
run('backend',process.execPath,['--test','--experimental-test-coverage','--test-coverage-include=backend/server.mjs','--test-coverage-include=backend/shares.mjs',...readdirSync(join(root,'backend/test')).filter(n=>n.endsWith('.test.mjs')).map(n=>'backend/test/'+n)]);
run('frontend',process.execPath,['--test','--experimental-test-coverage','--test-coverage-include=src/lib/*.js','test/records.test.mjs','test/flow.test.mjs','test/shares.test.mjs','test/search.test.mjs'],join(root,'frontend'));
run('build','npm',['run','build'],join(root,'frontend'));
run('ablation',process.execPath,['run-ablation.mjs',join(out,'ablation')],join(root,'frontend'));
for(const seed of ['20260914','42'])run('added-tests-'+seed,process.execPath,['--test','audit/adversarial.test.mjs'],root,{FUZZ_SEED:seed});
run('memory',process.execPath,['--expose-gc','audit/memory-probe.mjs']);
writeFileSync(join(out,'run-summary.json'),JSON.stringify({at:new Date().toISOString(),rows},null,2));
if(rows.some(r=>r.exitCode!==0))process.exitCode=1;
