/** Native-static Three adapter. Lazy product use follows the scoped G03 evidence record. */
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Spherical,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  cloneProject,
  validateProject,
  type Project3D,
  type Vec3,
} from '../../core3d/model/project';
import { transformPoint, worldMatrix } from '../../core3d/model/coordinates';

import type {
  NativeViewportResult as ProfileResult,
  NativeCameraAction,
  NativeViewportStatus as ViewportStatus,
  NativeViewportSuspensionContract as SuspensionContract,
} from '../../core3d/ports/renderPort';
export type { NativeCameraAction } from '../../core3d/ports/renderPort';

interface RendererPort {
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
  forceContextLoss(): void;
  info?: { memory: { geometries: number; textures: number } };
}
interface ControlsPort {
  target: Vector3;
  enabled: boolean;
  enableDamping: boolean;
  autoRotate: boolean;
  update(): unknown;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
  dispose(): void;
}
interface ResizePort {
  observe(target: Element): void;
  disconnect(): void;
}
/** Injectable ownership boundaries allow lifecycle tests without pretending to test a GPU. */
export interface NativeViewportDependencies {
  createRenderer(canvas: HTMLCanvasElement, context: WebGL2RenderingContext): RendererPort;
  createControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement): ControlsPort;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  createResizeObserver(callback: () => void): ResizePort | null;
}
export interface NativeViewportOptions {
  onStatus?: (status: ViewportStatus) => void;
  dependencies?: Partial<NativeViewportDependencies>;
}

const failure = (reason: string): ProfileResult => ({ ok: false, reason });
const float32Finite = (value: number) => Number.isFinite(Math.fround(value));

/** Native-only subset of compact-evaluation-0; not an import/decoder security profile. */
export const NATIVE_EVALUATION_LIMITS = Object.freeze({
  nodes: 1000,
  depth: 64,
  vertices: 100_000,
  triangles: 100_000,
  expandedCorners: 300_000,
});

/** Native contract checking only: no file loading, decoding, URL access, or import limits. */
export function checkNativeProfile(project: Project3D): ProfileResult {
  try {
    if (project.nodes.length > NATIVE_EVALUATION_LIMITS.nodes)
      return failure('Native compact-evaluation-0 node count exceeded.');
    const vertices = project.meshes.reduce((count, mesh) => count + mesh.vertices.length, 0);
    const triangles = project.meshes.reduce((count, mesh) => count + mesh.faces.length, 0);
    const corners = project.meshes.reduce(
      (count, mesh) => count + mesh.faces.reduce((total, face) => total + face.vertexIds.length, 0),
      0,
    );
    if (
      vertices > NATIVE_EVALUATION_LIMITS.vertices ||
      triangles > NATIVE_EVALUATION_LIMITS.triangles ||
      corners > NATIVE_EVALUATION_LIMITS.expandedCorners
    )
      return failure('Native compact-evaluation-0 geometry count exceeded.');
    const parents = new Map(project.nodes.map((node) => [node.id, node.parentId]));
    for (const node of project.nodes) {
      let depth = 1;
      let parent: string | null | undefined = node.parentId;
      while (parent != null) {
        if (++depth > NATIVE_EVALUATION_LIMITS.depth)
          return failure('Native compact-evaluation-0 hierarchy depth exceeded.');
        parent = parents.get(parent);
      }
    }
    validateProject(project);
  } catch (error) {
    return failure(
      `Invalid canonical project: ${error instanceof Error ? error.message : 'validation failed'}`,
    );
  }
  const unsupported: string[] = [];
  if (project.skins.length) unsupported.push('skins');
  if (project.clips.length) unsupported.push('animation clips');
  if (project.materials.some((material) => material.textureBlobId !== undefined))
    unsupported.push('textures');
  if (project.meshes.some((mesh) => mesh.faces.some((face) => face.vertexIds.length !== 3)))
    unsupported.push('non-triangle faces');
  if (unsupported.length)
    return failure(`This isolated native viewport does not support ${unsupported.join(', ')}.`);
  for (const mesh of project.meshes) {
    if (mesh.vertices.some((vertex) => !vertex.position.every(float32Finite)))
      return failure('Geometry is outside the finite Float32 evaluation profile.');
    for (const face of mesh.faces)
      if (
        [...(face.uv ?? []), ...(face.normals ?? [])].some((value) => !value.every(float32Finite))
      )
        return failure('Corner attributes are outside the finite Float32 evaluation profile.');
  }
  for (const node of project.nodes) {
    const matrix = worldMatrix(project, node.id);
    if (!matrix.every(float32Finite))
      return failure('Node transforms are outside the finite Float32 evaluation profile.');
    const mesh = project.meshes.find((candidate) => candidate.id === node.meshId);
    if (
      mesh?.vertices.some((vertex) => !transformPoint(matrix, vertex.position).every(float32Finite))
    )
      return failure('Transformed geometry is outside the finite Float32 evaluation profile.');
  }
  const renderedTriangles = project.nodes.reduce(
    (count, node) =>
      count + (project.meshes.find((mesh) => mesh.id === node.meshId)?.faces.length ?? 0),
    0,
  );
  if (renderedTriangles > NATIVE_EVALUATION_LIMITS.triangles)
    return failure(
      'Native compact-evaluation-0 rendered triangle count exceeded across instances.',
    );
  return { ok: true };
}

export interface NativeGraph {
  root: Group;
  geometries: BufferGeometry[];
  materials: MeshStandardMaterial[];
  dispose(): void;
}

/** Stable IDs stay in canonical data; expanded GPU corners are disposable representations. */
export function buildNativeGraph(project: Project3D): NativeGraph {
  const profile = checkNativeProfile(project);
  if (!profile.ok) throw new Error(profile.reason);
  const root = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: MeshStandardMaterial[] = [];
  let disposed = false;
  const graph: NativeGraph = {
    root,
    geometries,
    materials,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
  try {
    const materialIndices = new Map<string | undefined, number>();
    function materialIndex(id?: string): number {
      const existing = materialIndices.get(id);
      if (existing !== undefined) return existing;
      const source = project.materials.find((material) => material.id === id);
      const color = source?.baseColor ?? [0.55, 0.65, 0.8, 1];
      const material = new MeshStandardMaterial({
        color: new Color().setRGB(color[0], color[1], color[2]),
        opacity: color[3],
        transparent: color[3] < 1,
        metalness: source?.metallic ?? 0,
        roughness: source?.roughness ?? 0.7,
      });
      const index = materials.length;
      materials.push(material);
      materialIndices.set(id, index);
      return index;
    }
    const geometryById = new Map<string, BufferGeometry>();
    const usedMeshes = new Set(project.nodes.map((node) => node.meshId));
    for (const mesh of project.meshes) {
      if (!usedMeshes.has(mesh.id)) continue;
      const geometry = new BufferGeometry();
      geometries.push(geometry);
      const vertices = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position]));
      const positions: number[] = [],
        normals: number[] = [],
        uvs: number[] = [];
      for (const face of mesh.faces) {
        const corners = face.vertexIds.map((id) => vertices.get(id)!);
        const normal = new Vector3()
          .subVectors(new Vector3(...corners[1]), new Vector3(...corners[0]))
          .cross(new Vector3().subVectors(new Vector3(...corners[2]), new Vector3(...corners[0])))
          .normalize();
        const index = materialIndex(face.materialId);
        const previousGroup = geometry.groups.at(-1);
        if (previousGroup?.materialIndex === index) previousGroup.count += 3;
        else geometry.addGroup(positions.length / 3, 3, index);
        corners.forEach((corner, index) => {
          positions.push(...corner);
          normals.push(...(face.normals?.[index] ?? normal.toArray()));
          uvs.push(...(face.uv?.[index] ?? [0, 0]));
        });
      }
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometryById.set(mesh.id, geometry);
    }
    const nodes = new Map<string, Object3D>();
    for (const node of project.nodes) {
      const object =
        node.meshId === undefined
          ? new Group()
          : new Mesh(geometryById.get(node.meshId)!, materials);
      object.name = node.name;
      object.userData = { canonicalNodeId: node.id };
      object.position.fromArray(node.transform.translation);
      object.quaternion.fromArray(node.transform.rotation);
      object.scale.fromArray(node.transform.scale);
      nodes.set(node.id, object);
    }
    for (const node of project.nodes)
      (node.parentId === null ? root : nodes.get(node.parentId)!).add(nodes.get(node.id)!);
    root.updateMatrixWorld(true);
    return graph;
  } catch (error) {
    graph.dispose();
    throw error;
  }
}

export function fitPerspectiveBounds(
  bounds: { min: Vec3; max: Vec3 },
  aspect: number,
  fovDegrees = 45,
): { position: Vec3; target: Vec3; near: number; far: number } {
  if (
    ![...bounds.min, ...bounds.max, aspect, fovDegrees].every(Number.isFinite) ||
    aspect <= 0 ||
    fovDegrees <= 0 ||
    fovDegrees >= 180 ||
    bounds.min.some((value, index) => value > bounds.max[index])
  )
    throw new Error('Finite ordered bounds and a valid perspective camera are required.');
  const target = bounds.min.map((min, index) => min / 2 + bounds.max[index] / 2) as Vec3;
  const radius = Math.max(
    0.01,
    Math.hypot(...bounds.max.map((max, index) => max / 2 - bounds.min[index] / 2)),
  );
  const halfVertical = (fovDegrees * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const distance = (radius / Math.sin(Math.min(halfVertical, halfHorizontal))) * 1.2;
  const direction = new Vector3(1, 0.75, 1).normalize();
  const fit = {
    position: direction
      .multiplyScalar(distance)
      .add(new Vector3(...target))
      .toArray() as Vec3,
    target,
    near: Math.max(radius / 1000, 0.00001),
    far: distance + radius * 100,
  };
  if (![...fit.position, ...fit.target, fit.near, fit.far].every(float32Finite))
    throw new Error('Camera fit is outside the finite Float32 evaluation profile.');
  return fit;
}

export class NativeViewport {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(45, 1, 0.01, 1000);
  private readonly target = new Vector3();
  private readonly dependencies: NativeViewportDependencies;
  private readonly document: Document;
  private readonly cleanup: (() => void)[] = [];
  private readonly canvasCleanup: (() => void)[] = [];
  private readonly pointers = new Set<number>();
  private observer: ResizePort | null = null;
  private renderer: RendererPort | null = null;
  private context: WebGL2RenderingContext | null = null;
  private controls: ControlsPort | null = null;
  private graph: NativeGraph | null = null;
  private snapshot: Project3D | null = null;
  private element: HTMLCanvasElement | null = null;
  private frame: number | null = null;
  private hidden = false;
  private documentHidden = false;
  private frozen = false;
  private pageHidden = false;
  private suspended = false;
  private contextLost = false;
  private disposed = false;
  private fault: ViewportStatus | null = null;
  private suspension: { projectId: string; contract: SuspensionContract } | null = null;
  private lastStatus = '';
  private listenerCount = 0;
  private framesRendered = 0;
  private rebuildCount = 0;
  private contextLossCount = 0;
  private contextRestoreCount = 0;
  private disposedGeometries = 0;
  private disposedMaterials = 0;
  private disposedRenderers = 0;
  private renderFailures = 0;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private fitPending = true;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: NativeViewportOptions = {},
  ) {
    this.document = host.ownerDocument;
    const view = this.document.defaultView;
    this.dependencies = {
      createRenderer: (canvas, context) => new WebGLRenderer({ canvas, context, antialias: true }),
      createControls: (camera, canvas) => new OrbitControls(camera, canvas),
      requestFrame: (callback) => view!.requestAnimationFrame(callback),
      cancelFrame: (id) => view!.cancelAnimationFrame(id),
      createResizeObserver: (callback) =>
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(callback),
      ...options.dependencies,
    };
    this.documentHidden = this.document.hidden;
    this.scene.background = new Color(0x18202b);
    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(3, 5, 4);
    this.scene.add(light);
    this.listen(this.document, 'visibilitychange', () => {
      this.documentHidden = this.document.hidden;
      this.syncActivity();
    });
    this.listen(this.document, 'freeze', () => this.setFrozen(true));
    this.listen(this.document, 'resume', () => this.setFrozen(false));
    if (view) {
      this.listen(view, 'pagehide', () => {
        this.pageHidden = true;
        this.syncActivity();
      });
      this.listen(view, 'pageshow', () => {
        this.pageHidden = false;
        this.resize();
        this.syncActivity();
      });
      this.listen(view, 'resize', () => this.resize());
    }
    this.observer = this.dependencies.createResizeObserver(() => this.resize());
    this.observer?.observe(this.host);
    this.resize();
    this.publish();
  }

  get canvas(): HTMLCanvasElement | null {
    return this.element;
  }

  get status(): ViewportStatus {
    if (this.disposed) return { state: 'disposed' };
    if (this.fault) return { ...this.fault };
    if (this.suspended) return { state: 'suspended' };
    if (this.contextLost)
      return {
        state: 'context-lost',
        reason: 'WebGL context lost; canonical data remains available.',
      };
    if (this.frozen) return { state: 'frozen' };
    if (this.hidden || this.documentHidden || this.pageHidden) return { state: 'hidden' };
    if (!this.snapshot) return { state: 'empty' };
    return { state: 'active' };
  }

  get diagnostics() {
    return {
      state: this.status.state,
      projectId: this.snapshot?.id ?? null,
      revision: this.snapshot?.revision ?? null,
      renderers: this.renderer ? 1 : 0,
      contexts: this.context ? 1 : 0,
      canvases: this.element ? 1 : 0,
      geometries: this.graph?.geometries.length ?? 0,
      materials: this.graph?.materials.length ?? 0,
      controls: this.controls ? 1 : 0,
      // Own listeners only. OrbitControls and WebGLRenderer internals are owned by their instances.
      listeners: this.listenerCount,
      resizeObservers: this.observer ? 1 : 0,
      pendingFrames: this.frame === null ? 0 : 1,
      framesRendered: this.framesRendered,
      rebuilds: this.rebuildCount,
      contextLosses: this.contextLossCount,
      contextRestores: this.contextRestoreCount,
      disposedGeometries: this.disposedGeometries,
      disposedMaterials: this.disposedMaterials,
      disposedRenderers: this.disposedRenderers,
      renderFailures: this.renderFailures,
      gpuGeometries: this.renderer?.info?.memory.geometries ?? null,
      gpuTextures: this.renderer?.info?.memory.textures ?? null,
      camera: {
        position: this.camera.position.toArray(),
        target: this.target.toArray(),
        aspect: this.camera.aspect,
      },
    };
  }

  setProject(project: Project3D): ProfileResult {
    if (this.disposed) return failure('Viewport is disposed.');
    const profile = checkNativeProfile(project);
    const sameProject = this.snapshot?.id === project.id;
    this.cancelRender();
    this.releaseControls();
    this.releaseGraph();
    this.fault = null;
    if (!profile.ok) {
      this.snapshot = null;
      this.fault = { state: 'unsupported', reason: profile.reason };
      this.releaseRuntime();
      this.publish();
      return profile;
    }
    this.snapshot = cloneProject(project);
    if (!sameProject) this.fitPending = true;
    if (!this.suspended && !this.contextLost) {
      if (!this.ensureRuntime() || !this.rebuild())
        return failure(this.status.reason ?? 'Viewport construction failed.');
      if (!this.restoreView()) return failure(this.status.reason ?? 'Camera construction failed.');
    }
    this.syncActivity();
    return { ok: true };
  }

  resize(width?: number, height?: number, pixelRatio?: number): void {
    if (this.disposed) return;
    const bounds = this.host.getBoundingClientRect();
    const nextWidth = width ?? bounds.width;
    const nextHeight = height ?? bounds.height;
    const nextRatio = pixelRatio ?? this.document.defaultView?.devicePixelRatio ?? 1;
    if (![nextWidth, nextHeight, nextRatio].every(Number.isFinite)) return;
    this.width = Math.max(1, Math.floor(nextWidth));
    this.height = Math.max(1, Math.floor(nextHeight));
    this.pixelRatio = Math.min(2, Math.max(0.5, nextRatio));
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer?.setPixelRatio(this.pixelRatio);
    this.renderer?.setSize(this.width, this.height, false);
    this.requestRender();
  }

  resetCamera(): void {
    this.fitCamera();
  }

  /** Discrete accessible controls share the pointer camera without owning another event loop. */
  cameraAction(action: NativeCameraAction): ProfileResult {
    if (!this.canRender() || !this.controls?.enabled)
      return failure('Camera actions require an active native viewport.');
    const target = this.controls.target.clone();
    const position = this.camera.position.clone();
    const offset = position.clone().sub(target);
    const distance = offset.length();
    if (
      ![...position.toArray(), ...target.toArray(), distance].every(float32Finite) ||
      distance <= 0
    )
      return failure('The camera requires a finite position and a separate target.');
    const angle = Math.PI / 12;
    switch (action) {
      case 'orbit-left':
      case 'orbit-right':
      case 'orbit-up':
      case 'orbit-down': {
        const spherical = new Spherical().setFromVector3(offset);
        if (action === 'orbit-left') spherical.theta -= angle;
        if (action === 'orbit-right') spherical.theta += angle;
        if (action === 'orbit-up') spherical.phi -= angle;
        if (action === 'orbit-down') spherical.phi += angle;
        spherical.phi = Math.min(Math.PI - 0.0001, Math.max(0.0001, spherical.phi));
        position.copy(target).add(new Vector3().setFromSpherical(spherical));
        break;
      }
      case 'pan-left':
      case 'pan-right':
      case 'pan-up':
      case 'pan-down': {
        const direction = offset.normalize();
        const right = new Vector3().crossVectors(this.camera.up, direction);
        if (right.lengthSq() < 1e-12) right.set(1, 0, 0);
        right.normalize();
        const up = new Vector3().crossVectors(direction, right).normalize();
        const movement = action === 'pan-left' || action === 'pan-right' ? right : up;
        const sign = action === 'pan-left' || action === 'pan-down' ? -1 : 1;
        movement.multiplyScalar(distance * 0.1 * sign);
        position.add(movement);
        target.add(movement);
        break;
      }
      case 'zoom-in':
      case 'zoom-out': {
        const minimum = this.camera.near * 2;
        const maximum = this.camera.far / 2;
        if (![minimum, maximum].every(float32Finite) || minimum <= 0 || maximum < minimum)
          return failure('The camera requires a finite zoom range.');
        const nextDistance = Math.min(
          maximum,
          Math.max(minimum, distance * (action === 'zoom-in' ? 1 / 1.2 : 1.2)),
        );
        position.copy(target).add(offset.multiplyScalar(nextDistance / distance));
        break;
      }
      default:
        return failure('Unknown native camera action.');
    }
    if (
      ![...position.toArray(), ...target.toArray()].every(float32Finite) ||
      position.distanceToSquared(target) === 0
    )
      return failure('The camera action is outside the finite Float32 evaluation profile.');
    this.camera.position.copy(position);
    this.target.copy(target);
    this.camera.lookAt(target);
    this.controls.target.copy(target);
    this.controls.update();
    this.requestRender();
    return { ok: true };
  }

  fitCamera(): void {
    if (this.disposed || !this.graph) return;
    const bounds = new Box3().setFromObject(this.graph.root);
    const fit = fitPerspectiveBounds(
      bounds.isEmpty()
        ? { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }
        : { min: bounds.min.toArray() as Vec3, max: bounds.max.toArray() as Vec3 },
      this.camera.aspect,
    );
    this.camera.position.fromArray(fit.position);
    this.camera.near = fit.near;
    this.camera.far = fit.far;
    this.camera.updateProjectionMatrix();
    this.target.fromArray(fit.target);
    this.fitPending = false;
    this.camera.lookAt(this.target);
    if (this.controls) {
      this.controls.target.copy(this.target);
      this.controls.update();
    }
    this.requestRender();
  }

  setHidden(hidden: boolean): void {
    if (!this.disposed) {
      this.hidden = hidden;
      this.syncActivity();
    }
  }
  setFrozen(frozen: boolean): void {
    if (!this.disposed) {
      this.frozen = frozen;
      this.syncActivity();
    }
  }

  suspend(contract: SuspensionContract): ProfileResult {
    const checked = this.checkSuspension(contract);
    if (!checked.ok) return checked;
    this.suspension = { projectId: this.snapshot!.id, contract: { ...contract } };
    this.suspended = true;
    this.releaseRuntime();
    this.publish();
    return { ok: true };
  }

  resume(contract?: SuspensionContract): ProfileResult {
    if (this.disposed) return failure('Viewport is disposed.');
    if (!this.suspended) return failure('Viewport is not suspended.');
    const supplied =
      contract ??
      (this.suspension?.projectId === this.snapshot?.id ? this.suspension?.contract : undefined);
    if (!supplied)
      return failure(
        'The current project requires a matching saved revision and complete sources.',
      );
    const checked = this.checkSuspension(supplied);
    if (!checked.ok) return checked;
    this.suspension = { projectId: this.snapshot!.id, contract: { ...supplied } };
    this.suspended = false;
    this.contextLost = false;
    this.fault = null;
    if (!this.ensureRuntime() || !this.rebuild() || !this.restoreView()) {
      this.suspended = true;
      this.publish();
      return failure(this.status.reason ?? 'Viewport restoration failed.');
    }
    this.syncActivity();
    return { ok: true };
  }

  async capturePng(): Promise<Blob> {
    if (!this.canRender()) throw new Error('PNG capture requires an active native viewport.');
    this.cancelRender();
    if (!this.renderNow() || !this.element)
      throw new Error('The native viewport could not render a PNG.');
    const canvas = this.element;
    // Read in the same task as render; no permanent preserveDrawingBuffer allocation.
    return new Promise<Blob>((resolve, reject) => {
      try {
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Canvas PNG encoding failed.'))),
          'image/png',
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseRuntime();
    this.observer?.disconnect();
    this.observer = null;
    this.cleanup.splice(0).forEach((remove) => remove());
    this.scene.clear();
    this.snapshot = null;
    this.suspension = null;
    this.publish();
  }

  private checkSuspension(contract: SuspensionContract): ProfileResult {
    if (this.disposed || !this.snapshot) return failure('A live canonical project is required.');
    if (
      !Number.isSafeInteger(contract.currentRevision) ||
      contract.currentRevision < 0 ||
      contract.persistedRevision !== contract.currentRevision ||
      contract.currentRevision !== this.snapshot.revision
    )
      return failure(
        'GPU pause/resume requires the same persisted, current, and displayed revision.',
      );
    if (contract.sourcesComplete !== true)
      return failure('Complete reconstruction sources must be confirmed before GPU pause/resume.');
    return { ok: true };
  }

  private publish(): void {
    const status = this.status;
    const key = JSON.stringify(status);
    if (key !== this.lastStatus) {
      this.lastStatus = key;
      this.options.onStatus?.(status);
    }
  }

  private listen(target: EventTarget, type: string, callback: EventListener, canvas = false): void {
    target.addEventListener(type, callback);
    this.listenerCount++;
    (canvas ? this.canvasCleanup : this.cleanup).push(() => {
      target.removeEventListener(type, callback);
      this.listenerCount--;
    });
  }

  private ensureRuntime(): boolean {
    if (this.renderer) return true;
    const canvas = this.document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Native 3D evaluation viewport');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.element = canvas;
    this.host.appendChild(canvas);
    try {
      const context = canvas.getContext('webgl2', { antialias: true });
      if (!context) {
        this.fault = {
          state: 'unavailable',
          reason:
            'WebGL2 is unavailable. The canonical project and backup path do not require GPU rendering.',
        };
        this.releaseRuntime();
        this.publish();
        return false;
      }
      this.context = context;
      this.renderer = this.dependencies.createRenderer(canvas, context);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(this.width, this.height, false);
      this.listen(
        canvas,
        'webglcontextlost',
        (event) => {
          event.preventDefault();
          this.contextLost = true;
          this.contextLossCount++;
          this.syncActivity();
        },
        true,
      );
      this.listen(
        canvas,
        'webglcontextrestored',
        () => {
          if (this.disposed || this.suspended) return;
          this.contextRestoreCount++;
          this.releaseRuntime();
          this.contextLost = false;
          this.fault = null;
          if (this.ensureRuntime() && this.rebuild() && this.restoreView()) this.syncActivity();
        },
        true,
      );
      this.listen(
        canvas,
        'pointerdown',
        (event) => this.pointers.add((event as PointerEvent).pointerId),
        true,
      );
      const forgetPointer = (event: Event) => {
        this.pointers.delete((event as PointerEvent).pointerId);
      };
      this.listen(canvas, 'pointerup', forgetPointer, true);
      this.listen(canvas, 'pointercancel', forgetPointer, true);
      return true;
    } catch (error) {
      this.fault = {
        state: 'unavailable',
        reason: `WebGL2 initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
      this.releaseRuntime();
      this.publish();
      return false;
    }
  }

  private rebuild(): boolean {
    this.releaseGraph();
    if (!this.snapshot) return true;
    try {
      this.graph = buildNativeGraph(this.snapshot);
      this.scene.add(this.graph.root);
      this.rebuildCount++;
      return true;
    } catch (error) {
      this.fault = {
        state: 'error',
        reason: `Native scene construction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
      this.releaseRuntime();
      this.publish();
      return false;
    }
  }

  private restoreView(): boolean {
    try {
      if (this.fitPending) this.fitCamera();
      else if (this.graph) {
        const bounds = new Box3().setFromObject(this.graph.root);
        if (!bounds.isEmpty()) {
          const radius = Math.max(0.01, bounds.getSize(new Vector3()).length() / 2);
          const distance = this.camera.position.distanceTo(bounds.getCenter(new Vector3()));
          const far = distance + radius * 100;
          if (!float32Finite(far))
            throw new Error('Camera clipping is outside the finite Float32 evaluation profile.');
          this.camera.near = Math.max(
            0.00001,
            Math.min(radius / 1000, Math.max(0.00002, distance - radius) / 2),
          );
          this.camera.far = far;
          this.camera.updateProjectionMatrix();
        }
      }
      return true;
    } catch (error) {
      this.fault = {
        state: 'error',
        reason: `Native camera construction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
      this.releaseRuntime();
      this.publish();
      return false;
    }
  }

  private canRender(): boolean {
    return this.status.state === 'active' && this.renderer !== null && this.graph !== null;
  }
  private readonly onControlsChange = () => {
    if (this.controls) this.target.copy(this.controls.target);
    this.requestRender();
  };

  private syncActivity(): void {
    if (this.canRender() && this.element) {
      if (!this.controls) {
        this.controls = this.dependencies.createControls(this.camera, this.element);
        this.controls.enableDamping = false;
        this.controls.autoRotate = false;
        this.controls.target.copy(this.target);
        this.controls.update();
        this.controls.addEventListener('change', this.onControlsChange);
        this.listenerCount++;
      }
      this.requestRender();
    } else {
      this.cancelRender();
      this.releaseControls();
    }
    this.publish();
  }

  private requestRender(): void {
    if (!this.canRender() || this.frame !== null) return;
    this.frame = this.dependencies.requestFrame(() => {
      this.frame = null;
      this.renderNow();
    });
  }
  private cancelRender(): void {
    if (this.frame !== null) {
      this.dependencies.cancelFrame(this.frame);
      this.frame = null;
    }
  }
  private renderNow(): boolean {
    if (!this.canRender()) return false;
    try {
      this.renderer!.render(this.scene, this.camera);
      if (this.contextLost) return false;
      this.framesRendered++;
      return true;
    } catch (error) {
      this.renderFailures++;
      this.fault = {
        state: 'error',
        reason: `Native rendering failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
      this.releaseRuntime();
      this.publish();
      return false;
    }
  }

  private releaseControls(): void {
    if (this.controls) {
      this.target.copy(this.controls.target);
      this.controls.enabled = false;
      this.controls.removeEventListener('change', this.onControlsChange);
      this.listenerCount--;
      this.controls.dispose();
      this.controls = null;
    }
    for (const pointer of this.pointers)
      if (this.element?.hasPointerCapture(pointer)) this.element.releasePointerCapture(pointer);
    this.pointers.clear();
  }
  private releaseGraph(): void {
    if (!this.graph) return;
    this.disposedGeometries += this.graph.geometries.length;
    this.disposedMaterials += this.graph.materials.length;
    this.graph.dispose();
    this.graph = null;
  }
  private releaseRuntime(): void {
    this.cancelRender();
    this.releaseControls();
    this.releaseGraph();
    this.canvasCleanup.splice(0).forEach((remove) => remove());
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
      this.disposedRenderers++;
    } else this.context?.getExtension('WEBGL_lose_context')?.loseContext();
    this.context = null;
    this.contextLost = false;
    this.element?.remove();
    this.element = null;
  }
}
