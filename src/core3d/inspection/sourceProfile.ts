import { sha256 } from '../export/snapshot';
import { inspectNativeImage } from '../model/nativeImageMetadata';
import type { Source3D } from '../model/project';
import { ASSET_IO_PROFILE as P, assertIoBudget } from '../profile/assetIoProfile';
import type { Measurement } from './statistics';

export interface SourceProfile {
  sourceId: string;
  blobId: string;
  bytes: Measurement<number>;
  status: 'inspected' | 'missing' | 'invalid' | 'unsupported-container';
  /** Metadata inspection does not validate accessors, decode pixels, or execute an engine. */
  inspection: 'metadata-only';
  hashVerified: boolean;
  declaredRights: string;
  storedEmbeddedRights: string;
  embeddedTerms: { path: string; value: string | boolean }[];
  extensionsUsed: string[];
  extensionsRequired: string[];
  sourceOnlyFeatures: string[];
  vrmVersion: string | null;
  notices: string[];
}

type JsonObject = Record<string, unknown>;
const MAX_ITEMS = 256;
const MAX_TERMS = 64;
const MAX_TEXT = 4096;
class BoundedFeatures extends Set<string> {
  override add(value: string): this {
    if (!this.has(value) && this.size >= MAX_ITEMS)
      throw new Error('Too many source-only features');
    return super.add(value);
  }
}
const META_NOTICE =
  'Metadata inspection only; import support and runtime behavior are not verified.';
const RIGHTS_NOTICE =
  'User declarations and embedded terms are separate, unverified statements. Review both; differing text alone does not establish a rights conflict.';

function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function object(value: unknown, where: string): JsonObject {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    where + ': object required',
  );
  return value as JsonObject;
}
function entries(value: unknown, where: string): JsonObject[] {
  if (value === undefined) return [];
  requireValue(Array.isArray(value), where + ': array required');
  return value.map((item, index) => object(item, `${where}[${index}]`));
}
function strings(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  requireValue(
    Array.isArray(value) &&
      value.length <= MAX_ITEMS &&
      value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 256),
    where + ': bounded string list required',
  );
  return [...new Set(value as string[])].sort();
}
function boundedJson(bytes: Uint8Array): JsonObject {
  assertIoBudget(bytes.length, P.jsonBytes, 'Source metadata JSON');
  const json: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  let count = 0;
  function visit(value: unknown, level: number) {
    requireValue(++count <= P.jsonValues, 'Source metadata JSON value count exceeds profile');
    requireValue(level <= P.jsonDepth, 'Source metadata JSON depth exceeds profile');
    if (typeof value === 'number') requireValue(Number.isFinite(value), 'Non-finite JSON number');
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        requireValue(
          !['__proto__', 'prototype', 'constructor'].includes(key),
          'Unsafe source metadata JSON key',
        );
        visit(child, level + 1);
      }
    }
  }
  visit(json, 0);
  return object(json, 'Source metadata');
}

/** Reads only the bounded JSON chunk. It never copies/decodes BIN, resolves URIs, or invokes a loader. */
function glbMetadata(input: Uint8Array, features: Set<string>): JsonObject {
  requireValue(input.length >= 20, 'Truncated GLB');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  requireValue(
    view.getUint32(0, true) === 0x46546c67 &&
      view.getUint32(4, true) === 2 &&
      view.getUint32(8, true) === input.length,
    'Invalid GLB header',
  );
  let offset = 12;
  let json: JsonObject | undefined;
  let binSeen = false;
  while (offset < input.length) {
    requireValue(offset + 8 <= input.length, 'Truncated GLB chunk');
    const length = view.getUint32(offset, true),
      type = view.getUint32(offset + 4, true);
    offset += 8;
    requireValue(length % 4 === 0 && offset + length <= input.length, 'Invalid GLB chunk range');
    if (!json) {
      requireValue(type === 0x4e4f534a, 'GLB JSON must be first');
      json = boundedJson(input.subarray(offset, offset + length));
    } else if (type === 0x4e4f534a) throw new Error('Duplicate GLB JSON chunk');
    else if (type === 0x004e4942) {
      requireValue(!binSeen, 'Duplicate GLB BIN chunk');
      binSeen = true;
    } else features.add('unknown GLB chunk');
    offset += length;
  }
  requireValue(json, 'Missing GLB JSON');
  return json;
}

function inspectGltf(json: JsonObject, profile: SourceProfile, features: Set<string>) {
  const asset = object(json.asset, 'glTF asset');
  requireValue(typeof asset.version === 'string', 'Missing glTF asset version');
  if (asset.version !== '2.0' || (asset.minVersion !== undefined && asset.minVersion !== '2.0'))
    features.add('unsupported glTF asset version');
  profile.extensionsUsed = strings(json.extensionsUsed, 'extensionsUsed');
  profile.extensionsRequired = strings(json.extensionsRequired, 'extensionsRequired');
  for (const extension of [...profile.extensionsUsed, ...profile.extensionsRequired])
    features.add(extension);
  if (profile.extensionsRequired.length)
    profile.notices.push(
      'Required extensions are source-only and are rejected by the current editable import profile.',
    );

  // Also find undeclared extension objects. Declarations alone cannot establish feature fidelity.
  function visit(value: unknown, path: string) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      // extras and extension payloads are application-owned JSON, not nested glTF objects.
      // boundedJson already checked their safety/depth; reserved words have no meaning there.
      if (key === 'extras') continue;
      if (key === 'extensions') {
        const extensions = object(child, path + '.extensions');
        for (const [name, extension] of Object.entries(extensions)) {
          requireValue(name.length > 0 && name.length <= 256, 'Invalid extension name');
          object(extension, 'Extension ' + name);
          features.add(name);
          requireValue(features.size <= MAX_ITEMS, 'Too many source-only features');
        }
        continue;
      }
      // Unknown URIs, including data URIs, are reported but never fetched or decoded.
      if (key === 'uri') {
        requireValue(typeof child === 'string', 'Invalid source URI');
        features.add(child.startsWith('data:') ? 'embedded URI resource' : 'external URI resource');
      }
      visit(child, path + '.' + key);
    }
  }
  visit(json, 'glTF');

  for (const accessor of entries(json.accessors, 'accessors'))
    if (accessor.sparse !== undefined) features.add('sparse accessor');
  for (const mesh of entries(json.meshes, 'meshes')) {
    if (mesh.weights !== undefined) features.add('mesh morph weights');
    for (const primitive of entries(mesh.primitives, 'mesh primitives')) {
      if (primitive.mode !== undefined && primitive.mode !== 4)
        features.add('non-triangle primitives');
      if (primitive.targets !== undefined) features.add('morph targets');
      for (const name of Object.keys(object(primitive.attributes, 'primitive attributes')))
        if (!['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'].includes(name)) {
          requireValue(name.length <= 256, 'Invalid attribute name');
          features.add(name);
        }
    }
  }
  for (const node of entries(json.nodes, 'nodes')) {
    if (node.camera !== undefined) features.add('camera');
    if (node.weights !== undefined) features.add('node morph weights');
  }
  if (entries(json.cameras, 'cameras').length) features.add('camera');
  const scenes = entries(json.scenes, 'scenes');
  const nodes = entries(json.nodes, 'nodes');
  if (scenes.length > 1) features.add('multiple scenes');
  const sceneIndex = json.scene ?? 0;
  requireValue(
    Number.isSafeInteger(sceneIndex) && (sceneIndex as number) >= 0,
    'Invalid scene index',
  );
  const roots = scenes[sceneIndex as number]?.nodes ?? [];
  requireValue(Array.isArray(roots), 'Invalid scene root list');
  const pending: unknown[] = [...roots];
  const selected = new Set<number>();
  while (pending.length) {
    const id = pending.pop();
    requireValue(
      Number.isSafeInteger(id) && (id as number) >= 0 && (id as number) < nodes.length,
      'Invalid scene node index',
    );
    if (selected.has(id as number)) continue;
    selected.add(id as number);
    const children = nodes[id as number].children ?? [];
    requireValue(Array.isArray(children), 'Invalid child node list');
    for (const child of children) pending.push(child);
  }
  if (selected.size !== nodes.length) features.add('non-selected scene nodes retained hidden');
  for (const material of entries(json.materials, 'materials')) {
    const pbr =
      material.pbrMetallicRoughness === undefined
        ? {}
        : object(material.pbrMetallicRoughness, 'pbrMetallicRoughness');
    if (
      material.normalTexture !== undefined ||
      material.occlusionTexture !== undefined ||
      material.emissiveTexture !== undefined ||
      pbr.metallicRoughnessTexture !== undefined
    )
      features.add('additional material texture');
    if (pbr.baseColorTexture !== undefined) {
      const texture = object(pbr.baseColorTexture, 'baseColorTexture');
      if (texture.texCoord !== undefined && texture.texCoord !== 0) features.add('texture UV set');
    }
  }
  for (const image of entries(json.images, 'images'))
    if (
      image.mimeType !== undefined &&
      !['image/png', 'image/jpeg'].includes(String(image.mimeType))
    )
      features.add('non-basic image format');
  for (const texture of entries(json.textures, 'textures'))
    if (texture.sampler === undefined) features.add('texture sampler default REPEAT');
  for (const sampler of entries(json.samplers, 'samplers'))
    if (
      (sampler.wrapS ?? 10497) !== 33071 ||
      (sampler.wrapT ?? 10497) !== 33071 ||
      (sampler.magFilter ?? 9729) !== 9729 ||
      (sampler.minFilter ?? 9987) !== 9729
    )
      features.add('texture sampler');
  for (const animation of entries(json.animations, 'animations')) {
    for (const sampler of entries(animation.samplers, 'animation samplers')) {
      if (
        sampler.interpolation !== undefined &&
        !['STEP', 'LINEAR'].includes(String(sampler.interpolation))
      ) {
        requireValue(
          typeof sampler.interpolation === 'string' && sampler.interpolation.length <= 256,
          'Invalid interpolation',
        );
        features.add(sampler.interpolation);
      }
    }
    for (const channel of entries(animation.channels, 'animation channels')) {
      const target = object(channel.target, 'animation target');
      if (!['translation', 'rotation', 'scale'].includes(String(target.path))) {
        requireValue(
          typeof target.path === 'string' && target.path.length <= 256,
          'Invalid animation path',
        );
        features.add('animation ' + target.path);
      }
    }
  }

  function term(path: string, value: unknown) {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, MAX_TERMS).forEach((item, index) => term(`${path}[${index}]`, item));
      if (value.length > MAX_TERMS)
        profile.notices.push('Embedded term list was truncated for display.');
      return;
    }
    requireValue(
      typeof value === 'string' || typeof value === 'boolean',
      'Invalid embedded term: ' + path,
    );
    if (profile.embeddedTerms.length >= MAX_TERMS) {
      if (!profile.notices.includes('Embedded terms were truncated for display.'))
        profile.notices.push('Embedded terms were truncated for display.');
      return;
    }
    if (typeof value === 'string' && value.length > MAX_TEXT)
      profile.notices.push('Embedded term text was truncated for display: ' + path);
    profile.embeddedTerms.push({
      path,
      value: typeof value === 'string' ? value.slice(0, MAX_TEXT) : value,
    });
  }
  term('asset.copyright', asset.copyright);
  const extensions = json.extensions === undefined ? {} : object(json.extensions, 'extensions');
  const versions: string[] = [];
  for (const name of ['VRM', 'VRMC_vrm']) {
    if (extensions[name] === undefined) continue;
    const vrm = object(extensions[name], name);
    const version = name === 'VRM' ? vrm.exporterVersion : vrm.specVersion;
    versions.push(
      name === 'VRM'
        ? 'VRM 0.x'
        : 'VRM ' + (typeof version === 'string' ? version.slice(0, 64) : '1.x'),
    );
    if (vrm.meta === undefined) continue;
    const meta = object(vrm.meta, name + '.meta');
    for (const field of [
      'title',
      'name',
      'version',
      'author',
      'authors',
      'contactInformation',
      'reference',
      'references',
      'allowedUserName',
      'violentUssageName',
      'sexualUssageName',
      'commercialUssageName',
      'otherPermissionUrl',
      'licenseName',
      'otherLicenseUrl',
      'copyrightInformation',
      'thirdPartyLicenses',
      'licenseUrl',
      'avatarPermission',
      'allowExcessivelyViolentUsage',
      'allowExcessivelySexualUsage',
      'commercialUsage',
      'allowPoliticalOrReligiousUsage',
      'allowAntisocialOrHateUsage',
      'creditNotation',
      'allowRedistribution',
      'modification',
    ])
      term(`extensions.${name}.meta.${field}`, meta[field]);
  }
  profile.vrmVersion = versions.length ? versions.join(' / ') : null;
  requireValue(features.size <= MAX_ITEMS, 'Too many source-only features');
}

/** Inspects retained originals without normalizing, converting, fetching, or claiming legal clearance. */
export async function inspectSourceProfile(
  source: Source3D,
  bytes?: Uint8Array,
): Promise<SourceProfile> {
  const mimeType = source.mimeType;
  const profile: SourceProfile = {
    sourceId: source.id,
    blobId: source.blobId,
    bytes: bytes
      ? { status: 'known', value: bytes.byteLength }
      : { status: 'unknown', reason: 'Source bytes are unavailable' },
    status: bytes ? 'invalid' : 'missing',
    inspection: 'metadata-only',
    hashVerified: false,
    declaredRights: source.rights.declared,
    storedEmbeddedRights: source.rights.embedded,
    embeddedTerms: [],
    extensionsUsed: [],
    extensionsRequired: [],
    sourceOnlyFeatures: [],
    vrmVersion: null,
    notices: [META_NOTICE, RIGHTS_NOTICE],
  };
  if (!bytes) return profile;
  const features = new BoundedFeatures();
  try {
    assertIoBudget(bytes.length, P.sourceBytes, 'Source inspection');
    // Capture before hashing awaits; caller mutation cannot change the inspected identity.
    const input = bytes.slice();
    profile.hashVerified = (await sha256(input)) === profile.blobId;
    requireValue(profile.hashVerified, 'Source SHA-256 does not match the retained blob ID');
    if (mimeType === 'model/gltf-binary')
      inspectGltf(glbMetadata(input, features), profile, features);
    else if (mimeType === 'application/json') boundedJson(input);
    else if (mimeType === 'image/png' || mimeType === 'image/jpeg') {
      requireValue(
        inspectNativeImage(input).mimeType === mimeType,
        'Source image MIME type mismatch',
      );
    } else {
      profile.status = 'unsupported-container';
      profile.notices.push(
        'The retained source container is not inspected by this metadata profile.',
      );
      return profile;
    }
    profile.status = 'inspected';
  } catch (error) {
    profile.status = 'invalid';
    profile.notices.push(
      error instanceof Error ? error.message : 'Source metadata inspection failed',
    );
  }
  profile.sourceOnlyFeatures = [...features].sort();
  return profile;
}
