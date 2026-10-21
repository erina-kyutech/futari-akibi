'use strict';
const { sql, handler, authMember, cleanName } = require('../lib/core');

// 自分の表示名だけを変更できる
module.exports = handler('POST', async (req, body) => {
  const me = await authMember(req, body.id);
  const name = cleanName(body.name);
  const db = sql();
  await db.transaction([
    db`update members set name = ${name} where id = ${me.id}`,
    db`update calendars set rev = rev + 1 where id = ${body.id}`,
  ]);
  return { ok: true, name };
});
