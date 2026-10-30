'use strict';
const { sql, handler, authMember, normalizePresets } = require('../lib/core');

// 参加者本人だけが読める。rev が同じなら本体を返さず unchanged のみ（ポーリングを軽くする）。
// rev を先に読んでから行を読むので、読み取り中に更新があっても次回のポーリングで必ず追いつく。
// mine/theirs は空きのある項目("日付|時間帯")の一覧。終日以外は mineW/theirsW に範囲(code)を入れる。
module.exports = handler('POST', async (req, body, res) => {
  const me = await authMember(req, body.id, res);
  const rev = Number(me.rev);
  if (body.rev != null && Number(body.rev) === rev) return { unchanged: true, rev };

  const db = sql();
  const [partner, rows] = await Promise.all([
    db`select name from members where calendar_id = ${body.id} and id <> ${me.id}`,
    db`select a.day::text as day, a.period, a.code, (a.member_id = ${me.id}) as mine
       from availability a where a.calendar_id = ${body.id} order by a.day`,
  ]);
  const out = { mine: [], theirs: [], mineW: {}, theirsW: {} };
  for (const r of rows) {
    const k = r.day + '|' + r.period;
    const side = r.mine ? 'mine' : 'theirs';
    out[side].push(k);
    if (r.code !== 'F') out[side + 'W'][k] = r.code;
  }
  return {
    rev,
    me: { name: me.name },
    partner: partner.length ? { name: partner[0].name } : null,
    invite: partner.length ? null : me.invite_code,
    presets: normalizePresets(me.presets),
    ...out,
  };
});
