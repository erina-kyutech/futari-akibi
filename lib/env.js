// ローカル開発用に .env を読み込む最小実装（本番は Vercel の環境変数を使う）
const fs = require('fs');
const path = require('path');
try {
  const text = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch (_) { /* .env なし */ }
