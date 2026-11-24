/* ふたりの予定 — フロントエンド（ビルド不要の素の JS。LINE内ブラウザでも動くよう古めの構文に統一） */
(function () {
  'use strict';

  var JP = window.JPDate;
  var $app = document.getElementById('app');
  var $sheetRoot = document.getElementById('sheet-root');
  var $toast = document.getElementById('toast');

  var POLL_MS = 3000;        // 画面を開いている間の同期間隔
  var POLL_HIDDEN_MS = 30000;
  var FETCH_TIMEOUT_MS = 30000; // サーバー側の最大実行時間より長く取る（遅れて届く古い書き込みを防ぐ）

  var DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
  var PERIOD_LABEL = { noon: '昼', night: '夜', all: '' };

  /* ---------- 小物 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.5-4.2M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.2M20 20v-4h-4"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
    off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M3 3l18 18"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>'
  };

  var toastTimer;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.className = 'toast show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.className = 'toast'; }, 2400);
  }

  /* ---------- 端末内の保存（識別用トークンのみ。空き状況は保存しない） ---------- */
  var memStore = null;
  var storageOk = true;
  function loadStore() {
    try {
      var s = window.localStorage.getItem('futari:v1');
      if (s) { var o = JSON.parse(s); if (o && o.cals) return o; }
    } catch (e) { storageOk = false; }
    return memStore || { cals: {}, last: null };
  }
  function saveStore(st) {
    memStore = st;
    try { window.localStorage.setItem('futari:v1', JSON.stringify(st)); } catch (e) { storageOk = false; }
  }
  // サーバーが控えとして渡すクッキー（futari_<カレンダーID>）から鍵を読む。
  // localStorage が自動で消されても（iPhone の Safari 系は約7日触らないと消す）、ここから復元できる。
  function cookieToken(id) {
    try {
      var name = 'futari_' + id + '=', parts = document.cookie.split('; ');
      for (var i = 0; i < parts.length; i++) if (parts[i].indexOf(name) === 0) return parts[i].slice(name.length);
    } catch (e) { /* クッキー不可 */ }
    return '';
  }
  function cookieIds() {
    var out = [];
    try {
      document.cookie.split('; ').forEach(function (c) {
        var m = /^futari_([0-9a-f-]{36})=./.exec(c);
        if (m) out.push(m[1]);
      });
    } catch (e) { /* クッキー不可 */ }
    return out;
  }
  // 鍵が無効だと分かったカレンダーは、この端末の保存データとクッキーから消す（毎回「開けません」で固まらないように）
  function forgetCal(id) {
    var st = loadStore(); delete st.cals[id]; if (st.last === id) st.last = null; saveStore(st);
    try { document.cookie = 'futari_' + id + '=; Max-Age=0; Path=/'; } catch (e) { /* noop */ }
  }
  function rememberCal(id, token, myName) {
    var st = loadStore();
    st.cals[id] = { token: token, myName: myName, at: Date.now() };
    st.last = id;
    saveStore(st);
  }

  /* ---------- API ---------- */
  function api(path, body, token, keepalive) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, FETCH_TIMEOUT_MS) : null;
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch('/api/' + path, {
      method: 'POST', headers: headers, body: JSON.stringify(body || {}), cache: 'no-store',
      keepalive: !!keepalive, signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'http_' + r.status); e.status = r.status; e.code = j.error; throw e; }
        return j;
      });
    }, function (err) { if (timer) clearTimeout(timer); throw err; });
  }

  /* ---------- 共有カレンダーのセッション ---------- */
  var C = null; // 開いているカレンダー

  function newSession(id, token) {
    return {
      id: id, token: token, alive: true, loaded: false,
      me: { name: loadStore().cals[id] ? loadStore().cals[id].myName : '' }, partner: null, invite: null,
      rev: null, mine: {}, theirs: {},          // サーバー上の最新状態（key -> code）
      presets: { weekday: ['U9', 'U18', 'S21'], night: ['U21', 'U23'] },
      desired: {}, inflight: {},                 // 未送信 / 送信中の自分の変更（key -> code。''は解除）
      sending: false, failing: false, failCount: 0, epoch: 0, savedAt: 0,
      online: true, needFull: false, polling: false,
      month: monthOf(JP.today()), dragging: false, editing: false,
      plans: [], day: null,                      // 確定した予定の一覧 / 開いている日のシート
      flushT: null, pollT: null
    };
  }
  function monthOf(d) { var p = JP.parse(d); return { y: p.y, m: p.m }; }
  function keyOf(date, period) { return date + '|' + period; }
  function size(o) { return Object.keys(o).length; }

  /* 空きの状態は code で表す: ''=未選択 / 'F'=終日 / 'U18'=18時まで / 'S21'=21時から */
  function myCode(k) {
    if (k in C.desired) return C.desired[k];
    if (k in C.inflight) return C.inflight[k];
    return C.mine[k] || '';
  }
  function isMine(k) { return !!myCode(k); }
  function unsavedState(k) {
    if (!(k in C.desired) && !(k in C.inflight)) return '';
    return C.failing ? 'failed' : 'pending';
  }
  // 1項目の表示状態。st: none / mine / theirs / both(時間が重なる) / cross(両方空きだが時間がすれ違う)
  // text: セルに載せる短い範囲表記、long: 読み上げ・一覧用
  function slotInfo(k) {
    var a = myCode(k), b = C.theirs[k] || '';
    var noon = k.slice(-5) === '|noon'; // 昼には範囲が無いので、文字は出さない（印だけ）
    var short = function (r) { return noon ? '' : JP.rangeShort(r); };
    if (a && b) {
      var ov = JP.overlap(a, b);
      return ov ? { st: 'both', text: short(ov), long: JP.rangeLong(ov) } : { st: 'cross', text: '', long: '' };
    }
    var c = a || b, r = c ? JP.codeRange(c) : null;
    return { st: a ? 'mine' : b ? 'theirs' : 'none', text: r ? short(r) : '', long: r ? JP.rangeLong(r) : '' };
  }

  /* タップした直後に「何を登録したか」を言葉で出す（印や小さい文字だけだと、終日・解除・何時からが分かりにくいため） */
  function codeText(code) { return !code ? '解除（空きの登録なし）' : code === 'F' ? '終日 空き' : JP.rangeLong(JP.codeRange(code)) + ' 空き'; }
  function codeShort(code) { return !code ? '解除' : code === 'F' ? '終日' : JP.rangeShort(JP.codeRange(code)); }
  function slotName(k) {
    var p = k.split('|'), d = JP.parse(p[0]);
    return d.m + '/' + d.d + '(' + DOW_LABELS[JP.dow(p[0])] + ')' + (p[1] === 'all' ? '' : ' ' + PERIOD_LABEL[p[1]]);
  }
  function announce(k, code) {
    toast(slotName(k) + '：' + codeText(code) + ' ／ 次のタップ：' + codeShort(nextCode(k.split('|')[1], code)));
  }
  function stateOf(k) { return slotInfo(k).st; }

  /* タップで切り替える順番: 未選択 → 終日 → 自分のパターン… → 未選択（昼は 未選択 ⇄ 終日 のみ） */
  function cycleList(period) {
    var l = ['', 'F'];
    if (period === 'all') l = l.concat(C.presets.weekday);
    else if (period === 'night') l = l.concat(C.presets.night);
    return l;
  }
  function nextCode(period, cur) {
    var l = cycleList(period), i = l.indexOf(cur);
    return i < 0 ? '' : l[(i + 1) % l.length];
  }

  /* 変更の送信: 常に1リクエストずつ。最後の指定が勝ち、変更した項目だけ送る */
  function setCodes(map) {
    Object.keys(map).forEach(function (k) {
      var code = map[k];
      // 送信待ち・送信中でなく、すでに同じ状態なら何もしない
      if (!(k in C.desired) && !(k in C.inflight) && (C.mine[k] || '') === code) return;
      C.desired[k] = code;
    });
    if (size(C.desired)) scheduleFlush(150);
    paint();
  }
  function scheduleFlush(ms) {
    clearTimeout(C.flushT);
    var s = C;
    C.flushT = setTimeout(function () { if (C === s) flush(); }, ms);
  }
  function flush() {
    if (!C || C.sending || !size(C.desired)) return;
    var s = C;
    var batch = C.desired;
    C.desired = {}; C.inflight = batch; C.sending = true;
    var changes = Object.keys(batch).map(function (k) {
      var p = k.split('|'); return { date: p[0], period: p[1], code: batch[k] };
    });
    paint();
    api('set', { id: s.id, changes: changes }, s.token, true).then(function () {
      if (C !== s) return;
      s.sending = false;
      Object.keys(batch).forEach(function (k) { if (batch[k]) s.mine[k] = batch[k]; else delete s.mine[k]; });
      s.inflight = {}; s.epoch++; s.failing = false; s.failCount = 0; s.savedAt = Date.now();
      setOnline(true);
      if (size(s.desired)) scheduleFlush(0);
      paint();
      setTimeout(function () { if (C === s) paint(); }, 2600);
    }, function (e) {
      if (C !== s) return;
      s.sending = false;
      if (e.status === 403) { forgetCal(s.id); return showForbidden(); }
      if (e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
        // 内容が受け付けられない変更（日付が過ぎた等）は破棄して最新に戻す
        s.inflight = {}; s.epoch++; s.rev = null;
        toast('一部の変更は保存できませんでした');
        if (size(s.desired)) scheduleFlush(0);
        paint(); pollSoon(0);
        return;
      }
      // 通信失敗・サーバー障害: 変更は消さずに「未保存」として保持し、再試行する
      Object.keys(batch).forEach(function (k) { if (!(k in s.desired)) s.desired[k] = batch[k]; });
      s.inflight = {}; s.failing = true; s.failCount++;
      if (!(e.status > 0)) setOnline(false);
      paint();
      scheduleFlush(Math.min(1000 * Math.pow(2, s.failCount - 1), 10000));
    });
  }
  function retryNow() { if (C) { C.failCount = 0; scheduleFlush(0); pollSoon(0); } }
  function discardUnsaved() {
    if (!C) return;
    C.desired = {}; C.failing = false; C.rev = null;
    clearTimeout(C.flushT);
    paint(); pollSoon(0);
  }

  /* 同期: 3秒ごとに版番号だけ確認し、変わっていれば最新を取得する */
  function setOnline(v) {
    if (!C) return;
    if (C.online && !v) C.needFull = true;   // 切断を挟んだら復帰時に必ず全件取り直す
    var was = C.online;
    C.online = v;
    if (!was && v) { toast('再接続しました'); if (size(C.desired)) scheduleFlush(0); }
    if (was !== v) paint();
  }
  function pollSoon(ms) {
    if (!C) return;
    clearTimeout(C.pollT);
    var s = C;
    C.pollT = setTimeout(function () { if (C === s) poll(); }, ms);
  }
  function poll() {
    if (!C || C.polling) return;
    var s = C, epoch = s.epoch;
    s.polling = true;
    var sendRev = s.needFull ? null : s.rev;
    api('state', { id: s.id, rev: sendRev }, s.token).then(function (r) {
      if (C !== s) return;
      s.polling = false;
      setOnline(true);
      if (r.unchanged) { s.loaded = true; return next(); }
      if (epoch !== s.epoch) return pollSoon(250); // 取得中に自分の保存が完了した: 古い可能性があるので取り直す
      s.needFull = false;
      var prevPartner = s.partner;
      s.rev = r.rev; s.me = r.me; s.partner = r.partner; s.invite = r.invite;
      s.mine = toCodes(r.mine, r.mineW); s.theirs = toCodes(r.theirs, r.theirsW);
      if (r.presets) s.presets = r.presets;
      s.plans = r.plans || [];
      if (!s.loaded) { s.loaded = true; }
      else if (!prevPartner && r.partner) toast(r.partner.name + 'さんが参加しました');
      var st = loadStore();
      if (st.cals[s.id] && st.cals[s.id].myName !== r.me.name) { st.cals[s.id].myName = r.me.name; saveStore(st); }
      renderCalendar();
      if (C.day && !C.day.form) renderDay();
      next();
    }, function (e) {
      if (C !== s) return;
      s.polling = false;
      if (e.status === 403) { forgetCal(s.id); return showForbidden(); }
      if (!(e.status > 0) || e.status >= 500) setOnline(false);
      paint();
      pollSoon(Math.min(2000 * (s.online ? 1 : 2), 10000));
    });
    function next() { pollSoon(document.hidden ? POLL_HIDDEN_MS : POLL_MS); }
  }
  // サーバーの mine/theirs（項目の一覧）と mineW/theirsW（終日以外の範囲）を key -> code にまとめる
  function toCodes(arr, win) {
    var o = {}; win = win || {};
    (arr || []).forEach(function (k) { o[k] = win[k] || 'F'; });
    return o;
  }

  function stopSession() {
    if (!C) return;
    C.alive = false; clearTimeout(C.flushT); clearTimeout(C.pollT);
    C = null;
  }

  /* 画面に戻った・回線が戻った時はすぐ最新を取りに行く */
  document.addEventListener('visibilitychange', function () { if (!document.hidden && C) { pollSoon(0); if (size(C.desired)) scheduleFlush(0); } });
  window.addEventListener('focus', function () { if (C) pollSoon(0); });
  window.addEventListener('pageshow', function () { if (C) pollSoon(0); });
  window.addEventListener('online', function () { if (C) { C.needFull = true; pollSoon(0); if (size(C.desired)) scheduleFlush(0); } });
  window.addEventListener('offline', function () { if (C) setOnline(false); });

  /* ---------- 画面: カレンダー ---------- */
  function openCalendar(id) {
    var st = loadStore();
    var entry = st.cals[id];
    if (!entry) { // 端末の保存データに無くても、控えのクッキーに鍵があれば復元する
      var ct = cookieToken(id);
      if (ct) { rememberCal(id, ct, ''); st = loadStore(); entry = st.cals[id]; }
    }
    stopSession();
    if (!entry) return showForbidden(true);
    st.last = id; saveStore(st);
    C = newSession(id, entry.token);
    history.replaceState(null, '', '/#/c/' + id);
    $app.innerHTML = '<p class="boot">読み込み中…</p>';
    poll();
  }

  function renderCalendar() {
    if (!C || !C.loaded) return;
    var y = C.month.y, m = C.month.m;
    var today = JP.today();
    var first = JP.fmt(y, m, 1);
    var lead = (JP.dow(first) + 6) % 7; // 月曜始まり
    var n = JP.daysInMonth(y, m);
    var cells = '';
    var i;
    for (i = 0; i < lead; i++) cells += '<div class="cell empty"></div>';
    for (var d = 1; d <= n; d++) {
      var date = JP.fmt(y, m, d);
      var past = date < today;
      var hol = JP.holidayName(date);
      var w = JP.dow(date);
      var cls = (date === today ? ' today' : '');
      var head = '<span class="num">' + d + '</span>' + (hol ? '<span class="hol" title="' + esc(hol) + '">祝</span>' : '');
      // 1日のセル: 上段＝あなた（タップで変更）／下段＝相手（見るだけ）。土日祝は 昼・夜 の2段ずつ
      var periods = JP.periodsOf(date), meRows = '', ptRows = '';
      periods.forEach(function (p) {
        var pn = p === 'all' ? '' : '<b class="pn">' + PERIOD_LABEL[p] + '</b>';
        meRows += '<button type="button" class="sr" data-who="me" data-date="' + date + '" data-period="' + p + '">' + pn + '<span class="mk"></span><span class="wl"></span></button>';
        ptRows += '<div class="sr" data-who="pt" data-pp="' + p + '">' + pn + '<span class="mk"></span><span class="wl"></span></div>';
      });
      cells += '<div class="cell ' + (periods.length === 1 ? 'day' : 'off') + cls + (past ? ' is-past' : '') + '" data-cell="' + date + '"' + (past ? ' data-past="1"' : '') + '>' +
        '<div class="head">' + head + '</div><div class="half me">' + meRows + '</div><div class="half pt">' + ptRows + '</div><span class="pm"></span></div>';
    }
    var dows = [1, 2, 3, 4, 5, 6, 0].map(function (w) {
      return '<button type="button" class="dow' + (w === 6 ? ' sat' : w === 0 ? ' sun' : '') + '" data-action="dow" data-dow="' + w + '" aria-label="' + DOW_LABELS[w] + '曜日をまとめて選択">' + DOW_LABELS[w] + '</button>';
    }).join('');

    var minM = monthOf(JP.addDays(today, -366)), maxM = monthOf(JP.addDays(today, 731));
    var atMin = (y * 12 + m) <= (minM.y * 12 + minM.m), atMax = (y * 12 + m) >= (maxM.y * 12 + maxM.m);
    var ptName = C.partner ? esc(C.partner.name) : '参加待ち';

    $app.innerHTML =
      '<header class="top"><h1>ふたりの予定</h1><button type="button" class="icon-btn" data-action="settings" aria-label="設定">' + ICON.gear + '</button></header>' +
      '<section class="people">' +
        '<div class="person"><div class="av me">' + esc([].concat(C.me.name)[0] ? Array.from(C.me.name)[0] : '？') + '</div><span class="tag">あなた</span><span class="nm">' + esc(C.me.name) + '</span></div>' +
        '<div class="sync" id="sync"></div>' +
        '<div class="person"><div class="av ' + (C.partner ? 'pt' : 'wait') + '">' + (C.partner ? esc(Array.from(C.partner.name)[0]) : '？') + '</div><span class="tag">相手</span><span class="nm">' + ptName + '</span></div>' +
      '</section>' +
      '<div id="banner"></div>' +
      '<div id="nextplan"></div>' +
      '<nav class="month"><button type="button" class="nav-btn" data-action="prev" aria-label="前の月"' + (atMin ? ' disabled' : '') + '>' + ICON.left + '</button>' +
        '<button type="button" class="month-title" data-action="months">' + y + '年' + m + '月' + ICON.down + '</button>' +
        '<button type="button" class="nav-btn" data-action="next" aria-label="次の月"' + (atMax ? ' disabled' : '') + '>' + ICON.right + '</button></nav>' +
      '<div class="dows" id="dows">' + dows + '</div>' +
      '<div class="grid" id="grid">' + cells + '</div>' +
      '<section class="legend" aria-label="凡例">' +
        '<span><i class="sw me"></i>上段：あなた</span>' +
        '<span><i class="sw pt"></i>下段：' + (C.partner ? esc(C.partner.name) : '相手') + '</span>' +
        '<span><i class="sw ok"></i>ふたりとも空き（時間が重なる）</span>' +
        '<span><i class="sw cross"></i>時間がすれ違い</span>' +
        '<span><i class="sw none"></i>未選択</span>' +
        '<span><i class="sw plan"></i>確定した予定</span>' +
        '<span><i class="today-chip">' + Number(today.slice(8)) + '</i>今日</span>' +
      '</section>' +
      '<p class="note">各日の<b>上段があなたの欄</b>、下段は相手の欄（見るだけ）です。空きを変えるときは、下の「編集する」を押してから上段をタップ。タップするたびに「終日 → 〜9 → 〜18 → 21〜 → 解除」と切り替わります（時刻は設定で変更）。</p>' +
      '<p class="note small">日付をタップすると、その日の2人の空きと予定を見られます（編集中以外）。曜日（月・火…）をタップでその月をまとめて、横になぞって連続で選べます。<br>未選択は「空きの登録なし」で、予定があるという意味ではありません。</p>' +
      '<section class="card"><h2>確定した予定</h2><div id="plans"></div></section>' +
      '<section class="card"><h2>ふたりが空いている日</h2><div id="matches"></div></section>' +
      '<div id="invite-area"></div>' +
      '<div class="editbar"><button type="button" id="editbtn" data-action="edit"></button></div>';
    paint();
  }

  /* 状態に応じて変わる部分だけを更新する（ドラッグ中でも要素を作り直さない） */
  function paint() {
    if (!C || !C.loaded || !document.getElementById('grid')) return;
    var cells = document.querySelectorAll('#grid [data-cell]');
    var byDate = plansByDate();
    var ptName = C.partner ? C.partner.name : '相手';
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i], date = cell.getAttribute('data-cell'), periods = JP.periodsOf(date), matched = 0;
      for (var j = 0; j < periods.length; j++) {
        var p = periods[j], k = keyOf(date, p), info = slotInfo(k), u = unsavedState(k);
        var x = info.st === 'both' ? 'match' : info.st === 'cross' ? 'cross' : '';
        if (x === 'match') matched++;
        var mine = myCode(k), theirs = C.theirs[k] || '';
        var me = cell.querySelector('.sr[data-period="' + p + '"]'), pt = cell.querySelector('.sr[data-pp="' + p + '"]');
        paintRow(me, mine, x, u, p);
        me.setAttribute('aria-pressed', mine ? 'true' : 'false');
        me.setAttribute('aria-label', labelFor(date, p, info, u));
        paintRow(pt, theirs, x, '', p);
        pt.setAttribute('aria-label', ptName + ': ' + (theirs ? codeText(theirs) : '未選択'));
      }
      setAttr(cell, 'data-match', matched === periods.length ? 'all' : matched ? 'some' : 'none');
      // 確定した予定: セルにオレンジの枠と短いタイトルを出す
      var list = byDate[date] || [], pm = cell.querySelector('.pm');
      var pmText = list.length ? list[0].title + (list.length > 1 ? ' ほか' + (list.length - 1) : '') : '';
      if (pm.textContent !== pmText) pm.textContent = pmText;
      if (cell.classList.contains('has-plan') !== !!list.length) cell.classList.toggle('has-plan', !!list.length);
    }
    paintSync();
    paintMatches();
    paintPlans();
    paintNextPlan();
    paintInvite();
    paintEdit();
  }

  function setAttr(el, name, v) {
    if (v === '' || v == null) { if (el.hasAttribute(name)) el.removeAttribute(name); }
    else if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  }
  // 1段（あなた or 相手）の表示。set=その人が空きを登録している / x=match(時間が重なる)・cross(すれ違い)
  function paintRow(el, code, x, u, p) {
    var text = code && p !== 'noon' ? JP.rangeShort(JP.codeRange(code)) : ''; // 昼には範囲が無いので文字は出さない
    var wl = el.querySelector('.wl');
    if (wl.textContent !== text) wl.textContent = text;
    setAttr(el, 'data-st', code ? 'set' : 'none');
    setAttr(el, 'data-x', code ? x : '');
    setAttr(el, 'data-hasl', text ? '1' : '');
    setAttr(el, 'data-unsaved', u);
  }

  function paintEdit() {
    var btn = document.getElementById('editbtn'), grid = document.getElementById('grid'), dows = document.getElementById('dows');
    if (!btn) return;
    var on = !!C.editing;
    var label = on ? '✓ 編集を終わる' : '✏ 編集する';
    if (btn.textContent !== label) btn.textContent = label;
    btn.className = on ? 'on' : '';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    grid.className = 'grid' + (on ? ' editing' : '');
    dows.className = 'dows' + (on ? '' : ' locked');
  }

  var STATE_TEXT = { none: '未選択', mine: '自分だけ空き', theirs: '相手だけ空き', both: 'ふたりとも空き', cross: '両方空きだが時間がすれ違い' };
  function labelFor(date, period, info, u) {
    var p = JP.parse(date);
    var t = p.m + '月' + p.d + '日(' + DOW_LABELS[JP.dow(date)] + ')' + (period !== 'all' ? ' ' + PERIOD_LABEL[period] : '');
    var hol = JP.holidayName(date);
    return t + (hol ? ' ' + hol : '') + ': ' + STATE_TEXT[info.st] + (info.long ? '（' + info.long + '）' : '') +
      (u === 'pending' ? '（保存中）' : u === 'failed' ? '（未保存）' : '');
  }

  function paintSync() {
    var el = document.getElementById('sync'), bn = document.getElementById('banner');
    if (!el) return;
    var pending = size(C.desired) + size(C.inflight);
    var cls, icon, text;
    if (C.failing) { cls = 'err'; icon = ICON.warn; text = '保存できていません'; }
    else if (!C.online) { cls = 'off'; icon = ICON.off; text = pending ? 'オフライン（未保存）' : 'オフライン'; }
    else if (pending) { cls = 'saving'; icon = ICON.sync; text = '保存中…'; }
    else if (Date.now() - C.savedAt < 2500) { cls = 'ok'; icon = ICON.sync; text = '保存しました'; }
    else { cls = 'ok'; icon = ICON.sync; text = '同期済み'; }
    var html = icon + text;
    if (el.getAttribute('data-k') !== cls + text) { el.className = 'sync ' + cls; el.innerHTML = html; el.setAttribute('data-k', cls + text); }

    var b = '';
    if (C.failing) {
      b = '<div class="banner err">⚠ 変更を保存できていません。破線・赤枠の日はまだ相手に届いていません。通信が戻り次第、自動で再試行します。' +
        '<div class="row"><button type="button" data-action="retry">今すぐ再試行</button><button type="button" data-action="discard">変更を取り消す</button></div></div>';
    } else if (!C.online) {
      b = '<div class="banner off">オフラインです。再接続すると最新の状態に更新されます。' + (pending ? '未保存の変更は再接続後に保存します。' : '') + '</div>';
    }
    if (bn.getAttribute('data-k') !== b) { bn.innerHTML = b; bn.setAttribute('data-k', b); }
  }

  function matchesOfMonth() {
    var y = C.month.y, m = C.month.m, today = JP.today(), out = [];
    for (var d = 1; d <= JP.daysInMonth(y, m); d++) {
      var date = JP.fmt(y, m, d);
      if (date < today) continue;
      var ps = JP.periodsOf(date).filter(function (p) { return stateOf(keyOf(date, p)) === 'both'; });
      if (ps.length) out.push({ date: date, periods: ps, d: d, longs: ps.map(function (p) { return slotInfo(keyOf(date, p)).long; }) });
    }
    return out;
  }
  function paintMatches() {
    var el = document.getElementById('matches');
    if (!el) return;
    var html;
    if (!C.partner) html = '<p class="empty-msg">相手が参加すると、ふたりとも空いている日がここに出ます。</p>';
    else {
      var list = matchesOfMonth();
      html = list.length ? '<div class="chips">' + list.map(function (x) {
        var t = C.month.m + '/' + x.d + '(' + DOW_LABELS[JP.dow(x.date)] + ')';
        if (x.periods[0] === 'all') { if (x.longs[0]) t += ' ' + x.longs[0]; }
        else t += ' ' + x.periods.map(function (p, i) { return PERIOD_LABEL[p] + (x.longs[i] ? '(' + x.longs[i] + ')' : ''); }).join('・');
        return '<button type="button" class="chip" data-action="openday" data-form="1" data-date="' + x.date + '">' + t + '</button>';
      }).join('') + '</div><p class="hint-s">日付をタップすると、そのまま予定を確定できます。</p>' : '<p class="empty-msg">この月はまだ、ふたりが重なる日がありません。</p>';
    }
    if (el.getAttribute('data-k') !== html) { el.innerHTML = html; el.setAttribute('data-k', html); }
  }

  /* ---------- 確定した予定（「この日に飲みに行く」など） ---------- */
  var planMapCache = { plans: null, map: null };
  function plansByDate() {
    if (planMapCache.plans === C.plans) return planMapCache.map;
    var m = {};
    C.plans.forEach(function (p) { (m[p.date] = m[p.date] || []).push(p); });
    planMapCache = { plans: C.plans, map: m };
    return m;
  }
  function dateLabel(date) { var p = JP.parse(date); return p.m + '/' + p.d + '(' + DOW_LABELS[JP.dow(date)] + ')'; }
  function daysUntil(date) {
    var a = JP.parse(JP.today()), b = JP.parse(date);
    return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
  }
  function untilText(date) {
    var d = daysUntil(date);
    return d === 0 ? '今日' : d === 1 ? '明日' : d > 0 ? 'あと' + d + '日' : (-d) + '日前';
  }
  function planRowHtml(p) {
    var y = JP.parse(p.date).y, thisY = Number(JP.today().slice(0, 4));
    return '<button type="button" class="plan-row" data-action="openday" data-date="' + p.date + '">' +
      '<span class="d">' + dateLabel(p.date) + '<small>' + (y !== thisY ? y + '年 ' : '') + untilText(p.date) + '</small></span>' +
      '<span><span class="t">' + esc(p.title) + '</span>' + (p.memo ? '<span class="m" style="display:block">' + esc(p.memo) + '</span>' : '') + '</span></button>';
  }
  function paintPlans() {
    var el = document.getElementById('plans');
    if (!el) return;
    var today = JP.today();
    var up = C.plans.filter(function (p) { return p.date >= today; });
    var past = C.plans.filter(function (p) { return p.date < today; }).reverse().slice(0, 30);
    var open = !!el.querySelector('details.past[open]');
    var html = up.length ? '<div class="planlist">' + up.map(planRowHtml).join('') + '</div>'
      : '<p class="empty-msg">まだありません。ふたりで日を決めたら、その日をタップして「予定を確定」しておくと、あとで見返せます。</p>';
    if (past.length) html += '<details class="past"' + (open ? ' open' : '') + '><summary>過ぎた予定（' + past.length + '件）</summary><div class="planlist">' + past.map(planRowHtml).join('') + '</div></details>';
    if (el.getAttribute('data-k') !== html) { el.innerHTML = html; el.setAttribute('data-k', html); }
  }
  function paintNextPlan() {
    var el = document.getElementById('nextplan');
    if (!el) return;
    var today = JP.today(), n = null;
    for (var i = 0; i < C.plans.length; i++) if (C.plans[i].date >= today) { n = C.plans[i]; break; }
    var html = n ? '<button type="button" class="nextplan" data-action="openday" data-date="' + n.date + '"><span class="tg">次の予定</span><span class="tx">' +
      dateLabel(n.date) + ' ' + esc(n.title) + '</span><span class="dd">' + untilText(n.date) + '</span></button>' : '';
    if (el.getAttribute('data-k') !== html) { el.innerHTML = html; el.setAttribute('data-k', html); }
  }

  // 日付をタップしたときのシート: その日の2人の空き・確定した予定・予定の追加/編集/削除
  var QUICK_TITLES = ['飲み', 'ごはん', 'ランチ', '映画', '旅行', '買い物'];
  function openDay(date, startForm) {
    openSheet('<div id="day-body"></div>', function (root) { root.addEventListener('click', onDayClick); });
    C.day = { date: date, form: null };
    if (startForm && !(plansByDate()[date] || []).length) C.day.form = { id: null };
    renderDay();
  }
  function availTag(code, who, per) {
    if (!code) return '<span class="tag2 none">未選択</span>';
    var t = per === 'noon' || code === 'F' ? (per === 'noon' ? '空き' : '終日') : JP.rangeLong(JP.codeRange(code));
    return '<span class="tag2 ' + who + '">' + t + '</span>';
  }
  function renderDay() {
    var body = document.getElementById('day-body');
    if (!body || !C || !C.day) return;
    var date = C.day.date, p = JP.parse(date), hol = JP.holidayName(date), list = plansByDate()[date] || [];
    var ptName = C.partner ? esc(C.partner.name) : '相手';
    var h = '<h2>' + p.m + '月' + p.d + '日(' + DOW_LABELS[JP.dow(date)] + ')' + (hol ? '<span class="hol-tag">' + esc(hol) + '</span>' : '') + '</h2>';
    h += '<table class="avail"><tr><th></th><th>あなた</th><th>' + ptName + '</th><th>重なり</th></tr>';
    JP.periodsOf(date).forEach(function (per) {
      var k = keyOf(date, per), info = slotInfo(k);
      var ov = info.st === 'both' ? '<span class="tag2 ok">一致' + (per === 'noon' ? '' : ' ' + (info.long || '終日')) + '</span>'
        : info.st === 'cross' ? '<span class="tag2 cross">すれ違い</span>' : '<span class="tag2 none">—</span>';
      h += '<tr><td><b>' + (per === 'all' ? 'この日' : PERIOD_LABEL[per]) + '</b></td><td>' + availTag(myCode(k), 'me', per) + '</td><td>' + availTag(C.theirs[k] || '', 'pt', per) + '</td><td>' + ov + '</td></tr>';
    });
    h += '</table><h3>確定した予定</h3>';
    var f = C.day.form;
    if (!list.length && !f) h += '<p class="hint-s" style="margin-top:2px">この日の予定はまだありません。</p>';
    list.forEach(function (pl) {
      if (f && f.id === pl.id) return; // 編集中の予定は下のフォームに出す
      h += '<div class="plan-item"><div class="t">' + esc(pl.title) + '</div>' + (pl.memo ? '<div class="m">' + esc(pl.memo) + '</div>' : '') +
        '<div class="acts"><button type="button" data-act="edit" data-id="' + pl.id + '">編集</button><button type="button" class="del" data-act="del" data-id="' + pl.id + '">削除</button></div></div>';
    });
    if (f) {
      var ed = f.id ? list.filter(function (x) { return x.id === f.id; })[0] : null;
      h += '<div class="field"><label for="pl-title">' + (ed ? '予定を編集' : 'この日の予定') + '（タイトル）</label><input id="pl-title" maxlength="30" placeholder="例: 飲みに行く" value="' + esc(ed ? ed.title : '') + '"></div>' +
        '<div class="quick">' + QUICK_TITLES.map(function (q) { return '<button type="button" data-act="quick" data-q="' + q + '">' + q + '</button>'; }).join('') + '</div>' +
        '<div class="field"><label for="pl-memo">メモ（時間・場所など）</label><textarea id="pl-memo" maxlength="200" placeholder="例: 19時 渋谷駅集合">' + esc(ed ? ed.memo : '') + '</textarea></div>' +
        '<p class="err-text" id="pl-err" role="alert"></p>' +
        '<div class="btnrow"><button type="button" class="btn half" data-act="cancel">キャンセル</button><button type="button" class="btn half plan" data-act="save">' + (ed ? '更新する' : '確定する') + '</button></div>';
    } else {
      h += '<button type="button" class="btn plan" data-act="new">＋ この日の予定を確定する</button>';
    }
    body.innerHTML = h;
    if (f && !f.id) { var t = document.getElementById('pl-title'); if (t) try { t.focus(); } catch (x) { /* noop */ } }
  }
  function onDayClick(e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || !C || !C.day) return;
    var act = b.getAttribute('data-act');
    if (act === 'new') { C.day.form = { id: null }; renderDay(); }
    else if (act === 'edit') { C.day.form = { id: b.getAttribute('data-id') }; renderDay(); }
    else if (act === 'cancel') { C.day.form = null; renderDay(); }
    else if (act === 'quick') { var inp = document.getElementById('pl-title'); if (inp) inp.value = b.getAttribute('data-q'); }
    else if (act === 'save') savePlan(b);
    else if (act === 'del') deletePlan(b.getAttribute('data-id'));
  }
  function planError(e, el) {
    if (e.status === 403) { forgetCal(C.id); return showForbidden(); }
    if (e.status === 404) { pollSoon(0); C.rev = null; }
    if (el) el.textContent = e.status === 409 ? '1日に登録できる予定は5件までです' : e.status === 404 ? 'この予定はすでに削除されています' :
      e.status === 400 ? '入力内容を確認してください（タイトル30文字・メモ200文字まで）' : '保存できませんでした。通信を確認してもう一度お試しください';
  }
  function applyPlans(plans) { C.plans = plans; C.epoch++; paint(); } // 取得中だった古い一覧で上書きされないよう epoch を進める
  function savePlan(btn) {
    var s = C, f = s.day.form;
    var title = document.getElementById('pl-title').value.trim(), memo = document.getElementById('pl-memo').value, err = document.getElementById('pl-err');
    if (!title || Array.from(title).length > 30) { err.textContent = 'タイトルを1〜30文字で入力してください'; return; }
    if (Array.from(memo).length > 200) { err.textContent = 'メモは200文字までです'; return; }
    btn.disabled = true; err.textContent = '';
    var plan = { date: s.day.date, title: title, memo: memo };
    if (f.id) plan.id = f.id;
    api('plan', { id: s.id, op: 'save', plan: plan }, s.token).then(function (r) {
      if (C !== s) return;
      applyPlans(r.plans);
      if (s.day) s.day.form = null;
      renderDay();
      toast(f.id ? '予定を更新しました' : '予定を確定しました');
    }, function (e) { if (C !== s) return; btn.disabled = false; planError(e, err); });
  }
  function deletePlan(id) {
    if (!window.confirm('この予定を削除します。よろしいですか？')) return;
    var s = C;
    api('plan', { id: s.id, op: 'delete', planId: id }, s.token).then(function (r) {
      if (C !== s) return;
      applyPlans(r.plans); renderDay(); toast('予定を削除しました');
    }, function (e) { if (C !== s) return; planError(e, null); toast('削除できませんでした。通信を確認してもう一度お試しください'); });
  }

  function inviteUrl() { return location.origin + '/?join=' + C.id + '.' + C.invite; }
  function paintInvite() {
    var el = document.getElementById('invite-area');
    if (!el) return;
    var html = C.invite
      ? '<button type="button" class="btn line" data-action="line">LINEで招待リンクを送る</button><button type="button" class="btn" data-action="copyInvite">' + ICON.link + '招待リンクをコピー</button><p class="note small">相手がリンクを開いて名前を入れると、同じカレンダーに参加できます（2人まで）。</p>'
      : '';
    if (el.getAttribute('data-k') !== html) { el.innerHTML = html; el.setAttribute('data-k', html); }
  }

  /* ---------- 操作: タップ / なぞり / 曜日まとめ ---------- */
  var drag = null;

  function isPastDate(d) { return d < JP.today(); }
  function targetOf(node) { return node && node.closest ? node.closest('[data-period]') : null; }

  $app.addEventListener('pointerdown', function (e) {
    if (!C || !C.editing || e.button > 0) return; // 編集モードのときだけ、タップ・なぞり選択を受け付ける
    var el = targetOf(e.target);
    if (!el || isPastDate(el.getAttribute('data-date'))) return;
    if (e.target.releasePointerCapture && e.pointerId != null) { try { e.target.releasePointerCapture(e.pointerId); } catch (x) { /* noop */ } }
    var period = el.getAttribute('data-period');
    var key = keyOf(el.getAttribute('data-date'), period);
    // タップで次の状態へ。なぞり始めたときは、この「次の状態」を通ったセルにも適用する
    drag = { x: e.clientX, y: e.clientY, moved: false, key: key, period: period, code: nextCode(period, myCode(key)), done: {}, el: el };
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag || !C) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) < 10 && Math.abs(e.clientY - drag.y) < 10) return;
      drag.moved = true; C.dragging = true;
      drag.lx = drag.x; drag.ly = drag.y;
      applyDrag(drag.el);
    }
    // 素早くなぞるとイベントが飛び飛びになるので、前回の位置との間を細かくたどって通ったセルを全部拾う
    var dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
    var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
    for (var i = 1; i <= steps; i++) {
      var t = targetOf(document.elementFromPoint(drag.lx + dx * i / steps, drag.ly + dy * i / steps));
      if (t) applyDrag(t);
    }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  function endDrag(commit) {
    var d = drag; drag = null;
    if (C) C.dragging = false;
    if (d && commit && !d.moved && C) { var m = {}; m[d.key] = d.code; setCodes(m); announce(d.key, d.code); }
    else if (d && d.moved && C) toast('なぞった ' + size(d.done) + '件を「' + codeShort(d.code) + '」にしました');
  }
  document.addEventListener('pointerup', function () { endDrag(true); });
  document.addEventListener('pointercancel', function () { endDrag(false); });

  function applyDrag(el) {
    if (isPastDate(el.getAttribute('data-date'))) return;
    var date = el.getAttribute('data-date'), period = el.getAttribute('data-period');
    var map = {};
    if (drag.period === 'all') {
      // 平日から始めた: 平日は同じ状態、土日祝は昼・夜とも（範囲なしの）終日/解除
      JP.periodsOf(date).forEach(function (p) { map[keyOf(date, p)] = p === 'all' ? drag.code : (drag.code ? 'F' : ''); });
    } else if (period === drag.period) {
      map[keyOf(date, period)] = drag.code; // 昼から始めたら昼だけ、夜なら夜だけ
    }
    Object.keys(map).forEach(function (k) { if (drag.done[k]) delete map[k]; else drag.done[k] = true; });
    if (size(map)) setCodes(map);
  }

  $app.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) { // ボタン以外（日付の数字・相手の段・余白）
      var cell = e.target.closest ? e.target.closest('[data-cell]') : null;
      if (!cell || !C) return;
      if (!C.editing) return openDay(cell.getAttribute('data-cell'));
      if (e.target.closest('.sr[data-who="pt"]')) toast('下段は相手の欄です（変更できません）。上段があなたの欄です');
      return;
    }
    // キーボード操作(detail=0)の昼/夜/日付ボタン。マウス・タッチは pointer 側で処理済み
    if (b.hasAttribute('data-period')) {
      if (!C) return;
      var bdate = b.getAttribute('data-date');
      if (!C.editing) return openDay(bdate); // 閲覧中のタップは何も変えず、その日の空き・予定を見るシートを開く（誤タップ対策）
      if (isPastDate(bdate)) return;        // 過去日の空きは変更できない
      if (e.detail === 0) {
        var k = keyOf(b.getAttribute('data-date'), b.getAttribute('data-period'));
        var m = {}; m[k] = nextCode(b.getAttribute('data-period'), myCode(k));
        setCodes(m); announce(k, m[k]);
      }
      return;
    }
    var a = b.getAttribute('data-action');
    if (!a) return;
    handleAction(a, b);
  });

  function shiftMonth(delta) {
    var t = C.month.y * 12 + (C.month.m - 1) + delta;
    C.month = { y: Math.floor(t / 12), m: (t % 12) + 1 };
    renderCalendar();
  }

  function handleAction(a, b) {
    if (a === 'prev') return C && shiftMonth(-1);
    if (a === 'next') return C && shiftMonth(1);
    if (a === 'months') return C && openMonths();
    if (a === 'settings') return C && openSettings();
    if (a === 'retry') return retryNow();
    if (a === 'discard') return discardUnsaved();
    if (a === 'copyInvite') return copyText(inviteUrl(), '招待リンクをコピーしました');
    if (a === 'line') return openLine();
    if (a === 'openday') return C && openDay(b.getAttribute('data-date'), b.getAttribute('data-form') === '1');
    if (a === 'dow') return C && (C.editing ? bulkDow(Number(b.getAttribute('data-dow'))) : editHint());
    if (a === 'edit') return C && toggleEdit();
    if (a === 'new') return showCreate();
  }

  /* 編集モード: ふだんは閲覧専用（誤タップ防止）。「編集する」を押している間だけ選択・解除できる */
  var hintAt = 0;
  function editHint() {
    if (Date.now() - hintAt < 3000) return;
    hintAt = Date.now();
    toast('変更するには、下の「編集する」を押してください');
  }
  function toggleEdit() {
    C.editing = !C.editing;
    drag = null; C.dragging = false;
    paint();
    if (!C.editing && size(C.desired) + size(C.inflight) === 0) toast('編集を終わりました');
  }

  function bulkDow(w) {
    var y = C.month.y, m = C.month.m, today = JP.today(), slots = [];
    for (var d = 1; d <= JP.daysInMonth(y, m); d++) {
      var date = JP.fmt(y, m, d);
      if (date < today || JP.dow(date) !== w) continue;
      JP.periodsOf(date).forEach(function (p) { slots.push({ k: keyOf(date, p), p: p }); });
    }
    if (!slots.length) return toast('この月に選べる' + DOW_LABELS[w] + '曜日がありません');
    // 平日の列は「平日の切り替え順」、土日の列は「夜の切り替え順」で進める。全部同じ状態なら次へ、ばらばらなら終日にそろえる
    var main = slots.some(function (s) { return s.p === 'all'; }) ? 'all' : 'night';
    var codes = slots.filter(function (s) { return s.p === main; }).map(function (s) { return myCode(s.k); });
    var uniform = codes.every(function (c) { return c === codes[0]; });
    var next = uniform ? nextCode(main, codes[0]) : 'F';
    var map = {};
    slots.forEach(function (s) { map[s.k] = s.p === main ? next : (next ? 'F' : ''); });
    setCodes(map);
    var what = !next ? '解除' : next === 'F' ? '終日' : JP.rangeLong(JP.codeRange(next));
    toast(DOW_LABELS[w] + '曜日をまとめて「' + what + '」にしました');
  }

  /* ---------- 共有（LINE / コピー） ---------- */
  function copyText(text, okMsg) {
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy'); document.body.removeChild(ta);
        if (ok) toast(okMsg); else window.prompt('コピーしてください', text);
      } catch (x) { window.prompt('コピーしてください', text); }
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    else fallback();
  }
  function openLine() {
    var text = 'ふたりの予定に参加してね！\n' + inviteUrl();
    window.location.href = 'https://line.me/R/msg/text/?' + encodeURIComponent(text);
  }

  /* ---------- シート ---------- */
  function openSheet(html, onMount) {
    closeSheet();
    var bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><button type="button" class="close" data-close aria-label="閉じる">×</button>' + html + '</div>';
    bg.addEventListener('click', function (e) { if (e.target === bg || (e.target.closest && e.target.closest('[data-close]'))) closeSheet(); });
    $sheetRoot.appendChild(bg);
    if (onMount) onMount(bg);
  }
  function closeSheet() { $sheetRoot.innerHTML = ''; if (C) C.day = null; }

  function openMonths() {
    var today = JP.today(), cur = C.month, base = monthOf(today), html = '<h2>月を選ぶ</h2><div class="months">';
    for (var i = 0; i < 25; i++) {
      var t = base.y * 12 + (base.m - 1) + i, y = Math.floor(t / 12), m = (t % 12) + 1;
      html += '<button type="button" data-ym="' + y + '-' + m + '"' + (y === cur.y && m === cur.m ? ' class="cur"' : '') + '>' + (m === 1 || i === 0 ? y + '年<br>' : '') + m + '月</button>';
    }
    openSheet(html + '</div>', function (root) {
      root.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-ym]');
        if (!b) return;
        var p = b.getAttribute('data-ym').split('-');
        C.month = { y: Number(p[0]), m: Number(p[1]) };
        closeSheet(); renderCalendar();
      });
    });
  }

  // パターン編集欄: 時刻(1〜23) と「まで／から／なし」。最大3つ
  function presetRows(kind) {
    var rows = '';
    for (var i = 0; i < 3; i++) {
      var c = C.presets[kind][i] || '', t = c.charAt(0), h = c ? Number(c.slice(1)) : (kind === 'night' ? 21 : 18);
      var hours = '';
      for (var x = 1; x < 24; x++) hours += '<option value="' + x + '"' + (x === h ? ' selected' : '') + '>' + x + '時</option>';
      rows += '<div class="preset-row" data-kind="' + kind + '"><select class="ph" aria-label="時刻">' + hours + '</select>' +
        '<select class="pk" aria-label="種類"><option value=""' + (!c ? ' selected' : '') + '>使わない</option><option value="U"' + (t === 'U' ? ' selected' : '') + '>まで空き (〜)</option><option value="S"' + (t === 'S' ? ' selected' : '') + '>から空き (〜から)</option></select></div>';
    }
    return rows;
  }
  function readPresets(root, kind) {
    var out = [];
    Array.prototype.forEach.call(root.querySelectorAll('.preset-row[data-kind="' + kind + '"]'), function (row) {
      var t = row.querySelector('.pk').value, h = row.querySelector('.ph').value;
      var code = t ? t + h : '';
      if (code && out.indexOf(code) < 0) out.push(code);
    });
    return out;
  }

  function openSettings() {
    var html = '<h2>設定</h2>' +
      '<h3>あなたの表示名</h3><div class="field"><input id="rn" maxlength="12" value="' + esc(C.me.name) + '" aria-label="表示名"></div><p class="err-text" id="rn-err"></p>' +
      '<button type="button" class="btn primary" id="rn-save">名前を保存</button>' +
      '<h3>平日の空き方パターン</h3><p>日付をタップするたびに「終日 → 下のパターン → 解除」と切り替わります。バイトの時間に合わせて変えられます（例: 9時まで／18時まで／21時から）。</p>' +
      presetRows('weekday') +
      '<h3>土日・祝日の「夜」のパターン</h3><p>夜をタップするたびに「夜(終日) → 下のパターン → 解除」と切り替わります。昼は 選択 ⇄ 解除 のみです。</p>' +
      presetRows('night') +
      '<p class="err-text" id="pr-err"></p><button type="button" class="btn primary" id="pr-save">パターンを保存</button>' +
      '<h3>この端末以外で開くとき</h3><p>LINEの中と外のブラウザなど、別の場所で同じ「あなた」として使うためのリンクです。<b>相手には送らないでください</b>（開いた人があなたとして操作できます）。</p>' +
      '<button type="button" class="btn" id="restore">' + ICON.link + '自分用の復元リンクをコピー</button>' +
      '<h3>このカレンダー</h3><button type="button" class="btn" id="newcal">新しいカレンダーを作る</button>' +
      '<button type="button" class="btn danger" id="leave">この端末から外す</button>' +
      '<p>「外す」と、この端末ではこのカレンダーを開けなくなります（データは削除されません。復元リンクがあれば再開できます）。</p>' +
      (storageOk ? '' : '<p style="color:#9b1c1f">この端末では設定を保存できません。ページを閉じると参加者の識別が失われます。復元リンクを控えてください。</p>');
    openSheet(html, function (root) {
      root.querySelector('#rn-save').onclick = function () {
        var name = root.querySelector('#rn').value.trim();
        var err = root.querySelector('#rn-err');
        if (!name || Array.from(name).length > 12) { err.textContent = '名前は1〜12文字で入力してください'; return; }
        var s = C;
        api('rename', { id: s.id, name: name }, s.token).then(function (r) {
          s.me.name = r.name; rememberCal(s.id, s.token, r.name); closeSheet(); renderCalendar(); toast('名前を変更しました');
        }, function () { err.textContent = '保存できませんでした。通信を確認してもう一度お試しください'; });
      };
      root.querySelector('#pr-save').onclick = function () {
        var presets = { weekday: readPresets(root, 'weekday'), night: readPresets(root, 'night') };
        var s = C, err = root.querySelector('#pr-err');
        api('prefs', { id: s.id, presets: presets }, s.token).then(function (r) {
          s.presets = r.presets; closeSheet(); paint(); toast('パターンを保存しました');
        }, function () { err.textContent = '保存できませんでした。通信を確認してもう一度お試しください'; });
      };
      root.querySelector('#restore').onclick = function () {
        copyText(location.origin + '/?restore=' + C.id + '.' + C.token, '復元リンクをコピーしました');
      };
      root.querySelector('#newcal').onclick = function () { closeSheet(); showCreate(); };
      root.querySelector('#leave').onclick = function () {
        if (!window.confirm('この端末からこのカレンダーを外します。よろしいですか？')) return;
        var st = loadStore(); delete st.cals[C.id]; if (st.last === C.id) st.last = null; saveStore(st);
        try { document.cookie = 'futari_' + C.id + '=; Max-Age=0; Path=/'; } catch (x) { /* noop */ }
        closeSheet(); stopSession(); showCreate();
      };
    });
  }

  /* ---------- 画面: 作成 / 参加 / エラー ---------- */
  function showForbidden(notMember) {
    stopSession();
    history.replaceState(null, '', '/');
    $app.innerHTML = '<div class="screen"><h1>開けません</h1><p class="lead">' +
      (notMember ? 'このカレンダーには、この端末から参加していません。' : 'このカレンダーにはアクセスできません。') +
      '<br>招待リンクか、自分用の復元リンクから開いてください。</p>' +
      '<button type="button" class="btn primary" data-action="new">新しいカレンダーを作る</button></div>';
  }

  function nameForm(opts) {
    return '<div class="field"><label for="nm">あなたの表示名</label><input id="nm" maxlength="12" autocomplete="off" placeholder="例: えりな" value="' + esc(opts.value || '') + '"></div>' +
      '<p class="err-text" id="nm-err" role="alert"></p><button type="button" class="btn primary" id="go">' + opts.button + '</button>';
  }
  function readName(root) {
    var v = root.querySelector('#nm').value.trim();
    if (!v || Array.from(v).length > 12) { root.querySelector('#nm-err').textContent = '名前は1〜12文字で入力してください'; return null; }
    return v;
  }

  function showCreate() {
    stopSession();
    history.replaceState(null, '', '/#/new');
    var st = loadStore(), ids = Object.keys(st.cals);
    var list = ids.length ? '<div class="list"><h2>この端末のカレンダー</h2>' + ids.map(function (id) {
      return '<button type="button" data-open="' + id + '"><span>あなた: ' + esc(st.cals[id].myName) + '</span><span>開く ›</span></button>';
    }).join('') + '</div>' : '';
    $app.innerHTML = '<div class="screen"><h1>ふたりの予定</h1><p class="lead">2人で空いている日を、LINEで共有しながら決めるカレンダーです。</p>' +
      nameForm({ button: 'カレンダーを作る' }) + list + '</div>';
    var go = $app.querySelector('#go');
    go.onclick = function () {
      var name = readName($app); if (!name) return;
      go.disabled = true;
      api('create', { name: name }).then(function (r) {
        rememberCal(r.id, r.token, r.name); openCalendar(r.id);
      }, function () { go.disabled = false; $app.querySelector('#nm-err').textContent = '作成できませんでした。通信を確認してもう一度お試しください'; });
    };
    $app.querySelector('#nm').addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    Array.prototype.forEach.call($app.querySelectorAll('[data-open]'), function (b) {
      b.onclick = function () { openCalendar(b.getAttribute('data-open')); };
    });
  }

  function showJoin(id, invite, skipCookie) {
    stopSession();
    var st = loadStore();
    if (st.cals[id]) return openCalendar(id); // すでにこの端末で参加済み
    var ct = skipCookie ? '' : cookieToken(id);
    if (ct) { // 保存データは消えたが、控えのクッキーに鍵が残っている＝この端末ですでに参加済みの人
      $app.innerHTML = '<p class="boot">確認しています…</p>';
      return api('state', { id: id }, ct).then(function (r) { rememberCal(id, ct, r.me.name); openCalendar(id); },
        function () { showJoin(id, invite, true); });
    }
    $app.innerHTML = '<p class="boot">招待を確認しています…</p>';
    api('preview', { id: id, invite: invite }).then(function (r) {
      if (!r.ok) return invalidInvite('この招待リンクは無効です。送ってもらったリンクをもう一度確認してください。');
      if (r.full) return invalidInvite('このカレンダーは、すでに2人が参加しています。');
      history.replaceState(null, '', '/');
      $app.innerHTML = '<div class="screen"><h1>' + esc(r.host) + 'さんのカレンダー</h1><p class="lead">参加すると、お互いの空き日が見えるようになります。</p>' +
        nameForm({ button: '参加する' }) + '</div>';
      var go = $app.querySelector('#go');
      go.onclick = function () {
        var name = readName($app); if (!name) return;
        go.disabled = true;
        api('join', { id: id, invite: invite, name: name }).then(function (j) {
          rememberCal(id, j.token, j.name); openCalendar(id);
        }, function (e) {
          go.disabled = false;
          $app.querySelector('#nm-err').textContent = e.status === 409 ? 'すでに2人が参加しているため、参加できませんでした。' :
            e.status === 404 ? '招待リンクが無効です。' : '参加できませんでした。通信を確認してもう一度お試しください';
        });
      };
      $app.querySelector('#nm').addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    }, function () {
      $app.innerHTML = '<div class="screen"><h1>接続できません</h1><p class="lead">通信を確認して、もう一度開き直してください。</p><button type="button" class="btn primary" onclick="location.reload()">再読み込み</button></div>';
    });
  }
  function invalidInvite(msg) {
    history.replaceState(null, '', '/');
    $app.innerHTML = '<div class="screen"><h1>参加できません</h1><p class="lead">' + esc(msg) + '</p><button type="button" class="btn primary" data-action="new">新しいカレンダーを作る</button></div>';
  }

  function restore(id, token) {
    stopSession();
    $app.innerHTML = '<p class="boot">確認しています…</p>';
    api('state', { id: id }, token).then(function (r) {
      rememberCal(id, token, r.me.name); openCalendar(id);
    }, function (e) {
      if (e.status === 403) return invalidInvite('この復元リンクは無効です。');
      $app.innerHTML = '<div class="screen"><h1>接続できません</h1><p class="lead">通信を確認して、もう一度開き直してください。</p></div>';
    });
  }

  /* ---------- 起動 ---------- */
  function boot() {
    var q = new URLSearchParams(location.search);
    var join = q.get('join'), rest = q.get('restore');
    var pair = function (v) { var i = v ? v.indexOf('.') : -1; return i > 0 ? [v.slice(0, i), v.slice(i + 1)] : null; };
    var p;
    if ((p = pair(join))) return showJoin(p[0], p[1]);
    if ((p = pair(rest))) return restore(p[0], p[1]);
    var m = /^#\/c\/([0-9a-f-]{36})$/.exec(location.hash);
    if (m) return openCalendar(m[1]);
    if (location.hash === '#/new') return showCreate();
    var st = loadStore();
    if (st.last && st.cals[st.last]) return openCalendar(st.last);
    var ids = cookieIds(); // 保存データは消えたが、控えのクッキーが残っている場合は、そのカレンダーに戻る
    if (ids.length) return openCalendar(ids[0]);
    showCreate();
  }
  window.addEventListener('hashchange', function () {
    var m = /^#\/c\/([0-9a-f-]{36})$/.exec(location.hash);
    if (m && (!C || C.id !== m[1])) openCalendar(m[1]);
    else if (location.hash === '#/new') showCreate();
  });

  // 日付が変わったら（日本時間）今日の印・過去日の扱いを更新する
  var lastToday = JP.today();
  setInterval(function () { var t = JP.today(); if (t !== lastToday) { lastToday = t; if (C && C.loaded) renderCalendar(); } }, 30000);

  boot();
})();
