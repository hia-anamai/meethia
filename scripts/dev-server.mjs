// เซิร์ฟเวอร์ทดสอบหน้าเว็บในเครื่อง: node scripts/dev-server.mjs แล้วเปิด http://localhost:5173/?mock=1&m=WS-02-2570
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const binary = new Set(['.png', '.woff2']);

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const page = path === '/' || path.startsWith('/m/') ? 'index.html' : path === '/admin' ? 'admin.html' : path;
  const file = normalize(join(root, page));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    const ext = extname(file);
    const type = types[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': binary.has(ext) ? type : type + '; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}/?mock=1&m=WS-02-2570`));
