import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateAssetForPersistence } from '../model';

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };
type Circle = { x: number; y: number; radius: number };

type FixtureDefinition = {
  root: string;
  engine: string;
  version: string;
  cdn: string;
};

type PackageManifest = {
  engineVersion: string;
  profile: string;
  status: string;
  files: {
    target: string;
    example: string;
    helper: string;
    importNotes: string;
    verification: string;
    readme: string;
  };
};

type DistributionManifest = {
  profile: string;
  scale: number;
  pages: Array<{ path: string }>;
  frames: Array<{
    page: number;
    rect: Rect;
    contentRect: Rect;
    contentOffset: Point;
  }>;
  animations: Array<{
    fps: number;
    loop: boolean;
    frames: string[];
    frameIds?: string[];
  }>;
  origin: Point;
  anchors: Array<{ x: number; y: number }>;
  colliders: Array<{ rect?: Rect; circle?: Circle }>;
  integrity: {
    algorithm: string;
    manifestHash: string;
  };
  files: {
    mainPng: string;
    examples: string[];
    helpers: string[];
    engines: string[];
  };
};

type Target = {
  origin: Point;
  anchors: Array<{ position: Point }>;
};

type Verification = {
  engineVersion: string;
  cdnUrl: string;
  manifestIntegrityHash: string;
};

const fixtures: FixtureDefinition[] = [
  {
    root: 'public/engine-fixtures/pixijs-v8',
    engine: 'pixijs-v8',
    version: '8.12.0',
    cdn: 'https://cdn.jsdelivr.net/npm/pixi.js@8.12.0/dist/pixi.min.js',
  },
  {
    root: 'public/engine-fixtures/phaser-v4',
    engine: 'phaser-v4',
    version: '4.2.0',
    cdn: 'https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js',
  },
];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

describe('Group 17 engine fixture contract', () => {
  for (const fixture of fixtures) {
    it(fixture.engine + ' fixture is a complete scaled distribution package', async () => {
      const root = path.resolve(process.cwd(), fixture.root);
      const pkg = await readJson<PackageManifest>(path.join(root, 'package-manifest.json'));
      const manifest = await readJson<DistributionManifest>(path.join(root, 'manifest.json'));
      const target = await readJson<Target>(path.join(root, pkg.files.target));
      const verification = await readJson<Verification>(
        path.join(root, 'verification/record.json'),
      );
      const asset = await readJson<unknown>(path.join(root, 'asset.json'));
      const unsigned = { ...manifest };
      delete (unsigned as { integrity?: DistributionManifest['integrity'] }).integrity;

      const assetResult = validateAssetForPersistence(
        asset as Parameters<typeof validateAssetForPersistence>[0],
      );
      expect(assetResult.valid).toBe(true);
      expect(pkg.engineVersion).toBe(fixture.version);
      expect(pkg.profile).toBe(fixture.engine);
      expect(pkg.status).toBe('verified');
      expect(manifest.profile).toBe('packed');
      expect(manifest.scale).toBe(2);
      expect(manifest.pages).toHaveLength(2);
      expect(manifest.integrity).toMatchObject({ algorithm: 'SHA-256' });
      expect(manifest.integrity.manifestHash).toBe(sha256(JSON.stringify(canonicalize(unsigned))));
      expect(manifest.animations[0]).toMatchObject({
        fps: 4,
        loop: true,
        frames: ['fixture-a', 'fixture-b'],
      });
      expect(manifest.animations[0].frameIds).toBeUndefined();
      expect(manifest.frames[0].rect.x).not.toBe(manifest.frames[0].contentRect.x);
      expect(manifest.frames[0].contentOffset).toEqual(manifest.frames[0].contentRect);
      expect(manifest.frames[1].page).toBe(1);
      expect(manifest.origin).toEqual({ x: target.origin.x * 2, y: target.origin.y * 2 });
      expect(manifest.anchors[0]).toMatchObject({
        x: target.anchors[0].position.x * 2,
        y: target.anchors[0].position.y * 2,
      });
      expect(manifest.colliders[0].rect).toEqual({
        x: 16,
        y: 20,
        width: 80,
        height: 88,
      });
      expect(manifest.colliders[1].circle).toEqual({ x: 64, y: 64, radius: 44 });
      expect(verification.engineVersion).toBe(fixture.version);
      expect(verification.cdnUrl).toBe(fixture.cdn);
      expect(verification.manifestIntegrityHash).toBe('sha256:' + manifest.integrity.manifestHash);

      const referenced = new Set<string>([
        'package-manifest.json',
        'manifest.json',
        'asset.json',
        'atlas/atlas.json',
        ...manifest.pages.map((entry) => entry.path),
        manifest.files.mainPng,
        ...manifest.files.examples,
        ...manifest.files.helpers,
        ...manifest.files.engines,
        pkg.files.target,
        pkg.files.example,
        pkg.files.helper,
        pkg.files.importNotes,
        pkg.files.verification,
        pkg.files.readme,
      ]);

      for (const entry of referenced) {
        const file = path.join(root, entry);
        await access(file);
        expect((await readFile(file)).byteLength).toBeGreaterThan(0);
      }
    });
  }
});
