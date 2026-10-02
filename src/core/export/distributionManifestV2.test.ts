import Ajv from 'ajv';
import schema from '../schema/distribution-0.2.0.schema.json';
import packageSchema from '../schema/package-0.2.0.schema.json';
import { describe, expect, it, vi } from 'vitest';
import {
  assertRichPagePng,
  assertRichPath,
  canonicalRichJson,
  loadRichPackage,
  validateRichDistributionManifest,
  validateRichPackage,
} from './distributionManifestV2.js';
import { canonicalJson } from './atlas';
const hex = 'a'.repeat(64);
function fixture() {
  return {
    format: 'chameleon-distribution',
    version: '0.2.0',
    assetId: 'a',
    profile: 'packed',
    scale: 2,
    source: { assetJson: 'asset.json', canonical: true, sha256: hex },
    pages: [{ path: 'pages/page.png', width: 16, height: 16, sha256: hex }],
    frames: [
      {
        id: 'frame',
        name: 'same',
        page: 0,
        rect: { x: 1, y: 2, width: 4, height: 5 },
        sourceSize: { width: 16, height: 16 },
        contentRect: { x: 0, y: 0, width: 4, height: 5 },
        contentOffset: { x: 3, y: 4 },
        rotated: false,
        origin: { x: 2, y: 3 },
        anchors: [],
        colliders: [],
      },
    ],
    animations: [
      {
        id: 'anim',
        name: 'same',
        loop: true,
        durationMs: 100,
        occurrences: [
          {
            index: 0,
            frameId: 'frame',
            frameIndex: 0,
            page: 0,
            startMs: 0,
            durationMs: 100,
            events: [],
          },
        ],
      },
    ],
    integrity: { algorithm: 'SHA-256', manifestHash: hex },
  };
}
function png(width: number, height: number) {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set(new TextEncoder().encode('IEND'), 37);
  return bytes;
}
describe('rich manifest strict reader', () => {
  it('validates the new standalone schema without changing old schemas', () => {
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(schema);
    expect(validate(fixture())).toBe(true);
    expect(validate({ ...fixture(), version: '0.1.0' })).toBe(false);
    expect(() => ajv.compile(packageSchema)).not.toThrow();
  });
  it('accepts valid additive metadata and rejects legacy versions', () => {
    expect(validateRichDistributionManifest(fixture()).assetId).toBe('a');
    const m = fixture();
    m.version = '0.1.0';
    expect(() => validateRichDistributionManifest(m)).toThrow();
  });
  it.each(['../a', '/a', 'https://bad/a', 'x\\a', 'a//b', 'a/%2e%2e/b', 'a?x', 'a#x', './a'])(
    'rejects unsafe path %s',
    (path) => expect(() => assertRichPath(path)).toThrow(),
  );
  it('rejects invalid page, crop and occurrence references', () => {
    const m = fixture();
    m.frames[0].page = 1;
    expect(() => validateRichDistributionManifest(m)).toThrow();
    m.frames[0].page = 0;
    m.frames[0].contentRect.width = 17;
    expect(() => validateRichDistributionManifest(m)).toThrow();
    m.frames[0].contentRect.width = 4;
    m.animations[0].occurrences[0].frameId = 'missing';
    expect(() => validateRichDistributionManifest(m)).toThrow();
  });
  it('matches writer canonical hash ordering including unknown source data', () => {
    const value = { z: 1, a: [{ b: true, a: null }], x: undefined };
    expect(canonicalRichJson(value)).toBe(canonicalJson(value));
  });
  it('rejects oversized or non-PNG image headers before decode', () => {
    expect(() => assertRichPagePng(png(16, 16), { width: 16, height: 16 })).not.toThrow();
    expect(() => assertRichPagePng(png(100000, 100000), { width: 16, height: 16 })).toThrow();
    expect(() => assertRichPagePng(new Uint8Array(45), { width: 16, height: 16 })).toThrow();
  });
  it('rejects ambiguous package assets and HTTP failures', async () => {
    const pkg = {
      format: 'chameleon-package',
      version: '0.2.0',
      target: 'canvas2d',
      assets: [{ id: 'a', name: 'same', manifest: 'assets/a/manifest.json', manifestHash: hex }],
    };
    expect(validateRichPackage(pkg).assets).toHaveLength(1);
    pkg.assets.push({ ...pkg.assets[0] });
    expect(() => validateRichPackage(pkg)).toThrow();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 404 }));
    await expect(loadRichPackage('https://example.test/package-manifest.json')).rejects.toThrow(
      /HTTP 404/,
    );
    fetch.mockRestore();
  });
  it('checks package identity before fetching canonical/images', async () => {
    const manifest = fixture();
    const pkg = {
      format: 'chameleon-package',
      version: '0.2.0',
      target: 'canvas2d',
      assets: [
        { id: 'different', name: 'same', manifest: 'assets/a/manifest.json', manifestHash: hex },
      ],
    };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(pkg)))
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest)));
    await expect(loadRichPackage('https://example.test/package-manifest.json')).rejects.toThrow(
      /identity/,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockRestore();
  });
});
