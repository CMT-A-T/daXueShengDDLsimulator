/* ============================================================
 * 周末地狱 · 交稿倒计时 —— 规则引擎（无 DOM 依赖）
 * 时间/数值/公式全部来自 basic.txt，缺符号处按常规补全（见 README）
 * ============================================================ */
(function (root) {
  'use strict';

  var D = root.DATA;
  var MIN = 60000;
  var START = D.START;
  var DEADLINE = D.DEADLINE;

  var CLASS_WINDOWS = [
    [new Date(2024, 9, 28, 8, 0, 0).getTime(), new Date(2024, 9, 28, 11, 30, 0).getTime()],
    [new Date(2024, 9, 28, 14, 0, 0).getTime(), new Date(2024, 9, 28, 16, 0, 0).getTime()]
  ];
  var CLASS_J = 6; // 每 30 分钟

  /* 标准模式做两处平衡校准；原版模式保留文档原值 */
  var MODES = {
    std: {
      id: 'std', name: '简单模式', progress: 1.2, jCost: 0.8,
      note: '即使有着堆积如山的事情要做，你依然怀着热情、保持较高的效率面对这几天。'
    },
    raw: {
      id: 'raw', name: '标准模式', progress: 1.0, jCost: 1.0,
      note: '“...我什么时候又有这些作业了？”'
    }
  };

  /* ---------------- 小工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function hourOf(t) { return new Date(t).getHours(); }
  function monthDay(t) { var d = new Date(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function weekday(t) { return '日一二三四五六'[new Date(t).getDay()]; }
  function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function paperDef(id) {
    for (var i = 0; i < D.PAPERS.length; i++) if (D.PAPERS[i].id === id) return D.PAPERS[i];
    return null;
  }
  function paperOf(S, id) {
    for (var i = 0; i < S.papers.length; i++) if (S.papers[i].id === id) return S.papers[i];
    return null;
  }
  function modeCfg(S) { return MODES[S.mode] || MODES.std; }
  function progressOf(p) { var def = paperDef(p.id); return Math.min(1, p.words / def.req); }

  /* ---------------- 派生数值 ---------------- */
  function bodyMod(S) {
    var s = S.stats;
    return clamp(1.2 * (4 * s.H + 2 * s.J + 3 * s.X + s.B) / 1000, 0, 1.2);
  }
  function intelPenalty(S) {
    var st = S.stats;
    if (!st.phoneStacks) return S.time < st.phonePenaltyUntil ? st.phonePenalty : 0;
    var sum = 0;
    for (var i = 0; i < st.phoneStacks.length; i++) {
      if (st.phoneStacks[i].until > S.time) sum += st.phoneStacks[i].amount;
    }
    return Math.min(24, sum);
  }
  function intelMod(S) {
    return clamp((S.stats.intel - intelPenalty(S)) / 60, 0.2, 2);
  }
  function moodCostMod(S) {
    var x = S.stats.X;
    if (x > 85) return 0.9;
    if (x < 30) return 1.2;
    return 1;
  }
  function moodGainMod(S) {
    var x = S.stats.X;
    if (x > 85) return 1.1;
    if (x < 30) return 0.8;
    return 1;
  }
  function jCost(S, id) {
    var a = D.ACTIONS[id];
    if (!a) return 0;
    var j = a.baseJ || 0;
    if (a.scaleJ) j = j * modeCfg(S).jCost;
    j = j * moodCostMod(S);
    return Math.max(0, Math.round(j));
  }

  function effFor(S, kind, paperId) {
    var list = [];
    var m = 1;
    var s = S.stats;
    if (S.drowsy) { m -= 0.15; list.push({ label: '困倦', delta: -0.15 }); }
    if (s.J > 70) { m += 0.10; list.push({ label: '精力充沛', delta: 0.10 }); }
    if (s.J < 20) { m -= 0.20; list.push({ label: '力竭', delta: -0.20 }); }
    if (s.X > 85) { m += 0.10; list.push({ label: '心情良好', delta: 0.10 }); }
    if (s.X < 30) { m -= 0.20; list.push({ label: '压力山大', delta: -0.20 }); }
    if (inClassAt(S.time) && kind !== 'life') { m -= 0.50; list.push({ label: '正在上课', delta: -0.50 }); }
    if (kind === 'paper' && paperId && S.comboPaper === paperId) {
      m += 0.20; list.push({ label: '连续写作', delta: 0.20 });
    }
    if (S.flags.slackUntil > S.time) { m -= 0.10; list.push({ label: '硬撑着', delta: -0.10 }); }
    if (kind === 'math' && bothMatesDone(S)) {
      m += 0.40; list.push({ label: '队友来帮忙', delta: 0.40 });
    }
    for (var i = 0; i < S.buffs.length; i++) {
      var b = S.buffs[i];
      var scopeOk = !b.scope || b.scope === 'all' || b.scope === kind;
      if (scopeOk && b.eff) { m += b.eff; list.push({ label: b.label, delta: b.eff }); }
    }
    return { value: Math.max(0.1, m), list: list };
  }
  function scoreBuff(S, kind) {
    var m = 1;
    for (var i = 0; i < S.buffs.length; i++) {
      var b = S.buffs[i];
      var scopeOk = !b.scope || b.scope === 'all' || b.scope === kind;
      if (scopeOk && b.score) m += b.score;
    }
    return Math.max(0, m);
  }

  function dayNumber(S) {
    var d0 = new Date(START); d0.setHours(0, 0, 0, 0);
    var d1 = new Date(S.time); d1.setHours(0, 0, 0, 0);
    return Math.max(1, Math.floor((d1 - d0) / (24 * 60 * 60 * 1000)) + 1);
  }

  function worryInfo(S) {
    var paperRem = 0;
    for (var i = 0; i < S.papers.length; i++) paperRem += 1 - progressOf(S.papers[i]);
    paperRem = paperRem / Math.max(1, S.papers.length);
    var mathRem = 1 - Math.min(1, teamProgress(S) / 100);
    var index = (paperRem + 2 * mathRem) / 3;
    var day = dayNumber(S);
    return { rate: 1.2 * day * index, day: day, paperRem: paperRem, mathRem: mathRem, index: index };
  }

  function teamProgress(S) {
    if (!S.math.started) return 0;
    var t = Math.min(S.math.myProg, S.math.share);
    for (var i = 0; i < S.math.mates.length; i++) {
      var m = S.math.mates[i];
      t += Math.min(m.prog, m.share);
    }
    return clamp(t, 0, 100);
  }
  function mathComplete(S) { return S.math.started && teamProgress(S) >= 99.999; }
  function bothMatesDone(S) {
    if (!S.math.started) return false;
    for (var i = 0; i < S.math.mates.length; i++) {
      if (S.math.mates[i].prog < S.math.mates[i].share - 1e-9) return false;
    }
    return true;
  }

  function mateEff(m) {
    var v = 1 + (m.perm || 0);
    for (var i = 0; i < m.buffs.length; i++) v += (m.buffs[i].eff || 0);
    return Math.max(0.2, v);
  }
  function mateScore(m) {
    var v = 1;
    for (var i = 0; i < m.buffs.length; i++) v += (m.buffs[i].score || 0);
    return Math.max(0, v);
  }

  /* ---------------- 日志 ---------------- */
  function pushLog(S, text, kind) {
    S.log.unshift({ t: S.time, text: text, kind: kind || 'info' });
    if (S.log.length > 160) S.log.length = 160;
  }

  /* ---------------- 状态 ---------------- */
  function mkMate(name) {
    return {
      name: name, intel: randi(60, 80), share: 0, diff: 60, prog: 0,
      credits: 0, carry: 0, dayKey: '', buffs: [], perm: 0, known: 'none', done: false,
      estLow: 0, estHigh: 0
    };
  }

  function newState(modeKey) {
    var key = (modeKey === 'raw') ? 'raw' : 'std';
    var S = {
      v: 6, mode: key, time: START, ended: false, endReason: '',
      stats: { H: 75, J: 55, X: 45, B: 40, C: 85, intel: 82, phonePenalty: 0, phonePenaltyUntil: 0, phoneStacks: [] },
      papers: D.PAPERS.map(function (p) { return { id: p.id, words: 0, score: 0, ai: 0, revs: 0 }; }),
      math: {
        role: null, started: false, myProg: 0, share: 0, diff: 0, score: 0, meetings: 0, scoreMeetings: 0,
        revealed: false, lastAsk: START,
        mates: [mkMate('阿哲'), mkMate('小周')],
        flags: { honestDebt: false, exaggerateDebt: false }
      },
      comboPaper: null,
      lastAction: null,
      drowsy: true,
      restDay: dayKey(START), restMin: 0,
      showerDay: null,
      snacks: 0,
      delivery: null,
      buffs: [],
      queue: [],
      log: [],
      flags: { slackUntil: 0, takeoutFactor: 1, classes: {} },
      stats2: { actions: 0, phones: 0, sleeps: 0, foodLost: 0, slack: 0 }
    };
    pushLog(S, '周六早上8点。闹钟响过三遍，你终于坐了起来——还有64小时。', 'story');
    pushLog(S, '三篇论文、一场数模，周一几乎全天都有课。你得先决定，从哪里开始。', 'story');
    return S;
  }

  /* ---------------- 时间 ---------------- */
  function inClassAt(t) {
    for (var i = 0; i < CLASS_WINDOWS.length; i++) {
      if (t >= CLASS_WINDOWS[i][0] && t < CLASS_WINDOWS[i][1]) return true;
    }
    return false;
  }
  function overlapsClass(start, end) {
    for (var i = 0; i < CLASS_WINDOWS.length; i++) {
      if (start < CLASS_WINDOWS[i][1] && end > CLASS_WINDOWS[i][0]) return true;
    }
    return false;
  }
  function isDaytime(t) { var h = hourOf(t); return h >= 8 && h < 18; }
  function isNightForSleep(t) { var h = hourOf(t); return h >= 20 || h < 8; }
  function inCanteen(t) {
    var d = new Date(t), h = d.getHours(), m = d.getMinutes();
    var v = h + m / 60;
    return (v >= 6 && v < 9) || (v >= 11 && v < 13.5) || (v >= 17 && v < 19);
  }
  function inTakeout(t) { var h = hourOf(t); return h >= 6 && h < 22; }

  /* ---------------- 时间推进 ---------------- */
  function tickPassive(S, mode) {
    mode = mode || {};
    var s = S.stats;
    var resting = mode.sleeping || mode.eating;
    s.B -= resting ? 2 : 6;
    s.C -= 1;
    if (S.drowsy) s.X -= 1;
    if (s.J < 20) { s.X -= 2; s.H -= 1; }
    if (s.X > 85) s.H += 1 / 12;            // H +1 / 6h
    if (s.X < 30) s.H -= 1 / 8;             // H -1 / 4h
    if (s.C > 75) { s.X += 0.5; s.H += 0.05; } // X +1/4h, H +1/10h
    if (s.C < 20) { s.X -= 1; s.H -= 1 / 8; }  // X -2/h, H -1/4h
    if (s.C < 40) s.X -= 0.5;               // X -1/h（与上面的肮脏叠加）
    if (s.B < 30) s.X -= 0.5;               // X -1/h
    if (s.B < 10) { s.X -= 2; s.H -= 1 / 12; } // X -4/h, H -1/h
    if (s.B > 70) { s.X += 0.5; s.J += 1; }  // X +1/h, J +1/30min
    if (!mode.sleeping) s.X -= worryInfo(S).rate / 2; // 担忧：睡觉时不生效
    s.H = clamp(s.H, 0, 100); s.J = clamp(s.J, 0, 100); s.X = clamp(s.X, 0, 100);
    s.B = clamp(s.B, 0, 100); s.C = clamp(s.C, 0, 100);
  }

  function tickBuffs(S) {
    var keep = [];
    for (var i = 0; i < S.buffs.length; i++) if (S.buffs[i].until > S.time) keep.push(S.buffs[i]);
    S.buffs = keep;
    for (var j = 0; j < S.math.mates.length; j++) {
      var m = S.math.mates[j], mk = [];
      for (var k = 0; k < m.buffs.length; k++) if (m.buffs[k].until > S.time) mk.push(m.buffs[k]);
      m.buffs = mk;
    }
  }

  function matesTick(S) {
    if (!S.math.started || S.ended) return;
    var dk = dayKey(S.time);
    var h = hourOf(S.time);
    var offHours = (h >= 22 || h < 8); // 22:00-08:00 队友不工作
    for (var i = 0; i < S.math.mates.length; i++) {
      var m = S.math.mates[i];
      if (m.prog >= m.share - 1e-9) continue;
      if (m.dayKey !== dk) { m.dayKey = dk; m.credits = 10 + (m.carry || 0); m.carry = 0; } // 一天 5 小时
      if (m.credits <= 0) continue;
      if (offHours) continue;
      m.credits--;
      var ratio = m.intel / m.diff;
      var delta = 0.007 * ratio * mateEff(m) * modeCfg(S).progress;
      m.prog = Math.min(m.share, m.prog + delta * 100);
      S.math.score = Math.min(100, S.math.score + delta * ratio * 60 * mateScore(m));
      if (!m.done && m.prog >= m.share - 1e-9) {
        m.done = true;
        pushLog(S, m.name + ' 完成了自己负责的那部分（' + r1(m.share) + '%）。', 'math');
        if (bothMatesDone(S)) pushLog(S, '两个人都完成了，接下来会一起帮你，你的数模效率提高四成。', 'good');
      }
    }
  }

  function maybeRandomAsk(S) {
    if (!S.math.started || S.ended) return;
    if (S.math.flags.noAsk) return;
    if (S.math.myProg >= S.math.share - 1e-9) return;
    if (!isDaytime(S.time)) return;
    if (S.time - (S.math.lastAsk || 0) < 6 * 60 * MIN) return;
    if (Math.random() < 0.04) {
      S.math.lastAsk = S.time;
      S.queue.push({ type: 'mateAsk' });
    }
  }

  function tickDelivery(S) {    var d = S.delivery;
    if (!d || d.arrived || d.stolen) return;
    if (S.time >= d.arriveAt) {
      if (Math.random() < 0.10) {
        d.stolen = true;
        S.stats.X = clamp(S.stats.X - 8, 0, 100);
        S.stats2.foodLost++;
        pushLog(S, '外卖柜里没有你的外卖。你愣了一下，心情减8。', 'warn');
        S.queue.push({ type: 'foodLost' });
      } else {
        d.arrived = true;
        pushLog(S, '外卖到了，还是热的。', 'good');
      }
    }
  }

  function spend(S, minutes, opts) {
    opts = opts || {};
    var chunks = Math.round(minutes / 30);
    for (var i = 0; i < chunks; i++) {
      var wasInClass = inClassAt(S.time);
      S.time += 30 * MIN;
      if (wasInClass) S.stats.J = clamp(S.stats.J - 4, 0, 100); // 上课额外消耗
      if (opts.onChunk) opts.onChunk(S, i);
      tickPassive(S, { sleeping: !!opts.sleeping, eating: !!opts.eating });
      matesTick(S);
      maybeRandomAsk(S);
      tickBuffs(S);
      tickDelivery(S);
      if (S.time >= DEADLINE) {
        S.time = DEADLINE;
        S.ended = true;
        S.endReason = 'deadline';
        break;
      }
    }
    if (S.time >= S.stats.phonePenaltyUntil) S.stats.phonePenalty = 0;
  }

  /* ---------------- 可用性 ---------------- */
  function isMainAction(id) {
    return id === 'paper_write' || id === 'paper_ai' || id === 'paper_revise' || id === 'math_work';
  }

  var CLASS_ALLOWED = {
    paper_write: 1, paper_ai: 1, paper_revise: 1, math_work: 1,
    attend: 1, phone: 1, rest: 1, snack: 1
  };

  function canDo(S, id, params) {
    params = params || {};
    var a = D.ACTIONS[id];
    if (!a) return { ok: false, reason: '未知行动' };
    if (S.ended) return { ok: false, reason: '本局已经结束' };
    var end = S.time + a.dur * MIN;
    if (a.dur > 0 && overlapsClass(S.time, end)) {
      var fullyInside = inClassAt(S.time) && inClassAt(end - MIN);
      if (!fullyInside) return { ok: false, reason: '这段时间要上课，来不及' };
    }
    if (inClassAt(S.time) && !CLASS_ALLOWED[id]) {
      return { ok: false, reason: '正在上课，只能写/改论文、AI、推数模、玩游戏、休息、吃零食或认真听课' };
    }
    if (id === 'attend' && !inClassAt(S.time)) {
      return { ok: false, reason: '现在没有课' };
    }
    if (end > DEADLINE) return { ok: false, reason: '时间不够了（周一 23:59 截止）' };
    if (jCost(S, id) > S.stats.J + 1e-9) {
      return { ok: false, reason: '精力不足：需要 ' + jCost(S, id) + '，现在只有 ' + r1(S.stats.J) };
    }

    if (id === 'paper_write' || id === 'paper_ai' || id === 'paper_revise') {
      var p = paperOf(S, params.paperId);
      if (!p) return { ok: false, reason: '没选论文' };
      if (id === 'paper_write' && progressOf(p) >= 1) return { ok: false, reason: '字数已达标，再写也不涨进度和分数' };
      if (id === 'paper_revise') {
        if (progressOf(p) <= 0) return { ok: false, reason: '还没有字，先写点东西' };
        if (p.score >= 100 && p.ai <= 0) return { ok: false, reason: '这篇已经无可挑剔' };
      }
      if (id === 'paper_ai' && progressOf(p) >= 1) {
        return { ok: false, reason: '这篇已经写满，AI 无法再增加进度' };
      }
    }

    if (id === 'math_work') {
      if (S.math.started && S.math.myProg >= S.math.share - 1e-9) {
        return { ok: false, reason: '你负责的部分已经完成' };
      }
      if (S.math.started && mathComplete(S)) return { ok: false, reason: '竞赛已经完成' };
    }
    if (id === 'math_meeting') {
      if (!S.math.started) return { ok: false, reason: '还没分配任务' };
      var h = hourOf(S.time);
      if (h < 8 || h >= 22) return { ok: false, reason: '队友只在 08:00–22:00 工作，这时候开不了会' };
      if (inClassAt(S.time)) return { ok: false, reason: '上课时开不了数模小会' };
    }
    if (id === 'sleep_full') {
      if (isDaytime(S.time)) return { ok: false, reason: '白天睡不着（08:00-18:00 无法进行标准睡眠）' };
    }
    if (id === 'order_food') {
      if (!inTakeout(S.time)) return { ok: false, reason: '外卖只送 06:00-22:00' };
      if (S.delivery && !S.delivery.arrived) return { ok: false, reason: '上一单还在路上' };
      if (S.delivery && S.delivery.arrived) return { ok: false, reason: '先把到了的外卖吃掉' };
      if (S.stats.B > 70) return { ok: false, reason: '太饱了，吃不下（饱食度 > 70）' };
    }
    if (id === 'eat_takeout') {
      if (!S.delivery || !S.delivery.arrived || S.delivery.stolen) return { ok: false, reason: '外卖还没到' };
      if (S.stats.B > 70) return { ok: false, reason: '太饱了，吃不下（饱食度 > 70）' };
    }
    if (id === 'eat_canteen') {
      if (!inCanteen(S.time)) return { ok: false, reason: '食堂现在没开门' };
      if (S.stats.B > 70) return { ok: false, reason: '太饱了，吃不下（饱食度 > 70）' };
    }
    if (id === 'shop') {
      if (!inTakeout(S.time)) return { ok: false, reason: '小店 06:00-22:00 营业' };
    }
    if (id === 'snack') {
      if (S.snacks <= 0) return { ok: false, reason: '没有零食了，去小店囤一点' };
    }
    if (id === 'shower') {
      if (S.showerDay === dayKey(S.time)) return { ok: false, reason: '今天已经洗过了' };
    }
    return { ok: true };
  }

  /* ---------------- 摆烂判定 ---------------- */
  function maybeSlack(S) {
    if (S.stats.J < 10 || S.stats.X < 20) return true;
    var lowJ = S.stats.J < 50, lowX = S.stats.X < 50;
    if (!lowJ && !lowX) return false;
    var p = (lowJ && lowX) ? 0.15 : 0.05;
    return Math.random() < p;
  }

  /* ---------------- 行动执行 ---------------- */
  function payJ(S, id) {
    S.stats.J = clamp(S.stats.J - jCost(S, id), 0, 100);
  }

  function exec(S, id, params) {
    var a = D.ACTIONS[id];
    var cfg = modeCfg(S);
    params = params || {};
    S.stats2.actions++;

    switch (id) {
      case 'paper_write': {
        var p = paperOf(S, params.paperId);
        var def = paperDef(p.id);
        var eff = effFor(S, 'paper', p.id);
        var beforeW = progressOf(p);
        var rawDelta = (600 / def.req) * bodyMod(S) * intelMod(S) * eff.value * cfg.progress;
        var delta = Math.min(rawDelta, 1 - beforeW);
        var scoreInc = delta * 60 * ((S.stats.X / 100 + S.stats.J / 100) / 2) * intelMod(S);
        var aiInc = delta * 10;
        p.words = p.words + rawDelta * def.req;
        p.score = clamp(p.score + scoreInc, 0, 100);
        p.ai = clamp(p.ai + aiInc, 0, 100);
        payJ(S, id);
        spend(S, a.dur);
        pushLog(S, '你在《' + def.short + '》上写了 ' + Math.round(rawDelta * def.req) + ' 字，进度到 ' +
          r1(progressOf(p) * 100) + '%，分数 ' + r1(p.score) + '。', 'paper');
        S.comboPaper = p.id;
        break;
      }
      case 'paper_ai': {
        var p2 = paperOf(S, params.paperId);
        var def2 = paperDef(p2.id);
        var before = progressOf(p2);
        var delta = 1 - before;
        var inClass = inClassAt(S.time);
        if (inClass) {
          p2.words += 800;
          delta = Math.min(800 / def2.req, 1 - before);
        } else {
          p2.words += delta * def2.req;
        }
        var aiGain = rand(70, 100) * delta;
        var scoreGainAi = rand(50, 80) * delta;
        p2.ai = clamp(p2.ai + aiGain, 0, 100);
        p2.score = clamp(p2.score + scoreGainAi, 0, 100);
        payJ(S, id);
        spend(S, a.dur);
        pushLog(S, '你用 AI 把《' + def2.short + '》写完了：进度增加 ' + r1(delta * 100) + '%，分数增加 ' + r1(scoreGainAi) +
          '，AI 率现在 ' + r1(p2.ai) + '%。', 'warn');
        S.comboPaper = p2.id;
        break;
      }
      case 'paper_revise': {
        var p3 = paperOf(S, params.paperId);
        var mode = params.mode || 'C';
        var prog = progressOf(p3);
        var im = intelMod(S), bm = bodyMod(S), ef = effFor(S, 'paper', p3.id).value;
        var nRev = p3.revs || 0;
        var dim = Math.pow(0.8, nRev);
        var sInc = prog * im * 10 * bm * ef * dim;
        var aiRed = (p3.ai / 100) * prog * im * bm * ef * 0.24 * dim;
        if (mode === 'A') { sInc *= 1.6; aiRed = 0; }
        if (mode === 'B') { aiRed *= 1.6; sInc = 0; }
        var oldScore = p3.score, oldAi = p3.ai;
        p3.score = clamp(p3.score + sInc, 0, 100);
        p3.ai = clamp(p3.ai - aiRed * 100, 0, 100);
        p3.revs = nRev + 1;
        payJ(S, id);
        spend(S, a.dur);
        var tag = mode === 'A' ? '（重质量）' : mode === 'B' ? '（降 AI 率）' : '（均衡）';
        pushLog(S, '你修改了《' + paperDef(p3.id).short + '》' + tag + '：分数增加 ' + r1(p3.score - oldScore) +
          '，AI 率下降 ' + r1(oldAi - p3.ai) + ' 点（第 ' + (nRev + 1) + ' 次，效果为上一次的 ' + r1(dim) + ' 倍）。', 'paper');
        S.comboPaper = p3.id;
        break;
      }
      case 'math_work': {
        if (!S.math.started) {
          payJ(S, id);
          pushLog(S, '开局第一件事，是三个人先把活分好。', 'math');
          S.queue.push({ type: 'assign' });
          break;
        }
        var ratio = (S.stats.intel - intelPenalty(S)) / S.math.diff;
        var d3 = 0.008 * ratio * bodyMod(S) * effFor(S, 'math').value * cfg.progress;
        var beforeProg = S.math.myProg;
        S.math.myProg = Math.min(S.math.share, S.math.myProg + d3 * 100);
        var scoreGain = d3 * ratio * 60 * scoreBuff(S, 'math');
        S.math.score = Math.min(100, S.math.score + scoreGain);
        payJ(S, id);
        spend(S, a.dur);
        pushLog(S, '你推进了自己负责的部分：进度增加 ' + r1(S.math.myProg - beforeProg) + '%，数模总分增加 ' + r1(scoreGain) + '。', 'math');
        break;
      }
      case 'math_meeting': {
        payJ(S, id);
        if (Math.random() < 0.60) S.stats.X = clamp(S.stats.X - 2, 0, 100);
        spend(S, a.dur);
        if (mathComplete(S)) {
          S.math.scoreMeetings = (S.math.scoreMeetings || 0) + 1;
          var nScore = S.math.scoreMeetings;
          var dimScore = Math.pow(0.8, nScore - 1);
          var sumIntel = (S.stats.intel - intelPenalty(S));
          var sumEff = (bodyMod(S) + effFor(S, 'math').value) / 2;
          S.math.mates.forEach(function (m) {
            sumIntel += m.intel;
            sumEff += (1 + mateEff(m)) / 2;
          });
          var gap = 100 - S.math.score;
          var gainScore = gap * (sumIntel / 300) * (sumEff / 3) * 0.20 * dimScore;
          S.math.score = clamp(S.math.score + gainScore, 0, 100);
          pushLog(S, '你把第 ' + nScore + ' 次小组会用来打磨论文：数模总分增加 ' + r1(gainScore) +
            '，现在 ' + r1(S.math.score) + ' 分（效果为上一次的 ' + r1(dimScore) + ' 倍）。', 'math');
          break;
        }
        S.math.meetings++;
        S.math.revealed = true;
        // 延长队友当天工作时间 2 小时（当天还没开始计时就先记着）
        S.math.mates.forEach(function (m) {
          if (m.dayKey !== dayKey(S.time)) m.carry = (m.carry || 0) + 4;
          else m.credits += 4;
        });
        S.math.mates.forEach(function (m) {
          if (m.known === 'none') {
            if (S.math.meetings >= 2) { m.known = 'exact'; }
            else {
              m.known = 'rough';
              var span = randi(3, 6);
              var half = Math.floor(span / 2);
              m.estLow = clamp(m.intel - half, 40, 100);
              m.estHigh = m.estLow + span;
            }
          } else if (m.known === 'rough' && S.math.meetings >= 2) {
            m.known = 'exact';
          }
        });
        var debtText = meetingDebtCheck(S);
        pushLog(S, '你们开了第 ' + S.math.meetings + ' 次小组会，队友今天多工作两小时。', 'math');
        S.queue.push({ type: 'meeting', data: { debtText: debtText } });
        break;
      }
      case 'attend': {
        payJ(S, id);
        spend(S, a.dur);
        pushLog(S, '你认真听了三十分钟课。', 'life');
        break;
      }
      case 'rest': {
        var inClassRest = inClassAt(S.time);
        var f = (4 * S.stats.H + 3 * S.stats.B + 2 * S.stats.X) / 900;
        var gain = 1.05 * f * rand(10, 14) * (isDaytime(S.time) ? 1.5 : 1) * moodGainMod(S) *
          (inClassRest ? 0.8 : 1);
        payJ(S, id);
        var perChunk = gain / 2;
        spend(S, a.dur, { onChunk: function (st) { st.stats.J = clamp(st.stats.J + perChunk, 0, 100); } });
        if (isDaytime(S.time)) S.restMin += a.dur;
        pushLog(S, '你眯了一会儿，精力加了 ' + r1(gain) + '。', 'life');
        drowsyUpdate(S, false);
        break;
      }
      case 'sleep_deep': {
        var f2 = (4 * S.stats.H + 3 * S.stats.B + 2 * S.stats.X) / 900;
        var jg = 1.05 * f2 * rand(45, 55) * (isDaytime(S.time) ? 0.8 : 1) * moodGainMod(S);
        var xg = 5 * ((S.stats.H / 100 + S.stats.B / 100) / 2) * (isDaytime(S.time) ? 0.8 : 1);
        var start2 = S.time;
        payJ(S, id);
        spend(S, a.dur, {
          sleeping: true,
          onChunk: function (st) {
            st.stats.J = clamp(st.stats.J + jg / 8, 0, 100);
            st.stats.X = clamp(st.stats.X + xg / 8, 0, 100);
          }
        });
        if (isDaytime(S.time)) S.restMin += a.dur;
        pushLog(S, '你睡了四小时，精力加了 ' + r1(jg) + '，心情加了 ' + r1(xg) + '。', 'life');
        drowsyUpdate(S, a.dur, start2);
        break;
      }
      case 'sleep_full': {
        var f3 = (4 * S.stats.H + 3 * S.stats.B + 2 * S.stats.X) / 900;
        var jg2 = 1.1 * f3 * 100 * moodGainMod(S);
        var xg2 = 11 * ((S.stats.H / 100 + S.stats.B / 100) / 2);
        var start3 = S.time;
        payJ(S, id);
        spend(S, a.dur, {
          sleeping: true,
          onChunk: function (st) {
            st.stats.J = clamp(st.stats.J + jg2 / 16, 0, 100);
            st.stats.X = clamp(st.stats.X + xg2 / 16, 0, 100);
          }
        });
        pushLog(S, '你睡了整晚，精力加了 ' + r1(jg2) + '，心情加了 ' + r1(xg2) + '。', 'life');
        drowsyUpdate(S, a.dur, start3);
        break;
      }
      case 'phone': {
        var inClassGame = inClassAt(S.time);
        var xg3 = 6 * bodyMod(S) * (inClassGame ? 0.8 : 1) * (S.lastAction === 'phone' ? 1.2 : 1);
        S.stats.J = clamp(S.stats.J + 6 * moodGainMod(S) * (inClassGame ? 0.8 : 1), 0, 100);
        S.stats.X = clamp(S.stats.X + xg3, 0, 100);
        spend(S, a.dur);
        S.stats.phoneStacks = S.stats.phoneStacks || [];
        S.stats.phoneStacks.push({ amount: 6, until: S.time + 60 * MIN });
        S.stats.phonePenalty = Math.min(24, S.stats.phonePenalty + 6);
        S.stats.phonePenaltyUntil = S.time + 60 * MIN;
        S.stats2.phones++;
        pushLog(S, '你玩了半小时游戏，心情加了 ' + r1(xg3) + '，精力加了6；接下来1小时，智力暂时下降6点。', 'life');
        break;
      }
      case 'sports': {
        payJ(S, id);
        S.stats.X = clamp(S.stats.X + 5, 0, 100);
        S.stats.H = clamp(S.stats.H + 3, 0, 100);
        spend(S, a.dur);
        pushLog(S, '你跑了1小时步：健康加3，心情加5。', 'life');
        break;
      }
      case 'order_food': {
        S.delivery = { arriveAt: S.time + 60 * MIN, arrived: false, stolen: false, eaten: false };
        pushLog(S, '你点了一份外卖，大约1小时后送到。', 'life');
        break;
      }
      case 'eat_takeout': {
        var fac = S.flags.takeoutFactor || 1;
        S.stats.H = clamp(S.stats.H - 2, 0, 100);
        S.stats.B = 100;
        S.stats.X = clamp(S.stats.X + 2 * fac, 0, 100);
        S.stats.J = clamp(S.stats.J + 5 * fac * moodGainMod(S), 0, 100);
        S.delivery = null;
        S.flags.takeoutFactor = 1;
        spend(S, a.dur, { eating: true });
        pushLog(S, '你把外卖吃了：饱食回满，心情加 ' + r1(2 * fac) + '，健康减2。', 'life');
        break;
      }
      case 'eat_canteen': {
        S.stats.H = clamp(S.stats.H + 1, 0, 100);
        S.stats.B = 100;
        S.stats.X = clamp(S.stats.X + 3, 0, 100);
        S.stats.J = clamp(S.stats.J + 2 * moodGainMod(S), 0, 100);
        spend(S, a.dur, { eating: true });
        pushLog(S, '你去食堂吃了顿饭：健康加1，心情加3。', 'life');
        break;
      }
      case 'shop': {
        payJ(S, id);
        spend(S, a.dur);
        S.snacks += 2;
        pushLog(S, '你在小店买了两份零食。', 'life');
        break;
      }
      case 'snack': {
        var inClassSnack = inClassAt(S.time);
        var beforeB = S.stats.B;
        S.stats.B = clamp(S.stats.B + rand(35, 50), 0, 100);
        var realGain = S.stats.B - beforeB;
        S.stats.X = clamp(S.stats.X + 2 * (inClassSnack ? 0.8 : 1), 0, 100);
        S.stats.J = clamp(S.stats.J + 3 * moodGainMod(S) * (inClassSnack ? 0.8 : 1), 0, 100);
        S.stats.H = clamp(S.stats.H - 1, 0, 100);
        S.snacks--;
        pushLog(S, '你吃了点零食：饱食加了 ' + r1(realGain) + '，健康减1。', 'life');
        if (Math.random() < (inClassSnack ? 0.50 : 0.25)) {
          S.queue.push({ type: 'snackAsk', data: { gain: realGain } });
        }
        break;
      }
      case 'shower': {
        S.stats.C = 100;
        S.stats.X = clamp(S.stats.X + 3, 0, 100);
        S.stats.J = clamp(S.stats.J + 10 * moodGainMod(S), 0, 100);
        S.showerDay = dayKey(S.time);
        spend(S, a.dur);
        pushLog(S, '你洗了个澡：干净回满，心情加3。', 'life');
        break;
      }
      default: break;
    }

    if (id === 'math_work') S.comboPaper = null;
    if (!isMainAction(id)) {
      if (a.dur > 0) S.comboPaper = null;
    }
    S.lastAction = id;
    autoClass(S);
  }

  function drowsyUpdate(S, sleepDuration, startTime) {
    if (isDaytime(S.time) && S.restMin >= 120) {
      if (S.drowsy) pushLog(S, '白天补够了2小时，困倦消退了。', 'good');
      S.drowsy = false;
      S.restMin = 0;
      return;
    }
    if (!sleepDuration) return;
    var startHour = hourOf(startTime);
    var startedLate = startHour >= 1 && startHour < 8;
    if (sleepDuration > 360 && !startedLate) {
      if (S.drowsy) pushLog(S, '这一觉睡得够沉，人清醒多了。', 'good');
      S.drowsy = false;
      S.restMin = 0;
    } else if (startHour >= 22 || startHour < 8) {
      if (!S.drowsy) pushLog(S, '睡得太短，或者睡得太晚，你还是很困。', 'warn');
      S.drowsy = true;
    }
  }

  function autoClass(S) {
    /* 新版规则里上课不再自动消耗时间，而是变成「效率 -50%、只能做少数行动」的时间窗口。
     * 保留这个空函数是为了兼容 UI 里的旧调用。 */
    return;
  }

  function finish(S) {
    if (S.ended) return;
    S.ended = true;
    S.endReason = 'manual';
    S.queue = [];
  }

  /* ---------------- 行动入口 ---------------- */
  function perform(S, id, params) {
    params = params || {};
    var chk = canDo(S, id, params);
    if (!chk.ok) return { ok: false, reason: chk.reason };
    if (isMainAction(id) && !params.skipSlack && maybeSlack(S)) {
      S.stats2.slack++;
      S.queue.push({ type: 'slack', data: { action: id, params: { paperId: params.paperId, mode: params.mode } } });
      return { ok: true, pending: true };
    }
    exec(S, id, params);
    return { ok: true };
  }

  /* ---------------- 事件队列 ---------------- */
  function popEvent(S) { return S.queue.length ? S.queue.shift() : null; }

  function mateIntelText(m) {
    if (m.known === 'exact') return '智力 ' + m.intel;
    if (m.known === 'rough') return '智力约 ' + (m.estLow || '?') + '~' + (m.estHigh || '?');
    return '智力未知';
  }

  function describeEvent(S, ev) {
    var d = ev.data || {};
    if (ev.type === 'slack') {
      return {
        icon: '🫠', tone: 'warn',
        title: '想摆烂了！',
        body: '「我好累，想休息一下了，玩玩手机什么的也好啊！我不想做了！」<br><span class="muted">精力低于五十，或者心情低于五十的时候，主要行动每三十分钟有百分之五到十五的概率触发；如果精力低于十或心情低于二十，则一定会触发。</span>',
        choices: [
          { label: '玩三十分钟游戏，缓一缓', sub: '心情会好一点，精力加6；接下来1小时，智力暂时下降。' },
          { label: '休息一小时', sub: '精力会回来一些，但今晚更赶了。' },
          { label: '硬撑着继续', sub: '心情减3，接下来1小时效率降低10%。', tone: 'bad' }
        ]
      };
    }
    if (ev.type === 'assign') {
      var opts = ['A', 'B', 'C'].map(function (k) {
        var r = D.ROLES[k];
        var ratio = (S.stats.intel - intelPenalty(S)) / r.diff;
        var per = 0.008 * ratio * bodyMod(S) * effFor(S, 'math').value * modeCfg(S).progress * 100;
        var times = Math.ceil(r.need / Math.max(0.01, per));
        var othersTxt = ['A', 'B', 'C'].filter(function (x) { return x !== k; }).map(function (x) {
          var o = D.ROLES[x];
          return o.need + '% · 难度 ' + o.diff;
        }).join('　+　');
        return {
          label: r.icon + ' ' + r.name,
          sub: '需完成 ' + r.need + '% · 难度 ' + r.diff + ' · 你大约要 ' + times + ' 次行动（约 ' + r1(times * 0.5) + ' 小时）' +
            '<br>队友分到：' + othersTxt,
          value: k
        };
      });
      return {
        icon: '🧮', tone: 'math',
        title: '数模竞赛任务分配',
        body: '你和另外两名队友商量这个比赛各自干什么活。你作为队长，眼下还有论文要写，不知是否还有余力承担重活。<br>' +
          '<span class="muted">你负责的份额越难，队友那两块就越轻松；队友每天只工作5小时，22:00–08:00休息，越晚开始越危险。</span>',
        choices: opts
      };
    }
    if (ev.type === 'meeting') {
      var lines = S.math.mates.map(function (m) {
        return '· <b>' + m.name + '</b>：' + mateIntelText(m) + '，进度 ' + r1(m.prog) + '% / ' + r1(m.share) + '%';
      }).join('<br>');
      var debt = d.debtText ? ('<br><span class="warn">' + d.debtText + '</span>') : '';
      var slow = null;
      S.math.mates.forEach(function (m) {
        if (!slow || m.prog < slow.prog) slow = m;
      });
      var helped = bothMatesDone(S);
      return {
        icon: '☕', tone: 'math',
        title: '数模小组会',
        body: '你了解到队友的情况：<br>' + lines + debt +
          '<br><span class="muted">总进度 ' + r1(teamProgress(S)) + '%，总体分 ' + r1(S.math.score) + '。' +
          '队友今天的工时长已经延长两小时。</span>' + (helped ? '<br><span class="good">两名队友都已完成，正在一起帮你。</span>' : ''),
        choices: [
          { label: '帮助 ' + (slow ? slow.name : '队友') + '（进度较慢的那个）', sub: '接下来三小时，他的速度提高五成；你和剩下的队友的效率降低10%。' },
          { label: '向队友寻求帮助', sub: helped ? '队友都在帮你，无法再求助' : '接下来三小时，你的速度提高五成；另外两人的效率降低一成。', disabled: helped },
          { label: '共同协作', sub: '所有人两小时内分数增加效率提高两成。' }
        ]
      };
    }
    if (ev.type === 'foodLost') {
      return {
        icon: '🥲', tone: 'warn',
        title: '外卖不见了！',
        body: '下楼到外卖架子处找外卖时，找了许久也不见踪影，大概率是被谁偷了或者拿错了。',
        choices: [
          { label: '再点一份', sub: '再等1小时，不用额外花时间。' },
          { label: '去食堂吃', sub: inCanteen(S.time) ? '1小时，健康加1。' : '食堂现在没开门', disabled: !inCanteen(S.time) },
          { label: '在架子上随便拿一份', sub: '心情减5，精力减5；这顿外卖的正面回复效果按80%计算。', tone: 'bad' },
          { label: '再找找', sub: '花三十分钟，五成能找回来。' }
        ]
      };
    }
    if (ev.type === 'snackAsk') {
      return {
        icon: '🍪', tone: 'life',
        title: '舍友索要零食！',
        body: '看着你吃得这么香，舍友也有点馋了。',
        choices: [
          { label: '分他一点', sub: '这次饱食恢复少12点，心情加2。', tone: 'good' },
          { label: '不给', sub: '舍友会念叨两句，心情减5。' }
        ]
      };
    }
    if (ev.type === 'mateAsk') {
      var lowM = null;
      S.math.mates.forEach(function (m) { if (!lowM || m.prog < lowM.prog) lowM = m; });
      return {
        icon: '💬', tone: 'math',
        title: '队友询问进度',
        body: '队友来问你负责的那部分推进到哪里了。你的进度是 <b>' + r1(S.math.myProg) + '%</b>，' +
          (lowM ? ('进度较低的那位队友是 <b>' + lowM.name + '</b>（' + r1(lowM.prog) + '%）。') : ''),
        choices: [
          { label: '实话实说', sub: '如果你的进度超过对方八成，就什么也不会发生；否则接下来五小时，他们的效率降低一成、你的提高一成。下次组会如果你的进度仍不到对方的八成，他们就会质疑你（心情减7、精力减6）。' },
          { label: '夸大一些', sub: '接下来三小时，队友的速度提高两成，但分数增量降低一成。下次组会如果你的进度不高于对方，他们会觉得自己被欺骗，之后效率永久降低一成。', tone: 'bad' },
          { label: '嫌他们烦（心情减13、精力减11）', sub: '他们不会再问，但两人的效率永久降低10%。', tone: 'bad' }
        ]
      };
    }
    if (ev.type === 'classDone') {
      return {
        icon: '🏫', tone: 'life',
        title: '下课了',
        body: '你在课堂上硬撑了 <b>' + (d.minutes / 60) + ' 小时</b>，精力 ' + d.jBefore + ' → ' + d.jAfter + '。<br>' +
          '<span class="muted">接下来的时间可以自己安排了。</span>',
        choices: [{ label: '继续', sub: '' }]
      };
    }
    return { icon: '❓', title: '事件', body: '', choices: [{ label: '继续' }] };
  }

  function meetingDebtCheck(S) {
    var f = S.math.flags;
    var txt = [];
    var lowM = null;
    S.math.mates.forEach(function (m) { if (!lowM || m.prog < lowM.prog) lowM = m; });
    if (f.honestDebt && lowM) {
      if (S.math.myProg < lowM.prog * 0.8) {
        S.stats.X = clamp(S.stats.X - 7, 0, 100);
        S.stats.J = clamp(S.stats.J - 6, 0, 100);
        txt.push('队友皱起了眉头：「你上次说没问题，现在还是没跟上？」你解释了半天，心情减7、精力减6。');
      }
      f.honestDebt = false;
    }
    if (f.exaggerateDebt && lowM) {
      if (S.math.myProg <= lowM.prog) {
        S.math.mates.forEach(function (m) { m.perm -= 0.10; });
        txt.push('队友发现自己被忽悠了，之后干活的效率永久降低一成。');
      }
      f.exaggerateDebt = false;
    }
    return txt.join('');
  }

  function resolveEvent(S, ev, idx) {
    var d = ev.data || {};
    if (ev.type === 'slack') {
      if (idx === 0) { perform(S, 'phone'); return; }
      if (idx === 1) { perform(S, 'rest'); return; }
      S.stats.X = clamp(S.stats.X - 3, 0, 100);
      S.flags.slackUntil = S.time + 60 * MIN;
      pushLog(S, '你咬了咬牙，继续干。心情减3，接下来1小时效率降低10%。', 'warn');
      var p = ev.data.params || {};
      p.skipSlack = true;
      perform(S, ev.data.action, p);
      return;
    }
    if (ev.type === 'assign') {
      var key = ['A', 'B', 'C'][idx] || 'A';
      var role = D.ROLES[key];
      var others = ['A', 'B', 'C'].filter(function (k) { return k !== key; })
        .sort(function (a, b) { return D.ROLES[a].diff - D.ROLES[b].diff; }); // 难度从低到高
      S.math.role = key;
      S.math.share = role.need;
      S.math.diff = role.diff;
      S.math.started = true;
      S.math.myProg = 0;
      S.math.score = 0;
      var lowMate = S.math.mates[0], highMate = S.math.mates[1];
      if (lowMate.intel > highMate.intel) { var tmpM = lowMate; lowMate = highMate; highMate = tmpM; }
      [[lowMate, others[0]], [highMate, others[1]]].forEach(function (pair) {
        var m = pair[0], r = D.ROLES[pair[1]];
        m.share = r.need;
        m.diff = r.diff;
        m.prog = 0;
        m.done = false;
      });
      var hardName = D.ROLES[others[1]].name.replace(/^负责/, '').replace(/。$/, '');
      var easyName = D.ROLES[others[0]].name.replace(/^负责/, '').replace(/。$/, '');
      pushLog(S, '你选择了「' + role.name + '」：' + role.need + '% 份额，难度 ' + role.diff +
        '；智力较高的 ' + highMate.name + ' 承担了「' + hardName + '」，' +
        lowMate.name + ' 承担了「' + easyName + '」。', 'math');
      return;
    }
    if (ev.type === 'meeting') {
      if (idx === 0) {
        var sorted = S.math.mates.slice().sort(function (a, b) { return a.prog - b.prog; });
        var slow = sorted[0], other = sorted[1];
        if (slow) {
          slow.buffs.push({ eff: 0.5, until: S.time + 180 * MIN, label: '组会帮助' });
          S.buffs.push({ eff: -0.1, scope: 'math', until: S.time + 180 * MIN, label: '分心帮队友' });
          if (other) other.buffs.push({ eff: -0.1, until: S.time + 180 * MIN, label: '被冷落' });
          pushLog(S, '你帮 ' + slow.name + ' 梳理了思路：接下来3小时，他的速度提高50%；你和剩下的那位队友的效率降低10%。', 'math');
        }
      } else if (idx === 1) {
        S.buffs.push({ eff: 0.5, scope: 'math', until: S.time + 180 * MIN, label: '队友帮忙' });
        S.math.mates.forEach(function (m) {
          m.buffs.push({ eff: -0.1, until: S.time + 180 * MIN, label: '被求助' });
        });
        pushLog(S, '队友帮你顶了一部分：接下来3小时，你的数模速度提高50%；他们的效率降低10%。', 'math');
      } else {
        S.buffs.push({ score: 0.2, scope: 'math', until: S.time + 120 * MIN, label: '共同协作' });
        S.math.mates.forEach(function (m) {
          m.buffs.push({ score: 0.2, until: S.time + 120 * MIN, label: '共同协作' });
        });
        pushLog(S, '3个人一起对了一遍进度：接下来2小时，全员的分数效率提高20%。', 'math');
      }
      if (!S.math.flags.noAsk && S.math.myProg < S.math.share - 1e-9 && Math.random() < 0.30) {
        S.math.lastAsk = S.time;
        S.queue.push({ type: 'mateAsk' });
      }
      return;
    }
    if (ev.type === 'foodLost') {
      if (idx === 0) {
        S.delivery = { arriveAt: S.time + 60 * MIN, arrived: false, stolen: false, eaten: false };
        pushLog(S, '你又点了一份，继续等。', 'life');
      } else if (idx === 1) {
        S.delivery = null;
        perform(S, 'eat_canteen');
      } else if (idx === 2) {
        S.stats.X = clamp(S.stats.X - 5, 0, 100);
        S.stats.J = clamp(S.stats.J - 5, 0, 100);
        S.flags.takeoutFactor = 0.8;
        S.delivery = { arriveAt: S.time, arrived: true, stolen: false, eaten: false };
        pushLog(S, '你随手从架子上拿了一份别人的外卖……心情减5。', 'warn');
      } else {
        spend(S, 30);
        autoClass(S);
        if (Math.random() < 0.5) {
          if (S.delivery) { S.delivery.arrived = true; S.delivery.stolen = false; }
          pushLog(S, '翻找半天，你终于在架子最里面找到了自己的外卖。', 'good');
        } else {
          pushLog(S, '还是没找到。你有点崩溃。', 'warn');
          S.queue.push({ type: 'foodLost' });
        }
      }
      return;
    }
    if (ev.type === 'snackAsk') {
      if (idx === 0) {
        S.stats.B = clamp(S.stats.B - 12, 0, 100);
        S.stats.X = clamp(S.stats.X + 2, 0, 100);
        pushLog(S, '你分了一半给舍友，心情加2。', 'life');
      } else {
        S.stats.X = clamp(S.stats.X - 5, 0, 100);
        pushLog(S, '舍友撇了撇嘴，心情减5。', 'life');
      }
      return;
    }
    if (ev.type === 'mateAsk') {
      var low = null;
      S.math.mates.forEach(function (m) { if (!low || m.prog < low.prog) low = m; });
      if (idx === 0) {
        if (!low || S.math.myProg > low.prog * 0.8) {
          pushLog(S, '你如实说了进度，队友点点头，没多说什么。', 'math');
        } else {
          S.math.mates.forEach(function (m) {
            m.buffs.push({ eff: -0.1, until: S.time + 300 * MIN, label: '进度焦虑' });
          });
          S.buffs.push({ eff: 0.1, scope: 'math', until: S.time + 300 * MIN, label: '被催了' });
          S.math.flags.honestDebt = true;
          pushLog(S, '队友发现你的进度落后。接下来5小时，他们的效率降低10%，你的提高10%。', 'warn');
        }
      } else if (idx === 1) {
        S.math.mates.forEach(function (m) {
          m.buffs.push({ eff: 0.2, score: -0.1, until: S.time + 180 * MIN, label: '被夸大的进度' });
        });
        S.math.flags.exaggerateDebt = true;
        pushLog(S, '你把进度往大了说，队友立刻加快脚步（3小时内速度提高20%，但分数增量降低10%）。', 'warn');
      } else {
        S.stats.X = clamp(S.stats.X - 13, 0, 100);
        S.stats.J = clamp(S.stats.J - 11, 0, 100);
        S.math.mates.forEach(function (m) { m.perm = (m.perm || 0) - 0.1; });
        S.math.flags.noAsk = true;
        pushLog(S, '你嫌他们烦，直接把话堵了回去。心情减13，精力减11；两人的效率永久降低10%。', 'warn');
      }
      return;
    }
    /* classDone 及未知事件：继续即可 */
  }

  /* ---------------- 预估 ---------------- */
  function levelOf(kind, v) {
    var t = { progress: [5, 15], score: [4, 9], ai: [2, 8], j: [4, 8], words: [600, 2000] }[kind] || [4, 10];
    return v < t[0] ? '低' : (v < t[1] ? '中' : '高');
  }
  function row(icon, label, text, delta, kind) {
    return { icon: icon, label: label, text: text, level: levelOf(kind, Math.abs(delta || 0)) };
  }

  function previewRevise(S, paperId) {
    var p = paperOf(S, paperId);
    var prog = progressOf(p), im = intelMod(S), bm = bodyMod(S);
    var ef = effFor(S, 'paper', paperId).value;
    var dim = Math.pow(0.8, p.revs || 0);
    var base = prog * im * 10 * bm * ef * dim;
    var aiBase = (p.ai / 100) * prog * im * bm * ef * 0.24 * 100 * dim;
    function rows(mode) {
      var sInc = base * (mode === 'A' ? 1.6 : mode === 'C' ? 1 : 0);
      var ai = aiBase * (mode === 'B' ? 1.6 : mode === 'C' ? 1 : 0);
      var out = [];
      out.push(row('📊', '分数', mode === 'B' ? '不变' : '+' + r1(Math.min(sInc, 100 - p.score)), sInc, 'score'));
      out.push(row('🕵️', 'AI 率', mode === 'A' ? '不降' : '-' + r1(ai) + ' 点', ai, 'ai'));
      out.push(row('⚡', '精力', '-' + jCost(S, 'paper_revise'), jCost(S, 'paper_revise'), 'j'));
      return out;
    }
    return { A: rows('A'), B: rows('B'), C: rows('C'), dim: dim, n: (p.revs || 0) + 1 };
  }

  function preview(S, id, params) {
    params = params || {};
    var a = D.ACTIONS[id];
    var chk = canDo(S, id, params);
    var rows = [];
    var note = '';
    if (!chk.ok) return { ok: false, reason: chk.reason, rows: rows, note: '' };
    var cfg = modeCfg(S);
    var jc = jCost(S, id);
    switch (id) {
      case 'paper_write': {
        var p = paperOf(S, params.paperId), def = paperDef(p.id);
        var eff = effFor(S, 'paper', p.id);
        var beforeW = progressOf(p);
        var rawDelta = (600 / def.req) * bodyMod(S) * intelMod(S) * eff.value * cfg.progress;
        var delta = Math.min(rawDelta, 1 - beforeW);
        var scoreInc = delta * 60 * ((S.stats.X / 100 + S.stats.J / 100) / 2) * intelMod(S);
        rows.push(row('📈', '进度', '+' + r1(delta * 100) + '%', delta * 100, 'progress'));
        rows.push(row('📊', '分数', '+' + r1(scoreInc), scoreInc, 'score'));
        rows.push(row('🕵️', 'AI 率', '+' + r1(delta * 10) + ' 点', delta * 10, 'ai'));
        rows.push(row('⚡', '精力', '-' + jc, jc, 'j'));
        note = '本次约 ' + Math.round(rawDelta * def.req) + ' 字 · 效率 ×' + eff.value.toFixed(2);
        break;
      }
      case 'paper_ai': {
        var p2 = paperOf(S, params.paperId), def2 = paperDef(p2.id);
        var before = progressOf(p2);
        var aiClass = inClassAt(S.time);
        var delta = aiClass ? Math.min(800 / def2.req, 1 - before) : (1 - before);
        var words = aiClass ? 800 : delta * def2.req;
        rows.push(row('⌨️', '字数', '+' + Math.round(words), words, 'words'));
        rows.push(row('📈', '进度', '+' + r1(delta * 100) + '%', delta * 100, 'progress'));
        rows.push(row('📊', '分数', '+' + r1(50 * delta) + '~' + r1(80 * delta), 80 * delta, 'score'));
        rows.push(row('🕵️', 'AI 率', '+' + r1(70 * delta) + '~' + r1(100 * delta) + ' 点', 100 * delta, 'ai'));
        rows.push(row('⚡', '精力', '-' + jc, jc, 'j'));
        note = '一次写满整篇，分数和 AI 率都是随机；AI 率越高越难洗';
        break;
      }
      case 'paper_revise': {
        var pv = previewRevise(S, params.paperId);
        rows = pv[params.mode || 'C'];
        note = '第 ' + pv.n + ' 次修改 · 效果 ×' + r1(pv.dim) +
          (params.mode === 'A' ? ' · 重质量：分数 +60%，AI 率不降' :
            params.mode === 'B' ? ' · 降 AI 率：降幅 +60%，分数不涨' : ' · 均衡处理');
        break;
      }
      case 'math_work': {
        if (!S.math.started) return { ok: true, rows: [], note: '第一次做只需分配任务（不耗时间，但消耗精力）' };
        var ratio = (S.stats.intel - intelPenalty(S)) / S.math.diff;
        var d3 = 0.008 * ratio * bodyMod(S) * effFor(S, 'math').value * cfg.progress;
        var scoreGain = d3 * ratio * 60 * scoreBuff(S, 'math');
        rows.push(row('📈', '你的进度', '+' + r1(d3 * 100) + '%', d3 * 100, 'progress'));
        rows.push(row('🏅', '总体分', '+' + r1(scoreGain), scoreGain, 'score'));
        rows.push(row('⚡', '精力', '-' + jc, jc, 'j'));
        note = '难度 ' + S.math.diff + ' · 效率 ×' + effFor(S, 'math').value.toFixed(2);
        break;
      }
      case 'math_meeting': {
        if (mathComplete(S)) {
          var nScore = (S.math.scoreMeetings || 0) + 1;
          var dimScore = Math.pow(0.8, nScore - 1);
          var sumIntel = (S.stats.intel - intelPenalty(S));
          var sumEff = (bodyMod(S) + effFor(S, 'math').value) / 2;
          S.math.mates.forEach(function (m) {
            sumIntel += m.intel;
            sumEff += (1 + mateEff(m)) / 2;
          });
          var gain = (100 - S.math.score) * (sumIntel / 300) * (sumEff / 3) * 0.20 * dimScore;
          rows.push(row('🏅', '数模总分', '+' + r1(gain), gain, 'score'));
          rows.push(row('⚡', '精力', '-' + jc, jc, 'j'));
          note = '竞赛已完成，小组会改为打磨论文 · 第 ' + nScore + ' 次 · 效果 ×' + r1(dimScore);
        } else {
          rows.push(row('👀', '队友进度', '全部可见', 10, 'progress'));
          rows.push(row('⚡', '精力', '-' + jc, jc, 'j'));
          note = '第一次只能粗略估计队友智力，第二次准确；60% 概率掉 2 心情';
        }
        break;
      }
      case 'attend': {
        rows.push(row('📖', '效果', '没有影响', 1, 'progress'));
        rows.push(row('⚡', '上课消耗', '-4', 4, 'j'));
        note = '只是把上课时间过掉；也可以写论文、玩游戏或休息';
        break;
      }
      case 'rest': {
        var restClass = inClassAt(S.time) ? 0.8 : 1;
        var f = (4 * S.stats.H + 3 * S.stats.B + 2 * S.stats.X) / 900;
        var lo = 1.05 * f * 10 * (isDaytime(S.time) ? 1.5 : 1) * moodGainMod(S) * restClass;
        var hi = 1.05 * f * 14 * (isDaytime(S.time) ? 1.5 : 1) * moodGainMod(S) * restClass;
        rows.push(row('⚡', '精力', '+' + r1(lo) + '~' + r1(hi), hi, 'j'));
        note = (isDaytime(S.time) ? '白天休息效果 +50%' : '夜间休息效果一般') + (restClass < 1 ? '；上课时恢复 -20%' : '');
        break;
      }
      case 'sleep_deep': {
        var f2 = (4 * S.stats.H + 3 * S.stats.B + 2 * S.stats.X) / 900;
        var jlo = 1.05 * f2 * 45 * (isDaytime(S.time) ? 0.8 : 1) * moodGainMod(S);
        var jhi = 1.05 * f2 * 55 * (isDaytime(S.time) ? 0.8 : 1) * moodGainMod(S);
        var xg = 5 * ((S.stats.H / 100 + S.stats.B / 100) / 2) * (isDaytime(S.time) ? 0.8 : 1);
        rows.push(row('⚡', '精力', '+' + r1(jlo) + '~' + r1(jhi), jhi, 'j'));
        rows.push(row('🙂', '心情', '+' + r1(xg), xg, 'score'));
        note = isDaytime(S.time) ? '白天睡眠效果 -20%' : '夜晚效果正常';
        break;
      }
      case 'sleep_full': {
        var f3 = (4 * S.stats.H + 3 * S.stats.B + 2 * S.stats.X) / 900;
        var jFull = 1.1 * f3 * 100 * moodGainMod(S);
        var xFull = 11 * ((S.stats.H / 100 + S.stats.B / 100) / 2);
        rows.push(row('⚡', '精力', '+' + r1(jFull), jFull, 'j'));
        rows.push(row('🙂', '心情', '+' + r1(xFull), xFull, 'score'));
        note = '睡满 8 小时，还能消除困倦';
        break;
      }
      case 'phone': {
        var gameClass = inClassAt(S.time) ? 0.8 : 1;
        var xg3 = 6 * bodyMod(S) * gameClass * (S.lastAction === 'phone' ? 1.2 : 1);
        rows.push(row('🙂', '心情', '+' + r1(xg3), xg3, 'score'));
        rows.push(row('⚡', '精力', '+' + r1(6 * gameClass), 6, 'j'));
        rows.push(row('🧠', '智力', '-6（1 小时）', 6, 'j'));
        note = '连续玩收益 +20%；多次最多临时 -24 智力' + (gameClass < 1 ? '；上课时恢复 -20%' : '');
        break;
      }
      case 'sports': {
        rows.push(row('❤️', '健康', '+3', 3, 'score'));
        rows.push(row('🙂', '心情', '+5', 5, 'score'));
        rows.push(row('⚡', '精力', '-' + jc, jc, 'j'));
        break;
      }
      case 'order_food': {
        rows.push(row('🍱', '外卖', '1 小时后到', 5, 'progress'));
        rows.push(row('❤️', '健康', '-2（吃的时候）', 2, 'score'));
        note = '10% 概率外卖被偷（心情 -8）';
        break;
      }
      case 'eat_takeout': {
        rows.push(row('🍚', '饱食', '拉满', 60, 'progress'));
        rows.push(row('🙂', '心情', '+' + r1(2 * (S.flags.takeoutFactor || 1)), 2, 'score'));
        rows.push(row('⚡', '精力', '+' + r1(5 * (S.flags.takeoutFactor || 1) * moodGainMod(S)), 5, 'j'));
        rows.push(row('❤️', '健康', '-2', 2, 'score'));
        break;
      }
      case 'eat_canteen': {
        rows.push(row('🍚', '饱食', '拉满', 60, 'progress'));
        rows.push(row('🙂', '心情', '+3', 3, 'score'));
        rows.push(row('⚡', '精力', '+' + r1(2 * moodGainMod(S)), 2, 'j'));
        rows.push(row('❤️', '健康', '+1', 1, 'score'));
        break;
      }
      case 'shop': {
        rows.push(row('🍫', '零食', '+2 次', 2, 'progress'));
        rows.push(row('⚡', '精力', '-2', 2, 'j'));
        break;
      }
      case 'snack': {
        var snackClass = inClassAt(S.time);
        rows.push(row('🍚', '饱食', '+35~50', 40, 'progress'));
        rows.push(row('🙂', '心情', '+' + r1(2 * (snackClass ? 0.8 : 1)), 2, 'score'));
        rows.push(row('⚡', '精力', '+' + r1(3 * (snackClass ? 0.8 : 1)), 3, 'j'));
        rows.push(row('❤️', '健康', '-1', 1, 'score'));
        note = '不花时间 · 剩 ' + S.snacks + ' 次' + (snackClass ? ' · 上课时饱食不变，但舍友有 50% 概率来要' : '');
        break;
      }
      case 'shower': {
        rows.push(row('🫧', '干净', '拉满', 60, 'progress'));
        rows.push(row('🙂', '心情', '+3', 3, 'score'));
        rows.push(row('⚡', '精力', '+10', 10, 'j'));
        break;
      }
      default: break;
    }
    if (inClassAt(S.time) && a.dur > 0 && id !== 'attend' && id !== 'rest' && id !== 'phone') {
      rows.push(row('🏫', '上课额外', '-4', 4, 'j'));
    }
    if (inClassAt(S.time) && (id === 'rest' || id === 'phone')) {
      note += ' · 上课时每 30 分钟额外 -4 精力';
    }
    return { ok: true, reason: '', rows: rows, note: note };
  }

  /* ---------------- 结算 ---------------- */
  function evaluate(S) {
    var g = D.GOALS;
    var tiers = ['pass', 'good', 'perfect'];
    var papers = S.papers.map(function (p) {
      var def = paperDef(p.id);
      var prog = progressOf(p);
      var item = { id: p.id, def: def, score: r1(p.score), ai: r1(p.ai), prog: r1(prog * 100), met: {} };
      tiers.forEach(function (t) {
        var q = g[t].papers[p.id];
        item.met[t] = prog >= 1 && p.score >= q.score && p.ai <= q.ai;
      });
      item.target = { score: g.perfect.papers[p.id].score, ai: g.perfect.papers[p.id].ai };
      return item;
    });
    var mp = {
      progress: r1(teamProgress(S)), score: r1(S.math.score), met: {}
    };
    tiers.forEach(function (t) {
      mp.met[t] = teamProgress(S) >= g[t].math.progress - 1e-9 && S.math.score >= g[t].math.score;
    });
    var hp = { cur: r1(S.stats.H), met: {} };
    tiers.forEach(function (t) { hp.met[t] = S.stats.H >= g[t].health; });

    var tier = 'fail';
    for (var i = tiers.length - 1; i >= 0; i--) {
      var t = tiers[i];
      var all = papers.every(function (p) { return p.met[t]; }) && mp.met[t] && hp.met[t];
      if (all) { tier = t; break; }
    }
    return { tier: tier, tierInfo: D.TIERS[tier], papers: papers, math: mp, health: hp, goals: g };
  }

  /* ---------------- 展示辅助 ---------------- */
  function timeText(t) {
    return monthDay(t) + ' 周' + weekday(t) + ' ' + hhmm(t);
  }
  function clockText(t) { return hhmm(t); }
  function countdownText(S) {
    var ms = DEADLINE - S.time;
    if (ms <= 0) return '已截止';
    var totalMin = Math.floor(ms / MIN);
    var d = Math.floor(totalMin / (60 * 24));
    var h = Math.floor((totalMin - d * 1440) / 60);
    var m = totalMin % 60;
    return (d > 0 ? d + ' 天 ' : '') + h + ' 小时 ' + pad(m) + ' 分';
  }
  function phaseOf(t) {
    var h = hourOf(t);
    if (h >= 5 && h < 9) return 'dawn';
    if (h >= 9 && h < 17) return 'day';
    if (h >= 17 && h < 20) return 'dusk';
    return 'night';
  }
  function dayProgress(t) {
    var d = new Date(t);
    return ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;
  }

  /* ---------------- 存读档 ---------------- */
  var SAVE_KEY = 'weekend-hell-save-v6';
  function serialize(S) { return JSON.stringify(S); }
  function deserialize(str) {
    try {
      var S = JSON.parse(str);
      if (!S || S.v !== 6) return null;
      if (!S.queue) S.queue = [];
      if (!S.log) S.log = [];
      return S;
    } catch (e) { return null; }
  }

  root.Engine = {
    MODES: MODES,
    CLASS_WINDOWS: CLASS_WINDOWS,
    START: START,
    DEADLINE: DEADLINE,
    SAVE_KEY: SAVE_KEY,
    newState: newState,
    canDo: canDo,
    perform: perform,
    exec: exec,
    preview: preview,
    previewRevise: previewRevise,
    popEvent: popEvent,
    describeEvent: describeEvent,
    resolveEvent: resolveEvent,
    evaluate: evaluate,
    paperDef: paperDef,
    paperOf: paperOf,
    progressOf: progressOf,
    bodyMod: bodyMod,
    intelMod: intelMod,
    intelPenalty: intelPenalty,
    effFor: effFor,
    scoreBuff: scoreBuff,
    jCost: jCost,
    teamProgress: teamProgress,
    worryInfo: worryInfo,
    mathComplete: mathComplete,
    bothMatesDone: bothMatesDone,
    modeCfg: modeCfg,
    timeText: timeText,
    clockText: clockText,
    countdownText: countdownText,
    phaseOf: phaseOf,
    dayProgress: dayProgress,
    inClassAt: inClassAt,
    inCanteen: inCanteen,
    inTakeout: inTakeout,
    isDaytime: isDaytime,
    isNightForSleep: isNightForSleep,
    finish: finish,
    autoClass: autoClass,
    serialize: serialize,
    deserialize: deserialize,
    pushLog: pushLog,
    r1: r1,
    clamp: clamp
  };
})(typeof window !== 'undefined' ? window : globalThis);
