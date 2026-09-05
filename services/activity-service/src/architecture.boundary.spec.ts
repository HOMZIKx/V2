import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const domainDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'domain');

describe('architecture: activity domain isolation', () => {
  it('domain sources do not import Nest, Fastify, pg, jose, or ioredis', () => {
    const files = readdirSync(domainDir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const contents = readFileSync(path.join(domainDir, file), 'utf8');
      expect(contents.includes('@nestjs/'), `${file} must not import Nest`).toBe(false);
      expect(/\bfrom ['"]fastify['"]/.test(contents), `${file} must not import fastify`).toBe(
        false,
      );
      expect(/\bfrom ['"]pg['"]/.test(contents), `${file} must not import pg`).toBe(false);
      expect(/\bfrom ['"]jose['"]/.test(contents), `${file} must not import jose`).toBe(false);
      expect(/\bioredis\b/.test(contents), `${file} must not import ioredis`).toBe(false);
    }
  });
});
