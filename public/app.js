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
      rev: null, mine: {}, theirs: {},          // サーバー上の最新状態（key -> true）
      desired: {}, inflight: {},                 // 未送信 / 送信中の自分の変更（key -> true|false）
      sending: false, failing: false, failCount: 0, epoch: 0, savedAt: 0,
      online: true, needFull: false, polling: false,
      month: monthOf(JP.today()), dragging: false,
      flushT: null, pollT: null
    };
  }
  function monthOf(d) { var p = JP.parse(d); return { y: p.y, m: p.m }; }
  function keyOf(date, period) { return date + '|' + period; }
  function size(o) { return Object.keys(o).length; }

  function isMine(k) {
    if (k in C.desired) return C.desired[k];
    if (k in C.inflight) return C.inflight[k];
    return !!C.mine[k];
  }
  function unsavedState(k) {
    if (!(k in C.desired) && !(k in C.inflight)) return '';
    return C.failing ? 'failed' : 'pending';
  }
  function stateOf(k) {
    var a = isMine(k), b = !!C.theirs[k];
    return a && b ? 'both' : a ? 'mine' : b ? 'theirs' : 'none';
  }

  /* 変更の送信: 常に1リクエストずつ。最後の指定が勝ち、変更した項目だけ送る */
  function setMine(keys, on) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      // 送信待ち・送信中でなく、すでに同じ状態なら何もしない
      if (!(k in C.desired) && !(k in C.inflight) && !!C.mine[k] === on) continue;
      C.desired[k] = on;
    }
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
      var p = k.split('|'); return { date: p[0], period: p[1], on: batch[k] };
    });
    paint();
    api('set', { id: s.id, changes: changes }, s.token, true).then(function () {
      if (C !== s) return;
      s.sending = false;
      Object.keys(batch).forEach(function (k) { if (batch[k]) s.mine[k] = true; else delete s.mine[k]; });
      s.inflight = {}; s.epoch++; s.failing = false; s.failCount = 0; s.savedAt = Date.now();
      setOnline(true);
      if (size(s.desired)) scheduleFlush(0);
      paint();
      setTimeout(function () { if (C === s) paint(); }, 2600);
    }, function (e) {
      if (C !== s) return;
      s.sending = false;
      if (e.status === 403) return showForbidden();
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
      s.mine = toSet(r.mine); s.theirs = toSet(r.theirs);
      if (!s.loaded) { s.loaded = true; }
      else if (!prevPartner && r.partner) toast(r.partner.name + 'さんが参加しました');
      var st = loadStore();
      if (st.cals[s.id] && st.cals[s.id].myName !== r.me.name) { st.cals[s.id].myName = r.me.name; saveStore(st); }
      renderCalendar();
      next();
    }, function (e) {
      if (C !== s) return;
      s.polling = false;
      if (e.status === 403) return showForbidden();
      if (!(e.status > 0) || e.status >= 500) setOnline(false);
      paint();
      pollSoon(Math.min(2000 * (s.online ? 1 : 2), 10000));
    });
    function next() { pollSoon(document.hidden ? POLL_HIDDEN_MS : POLL_MS); }
  }
  function toSet(arr) { var o = {}; (arr || []).forEach(function (k) { o[k] = true; }); return o; }

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
      if (JP.dayType(date) === 'weekday') {
        cells += '<button type="button" class="cell day' + cls + (past ? ' is-past' : '') + '" data-date="' + date + '" data-period="all"' + (past ? ' disabled' : '') + '>' + head + '<span class="mk"></span></button>';
      } else {
        cells += '<div class="cell off' + cls + '" data-off="' + date + '"><div class="head">' + head + '</div>' +
          ['noon', 'night'].map(function (p) {
            return '<button type="button" class="pill' + (past ? ' is-past' : '') + '" data-date="' + date + '" data-period="' + p + '"' + (past ? ' disabled' : '') + '>' + PERIOD_LABEL[p] + '<span class="mk"></span></button>';
          }).join('') + '</div>';
      }
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
      '<nav class="month"><button type="button" class="nav-btn" data-action="prev" aria-label="前の月"' + (atMin ? ' disabled' : '') + '>' + ICON.left + '</button>' +
        '<button type="button" class="month-title" data-action="months">' + y + '年' + m + '月' + ICON.down + '</button>' +
        '<button type="button" class="nav-btn" data-action="next" aria-label="次の月"' + (atMax ? ' disabled' : '') + '>' + ICON.right + '</button></nav>' +
      '<div class="dows">' + dows + '</div>' +
      '<div class="grid" id="grid">' + cells + '</div>' +
      '<section class="legend" aria-label="凡例">' +
        '<span><i class="mk k-mine"></i>自分のみ</span>' +
        '<span><i class="mk k-theirs"></i>相手のみ</span>' +
        '<span><i class="gchip">✓</i>ふたりとも</span>' +
        '<span><i class="mk k-none"></i>未選択</span>' +
        '<span><i class="today-chip">' + Number(today.slice(8)) + '</i>今日</span>' +
      '</section>' +
      '<p class="note">空いている日をタップ。土日・祝日は「昼」「夜」を選べます。</p>' +
      '<p class="note small">曜日（月・火…）をタップでその月をまとめて選択。横になぞっても連続で選べます。<br>未選択は「空きの登録なし」で、予定があるという意味ではありません。</p>' +
      '<section class="card"><h2>ふたりが空いている日</h2><div id="matches"></div></section>' +
      '<div id="invite-area"></div>';
    paint();
  }

  /* 状態に応じて変わる部分だけを更新する（ドラッグ中でも要素を作り直さない） */
  function paint() {
    if (!C || !C.loaded || !document.getElementById('grid')) return;
    var els = document.querySelectorAll('#grid [data-period]');
    var i, el, k, st, u;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      k = keyOf(el.getAttribute('data-date'), el.getAttribute('data-period'));
      st = stateOf(k);
      u = unsavedState(k);
      if (el.getAttribute('data-st') !== st) el.setAttribute('data-st', st);
      if ((el.getAttribute('data-unsaved') || '') !== u) { if (u) el.setAttribute('data-unsaved', u); else el.removeAttribute('data-unsaved'); }
      el.setAttribute('aria-pressed', isMine(k) ? 'true' : 'false');
      el.setAttribute('aria-label', labelFor(el.getAttribute('data-date'), el.getAttribute('data-period'), st, u));
    }
    var offs = document.querySelectorAll('#grid [data-off]');
    for (i = 0; i < offs.length; i++) {
      var date = offs[i].getAttribute('data-off');
      var both = ['noon', 'night'].filter(function (p) { return stateOf(keyOf(date, p)) === 'both'; }).length;
      var v = both === 2 ? 'all' : both === 1 ? 'some' : 'none';
      if (offs[i].getAttribute('data-match') !== v) offs[i].setAttribute('data-match', v);
    }
    paintSync();
    paintMatches();
    paintInvite();
  }

  var STATE_TEXT = { none: '未選択', mine: '自分だけ空き', theirs: '相手だけ空き', both: 'ふたりとも空き' };
  function labelFor(date, period, st, u) {
    var p = JP.parse(date);
    var t = p.m + '月' + p.d + '日(' + DOW_LABELS[JP.dow(date)] + ')' + (period !== 'all' ? ' ' + PERIOD_LABEL[period] : '');
    var hol = JP.holidayName(date);
    return t + (hol ? ' ' + hol : '') + ': ' + STATE_TEXT[st] + (u === 'pending' ? '（保存中）' : u === 'failed' ? '（未保存）' : '');
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
      if (ps.length) out.push({ date: date, periods: ps, d: d });
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
        if (x.periods[0] !== 'all') t += ' ' + x.periods.map(function (p) { return PERIOD_LABEL[p]; }).join('・');
        return '<span class="chip">' + t + '</span>';
      }).join('') + '</div>' : '<p class="empty-msg">この月はまだ、ふたりが重なる日がありません。</p>';
    }
    if (el.getAttribute('data-k') !== html) { el.innerHTML = html; el.setAttribute('data-k', html); }
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

  function targetOf(node) { return node && node.closest ? node.closest('[data-period]') : null; }

  $app.addEventListener('pointerdown', function (e) {
    if (!C || e.button > 0) return;
    var el = targetOf(e.target);
    if (!el || el.disabled) return;
    if (e.target.releasePointerCapture && e.pointerId != null) { try { e.target.releasePointerCapture(e.pointerId); } catch (x) { /* noop */ } }
    var period = el.getAttribute('data-period');
    var key = keyOf(el.getAttribute('data-date'), period);
    drag = { x: e.clientX, y: e.clientY, moved: false, key: key, period: period, on: !isMine(key), done: {}, el: el };
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag || !C) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) < 10 && Math.abs(e.clientY - drag.y) < 10) return;
      drag.moved = true; C.dragging = true;
      applyDrag(drag.el);
    }
    var t = targetOf(document.elementFromPoint(e.clientX, e.clientY));
    if (t) applyDrag(t);
  });
  function endDrag(commit) {
    var d = drag; drag = null;
    if (C) C.dragging = false;
    if (d && commit && !d.moved && C) setMine([d.key], d.on);
  }
  document.addEventListener('pointerup', function () { endDrag(true); });
  document.addEventListener('pointercancel', function () { endDrag(false); });

  function applyDrag(el) {
    if (el.disabled) return;
    var date = el.getAttribute('data-date'), period = el.getAttribute('data-period');
    var keys = [];
    if (drag.period === 'all') keys = JP.periodsOf(date).map(function (p) { return keyOf(date, p); }); // 平日→1日分、土日祝→昼夜とも
    else if (period === drag.period) keys = [keyOf(date, period)];                                  // 昼から始めたら昼だけ、夜なら夜だけ
    keys = keys.filter(function (k) { return !drag.done[k]; });
    if (!keys.length) return;
    keys.forEach(function (k) { drag.done[k] = true; });
    setMine(keys, drag.on);
  }

  $app.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    // キーボード操作(detail=0)の昼/夜/日付ボタン。マウス・タッチは pointer 側で処理済み
    if (b.hasAttribute('data-period')) {
      if (e.detail === 0 && C && !b.disabled) {
        var k = keyOf(b.getAttribute('data-date'), b.getAttribute('data-period'));
        setMine([k], !isMine(k));
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
    if (a === 'dow') return C && bulkDow(Number(b.getAttribute('data-dow')));
    if (a === 'new') return showCreate();
  }

  function bulkDow(w) {
    var y = C.month.y, m = C.month.m, today = JP.today(), keys = [];
    for (var d = 1; d <= JP.daysInMonth(y, m); d++) {
      var date = JP.fmt(y, m, d);
      if (date < today || JP.dow(date) !== w) continue;
      JP.periodsOf(date).forEach(function (p) { keys.push(keyOf(date, p)); });
    }
    if (!keys.length) return toast('この月に選べる' + DOW_LABELS[w] + '曜日がありません');
    var allOn = keys.every(isMine);
    setMine(keys, !allOn);
    toast(DOW_LABELS[w] + '曜日をまとめて' + (allOn ? '解除しました' : '選択しました'));
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
  function closeSheet() { $sheetRoot.innerHTML = ''; }

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

  function openSettings() {
    var html = '<h2>設定</h2>' +
      '<h3>あなたの表示名</h3><div class="field"><input id="rn" maxlength="12" value="' + esc(C.me.name) + '" aria-label="表示名"></div><p class="err-text" id="rn-err"></p>' +
      '<button type="button" class="btn primary" id="rn-save">名前を保存</button>' +
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
      root.querySelector('#restore').onclick = function () {
        copyText(location.origin + '/?restore=' + C.id + '.' + C.token, '復元リンクをコピーしました');
      };
      root.querySelector('#newcal').onclick = function () { closeSheet(); showCreate(); };
      root.querySelector('#leave').onclick = function () {
        if (!window.confirm('この端末からこのカレンダーを外します。よろしいですか？')) return;
        var st = loadStore(); delete st.cals[C.id]; if (st.last === C.id) st.last = null; saveStore(st);
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

  function showJoin(id, invite) {
    stopSession();
    var st = loadStore();
    if (st.cals[id]) return openCalendar(id); // すでにこの端末で参加済み
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
