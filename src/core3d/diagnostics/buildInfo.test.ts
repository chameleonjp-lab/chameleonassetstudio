import { expect, it } from 'vitest';
import { parseBuildInformation } from './buildInfo';
const valid = () => ({
  format: 'chameleon-build-info-1',
  appVersion: '0.1.0',
  sourceRevision: 'a'.repeat(40),
  sourceDirty: false,
  nativeSchemaVersion: '0.3.0',
});
it('returns a detached strictly allowlisted build identity, not project state', () => {
  const input = valid(),
    before = structuredClone(input);
  const parsed = parseBuildInformation(input);
  expect(parsed).toEqual(input);
  expect(parsed).not.toBe(input);
  expect(input).toEqual(before);
});
it('rejects unsupported fields, credentials/URLs, malformed revisions and getters', () => {
  for (const input of [
    null,
    [],
    { ...valid(), project: 'secret' },
    { ...valid(), sourceRevision: 'https://private/path?token=secret' },
    { ...valid(), appVersion: 'secret@example.com' },
    { ...valid(), sourceDirty: 'false' },
    { ...valid(), nativeSchemaVersion: 'next' },
    Object.create(valid()),
  ])
    expect(() => parseBuildInformation(input)).toThrow('情報形式');
  let read = false;
  const input = { ...valid() };
  Object.defineProperty(input, 'appVersion', {
    get() {
      read = true;
      return '0.1.0';
    },
  });
  expect(() => parseBuildInformation(input)).toThrow();
  expect(read).toBe(false);
});
