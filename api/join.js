'use strict';
const crypto = require('crypto');
const { sql, isUuid, newSecret, hashToken, safeEqual, HttpError, handler, cleanName } = require('../lib/core');

// 招待コードを持つ人が、空いている参加枠(slot 2)に1人だけ参加できる。
// (calendar_id, slot) の一意制約により、同時に押されても2人目は必ず1人に絞られる。
module.exports = handler('POST', async (req, body) => {
  const { id, invite } = body;
  const name = cleanName(body.name);
  if (!isUuid(id) || typeof invite !== 'string' || invite.length > 200) throw new HttpError(404, 'invalid_invite');
  const db = sql();
  const rows = await db`select invite_code from calendars where id = ${id}`;
  if (!rows.length || !safeEqual(rows[0].invite_code, invite)) throw new HttpError(404, 'invalid_invite');

  const token = newSecret();
  const inserted = await db`
    insert into members (id, calendar_id, slot, name, token_hash)
    values (${crypto.randomUUID()}, ${id}, 2, ${name}, ${hashToken(token)})
    on conflict (calendar_id, slot) do nothing
    returning id`;
  if (!inserted.length) throw new HttpError(409, 'full');
  await db`update calendars set rev = rev + 1 where id = ${id}`;
  return { id, token, name };
});
