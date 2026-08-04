import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import * as designSystem from './index.js';
import { getToneColor, StatusBadge } from './status-badge.js';

describe('getToneColor', () => {
  it('exposes the package entrypoint', () => {
    expect(designSystem.StatusBadge).toBe(StatusBadge);
  });
  it('returns the accessible color for each supported tone', () => {
    expect(getToneColor('ok')).toBe('#15803d');
    expect(getToneColor('warn')).toBe('#a16207');
    expect(getToneColor('error')).toBe('#b91c1c');
  });
});

describe('StatusBadge', () => {
  it('renders the label and tone attributes', () => {
    const markup = renderToStaticMarkup(StatusBadge({ label: 'Ready', tone: 'ok' }));
    expect(markup).toContain('Ready');
    expect(markup).toContain('data-tone="ok"');
    expect(markup).toContain('#15803d');
  });
});
