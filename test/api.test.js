// 実DBに対する API テスト。使い方: サーバーを起動して `BASE=http://localhost:3000 node test/api.test.js`
const assert = require('assert');
const JP = require('../public/holidays.js');
const BASE = process.env.BASE || 'http://localhost:3000';

async function call(path, body, token) {
  const r = await fetch(BASE + '/api/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {}),
  });
  let j = {}; try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}
const ok = (r, msg) => assert.strictEqual(r.status, 200, msg + ' → ' + r.status + ' ' + JSON.stringify(r.body));
const state = (id, tok) => call('state', { id }, tok);
let n = 0;
const test = async (name, fn) => { await fn(); console.log('  ✓ ' + name); n++; };

// 今日より先の、平日と休日（土日祝）を探す
const today = JP.today();
const future = (pred) => { for (let i = 3; i < 60; i++) { const d = JP.addDays(today, i); if (pred(d)) return d; } };
const weekday = future((d) => JP.dayType(d) === 'weekday');
const weekday2 = future((d) => JP.dayType(d) === 'weekday' && d !== weekday);
const offday = future((d) => JP.dayType(d) === 'off');
const holidayWeekday = future((d) => JP.holidayName(d) && JP.dow(d) > 0 && JP.dow(d) < 6); // 平日の祝日(無ければ undefined)

(async () => {
  console.log('API tests @ ' + BASE);
  let A, B, calId, invite;

  await test('1. 作成→招待確認→参加（2人目まで）', async () => {
    const c = await call('create', { name: 'えりな' }); ok(c, 'create');
    calId = c.body.id; invite = c.body.invite; A = c.body.token;
    assert.ok(A.length > 30 && invite.length > 30);
    const p = await call('preview', { id: calId, invite }); ok(p, 'preview');
    assert.deepStrictEqual([p.body.ok, p.body.host, p.body.full], [true, 'えりな', false]);
    // 招待リンクを開く(preview)だけでは参加者は増えない・既存参加者になりすませない
    const s0 = await state(calId, A); assert.strictEqual(s0.body.partner, null);
    assert.strictEqual(s0.body.invite, invite);
    const j = await call('join', { id: calId, invite, name: 'たろう' }); ok(j, 'join');
    B = j.body.token; assert.notStrictEqual(A, B);
    const p2 = await call('preview', { id: calId, invite }); assert.strictEqual(p2.body.full, true);
    const j3 = await call('join', { id: calId, invite, name: '3人目' }); assert.strictEqual(j3.status, 409);
    const sA = await state(calId, A); assert.strictEqual(sA.body.partner.name, 'たろう'); assert.strictEqual(sA.body.invite, null);
    const sB = await state(calId, B); assert.strictEqual(sB.body.partner.name, 'えりな'); assert.strictEqual(sB.body.me.name, 'たろう');
  });

  await test('2. 不正な招待・同時参加は1人だけ成功する', async () => {
    assert.strictEqual((await call('join', { id: calId, invite: 'x'.repeat(43), name: 'x' })).status, 404);
    assert.strictEqual((await call('preview', { id: calId, invite: 'bad' })).body.ok, false);
    const c = await call('create', { name: 'host' });
    const rs = await Promise.all([1, 2, 3, 4].map((i) => call('join', { id: c.body.id, invite: c.body.invite, name: 'g' + i })));
    const wins = rs.filter((r) => r.status === 200).length;
    assert.strictEqual(wins, 1, '同時参加の成功は1人: ' + rs.map((r) => r.status));
    assert.ok(rs.every((r) => r.status === 200 || r.status === 409));
  });

  await test('3. アクセス制御: トークン無し/別人/別カレンダー/存在しないIDは全て403', async () => {
    const other = await call('create', { name: 'other' });
    for (const [id, tok] of [[calId, undefined], [calId, 'wrong'.repeat(8)], [calId, other.body.token], [other.body.id, A],
      ['00000000-0000-4000-8000-000000000000', A], ['not-a-uuid', A]]) {
      assert.strictEqual((await state(id, tok)).status, 403, 'state ' + id + ' ' + tok);
      const r = await call('set', { id, changes: [{ date: weekday, period: 'all', on: true }] }, tok);
      assert.strictEqual(r.status, 403, 'set');
    }
    assert.strictEqual((await call('rename', { id: calId, name: 'hack' }, other.body.token)).status, 403);
    // 招待コードは認証の代わりにならない
    assert.strictEqual((await state(calId, invite)).status, 403);
  });

  await test('4. 平日の選択・解除が相手に見える（自分の分だけ）', async () => {
    ok(await call('set', { id: calId, changes: [{ date: weekday, period: 'all', on: true }] }, A), 'A on');
    let sB = (await state(calId, B)).body;
    assert.deepStrictEqual(sB.theirs, [weekday + '|all']); assert.deepStrictEqual(sB.mine, []);
    // B が同じ項目を「解除」しても、A の登録は消えない（B は自分の行しか触れない）
    ok(await call('set', { id: calId, changes: [{ date: weekday, period: 'all', on: false }] }, B), 'B off');
    const sA = (await state(calId, A)).body;
    assert.deepStrictEqual(sA.mine, [weekday + '|all'], 'Aの登録が残っている');
    ok(await call('set', { id: calId, changes: [{ date: weekday, period: 'all', on: false }] }, A), 'A off');
    assert.deepStrictEqual((await state(calId, B)).body.theirs, []);
  });

  await test('5. 土日・祝日は昼/夜を別々に。種別に合わない指定・過去日・不正値は400', async () => {
    ok(await call('set', { id: calId, changes: [{ date: offday, period: 'noon', on: true }] }, A), 'noon');
    ok(await call('set', { id: calId, changes: [{ date: offday, period: 'night', on: true }] }, A), 'night');
    ok(await call('set', { id: calId, changes: [{ date: offday, period: 'noon', on: false }] }, A), 'noon off');
    assert.deepStrictEqual((await state(calId, A)).body.mine, [offday + '|night']);
    const bad = [
      { date: weekday, period: 'noon', on: true },   // 平日に昼
      { date: offday, period: 'all', on: true },     // 休日に all
      { date: JP.addDays(today, -1), period: 'all', on: true }, // 過去
      { date: '2026-02-30', period: 'all', on: true },
      { date: JP.addDays(today, 900), period: 'all', on: true }, // 遠すぎる
      { date: weekday, period: 'all', on: 'yes' },
    ];
    for (const c of bad) assert.strictEqual((await call('set', { id: calId, changes: [c] }, A)).status, 400, JSON.stringify(c));
    assert.strictEqual((await call('set', { id: calId, changes: [] }, A)).status, 400);
    ok(await call('set', { id: calId, changes: [{ date: offday, period: 'night', on: false }] }, A), 'cleanup');
    if (holidayWeekday) { // 平日の祝日は「昼/夜」扱い
      ok(await call('set', { id: calId, changes: [{ date: holidayWeekday, period: 'noon', on: true }] }, A), 'holiday');
      assert.strictEqual((await call('set', { id: calId, changes: [{ date: holidayWeekday, period: 'all', on: true }] }, A)).status, 400);
      ok(await call('set', { id: calId, changes: [{ date: holidayWeekday, period: 'noon', on: false }] }, A), 'cleanup');
    }
  });

  await test('6. 同じ時間帯が一致した項目だけが両方に出る（昼と夜のずれは一致にならない）', async () => {
    ok(await call('set', { id: calId, changes: [{ date: offday, period: 'noon', on: true }] }, A), 'A noon');
    ok(await call('set', { id: calId, changes: [{ date: offday, period: 'night', on: true }] }, B), 'B night');
    const a = (await state(calId, A)).body, b = (await state(calId, B)).body;
    const both = (x) => x.mine.filter((k) => x.theirs.includes(k));
    assert.deepStrictEqual(both(a), []); assert.deepStrictEqual(both(b), []);
    ok(await call('set', { id: calId, changes: [{ date: offday, period: 'night', on: true }] }, A), 'A night');
    assert.deepStrictEqual(both((await state(calId, B)).body), [offday + '|night']);
    const a2 = (await state(calId, A)).body;
    assert.deepStrictEqual(both(a2), [offday + '|night']);
    for (const [t, p] of [[A, 'noon'], [A, 'night'], [B, 'night']]) ok(await call('set', { id: calId, changes: [{ date: offday, period: p, on: false }] }, t), 'cleanup');
  });

  await test('7. 同時に操作しても両者の登録が残る（並列50リクエスト）', async () => {
    const days = []; for (let i = 3; days.length < 20; i++) { const d = JP.addDays(today, i); if (JP.dayType(d) === 'weekday') days.push(d); }
    const jobs = [];
    days.forEach((d, i) => {
      jobs.push(call('set', { id: calId, changes: [{ date: d, period: 'all', on: true }] }, i % 2 ? A : B));
      jobs.push(call('set', { id: calId, changes: [{ date: d, period: 'all', on: true }] }, i % 2 ? B : A)); // 両者が同日を同時に
    });
    const rs = await Promise.all(jobs); rs.forEach((r) => ok(r, 'parallel'));
    const a = (await state(calId, A)).body, b = (await state(calId, B)).body;
    const want = days.map((d) => d + '|all').sort();
    assert.deepStrictEqual([...a.mine].sort(), want); assert.deepStrictEqual([...b.mine].sort(), want);
    assert.deepStrictEqual([...a.theirs].sort(), want);
    // 後始末をまとめて（1回のバッチで20件）
    ok(await call('set', { id: calId, changes: days.map((d) => ({ date: d, period: 'all', on: false })) }, A), 'batch off');
    ok(await call('set', { id: calId, changes: days.map((d) => ({ date: d, period: 'all', on: false })) }, B), 'batch off');
    assert.deepStrictEqual((await state(calId, A)).body.mine, []);
  });

  await test('8. 冪等性と「最後の指定が勝つ」', async () => {
    const k = { date: weekday2, period: 'all' };
    ok(await call('set', { id: calId, changes: [{ ...k, on: true }, { ...k, on: false }, { ...k, on: true }] }, A), 'batch');
    assert.deepStrictEqual((await state(calId, A)).body.mine, [weekday2 + '|all']);
    ok(await call('set', { id: calId, changes: [{ ...k, on: true }] }, A), 'repeat');
    assert.deepStrictEqual((await state(calId, A)).body.mine, [weekday2 + '|all']);
    ok(await call('set', { id: calId, changes: [{ ...k, on: true }, { ...k, on: false }] }, A), 'batch2');
    assert.deepStrictEqual((await state(calId, A)).body.mine, []);
  });

  await test('9. rev: 変化が無ければ unchanged、変化すれば全件', async () => {
    const s = (await state(calId, A)).body;
    const same = await call('state', { id: calId, rev: s.rev }, A); assert.strictEqual(same.body.unchanged, true);
    ok(await call('set', { id: calId, changes: [{ date: weekday, period: 'all', on: true }] }, B), 'B on');
    const diff = await call('state', { id: calId, rev: s.rev }, A);
    assert.ok(!diff.body.unchanged && diff.body.rev > s.rev && diff.body.theirs.includes(weekday + '|all'));
  });

  await test('10. 表示名の変更は自分だけ、入力検証', async () => {
    ok(await call('rename', { id: calId, name: 'えりな2' }, A), 'rename');
    assert.strictEqual((await state(calId, B)).body.partner.name, 'えりな2');
    for (const bad of ['', '   ', 'あ'.repeat(13), null]) assert.strictEqual((await call('rename', { id: calId, name: bad }, A)).status, 400);
    assert.strictEqual((await call('create', { name: '' })).status, 400);
    const r = await fetch(BASE + '/api/state'); assert.strictEqual(r.status, 405); // GET は不可
  });

  await test('11. 時間帯パターン(code)の保存・更新・検証', async () => {
    const set = (tok, changes) => call('set', { id: calId, changes }, tok);
    const sA = async () => (await state(calId, A)).body;
    ok(await set(A, [{ date: weekday2, period: 'all', code: 'U18' }]), 'U18');
    let a = await sA();
    assert.deepStrictEqual(a.mine, [weekday2 + '|all']); assert.deepStrictEqual(a.mineW, { [weekday2 + '|all']: 'U18' });
    // 相手側には theirsW として見える。終日は W に入らない
    ok(await set(B, [{ date: weekday2, period: 'all', code: 'F' }]), 'B F');
    const b = (await state(calId, B)).body;
    assert.deepStrictEqual(b.theirsW, { [weekday2 + '|all']: 'U18' }); assert.deepStrictEqual(b.mineW, {});
    // 同じ項目の範囲変更は1行の更新（行が増えない）。旧形式 on:true は終日
    ok(await set(A, [{ date: weekday2, period: 'all', code: 'S21' }]), 'S21');
    a = await sA(); assert.deepStrictEqual(a.mine, [weekday2 + '|all']); assert.deepStrictEqual(a.mineW, { [weekday2 + '|all']: 'S21' });
    ok(await set(A, [{ date: weekday2, period: 'all', on: true }]), 'legacy on');
    a = await sA(); assert.deepStrictEqual(a.mineW, {});
    // 土日祝の夜は範囲OK、昼は範囲なし(F/解除のみ)
    ok(await set(A, [{ date: offday, period: 'night', code: 'U21' }]), 'night U21');
    assert.strictEqual((await sA()).mineW[offday + '|night'], 'U21');
    assert.strictEqual((await set(A, [{ date: offday, period: 'noon', code: 'U18' }])).status, 400);
    // 不正な code
    for (const code of ['U0', 'U24', 'S0', 'X5', 'u18', 'F1', 'U018', 'U', 5, null]) {
      assert.strictEqual((await set(A, [{ date: weekday2, period: 'all', code }])).status, 400, 'code ' + code);
    }
    // 解除すると範囲も消える
    ok(await set(A, [{ date: weekday2, period: 'all', code: '' }, { date: offday, period: 'night', code: '' }]), 'clear');
    a = await sA(); assert.deepStrictEqual([a.mine, a.mineW], [[], {}]);
    ok(await set(B, [{ date: weekday2, period: 'all', code: '' }]), 'B clear');
  });

  await test('12. パターン設定は本人だけ・検証つき', async () => {
    const s0 = (await state(calId, A)).body;
    assert.deepStrictEqual(s0.presets, { weekday: ['U9', 'U18', 'S21'], night: ['U21', 'U23'] }); // 初期値
    const r = await call('prefs', { id: calId, presets: { weekday: ['U8', 'U8', 'S22', 'F', 'bad', 'U12', 'U13'], night: [] } }, A);
    ok(r, 'prefs');
    assert.deepStrictEqual(r.body.presets, { weekday: ['U8', 'S22', 'U12'], night: [] }); // 重複・F・不正を除き最大3つ
    assert.deepStrictEqual((await state(calId, A)).body.presets, { weekday: ['U8', 'S22', 'U12'], night: [] });
    assert.deepStrictEqual((await state(calId, B)).body.presets, s0.presets, '相手の設定は変わらない');
    assert.strictEqual((await call('prefs', { id: calId, presets: {} }, undefined)).status, 403);
    assert.strictEqual((await call('prefs', { id: calId, presets: {} }, 'x'.repeat(40))).status, 403);
  });

  await test('13. 鍵の控えクッキー: 認証できたときだけ発行。クッキーだけでは認証されない', async () => {
    const raw = (path, body, token, cookie) => fetch(BASE + '/api/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
    // 作成・参加で発行される（値は発行された鍵そのもの。1年・Lax）
    const c = await call('create', { name: 'cookie' });
    const rc = await raw('create', { name: 'cookie2' });
    const ck = rc.headers.get('set-cookie'); const cj = await rc.json();
    assert.ok(ck && ck.startsWith('futari_' + cj.id + '=' + cj.token + ';'), 'create sets cookie');
    assert.ok(/Max-Age=31536000/.test(ck) && /SameSite=Lax/.test(ck) && /Path=\//.test(ck), ck.replace(cj.token, '***'));
    const rj = await raw('join', { id: cj.id, invite: cj.invite, name: 'g' });
    const jj = await rj.json(); const jck = rj.headers.get('set-cookie');
    assert.ok(jck && jck.startsWith('futari_' + cj.id + '=' + jj.token + ';'), 'join sets cookie');
    // 認証できた state / set は更新する
    const ok1 = await raw('state', { id: calId }, A);
    assert.ok(ok1.headers.get('set-cookie').startsWith('futari_' + calId + '=' + A + ';'), 'state refreshes cookie');
    const ok2 = await raw('set', { id: calId, changes: [{ date: weekday, period: 'all', code: '' }] }, A);
    assert.ok(ok2.headers.get('set-cookie'), 'set refreshes cookie');
    // 失敗した認証では発行しない
    const bad = await raw('state', { id: calId }, 'wrong'.repeat(9));
    assert.strictEqual(bad.status, 403); assert.strictEqual(bad.headers.get('set-cookie'), null);
    // クッキーだけ（Authorization なし）では認証されない＝他サイトからの勝手な操作の経路にならない
    const only = await raw('state', { id: calId }, null, 'futari_' + calId + '=' + A);
    assert.strictEqual(only.status, 403, 'cookie alone is not accepted');
    const onlySet = await raw('set', { id: calId, changes: [{ date: weekday, period: 'all', code: 'F' }] }, null, 'futari_' + calId + '=' + A);
    assert.strictEqual(onlySet.status, 403);
    assert.ok(c.status === 200);
  });

  console.log('\nAPI OK (' + n + ' groups)');
})().catch((e) => { console.error('\nFAILED:', e.message || e); process.exit(1); });
