import { describe, expect, it } from 'vitest';

import { isPointInsideContainedImage } from './map-marker-geometry.js';

describe('map marker contained-image bounds', () => {
  it('rejects top and bottom letterbox bands for a landscape image', () => {
    const input = {
      boxWidth: 600,
      boxHeight: 600,
      naturalWidth: 1200,
      naturalHeight: 600,
    } as const;

    expect(isPointInsideContainedImage({ ...input, localX: 300, localY: 100 })).toBe(false);
    expect(isPointInsideContainedImage({ ...input, localX: 300, localY: 300 })).toBe(true);
    expect(isPointInsideContainedImage({ ...input, localX: 300, localY: 500 })).toBe(false);
  });

  it('rejects left and right letterbox bands for a portrait image', () => {
    const input = {
      boxWidth: 600,
      boxHeight: 450,
      naturalWidth: 300,
      naturalHeight: 600,
    } as const;

    expect(isPointInsideContainedImage({ ...input, localX: 100, localY: 225 })).toBe(false);
    expect(isPointInsideContainedImage({ ...input, localX: 300, localY: 225 })).toBe(true);
    expect(isPointInsideContainedImage({ ...input, localX: 500, localY: 225 })).toBe(false);
  });

  it('allows the exact painted-image edges', () => {
    const input = {
      boxWidth: 600,
      boxHeight: 600,
      naturalWidth: 1200,
      naturalHeight: 600,
    } as const;

    expect(isPointInsideContainedImage({ ...input, localX: 0, localY: 150 })).toBe(true);
    expect(isPointInsideContainedImage({ ...input, localX: 600, localY: 450 })).toBe(true);
  });

  it('rejects placement while intrinsic image dimensions are unavailable', () => {
    expect(
      isPointInsideContainedImage({
        boxWidth: 600,
        boxHeight: 450,
        naturalWidth: 0,
        naturalHeight: 0,
        localX: 300,
        localY: 225,
      }),
    ).toBe(false);
  });
});
