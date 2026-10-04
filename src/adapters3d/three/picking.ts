import { Raycaster, Vector2, type Camera, type Object3D } from 'three';

export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function canvasPoint(clientX: number, clientY: number, rect: CssRect) {
  if (
    ![clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return null;
  const x = (clientX - rect.left) / rect.width,
    y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return new Vector2(x * 2 - 1, 1 - y * 2);
}
/** Only raycast the native graph. Helpers are in a separate scene subtree. */
export function pickNative(
  root: Object3D,
  camera: Camera,
  ids: ReadonlySet<string>,
  clientX: number,
  clientY: number,
  rect: CssRect,
): string | null {
  const point = canvasPoint(clientX, clientY, rect);
  if (!point) return null;
  root.updateWorldMatrix(true, true);
  camera.updateMatrixWorld();
  const raycaster = new Raycaster();
  raycaster.setFromCamera(point, camera);
  for (const hit of raycaster.intersectObject(root, true)) {
    let visible = true;
    for (let item: Object3D | null = hit.object; item; item = item.parent) visible &&= item.visible;
    const id: unknown = hit.object.userData.canonicalNodeId;
    if (visible && typeof id === 'string' && ids.has(id)) return id;
  }
  return null;
}
