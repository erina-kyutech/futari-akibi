/* 日本の祝日・日付ユーティリティ（ブラウザ/Node 共用）。
 * 日付は常に 'YYYY-MM-DD' の文字列で扱い、日本時間(JST)基準に統一する。
 * 祝日は法律の規則から毎年計算するので、年が変わっても更新不要。
 * 春分・秋分の近似式は 1980〜2099 年で有効。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JPDate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var fmt = function (y, m, d) { return y + '-' + pad(m) + '-' + pad(d); };

  function parse(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  // 0=日 ... 6=土
  function dow(s) {
    var p = parse(s);
    return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  }

  function addDays(s, n) {
    var p = parse(s);
    var t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }

  // 端末のタイムゾーンに依存せず、常に日本時間の「今日」を返す
  function today() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  // 第 n 月曜日の日
  function nthMonday(y, m, n) {
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((8 - first) % 7) + (n - 1) * 7;
  }

  function springEquinox(y) {
    return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  }
  function autumnEquinox(y) {
    return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  }

  var cache = {};

  function holidaysOfYear(y) {
    if (cache[y]) return cache[y];
    var h = {};
    var add = function (m, d, name) { h[fmt(y, m, d)] = name; };

    add(1, 1, '元日');
    add(1, nthMonday(y, 1, 2), '成人の日');
    add(2, 11, '建国記念の日');
    if (y >= 2020) add(2, 23, '天皇誕生日');
    else if (y >= 1989 && y <= 2018) add(12, 23, '天皇誕生日');
    add(3, springEquinox(y), '春分の日');
    add(4, 29, '昭和の日');
    add(5, 3, '憲法記念日');
    add(5, 4, 'みどりの日');
    add(5, 5, 'こどもの日');
    if (y === 2019) { add(5, 1, '休日(即位の日)'); add(10, 22, '即位礼正殿の儀'); }

    // 海の日・スポーツの日・山の日（2020・2021年は五輪対応の特例）
    if (y === 2020) { add(7, 23, '海の日'); add(7, 24, 'スポーツの日'); add(8, 10, '山の日'); }
    else if (y === 2021) { add(7, 22, '海の日'); add(7, 23, 'スポーツの日'); add(8, 8, '山の日'); }
    else {
      add(7, nthMonday(y, 7, 3), '海の日');
      if (y >= 2016) add(8, 11, '山の日');
      add(10, nthMonday(y, 10, 2), y >= 2020 ? 'スポーツの日' : '体育の日');
    }

    add(9, nthMonday(y, 9, 3), '敬老の日');
    add(9, autumnEquinox(y), '秋分の日');
    add(11, 3, '文化の日');
    add(11, 23, '勤労感謝の日');

    // 国民の休日：前後を祝日にはさまれた平日（日曜は対象外）
    var base = Object.keys(h);
    base.forEach(function (k) {
      var next = addDays(k, 2);
      if (h[next] && !h[addDays(k, 1)] && dow(addDays(k, 1)) !== 0) h[addDays(k, 1)] = '国民の休日';
    });

    // 振替休日：祝日が日曜なら、その後の最初の祝日でない日
    Object.keys(h).forEach(function (k) {
      if (dow(k) === 0 && y >= 1973) {
        var n = addDays(k, 1);
        while (h[n]) n = addDays(n, 1);
        h[n] = '振替休日';
      }
    });

    cache[y] = h;
    return h;
  }

  function holidayName(s) {
    var p = parse(s);
    if (!p) return null;
    var h = holidaysOfYear(p.y)[s];
    if (h) return h;
    // 12月末の振替が翌年に及ぶことはないが、念のため年またぎは考慮しない
    return null;
  }

  // 'off' = 土日・祝日（昼/夜を選ぶ日）、'weekday' = 平日（日付ごとに選ぶ日）
  function dayType(s) {
    var w = dow(s);
    return (w === 0 || w === 6 || holidayName(s)) ? 'off' : 'weekday';
  }

  // その日に選べる時間帯
  function periodsOf(s) {
    return dayType(s) === 'off' ? ['noon', 'night'] : ['all'];
  }

  return {
    parse: parse, dow: dow, addDays: addDays, today: today, daysInMonth: daysInMonth,
    fmt: fmt, holidayName: holidayName, holidaysOfYear: holidaysOfYear,
    dayType: dayType, periodsOf: periodsOf
  };
});
