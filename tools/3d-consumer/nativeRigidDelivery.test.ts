import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { IndependentConsumer } from './main';
import { nativeBox } from '../../src/core3d/fixtures/nativeBox';
import { identityTransform } from '../../src/core3d/model/project';
import { addRigJoint, assignRigidPartToJoint } from '../../src/core3d/rig/authoring';
import { captureAssetSnapshot } from '../../src/core3d/export/snapshot';
import { buildAssetPackage } from '../../src/core3d/export/mapping';
import { exportGlb } from '../../src/adapters3d/gltf/export';
import { preflightGlb } from '../../src/core3d/import/preflight';
const validator = createRequire(import.meta.url)('gltf-validator') as {
  validateBytes(
    bytes: Uint8Array,
    options: Record<string, unknown>,
  ): Promise<{ issues: { numErrors: number; truncated: boolean } }>;
};

/** Native authoring/encoder input; independently loaded by actual Babylon CPU runtime, no browser/GPU claim. */
it('delivers rigid-parent hierarchy and bone animation through actual valid GLB without creating skin weights', async () => {
  const project = nativeBox('rigid-delivery');
  project.nodes[0].transform.translation = [2, 0, 0];
  const partId = project.nodes[0].id;
  addRigJoint(project, 'guide', 'Rigid guide', null, {
    ...identityTransform(),
    translation: [0, 1, 0],
  });
  project.clips = [
    {
      id: 'rise',
      name: 'Rise',
      duration: 1,
      loop: false,
      tracks: [
        {
          nodeId: 'guide',
          property: 'translation',
          interpolation: 'LINEAR',
          keys: [
            { time: 0, value: [0, 1, 0] },
            { time: 1, value: [0, 3, 0] },
          ],
        },
      ],
    },
  ];
  assignRigidPartToJoint(project, partId, 'guide', 'keep-world');
  expect(project.nodes[0].transform.translation).toEqual([2, -1, 0]);
  const before = structuredClone(project);
  const encoded = await exportGlb(captureAssetSnapshot(project, () => new Uint8Array()));
  const checked = await validator.validateBytes(encoded.bytes, { maxIssues: 1000 });
  expect(checked.issues).toMatchObject({ numErrors: 0, truncated: false });
  const parsed = preflightGlb(encoded.bytes),
    json = parsed.json;
  expect(json.skins ?? []).toEqual([]);
  const meshNode = json.nodes!.findIndex((node) => node.mesh !== undefined);
  const guideNode = json.nodes!.findIndex((node) => node.name === 'Rigid guide');
  expect(json.nodes![guideNode].children).toContain(meshNode);
  expect(json.nodes![meshNode].translation).toEqual([2, -1, 0]);
  expect(json.nodes![meshNode].skin).toBeUndefined();
  expect(json.meshes![0].primitives[0].attributes.JOINTS_0).toBeUndefined();
  expect(json.meshes![0].primitives[0].attributes.WEIGHTS_0).toBeUndefined();
  const pkg = await buildAssetPackage(project, encoded.bytes, encoded.warnings);
  const consumer = new IndependentConsumer(
    () =>
      new NullEngine({
        renderWidth: 64,
        renderHeight: 64,
        textureSize: 64,
        deterministicLockstep: false,
        lockstepMaxSteps: 4,
      }),
  );
  try {
    const rest = await consumer.load(pkg.glb, pkg.sidecar);
    expect(rest.nodes.find((node) => node.id === partId)!.position).toEqual([2, 0, 0]);
    for (const [time, expectedY] of [
      [0, 0],
      [0.5, 1],
      [1, 2],
    ]) {
      const sample = consumer.sample('rise', time);
      const position = sample.nodes.find((node) => node.id === partId)!.position;
      expect(position[0]).toBeCloseTo(2, 6);
      expect(position[1]).toBeCloseTo(expectedY, 6);
      expect(position[2]).toBeCloseTo(0, 6);
      expect(sample.oracle.positionPass).toBe(true);
      // First expanded box corner is [-0.5,-0.5,-0.5], independently fixed here.
      expect(sample.meshes[0].positions[0]).toBeCloseTo(1.5, 6);
      expect(sample.meshes[0].positions[1]).toBeCloseTo(expectedY - 0.5, 6);
      expect(sample.meshes[0].positions[2]).toBeCloseTo(-0.5, 6);
    }
    expect(project).toEqual(before);
  } finally {
    consumer.dispose();
  }
});
