import type { HealthFetchErr } from './discord-gateway-health.js';

export function HealthErrorPanel({ error }: { readonly error: HealthFetchErr }) {
  return (
    <section className="admin-panel admin-error" role="alert">
      <h2>Błąd połączenia z New Bot</h2>
      <p>
        <strong>{error.error}</strong>
      </p>
      {error.httpStatus !== undefined ? (
        <p className="admin-muted">HTTP {error.httpStatus}</p>
      ) : null}
      {error.body !== undefined ? (
        <code className="admin-code">{JSON.stringify(error.body, null, 2)}</code>
      ) : null}
      <p className="admin-muted" style={{ marginTop: '0.75rem' }}>
        Sprawdź lokalnie (omija CORS przeglądarki):
      </p>
      <code className="admin-code">{error.curlTip}</code>
    </section>
  );
}
