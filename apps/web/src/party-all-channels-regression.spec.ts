import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), 'utf8');
}

describe('aggregate channel view placement', () => {
  it('keeps the all-channel map view in Party', () => {
    const text = source('../app/maps/party-hunt.tsx');
    expect(text).toContain('const [allChannels, setAllChannels] = useState(false)');
    expect(text).toContain("allChannels ? 'Wszystkie kanały' : `CH${channel}`");
    expect(text).toContain('partyActiveScoutPins(pins, party, now).filter((pin) => pin.mapKey === mapKey)');
    expect(text).toContain("Wybierz konkretny CH, aby postawić pinezkę.");
    expect(text).toContain('aria-pressed={!allChannels && value === channel}');
  });

  it('does not expose aggregate channel mode in Generały/Metiny', () => {
    const text = source('../app/generaly-metki/page.tsx');
    expect(text).not.toContain('type ChannelView');
    expect(text).not.toContain('Wszystkie kanały');
    expect(text).not.toContain("channel === 'all'");
    expect(text).not.toContain("setChannel('all')");
  });
});
