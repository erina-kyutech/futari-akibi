// 使い方: DATABASE_URL を環境変数か .env に入れて `npm run migrate`
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');
require('../lib/env');

(async () => {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL が未設定です'); process.exit(1); }
  const sql = neon(process.env.DATABASE_URL);
  const text = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const stmts = text.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) await sql(s);
  console.log('migrated: ' + stmts.length + ' statements');
})().catch((e) => { console.error(e); process.exit(1); });
