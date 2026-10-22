'use strict';
const { sql, handler, authMember, normalizeChange, HttpError, JP } = require('../lib/core');

const MAX_CHANGES = 500;

// 自分の空き状況だけを変更する。対象の参加者は Authorization のトークンからのみ決まり、
// リクエストで相手を指定する手段はない。変更は「この項目をこの状態にする」という冪等な指定
// （code: ''=解除 / 'F'=終日 / 'U18'=18時まで / 'S21'=21時から）で、
// 変更した項目の行だけを追加・更新・削除する（相手の行や他の項目には触れない）。
module.exports = handler('POST', async (req, body) => {
  const me = await authMember(req, body.id);
  const changes = body.changes;
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES) throw new HttpError(400, 'invalid_changes');

  const today = JP.today();
  const limit = JP.addDays(today, 731);
  const last = new Map();
  for (const raw of changes) {
    const c = normalizeChange(raw, today, limit);
    if (!c) throw new HttpError(400, 'invalid_change');
    last.set(c.date + '|' + c.period, c); // 同じ項目は後の指定が勝つ
  }
  const on = { d: [], p: [], c: [] }; const off = { d: [], p: [] };
  for (const c of last.values()) {
    if (c.code) { on.d.push(c.date); on.p.push(c.period); on.c.push(c.code); }
    else { off.d.push(c.date); off.p.push(c.period); }
  }

  const db = sql();
  const results = await db.transaction([
    db`insert into availability (calendar_id, member_id, day, period, code)
       select ${body.id}, ${me.id}, t.d, t.p, t.c
       from unnest(${on.d}::date[], ${on.p}::text[], ${on.c}::text[]) as t(d, p, c)
       on conflict (calendar_id, member_id, day, period)
       do update set code = excluded.code, updated_at = now() where availability.code <> excluded.code`,
    db`delete from availability where calendar_id = ${body.id} and member_id = ${me.id}
       and (day, period) in (select t.d, t.p from unnest(${off.d}::date[], ${off.p}::text[]) as t(d, p))`,
    db`update calendars set rev = rev + 1 where id = ${body.id} returning rev`,
  ]);
  return { ok: true, rev: Number(results[2][0].rev) };
});
