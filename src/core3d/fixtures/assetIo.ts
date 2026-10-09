import { nativeBox } from './nativeBox';
import { identityTransform } from '../model/project';
import { addRigJoint, bindSkin } from '../rig/authoring';
export function assetIoFixture() {
  const p = nativeBox('asset-fixture');
  p.nodes[0].transform.translation = [2, 0, 0];
  addRigJoint(p, 'root', 'Joint', null, identityTransform());
  addRigJoint(p, 'tip', 'Joint', 'root', { ...identityTransform(), translation: [0, 1, 0] });
  bindSkin(
    p,
    'skin',
    p.meshes[0].id,
    ['tip', 'root'],
    p.meshes[0].vertices.map((v) => ({
      vertexId: v.id,
      jointIds: ['tip', 'root'],
      values: [0.75, 0.25],
    })),
  );
  p.clips = [
    {
      id: 'move',
      name: 'Same',
      duration: 2,
      loop: true,
      tracks: [
        {
          nodeId: 'tip',
          property: 'translation',
          interpolation: 'LINEAR',
          keys: [
            { time: 0.5, value: [0, 1, 0] },
            { time: 1, value: [0, 2, 0] },
          ],
        },
      ],
    },
    { id: 'empty', name: 'Same', duration: 3, loop: false, tracks: [] },
  ];
  p.game.anchors = [
    {
      id: 'grip',
      name: 'Grip',
      purpose: 'attachment',
      nodeId: 'tip',
      transform: identityTransform(),
    },
  ];
  p.game.colliders = [
    {
      id: 'hit',
      name: 'Hit',
      purpose: 'hitbox',
      nodeId: p.nodes[0].id,
      transform: identityTransform(),
      shape: 'capsule',
      radius: 0.25,
      height: 1,
      size: [1, 1, 1],
    },
  ];
  return p;
}

/** Original four-corner RGBA fixture, top row red/green; bottom row blue/translucent white. */
export async function assetIoPng(): Promise<Uint8Array> {
  const { zlibSync } = await import('fflate');
  const rgba = new Uint8Array([
    0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 64,
  ]);
  const join = (parts: Uint8Array[]) => {
    const b = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      b.set(p, o);
      o += p.length;
    }
    return b;
  };
  const chunk = (name: string, data: Uint8Array) => {
    const b = new Uint8Array(data.length + 12),
      v = new DataView(b.buffer);
    v.setUint32(0, data.length);
    b.set(new TextEncoder().encode(name), 4);
    b.set(data, 8);
    let crc = 0xffffffff;
    for (const x of b.subarray(4, 8 + data.length)) {
      crc ^= x;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    v.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
    return b;
  };
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, 2);
  new DataView(header.buffer).setUint32(4, 2);
  header[8] = 8;
  header[9] = 6;
  return join([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(rgba)),
    chunk('IEND', new Uint8Array()),
  ]);
}

/** Original generated codec fixtures; no third-party image content. */
export const assetWebpBase64 =
  'UklGRjAAAABXRUJQVlA4TCQAAAAvAUAAEB8gEEjeHzqN+RcQFPwfnUAgSW1/qCNmD8INGCL6HwI=';
export const assetJpegBase64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAACAAIDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwev7YP5HP/9k=';
