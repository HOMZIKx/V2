/**
 * Technician bot configurator shell (D-060) — placeholder only.
 * Safe functional areas from WEB_ACCESS_AND_ROLE_MODEL + Centrum Aktywności Admin P4.3.
 * No live Discord / gateway config API yet — no fake save / decorative toggles.
 */

const PLACEHOLDER_AREAS = [
  {
    title: 'Rodzaje aktywności',
    detail: 'Katalog typów aktywności publikowanych przez bota.',
  },
  {
    title: 'Statusy uczestnictwa',
    detail: 'Statusy RSVP oraz flaga „zajmuje miejsce”.',
  },
  {
    title: 'Pola uczestnika',
    detail: 'Katalog pól formularza uczestnika (bez sekretów).',
  },
  {
    title: 'Kanały publikacji',
    detail: 'Dozwolone kanały publikacji per Discord (ID kanałów, nie tokeny).',
  },
  {
    title: 'Pingi',
    detail: 'Dozwolone pingi / role do powiadomień.',
  },
  {
    title: 'Limity',
    detail: 'Limity miejsc i reguły zajętości.',
  },
  {
    title: 'Inna aktywność',
    detail: 'Dostępność „Innej aktywności” per serwer.',
  },
  {
    title: 'Przypomnienia domyślne',
    detail: 'Domyślne przypomnienia przed startem aktywności.',
  },
  {
    title: 'Retencja posta Discord',
    detail: 'Czas przechowywania posta aktywności na Discordzie.',
  },
  {
    title: 'Powody zgłoszeń',
    detail: 'Katalog powodów zgłoszeń (+ Inny powód).',
  },
  {
    title: 'Panele Discord',
    detail: 'Konfiguracja paneli / komponentów publikowanych przez New Bot.',
  },
  {
    title: 'Cykl D-060 (draft → apply)',
    detail:
      'Szkielet pod draft, walidację, podgląd skutków, zastosowanie, audyt i rollback — wymaga wersjonowanego schematu możliwości z New Bot / gateway.',
  },
] as const;

export function BotConfigPage() {
  return (
    <>
      <h1>Konfiguracja bota</h1>
      <p className="admin-lead">
        Obszar Technika: bezpieczna konfiguracja funkcjonalna bota (bez tokenów, sekretów OAuth, URL
        bazy, kluczy i allowlisty właściciela). Most Discord należy do New Bot — ten panel nie
        wymyśla przełączników bez realnego efektu (D-060).
      </p>

      <div className="admin-panel-grid">
        {PLACEHOLDER_AREAS.map((area) => (
          <section key={area.title} className="admin-panel">
            <span className="admin-skeleton-tag">szkielet — API od gateway w drodze</span>
            <h2>{area.title}</h2>
            <p>{area.detail}</p>
          </section>
        ))}
      </div>
    </>
  );
}
