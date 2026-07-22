export const H3_PUBLICATION_DURATION_MS = 24 * 60 * 60 * 1000;

export interface H3PublicationWindow {
  publishedAt: string;
  publishedAtMs: number;
  expiresAt: string;
  expiresAtMs: number;
}

export type H3PublicationState = 'pending' | 'open' | 'expired';

function parseTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} must be a valid ISO-8601 timestamp`);
  }
  return timestamp;
}

export function createH3PublicationWindow(
  publishedAt: string | null | undefined,
  expiresAt: string | null | undefined,
): H3PublicationWindow | null {
  const normalizedPublishedAt = publishedAt?.trim() || null;
  const normalizedExpiresAt = expiresAt?.trim() || null;

  if (normalizedPublishedAt === null && normalizedExpiresAt === null) {
    return null;
  }
  if (normalizedPublishedAt === null || normalizedExpiresAt === null) {
    throw new Error('H3 publication requires both publishedAt and expiresAt');
  }

  const publishedAtMs = parseTimestamp(normalizedPublishedAt, 'publishedAt');
  const expiresAtMs = parseTimestamp(normalizedExpiresAt, 'expiresAt');
  if (expiresAtMs - publishedAtMs !== H3_PUBLICATION_DURATION_MS) {
    throw new Error('H3 publication window must be exactly 24 hours');
  }

  return {
    publishedAt: normalizedPublishedAt,
    publishedAtMs,
    expiresAt: normalizedExpiresAt,
    expiresAtMs,
  };
}

export function getH3PublicationState(
  window: H3PublicationWindow,
  nowMs: number,
): H3PublicationState {
  if (!Number.isFinite(nowMs)) {
    throw new Error('nowMs must be finite');
  }
  if (nowMs < window.publishedAtMs) {
    return 'pending';
  }
  if (nowMs >= window.expiresAtMs) {
    return 'expired';
  }
  return 'open';
}
