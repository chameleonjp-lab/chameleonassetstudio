import { describe, expect, it } from 'vitest';
import { nativeBox } from '../fixtures/nativeBox';
import { assetIoFixture } from '../fixtures/assetIo';
import { createProject, identityTransform, type Project3D } from '../model/project';
import { estimateCanonicalBytes } from '../profile/resourceEstimates';
import {
  analyzeNativeExport,
  isNativeExportReviewStale,
  NATIVE_EXPORT_REVIEW_LIMITS,
  type NativeExportReview,
} from './review';

const item = (report: NativeExportReview, code: string) =>
  report.items.find((entry) => entry.code === code);

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

function texture(project: Project3D, mimeType = 'image/webp') {
  const hash = 'a'.repeat(64);
  project.blobIds = [hash];
  project.sources = [
    { id: 'image', blobId: hash, mimeType, rights: { declared: '', embedded: '' } },
  ];
  project.materials[0].textureBlobId = hash;
  for (const face of project.meshes[0].faces) face.uv = face.vertexIds.map(() => [0, 0]);
}

describe('native export review', () => {
  it('is deterministic, detached and bound to the exact project revision without reading bytes', () => {
    const project = assetIoFixture();
    project.revision = 17;
    const before = structuredClone(project);
    freeze(project);
    const report = analyzeNativeExport(project);
    expect(report).toEqual(analyzeNativeExport(project));
    expect(project).toEqual(before);
    expect(report.projectId).toBe(project.id);
    expect(report.revision).toBe(17);
    expect(report.hasBlockers).toBe(false);
    expect(report.estimatedMetadataBytes).toBe(estimateCanonicalBytes(project));
    expect(isNativeExportReviewStale(report, project)).toBe(false);
    expect(isNativeExportReviewStale(report, { id: project.id, revision: 18 })).toBe(true);
    expect(isNativeExportReviewStale(report, { id: 'other', revision: 17 })).toBe(true);
    report.items[0].target.id = 'changed-report';
    expect(project).toEqual(before);
  });

  it('distinguishes all five artifacts and never labels metadata analysis as source verification', () => {
    const report = analyzeNativeExport(nativeBox());
    expect(report.outputs.map((output) => output.id)).toEqual([
      'original-glb',
      'edited-glb',
      'game-sidecar',
      'asset-zip',
      'native-backup',
    ]);
    expect(report.outputs[0].description).toContain('現在の編集は反映しません');
    expect(report.outputs[0].label).toContain('バックアップ内');
    expect(report.outputs[0].description).toContain('原本GLBだけを保存する操作はありません');
    expect(report.outputs[2].description).toContain('原本bytesや空trackは含めず');
    expect(report.outputs[3].description).toContain('原本一式や編集正本は同梱しない');
    expect(report.outputs[4].description).toContain('原本が欠ける場合');
    expect(report.limitations.join(' ')).toContain('原本hash・未知extension・画像実体');
    expect(report.limitations.join(' ')).toContain('unverified');
    expect(report.limitations.join(' ')).toContain('権利・配布許諾');
    expect(report.limitations.join(' ')).toContain('出力の成功');
  });

  it('explains hidden and locked nodes, wrapper roots, game metadata and legacy alpha', () => {
    const project = assetIoFixture();
    project.nodes[0].visible = false;
    project.nodes[0].locked = true;
    const report = analyzeNativeExport(project);
    expect(item(report, 'hidden-node-retained')).toMatchObject({
      severity: 'warning',
      target: { kind: 'node', id: project.nodes[0].id },
      count: 1,
    });
    expect(item(report, 'hidden-node-retained')!.message).toContain('標準consumerでは表示');
    expect(item(report, 'lock-metadata-only')!.preservation).toContain('casLocked');
    expect(item(report, 'identity-root')!.count).toBe(2);
    expect(item(report, 'identity-root')!.message).toContain('恒等変換');
    expect(item(report, 'game-sidecar-only')!.count).toBe(3);
    expect(item(report, 'game-sidecar-only')!.preservation).toContain('一度だけ');
    expect(item(report, 'legacy-alpha-resolved')!.message).toContain('PNGならBLEND');
    project.materials[0].alphaMode = 'OPAQUE';
    expect(item(analyzeNativeExport(project), 'legacy-alpha-resolved')).toBeUndefined();
    project.materials[0].alphaMode = 'LEGACY_AUTO';
    expect(item(analyzeNativeExport(project), 'legacy-alpha-resolved')).toBeDefined();
  });

  it('separates sidecar-only empty clips from backup-only empty track definitions', () => {
    const project = assetIoFixture();
    project.clips[1].tracks = [
      { nodeId: 'tip', property: 'scale', interpolation: 'STEP', keys: [] },
    ];
    const report = analyzeNativeExport(project);
    expect(item(report, 'empty-clip-sidecar-only')).toMatchObject({
      target: { kind: 'clip', id: 'empty' },
      count: 1,
    });
    expect(item(report, 'empty-clip-sidecar-only')!.preservation).toContain(
      'game.jsonには保持せず',
    );
    expect(item(report, 'empty-track-backup-only')).toMatchObject({
      target: { kind: 'track', id: 'tip/scale', parentId: 'empty' },
      count: 1,
    });
    expect(item(report, 'empty-track-backup-only')!.message).toContain(
      'GLBにもgame.jsonにも出力されません',
    );
    expect(report.items.filter((entry) => entry.code === 'clip-sidecar-settings')).toHaveLength(2);
    expect(item(report, 'endpoint-hold-inserted')).toMatchObject({
      target: { kind: 'track', id: 'tip/translation', parentId: 'move' },
      count: 2,
    });
    expect(report.hasBlockers).toBe(false);
  });

  it('reports non-unit corner normals and unused native vertices without normalizing the input', () => {
    const project = nativeBox();
    project.meshes[0].faces[0].normals = [
      [2, 0, 0],
      [0, 1, 0],
      [0, 0, 3],
    ];
    project.meshes[0].vertices.push({ id: 'unused', position: [8, 0, 0] });
    const before = structuredClone(project);
    const report = analyzeNativeExport(project);
    expect(item(report, 'normal-normalized')).toMatchObject({
      severity: 'warning',
      count: 2,
      target: { kind: 'mesh', id: 'box-mesh' },
    });
    expect(item(report, 'unused-vertices-omitted')!.count).toBe(1);
    expect(item(report, 'native-editing-data')!.message).toContain('面ID');
    expect(item(report, 'float32-derived-values')!.preservation).toContain('正本の数値');
    expect(project).toEqual(before);
  });

  it.each(['image/webp', 'image/png', 'application/octet-stream'])(
    'treats %s as unverified metadata and describes actual WebP conversion restrictions',
    (mimeType) => {
      const project = nativeBox();
      texture(project, mimeType);
      const report = analyzeNativeExport(project);
      expect(report.hasBlockers).toBe(false);
      expect(item(report, 'texture-conversion-unverified')!.message).toContain('静止WebPはPNG');
      expect(item(report, 'texture-conversion-unverified')!.message).toContain('EXIF・ICCP・XMP');
      expect(item(report, 'source-only-information-unverified')!.message).toContain('可能性');
      expect(item(report, 'source-only-information-unverified')!.message).toContain('未検査');
      expect(item(report, 'legacy-alpha-resolved')!.preservation).toContain(
        '最終方式は確定しません',
      );
    },
  );

  it('also warns about retained non-image originals without inventing extension detection', () => {
    const project = nativeBox();
    project.blobIds = ['b'.repeat(64)];
    project.sources = [
      {
        id: 'glb-original',
        blobId: project.blobIds[0],
        mimeType: 'model/gltf-binary',
        rights: { declared: 'test only', embedded: '' },
      },
    ];
    const report = analyzeNativeExport(project);
    expect(item(report, 'source-only-information-unverified')!.target.id).toBe('glb-original');
    expect(item(report, 'texture-conversion-unverified')).toBeUndefined();
    expect(report.hasBlockers).toBe(false);
  });

  it('blocks empty scenes, invalid native references and unsupported additional fields', () => {
    expect(item(analyzeNativeExport(createProject('empty')), 'empty-scene')!.severity).toBe(
      'error',
    );
    const project = nativeBox();
    project.nodes[0].meshId = 'missing';
    expect(item(analyzeNativeExport(project), 'invalid-native-project')).toBeDefined();
    project.nodes[0].meshId = 'box-mesh';
    Object.assign(project, { unsupported: { keep: true } });
    const before = structuredClone(project);
    const report = analyzeNativeExport(project);
    expect(report.hasBlockers).toBe(true);
    expect(item(report, 'invalid-native-project')!.message).toContain('削って出力');
    expect(project).toEqual(before);
  });

  it('aggregates known unsupported geometry by mesh with exact affected counts', () => {
    const project = nativeBox();
    texture(project);
    const mesh = project.meshes[0];
    mesh.faces[0].vertexIds.push('v3');
    mesh.faces[0].uv!.push([0, 0]);
    mesh.faces[1].normals = [
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
    ];
    delete mesh.faces[2].uv;
    mesh.vertices.find((vertex) => vertex.id === 'v7')!.position = [-0.5, -0.5, 0.5];
    const report = analyzeNativeExport(project);
    expect(report.hasBlockers).toBe(true);
    expect(item(report, 'non-triangle-face')!.count).toBe(1);
    expect(item(report, 'zero-normal')!.count).toBe(2);
    expect(item(report, 'textured-face-missing-uv')!.count).toBe(1);
    expect(item(report, 'degenerate-triangle')!.count).toBeGreaterThan(0);
    mesh.faces = [];
    expect(item(analyzeNativeExport(project), 'empty-mesh')).toBeDefined();
  });

  it('blocks Float32 overflow and singular rest transforms without invoking pose or encoder', () => {
    const project = nativeBox();
    project.meshes[0].vertices[0].position[0] = 1e40;
    project.nodes[0].transform.scale[0] = 0;
    const report = analyzeNativeExport(project);
    expect(report.hasBlockers).toBe(true);
    expect(item(report, 'geometry-float32-overflow')).toBeDefined();
    expect(item(report, 'unsupported-rest-transform')).toBeDefined();
  });

  it('blocks ambiguous skins, uninstanced skins, and unsupported bind matrices', () => {
    const project = assetIoFixture();
    project.skins.push({ ...structuredClone(project.skins[0]), id: 'second' });
    expect(item(analyzeNativeExport(project), 'multiple-skins-per-mesh')).toBeDefined();
    project.skins.pop();
    delete project.nodes[0].meshId;
    expect(item(analyzeNativeExport(project), 'uninstanced-skin')).toBeDefined();
    project.nodes[0].meshId = project.meshes[0].id;
    project.skins[0].joints[0].inverseBind.fill(0);
    expect(item(analyzeNativeExport(project), 'unsupported-skin-profile')).toBeDefined();
  });

  it('checks Float32 key collisions including inserted endpoint holds and time error', () => {
    const project = assetIoFixture();
    const track = project.clips[0].tracks[0];
    track.keys = [
      { time: 1, value: [0, 1, 0] },
      { time: 1 + 1e-8, value: [0, 2, 0] },
    ];
    expect(item(analyzeNativeExport(project), 'key-time-float32-collapse')!.count).toBe(1);
    track.keys = [{ time: 2 - 1e-8, value: [0, 1, 0] }];
    expect(item(analyzeNativeExport(project), 'key-time-float32-collapse')!.count).toBe(1);
    project.clips[0].duration = 100.000003;
    track.keys = [{ time: 0, value: [1e40, 0, 0] }];
    const report = analyzeNativeExport(project);
    expect(item(report, 'key-time-float32-error')).toBeDefined();
    expect(item(report, 'key-value-float32-overflow')).toBeDefined();
  });

  it('caps report size and fails closed when a later blocker cannot be shown', () => {
    const project = nativeBox();
    project.nodes = Array.from({ length: 300 }, (_, index) => ({
      id: `node-${index}`,
      name: '',
      parentId: null,
      transform: identityTransform(),
      visible: false,
      locked: true,
    }));
    project.meshes[0].faces = [];
    const report = analyzeNativeExport(project);
    expect(report.items).toHaveLength(NATIVE_EXPORT_REVIEW_LIMITS.items);
    expect(report.omittedItems).toBeGreaterThan(0);
    expect(report.hasBlockers).toBe(true);
    expect(report.items.at(-1)).toMatchObject({
      code: 'review-item-limit',
      severity: 'error',
      count: report.omittedItems,
    });
  });

  it('bounds metadata structure, cycles and hierarchy before expensive native validation', () => {
    const project = nativeBox();
    project.name = 'x'.repeat(NATIVE_EXPORT_REVIEW_LIMITS.metadataBytes / 2);
    let report = analyzeNativeExport(project);
    expect(report.hasBlockers).toBe(true);
    expect(item(report, 'review-metadata-limit')).toBeDefined();
    expect(report.estimatedMetadataBytes).toBeGreaterThan(
      NATIVE_EXPORT_REVIEW_LIMITS.metadataBytes,
    );
    const cyclic = nativeBox();
    Object.assign(cyclic, { cycle: cyclic });
    report = analyzeNativeExport(cyclic);
    expect(item(report, 'review-metadata-limit')).toBeDefined();
    const deep = nativeBox();
    deep.nodes = Array.from({ length: 257 }, (_, index) => ({
      id: `node-${index}`,
      name: '',
      parentId: index ? `node-${index - 1}` : null,
      transform: identityTransform(),
    }));
    expect(item(analyzeNativeExport(deep), 'review-metadata-limit')).toBeDefined();
  });

  it('counts a synthetic root against the existing GLB node admission limit', () => {
    const project = createProject('many-roots');
    project.nodes = Array.from({ length: 4096 }, (_, index) => ({
      id: `node-${index}`,
      name: '',
      parentId: null,
      transform: identityTransform(),
    }));
    const report = analyzeNativeExport(project);
    expect(report.hasBlockers).toBe(true);
    expect(item(report, 'export-profile-limit')).toMatchObject({ count: 4097 });
  });

  it('counts the synthetic root against depth and rejects unnormalized raw normal overflow', () => {
    const project = createProject('deep-roots');
    project.nodes = Array.from({ length: 256 }, (_, index) => ({
      id: `node-${index}`,
      name: '',
      parentId: index ? `node-${index - 1}` : null,
      transform: identityTransform(),
    }));
    project.nodes.push({
      id: 'other-root',
      name: '',
      parentId: null,
      transform: identityTransform(),
    });
    expect(item(analyzeNativeExport(project), 'export-profile-limit')).toMatchObject({
      count: 257,
    });
    const box = nativeBox();
    box.meshes[0].faces[0].normals = [
      [1e40, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    expect(item(analyzeNativeExport(box), 'geometry-float32-overflow')).toBeDefined();
  });
});
