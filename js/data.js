/* ============================================================
 * 周末地狱 · 交稿倒计时 —— 静态数据
 * 所有数值规则来自工作区 basic.txt / 细节.txt
 * ============================================================ */
(function (root) {
  'use strict';

  var PAPERS = [
    {
      id: 'emd',
      name: '电动力学文献综述',
      short: '电动力学',
      icon: '⚡',
      req: 5000,
      accent: '#7c9cff',
      note: '字数要求：5000 字 '
    },
    {
      id: 'field',
      name: '实地考察报告',
      short: '考察报告',
      icon: '🏞️',
      req: 3000,
      accent: '#57d3a9',
      note: '字数要求：3000 字'
    },
    {
      id: 'comm',
      name: '《沟通与交流》课程论文',
      short: '沟通论文',
      icon: '🗣️',
      req: 3000,
      accent: '#c58cff',
      note: '字数要求：3000 字（水课论文，AI 率要求较松）'
    }
  ];

  /* 数模竞赛分工：自己挑一个，剩下两个由队友承担 */
  var ROLES = {
    A: {
      id: 'A', key: 'paper', name: '负责论文编写', icon: '📝',
      need: 30, diff: 60,
      desc: '把模型和结论写成一篇能看的论文。份额最少，难度中等。',
      tail: '队友接下代码与文献检查。'
    },
    B: {
      id: 'B', key: 'code', name: '负责代码、仿真与建模', icon: '💻',
      need: 26, diff: 78,
      desc: '跑仿真、拟合模型。份额最少，但最烧脑、推进最慢。',
      tail: '队友接下论文与文献检查。'
    },
    C: {
      id: 'C', key: 'research', name: '负责文献调研与检查', icon: '🔍',
      need: 44, diff: 48,
      desc: '查文献、给思路、检查论文模型和代码。份额最大，但相对容易。',
      tail: '队友接下论文与代码。'
    }
  };

  /* baseJ 为原文档数值；主行动在「标准模式」下会打折（见 engine MODES） */
  var ACTIONS = {
    paper_write: { name: '自己写论文', icon: '✍️', dur: 30, baseJ: 6, scaleJ: true, cat: 'paper',
      hint: '接着上一篇写，思路会更顺；写满百分之百后，进度和分数都不再增加。' },
    paper_ai: { name: '使用 AI 写论文', icon: '🤖', dur: 30, baseJ: 3, scaleJ: true, cat: 'paper',
      hint: '直接把整篇写完，分数和 AI 率都不确定；已经写满的论文不能再用。' },
    paper_revise: { name: '修改论文', icon: '🛠️', dur: 30, baseJ: 9, scaleJ: true, cat: 'paper',
      hint: '只提分数、降 AI 率，不增加字数；同一篇改得越多，单次效果越弱。' },
    math_work: { name: '推进自己的数模部分', icon: '🧮', dur: 30, baseJ: 6, scaleJ: true, cat: 'math',
      hint: '推进自己负责的那一块，进度和总体分一起上涨。' },
    math_meeting: { name: '开数模小组会', icon: '☕', dur: 30, baseJ: 6, scaleJ: true, cat: 'math',
      hint: '08:00–22:00 之间可开；能看到队友进度，并让他们当天多工作两小时；总体完成后改为加总分。' },
    attend: { name: '认真听课', icon: '📖', dur: 30, baseJ: 0, cat: 'class',
      hint: '只在有课时可用；把这段时间用来听课，什么也不做。' },
    rest: { name: '稍作休息', icon: '😌', dur: 60, baseJ: 0, cat: 'life',
      hint: '睡一小时；白天恢复更多，上课时恢复会打折扣。' },
    sleep_deep: { name: '短时深度睡眠', icon: '🛏️', dur: 240, baseJ: 0, cat: 'life',
      hint: '睡四小时；白天效果差一些。' },
    sleep_full: { name: '标准睡眠', icon: '💤', dur: 480, baseJ: 0, cat: 'life',
      hint: '睡八小时；白天睡不着。' },
    phone: { name: '玩会游戏', icon: '🎮', dur: 30, baseJ: 0, cat: 'life',
      hint: '玩半小时游戏，心情会好一点；连续玩更有效，但一小时内智力会下降。' },
    sports: { name: '去运动', icon: '🏃', dur: 60, baseJ: 9, cat: 'life',
      hint: '跑1小时步，健康加3，心情加5，精力减9。' },
    order_food: { name: '点外卖', icon: '🚚', dur: 0, baseJ: 0, cat: 'life',
      hint: '下单后大约一小时送到；太饱的时候吃不下。' },
    eat_takeout: { name: '吃外卖', icon: '🍱', dur: 30, baseJ: 0, cat: 'life',
      hint: '把外卖吃掉，饱食回满，健康减二。' },
    eat_canteen: { name: '去食堂吃饭', icon: '🍜', dur: 60, baseJ: 0, cat: 'life',
      hint: '去食堂吃1小时，健康加1，饱食回满。' },
    shop: { name: '去小店囤零食', icon: '🏪', dur: 30, baseJ: 2, cat: 'life',
      hint: '买两份零食，之后可以随时吃。' },
    snack: { name: '吃零食', icon: '🍫', dur: 0, baseJ: 0, cat: 'life',
      hint: '不花时间，饱食回一些，健康减一；上课时也能吃，但更容易被舍友要。' },
    shower: { name: '洗澡', icon: '🚿', dur: 30, baseJ: 0, cat: 'life',
      hint: '洗30分钟，干净回满，心情和精力也会好一点；每天只能洗1次。' }
  };

  var TIERS = {
    perfect: { id: 'perfect', name: '完美通关', short: '完美', rank: 3, color: '#ffd166' },
    good: { id: 'good', name: '良好通关', short: '良好', rank: 2, color: '#7ce7c4' },
    pass: { id: 'pass', name: '基本通关', short: '普通', rank: 1, color: '#8fb3ff' },
    fail: { id: 'fail', name: '未通关', short: '失败', rank: 0, color: '#ff7a8a' }
  };

  /* 目标数值：分数下限 / AI 率上限（百分数），数模总体分，健康下限 */
  var GOALS = {
    pass: {
      papers: { emd: { score: 70, ai: 30 }, field: { score: 65, ai: 30 }, comm: { score: 65, ai: 50 } },
      math: { progress: 100, score: 0 },
      health: 70
    },
    good: {
      papers: { emd: { score: 85, ai: 25 }, field: { score: 75, ai: 25 }, comm: { score: 75, ai: 40 } },
      math: { progress: 100, score: 60 },
      health: 82
    },
    perfect: {
      papers: { emd: { score: 95, ai: 20 }, field: { score: 85, ai: 20 }, comm: { score: 85, ai: 30 } },
      math: { progress: 100, score: 75 },
      health: 93
    }
  };

  var TEXTS = {
    title: 'DDLの追杀',
    subtitle: '交稿倒计时',
    tagline: '————在64小时内完成所有任务',
    story:
      '你是李华，今年20岁，某985高校的大二学生。周五晚上，你因为周末的到来熬夜打了整晚游戏，直到凌晨3点才睡。' +
      '早上迷迷糊糊醒来已经是10月26日周六早上8点，人依旧很困。你突然意识到，还有3篇论文没写：' +
      '1篇5000字的电动力学文献综述、1篇3000字的实地考察报告（资料已经在手）、1篇3000字的《沟通与交流》课程论文。' +
      '这些都被你拖到了下周一之前。更麻烦的是，你之前即兴地和2名陌生人临时组队参加了1个数学建模竞赛，彼此之间根本不认识，而且还是你当队长，今天开赛，同样下周一截止；' +
      '而下周一的上午和下午还都有课，更加挤压了为数不多的时间。',
    quote: '—— 面对自己因慵懒和贪玩而堆积如山的事，你能否很好地解决？',
    rules: [
      {
        icon: '⏱️',
        title: '时间与上课',
        body: '时间以30分钟为一格向前走。周六早上8点出发，周一23:59截止。' +
          '周一08:00–11:30、14:00–16:00要上课；这段时间你的效率降低50%，只能写论文、改论文、用AI、推进数模、玩游戏、稍作休息、吃零食或认真听课，' +
          '不能吃饭、睡觉、运动、洗澡、点外卖，也不能开数模小会。每上30分钟课，精力额外消耗4点。'
      },
      {
        icon: '🧠',
        title: '六项数值',
        body:
          '六项人物基本数值是：健康、精力、心情、饱食、干净、智力。所有行动都要消耗精力；' +
          '饱食每30分钟减少6点，睡觉或吃饭时每小时减少4点；干净每30分钟减少1点。数值跌到较低的水平，会持续损耗心情和健康。'
      },
      {
        icon: '📈',
        title: '效率与身体状态',
        body: '身体状态由健康、精力、心情和饱食共同决定。智力越高，做某些事越快。' +
          '行动卡上的数字是这一次行动的真实预估值，已经算进困倦、连续写作、心情好坏和小组会的影响。' +
          '具体怎么算，可以点击顶部的身体状态、智力或效率查看。'
      },
      {
        icon: '📄',
        title: '论文、AI与修改',
        body:
          '写论文会增加字数，进度等于已完成字数除以要求字数；写到100%就不再上涨。刚写完的论文分数不会太高，需要靠修改来提高；' +
          '同一篇论文每次修改，效果都会比上一次弱一些。' +
          'AI能直接把整篇写完，但分数和AI率都不确定，AI率越高，后面越难降下来。'
      },
      {
        icon: '🧮',
        title: '数模与队友',
        body:
          '第一次做数模是分工。你可以选择自己负责哪些部分，份额和难度各不相同，剩下的2块由2名队友承担。' +
          '2名队友每天各工作5小时，22:00–08:00不工作；你只需要推完自己那份。' +
          '开小组会（08:00–22:00）可以了解队友的进度、互相帮忙，并让他们当天多工作2小时；2个人都完成后，他们会一起帮你，你的数模效率将显著提高。' +
          '总体进度达到100%后，小组会改为直接增加数模总分。'
      },
      {
        icon: '🎯',
        title: '3档目标',
        body:
          '每篇论文都有分数下限和AI率上限；数模要求总体进度达到100%、总分达标；健康也不能太低。' +
          '3项都达到才算通关，而通关分为普通、良好、完美三个档。想要完美，几乎每小时都要花在合适的地方。'
      },
      {
        icon: '😟',
        title: '担忧',
        body: '只要还有论文没写到100%、或者数模总体没到100%，心情就会持续下降；越接近周一，下降得越快，睡觉时不生效。' +
          '具体数值可以点击顶部的「担忧」查看。'
      }
    ],
    balanceTitle: '关于数值与难度',
    balanceBody:
      '数值与事件来自 basic.txt / 细节.txt。' +
      '具体计算不写在说明里——在游戏顶部点击身体状态、智力、效率或担忧，就能看到当前的计算量和完整公式。',
    tips: [
      '精力是最先见底同时也是最关键的东西。',
      '心情在较高的值时效率会高一点，精力消耗也会低一点；但低心情也有相应惩罚。',
      '饱食低于10，心情和健康都会往下掉。上课时不能吃正餐，只能靠零食垫一垫，而且更容易被舍友要。',
      '外卖方便，但会掉2点健康；食堂加1点健康，只是要花时间，也有固定的开放时段。',
      '干净高于75会慢慢回心情和健康；低于20，健康也会开始受影响。',
      '想摆烂的时候，玩30分钟游戏或者睡1小时都能缓一缓；硬撑着继续，心情会掉，接下来1小时效率也低。',
      'AI写作像押注：分数和AI率都随机，结果好能冲高分，结果差就只能退而求其次。',
      '数模队友每天只干5小时，晚上不干活；小组会能让他们多干2小时，所以越早开始越好。'
    ]
  };

  root.DATA = {
    START: new Date(2024, 9, 26, 8, 0, 0).getTime(),
    DEADLINE: new Date(2024, 9, 28, 23, 59, 0).getTime(),
    PAPERS: PAPERS,
    ROLES: ROLES,
    ACTIONS: ACTIONS,
    TIERS: TIERS,
    GOALS: GOALS,
    TEXTS: TEXTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
