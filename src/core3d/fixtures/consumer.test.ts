import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { CONSUMER_FIXTURE_IDS, consumerFixture } from './consumer';
import { captureAssetSnapshot } from '../export/snapshot';
import { exportGlb } from '../../adapters3d/gltf/export';
import { buildAssetPackage } from '../export/mapping';
const validator = createRequire(import.meta.url)('gltf-validator') as {
  validateBytes: (
    b: Uint8Array,
    o: Record<string, unknown>,
  ) => Promise<{ issues: { numErrors: number; truncated: boolean; messages: unknown[] } }>;
};
for (const id of CONSUMER_FIXTURE_IDS)
  it(`${id} produces bounded, validator-clean original consumer bytes`, async () => {
    const { project, blobs } = await consumerFixture(id),
      before = structuredClone(project);
    const encoded = await exportGlb(captureAssetSnapshot(project, (key) => blobs.get(key)!));
    const report = await validator.validateBytes(encoded.bytes, { maxIssues: 1000 });
    expect(report.issues.numErrors, JSON.stringify(report.issues)).toBe(0);
    expect(report.issues.truncated).toBe(false);
    const pkg = await buildAssetPackage(project, encoded.bytes, encoded.warnings, blobs);
    expect(pkg.sidecar.length).toBeGreaterThan(0);
    expect(project).toEqual(before);
  });
