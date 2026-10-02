import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { computeDistributionSheetLayout, type DistributionManifest } from './atlas';
import {
  assertPackageClosure,
  buildGenericWebHelper,
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
        atlasTexture: 'atlas/spritesheet.png',
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

  it('Atlasが参照するspritesheetをpackage closureへ含める', () => {
    const manifest = buildPackageManifest(distributionManifest);
    const paths = [
      'package-manifest.json',
      ...Object.values(manifest.files).flatMap((value) =>
        value === null ? [] : Array.isArray(value) ? value : [value],
      ),
      ...distributionManifest.files.examples,
      ...distributionManifest.files.helpers,
      ...distributionManifest.files.engines,
    ];
    const entries = Object.fromEntries(
      [...new Set(paths)]
        .filter((path) => path !== 'atlas/spritesheet.png')
        .map((path) => [path, new Uint8Array([123, 125])]),
    );

    expect(() => assertPackageClosure(entries, manifest, distributionManifest)).toThrow(
      'atlas/spritesheet.png',
    );
  });
});

describe('legacy Generic Web helper crop compatibility', () => {
  for (const profile of ['fixed-grid', 'packed'] as const) {
    it.each([1, 2, 3])(
      `samples the actual ${profile} packer coordinates at %sx without changing 0.1 metadata`,
      (scale) => {
        const layout = computeDistributionSheetLayout(
          [
            {
              id: 'frame',
              name: 'frame',
              sourceSize: { width: 32 * scale, height: 32 * scale },
              contentRect: { x: 2 * scale, y: 3 * scale, width: 8 * scale, height: 9 * scale },
            },
          ],
          { profile },
        );
        const manifest = { profile, frames: layout.frames };
        const before = structuredClone(manifest);
        const calls: unknown[][] = [];
        const draw = new Function(
          buildGenericWebHelper().replaceAll('export ', '') + '; return drawGenericWebFrame;',
        )() as (
          context: { drawImage: (...args: unknown[]) => void },
          loaded: unknown,
          name: string,
          x: number,
          y: number,
        ) => void;
        const image = { page: 0 };
        draw(
          {
            drawImage: (...args) => {
              calls.push(args);
            },
          },
          { manifest, images: [image] },
          'frame',
          100,
          200,
        );
        expect(calls[0]).toEqual([
          image,
          layout.frames[0].rect.x + (profile === 'packed' ? 0 : 2 * scale),
          layout.frames[0].rect.y + (profile === 'packed' ? 0 : 3 * scale),
          8 * scale,
          9 * scale,
          100 + 2 * scale,
          200 + 3 * scale,
          8 * scale,
          9 * scale,
        ]);
        expect(manifest).toEqual(before);
      },
    );
  }
});
