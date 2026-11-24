'use strict';
const crypto = require('crypto');
const { sql, handler, authMember, listPlans, isUuid, HttpError, JP } = require('../lib/core');

const MAX_TITLE = 30;      // タイトル（例: 飲みに行く）
const MAX_MEMO = 200;      // メモ（時間・場所など）
const MAX_PER_DAY = 5;
const MAX_PER_CALENDAR = 300;

const len = (s) => [...s].length;
function cleanTitle(v) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || len(s) > MAX_TITLE) throw new HttpError(400, 'invalid_title');
  return s;
}
function cleanMemo(v) {
  // メモは改行を残す。それ以外の制御文字は取り除く
  const s = String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (len(s) > MAX_MEMO) throw new HttpError(400, 'invalid_memo');
  return s;
}

// 確定した予定の保存・削除。2人どちらも、カレンダー内のどの予定でも編集・削除できる（2人で決めた共有メモのため）。
// op: 'save'（plan.id が無ければ新規、あれば更新）/ 'delete'（planId）。どちらも最新の一覧を返す。
module.exports = handler('POST', async (req, body, res) => {
  const me = await authMember(req, body.id, res);
  const db = sql();
  const today = JP.today();

  if (body.op === 'save') {
    const p = body.plan && typeof body.plan === 'object' ? body.plan : {};
    if (!JP.parse(p.date) || p.date < JP.addDays(today, -366) || p.date > JP.addDays(today, 731)) throw new HttpError(400, 'invalid_date');
    const title = cleanTitle(p.title), memo = cleanMemo(p.memo);

    if (p.id != null) {
      if (!isUuid(p.id)) throw new HttpError(400, 'invalid_id');
      const ex = await db`select 1 from plans where id = ${p.id} and calendar_id = ${body.id}`;
      if (!ex.length) throw new HttpError(404, 'not_found');
      await db.transaction([
        db`update plans set day = ${p.date}, title = ${title}, memo = ${memo}, updated_at = now() where id = ${p.id} and calendar_id = ${body.id}`,
        db`update calendars set rev = rev + 1 where id = ${body.id}`,
      ]);
    } else {
      const c = (await db`select count(*)::int as total, count(*) filter (where day = ${p.date})::int as same_day from plans where calendar_id = ${body.id}`)[0];
      if (c.total >= MAX_PER_CALENDAR || c.same_day >= MAX_PER_DAY) throw new HttpError(409, 'limit');
      await db.transaction([
        db`insert into plans (id, calendar_id, day, title, memo, created_by) values (${crypto.randomUUID()}, ${body.id}, ${p.date}, ${title}, ${memo}, ${me.id})`,
        db`update calendars set rev = rev + 1 where id = ${body.id}`,
      ]);
    }
  } else if (body.op === 'delete') {
    if (!isUuid(body.planId)) throw new HttpError(400, 'invalid_id');
    // すでに無い予定の削除は成功扱い（2人が同時に消しても困らないように）
    const del = await db`delete from plans where id = ${body.planId} and calendar_id = ${body.id} returning id`;
    if (del.length) await db`update calendars set rev = rev + 1 where id = ${body.id}`;
  } else {
    throw new HttpError(400, 'invalid_op');
  }

  return { ok: true, plans: await listPlans(body.id) };
});
