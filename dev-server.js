// ローカル開発用: public/ を配信し、api/*.js を Vercel 関数と同じ形式で呼び出す
require('./lib/env');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
    const file = path.join(__dirname, 'api', name + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('{"error":"not_found"}'); }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
    req.body = body;
    req.query = Object.fromEntries(url.searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return require(file)(req, res);
  }
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!p || p.endsWith('/') || p.endsWith('\\')) p += 'index.html';
  const f = path.join(PUB, p);
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
