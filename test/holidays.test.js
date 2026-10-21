const assert = require('assert');
const J = require('../public/holidays.js');

const expect = {
  // 2026
  '2026-01-01': '元日', '2026-01-12': '成人の日', '2026-02-11': '建国記念の日', '2026-02-23': '天皇誕生日',
  '2026-03-20': '春分の日', '2026-04-29': '昭和の日', '2026-05-03': '憲法記念日', '2026-05-04': 'みどりの日',
  '2026-05-05': 'こどもの日', '2026-05-06': '振替休日', '2026-07-20': '海の日', '2026-08-11': '山の日',
  '2026-09-21': '敬老の日', '2026-09-22': '国民の休日', '2026-09-23': '秋分の日', '2026-10-12': 'スポーツの日',
  '2026-11-03': '文化の日', '2026-11-23': '勤労感謝の日',
  // 2027
  '2027-01-11': '成人の日', '2027-03-21': '春分の日', '2027-03-22': '振替休日', '2027-09-23': '秋分の日',
  '2027-11-03': '文化の日',
  // 2028
  '2028-02-23': '天皇誕生日', '2028-03-20': '春分の日', '2028-09-22': '秋分の日',
  // 2030
  '2030-03-20': '春分の日', '2030-09-23': '秋分の日',
};
for (const [d, n] of Object.entries(expect)) assert.strictEqual(J.holidayName(d), n, d);

const none = ['2026-04-30', '2026-05-07', '2026-12-25', '2026-06-15', '2027-01-04'];
for (const d of none) assert.strictEqual(J.holidayName(d), null, d);

assert.strictEqual(J.dayType('2026-10-21'), 'weekday');   // 水
assert.strictEqual(J.dayType('2026-10-24'), 'off');       // 土
assert.strictEqual(J.dayType('2026-11-03'), 'off');       // 祝日(火)
assert.deepStrictEqual(J.periodsOf('2026-11-03'), ['noon', 'night']);
assert.deepStrictEqual(J.periodsOf('2026-11-04'), ['all']);
assert.strictEqual(J.addDays('2026-12-31', 1), '2027-01-01');
assert.strictEqual(J.parse('2026-02-30'), null);
console.log('holidays OK (' + Object.keys(expect).length + ' checks)');
