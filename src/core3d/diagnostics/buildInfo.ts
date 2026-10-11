export interface AppBuildInformation {
  format: 'chameleon-build-info-1';
  appVersion: string;
  sourceRevision: string;
  sourceDirty: boolean;
  nativeSchemaVersion: string;
}
const version =
  /^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})(?:-[A-Za-z0-9.-]{1,48})?$/;
/** Same-origin metadata is still untrusted input; no URLs, instructions or arbitrary fields. */
export function parseBuildInformation(value: unknown): AppBuildInformation {
  const fail = () => {
    throw new Error('配信版の情報形式を確認できませんでした。');
  };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail();
  const keys = ['format', 'appVersion', 'sourceRevision', 'sourceDirty', 'nativeSchemaVersion'];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.keys(descriptors).sort().join(',') !== [...keys].sort().join(',') ||
    keys.some((key) => !('value' in descriptors[key]))
  )
    return fail();
  const get = (key: string): unknown => descriptors[key].value;
  const appVersion = get('appVersion'),
    sourceRevision = get('sourceRevision'),
    sourceDirty = get('sourceDirty'),
    nativeSchemaVersion = get('nativeSchemaVersion');
  if (
    get('format') !== 'chameleon-build-info-1' ||
    typeof appVersion !== 'string' ||
    !version.test(appVersion) ||
    typeof sourceRevision !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sourceRevision) ||
    typeof sourceDirty !== 'boolean' ||
    typeof nativeSchemaVersion !== 'string' ||
    !version.test(nativeSchemaVersion)
  )
    return fail();
  return {
    format: 'chameleon-build-info-1',
    appVersion,
    sourceRevision: sourceRevision.toLowerCase(),
    sourceDirty,
    nativeSchemaVersion,
  };
}
