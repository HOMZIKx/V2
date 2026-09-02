#!/usr/bin/env node
/**
 * Minimal production static server for Admin SPA.
 * No vite preview, no secrets, SPA fallback to index.html.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(appDirectory, '../dist');
const host = process.env.HOST?.trim() || '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3001', 10);

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function healthPayload() {
  const gitCommitSha =
    process.env.V2_IMAGE_GIT_COMMIT_SHA?.trim() ||
    process.env.ZEABUR_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT_SHA?.trim() ||
    process.env.VITE_GIT_COMMIT_SHA?.trim() ||
    'unknown';
  const appVersion = process.env.APP_VERSION?.trim() || '0.0.0-dev';
  return { status: 'ok', gitCommitSha, appVersion };
}

export function resolveStaticFile(urlPath, distRoot = distDirectory) {
  const decoded = decodeURIComponent((urlPath.split('?')[0] ?? '/').replace(/\\/g, '/'));
  const relative = decoded === '/' ? '/index.html' : decoded;
  const candidate = path.normalize(path.join(distRoot, relative));
  if (!candidate.startsWith(distRoot)) {
    return path.join(distRoot, 'index.html');
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return path.join(distRoot, 'index.html');
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  response.end(payload);
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[extension] ?? 'application/octet-stream';
  response.writeHead(200, { 'content-type': contentType });
  createReadStream(filePath).pipe(response);
}

export function createAdminStaticServer(distRoot = distDirectory) {
  return createServer((request, response) => {
    const urlPath = request.url ?? '/';
    if (urlPath === '/health' || urlPath.startsWith('/health?')) {
      sendJson(response, 200, healthPayload());
      return;
    }
    sendFile(response, resolveStaticFile(urlPath, distRoot));
  });
}

const isDirectRun = process.argv[1]?.includes('serve-static.mjs') === true;
if (isDirectRun) {
  if (!existsSync(path.join(distDirectory, 'index.html'))) {
    process.stderr.write('Admin dist/index.html is missing. Run the production build first.\n');
    process.exit(1);
  }
  const server = createAdminStaticServer();
  server.listen(port, host, () => {
    process.stdout.write(`admin-static listening on ${host}:${String(port)}\n`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
