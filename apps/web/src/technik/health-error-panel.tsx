import type { HealthFetchErr } from './discord-gateway-health';

export function HealthErrorPanel({ error }: { readonly error: HealthFetchErr }) {
  return (
    <section className="technik-panel technik-error" role="alert">
      <h2>Błąd połączenia z New Bot</h2>
      <p>
        <strong>{error.error}</strong>
      </p>
      {error.httpStatus !== undefined ? (
        <p className="technik-muted">HTTP {error.httpStatus}</p>
      ) : null}
      {error.body !== undefined ? (
        <code className="technik-code">{JSON.stringify(error.body, null, 2)}</code>
      ) : null}
      <p className="technik-muted" style={{ marginTop: '0.75rem' }}>
        Sprawdź lokalnie (omija CORS przeglądarki):
      </p>
      <code className="technik-code">{error.curlTip}</code>
    </section>
  );
}