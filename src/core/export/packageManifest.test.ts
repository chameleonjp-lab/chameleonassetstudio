import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import type { DistributionManifest } from './atlas';
import {
  assertPackageClosure,
  buildGenericWebSidecar,
  buildPackageManifest,
  buildVerificationRecord,
  GENERIC_WEB_FIXTURE_HASH,
} from './packageManifest';

const asset = characterAsset as unknown as Asset;
const distributionManifest = {
  format: 'chameleon-distribution',
  version: '0.1.0',
  profile: 'fixed-grid',
  scale: 1,
  source: { assetJson: 'asset.json', canonical: true },
  files: {
    manifest: 'manifest.json',
    assetJson: 'asset.json',
    atlasJson: 'atlas/atlas.json',
    pages: ['atlas/pages/page-000.png'],
    mainPng: 'textures/main.png',
    mainWebp: null,
    readme: 'README.md',
    examples: ['examples/example-canvas.html'],
    helpers: ['helpers/chameleon-helpers.js'],
    engines: ['engines/README-unity.md'],
  },
  pages: [{ path: 'atlas/pages/page-000.png', width: 2048, height: 2048, rotated: false }],
  frames: [],
  animations: [],
  origin: asset.origin,
  anchors: [],
  colliders: [],
  integrity: { algorithm: 'SHA-256', manifestHash: 'a'.repeat(64) },
} as unknown as DistributionManifest;

describe('Generic Web package manifest', () => {
  it('canonical sourceとpackage専用の入口を分離する', () => {
    const manifest = buildPackageManifest(distributionManifest);
    const sidecar = buildGenericWebSidecar(asset);

    expect(manifest).toMatchObject({
      format: 'chameleon-package',
      version: '0.1.0',
      profile: 'generic-web-v1',
      source: { assetJson: 'asset.json', canonical: true },
      files: {
        distributionManifest: 'manifest.json',
        target: 'targets/generic-web.json',
        verification: 'verification/record.json',
      },
    });
    expect(sidecar).toMatchObject({
      format: 'chameleon-generic-web-sidecar',
      profile: 'generic-web-v1',
      coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down', unit: 'px' },
    });
  });

  it('verification recordは動的な時刻を持たず、同じ入力で一致する', () => {
    const first = buildVerificationRecord(distributionManifest, { sourceCommit: 'test-head' });
    const second = buildVerificationRecord(distributionManifest, { sourceCommit: 'test-head' });

    expect(first).toEqual(second);
    expect(first.fixtureHash).toBe(GENERIC_WEB_FIXTURE_HASH);
    expect(first).not.toHaveProperty('timestamp');
    expect(first).not.toHaveProperty('browserVersion');
  });

  it('package closureの欠落を検出する', () => {
    const manifest = buildPackageManifest(distributionManifest);
    const entries: Record<string, Uint8Array> = {
      'package-manifest.json': new Uint8Array([123]),
    };

    expect(() => assertPackageClosure(entries, manifest, distributionManifest)).toThrow(
      /参照先がありません/,
    );
  });
});
