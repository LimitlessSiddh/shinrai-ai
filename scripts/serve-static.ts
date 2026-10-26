/** Tiny static server for the exported dashboard (apps/web/out). Local/e2e use only. */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'apps/web/out');
const port = Number(process.argv[3] ?? 3000);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'));
  let file = join(root, path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    file = join(root, '404.html');
    res.statusCode = 404;
  }
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
  createReadStream(file)
    .on('error', () => res.writeHead(404).end())
    .pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://localhost:${port}`));
