/**
 * Initial native-image engineering guards, derived from compact-evaluation-0.
 * These are not measured free memory or a physical-device support guarantee.
 * Retained original/derived/history bytes and retained decoded images must also
 * be counted by their owners; an individual codec operation cannot own them.
 */
export const NATIVE_TEXTURE_PROFILE = Object.freeze({
  id: 'native-texture-compact-evaluation-0',
  maxEdge: 2048,
  maxTotalPixels: 8_000_000,
  maxFileBytes: 16 * 1024 * 1024,
  maxRetainedEncodedBytes: 16 * 1024 * 1024,
  maxOperationBytes: 128 * 1024 * 1024,
  maxQueuedOperations: 8,
  maxQueuedEncodedBytes: 16 * 1024 * 1024,
});
