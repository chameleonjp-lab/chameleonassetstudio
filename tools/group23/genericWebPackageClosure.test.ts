import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AtlasJson, DistributionManifest } from '../../src/core/export/atlas';
import type {
  GenericWebPackageManifest,
  GenericWebSidecar,
} from '../../src/core/export/packageManifest';
import type { Asset } from '../../src/core/model';
import { validateAssetForPersistence } from '../../src/core/schema/validate';

interface VerificationRecord {
  format: string;
  version: string;
  profile: string;
  status: string;
  expected: string[];
  limitations: string[];
}

type Rect = { x: number; y: number; width: number; height: number };
type Circle = { x: number; y: number; radius: number };
type ColliderGeometry = {
  name: string;
  shape: string;
  rect?: Rect;
  circle?: Circle;
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = resolve(repositoryRoot, 'public/generic-web-fixture');

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(fixtureRoot, relativePath), 'utf8')) as T;
}

function packageReferences(manifest: GenericWebPackageManifest): string[] {
  return Object.values(manifest.files).flatMap((value) =>
    value === null ? [] : Array.isArray(value) ? value : [value],
  );
}

function assertSafeReference(relativePath: string): void {
  expect(relativePath, 'package paths must be relative and safe').not.toMatch(
    /^(?:\/|[A-Za-z]:|https?:)/,
  );
  expect(relativePath.split('/')).not.toContain('..');
  expect(relativePath).not.toContain('\\');
}

function assetAnchorCoordinates(
  asset: Asset,
): Array<{ name: string; role: string; x: number; y: number }> {
  return asset.anchors.map(({ name, role, position }) => ({
    name,
    role,
    x: position.x,
    y: position.y,
  }));
}

function atlasAnchorCoordinates(
  anchors: AtlasJson['anchors'],
): Array<{ name: string; role: string; x: number; y: number }> {
  return anchors.map(({ name, role, x, y }) => ({ name, role, x, y }));
}

function distributionAnchorCoordinates(
  anchors: DistributionManifest['anchors'],
): Array<{ name: string; role: string; x: number; y: number }> {
  return anchors.map(({ name, role, x, y }) => ({ name, role, x, y }));
}

function sidecarAnchorCoordinates(
  anchors: GenericWebSidecar['anchors'],
): Array<{ name: string; role: string; x: number; y: number }> {
  return anchors.map(({ name, role, position }) => ({
    name,
    role,
    x: position.x,
    y: position.y,
  }));
}

function colliderGeometry(collider: ColliderGeometry): ColliderGeometry {
  return {
    name: collider.name,
    shape: collider.shape,
    ...(collider.shape === 'rect' ? { rect: collider.rect } : { circle: collider.circle }),
  };
}

describe('Generic Web package closure', () => {
  it('matches the production package, distribution, atlas, sidecar, and canonical asset contracts', () => {
    const packageManifest = readJson<GenericWebPackageManifest>('package-manifest.json');
    expect(packageManifest).toMatchObject({
      format: 'chameleon-package',
      version: '0.1.0',
      profile: 'generic-web-v1',
      status: 'candidate',
      source: { assetJson: 'asset.json', canonical: true },
      files: {
        distributionManifest: 'manifest.json',
        assetJson: 'asset.json',
        atlasJson: 'atlas/atlas.json',
        mainPng: 'textures/main.png',
        mainWebp: null,
        target: 'targets/generic-web.json',
      },
    });

    for (const relativePath of packageReferences(packageManifest)) {
      assertSafeReference(relativePath);
      const absolutePath = resolve(fixtureRoot, relativePath);
      expect(relative(fixtureRoot, absolutePath)).not.toMatch(/^\.\.(?:[\\/]|$)/);
      expect(existsSync(absolutePath), relativePath).toBe(true);
      expect(statSync(absolutePath).isFile(), relativePath).toBe(true);
      expect(statSync(absolutePath).size, relativePath).toBeGreaterThan(0);
    }

    const distribution = readJson<DistributionManifest>(
      String(packageManifest.files.distributionManifest),
    );
    const asset = readJson<Asset>(String(packageManifest.files.assetJson));
    const atlas = readJson<AtlasJson>(String(packageManifest.files.atlasJson));
    const target = readJson<GenericWebSidecar>(String(packageManifest.files.target));
    const verification = readJson<VerificationRecord>(String(packageManifest.files.verification));

    expect(validateAssetForPersistence(asset).valid).toBe(true);
    expect(asset).toMatchObject({ format: 'chameleon-asset', version: '0.2.0' });
    expect(distribution).toMatchObject({
      format: 'chameleon-distribution',
      version: '0.1.0',
      profile: 'fixed-grid',
      scale: 2,
      source: packageManifest.source,
    });
    expect(distribution.files).toEqual({
      manifest: packageManifest.files.distributionManifest,
      assetJson: packageManifest.files.assetJson,
      atlasJson: packageManifest.files.atlasJson,
      pages: packageManifest.files.pages,
      mainPng: packageManifest.files.mainPng,
      mainWebp: packageManifest.files.mainWebp,
      readme: packageManifest.files.readme,
      examples: [packageManifest.files.example],
      helpers: [packageManifest.files.helper],
      engines: [],
    });
    expect(distribution.pages).toEqual([
      { path: 'atlas/pages/page-000.svg', width: 64, height: 64, rotated: false },
      { path: 'atlas/pages/page-001.svg', width: 32, height: 32, rotated: false },
    ]);
    expect(distribution.frames.map((frame) => frame.name)).toEqual(['fixture', 'second']);
    expect(distribution.frames[0]).toMatchObject({
      page: 0,
      rect: { x: 0, y: 0, width: 32, height: 32 },
      sourceSize: { width: 32, height: 32 },
      contentRect: { x: 4, y: 4, width: 24, height: 24 },
      contentOffset: { x: 4, y: 4 },
      rotated: false,
    });
    expect(distribution.frames[1]).toMatchObject({
      page: 1,
      rect: { x: 0, y: 0, width: 16, height: 16 },
      sourceSize: { width: 16, height: 16 },
      contentRect: { x: 2, y: 2, width: 12, height: 12 },
      contentOffset: { x: 2, y: 2 },
      rotated: false,
    });
    expect(distribution.animations).toEqual([
      { name: 'loop', frames: ['fixture', 'second'], fps: 4, loop: true },
    ]);

    expect(atlas).toMatchObject({
      format: 'chameleon-atlas',
      version: '0.1.0',
      texture: '../textures/main.png',
      cellSize: { width: 32, height: 32 },
    });
    expect(atlas.frames).toEqual([
      { name: 'fixture', x: 0, y: 0, width: 32, height: 32 },
      { name: 'second', x: 32, y: 0, width: 16, height: 16 },
    ]);
    expect(resolve(fixtureRoot, 'atlas', atlas.texture)).toBe(
      resolve(fixtureRoot, packageManifest.files.mainPng),
    );
    expect(atlas.animations).toEqual(distribution.animations);

    expect(target).toMatchObject({
      format: 'chameleon-generic-web-sidecar',
      version: '0.1.0',
      profile: 'generic-web-v1',
      coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down', unit: 'px' },
      canvasSize: asset.canvasSize,
      origin: asset.origin,
    });

    const expectedAnchors = assetAnchorCoordinates(asset);
    expect(distributionAnchorCoordinates(distribution.anchors)).toEqual(expectedAnchors);
    expect(atlasAnchorCoordinates(atlas.anchors)).toEqual(expectedAnchors);
    expect(sidecarAnchorCoordinates(target.anchors)).toEqual(expectedAnchors);
    expect(distribution.origin).toEqual(asset.origin);
    expect(atlas.origin).toEqual(asset.origin);
    expect(target.origin).toEqual(asset.origin);

    const expectedColliders = asset.colliders.map(colliderGeometry);
    expect(distribution.colliders.map(colliderGeometry)).toEqual(expectedColliders);
    expect(atlas.colliders.map(colliderGeometry)).toEqual(expectedColliders);
    expect(target.colliders.map(colliderGeometry)).toEqual(expectedColliders);

    expect(distribution.animations.map((animation) => animation.frames)).toEqual(
      atlas.animations.map((animation) => animation.frames),
    );
    expect(distribution.frames.map((frame) => frame.name)).toEqual(
      atlas.frames.map((frame) => frame.name),
    );
    expect(target.animations).toEqual([{ name: 'loop', frameNames: ['fixture', 'second'] }]);

    expect(verification).toMatchObject({
      format: 'chameleon-verification-record',
      version: '0.1.0',
      profile: 'generic-web-v1',
      status: 'candidate',
    });
    expect(verification.expected).toEqual(
      expect.arrayContaining(['http-manifest', 'package-closure', 'canvas-rendering']),
    );
    expect(verification.limitations).toEqual(
      expect.arrayContaining([
        'Physical Safari and engine-specific runtime compatibility are not verified.',
      ]),
    );
  });
});
