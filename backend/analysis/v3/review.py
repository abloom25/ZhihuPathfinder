"""Source-grounded review of the frozen run. No model calls or prompt changes."""
import json
from pathlib import Path
p=Path(__file__).resolve().parent;run=Path((p/'latest-run.txt').read_text());rows=json.load(open(run/'results.json'))
# Explicit lists below record the assistant's manual reading of each retained quote and its context.
useful={
'H01-01:a':'c2 c4 c5','H01-01:b':'c3 c5 c6',
'H02-05:a':'c2 c3 c6 c7','H02-05:b':'c1 c2 c4 c5 c6 c7 c8 c9',
'H02-10:a':'','H02-10:b':'',
'H03-02:a':'c4 c8 c10','H03-02:b':'c1 c2 c5 c9 c10',
'H03-06:a':'','H03-06:b':'',
'H04-10:a':'c1 c2 c3 c5 c6 c7','H04-10:b':'c1 c3 c4 c5 c6 c7 c8 c9',
'H01-10:a':'c1 c2 c3 c4 c5 c6 c7 c8 c9 c10','H01-10:b':'c2 c3 c4 c5 c6 c7 c8 c9 c10',
'H03-03:a':'c1 c4 c7 c8 c9','H03-03:b':'c1 c3 c4 c6 c7 c8',
'H04-08:a':'c1 c2 c4 c5 c10','H04-08:b':'c1 c2 c3 c5 c6 c7 c8 c9 c10',
'H01-04:a':'c3','H01-04:b':''}
unsupported={
'H01-01:b':{'c7':'只有“面试结果：”标题，不构成已发生事实'},
'H03-02:a':{'c6':'辞职后找不到工作的预测被标occurred','c9':'2028年毕业是未来预期，被标occurred'},
'H03-02:b':{'c6':'主要为母亲的愿望和经历，不应当成作者自身已发生变化'},
'H04-10:a':{'c4':'“想象一下我的状态”没有给出实际状态或变化'},
'H04-08:a':{'c6':'只有“结果”连接词','c7':'只有日期，未提取准备复试动作','c8':'只有日期，未提取复试动作','c9':'只有日期，未提取学校出结果动作'},
'H01-04:b':{'c3':'“做招聘工作的时候”是未完成的背景从句，漏掉实际习惯'}
}
uncertain={
'H01-01:b':{'c4':'来源为对方的条件性上班安排，不能据此确认作者意愿，未被当已入职'},
'H02-05:a':{'c1':'一个occurred条目同时包含面试事实和“非常想去”意愿'},
'H03-02:a':{'c1':'标题式日期和倒计时，独立事实含义有限'},
'H03-02:b':{'c7':'估计年度消费与假设家庭消费混在一个occurred条目，保留估算语气但类别不精确'},
'H01-10:b':{'c1':'单独“果断不管了”缺少放弃的对象，需读context才完整'}
}
badRelations={
'H01-01:a':{'c2|c4':'不同工作机会被判same_event'},
'H04-10:b':{'c3|c9':'读研经历和当年考上后写回顾不支持新的独立机会','c9|c10':'回顾中十年前夜班不属于同一次考研事件'},
'H01-10:a':{'c1|c2':'一次学习调整被判独立事件','c2|c3':'学习不同内容本身不足以确立新经历'}
}
uncertainRelations={'H01-01:a':{'c1|c2':'总述求职的条目范围过宽','c1|c4':'总述求职不能充当两次面试合并的证据'}}
badRelations={k:{'|'.join(sorted(pair.split('|'))):reason for pair,reason in values.items()} for k,values in badRelations.items()}
uncertainRelations={k:{'|'.join(sorted(pair.split('|'))):reason for pair,reason in values.items()} for k,values in uncertainRelations.items()}
records=[];totals={v:{'runs':0,'retained':0,'supported':0,'unsupported':0,'uncertain':0,'usefulClaims':0,'casesWithUsefulClaims':0,'validationCasesWithUsefulClaims':0,'correctNonPersonalCases':0,'retainedRelations':0,'unsupportedRelations':0,'uncertainRelations':0,'pendingClaims':0,'excludedClaims':0} for v in ['a','b']}
for row in rows:
 key=row['id']+':'+row['variant'];stats=totals[row['variant']];stats['runs']+=1
 used=set(useful[key].split());claims=[]
 for c in row['claims']['kept']:
  cid=c['id'];reason=unsupported.get(key,{}).get(cid) or uncertain.get(key,{}).get(cid)
  verdict='unsupported' if cid in unsupported.get(key,{}) else 'uncertain' if cid in uncertain.get(key,{}) else 'supported'
  assert cid not in used or verdict=='supported'
  claims.append({'id':cid,'verdict':verdict,'useful':cid in used,'reason':reason or '对照所引原文及context，支持该亲历/模态分类；不验证现实真伪','evidence':c['evidence']})
  stats['retained']+=1;stats[verdict]+=1;stats['usefulClaims']+=cid in used
 assert used <= {c['id'] for c in claims}
 stats['casesWithUsefulClaims']+=bool(used)
 stats['validationCasesWithUsefulClaims']+=bool(used) and row['set']=='validation'
 stats['correctNonPersonalCases']+=row['id'] in ['H02-10','H03-06'] and len(row['claims']['kept'])==0
 stats['pendingClaims']+=len(row['claims']['pending']);stats['excludedClaims']+=len(row['claims']['excluded'])
 relations=[];validIDs={c['id'] for c in claims if c['verdict']=='supported'}
 for r in row.get('relations',{}).get('kept',[]):
  pair='|'.join(sorted([r['left'],r['right']]))
  reason=badRelations.get(key,{}).get(pair);verdict='unsupported' if reason else 'supported'
  if not reason and (r['left'] not in validIDs or r['right'] not in validIDs):verdict='uncertain';reason='端点条目本身未获支持，关系不能确认'
  if not reason and pair in uncertainRelations.get(key,{}):verdict='uncertain';reason=uncertainRelations[key][pair]
  relations.append({'pair':pair,'relation':r['relation'],'verdict':verdict,'reason':reason or '所引条目和原文上下文支持此关系'})
  stats['retainedRelations']+=1;stats['unsupportedRelations']+=verdict=='unsupported';stats['uncertainRelations']+=verdict=='uncertain'
 records.append({'id':row['id'],'variant':row['variant'],'set':row['set'],'claims':claims,'relations':relations})
report={'reviewType':'assistant manual source-grounded review; non-blinded; one paired trial, no statistical significance claim','totals':totals,'records':records,'observedRecallFailures':['H02-05 A把原文中作者口头offer和已拿offer两项错误分为other并排除。','H01-04 B未提取每日刷新职位的关键自述习惯。','两种提示对H01-10均未给出完整的三家公司之间的独立事件关系，不能用事实有用替代拆分覆盖率。'],'sharedLimitations':['已有实际状态与愿望混在同条时仍会整条待核对，例如提出离职后的平静与期待。原文仍保留，未宣称所有粒度问题解决。','B中选目标院校被modal关键词影响；类别校验仍有过严情况。','真实关系判断仍有误合并和过拆；人工核对结果不代表自动流程已修复。']}
(run/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(totals,ensure_ascii=False,indent=2))
