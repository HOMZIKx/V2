import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  FormField,
  LoadingState,
  MultiSelect,
  Panel,
  Select,
  Toggle,
} from './primitives.js';

describe('design-system primitives', () => {
  it('renders a labelled form field and associated error', () => {
    const markup = renderToStaticMarkup(
      FormField({
        label: 'Kanał publikacji',
        htmlFor: 'publish-channel',
        error: 'Wybierz kanał.',
        children: Select({
          id: 'publish-channel',
          options: [{ value: '1', label: '#centrum-aktywnosci' }],
        }),
      }),
    );
    expect(markup).toContain('Kanał publikacji');
    expect(markup).toContain('#centrum-aktywnosci');
    expect(markup).toContain('Wybierz kanał.');
    expect(markup).toContain('id="publish-channel-error"');
  });

  it('renders a panel and primary button', () => {
    const markup = renderToStaticMarkup(
      Panel({
        title: 'Pulpit',
        children: Button({ variant: 'primary', children: 'Konfiguruj Centrum' }),
      }),
    );
    expect(markup).toContain('Pulpit');
    expect(markup).toContain('v2-btn-primary');
  });

  it('renders multi-select options by name, not as a textarea', () => {
    const markup = renderToStaticMarkup(
      MultiSelect({
        legend: 'Role',
        options: [{ value: 'r1', label: 'Smok' }],
        selected: ['r1'],
        onChange: () => undefined,
      }),
    );
    expect(markup).toContain('Smok');
    expect(markup).not.toContain('textarea');
  });

  it('keeps link-button contrast on hover instead of inheriting text-link color', () => {
    const css = readFileSync(new URL('./primitives.css', import.meta.url), 'utf8');
    expect(css).toContain('a.v2-btn-primary:hover');
    expect(css).toMatch(/a\.v2-btn-primary:hover[\s\S]*color: #141516/);
    expect(css).toContain('.v2-btn:hover:not(:disabled)');
    expect(css).toContain('color: var(--v2-text)');
  });

  it('renders remaining product primitives', () => {
    expect(
      renderToStaticMarkup(
        Toggle({ id: 'dm', label: 'Włączone', checked: true, onChange: () => undefined }),
      ),
    ).toContain('Włączone');
    expect(renderToStaticMarkup(Badge({ tone: 'ok', children: 'Gotowe' }))).toContain('Gotowe');
    expect(renderToStaticMarkup(Alert({ tone: 'error', children: 'Błąd' }))).toContain('Błąd');
    expect(renderToStaticMarkup(EmptyState({ children: 'Brak danych' }))).toContain('Brak danych');
    expect(renderToStaticMarkup(LoadingState({}))).toContain('Ładowanie');
    expect(renderToStaticMarkup(DataTable({ children: 'wiersz' }))).toContain('v2-table');
  });
});
