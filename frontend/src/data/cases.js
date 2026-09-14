// 关卡数据：以交接包「内容/核心5案例.json」「内容/补充2案例.json」「内容/关卡版本.json」
// 与 01-产品与内容冻结.md 为准。引文逐字保留（含作者原始表情/语气），不补年份、不补结局。

export const LEVEL_VERSION = 'waiting-week-20260914.1'

// 本关行动选项（01 文档第 2 节）。注意：补充案例里的 a/b/c/d 是公司代号，与此无关。
export const ACTIONS = [
  { id: 'A', label: '暂按原计划等待', sub: '把精力放回原有安排' },
  { id: 'B', label: '先了解进展', sub: '确认当前进展与预计反馈时间' },
  { id: 'C', label: '继续推进其他机会', sub: '例如准备和参加已有的其他面试' },
]

export const ACTIONS_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]))

// 早期处境仅使用 H02-01.p8 与 H02-01.p9（01 文档第 1 节）
export const EARLY = {
  quotes: [
    '一样，6.23，hr打电话过来，谈好薪资、所属部门、评级等，电话最后说要等提交审批流程，审批成功后会发offer',
    '到6.30还没收到任何消息，虽然中间有三天端午假期，但也过了三个工作日了。',
  ],
  author: 'justWiner',
  source: {
    url: 'https://www.zhihu.com/question/49022412/answer/1310402220?utm_medium=openapi_platform&utm_source=cf621feb3f2d',
    title: '面试通过,也谈好了薪资,hr说内部需要走审批流程,是录取了吧? - 知乎',
  },
  note: '按作者后来公开的记述编排，不是当年网页的历史版本；进入知乎原页可能会提前看到后续。',
}

export const CORE_CARDS = [
  {
    id: 'H02-01',
    suggestedAction: 'A',
    label: '等待后收到书面offer，最终入职未知',
    source: {
      url: 'https://www.zhihu.com/question/49022412/answer/1310402220?utm_medium=openapi_platform&utm_source=cf621feb3f2d',
      author: 'justWiner',
      title: '面试通过,也谈好了薪资,hr说内部需要走审批流程,是录取了吧? - 知乎',
      scope: '已保存API片段；作者自述未获现实独立查证；日期不补年份',
    },
    quotes: [
      { id: 'H02-01.p8', text: '一样，6.23，hr打电话过来，谈好薪资、所属部门、评级等，电话最后说要等提交审批流程，审批成功后会发offer' },
      { id: 'H02-01.p9', text: '到6.30还没收到任何消息，虽然中间有三天端午假期，但也过了三个工作日了。' },
      { id: 'H02-01.p6', text: '还愿来了，于6.30号晚11点收到书面邮件offer，等后续背景调查了！☺️☺️☺️' },
      { id: 'H02-01.p1', text: '2020-7-8' },
      { id: 'H02-01.p2', text: '这周开始背景调查了，同事已经接到背调电话，许愿背调通过！' },
    ],
    displayFacts: [
      '作者叙述6.23谈好条件后等待审批',
      '6.30晚收到书面offer；7.8更新背调开始',
    ],
    conditionDifferences: ['作者谈过薪资、部门、评级；不能套到仅一面后等待'],
    unknowns: ['等待期间是否主动询问/同时求职', '背调最终结果、实际入职'],
  },
  {
    id: 'L05-04',
    suggestedAction: 'B',
    label: '问过进度，后来收到offer',
    source: {
      url: 'https://www.zhihu.com/question/49022412/answer/2040264812706385925?utm_medium=openapi_platform&utm_source=cf621feb3f2d',
      author: '悟道',
      title: '面试通过,也谈好了薪资,hr说内部需要走审批流程,是录取了吧? - 知乎',
      scope: '已保存API片段；作者自述未获现实独立查证；日期不补年份',
    },
    quotes: [
      { id: 'L05-04.p7', text: '5.14中午询问期望薪资，晚上定好薪资' },
      { id: 'L05-04.p8', text: '5.15开启offer审批流程，说最快周一周二能收到' },
      { id: 'L05-04.p10', text: '5.18问了一下hr，反馈还在走流程中' },
      { id: 'L05-04.p11', text: '现在5.20了未收到offer,收到后来还愿！' },
      { id: 'L05-04.p2', text: '来还愿啦！一大早就收到offer啦，希望大家也能找到合适的工作！' },
      { id: 'L05-04.p1', text: '5.22更新：' },
    ],
    displayFacts: ['5.18询问HR，反馈仍在流程中', '5.20仍未收到；5.22更新收到offer'],
    conditionDifferences: ['已谈妥薪资并开启审批；早于或晚于对方预计时间的含义仅据原文字面'],
    unknowns: ['询问是否改变了审批速度', '实际入职、入职后情况'],
  },
  {
    id: 'L05-05',
    suggestedAction: 'B',
    label: '问到了审批进度，最终结果未写',
    source: {
      url: 'https://www.zhihu.com/question/49022412/answer/3549210053?utm_medium=openapi_platform&utm_source=cf621feb3f2d',
      author: '吧啦吧啦',
      title: '面试通过,也谈好了薪资,hr说内部需要走审批流程,是录取了吧? - 知乎',
      scope: '已保存API片段；作者自述未获现实独立查证；日期不补年份',
    },
    quotes: [
      { id: 'L05-05.p3', text: '26日谈妥薪资让我等offer，3到7天' },
      { id: 'L05-05.p4', text: '6天后的，次月2日问offer进度说用人部门审批完了，等hr 审批呢，有进度会来更新！' },
    ],
    displayFacts: ['作者在谈妥薪资后问进度', '返回片段称用人部门审批完、等HR审批'],
    conditionDifferences: ['对方曾说等3到7天；问进度在作者所述第6天'],
    unknowns: ['是否最终收到offer与实际入职'],
  },
  {
    id: 'L06-07',
    suggestedAction: 'B',
    label: '询问未获回复，后来收到未通过通知',
    source: {
      url: 'https://www.zhihu.com/question/28824325/answer/2074298463039312782?utm_medium=openapi_platform&utm_source=cf621feb3f2d',
      author: '酒菜',
      title: '等面试结果是一种什么样的体验? - 知乎',
      scope: '已保存API片段；作者自述未获现实独立查证；日期不补年份',
    },
    quotes: [
      { id: 'L06-07.p2', text: '这周三面试的，用人部门总监面试我，聊的还可以，指出我说话声音太平稳慵懒了。' },
      { id: 'L06-07.p3', text: '结束后说等待两三天与我联系，也有可能会转岗，至少我是有开发背景优势的' },
      { id: 'L06-07.p4', text: '等到周五联系hr没有回复我😭有点小紧张' },
      { id: 'L06-07.p5', text: '希望下周能有一个好结果www' },
      { id: 'L06-07.p6', text: '8.23更新:' },
      { id: 'L06-07.p7', text: '不用等下周了，周日突然给我发了面试未通过，继续找吧^_^😭' },
    ],
    displayFacts: ['作者周五联系HR没有回复', '后来更新周日收到面试未通过通知'],
    conditionDifferences: ['此前仍可能转岗；未记载谈薪审批，与已谈妥条件者不同'],
    unknowns: ['不通过原因', '联系与拒绝之间的因果'],
  },
  {
    id: 'L06-04',
    suggestedAction: 'C',
    label: '等待E时准备并面试D，后来重新获得D终面机会',
    source: {
      url: 'https://www.zhihu.com/question/28824325/answer/2073177548771554138?utm_medium=openapi_platform&utm_source=cf621feb3f2d',
      author: '叕尔咖玊',
      title: '等面试结果是一种什么样的体验? - 知乎',
      scope: '已保存API片段；作者自述未获现实独立查证；日期不补年份',
    },
    quotes: [
      { id: 'L06-04.p3', text: '还是先说E吧，7.21一面，当时他们应该是约了十几个候选人，车轮面差不多一整天，我被安排在下午三点二十，面的过程问完就让我下，我自己硬争取了我的提问环节。7.24通知一面通过，但是领导在开会，二面要等，最后是7.29面试官到西安出差，酒店会议室面试，据HR说应该是约了几个人，但是我面完就走了，没碰到。7.30HR说领导还没反馈，但是可以先谈一下薪资，然后说了我上图中回答说的那些话，就不想去了，然后也没跟进，期间准备D公司面试；8.3HR突然联系说申请给我涨薪2000，E先说到这里。' },
      { id: 'L06-04.p4', text: 'D是猎头推的岗位，7.24联系的我，7.29简历筛选通过，面试约的7.31线上，面试前做了一下功课，从产品线相关性到公司研发实力，都是五个中最好，出于长远发展我最青睐，结果越看好越想拿下就越容易紧张吧，反问环节事先想了好几个问题，问了两个突然脑子一片空白，就说我没有别的问题了。面试完猎头问感觉咋样，我说感觉没有之前面试其他公司发挥好，猎头就说她去帮我跟进，没过几个小时就反馈说那边暂缓推进了，原因也说了:担心市场合规经验不足，但是我不太认可，那我去年费控系统每次申报时被总部2财务+2合规经理折磨不算经验算什么？算我活该吗？但是也没办法面试没怎么提及这个问题，也是我没发挥出优势，接着就到周末两天，心里一直想着这个事，我就暗暗想好周一无论如何我要澄清这个误解，虽然这次没面试上，以后万一有机会，因为这次给我拉黑了多不值，还好发面试通知时HR加了我微信，我就发了一大段话对情况做了一个补充说明，这天E公司加了2000我又觉得可以考虑了，准备接offer' },
      { id: 'L06-04.p5', text: '结果到了8.7周五上午猎头突然打电话，问我是不是联系HR了，说了什么，我就如实相告了，猎头说天呐，你又进终面了，你咋这么厉害，我说我又死灰复燃啦？' },
      { id: 'L06-04.p6', text: '猎头就说你发的时候想过没，我说我真没想过，因为已经被拒了，我就想着留条后路，然后下午HR再次联系我，沟通了终面内容，需要根据提供的产品资料自己做ppt并模拟产品培训。' },
      { id: 'L06-04.p7', text: '这个时候E的offer已经收到了，8.9入职，我就跟猎头说了，猎头说没事你该入职入职，这边你也准备着，终试时间预留出来，到时候通过了你再离职，不影响，如果没通过，也不影响你，肯定还是希望你通过。' },
    ],
    displayFacts: [
      '等待E反馈期间准备D，并参加D面试',
      'D暂缓推进后，作者向D的HR补充说明；后来获D终面安排',
      'E的offer已收到，原文提8.9入职安排；D最终录用未写',
    ],
    conditionDifferences: [
      '同一作者同时推进C/D/E；D的转机包含补充工作经验说明，不能当普通问进度',
      '证据支持继续面试已有机会，不足以证明新增投递',
    ],
    unknowns: ['D最终录用与实际入职', 'E是否实际完成入职', '补充说明是否单独导致终面机会'],
  },
]

// 补充区「如果还有别的机会在等你」：suggestedAction 为 null，不是行动推荐，不参与胜率。
export const SUPPLEMENT_CARDS = [
  {
    id: 'E03-01',
    suggestedAction: null,
    label: '签约期限陆续到来，作者拒绝两个机会后继续询问',
    source: {
      url: 'https://www.zhihu.com/question/358495961/answer/2332543568',
      author: '作者名未返回',
      title: '作为应届生的你,为何拒绝了华为的offer? - 知乎',
      scope: '核对了API片段与引文；未取得作者确认或现实独立查证；空作者名不推断匿名身份，不跨来源合并',
    },
    quotes: [
      { id: 'E03-01.q1', text: '拿到offer得签约啊，签约有时限的，我自己仍然想等华为(下面称呼h)' },
      { id: 'E03-01.q2', text: 'a公司的工资是每月(h+0.5k)，不过三方时间到了，我拒了；b公司的是(h+1k)，时间到了也只好拒了...' },
      { id: 'E03-01.q3', text: '终于当c公司(工资h-1k)也要过期时，我联系华为hr' },
      { id: 'E03-01.q4', text: '华为hr安抚我，同时也说她要摸个底，问我拿了哪些offer工资怎么样，说尽快催' },
    ],
    displayFacts: [
      '作者在等待心仪公司的过程中，另有a、b、c、d四家意向offer',
      '作者记述a、b的三方期限先后到来，自己拒绝了这两个机会',
      'c的期限也临近时，作者联系了心仪公司的HR；对方表示会催促',
    ],
    conditionDifferences: [
      '这是校招意向offer与三方签约期限的处境，不能直接套到社招书面offer',
      'a/b/c/d是原文中的公司代号，不是本关A/B/C行动选项',
    ],
    unknowns: [
      '确切截止日期',
      'HR催促后的进展',
      '作者最后接受哪家公司及实际入职',
      '标题提到的拒绝不能代替片段中缺失的最终经过',
    ],
  },
  {
    id: 'E03-02',
    suggestedAction: null,
    label: '拒绝A、等待B审批期间，继续面试并收到C的offer',
    source: {
      url: 'https://www.zhihu.com/question/604406910/answer/1923180676913558835',
      author: '作者名未返回',
      title: '匿名说一下你最近的烦恼吧? - 知乎',
      scope: '核对了API片段与引文；未取得作者确认或现实独立查证；空作者名不推断匿名身份，不跨来源合并',
    },
    quotes: [
      { id: 'E03-02.q1', text: '2025.09.12 更新：' },
      { id: 'E03-02.q2', text: '之前说的A、B公司，我当时是已经拒绝了A公司，选择了B公司。' },
      { id: 'E03-02.q3', text: '但万万没想到B公司的流程审批竟然能卡2个月，至今还卡在集团审批，流程显示还在offer池，待发放。' },
      { id: 'E03-02.q4', text: '问HR是否还在正常推进，回答：正常推进；' },
      { id: 'E03-02.q5', text: '问流程卡审批的原因，回答：不清楚，我们也在催促。' },
      { id: 'E03-02.q6', text: '但这期间也因为发现B公司不靠谱，所以也在继续面试，8月底收到了一家还不错的offer，C公司，制造业的头部公司，32k，年终1-6个月。' },
    ],
    displayFacts: [
      '作者自述拒绝A公司、选择B公司，B的审批等待了两个月',
      '作者询问B公司HR，对方表示仍正常推进，但原因不清楚',
      '等待期间作者继续面试，并记述8月底收到C公司的offer',
    ],
    conditionDifferences: [
      '这里的A/B/C是三家公司，不是本关行动选项',
      '原文未写A公司的明确回复截止时间；此例补充机会冲突，不能充当延期协商成功案例',
      '只保留作者本人这段求职，排除前同事、伴侣及评论者的经历',
    ],
    unknowns: ['B公司最终是否发出offer', '作者是否实际入职C公司', 'A公司是否仍可重新联系', '哪些行动导致了结果变化'],
  },
]

export const ALL_CARDS = [...CORE_CARDS, ...SUPPLEMENT_CARDS]

/** 在核心+补充并集中查找所选引文（保存时所需，01 文档集成要点） */
export function findQuote(quoteId) {
  if (!quoteId) return null
  for (const card of ALL_CARDS) {
    const quote = card.quotes.find((q) => q.id === quoteId)
    if (quote) return { card, quote }
  }
  return null
}

// ---- 固定辅助（01 文档第 4 节 + 固定辅助原始规则.json） ----

export const COMPANION_LABEL = '固定案例对照 · 当前不提供实时 AI 判断'

export function contextAdvice(kind) {
  switch (kind) {
    case 'deadline':
      return '先按你明确给出的答复期限安排。若想保留比较空间，可以如实询问能否调整期限、等待中的流程何时有反馈；是否能调整仍未知。你填写的时间会按原话保留；没有反馈时，再结合自己的期限决定下一步。'
    case 'interview':
      return '如果另一个面试仍值得参加，可以先准备它，同时把原来的等待保留为未决。参加面试不代表一定拿到 offer。'
    case 'no-contact':
      return '你可以暂时不再询问，把精力放回自己的安排。有新消息时再判断；不询问也不代表已被拒绝。'
    default:
      return '这份补充可以和你的选择一起保留。当前没有针对任意文字生成个性化判断；先比较案例中哪些条件与你相同、哪些不同。'
  }
}

export const DEADLINE_SUPPLEMENT_NOTE = '下面是相关处境；现有材料不能判断你的延期是否会获准。'

export const POSSIBILITIES_TEXT = [
  '问过 HR，后来也可能走向不同。下面分别有收到 offer、仍在审批，以及被告知未通过的记述；它们不是按发生概率抽样。',
  '继续推进其他机会的案例只到新的面试安排。还不知道的地方，留给真实的后来。',
]

// 提出反驳的固定演示（参考实现 corrections）
export const CORRECTIONS = [
  {
    title: '收到 offer，哪些仍然未知？',
    text: '收到书面 offer、开始背调、通过背调和实际入职是不同状态。justWiner 的片段支持 6 月 30 日收到书面 offer、7 月 8 日更新背调开始；最终背调和入职结果未写。',
  },
  {
    title: '终面机会，不是最终入职',
    text: 'D 公司重新给了终面安排；E 公司已经发来 offer，文中提到 8 月 9 日入职的安排。片段没有确认实际入职，D、E 的状态分别保留。',
  },
  {
    title: '有先后，不等于有因果',
    text: '悟道在 5 月 18 日问进度，5 月 22 日更新收到 offer。酒菜问后没有回复，后来被告知未通过。这些记述都不能证明询问造成了结果，也不能拿来计算你的胜率。',
  },
]

export const FREE_TEXT_NOTE = '自由文字尚未自动核验；你的反驳不会被当成已证实的事实。'
