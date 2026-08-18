// 本地 R2 存储模拟：把 public/ 目录当作 R2 桶，通过独立端口(8788)以「CDN 域名」形式提供静态资源。
// 生产环境对应：MEDIA_BASE=https://assets.karfanjara.ge（真实 R2 绑定域名）。
// 用法：node scripts/r2-local.mjs  （端口可通过 PORT 环境变量覆盖）
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = normalize(join(__dirname, '..', 'public'));
const PORT = Number(process.env.PORT) || 8788;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    // 防目录穿越
    const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = join(ROOT, safe);
    let info;
    try {
      info = await stat(filePath);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found (local R2): ' + urlPath);
      return;
    }
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
    }
    const data = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 ' + (e?.message || e));
  }
});

server.listen(PORT, () => {
  console.log(`[r2-local] serving ${ROOT} at http://localhost:${PORT}  (simulated R2 CDN, set MEDIA_BASE=http://localhost:${PORT})`);
});
