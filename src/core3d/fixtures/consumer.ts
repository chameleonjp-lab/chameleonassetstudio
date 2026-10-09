import { rebindSkin } from '../rig/authoring';
import { nativeBox } from './nativeBox';
import { assetIoFixture, assetIoPng } from './assetIo';
import { sha256 } from '../export/snapshot';
import { identityTransform, type Project3D } from '../model/project';
export const CONSUMER_FIXTURE_IDS = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07'] as const;
export type ConsumerFixtureId = (typeof CONSUMER_FIXTURE_IDS)[number];
/** Original fixtures, never a claim that arbitrary user assets passed these checks. */
export async function consumerFixture(
  id: ConsumerFixtureId,
): Promise<{ project: Project3D; blobs: Map<string, Uint8Array> }> {
  const p =
    id === 'F01' || id === 'F03' || id === 'F04' ? nativeBox('consumer-' + id) : assetIoFixture();
  p.id = 'consumer-' + id;
  p.name = id;
  p.game.assetId = p.id;
  const blobs = new Map<string, Uint8Array>();
  if (id === 'F01') {
    p.nodes[0].transform.translation = [2, 0, 0];
  }
  if (id === 'F03') {
    p.nodes.push({
      id: 'parent',
      name: 'Same',
      parentId: null,
      transform: { ...identityTransform(), translation: [-1, 2, 3], scale: [2, 1, 0.5] },
    });
    p.nodes[0].parentId = 'parent';
    p.nodes[0].transform.translation = [2, 0, 0];
  }
  if (id === 'F04') {
    p.meshes[0].vertices = [
      { id: 'v0', position: [-0.5, -0.5, 0] },
      { id: 'v1', position: [0.5, -0.5, 0] },
      { id: 'v2', position: [0.5, 0.5, 0] },
      { id: 'v3', position: [-0.5, 0.5, 0] },
    ];
    p.meshes[0].faces = [
      {
        id: 'f0',
        vertexIds: ['v0', 'v1', 'v2'],
        materialId: 'green',
        uv: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        normals: [
          [0, 0, 1],
          [0, 0, 1],
          [0, 0, 1],
        ],
      },
      {
        id: 'f1',
        vertexIds: ['v0', 'v2', 'v3'],
        materialId: 'green',
        uv: [
          [0, 0],
          [1, 1],
          [0, 1],
        ],
        normals: [
          [0, 0, 1],
          [0, 0, 1],
          [0, 0, 1],
        ],
      },
    ];
    p.materials[0].baseColor = [1, 1, 1, 1];
    p.materials[0].doubleSided = true;
    const bytes = await assetIoPng(),
      hash = await sha256(bytes);
    blobs.set(hash, bytes);
    p.blobIds = [hash];
    p.materials[0].textureBlobId = hash;
    p.materials[0].alphaMode = 'BLEND';
    p.sources.push({
      id: 'original-color-fixture',
      blobId: hash,
      mimeType: 'image/png',
      rights: { declared: 'Original test fixture', embedded: '' },
    });
  }
  if (id === 'F05')
    p.clips.push(
      {
        id: 'step',
        name: 'Same',
        duration: 2,
        loop: false,
        tracks: [
          {
            nodeId: 'tip',
            property: 'translation',
            interpolation: 'STEP',
            keys: [
              { time: 0, value: [0, 1, 0] },
              { time: 1, value: [0, 3, 0] },
            ],
          },
        ],
      },
      {
        id: 'single',
        name: 'Same',
        duration: 2,
        loop: false,
        tracks: [
          {
            nodeId: 'tip',
            property: 'translation',
            interpolation: 'LINEAR',
            keys: [{ time: 1, value: [0, 2, 0] }],
          },
        ],
      },
      {
        id: 'sign',
        name: 'Same',
        duration: 2,
        loop: false,
        tracks: [
          {
            nodeId: 'root',
            property: 'rotation',
            interpolation: 'LINEAR',
            keys: [
              { time: 0, value: [0, 0, 0, 1] },
              { time: 2, value: [0, 0, 0, -1] },
            ],
          },
        ],
      },
    );
  if (id === 'F07') {
    p.nodes.push({
      id: 'scaled-parent',
      name: 'Same',
      parentId: null,
      transform: { ...identityTransform(), translation: [-1, 2, 3], scale: [2, 3, 4] },
    });
    p.nodes.find((n) => n.id === 'box-node')!.parentId = 'scaled-parent';
    p.nodes.find((n) => n.id === 'root')!.parentId = 'scaled-parent';
    rebindSkin(p, 'skin');
  }
  if (id === 'F06') {
    p.game.unitMeters = 0.01;
    p.game.forward = '-X';
    p.game.origin = [1, 2, 3];
    p.game.anchors[0].transform.translation = [0.5, 0, 0];
  }
  return { project: p, blobs };
}
