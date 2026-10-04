import { validateProject, type Material3D, type Project3D } from '../model/project';

function publishMaterial(project: Project3D, material: Material3D): string {
  const candidate = structuredClone(project);
  candidate.materials.push(structuredClone(material));
  validateProject(candidate);
  project.materials = candidate.materials;
  return material.id;
}

/** An unassigned material is valid and remains part of the native project. */
export function addMaterial(
  project: Project3D,
  id: string,
  factors: Pick<Material3D, 'baseColor' | 'metallic' | 'roughness'>,
): string {
  return publishMaterial(project, { id, ...structuredClone(factors) });
}

export function duplicateMaterial(project: Project3D, materialId: string, newId: string): string {
  const material = project.materials.find((item) => item.id === materialId);
  if (!material) throw new Error('複製する材質を選択してください。');
  return publishMaterial(project, { ...structuredClone(material), id: newId });
}

/** Face assignments do not modify UVs, normals, skin weights, or source bytes. */
export function assignMaterial(
  project: Project3D,
  meshId: string,
  faceIds: readonly string[],
  materialId: string,
): void {
  const mesh = project.meshes.find((item) => item.id === meshId);
  const material = project.materials.find((item) => item.id === materialId);
  if (!mesh || !material) throw new Error('割当先のmeshと材質を選択してください。');
  if (project.nodes.filter((item) => item.meshId === meshId).length > 1)
    throw new Error('共有meshです。先に部品を独立したコピーにしてください。');
  const selection = new Set(faceIds);
  if (!selection.size || [...selection].some((id) => !mesh.faces.some((face) => face.id === id)))
    throw new Error('有効な割当先の面を選択してください。');
  if (
    material.textureBlobId !== undefined &&
    mesh.faces.some(
      (face) =>
        selection.has(face.id) &&
        (!face.uv ||
          face.uv.length !== face.vertexIds.length ||
          face.uv.some(
            (uv) => uv.length !== 2 || uv.some((value) => !Number.isFinite(Math.fround(value))),
          )),
    )
  )
    throw new Error('画像付き材質の割当先には、全cornerに有限のUVが必要です。');
  const candidate = structuredClone(mesh);
  candidate.faces.forEach((face) => {
    if (selection.has(face.id)) face.materialId = materialId;
  });
  project.meshes = project.meshes.map((item) => (item.id === meshId ? candidate : item));
}
