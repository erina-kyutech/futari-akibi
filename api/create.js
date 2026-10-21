'use strict';
const crypto = require('crypto');
const { sql, newSecret, hashToken, handler, cleanName } = require('../lib/core');

// 共有カレンダーを作成し、作成者を参加者1として登録する
module.exports = handler('POST', async (req, body) => {
  const name = cleanName(body.name);
  const id = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const invite = newSecret();
  const token = newSecret();
  const db = sql();
  await db.transaction([
    db`insert into calendars (id, invite_code, rev) values (${id}, ${invite}, 1)`,
    db`insert into members (id, calendar_id, slot, name, token_hash)
       values (${memberId}, ${id}, 1, ${name}, ${hashToken(token)})`,
  ]);
  return { id, invite, token, name };
});
