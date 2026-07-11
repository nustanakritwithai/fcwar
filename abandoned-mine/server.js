// Tiny dependency-free static server for the Abandoned Mine prototype.
// Serves this folder plus node_modules/three so the browser can import the
// three.js ES modules directly (no bundler needed).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const port = Number(process.env.PORT || 3001);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/abandoned-mine/';
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  if (urlPath === '/healthz') { res.writeHead(200); res.end('ok'); return; }

  // Only expose the game folder and three.js — nothing else in the repo.
  if (!urlPath.startsWith('/abandoned-mine/') && !urlPath.startsWith('/node_modules/three/')) {
    res.writeHead(404); res.end('not found'); return;
  }
  const file = path.join(repoRoot, urlPath);
  if (!file.startsWith(repoRoot)) { res.writeHead(403); res.end(); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Abandoned Mine running at http://localhost:${port}/abandoned-mine/`);
});
