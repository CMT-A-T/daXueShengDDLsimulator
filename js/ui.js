/* ============================================================
 * 周末地狱 · 交稿倒计时 —— 界面
 * ============================================================ */
(function (root) {
  'use strict';

  var E = root.Engine, D = root.DATA;
  var state = null;
  var tab = 'paper';
  var startMode = 'std';
  var currentEvent = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function shortTime(t) {
    var d = new Date(t);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return '周' + '日一二三四五六'[d.getDay()] + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function pct(v) { return Math.round(v * 10) / 10; }

  /* ---------------- 数值/进度条动画 ---------------- */
  var prevBars = {};
  var prevNums = {};
  var prevTab = null;
  var reduceMotion = false;
  try {
    reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { reduceMotion = false; }

  function numText(v, dec) {
    if (!isFinite(v)) v = 0;
    return dec ? v.toFixed(dec) : String(Math.round(v));
  }
  function barHTML(key, value, extra) {
    var v = Math.max(0, Math.min(100, isFinite(value) ? value : 0));
    var from = prevBars[key] === undefined ? v : Math.max(0, Math.min(100, prevBars[key]));
    return '<i data-bar="' + key + '" data-from="' + from.toFixed(2) + '" data-to="' + v.toFixed(2) + '"' +
      ' style="width:' + from.toFixed(2) + '%' + (extra ? ';' + extra : '') + '"></i>';
  }
  function numRef(key, value, dec) {
    var v = isFinite(value) ? value : 0;
    var from = prevNums[key] === undefined ? v : prevNums[key];
    return {
      from: from,
      to: v,
      attr: 'data-num="' + key + '" data-from="' + from + '" data-to="' + v + '" data-dec="' + (dec || 0) + '"',
      text: numText(from, dec)
    };
  }
  function raf(fn) {
    if (root.requestAnimationFrame) root.requestAnimationFrame(fn);
    else setTimeout(fn, 16);
  }
  function animateBars() {
    var list = document.querySelectorAll ? document.querySelectorAll('[data-bar]') : [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var key = el.getAttribute('data-bar');
      var to = parseFloat(el.getAttribute('data-to'));
      var from = parseFloat(el.getAttribute('data-from'));
      prevBars[key] = to;
      if (reduceMotion || !isFinite(to) || !isFinite(from) || Math.abs(to - from) < 0.01) {
        el.style.width = to + '%';
        continue;
      }
      el.style.width = from + '%';
      if (el.offsetWidth !== undefined) { void el.offsetWidth; }
      (function (node, target) {
        // 两帧之后再改到目标值，确保浏览器先画出起点，过渡才会真正发生
        raf(function () {
          raf(function () { node.style.width = target + '%'; });
        });
      })(el, to);
    }
  }
  function animateNums() {
    var list = document.querySelectorAll ? document.querySelectorAll('[data-num]') : [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var key = el.getAttribute('data-num');
      var to = parseFloat(el.getAttribute('data-to'));
      var from = parseFloat(el.getAttribute('data-from'));
      var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
      prevNums[key] = to;
      if (reduceMotion || !isFinite(to) || !isFinite(from) || Math.abs(to - from) < 0.001) {
        el.textContent = numText(to, dec);
        continue;
      }
      (function (node, a, b, d) {
        var start = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
        var dur = 520;
        function step() {
          var now = (root.performance && root.performance.now) ? root.performance.now() : Date.now();
          var t = (now - start) / dur;
          if (t > 1) t = 1;
          var e = 1 - Math.pow(1 - t, 3);
          node.textContent = numText(a + (b - a) * e, d);
          if (t < 1) raf(step);
        }
        raf(step);
      })(el, from, to, dec);
    }
  }

  /* ---------------- 提示条 ---------------- */
  var toastTimer = null;
  function toast(text, kind) {
    var host = $('toasts');
    if (!host) return;
    var el = document.createElement('div');
    el.className = 'toast' + (kind === 'warn' ? ' is-warn' : '');
    el.textContent = text;
    host.appendChild(el);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    setTimeout(function () {
      el.style.transition = 'opacity .3s ease, transform .3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }, 2200);
  }

  /* ---------------- 弹层 ---------------- */
  var CN_DIGIT = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function cnToInt(str) {
    var total = 0, section = 0, number = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (CN_DIGIT[ch] !== undefined) { number = CN_DIGIT[ch]; continue; }
      var unit = ch === '十' ? 10 : ch === '百' ? 100 : ch === '千' ? 1000 : ch === '万' ? 10000 : 0;
      if (!unit) continue;
      if (number === 0) number = 1;
      if (unit === 10000) { section = (section + number) * unit; total += section; section = 0; }
      else section += number * unit;
      number = 0;
    }
    return total + section + number;
  }
  function toArabic(html) {
    html = html.replace(/这三天/g, '__THREE_DAYS__').replace(/一整天/g, '__WHOLE_DAY__');
    html = html.replace(/百分之([零一二三四五六七八九十百]+)/g, function (m, n) { return cnToInt(n) + '%'; });
    html = html.replace(/([零一二两三四五六七八九十百]+)(成)(半)?/g, function (m, n, cheng, half) {
      return (cnToInt(n) * 10 + (half ? 5 : 0)) + '%';
    });
    html = html.replace(/([零一二两三四五六七八九十百千万]+)(?=(小时|分钟|篇|千字|字|个|名|项|块|次|人|倍|天|年|岁|周|份|条|张|段|层|步|轮|局|场|件|以上|以下|月|日))/g, function (m, n) {
      return String(cnToInt(n));
    });
    html = html.replace(/半小时/g, '30分钟').replace(/一半/g, '50%');
    html = html.replace(/__THREE_DAYS__/g, '这三天').replace(/__WHOLE_DAY__/g, '一整天');
    return html;
  }

  var closeTimer = null;
  function openOverlay(html, cls) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    var o = $('overlay');
    o.className = 'overlay is-open' + (cls ? ' ' + cls : '');
    o.innerHTML = toArabic(html);
  }
  function closeOverlay() {
    var o = $('overlay');
    if (!o.innerHTML) { o.className = 'overlay'; return; }
    // 无 rAF 的环境（例如测试桩）直接关闭，避免残留的弹层挡住后续流程
    if (!root.requestAnimationFrame) {
      o.innerHTML = '';
      o.className = 'overlay';
      currentEvent = null;
      return;
    }
    o.classList.add('is-closing');
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(function () {
      o.innerHTML = '';
      o.className = 'overlay';
      currentEvent = null;
      closeTimer = null;
    }, 170);
  }

  /* ---------------- 存读档 ---------------- */
  function save() {
    if (!state) return;
    try { localStorage.setItem(E.SAVE_KEY, E.serialize(state)); } catch (e) { /* ignore */ }
  }
  function loadRaw() {
    try {
      var raw = localStorage.getItem(E.SAVE_KEY);
      if (!raw) return null;
      var s = E.deserialize(raw);
      if (!s || s.ended) return null;
      return s;
    } catch (e) { return null; }
  }
  function clearSave() {
    try { localStorage.removeItem(E.SAVE_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------------- 行动执行 ---------------- */
  function act(id, params) {
    if (!state || state.ended) return;
    var r = E.perform(state, id, params || {});
    if (!r.ok) { toast(r.reason || '现在做不了这件事', 'warn'); return; }
    save();
    drain();
  }

  function drain() {
    if (!state) return;
    if (!state.ended && E.autoClass) E.autoClass(state);
    if (state.ended) { clearSave(); render(); showEnd(); return; }
    var ev = E.popEvent(state);
    if (!ev) { render(); return; }
    render();
    showEvent(ev);
  }

  /* ---------------- 渲染：HUD ---------------- */
  function statHTML(key, icon, name, val) {
    var low = (key !== 'intel') && val < 20;
    var high = val >= 80;
    var n = numRef('stat:' + key, val, 0);
    return '<div class="stat stat--' + key + (low ? ' is-low' : '') + (high ? ' is-high' : '') + '">' +
      '<span class="stat-icon">' + icon + '</span>' +
      '<span class="stat-name">' + name + '</span>' +
      '<span class="stat-val" ' + n.attr + '>' + n.text + '</span>' +
      '<span class="stat-bar">' + barHTML('stat:' + key, val) + '</span>' +
      '</div>';
  }

  function hudHTML() {
    var s = state.stats;
    var eff = E.effFor(state, 'paper');
    var intel = s.intel - E.intelPenalty(state);
    var bm = E.bodyMod(state);
    var im = E.intelMod(state);
    var nb = numRef('mod:body', bm, 2);
    var ni = numRef('mod:intel', im, 2);
    var effectsHTML = effectsButtonHTML();
    return '' +
      '<div class="hud-clock">' +
        '<div class="hud-date">' + (new Date(state.time).getMonth() + 1) + ' 月 ' + new Date(state.time).getDate() + ' 日 · 周' + '日一二三四五六'[new Date(state.time).getDay()] + '</div>' +
        '<div class="hud-time">' + E.clockText(state.time) + '<em>' + E.timeText(state.time).split(' ')[1] + '</em></div>' +
        '<div class="hud-left">⏳ 距截止 <b>' + E.countdownText(state) + '</b></div>' + effectsHTML +
      '</div>' +
      '<div class="hud-stats">' +
        statHTML('h', '❤️', '健康', s.H) +
        statHTML('j', '⚡', '精力', s.J) +
        statHTML('x', '🙂', '心情', s.X) +
        statHTML('b', '🍚', '饱食', s.B) +
        statHTML('c', '🫧', '干净', s.C) +
        statHTML('intel', '🧠', '智力', intel) +
      '</div>' +
      '<div class="hud-right">' +
        '<div class="hud-mods">' +
          '<button type="button" class="mod' + (bm < 0.75 ? ' is-low' : '') + '" data-click="calc" data-calc="body" title="点击查看计算过程">' +
            '<small>身体状态</small><b>×<span ' + nb.attr + '>' + nb.text + '</span></b>' +
          '</button>' +
          '<button type="button" class="mod mod--intel" data-click="calc" data-calc="intel" title="点击查看计算过程">' +
            '<small>智力修正</small><b>×<span ' + ni.attr + '>' + ni.text + '</span></b>' +
          '</button>' +
        '</div>' +
        '<button type="button" class="eff' + (eff.value < 0.95 ? ' is-bad' : '') + '" data-click="calc" data-calc="eff" title="点击查看计算过程">' +
          '<small>效率</small><b>×' + eff.value.toFixed(2) + '</b>' +
        '</button>' +
        '<button class="icon-btn" data-click="help" title="规则说明 / 本局设置">？</button>' +
      '</div>';
  }

  /* ---------------- 渲染：标签页 ---------------- */
  function tabbarHTML() {
    var undone = state.papers.filter(function (p) { return E.progressOf(p) < 1; }).length;
    var mathBadge = state.math.started ? (E.mathComplete(state) ? '✓' : Math.round(E.teamProgress(state)) + '%') : '!';
    var lifeBadge = state.snacks > 0 ? '🍫' + state.snacks : '';
    function t(id, icon, label, badge) {
      return '<button class="tab' + (tab === id ? ' is-on' : '') + '" data-click="tab" data-tab="' + id + '">' +
        '<span>' + icon + '</span><span>' + label + '</span>' +
        (badge ? '<span class="tab-badge">' + badge + '</span>' : '') + '</button>';
    }
    return '<div class="tabs">' +
      t('paper', '📄', '论文', undone ? String(undone) : '✓') +
      t('math', '🧮', '数模', mathBadge) +
      t('life', '🌙', '生活', lifeBadge) +
      '</div>';
  }

  function chipHTML(r) {
    var cls = r.level === '高' ? 'chip--high' : r.level === '中' ? 'chip--mid' : 'chip--low';
    return '<span class="chip ' + cls + '"><b>' + esc(r.label) + '</b> ' + esc(r.text) +
      '<i class="lv">' + esc(r.level) + '</i></span>';
  }
  function chipsHTML(rows) {
    return rows.map(chipHTML).join('');
  }

  function actBtnHTML(id, params, label, icon, dur, pv, extra) {
    var disabled = !pv.ok;
    var attr = 'data-click="act" data-act="' + id + '"';
    if (params && params.paperId) attr += ' data-paper="' + params.paperId + '"';
    if (extra) attr += ' ' + extra;
    return '<button class="act" ' + attr + (disabled ? ' disabled title="' + esc(pv.reason) + '"' : '') + '>' +
      '<span class="act-top"><span class="act-ico">' + icon + '</span>' +
      '<span class="act-name">' + label + '</span>' +
      (dur ? '<span class="act-dur">' + dur + 'min</span>' : '') + '</span>' +
      (disabled ? '<span class="act-reason">' + esc(pv.reason) + '</span>'
        : '<span class="act-chips">' + chipsHTML(pv.rows) + '</span>') +
      '</button>';
  }

  function paperCardHTML(p) {
    var def = E.paperDef(p.id);
    var prog = E.progressOf(p) * 100;
    var done = prog >= 99.999;
    var wy = E.preview(state, 'paper_write', { paperId: p.id });
    var au = E.preview(state, 'paper_ai', { paperId: p.id });
    var rv = E.preview(state, 'paper_revise', { paperId: p.id, mode: 'C' });
    var combo = state.comboPaper === p.id;
    var goal = D.GOALS.perfect.papers[p.id];
    var tierHit = E.evaluate(state).papers.filter(function (x) { return x.id === p.id; })[0];
    var dots = ['pass', 'good', 'perfect'].map(function (t) {
      var label = t === 'pass' ? '普' : t === 'good' ? '良' : '完';
      return '<span class="dot-mini ' + (tierHit.met[t] ? 'on-' + t : '') + '">' + label + '</span>';
    }).join('');
    var nScore = numRef('paper:' + p.id + ':score', p.score, 1);
    var nAi = numRef('paper:' + p.id + ':ai', p.ai, 1);
    var nProg = numRef('paper:' + p.id + ':prog', prog, 0);
    return '<article class="paper-card' + (done ? ' is-done' : '') + '" style="--accent:' + def.accent + '">' +
      '<div class="paper-top">' +
        '<span class="paper-icon">' + def.icon + '</span>' +
        '<div><div class="paper-name">' + def.name + '</div>' +
        '<div class="paper-sub">' + def.note + ' · 目标 ≥' + goal.score + ' 分 / AI ≤' + goal.ai + '%</div></div>' +
        '<div class="paper-status">' + (combo ? '<span class="badge badge--accent">思路正顺</span>' : '') +
          (done ? '<span class="badge badge--good">字数达标</span>' : '<span class="badge">' + Math.round(prog) + '%</span>') +
          '<div class="goal-dots">' + dots + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="meters">' +
        '<div class="meter meter--score"><div class="meter-label"><span>分数</span><b class="' + (p.score >= goal.score ? 'is-good' : '') + '" ' + nScore.attr + '>' + nScore.text + '</b></div>' +
          '<div class="meter-bar">' + barHTML('paper:' + p.id + ':score', p.score) + '</div></div>' +
        '<div class="meter meter--ai"><div class="meter-label"><span>AI 率</span><b class="' + (p.ai <= goal.ai ? 'is-good' : 'is-bad') + '"><span ' + nAi.attr + '>' + nAi.text + '</span>%</b></div>' +
          '<div class="meter-bar">' + barHTML('paper:' + p.id + ':ai', p.ai) + '</div></div>' +
        '<div class="meter meter--prog"><div class="meter-label"><span>进度</span><b><span ' + nProg.attr + '>' + nProg.text + '</span>%</b></div>' +
          '<div class="meter-bar">' + barHTML('paper:' + p.id + ':prog', prog) + '</div></div>' +
      '</div>' +
      '<div class="actions">' +
        actBtnHTML('paper_write', { paperId: p.id }, '自己写', '✍️', 30, wy) +
        actBtnHTML('paper_ai', { paperId: p.id }, '用 AI 写', '🤖', 30, au) +
        (rv.ok
          ? '<button class="act" data-click="revise" data-paper="' + p.id + '">' +
              '<span class="act-top"><span class="act-ico">🛠️</span><span class="act-name">修改论文</span><span class="act-dur">30min</span></span>' +
              '<span class="act-chips">' + chipsHTML(rv.rows) + '</span></button>'
          : '<button class="act" disabled title="' + esc(rv.reason) + '">' +
              '<span class="act-top"><span class="act-ico">🛠️</span><span class="act-name">修改论文</span><span class="act-dur">30min</span></span>' +
              '<span class="act-reason">' + esc(rv.reason) + '</span></button>') +
      '</div>' +
      '</article>';
  }

  function paperTabHTML() {
    return '<div class="paper-list">' + state.papers.map(paperCardHTML).join('') + '</div>' +
      '<div class="tip" style="margin-top:12px">刚写完的论文分数不会太高：连续写同一篇，思路更顺；修改只提分数、降 AI 率，不增加字数，但同一篇每改一次，效果都会弱一些。AI 率超过上限，分数再高也不合格。</div>';
  }

  function mathTabHTML() {
    var m = state.math;
    if (!m.started) {
      var pv = E.preview(state, 'math_work', {});
      return '<div class="panel"><div class="panel-body">' +
        '<h3 class="modal-title">数学建模竞赛 · 今天开赛</h3>' +
        '<p class="hint" style="margin:0 0 14px">你和另外两个临时组队的同学得先分工。第一次做数模只需要分配任务，不消耗时间，但仍消耗精力。' +
        '分配之后，2名队友会每天各工作5小时（22:00–08:00休息），你只要推完自己那份。</p>' +
        '<div class="tip" style="margin-bottom:14px">队友每天只干5小时，晚上不干活，越晚开工越危险。建议今天就把任务分掉。</div>' +
        actBtnHTML('math_work', {}, '开始分配任务', '🧮', 0, pv) +
        '</div></div>';
    }
    var revealed = !!m.revealed;
    var tp = revealed ? Math.round(E.teamProgress(state)) : null;
    var my = Math.min(100, m.myProg / m.share * 100);
    var matesHTML = m.mates.map(function (mate, mi) {
      var p = Math.min(100, mate.prog / Math.max(1, mate.share) * 100);
      var q = revealed ? Math.round(mate.prog) + '% / ' + Math.round(mate.share) + '%' : '? / ' + Math.round(mate.share) + '%';
      return '<div class="mate' + (mate.prog >= mate.share ? ' is-done' : '') + '">' +
        '<div class="mate-avatar">' + (mate.prog >= mate.share ? '✅' : '🧑‍💻') + '</div>' +
        '<div><div class="mate-name">' + esc(mate.name) + ' <span>' + (mate.known === 'exact' ? '智力 ' + mate.intel : mate.known === 'rough' ? '智力约 ' + mate.estLow + '~' + mate.estHigh : '智力未知') + '</span></div>' +
        '<div class="mate-bar">' + barHTML('math:mate:' + mi, revealed ? p : 0) + '</div></div>' +
        '<div class="mate-q">' + q + '</div>' +
        '</div>';
    }).join('');
    var workPv = E.preview(state, 'math_work', {});
    var meetPv = E.preview(state, 'math_meeting', {});
    var nMathScore = numRef('math:score', m.score, 1);
    return '<div class="panel">' +
      '<div class="panel-head"><div class="panel-title"><span class="dot-mark" style="background:var(--math);box-shadow:0 0 12px var(--math)"></span>数学建模竞赛</div>' +
        '<span class="badge badge--accent">' + (E.mathComplete(state) ? '已完成' : '进行中') + '</span></div>' +
      '<div class="panel-body">' +
        '<div class="math-hero">' +
          '<div class="math-role">' +
            '<div class="role-name">' + (D.ROLES[m.role] ? D.ROLES[m.role].icon : '🧮') + ' ' + (D.ROLES[m.role] ? D.ROLES[m.role].name : '') + '</div>' +
            '<div class="role-meta">份额 ' + m.share + '% · 难度 ' + m.diff + '<br>' +
              '<span class="hint">你的进度 ' + pct(m.myProg) + '% / ' + m.share + '%</span></div>' +
            '<div class="meter-bar" style="margin-top:8px">' + barHTML('math:my', my, 'background:linear-gradient(90deg,#57d3a9,#9ef0c9)') + '</div>' +
          '</div>' +
          '<div class="math-score-card">' +
            '<div><div class="big-num"><span ' + nMathScore.attr + '>' + nMathScore.text + '</span><small>总体分</small></div></div>' +
            '<div class="hint">总进度：' + (revealed ? (tp + '%') : '<b>未知</b>（开一次小组会即可查看）') + '</div>' +
            '<div class="meter-bar">' + barHTML('math:team', revealed ? tp : 0, 'background:linear-gradient(90deg,#7c9cff,#c9d8ff)') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="mates" style="margin-top:12px">' + matesHTML + '</div>' +
        (E.bothMatesDone(state) ? '<div class="tip" style="margin-top:10px">两个人都完成了，正在一起帮你：你的数模效率提高四成，「寻求帮助」也不需要了。</div>' : '') +
        '<div class="math-actions">' +
          actBtnHTML('math_work', {}, '推进自己的部分', '🧮', 30, workPv) +
          actBtnHTML('math_meeting', {}, E.mathComplete(state) ? '开小组会（打磨论文）' : '开小组会', '☕', 30, meetPv) +
        '</div>' +
        '<div class="hint" style="margin-top:10px">队友每天最多工作5小时，22:00–08:00休息；小组会（八点到二十二点）能让他们当天多干两小时。总体进度达到百分之百后，小组会改为直接增加数模总分。</div>' +
      '</div></div>';
  }

  function lifeCardHTML(id, title, icon, pv, btnLabel, extraHTML, btnAttr) {
    var disabled = !pv.ok;
    var dur = D.ACTIONS[id] ? D.ACTIONS[id].dur : 0;
    return '<div class="life-card' + (disabled ? ' is-locked' : '') + '">' +
      '<div class="life-head"><span class="life-ico">' + icon + '</span><span class="life-name">' + title + '</span>' +
        '<span class="life-dur">' + (dur ? dur + 'min' : '不耗时') + '</span></div>' +
      '<div class="life-rows">' + (disabled ? '<span class="act-reason">' + esc(pv.reason) + '</span>' : chipsHTML(pv.rows)) + '</div>' +
      (extraHTML || '') +
      '<div class="life-foot">' +
        '<button class="mini-btn' + (disabled ? '' : ' is-primary') + '" data-act="' + id + '" data-click="act"' +
          (btnAttr || '') + (disabled ? ' disabled' : '') + '>' + btnLabel + '</button>' +
      '</div></div>';
  }

  function lifeTabHTML() {
    var s = state.stats;
    var delivery = '';
    if (state.delivery && !state.delivery.arrived && !state.delivery.stolen) {
      var mins = Math.max(0, Math.round((state.delivery.arriveAt - state.time) / 60000));
      delivery = '<div class="hint">🛵 外卖还有 ' + mins + ' 分钟送到（点了再等1小时）</div>';
    } else if (state.delivery && state.delivery.arrived && !state.delivery.stolen) {
      delivery = '<div class="hint">🛵 外卖已送达，趁热吃。</div>';
    } else if (state.delivery && state.delivery.stolen) {
      delivery = '<div class="hint">😭 外卖被偷了，先处理这件事。</div>';
    }
    var cards = [
      lifeCardHTML('attend', '认真听课', '📖', E.preview(state, 'attend', {}), '听 30 分钟'),
      lifeCardHTML('rest', '稍作休息', '😌', E.preview(state, 'rest', {}), '休息 1 小时'),
      lifeCardHTML('sleep_deep', '短时深度睡眠', '🛏️', E.preview(state, 'sleep_deep', {}), '睡 4 小时'),
      lifeCardHTML('sleep_full', '标准睡眠', '💤', E.preview(state, 'sleep_full', {}), '睡 8 小时'),
      lifeCardHTML('phone', '玩会游戏', '🎮', E.preview(state, 'phone', {}), '玩 30 分钟'),
      lifeCardHTML('sports', '去运动', '🏃', E.preview(state, 'sports', {}), '跑 1 小时'),
      lifeCardHTML('order_food', '点外卖', '🚚', E.preview(state, 'order_food', {}), '下单', delivery),
      lifeCardHTML('eat_takeout', '吃外卖', '🍱', E.preview(state, 'eat_takeout', {}), '吃掉'),
      lifeCardHTML('eat_canteen', '去食堂', '🍜', E.preview(state, 'eat_canteen', {}), '去吃'),
      lifeCardHTML('shop', '去小店', '🏪', E.preview(state, 'shop', {}), '买两份'),
      lifeCardHTML('snack', '吃零食', '🍫', E.preview(state, 'snack', {}), '吃1包' + (state.snacks ? '（剩 ' + state.snacks + '）' : '')),
      lifeCardHTML('shower', '洗澡', '🚿', E.preview(state, 'shower', {}), '洗 30 分钟')
    ];
    var mealTip = '食堂开放 06:00–09:00 / 11:00–13:30 / 17:00–19:00；外卖 06:00–22:00 配送，健康减二；饱食超过70就吃不下正餐。上课时不能吃正餐，只能吃零食。';
    return '<div class="life-grid">' + cards.join('') + '</div>' +
      '<div class="tip" style="margin-top:12px">' + mealTip +
      '<br>当前：饱食 ' + pct(s.B) + ' · 干净 ' + pct(s.C) + ' · 心情 ' + pct(s.X) + ' · 精力 ' + pct(s.J) +
      (s.J > 70 ? '（精力还算充沛，效率会高一些）' : s.J < 20 ? '（精力见底了，心情和健康都会往下掉）' : '') +
      (s.B < 10 ? '（饿肚子会掉健康！）' : '') + '</div>';
  }

  function adviceText() {
    var s = state.stats;
    if (E.inClassAt(state.time)) return '现在正在上课。你的效率只有平时的一半，每30分钟还要多花4点精力；可以听课、补觉、摸鱼，或者低效地赶论文。';
    if (s.J < 25) return '精力快见底了。低于20，每30分钟会掉1点健康和2点心情，效率也会下降；先睡一觉或玩会儿手机。';
    if (s.B < 15) return '饱食度快见底了。去食堂或者点外卖，别硬撑。';
    if (s.C < 45) return '干净度偏低了。洗个澡能回3点心情和10点精力。';
    if (state.drowsy) return '你还带着困倦：效率低15%，每30分钟掉1点心情。白天补够2小时，或者睡够6小时，才能消退。';
    if (!state.math.started) return '先去数模把任务分掉；队友要等你开工才会开始干活。';
    var undone = state.papers.filter(function (p) { return E.progressOf(p) < 1; });
    if (undone.length) return '先把论文字数写到百分之百；进度没满之前，修改提分很慢。';
    if (state.math.myProg < state.math.share - 1e-9) return '论文写完了，去推自己的数模进度；队友每天只干五小时。';
    if (!E.mathComplete(state)) return '你的部分做完了，剩下的等队友；可以顺手刷分数、降 AI 率。';
    return '目标都推进完了。剩下的时间，用来打磨分数、AI 率和健康吧。';
  }

  function classBannerHTML() {
    if (!E.inClassAt(state.time)) return '';
    return '<div class="class-banner">🏫 <b>正在上课</b> · 效率降低50% · 每30分钟额外消耗4点精力<br><span>只能写论文、改论文、用 AI、推进数模、玩游戏、稍作休息、吃零食或认真听课；不能吃饭、睡觉、运动、洗澡、点外卖，也不能开数模小会。</span></div>';
  }

  function dayStripHTML() {
    return '<div class="day-strip">' +
      '<span class="day-strip-head">⏳ 这三天</span>' +
      '<div class="day-chips">' +
        '<span class="day-chip">周一 08:00–11:30 · 上课（效率 -50%）</span>' +
        '<span class="day-chip">周一 14:00–16:00 · 上课（效率 -50%）</span>' +
        '<span class="day-chip day-chip--hot">周一 23:59 · 全部截止</span>' +
      '</div>' +
      '<div class="day-advice">💡 ' + adviceText() + '</div>' +
      '</div>';
  }

  function mainHTML(enter) {
    var body = tab === 'paper' ? paperTabHTML() : tab === 'math' ? mathTabHTML() : lifeTabHTML();
    return tabbarHTML() + classBannerHTML() +
      '<div class="tab-body' + (enter ? ' is-enter' : '') + '" data-tab="' + tab + '">' + body + '</div>' +
      dayStripHTML();
  }

  /* ---------------- 渲染：侧栏 ---------------- */
  function dotHTML(tier, met) {
    var label = tier === 'pass' ? '普' : tier === 'good' ? '良' : '完';
    return '<span class="dot-mini ' + (met ? 'on-' + tier : '') + '">' + label + '</span>';
  }

  function goalRowsHTML(ev) {
    var rows = ev.papers.map(function (p) {
      var goal = ev.goals.perfect.papers[p.id];
      return '<div class="goal">' +
        '<div class="goal-ico">' + p.def.icon + '</div>' +
        '<div class="goal-main">' +
          '<div class="goal-title">' + p.def.short + ' <em>' + p.score + ' 分</em></div>' +
          '<div class="goal-sub"><span>AI <b>' + p.ai + '%</b></span><span>进度 <b>' + p.prog + '%</b></span>' +
          '<span>目标 <b>≥' + goal.score + ' / ≤' + goal.ai + '%</b></span></div>' +
        '</div>' +
        '<div class="goal-dots">' + dotHTML('pass', p.met.pass) + dotHTML('good', p.met.good) + dotHTML('perfect', p.met.perfect) + '</div>' +
        '</div>';
    }).join('');
    var tm = ev.math;
    var revealed = state.math.started && state.math.revealed;
    rows += '<div class="goal">' +
      '<div class="goal-ico">🧮</div>' +
      '<div class="goal-main">' +
        '<div class="goal-title">数模竞赛 <em>' + tm.score + ' 分</em></div>' +
        '<div class="goal-sub"><span>总进度 <b>' + (revealed ? tm.progress + '%' : '未知') + '</b></span>' +
        '<span>目标 <b>100% / ≥75 分</b></span></div>' +
      '</div>' +
      '<div class="goal-dots">' + dotHTML('pass', tm.met.pass) + dotHTML('good', tm.met.good) + dotHTML('perfect', tm.met.perfect) + '</div>' +
      '</div>';
    rows += '<div class="goal">' +
      '<div class="goal-ico">❤️</div>' +
      '<div class="goal-main">' +
        '<div class="goal-title">健康 <em>' + ev.health.cur + '</em></div>' +
        '<div class="goal-sub"><span>目标 <b>≥70 / 82 / 93</b></span></div>' +
      '</div>' +
      '<div class="goal-dots">' + dotHTML('pass', ev.health.met.pass) + dotHTML('good', ev.health.met.good) + dotHTML('perfect', ev.health.met.perfect) + '</div>' +
      '</div>';
    return rows;
  }

  function sideHTML() {
    var ev = E.evaluate(state);
    var tier = ev.tierInfo;
    var goalPanel = '<section class="panel">' +
      '<div class="panel-head"><div class="panel-head goal-head"><div class="panel-title"><span class="dot-mark"></span>目标 · 周一 23:59</div>' +
      '<span class="tier-chip" style="color:' + tier.color + '"><i></i>' + (tier.id === 'fail' ? '尚未达标' : tier.name) + '</span></div></div>' +
      '<div class="panel-body" style="padding-top:6px"><div class="goal-list">' + goalRowsHTML(ev) + '</div>' +
      '<div class="hint" style="margin-top:8px">小方块 普/良/完 表示该条目是否达到对应档位；全项达标才升级。</div>' +
      '</div></section>';

    var teamPanel = '';
    if (state.math.started) {
      var mates = state.math.mates.map(function (m, mi) {
        var p = state.math.revealed ? Math.min(100, m.prog / Math.max(1, m.share) * 100) : 0;
        return '<div class="mate">' +
          '<div class="mate-avatar">' + (m.prog >= m.share ? '✅' : '🧑‍💻') + '</div>' +
          '<div><div class="mate-name">' + esc(m.name) + ' <span>' + (m.known === 'exact' ? '智力 ' + m.intel : m.known === 'rough' ? '智力约 ' + m.estLow + '~' + m.estHigh : '智力未知') + '</span></div>' +
          '<div class="mate-bar">' + barHTML('side:mate:' + mi, p) + '</div></div>' +
          '<div class="mate-q">' + (state.math.revealed ? Math.round(m.prog) + '%' : '?') + '</div>' +
          '</div>';
      }).join('');
      teamPanel = '<section class="panel"><div class="panel-head"><div class="panel-title"><span class="dot-mark" style="background:var(--math);box-shadow:0 0 12px var(--math)"></span>队友 <small>每天各干 5 小时</small></div></div>' +
        '<div class="panel-body" style="padding-top:10px"><div class="mates">' + mates + '</div></div></section>';
    }

    var logs = state.log.slice(0, 9).map(function (l) {
      return '<div class="log-item kind-' + l.kind + '"><span class="log-time">' + shortTime(l.t) + '</span>' +
        '<span class="log-text">' + esc(l.text) + '</span></div>';
    }).join('');
    var logPanel = '<section class="panel"><div class="panel-head"><div class="panel-title"><span class="dot-mark" style="background:var(--x);box-shadow:0 0 12px var(--x)"></span>记录</div></div>' +
      '<div class="panel-body" style="padding:6px 12px 10px"><div class="log-list">' + logs + '</div></div></section>';

    return goalPanel + teamPanel + logPanel;
  }

  function render() {
    if (!state) return;
    var switching = tab !== prevTab;
    prevTab = tab;
    document.body.setAttribute('data-phase', E.phaseOf(state.time));
    $('hud').innerHTML = toArabic(hudHTML());
    $('main').innerHTML = toArabic(mainHTML(switching));
    $('side').innerHTML = toArabic(sideHTML());
    animateBars();
    animateNums();
    document.title = E.clockText(state.time) + ' · 周末地狱';
  }

  /* ---------------- 事件弹窗 ---------------- */
  function showEvent(ev) {
    currentEvent = ev;
    var d = E.describeEvent(state, ev);
    var choices = d.choices.map(function (c, i) {
      var tone = c.tone ? ' tone-' + c.tone : '';
      return '<button class="choice' + tone + '" data-choice="' + i + '" style="animation-delay:' + (i * 45) + 'ms"' + (c.disabled ? ' disabled' : '') + '>' +
        '<span class="choice-idx">' + (i + 1) + '</span>' +
        '<span class="choice-main"><span class="choice-label">' + c.label + '</span>' +
        (c.sub ? '<span class="choice-sub">' + c.sub + '</span>' : '') + '</span></button>';
    }).join('');
    var html = '<div class="modal"><div class="modal-inner">' +
      '<div class="ev-head"><div class="ev-icon">' + d.icon + '</div><div><h3>' + d.title + '</h3>' +
      '<div class="ev-sub">' + E.timeText(state.time) + '</div></div></div>' +
      '<div class="ev-body">' + d.body + '</div>' +
      '<div class="choices">' + choices + '</div>' +
      '</div></div>';
    openOverlay(html);
  }

  function resolveChoice(idx) {
    if (!currentEvent) return;
    var ev = currentEvent;
    currentEvent = null;
    E.resolveEvent(state, ev, idx);
    closeOverlay();
    save();
    drain();
  }

  function showRevise(paperId) {
    var p = E.paperOf(state, paperId);
    var pv = E.previewRevise(state, paperId);
    function opt(mode, label, desc, rows) {
      return '<button class="choice" data-click="revise-mode" data-paper="' + paperId + '" data-mode="' + mode + '" style="animation-delay:' + (mode === 'A' ? 0 : mode === 'B' ? 45 : 90) + 'ms">' +
        '<span class="choice-idx">' + mode + '</span>' +
        '<span class="choice-main"><span class="choice-label">' + label + '</span>' +
        '<span class="choice-sub">' + desc + '</span>' +
        '<span class="revise-preview act-chips">' + chipsHTML(rows) + '</span></span></button>';
    }
    var html = '<div class="modal"><button class="modal-close" data-click="close">✕</button><div class="modal-inner">' +
      '<h3 class="modal-title">修改《' + E.paperDef(paperId).short + '》</h3>' +
      '<p class="modal-sub">当前：分数 ' + pct(p.score) + ' · AI 率 ' + pct(p.ai) + '% · 进度 ' + Math.round(E.progressOf(p) * 100) + '% · 这是第 ' + pv.n + ' 次修改，效果为上一次的 ×' + E.r1(pv.dim) + ' · 精力 -' + E.jCost(state, 'paper_revise') + '</p>' +
      '<div class="choices">' +
      opt('A', '注重论文质量', '这次把重点放在质量上，分数增量多六成，但 AI 率不会下降。', pv.A) +
      opt('B', '注重降低 AI 率', '这次把重点放在降 AI 率上，降幅多六成，但分数不会增加。', pv.B) +
      opt('C', '正常修改，不作偏重', '分数和 AI 率同时小幅改善。', pv.C) +
      '</div></div></div>';
    openOverlay(html);
  }

  /* ---------------- 开始界面 ---------------- */
  function vitalsHTML() {
    var items = [
      ['健康', '75', '❤️'], ['精力', '55', '⚡'], ['心情', '45', '🙂'],
      ['饱食', '40', '🍚'], ['干净', '85', '🫧'], ['智力', '82', '🧠']
    ];
    return items.map(function (x) {
      return '<div class="vital"><span>' + x[2] + ' ' + x[0] + '</span><b>' + x[1] + '</b><small>上限 100</small></div>';
    }).join('');
  }

  function renderStart() {
    var saved = loadRaw();
    var rules = D.TEXTS.rules.map(function (r) {
      return '<div class="rule"><div class="rule-title"><span>' + r.icon + '</span>' + r.title + '</div>' +
        '<div class="rule-body">' + r.body + '</div></div>';
    }).join('');
    var html = '<div class="start"><div class="start-inner">' +
      '<div class="start-kicker">2024.10.26 SAT 08:00 → 2024.10.28 MON 23:59</div>' +
      '<h1 class="start-title">' + D.TEXTS.title + '</h1>' +
      '<div class="start-sub">' + D.TEXTS.subtitle + '</div>' +
      '<div class="start-tag">' + D.TEXTS.tagline + '</div>' +
      '<p class="start-story">' + D.TEXTS.story + '</p>' +
      '<p class="start-quote">' + D.TEXTS.quote + '</p>' +
      '<div class="start-stats">' + vitalsHTML() + '</div>' +
      '<div class="start-diff">' +
        '<button class="diff' + (startMode === 'std' ? ' is-on' : '') + '" data-click="mode" data-mode="std">' +
        '<b>⚖️ 标准模式 <span class="badge badge--good">推荐</span></b>' +
        '<small>' + E.MODES.std.note + '</small></button>' +
        '<button class="diff' + (startMode === 'raw' ? ' is-on' : '') + '" data-click="mode" data-mode="raw">' +
        '<b>🔥 原版数值</b><small>' + E.MODES.raw.note + '</small></button>' +
      '</div>' +
      '<div class="start-actions">' +
        '<button class="btn-primary" data-click="start">开始这三天</button>' +
        (saved ? '<button class="btn-ghost" data-click="continue">继续上次（' + E.timeText(saved.time) + '）</button>' : '') +
      '</div>' +
      '<div class="rules-grid">' + rules + '</div>' +
      '<details style="margin-top:16px"><summary class="hint" style="cursor:pointer;color:var(--muted)">数值来源与平衡说明（公式丢失处如何补全）</summary>' +
      '<div class="hint" style="margin-top:8px">' + D.TEXTS.balanceBody + '</div></details>' +
      '<div class="start-foot">全部数值与事件来自工作区 basic.txt / 细节.txt。“AI 率”是论文的 AIGC 检测比例，超标即不合格。游戏会自动存档在浏览器本地。</div>' +
      '</div></div>';
    openOverlay(html);
  }

  function resetAnim() {
    prevBars = {};
    prevNums = {};
    prevTab = null;
  }

  function startGame(mode) {
    state = E.newState(mode);
    tab = 'paper';
    resetAnim();
    closeOverlay();
    save();
    render();
    toast('周六早上8点。你坐起身，还有64小时。');
  }

  function continueGame() {
    var s = loadRaw();
    if (!s) { toast('没有可用的存档', 'warn'); return; }
    state = s;
    resetAnim();
    closeOverlay();
    render();
    drain();
  }

  /* ---------------- 帮助 ---------------- */
  function showHelp() {
    var rules = D.TEXTS.rules.map(function (r) {
      return '<div class="rule"><div class="rule-title"><span>' + r.icon + '</span>' + r.title + '</div>' +
        '<div class="rule-body">' + r.body + '</div></div>';
    }).join('');
    var tips = D.TEXTS.tips.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    var html = '<div class="modal"><button class="modal-close" data-click="close">✕</button><div class="modal-inner">' +
      '<h3 class="modal-title">这三天的规则</h3>' +
      '<p class="modal-sub">当前模式：' + E.MODES[state.mode].name + ' · ' + E.MODES[state.mode].note + '</p>' +
      '<div class="rules-grid">' + rules + '</div>' +
      '<details style="margin-top:14px"><summary class="hint" style="cursor:pointer;color:var(--muted)">数值来源与平衡说明</summary>' +
      '<div class="hint" style="margin-top:8px">' + D.TEXTS.balanceBody + '</div></details>' +
      '<div class="hint" style="margin-top:14px"><b>小提示</b><ul style="margin:6px 0 0;padding-left:18px;line-height:1.9">' + tips + '</ul></div>' +
      '<div class="start-actions"><button class="btn-primary" data-click="close">继续游戏</button>' +
      '<button class="btn-ghost" data-click="finish-ask">结束本局并结算</button></div>' +
      '</div></div>';
    openOverlay(html);
  }

  function confirmFinish() {
    var html = '<div class="modal"><div class="modal-inner">' +
      '<h3 class="modal-title">现在结算？</h3>' +
      '<p class="hint">这一局会立刻结束，按当前进度评级；没完成的目标，不会再有时间补救。</p>' +
      '<div class="start-actions"><button class="btn-primary" data-click="finish-yes">确认结束</button>' +
      '<button class="btn-ghost" data-click="close">再想想</button></div>' +
      '</div></div>';
    openOverlay(html);
  }

  /* ---------------- 计算量 / 公式 ---------------- */
  var calcKind = 'body';

  function calcRow(label, value, formulaId) {
    return '<button class="calc-row" data-click="calc-formula" data-formula="' + formulaId + '">' +
      '<span>' + label + '</span><b>' + value + '</b><small>查看公式</small></button>';
  }

  function currentEffects() {
    var s = state.stats;
    var out = [];
    var wi = E.worryInfo(state);
    if (wi.rate > 0.005) {
      out.push({ name: '担忧', desc: '心情 -' + wi.rate.toFixed(2) + '/小时', calc: 'worry', rate: wi.rate });
    }
    if (state.drowsy) out.push({ name: '困倦', desc: '效率 -15%，每30分钟心情 -1' });
    if (E.inClassAt(state.time)) out.push({ name: '正在上课', desc: '效率 -50%，每30分钟精力 -4' });
    if (s.J > 70) out.push({ name: '精力充沛', desc: '效率 +10%' });
    if (s.J < 20) out.push({ name: '力竭', desc: '心情 -2/30分钟，健康 -1/30分钟，效率 -20%' });
    if (s.X > 85) out.push({ name: '心情良好', desc: '效率 +10%，健康 +1/6小时，精力消耗 -10%，精力回复 +10%' });
    if (s.X < 30) out.push({ name: '压力山大', desc: '效率 -20%，健康 -1/4小时，精力消耗 +20%，精力回复 -20%' });
    if (s.C > 75) out.push({ name: '清爽洁净', desc: '心情 +1/4小时，健康 +1/10小时' });
    if (s.C < 40) out.push({ name: '有些脏', desc: '心情 -1/小时' });
    if (s.C < 20) out.push({ name: '肮脏', desc: '心情 -2/小时，健康 -1/4小时' });
    if (s.B < 30) out.push({ name: '饥饿', desc: '心情 -1/小时' });
    if (s.B < 10) out.push({ name: '非常饿', desc: '心情 -2/30分钟，健康 -1/小时' });
    if (s.B > 70) out.push({ name: '饱腹', desc: '心情 +1/小时，精力 +1/30分钟' });
    if (state.flags.slackUntil > state.time) out.push({ name: '硬撑着', desc: '效率 -10%' });
    if (state.comboPaper) {
      var cp = E.paperDef(state.comboPaper);
      out.push({ name: '连续写作', desc: (cp ? '《' + cp.short + '》' : '') + '效率 +20%' });
    }
    var phone = E.intelPenalty(state);
    if (phone > 0) out.push({ name: '手机影响', desc: '智力暂时 -' + E.r1(phone) });
    state.buffs.forEach(function (b) {
      var parts = [];
      if (b.eff) parts.push('效率 ' + (b.eff > 0 ? '+' : '') + Math.round(b.eff * 100) + '%');
      if (b.score) parts.push('分数效率 ' + (b.score > 0 ? '+' : '') + Math.round(b.score * 100) + '%');
      if (!parts.length) return;
      var left = b.until > state.time ? Math.max(0, Math.round((b.until - state.time) / 60000)) : 0;
      out.push({ name: b.label || '小组会效果', desc: parts.join('，') + (left ? '，剩余 ' + left + ' 分钟' : '') });
    });
    return out;
  }

  function effectsButtonHTML() {
    var fx = currentEffects();
    var worry = null;
    for (var i = 0; i < fx.length; i++) if (fx[i].name === '担忧') worry = fx[i];
    var summary = worry ? ('担忧 心情 -' + worry.rate.toFixed(2) + '/小时') : (fx.length ? fx.slice(0, 2).map(function (x) { return x.name; }).join(' · ') : '暂无');
    return '<button type="button" class="hud-effects" data-click="effects" title="点击查看当前状态效果">✨ 当前状态效果 <b>' + fx.length + '</b><small>' + summary + '</small></button>';
  }

  function openEffects() {
    var fx = currentEffects();
    var rows = fx.map(function (x) {
      var body = '<span class="effect-name">' + x.name + '</span><span class="effect-desc">' + x.desc + '</span>';
      if (x.calc) {
        return '<button type="button" class="effect-row is-link" data-click="calc" data-calc="' + x.calc + '">' + body + '<small>查看计算 ›</small></button>';
      }
      return '<div class="effect-row">' + body + '</div>';
    }).join('');
    var html = '<div class="modal calc-modal"><button class="modal-close" data-click="close">✕</button><div class="modal-inner">' +
      '<h3 class="modal-title">当前状态效果</h3>' +
      '<p class="modal-sub">共 ' + fx.length + ' 项。这些效果会持续影响你的数值和效率。</p>' +
      (fx.length ? '<div class="effect-list">' + rows + '</div>' : '<p class="hint">现在没有额外的状态效果。</p>') +
      '<div class="start-actions"><button class="btn-primary" data-click="close">知道了</button></div>' +
      '</div></div>';
    openOverlay(html);
  }

  function openCalc(kind) {
    calcKind = kind || 'body';
    var s = state.stats;
    var rows = [];
    var title = '';
    if (calcKind === 'body') {
      title = '身体状态';
      var ch = 4 * s.H / 100, cj = 2 * s.J / 100, cx = 3 * s.X / 100, cb = s.B / 100;
      var sum = ch + cj + cx + cb;
      rows = [
        calcRow('健康 ' + E.r1(s.H), '4 × ' + (s.H / 100).toFixed(2) + ' = ' + E.r1(ch), 'body:h'),
        calcRow('精力 ' + E.r1(s.J), '2 × ' + (s.J / 100).toFixed(2) + ' = ' + E.r1(cj), 'body:j'),
        calcRow('心情 ' + E.r1(s.X), '3 × ' + (s.X / 100).toFixed(2) + ' = ' + E.r1(cx), 'body:x'),
        calcRow('饱食 ' + E.r1(s.B), (s.B / 100).toFixed(2) + ' = ' + E.r1(cb), 'body:b'),
        calcRow('四项合计', E.r1(sum), 'body:sum'),
        calcRow('身体状态', '1.2 × ' + E.r1(sum) + ' ÷ 10 = ' + E.r1(E.bodyMod(state)), 'body:total')
      ];
    } else if (calcKind === 'intel') {
      title = '智力修正';
      var pen = E.intelPenalty(state);
      rows = [
        calcRow('智力', E.r1(s.intel), 'intel:main'),
        calcRow('手机临时惩罚', pen ? '-' + E.r1(pen) : '0', 'intel:penalty'),
        calcRow('有效智力', E.r1(s.intel - pen), 'intel:penalty'),
        calcRow('智力修正', '÷ 60 = ' + E.r1(E.intelMod(state)), 'intel:main')
      ];
    } else if (calcKind === 'eff') {
      title = '效率';
      var ef = E.effFor(state, 'paper');
      rows = [calcRow('基础', '1.00', 'eff:base')];
      ef.list.forEach(function (x, i) {
        rows.push(calcRow(x.label, (x.delta > 0 ? '+' : '') + x.delta.toFixed(2), 'eff:item:' + i));
      });
      rows.push(calcRow('合计', '× ' + ef.value.toFixed(2), 'eff:total'));
    } else {
      title = '担忧';
      var wi = E.worryInfo(state);
      rows = [
        calcRow('第几天', '第 ' + wi.day + ' 天', 'worry:day'),
        calcRow('论文剩余均值', Math.round(wi.paperRem * 100) + '%', 'worry:papers'),
        calcRow('数模剩余', Math.round(wi.mathRem * 100) + '%', 'worry:math'),
        calcRow('未完成指数', '(' + Math.round(wi.paperRem * 100) + '% + 2×' + Math.round(wi.mathRem * 100) + '%) ÷ 3 = ' + Math.round(wi.index * 100) + '%', 'worry:index'),
        calcRow('心情', '-' + wi.rate.toFixed(2) + '/小时', 'worry:total'),
        calcRow('计算', '1.2 × ' + wi.day + ' × ' + wi.index.toFixed(2) + ' = ' + wi.rate.toFixed(2), 'worry:total')
      ];
    }
    var sub = calcKind === 'worry' ? '担忧扣的是心情，不会扣别的数值。下面是当前的计算过程。' : '这是当前的计算量。点击任意一行，可以看到它对应的完整公式。';
    var html = '<div class="modal calc-modal"><button class="modal-close" data-click="close">✕</button><div class="modal-inner">' +
      '<h3 class="modal-title">' + title + '</h3>' +
      '<p class="modal-sub">' + sub + '</p>' +
      '<div class="calc-list">' + rows.join('') + '</div>' +
      '<div class="start-actions"><button class="btn-primary" data-click="close">知道了</button></div>' +
      '</div></div>';
    openOverlay(html);
  }

  function formulaInfo(id) {
    var s = state.stats;
    var h = s.H / 100, j = s.J / 100, x = s.X / 100, b = s.B / 100;
    if (id === 'body:h') return { title: '健康贡献', formula: '4 × 健康% = 4 × ' + h.toFixed(2) + ' = ' + E.r1(4 * h), note: '健康% = 健康 ÷ 100。' };
    if (id === 'body:j') return { title: '精力贡献', formula: '2 × 精力% = 2 × ' + j.toFixed(2) + ' = ' + E.r1(2 * j), note: '精力% = 精力 ÷ 100。' };
    if (id === 'body:x') return { title: '心情贡献', formula: '3 × 心情% = 3 × ' + x.toFixed(2) + ' = ' + E.r1(3 * x), note: '心情% = 心情 ÷ 100。' };
    if (id === 'body:b') return { title: '饱食贡献', formula: '饱食% = ' + b.toFixed(2) + ' = ' + E.r1(b), note: '饱食% = 饱食 ÷ 100。' };
    if (id === 'body:sum') return { title: '四项合计', formula: '健康贡献 + 精力贡献 + 心情贡献 + 饱食贡献 = ' + E.r1(4 * h + 2 * j + 3 * x + b), note: '这四项相加，得到身体状态的中间值。' };
    if (id === 'body:total') return { title: '身体状态', formula: '身体状态 = 1.2 × (4 × 健康% + 2 × 精力% + 3 × 心情% + 饱食%) ÷ 10', note: '健康%、精力%、心情%、饱食% 都等于对应数值除以 100。' };
    if (id === 'intel:main') return { title: '智力修正', formula: '智力修正 = 智力 ÷ 60', note: '玩会游戏会让智力临时下降，一小时后恢复。' };
    if (id === 'intel:penalty') return { title: '有效智力', formula: '有效智力 = 智力 − 手机临时惩罚', note: '每次玩会游戏临时降低 6 点智力，多次叠加，最多降低 24 点。' };
    if (id === 'eff:base') return { title: '基础效率', formula: '基础效率 = 1.00', note: '所有加成和惩罚都在 1.00 的基础上加减。' };
    if (id === 'eff:total') return { title: '效率', formula: '效率 = 1 + 所有加成 − 所有惩罚（最低 10%）', note: '行动卡上的效率已经把这些全部算进去了。' };
    if (id.indexOf('eff:item:') === 0) {
      var idx = parseInt(id.split(':')[2], 10);
      var item = E.effFor(state, 'paper').list[idx];
      if (item) return { title: item.label, formula: item.label + '：效率 ' + (item.delta > 0 ? '+' : '') + item.delta.toFixed(2), note: '这一项直接加到总效率里。' };
    }
    if (id === 'worry:day') return { title: '第几天', formula: '第几天 = 从周六开始数的日历天，周六是第 1 天。', note: '越接近周一，担忧越重。' };
    if (id === 'worry:papers') return { title: '论文剩余均值', formula: '论文剩余均值 = 3 篇论文各自剩余进度的平均值', note: '每篇论文的剩余进度 = 1 − 进度。' };
    if (id === 'worry:math') return { title: '数模剩余', formula: '数模剩余 = 1 − 总体进度 ÷ 100%', note: '总体进度达到 100% 后，这一项为 0。' };
    if (id === 'worry:index') return { title: '未完成指数', formula: '未完成指数 = (论文剩余均值 + 2 × 数模剩余) ÷ 3', note: '数模占的权重是论文的两倍。' };
    return { title: '担忧', formula: '心情下降 = 1.2 × 当前天数 × ((论文剩余均值 + 2 × 数模剩余) ÷ 3) 每小时', note: '担忧只扣心情；睡觉时不生效。' };
  }

  function openFormula(id) {
    var f = formulaInfo(id);
    var html = '<div class="modal calc-modal"><button class="modal-close" data-click="close">✕</button><div class="modal-inner">' +
      '<h3 class="modal-title">' + f.title + '</h3>' +
      '<div class="formula-box">' + f.formula + '</div>' +
      '<p class="hint" style="margin-top:12px">' + f.note + '</p>' +
      '<div class="start-actions"><button class="btn-ghost" data-click="calc" data-calc="' + calcKind + '">返回计算量</button>' +
      '<button class="btn-primary" data-click="close">知道了</button></div>' +
      '</div></div>';
    openOverlay(html);
  }

  /* ---------------- 结算 ---------------- */
  function showEnd() {
    var ev = E.evaluate(state);
    var info = ev.tierInfo;
    var descs = {
      perfect: '你几乎把每小时都用在了刀刃上：论文分数、AI 率、数模分数和身体状态都刚好踩在线上。这个周末，你赢了。',
      good: '三篇论文按时交上，数模也顺利收尾，身体还算撑得住。不算完美，但你活下来了。',
      pass: '你勉强交齐了东西，成绩和状态都只能说「过了」。周一早上，你会庆幸自己至少动了手。',
      fail: '时间到了。有些东西没能在23:59之前交出去；这个周末的代价，你周一就知道了。'
    };
    var refTier = ev.tier === 'fail' ? 'pass' : ev.tier;
    var paperRows = ev.papers.map(function (p) {
      return '<div class="end-row ' + (p.met[refTier] ? 'ok' : 'no') + '"><span>' + p.def.short + '</span>' +
        '<b>' + p.score + ' 分 · AI ' + p.ai + '% · ' + p.prog + '%</b></div>';
    }).join('');
    var mathRow = '<div class="end-row ' + (ev.math.met[refTier] ? 'ok' : 'no') + '"><span>数模竞赛</span>' +
      '<b>' + ev.math.progress + '% · ' + ev.math.score + ' 分</b></div>';
    var healthRow = '<div class="end-row ' + (ev.health.met[refTier] ? 'ok' : 'no') + '"><span>健康</span><b>' + ev.health.cur + '</b></div>';
    var statsRow = '<div class="end-row"><span>健康 / 精力 / 心情</span><b>' + pct(state.stats.H) + ' / ' + pct(state.stats.J) + ' / ' + pct(state.stats.X) + '</b></div>' +
      '<div class="end-row"><span>饱食 / 干净</span><b>' + pct(state.stats.B) + ' / ' + pct(state.stats.C) + '</b></div>' +
      '<div class="end-row"><span>行动次数</span><b>' + state.stats2.actions + '</b></div>';
    var html = '<div class="modal end-card" style="--tier-color:' + info.color + '">' +
      '<div class="modal-inner">' +
      '<div class="end-hero"><div class="end-tier">' + (state.endReason === 'deadline' ? '周一 23:59 · 截止' : '提前结算') + '</div>' +
      '<div class="end-name">' + info.name + '</div>' +
      '<div class="end-desc">' + descs[ev.tier] + '</div></div>' +
      '<div class="end-grid">' +
      '<div class="end-block"><h4>论文</h4>' + paperRows + '</div>' +
      '<div class="end-block"><h4>竞赛与状态</h4>' + mathRow + healthRow + statsRow + '</div>' +
      '</div>' +
      '<div class="end-actions"><button class="btn-primary" data-click="replay">再来一局</button>' +
      '<button class="btn-ghost" data-click="end-close">留在这里看看</button></div>' +
      '</div></div>';
    openOverlay(html);
    clearSave();
  }

  /* ---------------- 事件委托 ---------------- */
  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-click]') : null;
    if (!t) return;
    var k = t.getAttribute('data-click');
    if (k === 'tab') { tab = t.getAttribute('data-tab'); render(); return; }
    if (k === 'act') {
      var id = t.getAttribute('data-act');
      var paper = t.getAttribute('data-paper') || undefined;
      act(id, { paperId: paper });
      return;
    }
    if (k === 'revise') { showRevise(t.getAttribute('data-paper')); return; }
    if (k === 'revise-mode') {
      var pid = t.getAttribute('data-paper'), mode = t.getAttribute('data-mode');
      closeOverlay();
      act('paper_revise', { paperId: pid, mode: mode });
      return;
    }
    if (k === 'help') { showHelp(); return; }
    if (k === 'effects') { openEffects(); return; }
    if (k === 'calc') { openCalc(t.getAttribute('data-calc')); return; }
    if (k === 'calc-formula') { openFormula(t.getAttribute('data-formula')); return; }
    if (k === 'close') { closeOverlay(); return; }
    if (k === 'mode') {
      startMode = t.getAttribute('data-mode');
      renderStart();
      return;
    }
    if (k === 'start') { startGame(startMode); return; }
    if (k === 'continue') { continueGame(); return; }
    if (k === 'finish-ask') { confirmFinish(); return; }
    if (k === 'finish-yes') { E.finish(state); closeOverlay(); save(); drain(); return; }
    if (k === 'replay') { clearSave(); state = null; document.title = D.TEXTS.title; renderStart(); return; }
    if (k === 'end-close') { closeOverlay(); return; }
  }

  function onChoice(e) {
    var t = e.target.closest ? e.target.closest('[data-choice]') : null;
    if (!t) return;
    resolveChoice(parseInt(t.getAttribute('data-choice'), 10));
  }

  function boot() {
    var overlay = $('overlay');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-choice]')) { onChoice(e); return; }
        onClick(e);
      });
    }
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#overlay')) return;
      onClick(e);
    });
    window.addEventListener('beforeunload', function () { if (state && !state.ended) save(); });
    renderStart();
  }

  root.GameUI = {
    boot: boot,
    render: render,
    renderStart: renderStart,
    startGame: startGame,
    getState: function () { return state; },
    _onClick: onClick,
    _resolveChoice: resolveChoice,
    _showEvent: showEvent,
    _act: act,
    _setTab: function (t) { tab = t; render(); },
    _getTab: function () { return tab; },
    _showEnd: showEnd,
    _showHelp: showHelp,
    _showRevise: showRevise,
    _showEffects: openEffects,
    _openCalc: openCalc,
    _openFormula: openFormula,
    _openOverlay: openOverlay,
    _closeOverlay: closeOverlay
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
