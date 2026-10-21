'use strict';
const { sql, handler, authMember, validateChange, HttpError, JP } = require('../lib/core');

const MAX_CHANGES = 500;

// 自分の空き状況だけを変更する。対象の参加者は Authorization のトークンからのみ決まり、
// リクエストで相手を指定する手段はない。変更は「この項目を on/off にする」という冪等な指定で、
// 変更した項目の行だけを追加・削除する（相手の行や他の項目には触れない）。
module.exports = handler('POST', async (req, body) => {
  const me = await authMember(req, body.id);
  const changes = body.changes;
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > MAX_CHANGES) throw new HttpError(400, 'invalid_changes');

  const today = JP.today();
  const limit = JP.addDays(today, 731);
  const last = new Map();
  for (const c of changes) {
    if (!validateChange(c, today, limit)) throw new HttpError(400, 'invalid_change');
    last.set(c.date + '|' + c.period, c); // 同じ項目は後の指定が勝つ
  }
  const on = { d: [], p: [] }; const off = { d: [], p: [] };
  for (const c of last.values()) { const t = c.on ? on : off; t.d.push(c.date); t.p.push(c.period); }

  const db = sql();
  const results = await db.transaction([
    db`insert into availability (calendar_id, member_id, day, period)
       select ${body.id}, ${me.id}, t.d, t.p from unnest(${on.d}::date[], ${on.p}::text[]) as t(d, p)
       on conflict do nothing`,
    db`delete from availability where calendar_id = ${body.id} and member_id = ${me.id}
       and (day, period) in (select t.d, t.p from unnest(${off.d}::date[], ${off.p}::text[]) as t(d, p))`,
    db`update calendars set rev = rev + 1 where id = ${body.id} returning rev`,
  ]);
  return { ok: true, rev: Number(results[2][0].rev) };
});
