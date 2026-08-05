import { Controller, Get, Header, Inject, NotFoundException } from '@nestjs/common';

import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { IDENTITY_CONFIG } from './identity.tokens.js';

/**
 * Dev-only proof harness so the owner can run the live OAuth gate without
 * hand-crafting requests. Never served in production and never exposes secrets,
 * provider tokens, full cookies, or stack traces.
 */
@Controller('identity')
export class ProofUiController {
  public constructor(@Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv) {}

  @Get('proof')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  public proof(): string {
    if (!this.config.IDENTITY_PROOF_UI_ENABLED || this.config.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    return renderProofPage(this.config.IDENTITY_AUTH_BASE_PATH);
  }
}

function renderProofPage(authBasePath: string): string {
  const basePath = authBasePath.replace(/\/$/, '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>V2 Identity — Proof</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    button { display: inline-block; margin: 0.25rem 0.25rem 0.25rem 0; padding: 0.5rem 0.75rem; cursor: pointer; }
    pre { background: #111; color: #eee; padding: 1rem; border-radius: 0.5rem; overflow: auto; }
    h1 { font-size: 1.25rem; }
    section { margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>V2 Identity — Proof (dev only)</h1>
  <section>
    <button data-social="discord">Sign in with Discord</button>
    <button data-social="google">Sign in with Google</button>
  </section>
  <section>
    <button data-get="/identity/me">GET /identity/me</button>
    <button data-get="/identity/accounts">GET /identity/accounts</button>
  </section>
  <section>
    <button data-link="discord">Link Discord</button>
    <button data-link="google">Link Google</button>
    <button data-unlink>Unlink account…</button>
  </section>
  <section>
    <button data-post="/identity/logout">Logout current</button>
    <button data-post="/identity/logout-all">Logout all</button>
  </section>
  <pre id="out">Ready.</pre>
  <script>
    const BASE_PATH = ${JSON.stringify(basePath)};
    const out = document.getElementById('out');
    const show = (label, value) => {
      out.textContent = label + '\\n' + (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    };
    const opts = { credentials: 'include', headers: { 'content-type': 'application/json' } };
    async function social(provider) {
      const res = await fetch(BASE_PATH + '/sign-in/social', {
        ...opts, method: 'POST', body: JSON.stringify({ provider, callbackURL: window.location.href }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.url) { window.location.href = data.url; return; }
      show('sign-in/social ' + res.status, data);
    }
    async function link(provider) {
      const res = await fetch('/identity/link/' + provider, {
        ...opts, method: 'POST', body: JSON.stringify({ callbackURL: window.location.href }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.url) { window.location.href = data.url; return; }
      show('link ' + res.status, data);
    }
    document.querySelectorAll('[data-social]').forEach((b) =>
      b.addEventListener('click', () => social(b.dataset.social)));
    document.querySelectorAll('[data-link]').forEach((b) =>
      b.addEventListener('click', () => link(b.dataset.link)));
    document.querySelectorAll('[data-get]').forEach((b) =>
      b.addEventListener('click', async () => {
        const res = await fetch(b.dataset.get, { credentials: 'include' });
        show(b.dataset.get + ' ' + res.status, await res.json().catch(() => ({})));
      }));
    document.querySelectorAll('[data-post]').forEach((b) =>
      b.addEventListener('click', async () => {
        const res = await fetch(b.dataset.post, { ...opts, method: 'POST' });
        show(b.dataset.post + ' ' + res.status, await res.json().catch(() => ({})));
      }));
    document.querySelector('[data-unlink]').addEventListener('click', async () => {
      const accountId = prompt('Account id to unlink (from GET /identity/accounts):');
      if (!accountId) return;
      const res = await fetch('/identity/accounts/' + encodeURIComponent(accountId), {
        credentials: 'include', method: 'DELETE',
      });
      show('unlink ' + res.status, res.status === 204 ? 'ok' : await res.json().catch(() => ({})));
    });
  </script>
</body>
</html>`;
}
