import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('Admin App', () => {
  it('renders the technical status route through React Router', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain('V2 Admin is running');
  });
});
