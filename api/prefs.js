'use strict';
const { sql, handler, authMember, normalizePresets } = require('../lib/core');

// 自分の「よく使う空き方」だけを保存する（相手には見えない。空き状況そのものとは別）
module.exports = handler('POST', async (req, body) => {
  const me = await authMember(req, body.id);
  const presets = normalizePresets(body.presets);
  await sql()`update members set presets = ${JSON.stringify(presets)}::jsonb where id = ${me.id}`;
  return { ok: true, presets };
});
