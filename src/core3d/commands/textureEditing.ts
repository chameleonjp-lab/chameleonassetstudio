import { validateProject, type Project3D, type Source3D } from '../model/project';

export interface DerivedBaseColorSource {
  id: string;
  blobId: string;
  operation: string;
  version: string;
  settings: string;
}

function material(project: Project3D, materialId: string) {
  const target = project.materials.find((item) => item.id === materialId);
  if (!target) throw new Error('画像を適用する材質を選択してください。');
  return target;
}

function assertMappedFaces(project: Project3D, materialId: string) {
  if (
    project.meshes.some((mesh) =>
      mesh.faces.some(
        (face) =>
          face.materialId === materialId &&
          (!face.uv ||
            face.uv.length !== face.vertexIds.length ||
            face.uv.some(
              (uv) => uv.length !== 2 || uv.some((value) => !Number.isFinite(Math.fround(value))),
            )),
      ),
    )
  )
    throw new Error('この材質を使う全cornerに有限のUVが必要です。UV付きの基本形を使ってください。');
}

function currentSource(project: Project3D, materialId: string, sourceId: string) {
  const source = project.sources.find((item) => item.id === sourceId);
  if (!source || material(project, materialId).textureBlobId !== source.blobId)
    throw new Error('現在の画像と原本の対応が変わりました。画像の来歴を選び直してください。');
  return source;
}

function publish(project: Project3D, edit: (candidate: Project3D) => void) {
  const candidate = structuredClone(project);
  edit(candidate);
  validateProject(candidate);
  project.materials = candidate.materials;
  project.sources = candidate.sources;
  project.blobIds = candidate.blobIds;
}

function registerSource(project: Project3D, source: Source3D) {
  if (source.mimeType !== 'image/png' && source.mimeType !== 'image/jpeg')
    throw new Error('この工程では静止PNGまたはJPEG画像を使用してください。');
  const existing = project.sources.find((item) => item.id === source.id);
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(source))
      throw new Error('既存の画像原本や来歴は変更できません。');
  } else project.sources.push(structuredClone(source));
  if (!project.blobIds.includes(source.blobId)) project.blobIds.push(source.blobId);
}

/** Import or replace an original image; previous sources remain available for backup/history. */
export function assignBaseColorTexture(project: Project3D, materialId: string, source: Source3D) {
  publish(project, (candidate) => {
    const target = material(candidate, materialId);
    assertMappedFaces(candidate, materialId);
    if (source.derivedFrom) throw new Error('派生画像は元画像の対応を確認して適用してください。');
    registerSource(candidate, source);
    target.textureBlobId = source.blobId;
  });
}

/** Explicit source identity avoids guessing when several sources have identical byte hashes. */
export function applyDerivedBaseColorTexture(
  project: Project3D,
  materialId: string,
  parentSourceId: string,
  derived: DerivedBaseColorSource,
) {
  publish(project, (candidate) => {
    const parent = currentSource(candidate, materialId, parentSourceId);
    assertMappedFaces(candidate, materialId);
    if (candidate.sources.some((source) => source.id === derived.id))
      throw new Error('派生画像には新しいIDが必要です。');
    registerSource(candidate, {
      id: derived.id,
      blobId: derived.blobId,
      mimeType: 'image/png',
      rights: structuredClone(parent.rights),
      derivedFrom: {
        sourceId: parent.id,
        hash: parent.blobId,
        operation: derived.operation,
        version: derived.version,
        settings: derived.settings,
      },
    });
    material(candidate, materialId).textureBlobId = derived.blobId;
  });
}

/** Detach only; this deliberately preserves source bytes and their derivation chain. */
export function removeBaseColorTexture(project: Project3D, materialId: string) {
  publish(project, (candidate) => {
    delete material(candidate, materialId).textureBlobId;
  });
}

export function restoreOriginalBaseColorTexture(
  project: Project3D,
  materialId: string,
  currentSourceId: string,
) {
  publish(project, (candidate) => {
    validateProject(candidate);
    let source = currentSource(candidate, materialId, currentSourceId);
    while (source.derivedFrom)
      source = candidate.sources.find((item) => item.id === source.derivedFrom!.sourceId)!;
    assertMappedFaces(candidate, materialId);
    material(candidate, materialId).textureBlobId = source.blobId;
  });
}
