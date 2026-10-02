import { assertDistributionTimeline } from './distributionRuntime.js';

const fail = (message) => {
  throw new Error(`Invalid distribution 0.2: ${message}`);
};
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const point = (value) => record(value) && finite(value.x) && finite(value.y);
const size = (value) => record(value) && integer(value.width) && integer(value.height);
const rect = (value) => point(value) && size(value) && integer(value.x) && integer(value.y);
const id = (value) => typeof value === 'string' && value.length > 0;
const unique = (items, key) => {
  const values = items.map(key);
  return values.every(id) && new Set(values).size === values.length;
};
export function assertRichPath(path) {
  if (
    typeof path !== 'string' ||
    !path ||
    /[\\%?#:\x00-\x20\x7f]/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    fail('unsafe relative path');
}
export function canonicalRichJson(value) {
  const sort = (entry) =>
    Array.isArray(entry)
      ? entry.map(sort)
      : record(entry)
        ? Object.fromEntries(
            Object.entries(entry)
              .filter(([, v]) => v !== undefined)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, v]) => [k, sort(v)]),
          )
        : entry;
  return JSON.stringify(sort(value));
}
export function validateRichDistributionManifest(manifest) {
  if (
    !record(manifest) ||
    manifest.format !== 'chameleon-distribution' ||
    manifest.version !== '0.2.0' ||
    !id(manifest.assetId) ||
    !['fixed-grid', 'packed'].includes(manifest.profile) ||
    ![1, 2, 3].includes(manifest.scale)
  )
    fail('header');
  if (
    !record(manifest.source) ||
    manifest.source.assetJson !== 'asset.json' ||
    manifest.source.canonical !== true ||
    !hash(manifest.source.sha256)
  )
    fail('source');
  if (
    !Array.isArray(manifest.pages) ||
    manifest.pages.length < 1 ||
    manifest.pages.length > 4 ||
    !unique(manifest.pages, (p) => p.path)
  )
    fail('pages');
  for (const page of manifest.pages) {
    assertRichPath(page.path);
    if (
      !size(page) ||
      !page.width ||
      !page.height ||
      page.width > 2048 ||
      page.height > 2048 ||
      !hash(page.sha256)
    )
      fail('page dimensions/hash');
  }
  if (
    !Array.isArray(manifest.frames) ||
    manifest.frames.length < 1 ||
    manifest.frames.length > 4096 ||
    !unique(manifest.frames, (f) => f.id)
  )
    fail('frames');
  for (const frame of manifest.frames) {
    const page = manifest.pages[frame.page];
    if (
      !integer(frame.page) ||
      !page ||
      !rect(frame.rect) ||
      !rect(frame.contentRect) ||
      !size(frame.sourceSize) ||
      !frame.sourceSize.width ||
      !frame.sourceSize.height ||
      !point(frame.contentOffset) ||
      !point(frame.origin) ||
      frame.rotated !== false
    )
      fail('frame geometry');
    if (
      frame.rect.x + frame.rect.width > page.width ||
      frame.rect.y + frame.rect.height > page.height ||
      frame.contentRect.x + frame.contentRect.width > frame.rect.width ||
      frame.contentRect.y + frame.contentRect.height > frame.rect.height ||
      frame.contentOffset.x < 0 ||
      frame.contentOffset.y < 0 ||
      frame.contentOffset.x + frame.contentRect.width > frame.sourceSize.width ||
      frame.contentOffset.y + frame.contentRect.height > frame.sourceSize.height
    )
      fail('frame bounds');
    if (
      !Array.isArray(frame.anchors) ||
      !unique(frame.anchors, (a) => a.id) ||
      !frame.anchors.every((a) => point(a.position))
    )
      fail('anchors');
    if (!Array.isArray(frame.colliders) || !unique(frame.colliders, (c) => c.id)) fail('colliders');
    for (const collider of frame.colliders) {
      if (typeof collider.visible !== 'boolean') fail('collider visibility');
      if (collider.shape === 'rect') {
        if (
          !point(collider.rect) ||
          !finite(collider.rect.width) ||
          !finite(collider.rect.height) ||
          collider.rect.width < 0 ||
          collider.rect.height < 0
        )
          fail('collider rectangle');
      } else if (collider.shape === 'circle') {
        if (
          !point(collider.circle) ||
          !finite(collider.circle.radius) ||
          collider.circle.radius < 0
        )
          fail('collider circle');
      } else fail('collider shape');
    }
  }
  if (!Array.isArray(manifest.animations) || !unique(manifest.animations, (a) => a.id))
    fail('animations');
  if (
    manifest.animations.reduce(
      (sum, timeline) =>
        sum + (Array.isArray(timeline.occurrences) ? timeline.occurrences.length : 0),
      0,
    ) > 4096
  )
    fail('occurrence budget');
  for (const timeline of manifest.animations) {
    assertDistributionTimeline(timeline);
    for (const occurrence of timeline.occurrences) {
      const frame = manifest.frames[occurrence.frameIndex];
      if (!frame || frame.id !== occurrence.frameId || frame.page !== occurrence.page)
        fail('occurrence reference');
    }
  }
  if (
    !record(manifest.integrity) ||
    manifest.integrity.algorithm !== 'SHA-256' ||
    !hash(manifest.integrity.manifestHash)
  )
    fail('integrity');
  return manifest;
}
export function validateRichPackage(manifest) {
  if (
    !record(manifest) ||
    manifest.format !== 'chameleon-package' ||
    manifest.version !== '0.2.0' ||
    !['canvas2d', 'pixijs', 'phaser'].includes(manifest.target) ||
    !Array.isArray(manifest.assets) ||
    !manifest.assets.length ||
    manifest.assets.length > 32 ||
    !unique(manifest.assets, (a) => a.id) ||
    !unique(manifest.assets, (a) => a.manifest)
  )
    fail('package');
  for (const asset of manifest.assets) {
    assertRichPath(asset.manifest);
    if (!hash(asset.manifestHash) || typeof asset.name !== 'string') fail('package asset');
  }
  return manifest;
}
async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function getBytes(url, signal, limit) {
  signal?.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}: distribution resource`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) fail('resource byte limit');
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > limit) fail('resource byte limit');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) fail('resource byte limit');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel();
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function checkedBytes(url, expectedHash, signal, limit) {
  const bytes = await getBytes(url, signal, limit);
  if ((await sha256(bytes)) !== expectedHash) fail('resource hash mismatch');
  return bytes;
}
export function assertRichPagePng(bytes, page) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((v, i) => bytes[i] === v)) fail('page is not PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(8) !== 13 ||
    String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' ||
    view.getUint32(16) !== page.width ||
    view.getUint32(20) !== page.height
  )
    fail('PNG header dimensions');
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset);
    if (offset + 12 + length > bytes.length) fail('PNG chunk bounds');
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type === 'acTL') fail('animated PNG page');
    offset += length + 12;
    if (type === 'IEND') return;
  }
  fail('PNG end chunk');
}
function decodeImage(bytes, signal) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  const image = new Image();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      URL.revokeObjectURL(url);
      signal?.removeEventListener('abort', abort);
      image.onload = image.onerror = null;
    };
    const abort = () => {
      cleanup();
      image.src = '';
      reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('Distribution image decode failed'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else image.src = url;
  });
}
export async function loadRichDistribution(
  url,
  { signal, maxDecodedBytes = 256 * 1024 * 1024, expectedId, expectedHash } = {},
) {
  const base = new URL(url, globalThis.location?.href);
  const manifest = validateRichDistributionManifest(
    JSON.parse(new TextDecoder().decode(await getBytes(base, signal, 4 * 1024 * 1024))),
  );
  if (
    (expectedId !== undefined && manifest.assetId !== expectedId) ||
    (expectedHash !== undefined && manifest.integrity.manifestHash !== expectedHash)
  )
    fail('package identity/hash');
  const decodedBytes = manifest.pages.reduce((sum, page) => sum + page.width * page.height * 4, 0);
  if (decodedBytes > maxDecodedBytes) fail('decoded image budget');
  const { integrity, ...unsigned } = manifest;
  if (
    (await sha256(new TextEncoder().encode(canonicalRichJson(unsigned)))) !== integrity.manifestHash
  )
    fail('manifest hash mismatch');
  const asset = JSON.parse(
    new TextDecoder().decode(
      await checkedBytes(
        new URL(manifest.source.assetJson, base),
        manifest.source.sha256,
        signal,
        16 * 1024 * 1024,
      ),
    ),
  );
  if (asset.id !== manifest.assetId || asset.format !== 'chameleon-asset')
    fail('canonical asset identity');
  const images = [];
  const dispose = () => {
    for (const image of images) image.src = '';
    images.length = 0;
  };
  try {
    for (const page of manifest.pages) {
      const bytes = await checkedBytes(
        new URL(page.path, base),
        page.sha256,
        signal,
        20 * 1024 * 1024,
      );
      assertRichPagePng(bytes, page);
      const image = await decodeImage(bytes, signal);
      images.push(image);
      if (image.naturalWidth !== page.width || image.naturalHeight !== page.height)
        fail('decoded page dimensions');
    }
    signal?.throwIfAborted();
    return { manifest, asset, images, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
export async function loadRichPackage(url, { signal } = {}) {
  const base = new URL(url, globalThis.location?.href);
  const packageManifest = validateRichPackage(
    JSON.parse(new TextDecoder().decode(await getBytes(base, signal, 1024 * 1024))),
  );
  const assets = [];
  const dispose = () => {
    for (const asset of assets) asset.dispose();
    assets.length = 0;
  };
  try {
    let remainingBytes = 256 * 1024 * 1024;
    for (const entry of packageManifest.assets) {
      const loaded = await loadRichDistribution(new URL(entry.manifest, base), {
        signal,
        maxDecodedBytes: remainingBytes,
        expectedId: entry.id,
        expectedHash: entry.manifestHash,
      });
      remainingBytes -= loaded.manifest.pages.reduce(
        (sum, page) => sum + page.width * page.height * 4,
        0,
      );
      assets.push(loaded);
      if (
        loaded.manifest.assetId !== entry.id ||
        loaded.manifest.integrity.manifestHash !== entry.manifestHash
      )
        fail('package identity/hash');
    }
    signal?.throwIfAborted();
    return { packageManifest, assets, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
