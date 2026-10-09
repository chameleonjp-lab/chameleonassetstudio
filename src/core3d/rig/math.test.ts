import { describe, expect, it } from 'vitest';
import { cloneProject, createProject, type Project3D, type Vec3 } from '../model/project';
import {
  composeTransform,
  multiplyMatrices,
  transformPoint,
  worldMatrix,
} from '../model/coordinates';
import {
  assertAffineMatrix,
  inverseAffineMatrix,
  skinVertexToMeshLocal,
  type JointWorldPose,
  type SkinInfluence,
  type SkinVertexInput,
} from './math';

const identityMatrix = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function node(
  id: string,
  parentId: string | null,
  translation: Vec3 = [0, 0, 0],
  rotation: [number, number, number, number] = [0, 0, 0, 1],
  scale: Vec3 = [1, 1, 1],
) {
  return {
    id,
    name: id,
    parentId,
    transform: { translation, rotation, scale },
  };
}

function oracleProjects(): { rest: Project3D; posed: Project3D } {
  const rest = createProject('skin-math-oracle');
  rest.nodes = [
    node('group', null, [3, 0, 0]),
    node('root', 'group'),
    node('tip', 'root', [0, 1, 0]),
    node('mesh-node', 'group', [0, 0, 0]),
  ];
  rest.meshes = [
    {
      id: 'mesh',
      vertices: [{ id: 'v0', position: [0, 2, 0] }],
      faces: [],
    },
  ];
  rest.nodes[3].meshId = 'mesh';

  const posed = cloneProject(rest);
  const halfAngle = Math.PI / 4;
  posed.nodes[2].transform.rotation = [0, 0, Math.sin(halfAngle), Math.cos(halfAngle)];
  return { rest, posed };
}

function assertVectorClose(actual: Vec3, expected: Vec3, precision = 10) {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], precision));
}

describe('native skinning mathematics', () => {
  it('matches the fixed deep-parent bend oracle in mesh-local and world space', () => {
    const { rest, posed } = oracleProjects();
    const joints: JointWorldPose[] = ['root', 'tip'].map((nodeId) => ({
      nodeId,
      restWorld: worldMatrix(rest, nodeId),
      posedWorld: worldMatrix(posed, nodeId),
    }));
    const input: SkinVertexInput = {
      position: [0, 2, 0],
      restMeshWorld: worldMatrix(rest, 'mesh-node'),
      currentMeshWorld: worldMatrix(posed, 'mesh-node'),
      joints,
      influences: [
        { jointId: 'root', weight: 0.5 },
        { jointId: 'tip', weight: 0.5 },
      ],
    };

    const local = skinVertexToMeshLocal(input);
    assertVectorClose(local, [-0.5, 1.5, 0]);
    assertVectorClose(transformPoint(input.currentMeshWorld as number[], local), [2.5, 1.5, 0]);
  });

  it('keeps a rest vertex fixed through deep rotated, non-uniformly scaled parents', () => {
    const rest = createProject('skin-deep-rest');
    const z = Math.sin(Math.PI / 8),
      x = Math.sin(Math.PI / 12),
      y = Math.sin(Math.PI / 10);
    rest.nodes = [
      node('group', null, [3, -2, 1], [0, 0, z, Math.cos(Math.PI / 8)], [2, 3, 0.5]),
      node('root', 'group', [1, 2, 0], [x, 0, 0, Math.cos(Math.PI / 12)], [1, 2, 1]),
      node('tip', 'root', [0, 1, 2], [0, y, 0, Math.cos(Math.PI / 10)], [0.5, 1, 2]),
      node('mesh-node', 'group', [0.5, 0, -1], [0, 0, 0, 1], [0.75, 1.25, 1.5]),
    ];
    const posed = cloneProject(rest);
    const vertex: Vec3 = [0.25, -2, 3];
    const result = skinVertexToMeshLocal({
      position: vertex,
      restMeshWorld: worldMatrix(rest, 'mesh-node'),
      currentMeshWorld: worldMatrix(posed, 'mesh-node'),
      joints: [
        {
          nodeId: 'tip',
          restWorld: worldMatrix(rest, 'tip'),
          posedWorld: worldMatrix(posed, 'tip'),
        },
      ],
      influences: [{ jointId: 'tip', weight: 1 }],
    });
    assertVectorClose(result, vertex, 8);
  });

  it('inverts a translated rotated scale matrix using the repository convention', () => {
    const matrix = composeTransform({
      translation: [-3, 2, 5],
      rotation: [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)],
      scale: [2, 3, 0.5],
    });
    const product = multiplyMatrices(inverseAffineMatrix(matrix), matrix);
    const identity = identityMatrix();
    product.forEach((value, index) => expect(value).toBeCloseTo(identity[index], 10));
  });

  it('rejects a nearly singular matrix whose direct determinant rounds to a nonzero value', () => {
    const matrix = [
      867049, 941426, 1808475, 0, 485288, 345821, 831109, 0, 99675, 975372, 1075047, 0, 0, 0, 0, 1,
    ];
    expect(() => inverseAffineMatrix(matrix)).toThrow('nonsingular');
  });

  it('rejects an inverse when Float32 rounding makes the linear matrix singular', () => {
    const matrix = [1, 1, 0, 0, 1, 1 + 5e-8, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    expect(Math.fround(1 + 5e-8)).toBe(1);
    expect(() =>
      skinVertexToMeshLocal({
        position: [1, 2, 3],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ nodeId: 'root', restWorld: matrix, posedWorld: matrix }],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('numerically unstable in Float32');
  });

  it('inverts a valid high non-uniform scale with a small absolute pivot', () => {
    const matrix = [1e-15, 1e-15, 0, 0, -1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const product = multiplyMatrices(inverseAffineMatrix(matrix), matrix);
    identityMatrix().forEach((value, index) => expect(product[index]).toBeCloseTo(value, 8));
  });

  it('rejects an unstable inverse that produces an inaccurate skin result', () => {
    const n = 200000;
    const matrix = [n + 1, 2, n + 1, 0, 2 * n + 1, n + 1, n + 2, 0, n + 2, n + 1, 1, 0, 0, 0, 0, 1];
    expect(() =>
      skinVertexToMeshLocal({
        position: [1, 2, 3],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ nodeId: 'root', restWorld: matrix, posedWorld: matrix }],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('numerically unstable');
  });

  it('rejects an inaccurate inverse residual after restoring a large rotated scale', () => {
    const angle = 0.3;
    const scale = 1e15;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const matrix = [
      scale * cosine,
      sine,
      0,
      0,
      -scale * sine,
      cosine,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    ];
    expect(() =>
      skinVertexToMeshLocal({
        position: [1, 2, 3],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ nodeId: 'root', restWorld: matrix, posedWorld: matrix }],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('numerically unstable');
  });

  it.each([1000, 1e6])(
    'accepts and skins through a translated rotation with ordinary translation magnitude %s',
    (translation) => {
      const angle = 0.3;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const matrix = [
        cosine,
        sine,
        0,
        0,
        -sine,
        cosine,
        0,
        0,
        0,
        0,
        1,
        0,
        translation,
        translation,
        0,
        1,
      ];
      const result = skinVertexToMeshLocal({
        position: [1, 2, 3],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ nodeId: 'root', restWorld: matrix, posedWorld: matrix }],
        influences: [{ jointId: 'root', weight: 1 }],
      });
      assertVectorClose(result, [1, 2, 3], 8);
    },
  );

  it.each([1e15, 1e18])(
    'rejects an unstable inverse with large rotated translation %s',
    (translation) => {
      const angle = 0.3;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const matrix = [
        cosine,
        sine,
        0,
        0,
        -sine,
        cosine,
        0,
        0,
        0,
        0,
        1,
        0,
        translation,
        translation,
        0,
        1,
      ];
      expect(() =>
        skinVertexToMeshLocal({
          position: [1, 2, 3],
          restMeshWorld: identityMatrix(),
          currentMeshWorld: identityMatrix(),
          joints: [{ nodeId: 'root', restWorld: matrix, posedWorld: matrix }],
          influences: [{ jointId: 'root', weight: 1 }],
        }),
      ).toThrow('numerically unstable');
    },
  );

  it.each([
    ['non-affine', (matrix: number[]) => (matrix[3] = 0.25)],
    ['singular', (matrix: number[]) => (matrix[0] = 0)],
    ['non-finite', (matrix: number[]) => (matrix[0] = Number.NaN)],
  ])('rejects a %s matrix', (_label, alter) => {
    const matrix = identityMatrix();
    alter(matrix);
    expect(() => inverseAffineMatrix(matrix)).toThrow();
  });

  it('rejects sparse matrices and vertex positions', () => {
    const sparseMatrix = identityMatrix();
    delete sparseMatrix[0];
    expect(() => assertAffineMatrix(sparseMatrix)).toThrow('finite numbers');

    const sparsePosition = [1, 2, 3];
    delete sparsePosition[1];
    expect(() =>
      skinVertexToMeshLocal({
        position: sparsePosition as unknown as Vec3,
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [
          {
            nodeId: 'root',
            restWorld: identityMatrix(),
            posedWorld: identityMatrix(),
          },
        ],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('Vertex position');
  });

  it('accepts four influences at the normalized boundary without correcting weights', () => {
    const joints = Array.from({ length: 4 }, (_, index) => ({
      nodeId: `joint-${index}`,
      restWorld: identityMatrix(),
      posedWorld: identityMatrix(),
    }));
    const influences: SkinInfluence[] = [
      { jointId: 'joint-0', weight: 0 },
      { jointId: 'joint-1', weight: 0.25 },
      { jointId: 'joint-2', weight: 0.25 },
      { jointId: 'joint-3', weight: 0.500005 },
    ];
    const before = influences.map((entry) => entry.weight);
    const result = skinVertexToMeshLocal({
      position: [1, -2, 3],
      restMeshWorld: identityMatrix(),
      currentMeshWorld: identityMatrix(),
      joints,
      influences,
    });
    assertVectorClose(result, [1.000005, -2.00001, 3.000015], 10);
    expect(influences.map((entry) => entry.weight)).toEqual(before);
  });

  it('weights accepted influences in current-mesh local coordinates', () => {
    const meshWorld = identityMatrix();
    meshWorld[12] = 100000;
    const result = skinVertexToMeshLocal({
      position: [0, 0, 0],
      restMeshWorld: meshWorld,
      currentMeshWorld: [...meshWorld],
      joints: [
        {
          nodeId: 'root',
          restWorld: identityMatrix(),
          posedWorld: identityMatrix(),
        },
      ],
      influences: [{ jointId: 'root', weight: 1.000005 }],
    });
    assertVectorClose(result, [0, 0, 0]);
  });

  it('rejects matrices, vectors, palettes, points, and accumulations outside Float32 range', () => {
    const hugeTranslation = identityMatrix();
    hugeTranslation[12] = 1e300;
    expect(() => inverseAffineMatrix(hugeTranslation)).toThrow('Float32');

    const identityJoint: JointWorldPose = {
      nodeId: 'root',
      restWorld: identityMatrix(),
      posedWorld: identityMatrix(),
    };
    const oversizedPose = identityMatrix();
    oversizedPose[13] = 1e300;
    expect(() =>
      skinVertexToMeshLocal({
        position: [0, 0, 0],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ ...identityJoint, posedWorld: oversizedPose }],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('Float32');

    expect(() =>
      skinVertexToMeshLocal({
        position: [1e300, 0, 0],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [identityJoint],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('Float32');

    const overflowingPose = identityMatrix();
    overflowingPose[12] = 2e38;
    const overflowingRest = identityMatrix();
    overflowingRest[12] = -2e38;
    expect(() =>
      skinVertexToMeshLocal({
        position: [0, 0, 0],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ nodeId: 'root', restWorld: overflowingRest, posedWorld: overflowingPose }],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('Float32');

    const doubledScale = identityMatrix();
    doubledScale[0] = 2;
    expect(() =>
      skinVertexToMeshLocal({
        position: [2e38, 0, 0],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ nodeId: 'root', restWorld: identityMatrix(), posedWorld: doubledScale }],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('Float32');

    const maximumFloat32 = 3.4028234663852886e38;
    const maximumTranslation = identityMatrix();
    maximumTranslation[12] = maximumFloat32;
    expect(() => assertAffineMatrix(maximumTranslation)).not.toThrow();
    expect(() =>
      skinVertexToMeshLocal({
        position: [0, 0, 0],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [
          { nodeId: 'root-a', restWorld: identityMatrix(), posedWorld: maximumTranslation },
          { nodeId: 'root-b', restWorld: identityMatrix(), posedWorld: maximumTranslation },
        ],
        influences: [
          { jointId: 'root-a', weight: 0.500004 },
          { jointId: 'root-b', weight: 0.500004 },
        ],
      }),
    ).toThrow('Float32');
  });

  it('rejects point products that overflow Float32 before later terms cancel', () => {
    const posedWorld = identityMatrix();
    posedWorld[0] = 2;
    posedWorld[4] = 2;
    expect(() =>
      skinVertexToMeshLocal({
        position: [2 ** 127, -(2 ** 127), 0],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ nodeId: 'root', restWorld: identityMatrix(), posedWorld }],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('Float32-finite');
  });

  it('accepts finite Float32 products that cancel in the following partial sum', () => {
    const posedWorld = identityMatrix();
    posedWorld[0] = 2;
    posedWorld[4] = 2;
    const result = skinVertexToMeshLocal({
      position: [2 ** 126, -(2 ** 126), 0],
      restMeshWorld: identityMatrix(),
      currentMeshWorld: identityMatrix(),
      joints: [{ nodeId: 'root', restWorld: identityMatrix(), posedWorld }],
      influences: [{ jointId: 'root', weight: 1 }],
    });
    assertVectorClose(result, [0, -(2 ** 126), 0]);
  });

  it('rejects an overflowing ordered Float32 partial before later cancellation', () => {
    const posedWorld = identityMatrix();
    posedWorld[4] = 1;
    posedWorld[8] = -1;
    expect(() =>
      skinVertexToMeshLocal({
        position: [2 ** 127, 2 ** 127, 2 ** 127],
        restMeshWorld: identityMatrix(),
        currentMeshWorld: identityMatrix(),
        joints: [{ nodeId: 'root', restWorld: identityMatrix(), posedWorld }],
        influences: [{ jointId: 'root', weight: 1 }],
      }),
    ).toThrow('Float32-finite');
  });

  it('rejects five influences, bad sums, zero totals, negative and non-finite weights', () => {
    const joints = Array.from({ length: 5 }, (_, index) => ({
      nodeId: `joint-${index}`,
      restWorld: identityMatrix(),
      posedWorld: identityMatrix(),
    }));
    const input: SkinVertexInput = {
      position: [1, 2, 3],
      restMeshWorld: identityMatrix(),
      currentMeshWorld: identityMatrix(),
      joints,
      influences: joints.slice(0, 5).map((joint) => ({ jointId: joint.nodeId, weight: 0.2 })),
    };
    expect(() => skinVertexToMeshLocal(input)).toThrow('between 1 and 4');

    for (const influences of [
      [
        { jointId: 'joint-0', weight: 0 },
        { jointId: 'joint-1', weight: 0 },
      ],
      [
        { jointId: 'joint-0', weight: -0.1 },
        { jointId: 'joint-1', weight: 1.1 },
      ],
      [
        { jointId: 'joint-0', weight: Number.NaN },
        { jointId: 'joint-1', weight: 1 },
      ],
      [
        { jointId: 'joint-0', weight: Number.POSITIVE_INFINITY },
        { jointId: 'joint-1', weight: 0 },
      ],
      [
        { jointId: 'joint-0', weight: 0.4 },
        { jointId: 'joint-1', weight: 0.4 },
      ],
      [
        { jointId: 'joint-0', weight: 0.5 },
        { jointId: 'joint-0', weight: 0.5 },
      ],
    ]) {
      expect(() => skinVertexToMeshLocal({ ...input, influences })).toThrow();
    }
  });
});
