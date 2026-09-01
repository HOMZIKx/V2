import { HUB_CENTRUM_SECTION_LABELS, HUB_CENTRUM_SELECT_OPTIONS } from '@v2/hub-core';

export function HubPreview() {
  const gra = HUB_CENTRUM_SELECT_OPTIONS.filter((option) => option.section === 'GRA');
  const dlaCiebie = HUB_CENTRUM_SELECT_OPTIONS.filter((option) => option.section === 'DLA_CIEBIE');

  return (
    <div className="hub-preview" aria-label="Podgląd Centrum V2">
      <div className="hub-preview-header">Centrum V2</div>
      <div className="hub-preview-section">
        <div className="hub-preview-section-title">{HUB_CENTRUM_SECTION_LABELS.GRA}</div>
        <div className="hub-preview-actions">
          {gra.map((option) => (
            <span key={option.value} className="hub-preview-chip">
              {option.label}
            </span>
          ))}
        </div>
      </div>
      <div className="hub-preview-section">
        <div className="hub-preview-section-title">{HUB_CENTRUM_SECTION_LABELS.DLA_CIEBIE}</div>
        <div className="hub-preview-actions">
          {dlaCiebie.map((option) => (
            <span key={option.value} className="hub-preview-chip">
              {option.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
