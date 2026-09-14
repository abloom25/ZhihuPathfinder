import json,hashlib
from pathlib import Path
p=Path(__file__).resolve().parent;run=Path((p/'latest-run.txt').read_text());protocol=json.load(open(run/'protocol.json'))
for f,h in protocol['hashes'].items():assert hashlib.sha256((p/f).read_bytes()).hexdigest()==h
pairs=json.load(open(run/'pairs.json'));raw=json.load(open(run/'raw.json'))
# Manual source-grounded labels fixed here after reading untouched extraction outputs;
# no further reviewer tuning or generation uses these labels.
labels={'H03-07':{'c1':('unsupported','只引用大概两三个月后，缺少计划动作，原文有动作但候选未收录'), 'c2':('unsupported','两个月后可以发年终是未来预期，不是已发生'), **{f'c{i}':('supported','原文工作经历上下文支持作者此项自述，不要求独立证实线下事实或给出精确日期') for i in range(3,11)}},'H04-04':{'c1':('supported','作者自述在读身份，非独立身份核验'),'c2':('supported','仅支持作者自述获取信息并考上，不支持普遍因果保证'),'c3':('supported','原文“现在免费分享给大家”支持作者正在分享的自述，不证明实际分发效果'),'r1':('supported','在读新传与一战上岸在同段经历语境中，候选未主张群消息客观导致成功')}}
items=[]
for r in raw:
 for a in r['audits']:
  expected,reason=labels[r['id']][a['candidate']['id']];accepted=a['decision']['action']=='retain_for_experiment'
  items.append({'sourceId':r['id'],'candidate':a['candidate'],'expected':expected,'manualReason':reason,'accepted':accepted,'action':a['decision']['action'],'modelVerdict':a['review'].get('value',{}).get('verdict'),'serviceError':a['review'].get('error'),'reviewReason':a['review'].get('value',{}).get('reason')})
good=[i for i in items if i['expected']=='supported'];bad=[i for i in items if i['expected']=='unsupported']
summary={'evaluationScope':'Offline review + local degradation. Same model in a separate stateless review call; not independent corroboration. Eight authored pairs, three raw sources. No automatic product output enabled.',
'paired':json.load(open(run/'paired-metrics.json')),
'raw':{'sourceCount':len(raw),'noCandidateSourceIds':[r['id'] for r in raw if not r['audits']],'candidateCount':len(items),'supportedCandidates':len(good),'unsupportedCandidates':len(bad),'correctAccepted':sum(i['accepted'] for i in good),'falseAccepted':sum(i['accepted'] for i in bad),'correctDowngraded':sum(not i['accepted'] for i in good),'correctDowngradedByService':sum(not i['accepted'] and bool(i['serviceError']) for i in good),'correctDowngradedBySemanticDecision':sum(not i['accepted'] and not i['serviceError'] for i in good),'correctRejectionRate':sum(not i['accepted'] for i in good)/len(good),'allAuditServiceFailures':sum(bool(i['serviceError']) for i in items)},
'items':items,'baselineCaveat':'The no-review baseline would retain all experimental candidates, not an already enabled product mode. The product has never automatically displayed these interpretations.',
'gateDecision':'do_not_enable_automatic_interpretation','reason':'Paired correct acceptance 6/8 is below 7/8; raw correct rejection is above 20%. Zero observed false accepts includes fallback on unavailable calls, and does not prove semantic reliability.',
'localDegradationEvidence':{'source':'H04-04','retainedIds':[c['id'] for c in raw[-1]['workspace']['retained']],'downgradedIds':[c['candidateId'] for c in raw[-1]['workspace']['downgraded']],'rawTextPreserved':raw[-1]['workspace']['rawText']==raw[-1]['extraction']['rawText']},
'limitations':['Small source-grounded manual evaluation by the assistant; not blinded independent annotation.','Reviewer explanation for pair-2-b falsely calls the old offer someone else’s experience despite correct rejection.','Same model errors may be correlated; agreement is not evidence of real-world truth.','Source self-reports are not independent verification of employment or identity.']}
(run/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k not in ['items','limitations']},ensure_ascii=False,indent=2))
