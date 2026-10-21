'use strict';
const { sql, handler, authMember } = require('../lib/core');

// 参加者本人だけが読める。rev が同じなら本体を返さず unchanged のみ（ポーリングを軽くする）。
// rev を先に読んでから行を読むので、読み取り中に更新があっても次回のポーリングで必ず追いつく。
module.exports = handler('POST', async (req, body) => {
  const me = await authMember(req, body.id);
  const rev = Number(me.rev);
  if (body.rev != null && Number(body.rev) === rev) return { unchanged: true, rev };

  const db = sql();
  const [partner, rows] = await Promise.all([
    db`select name from members where calendar_id = ${body.id} and id <> ${me.id}`,
    db`select a.day::text as day, a.period, (a.member_id = ${me.id}) as mine
       from availability a where a.calendar_id = ${body.id} order by a.day`,
  ]);
  return {
    rev,
    me: { name: me.name },
    partner: partner.length ? { name: partner[0].name } : null,
    invite: partner.length ? null : me.invite_code,
    mine: rows.filter((r) => r.mine).map((r) => r.day + '|' + r.period),
    theirs: rows.filter((r) => !r.mine).map((r) => r.day + '|' + r.period),
  };
});
