'use strict';
const { sql, isUuid, safeEqual, handler } = require('../lib/core');

// 招待リンクを開いただけでは何も変更しない。参加できるかどうかの確認のみ。
// 無効なリンクは存在の有無を区別せず、同じ応答を返す。
module.exports = handler('POST', async (req, body) => {
  const { id, invite } = body;
  if (!isUuid(id) || typeof invite !== 'string' || invite.length > 200) return { ok: false };
  const rows = await sql()`
    select c.invite_code,
           (select name from members where calendar_id = c.id and slot = 1) as host,
           (select count(*)::int from members where calendar_id = c.id) as n
    from calendars c where c.id = ${id}`;
  if (!rows.length || !safeEqual(rows[0].invite_code, invite)) return { ok: false };
  return { ok: true, host: rows[0].host, full: rows[0].n >= 2 };
});
