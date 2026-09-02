import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { healthPayload, resolveStaticFile } from './serve-static.mjs';

describe('admin static server helpers', () => {
  it('serves existing assets and falls back to index.html for SPA routes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'v2-admin-static-'));
    writeFileSync(path.join(root, 'index.html'), '<html>admin</html>');
    writeFileSync(path.join(root, 'app.js'), 'console.log(1)');
    expect(resolveStaticFile('/app.js', root)).toBe(path.join(root, 'app.js'));
    expect(resolveStaticFile('/login', root)).toBe(path.join(root, 'index.html'));
    expect(resolveStaticFile('/activity/types', root)).toBe(path.join(root, 'index.html'));
  });

  it('exposes a cheap health payload without secrets', () => {
    const payload = healthPayload();
    expect(payload.status).toBe('ok');
    expect(JSON.stringify(payload)).not.toMatch(/token|secret|postgres/i);
  });
});
