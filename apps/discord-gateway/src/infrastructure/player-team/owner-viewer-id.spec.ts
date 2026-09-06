import { describe, expect, it } from 'vitest';

import {
  canonicalOwnerViewerId,
  ownerViewerIdCandidates,
} from './owner-viewer-id.js';

describe('ownerViewerIdCandidates', () => {
  it('canonicalizes discord: prefix to bare snowflake', () => {
    expect(canonicalOwnerViewerId('discord:1534228693017432124')).toBe(
      '1534228693017432124',
    );
    expect(canonicalOwnerViewerId('1534228693017432124')).toBe('1534228693017432124');
  });

  it('lists bare snowflake before discord: alias', () => {
    expect(ownerViewerIdCandidates('discord:123456789012345678')).toEqual([
      '123456789012345678',
      'discord:123456789012345678',
    ]);
  });

  it('keeps non-snowflake ids (V2 uuid) as single candidate', () => {
    const uuid = '11111111-2222-4333-8444-555555555555';
    expect(ownerViewerIdCandidates(uuid)).toEqual([uuid]);
    expect(canonicalOwnerViewerId(uuid)).toBe(uuid);
  });
});
