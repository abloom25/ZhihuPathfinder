import{readFileSync,writeFileSync}from'node:fs';import{clauses}from'../v3/pipeline.mjs';
const rows=JSON.parse(readFileSync(new URL('../../test/fixtures/historical-40.json',import.meta.url)));
const pairs=[
['H02-01','outcome','作者自述收到了书面邮件offer。','作者已经通过背调并正式入职。','offer与入职'],
['H02-05','outcome','两年后再次求职的结果，提供片段没有写明。','两年后的第二次求职也已经拿到了offer。','旧结果不能套新申请'],
['H03-03','claim','作者已经向领导提出离职。','作者已经办理完离职手续，离开了公司。','提出与完成'],
['H02-10','claim','作者分析了题目的两种理解，没有明确叙述自己的offer被撤经历。','作者亲历公司撤销offer，随后索赔了一个月工资。','分析不是亲历'],
['H03-02','claim','作者计划在2028年7月1日辞职，片段没有说明目标已实现。','作者已经在2028年7月1日成功辞职。','未来目标'],
['H01-01','relation','客服面试和前台面试是两个不同工作机会。','客服面试和前台面试是同一个岗位申请的两个阶段。','独立事件'],
['H04-10','outcome','作者自述非全日制工程硕士已经毕业并拿到双证。','作者自述已经获得全日制工程硕士学位。','修饰语不能替换'],
['H01-03','claim','作者自述反复模拟练习后通过了这场面试，材料不能证明练习必然导致通过。','材料证明只要反复模拟练习，就一定能通过面试。','自述不等于因果保证']];
const candidates=[];
pairs.forEach(([id,type,good,bad,criterion],i)=>{const item=rows.find(r=>r.id===id),source=clauses(item.ContentText);for(const [text,expected]of[[good,'supported'],[bad,'unsupported']])candidates.push({id:`pair-${i+1}-${expected==='supported'?'a':'b'}`,sourceId:id,type,text,refs:[],expected,criterion});});
writeFileSync(new URL('./cases.json',import.meta.url),JSON.stringify({pairs:candidates,rawValidationIds:['H03-01','H03-07','H04-04'],rawCriteria:{'H03-01':'全文职业建议，不能当作者已离职事实','H03-07':'岗位前端转后端、强度变大是自述；两三个月后提离职是计划；未表明已辞职','H04-04':'作者自述在读新传并一战上岸可保留；大部分是建议/推广；不能把群学习上岸说成客观因果保证'},thresholds:{pairedFalseAcceptMax:0,pairedTrueAcceptMin:7,rawFalseAcceptMax:0,rawCorrectRejectionRateMax:0.2},note:'Eight authored contrast pairs plus unchanged v3 B extraction on three raw historical sources not used to tune this audit. Pair labels hidden from model. No retries or prompt updates.'},null,2));
