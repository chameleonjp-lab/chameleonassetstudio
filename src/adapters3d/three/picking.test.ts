import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { buildNativeGraph, type NativeGraph } from './renderer';
import { editFixture } from '../../../tools/3d-edit-evaluation/fixtures';
import { canvasPoint, pickNative, type CssRect } from './picking';

const rect: CssRect = { left: 120, top: 75, width: 800, height: 400 };
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose());
  vi.unstubAllGlobals();
});

function camera(projection: 'perspective' | 'orthographic') {
  const result =
    projection === 'perspective'
      ? new PerspectiveCamera(45, 2, 0.1, 100)
      : new OrthographicCamera(-4, 4, 2, -2, 0.1, 100);
  result.position.set(0, 0, 8);
  result.lookAt(0, 0, 0);
  result.updateMatrixWorld(true);
  return result;
}

function nativeScene() {
  const project = editFixture();
  const graph = buildNativeGraph(project);
  cleanup.push(() => graph.dispose());
  return { project, graph, ids: new Set(project.nodes.map((node) => node.id)) };
}

function clientPoint(position: [number, number, number], view: ReturnType<typeof camera>) {
  const projected = new Vector3(...position).project(view);
  return [
    rect.left + ((projected.x + 1) * rect.width) / 2,
    rect.top + ((1 - projected.y) * rect.height) / 2,
  ] as const;
}

function object(graph: NativeGraph, id: string) {
  let found: Mesh | Group | undefined;
  graph.root.traverse((item) => {
    if (item.userData.canonicalNodeId === id) found = item as Mesh | Group;
  });
  return found!;
}

describe('CSS canvas coordinate conversion', () => {
  it('subtracts a viewport offset and converts CSS edges and center to normalized coordinates', () => {
    expect(canvasPoint(120, 75, rect)?.toArray()).toEqual([-1, 1]);
    expect(canvasPoint(920, 475, rect)?.toArray()).toEqual([1, -1]);
    expect(canvasPoint(520, 275, rect)?.toArray()).toEqual([0, 0]);
    expect(canvasPoint(320, 175, rect)?.toArray()).toEqual([-0.5, 0.5]);
  });

  it.each([1, 1.5, 2, 3])('uses CSS pixels independently of device pixel ratio %s', (dpr) => {
    vi.stubGlobal('devicePixelRatio', dpr);
    expect(canvasPoint(320, 175, rect)?.toArray()).toEqual([-0.5, 0.5]);
    const view = camera('perspective');
    const { graph, ids } = nativeScene();
    const [x, y] = clientPoint([-1.25, 0, 0], view);
    expect(pickNative(graph.root, view, ids, x, y, rect)).toBe('box-node');
  });

  it.each([
    [119, 275],
    [921, 275],
    [520, 74],
    [520, 476],
    [NaN, 275],
    [520, Infinity],
  ])('rejects outside/nonfinite client point %s,%s', (x, y) => {
    expect(canvasPoint(x, y, rect)).toBeNull();
  });

  it.each([
    { width: 0 },
    { width: -1 },
    { height: 0 },
    { height: -1 },
    { left: NaN },
    { top: Infinity },
    { width: Infinity },
  ])('rejects a degenerate rectangle %o', (change) => {
    expect(canvasPoint(520, 275, { ...rect, ...change })).toBeNull();
  });
});

describe('canonical native raycasting (real Three math, no WebGL)', () => {
  it.each(['perspective', 'orthographic'] as const)(
    'picks canonical IDs with a %s camera, including nested nodes',
    (projection) => {
      const view = camera(projection);
      const { project, graph, ids } = nativeScene();
      const before = structuredClone(project);
      for (const [id, position] of [
        ['box-node', [-1.25, 0, 0]],
        ['right-node', [1.25, 0, 0]],
      ] as const) {
        const [x, y] = clientPoint([...position], view);
        expect(pickNative(graph.root, view, ids, x, y, rect)).toBe(id);
      }
      expect(pickNative(graph.root, view, ids, 520, 275, rect)).toBeNull();
      expect(project).toEqual(before);
      expect(ids.has(String(object(graph, 'box-node').id))).toBe(false);
    },
  );

  it('filters unknown canonical IDs and returns the nearest permitted hit', () => {
    const view = camera('perspective');
    const { graph } = nativeScene();
    const near = object(graph, 'right-node');
    near.position.set(-1.25, 0, 2);
    const [x, y] = clientPoint([-1.25, 0, 0], view);
    // Align the nearer box with this perspective ray rather than merely its X coordinate.
    near.position.x = (-1.25 * (8 - 2)) / 8;
    expect(pickNative(graph.root, view, new Set(['box-node', 'right-node']), x, y, rect)).toBe(
      'right-node',
    );
    expect(pickNative(graph.root, view, new Set(['box-node']), x, y, rect)).toBe('box-node');
    near.userData.canonicalNodeId = 7;
    expect(pickNative(graph.root, view, new Set(['right-node']), x, y, rect)).toBeNull();
  });

  it('does not raycast scene helpers outside the native graph even with a spoofed permitted ID', () => {
    const view = camera('perspective');
    const { graph, ids } = nativeScene();
    const scene = new Scene();
    const helper = new Mesh(new BoxGeometry(20, 20, 1), new MeshBasicMaterial());
    helper.position.z = 3;
    helper.userData.canonicalNodeId = 'right-node';
    scene.add(graph.root, helper);
    cleanup.push(() => {
      helper.geometry.dispose();
      helper.material.dispose();
    });
    const raycast = vi.spyOn(helper, 'raycast');
    const [x, y] = clientPoint([-1.25, 0, 0], view);
    expect(pickNative(graph.root, view, ids, x, y, rect)).toBe('box-node');
    expect(raycast).not.toHaveBeenCalled();
    expect(graph.root.children).not.toContain(helper);
  });

  it.each(['node', 'ancestor', 'root', 'scene'] as const)(
    'excludes a hit hidden by its %s visibility',
    (hidden) => {
      const view = camera('orthographic');
      const { graph, ids } = nativeScene();
      const scene = new Scene();
      scene.add(graph.root);
      const target =
        hidden === 'node'
          ? object(graph, 'right-node')
          : hidden === 'ancestor'
            ? object(graph, 'group-node')
            : hidden === 'root'
              ? graph.root
              : scene;
      target.visible = false;
      const [x, y] = clientPoint([1.25, 0, 0], view);
      expect(pickNative(graph.root, view, ids, x, y, rect)).toBeNull();
      target.visible = true;
      expect(pickNative(graph.root, view, ids, x, y, rect)).toBe('right-node');
    },
  );

  it('continues behind an invisible nearest branch to the visible canonical object', () => {
    const view = camera('orthographic');
    const { graph, ids } = nativeScene();
    object(graph, 'right-node').position.set(-1.25, 0, 2);
    object(graph, 'group-node').visible = false;
    const [x, y] = clientPoint([-1.25, 0, 0], view);
    expect(pickNative(graph.root, view, ids, x, y, rect)).toBe('box-node');
  });

  it('updates parent/world matrices before picking and rejects outside points before any raycast', () => {
    const view = camera('orthographic');
    const { graph, ids } = nativeScene();
    object(graph, 'group-node').position.y = 1;
    const [x, y] = clientPoint([1.25, 1, 0], view);
    expect(pickNative(graph.root, view, ids, x, y, rect)).toBe('right-node');
    const raycast = vi.spyOn(object(graph, 'right-node'), 'raycast');
    expect(pickNative(graph.root, view, ids, rect.left - 1, rect.top, rect)).toBeNull();
    expect(raycast).not.toHaveBeenCalled();
  });
});

describe('persisted visibility picking', () => {
  it.each(['self', 'ancestor'] as const)(
    'ignores a canonical hidden %s and picks again after a rebuild',
    (scope) => {
      const project = editFixture();
      const node = project.nodes.find((item) => item.id === 'box-node')!;
      if (scope === 'ancestor') {
        project.nodes.push({
          id: 'visibility-parent',
          name: 'Visibility parent',
          parentId: null,
          transform: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        });
        node.parentId = 'visibility-parent';
      }
      const target =
        scope === 'ancestor' ? project.nodes.find((item) => item.id === node.parentId)! : node;
      expect(target).toBeDefined();
      target.visible = false;
      const view = camera('perspective');
      const [x, y] = clientPoint([-1.25, 0, 0], view);
      const ids = new Set(project.nodes.map((item) => item.id));
      let graph = buildNativeGraph(project);
      expect(pickNative(graph.root, view, ids, x, y, rect)).toBeNull();
      graph.dispose();
      target.visible = true;
      graph = buildNativeGraph(project);
      try {
        expect(pickNative(graph.root, view, ids, x, y, rect)).toBe('box-node');
      } finally {
        graph.dispose();
      }
    },
  );
});
