import { expect, it } from 'vitest';
import { assetIoFixture, assetIoPng } from '../fixtures/assetIo';
import { nativeBox } from '../fixtures/nativeBox';
import { createProject, identityTransform } from '../model/project';
import { inspectStatistics } from './statistics';

it('distinguishes a known empty project from unmeasured file and GPU sizes', () => {
  const project = createProject('empty');
  const result = inspectStatistics(project, new Map());
  expect(result.vertices).toBe(0);
  expect(result.triangleFaces).toBe(0);
  expect(result.decodedPixels).toEqual({ status: 'known', value: 0 });
  expect(result.retainedBlobBytes).toEqual({ status: 'known', value: 0 });
  expect(result.bounds).toEqual({ status: 'known', value: null });
  expect(result.gpuMemoryBytes.status).toBe('unknown');
  expect(result.exportedGlbBytes.status).toBe('unknown');
  expect(result.projectJsonBytes).toBe(new TextEncoder().encode(JSON.stringify(project)).length);
});

it('counts mesh-local vertices once and instances separately without triangulating polygons', () => {
  const project = nativeBox();
  project.nodes.push({ ...structuredClone(project.nodes[0]), id: 'second' });
  project.meshes.push({
    id: 'unused',
    vertices: ['v0', 'v1', 'v2', 'v3'].map((id) => ({ id, position: [99, 99, 99] })),
    faces: [{ id: 'polygon', vertexIds: ['v0', 'v1', 'v2', 'v3'] }],
  });
  project.meshes[0].faces[0].materialId = undefined;
  const before = structuredClone(project);
  const result = inspectStatistics(project, new Map(), { exportedGlbBytes: 512 });
  expect(result.vertices).toBe(12); // Native vertices, not the exporter's 36 triangle corners.
  expect(result.triangleFaces).toBe(12);
  expect(result.nonTriangleFaces).toBe(1);
  expect(result.materialGroups).toBe(3);
  expect(result.meshInstances).toBe(2);
  expect(result.instanceTriangleFaces).toBe(24);
  expect(result.exportedGlbBytes).toEqual({ status: 'known', value: 512 });
  expect(result.bounds).toEqual({
    status: 'known',
    value: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5], size: [1, 1, 1] },
  });
  expect(project).toEqual(before);
});

it('measures exact saved world TRS including hidden instances but excludes uninstanced meshes', () => {
  const project = nativeBox();
  project.nodes[0].parentId = 'parent';
  project.nodes[0].transform.translation = [1, 0, 0];
  project.nodes.push({
    ...structuredClone(project.nodes[0]),
    id: 'hidden',
    visible: false,
    transform: { ...identityTransform(), translation: [-1, 0, 0] },
  });
  project.nodes.push({
    id: 'parent',
    name: 'Parent',
    parentId: null,
    transform: {
      translation: [10, 0, 0],
      rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
      scale: [2, 3, 4],
    },
  });
  const result = inspectStatistics(project, new Map());
  expect(result.bounds.status).toBe('known');
  if (result.bounds.status !== 'known' || !result.bounds.value) throw new Error('Missing bounds');
  result.bounds.value.min.forEach((value, axis) =>
    expect(value).toBeCloseTo([8.5, -3, -2][axis], 12),
  );
  result.bounds.value.max.forEach((value, axis) =>
    expect(value).toBeCloseTo([11.5, 3, 2][axis], 12),
  );
});

it('reports corrupt, excessive, or nonfinite world bounds as unknown instead of empty', () => {
  for (const mutate of [
    (project: ReturnType<typeof nativeBox>) => {
      project.nodes[0].parentId = 'missing';
    },
    (project: ReturnType<typeof nativeBox>) => {
      project.nodes[0].parentId = project.nodes[0].id;
    },
    (project: ReturnType<typeof nativeBox>) => {
      project.nodes[0].meshId = 'missing';
    },
    (project: ReturnType<typeof nativeBox>) => {
      project.nodes[0].transform.scale[0] = Infinity;
    },
    (project: ReturnType<typeof nativeBox>) => {
      project.nodes[0].parentId = 'p0';
      for (let i = 0; i < 256; i++)
        project.nodes.push({
          id: 'p' + i,
          name: 'Parent',
          parentId: i === 255 ? null : 'p' + (i + 1),
          transform: identityTransform(),
        });
    },
  ]) {
    const project = nativeBox();
    mutate(project);
    expect(inspectStatistics(project, new Map()).bounds.status).toBe('unknown');
  }
});

it('deduplicates texture hashes and retained bytes while preserving missing-data subtotals', async () => {
  const project = nativeBox();
  const png = await assetIoPng();
  project.materials[0].textureBlobId = 'image';
  project.materials.push({ ...project.materials[0], id: 'shared' });
  project.blobIds = ['image', 'image', 'missing'];
  const blobs = new Map([
    ['image', png],
    ['unreferenced', new Uint8Array(30)],
  ]);
  let result = inspectStatistics(project, blobs);
  expect(result.textures).toBe(1);
  expect(result.decodedPixels).toEqual({ status: 'known', value: 4 });
  expect(result.knownRetainedBlobBytes).toBe(png.length);
  expect(result.retainedBlobBytes.status).toBe('unknown');
  expect(result.missingBlobIds).toEqual(['missing']);
  expect(result.textureDetails[0].materialIds).toEqual(['green', 'shared']);
  project.materials.push({ ...project.materials[0], id: 'bad', textureBlobId: 'bad-image' });
  project.materials.push({ ...project.materials[0], id: 'absent', textureBlobId: 'absent-image' });
  blobs.set('bad-image', new Uint8Array([1, 2, 3]));
  result = inspectStatistics(project, blobs);
  expect(result.decodedPixels.status).toBe('unknown');
  expect(result.knownDecodedPixels).toBe(4);
  expect(result.unknownTextureCount).toBe(2);
  expect(result.textureDetails[1].encodedBytes).toEqual({ status: 'known', value: 3 });
  expect(result.textureDetails[2].encodedBytes.status).toBe('unknown');
});

it('counts shared joint IDs and empty clips without implying runtime playback', () => {
  const project = assetIoFixture();
  project.skins.push({ ...structuredClone(project.skins[0]), id: 'second-skin' });
  const result = inspectStatistics(project, new Map());
  expect(result.joints).toBe(2);
  expect(result.jointBindings).toBe(4);
  expect(result.clips).toBe(2);
  expect(result.nonemptyClips).toBe(1);
  expect(result.boundsBasis).toBe('world-space-stored-geometry');
  expect(
    inspectStatistics(project, new Map(), { exportedGlbBytes: -1 }).exportedGlbBytes.status,
  ).toBe('unknown');
});

it('applies hierarchy depth limits to cached ancestors independently of node ordering', () => {
  const project = nativeBox();
  project.nodes = Array.from({ length: 257 }, (_, index) => ({
    id: 'node-' + index,
    name: 'Node',
    meshId: project.meshes[0].id,
    parentId: index ? 'node-' + (index - 1) : null,
    transform: identityTransform(),
  }));
  expect(inspectStatistics(project, new Map()).bounds.status).toBe('unknown');
  project.nodes.reverse();
  expect(inspectStatistics(project, new Map()).bounds.status).toBe('unknown');
});
