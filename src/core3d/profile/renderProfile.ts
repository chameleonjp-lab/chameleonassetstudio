import type { Project3D } from '../model/project';

/** Engineering guards, not physical-device certification or GLB admission limits. */
export const NATIVE_RENDER_PROFILE = Object.freeze({
  id: 'native-render-budget-v1',
  nodes: 1000,
  depth: 64,
  vertices: 100_000,
  triangles: 100_000,
  expandedCorners: 300_000,
  maxCssEdge: 1_000_000,
  maxBufferEdge: 4096,
  maxBufferPixels: 4_000_000,
  maxPixelRatio: 2,
  // Color/depth plus conservative multisample/intermediate allowance, not GPU measurement.
  bufferBytesPerPixel: 32,
});

export function renderTargetBudget(width: number, height: number, requestedRatio: number) {
  if (
    ![width, height, requestedRatio].every(Number.isFinite) ||
    width < 0 ||
    height < 0 ||
    requestedRatio <= 0 ||
    width > NATIVE_RENDER_PROFILE.maxCssEdge ||
    height > NATIVE_RENDER_PROFILE.maxCssEdge
  )
    throw new Error('Invalid native render dimensions');
  const cssWidth = Math.max(1, Math.floor(width)),
    cssHeight = Math.max(1, Math.floor(height));
  const pixelRatio = Math.min(
    requestedRatio,
    NATIVE_RENDER_PROFILE.maxPixelRatio,
    NATIVE_RENDER_PROFILE.maxBufferEdge / cssWidth,
    NATIVE_RENDER_PROFILE.maxBufferEdge / cssHeight,
    Math.sqrt(NATIVE_RENDER_PROFILE.maxBufferPixels / cssWidth / cssHeight),
  );
  const bufferWidth = Math.max(1, Math.floor(cssWidth * pixelRatio)),
    bufferHeight = Math.max(1, Math.floor(cssHeight * pixelRatio));
  return {
    cssWidth,
    cssHeight,
    pixelRatio,
    bufferWidth,
    bufferHeight,
    estimatedBytes: bufferWidth * bufferHeight * NATIVE_RENDER_PROFILE.bufferBytesPerPixel,
  };
}

/** Expanded numeric scratch arrays + typed CPU attributes + GPU estimate, held for graph lifetime. */
export function estimateNativeGeometryBytes(project: Project3D): number {
  const used = new Set(project.nodes.map((node) => node.meshId));
  let bytes = project.nodes.length * 4096 + project.materials.length * 4096;
  for (const mesh of project.meshes) {
    if (!used.has(mesh.id)) continue;
    const skin = project.skins.find((skin) => skin.meshId === mesh.id);
    const corners = mesh.faces.reduce((sum, face) => sum + face.vertexIds.length, 0);
    bytes += corners * (skin ? 240 : 128) + mesh.vertices.length * 64 + mesh.faces.length * 64;
    if (skin)
      bytes +=
        skin.joints.length * 1024 * project.nodes.filter((node) => node.meshId === mesh.id).length;
  }
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error('Invalid geometry ownership estimate');
  return bytes;
}
