import { Controller, Get, Header, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { isSupportedProvider } from '../domain/identity-models.js';
import type { AuthRuntime } from '../infrastructure/auth/create-better-auth.js';
import type { IdentityEnv } from '../infrastructure/config/identity-env.js';
import { AUTH_RUNTIME, IDENTITY_CONFIG } from './identity.tokens.js';

/**
 * Dev-only proof harness so the owner can run the live OAuth gate without
 * hand-crafting requests. Never served in production and never exposes secrets,
 * provider tokens, full cookies, or stack traces.
 *
 * Social login uses a top-level GET redirect (`/identity/proof/oauth/:provider`)
 * so the OAuth state cookie is set on the same navigation that leaves for the
 * provider — fetch()+`window.location` is easy to break (and external
 * Start-Process of the authorize URL skips the cookie entirely → state_mismatch).
 */
@Controller('identity')
export class ProofUiController {
  public constructor(
    @Inject(IDENTITY_CONFIG) private readonly config: IdentityEnv,
    @Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime | null,
  ) {}

  private assertProofAvailable(): void {
    if (!this.config.IDENTITY_PROOF_UI_ENABLED || this.config.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
  }

  @Get('proof')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  public proof(): string {
    this.assertProofAvailable();
    return renderProofPage();
  }

  @Get('proof/oauth/:provider')
  public async startOAuth(
    @Param('provider') provider: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    this.assertProofAvailable();
    if (this.runtime === null || !this.config.IDENTITY_AUTH_ENABLED) {
      throw new NotFoundException();
    }
    if (!isSupportedProvider(provider)) {
      throw new NotFoundException();
    }

    const callbackURL = `${this.config.IDENTITY_AUTH_BASE_URL?.replace(/\/$/, '')}/identity/proof`;
    const result = await this.runtime.auth.api.signInSocial({
      body: { provider, callbackURL },
      returnHeaders: true,
    });

    const setCookies =
      typeof result.headers.getSetCookie === 'function' ? result.headers.getSetCookie() : [];
    if (setCookies.length > 0) {
      void reply.header('set-cookie', [...setCookies]);
    }

    const url = result.response.url;
    if (typeof url !== 'string' || url.length === 0) {
      void reply.status(500).send({ error: 'oauth_start_failed' });
      return;
    }

    void reply.redirect(url, 302);
  }
}

function renderProofPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>V2 Identity — Proof</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
    a.button, button { display: inline-block; margin: 0.25rem 0.25rem 0.25rem 0; padding: 0.5rem 0.75rem; cursor: pointer; text-decoration: none; color: inherit; border: 1px solid #888; background: #f4f4f4; border-radius: 0.25rem; font: inherit; }
    pre { background: #111; color: #eee; padding: 1rem; border-radius: 0.5rem; overflow: auto; }
    h1 { font-size: 1.25rem; }
    section { margin-bottom: 1rem; }
    .hint { color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>V2 Identity — Proof (dev only)</h1>
  <p class="hint">Use the Discord button below (do not open the Discord authorize URL from another tool — that skips the state cookie and causes <code>state_mismatch</code>). Active P2 OAuth is Discord only.</p>
  <section>
    <a class="button" href="/identity/proof/oauth/discord">Sign in with Discord</a>
  </section>
  <section>
    <button data-get="/identity/me">GET /identity/me</button>
    <button data-get="/identity/accounts">GET /identity/accounts</button>
  </section>
  <section>
    <button data-link="discord">Link Discord</button>
    <button data-unlink>Unlink account…</button>
  </section>
  <section>
    <button data-post="/identity/logout">Logout current</button>
    <button data-post="/identity/logout-all">Logout all</button>
  </section>
  <pre id="out">Ready.</pre>
  <script>
    const out = document.getElementById('out');
    const show = (label, value) => {
      out.textContent = label + '\\n' + (typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    };
    const opts = { credentials: 'include', headers: { 'content-type': 'application/json' } };
    async function link(provider) {
      const res = await fetch('/identity/link/' + provider, {
        ...opts, method: 'POST', body: JSON.stringify({ callbackURL: window.location.href }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.url) { window.location.href = data.url; return; }
      show('link ' + res.status, data);
    }
    document.querySelectorAll('[data-link]').forEach((b) =>
      b.addEventListener('click', () => link(b.dataset.link)));
    document.querySelectorAll('[data-get]').forEach((b) =>
      b.addEventListener('click', async () => {
        const res = await fetch(b.dataset.get, { credentials: 'include' });
        show(b.dataset.get + ' ' + res.status, await res.json().catch(() => ({})));
      }));
    document.querySelectorAll('[data-post]').forEach((b) =>
      b.addEventListener('click', async () => {
        // Fastify rejects Content-Type application/json with an empty body.
        const res = await fetch(b.dataset.post, { ...opts, method: 'POST', body: '{}' });
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
