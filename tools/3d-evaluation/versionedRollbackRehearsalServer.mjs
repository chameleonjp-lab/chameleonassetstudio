import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const port = Number(process.env.ROLLBACK_REHEARSAL_PORT ?? 4178);
const roots = [
  { prefix: '/rollback-old', directory: process.env.ROLLBACK_OLD_DIST },
  { prefix: '/rollback-new', directory: process.env.ROLLBACK_CURRENT_DIST },
];
for (const item of roots) {
  if (!item.directory) throw new Error(`Missing build directory for ${item.prefix}`);
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/__health') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  const mount = roots.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!mount) {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  if (pathname === mount.prefix) {
    response.writeHead(302, { location: `${mount.prefix}/` });
    response.end();
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname.slice(mount.prefix.length + 1));
  } catch {
    response.writeHead(400);
    response.end('invalid path');
    return;
  }
  const root = resolve(mount.directory);
  let filePath = resolve(root, relativePath || 'index.html');
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(400);
    response.end('invalid path');
    return;
  }
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('not a file');
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': fileStat.size,
      'content-type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end('not found');
  }
});

server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
