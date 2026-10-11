import { expect, it } from 'vitest';
import {
  estimateCanonicalBytes,
  estimateBinaryCopyBytes,
  estimateJsonParseBytes,
} from './resourceEstimates';
it('counts detached copies without serializing or changing input', () => {
  const value = { name: '😀abc', coords: [1, 2, 3], enabled: true, empty: null };
  const before = structuredClone(value);
  expect(estimateCanonicalBytes(value)).toBeGreaterThan(100);
  expect(value).toEqual(before);
  expect(estimateBinaryCopyBytes(new Map([['x', new Uint8Array(12)]]), 3)).toBe(36);
});
it('bounds malformed and deeply nested traversal', () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(() => estimateCanonicalBytes(cycle)).toThrow();
  expect(() => estimateCanonicalBytes(new Date())).toThrow();
  let deep: unknown = null;
  for (let i = 0; i < 258; i++) deep = [deep];
  expect(() => estimateCanonicalBytes(deep)).toThrow();
  expect(() => estimateBinaryCopyBytes(new Map(), -1)).toThrow();
});

it('estimates JSON structure instead of multiplying UTF-8 text bytes', () => {
  for (const value of [
    {
      name: '日本語'.repeat(1000),
      escaped: String.fromCharCode(92, 34),
      list: [null, true, 4, {}],
    },
    Array.from({ length: 1000 }, () => ({})),
  ]) {
    const text = JSON.stringify(value);
    expect(estimateJsonParseBytes(text)).toBeGreaterThanOrEqual(estimateCanonicalBytes(value));
  }
  for (const text of ['{', '[}', '"unterminated', '['.repeat(257) + ']'.repeat(257)])
    expect(() => estimateJsonParseBytes(text)).toThrow();
});
