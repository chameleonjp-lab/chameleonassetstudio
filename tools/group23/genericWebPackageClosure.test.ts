import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  roundDistributionPixel,
  scaleDistributionPoint,
  scaleDistributionRect,
  type AtlasJson,
  type DistributionManifest,
} from '../../src/core/export/atlas';
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

function scaledCollider(
  collider: Asset['colliders'][number],
  scale: 1 | 2 | 3,
): Asset['colliders'][number] {
  return collider.shape === 'rect'
    ? { ...collider, rect: scaleDistributionRect(collider.rect, scale) }
    : {
        ...collider,
        circle: {
          ...collider.circle,
          ...scaleDistributionPoint(collider.circle, scale),
          radius: Math.max(0, roundDistributionPixel(collider.circle.radius, scale)),
        },
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
      { path: 'atlas/pages/page-000.svg', width: 128, height: 128, rotated: false },
      { path: 'atlas/pages/page-001.svg', width: 64, height: 64, rotated: false },
    ]);
    expect(distribution.frames.map((frame) => frame.name)).toEqual(['fixture', 'second']);
    expect(distribution.frames[0]).toMatchObject({
      page: 0,
      rect: { x: 0, y: 0, width: 64, height: 64 },
      sourceSize: { width: 64, height: 64 },
      contentRect: { x: 8, y: 8, width: 48, height: 48 },
      contentOffset: { x: 8, y: 8 },
      rotated: false,
    });
    expect(distribution.frames[1]).toMatchObject({
      page: 1,
      rect: { x: 0, y: 0, width: 32, height: 32 },
      sourceSize: { width: 32, height: 32 },
      contentRect: { x: 4, y: 4, width: 24, height: 24 },
      contentOffset: { x: 4, y: 4 },
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

    expect(asset.textures.map((texture) => texture.path)).toEqual(packageManifest.files.pages);
    expect(asset.frames?.map((frame) => frame.layerStates[0]?.layerId)).toEqual([
      'generic-web-layer',
      'generic-web-layer-second',
    ]);

    expect(target).toMatchObject({
      format: 'chameleon-generic-web-sidecar',
      version: '0.1.0',
      profile: 'generic-web-v1',
      coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down', unit: 'px' },
      canvasSize: asset.canvasSize,
      origin: asset.origin,
    });

    const expectedAnchors = assetAnchorCoordinates(asset);
    const expectedScaledAnchors = expectedAnchors.map(({ name, role, x, y }) => ({
      name,
      role,
      ...scaleDistributionPoint({ x, y }, packageManifest.scale),
    }));
    expect(distributionAnchorCoordinates(distribution.anchors)).toEqual(expectedScaledAnchors);
    expect(atlasAnchorCoordinates(atlas.anchors)).toEqual(expectedAnchors);
    expect(sidecarAnchorCoordinates(target.anchors)).toEqual(expectedAnchors);
    expect(distribution.origin).toEqual(
      scaleDistributionPoint(asset.origin, packageManifest.scale),
    );
    expect(atlas.origin).toEqual(asset.origin);
    expect(target.origin).toEqual(asset.origin);

    const expectedColliders = asset.colliders.map(colliderGeometry);
    const expectedScaledColliders = asset.colliders.map((collider) =>
      colliderGeometry(scaledCollider(collider, packageManifest.scale)),
    );
    expect(distribution.colliders).toEqual(
      asset.colliders.map((collider) => scaledCollider(collider, packageManifest.scale)),
    );
    expect(atlas.colliders).toEqual(asset.colliders);
    expect(distribution.colliders.map(colliderGeometry)).toEqual(expectedScaledColliders);
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
      sourceCommit: 'unrecorded',
      fixtureHash: 'fixture:generic-web-v1',
      manifestHash: 'unrecorded',
      artifactRef: 'ci://group16/generic-web',
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
