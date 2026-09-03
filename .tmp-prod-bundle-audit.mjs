#!/usr/bin/env node
/** Build production admin/web artifacts and classify localhost leftovers. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

function run(cmd, args, env) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    shell: true,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('=== admin production build ===');
run('corepack', ['pnpm', '--dir', 'apps/admin', 'build'], {
  VITE_API_BASE_URL: 'https://v2-api.zeabur.app',
  NODE_ENV: 'production',
});

console.log('=== web production build ===');
run('corepack', ['pnpm', '--dir', 'apps/web', 'build'], {
  NEXT_PUBLIC_API_BASE_URL: 'https://v2-api.zeabur.app',
  NEXT_PUBLIC_IDENTITY_URL: 'https://v2-api.zeabur.app',
  NEXT_PUBLIC_WEB_ORIGIN: 'https://v2-web.zeabur.app',
  NODE_ENV: 'production',
});

function scanDir(dir, patterns) {
  const hits = [];
  if (!fs.existsSync(dir)) return hits;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(js|mjs|cjs|css|html|json)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          hits.push({ file: path.relative(root, full), pattern: String(pattern) });
          break;
        }
      }
    }
  };
  walk(dir);
  return hits;
}

const activeLocalhost = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/g;
const adminHits = scanDir(path.join(root, 'apps/admin/dist'), [activeLocalhost]);
const webHits = scanDir(path.join(root, 'apps/web/.next'), [activeLocalhost]);

const adminHasApi = scanDir(path.join(root, 'apps/admin/dist'), [/v2-api\.zeabur\.app/]).length > 0;

console.log(
  JSON.stringify(
    {
      admin: {
        bakedApiOrigin: adminHasApi,
        localhostHits: adminHits.slice(0, 20),
        localhostHitCount: adminHits.length,
      },
      web: {
        localhostHits: webHits.slice(0, 20),
        localhostHitCount: webHits.length,
      },
    },
    null,
    2,
  ),
);

if (adminHits.some((h) => /127\.0\.0\.1:4400/.test(fs.readFileSync(path.join(root, h.file), 'utf8')))) {
  console.error('FAIL: admin production bundle still contains http://127.0.0.1:4400');
  process.exit(1);
}

// Web may still mention loopback in shared helpers used for classification; fail only if default API fallback port remains active.
const webBad = webHits.filter((h) => {
  const text = fs.readFileSync(path.join(root, h.file), 'utf8');
  return /http:\/\/127\.0\.0\.1:4000/.test(text) || /http:\/\/localhost:4000/.test(text);
});
if (webBad.length > 0) {
  console.error('FAIL: web production bundle still contains active API localhost fallback', webBad.slice(0, 5));
  process.exit(1);
}

console.log('PRODUCTION_BUNDLE_AUDIT: PASS');
