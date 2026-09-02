import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PRESENTATION_ROOT = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../presentation/discord',
);

const FORBIDDEN_PLAYER_PHRASES = [
  'Fundament profilu',
  'Zakres fundamentu',
  'SoT',
  'Hub Core',
  'shell V2',
  'Shell V2',
  'trafienia',
  'trafień',
  '/panel-test',
  'roadmapie',
  'Mapa V2',
  'postać → role → okno',
] as const;

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('player-facing Discord copy', () => {
  it('does not contain forbidden engineering/roadmap phrases in presentation renderers', () => {
    const files = collectTsFiles(PRESENTATION_ROOT);
    expect(files.length).toBeGreaterThan(5);
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const phrase of FORBIDDEN_PLAYER_PHRASES) {
        if (text.includes(phrase)) {
          hits.push(`${file.replace(/\\/g, '/')}: ${phrase}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
