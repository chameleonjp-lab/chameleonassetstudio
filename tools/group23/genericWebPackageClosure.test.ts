import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type PackageReference = string | string[] | null;

interface GenericPackageManifest {
  format: string;
  version: string;
  profile: string;
  status: string;
  source: { assetJson: string; canonical: boolean };
  files: Record<string, PackageReference>;
}

interface DistributionManifest {
  format: string;
  version: string;
  profile: string;
  scale: number;
  pages: Array<{ path: string }>;
  frames: Array<{ name: string; page: number; contentOffset: { x: number; y: number } }>;
  animations: Array<{ name: string; frameIds: string[]; events: unknown[] }>;
  origin: { x: number; y: number };
}

interface VerificationRecord {
  profile: string;
  status: string;
  expected: string[];
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = resolve(repositoryRoot, 'public/generic-web-fixture');

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(fixtureRoot, relativePath), 'utf8')) as T;
}

function packageReferences(manifest: GenericPackageManifest): string[] {
  return Object.values(manifest.files).flatMap((value) =>
    value === null ? [] : Array.isArray(value) ? value : [value],
  );
}

describe('Generic Web package closure', () => {
  it('keeps every non-null package reference present and parseable', () => {
    const packageManifest = readJson<GenericPackageManifest>('package-manifest.json');
    expect(packageManifest).toMatchObject({
      format: 'chameleon-package',
      version: '0.1.0',
      profile: 'generic-web-v1',
      status: 'candidate',
      source: { assetJson: 'asset.json', canonical: true },
    });

    for (const relativePath of packageReferences(packageManifest)) {
      expect(relativePath, 'package paths must be relative and safe').not.toMatch(
        /^(?:\/|[A-Za-z]:|https?:)/,
      );
      expect(relativePath.split('/')).not.toContain('..');
      expect(relativePath).not.toContain('\\');
      expect(existsSync(resolve(fixtureRoot, relativePath)), relativePath).toBe(true);
    }

    const distribution = readJson<DistributionManifest>(
      String(packageManifest.files.distributionManifest),
    );
    const asset = readJson<Record<string, unknown>>(String(packageManifest.files.assetJson));
    const atlas = readJson<Record<string, unknown>>(String(packageManifest.files.atlasJson));
    const target = readJson<Record<string, unknown>>(String(packageManifest.files.target));
    const verification = readJson<VerificationRecord>(String(packageManifest.files.verification));

    expect(distribution.profile).toBe('fixed-grid');
    expect(distribution.pages.map((page) => page.path)).toEqual(packageManifest.files.pages);
    expect(distribution.frames.map((frame) => frame.name)).toEqual(['fixture', 'second']);
    expect(distribution.animations[0]).toEqual({
      name: 'loop',
      frameIds: ['fixture', 'second'],
      events: [],
    });
    expect(distribution.origin).toEqual({ x: 16, y: 32 });
    expect(asset).toMatchObject({ format: 'chameleon-asset', version: '0.2.0' });
    expect(atlas).toMatchObject({ format: 'chameleon-atlas', version: '0.1.0' });
    expect(target).toMatchObject({
      format: 'chameleon-generic-web-sidecar',
      profile: 'generic-web-v1',
      coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down', unit: 'px' },
    });
    expect(verification).toMatchObject({
      profile: 'generic-web-v1',
      status: 'candidate',
    });
    expect(verification.expected).toEqual(
      expect.arrayContaining(['http-manifest', 'package-closure', 'canvas-rendering']),
    );
  });
});
