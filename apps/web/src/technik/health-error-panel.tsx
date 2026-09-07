import type { HealthFetchErr } from './discord-gateway-health';

export function HealthErrorPanel({ error }: { readonly error: HealthFetchErr }) {
  return (
    <section className="technik-panel technik-error" role="alert">
      <h2>Bot ma problem z połączeniem</h2>
      <p>Nie udało się dogadać z botem. Spokojnie — poniżej jest krótki opis i wskazówka.</p>
      <p>
        <strong>{error.error}</strong>
      </p>
      {error.httpStatus !== undefined ? (
        <p className="technik-muted">Kod HTTP: {error.httpStatus}</p>
      ) : null}
      {error.body !== undefined ? (
        <code className="technik-code">{JSON.stringify(error.body, null, 2)}</code>
      ) : null}
      <p className="technik-muted" style={{ marginTop: '0.75rem' }}>
        Jeśli znasz terminal, możesz sprawdzić lokalnie (omija ograniczenia przeglądarki):
      </p>
      <code className="technik-code">{error.curlTip}</code>
    </section>
  );
}
