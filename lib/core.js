'use strict';
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');
const JP = require('../public/holidays.js');

let _sql;
function sql() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    // 環境変数の登録経路によっては先頭に BOM や改行が混ざることがあるので取り除く
    _sql = neon(process.env.DATABASE_URL.replace(/^﻿/, '').trim());
  }
  return _sql;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

const newSecret = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

// 共通ハンドラ: メソッド検証・JSON本文・エラー整形・キャッシュ無効化
function handler(method, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== method) throw new HttpError(405, 'method_not_allowed');
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const out = await fn(req, body && typeof body === 'object' ? body : {});
      res.status(200).json(out);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.code });
      console.error(e);
      res.status(500).json({ error: 'server_error' });
    }
  };
}

function cleanName(v) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!s || [...s].length > 12) throw new HttpError(400, 'invalid_name');
  return s;
}

// Authorization: Bearer <token> + calendar id から参加者を特定する。
// カレンダーが存在しない場合も、トークンが違う場合も、同じ 403 を返す。
async function authMember(req, calendarId) {
  const h = String(req.headers['authorization'] || '');
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!isUuid(calendarId) || token.length < 20 || token.length > 200) throw new HttpError(403, 'forbidden');
  const rows = await sql()`
    select m.id, m.slot, m.name, m.presets, c.rev, c.invite_code
    from members m join calendars c on c.id = m.calendar_id
    where m.calendar_id = ${calendarId} and m.token_hash = ${hashToken(token)}`;
  if (!rows.length) throw new HttpError(403, 'forbidden');
  return rows[0];
}

// 変更1件を検証して { date, period, code } に正規化する。不正なら null。
// code: ''=解除 / 'F'=終日 / 'U18'=18時まで / 'S21'=21時から（旧形式の on:true/false も受け付ける）。
// 日付と時間帯の組: 平日は all、土日祝は noon/night のみ。今日〜約2年先。昼(noon)には範囲を付けられない。
function normalizeChange(c, today, limit) {
  if (!c || typeof c !== 'object') return null;
  const code = typeof c.code === 'string' ? c.code : c.on === true ? 'F' : c.on === false ? '' : null;
  if (code === null || (code !== '' && !JP.validCode(code))) return null;
  if (!JP.parse(c.date) || c.date < today || c.date > limit) return null;
  if (!JP.periodsOf(c.date).includes(c.period)) return null;
  if (c.period === 'noon' && code !== '' && code !== 'F') return null;
  return { date: c.date, period: c.period, code };
}

// 本人の「よく使う空き方」。平日と夜それぞれ、範囲つきの code を最大3つ
const DEFAULT_PRESETS = { weekday: ['U9', 'U18', 'S21'], night: ['U21', 'U23'] };
function normalizePresets(p) {
  const clean = (a, fallback) => {
    if (!Array.isArray(a)) return fallback;
    const out = [];
    for (const c of a) if (JP.validCode(c) && c !== 'F' && !out.includes(c)) out.push(c);
    return out.slice(0, 3);
  };
  p = p && typeof p === 'object' ? p : {};
  return { weekday: clean(p.weekday, DEFAULT_PRESETS.weekday), night: clean(p.night, DEFAULT_PRESETS.night) };
}

module.exports = { sql, isUuid, newSecret, hashToken, safeEqual, HttpError, handler, cleanName, authMember, normalizeChange, normalizePresets, DEFAULT_PRESETS, JP };
