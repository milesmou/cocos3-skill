import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [rootArg = '.', portArg = '4177', host = '127.0.0.1'] = process.argv.slice(2);
const root = path.resolve(rootArg);
const port = Number(portArg);

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
]);

function resolveRequest(url) {
  const parsed = new URL(url, `http://${host}:${port}`);
  const pathname = decodeURIComponent(parsed.pathname);
  const requested = path.resolve(root, `.${pathname}`);
  if (requested !== root && !requested.startsWith(root + path.sep)) return null;
  return requested;
}

const server = http.createServer((req, res) => {
  const requested = resolveRequest(req.url || '/');
  if (!requested) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const file = fs.existsSync(requested) && fs.statSync(requested).isDirectory()
    ? path.join(requested, 'index.html')
    : requested;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mimeTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}/`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
