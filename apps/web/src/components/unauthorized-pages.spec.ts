import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ApiClientError } from '../lib/api.js';
import { mapApiError } from '../lib/load-state.js';

const componentsDir = dirname(fileURLToPath(import.meta.url));

const unauthorizedPages = [
  'ActivitiesPage.tsx',
  'ActivityDetailPage.tsx',
  'MyActivitiesPage.tsx',
  'InboxPage.tsx',
] as const;

describe('WWW unauthorized recovery', () => {
  it('maps 401 to unauthorized load state', () => {
    expect(mapApiError(new ApiClientError('no', { status: 401 }))).toEqual({
      kind: 'unauthorized',
    });
  });

  it.each(unauthorizedPages)('%s renders UnauthorizedState on 401', (fileName) => {
    const source = readFileSync(join(componentsDir, fileName), 'utf8');
    expect(source).toContain('UnauthorizedState');
    expect(source).toContain("state.kind === 'unauthorized'");
  });
});
