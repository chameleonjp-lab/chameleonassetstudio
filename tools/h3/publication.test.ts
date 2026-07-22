import { describe, expect, it } from 'vitest';

import {
  createH3PublicationWindow,
  getH3PublicationState,
  H3_PUBLICATION_DURATION_MS,
} from './publication';

const PUBLISHED_AT = '2026-07-22T09:00:00Z';
const EXPIRES_AT = '2026-07-23T09:00:00Z';

describe('H3 temporary publication window', () => {
  it('allows local builds to omit the publication window', () => {
    expect(createH3PublicationWindow(undefined, undefined)).toBeNull();
    expect(createH3PublicationWindow('', '  ')).toBeNull();
  });

  it('requires a complete and exact 24-hour window', () => {
    expect(() => createH3PublicationWindow(PUBLISHED_AT, undefined)).toThrow(
      'requires both publishedAt and expiresAt',
    );
    expect(() => createH3PublicationWindow('not-a-date', EXPIRES_AT)).toThrow(
      'publishedAt must be a valid ISO-8601 timestamp',
    );
    expect(() => createH3PublicationWindow(PUBLISHED_AT, '2026-07-23T08:59:59Z')).toThrow(
      'must be exactly 24 hours',
    );
  });

  it('opens inclusively at the start and expires exclusively at the end', () => {
    const window = createH3PublicationWindow(PUBLISHED_AT, EXPIRES_AT);
    expect(window).not.toBeNull();
    if (!window) {
      throw new Error('Expected a configured publication window');
    }

    expect(window.expiresAtMs - window.publishedAtMs).toBe(H3_PUBLICATION_DURATION_MS);
    expect(getH3PublicationState(window, window.publishedAtMs - 1)).toBe('pending');
    expect(getH3PublicationState(window, window.publishedAtMs)).toBe('open');
    expect(getH3PublicationState(window, window.expiresAtMs - 1)).toBe('open');
    expect(getH3PublicationState(window, window.expiresAtMs)).toBe('expired');
  });

  it('rejects a non-finite clock value', () => {
    const window = createH3PublicationWindow(PUBLISHED_AT, EXPIRES_AT);
    if (!window) {
      throw new Error('Expected a configured publication window');
    }
    expect(() => getH3PublicationState(window, Number.NaN)).toThrow('nowMs must be finite');
  });
});
