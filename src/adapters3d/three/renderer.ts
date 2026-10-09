import type { NativeViewportResult } from '../../core3d/ports/renderPort';
import type { AnimationBinding } from '../../core3d/ports/animationPort';
import type { RigPoseBinding } from '../../core3d/ports/rigPosePort';
import { evaluateRigPose } from '../../core3d/rig/pose';
import { validateSkinProfile } from '../../core3d/rig/profile';
import { isNodeVisible } from '../../core3d/model/editability';
/** Native-static Three adapter. Lazy product use follows the scoped G03 evidence record. */
import {
  BoxGeometry,
  SphereGeometry,
  CapsuleGeometry,
  Bone,
  Skeleton,
  SkinnedMesh,
  Matrix4,
  Uint16BufferAttribute,
  AmbientLight,
  AxesHelper,
  Box3,
  Box3Helper,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  GridHelper,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  RGBAFormat,
  Scene,
  Spherical,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NativeEditController } from './editController';
import { nativeTransformEvaluator } from './transformMath';
import type { NativeEditBinding, NativeEditState } from '../../core3d/ports/editPort';
import {
  cloneProject,
  validateProject,
  type Project3D,
  type Vec3,
} from '../../core3d/model/project';
import { transformPoint, worldMatrix } from '../../core3d/model/coordinates';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import { reserveNativeTextureBytes } from '../../core3d/model/textureResources';

import type {
  NativeViewportResult as ProfileResult,
  NativeCameraAction,
  NativeCameraState,
  NativeCameraPreset,
  NativeViewOptions,
  NativeTextureSnapshot,
  NativeViewportStatus as ViewportStatus,
  NativeViewportSuspensionContract as SuspensionContract,
} from '../../core3d/ports/renderPort';
export type { NativeCameraAction } from '../../core3d/ports/renderPort';
type InspectionCamera = PerspectiveCamera | OrthographicCamera;

interface RendererPort {
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: InspectionCamera): void;
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
  disconnect?(): void;
  connect?(canvas: HTMLCanvasElement): void;
}
interface ResizePort {
  observe(target: Element): void;
  disconnect(): void;
}
/** Injectable ownership boundaries allow lifecycle tests without pretending to test a GPU. */
export interface NativeViewportDependencies {
  createRenderer(canvas: HTMLCanvasElement, context: WebGL2RenderingContext): RendererPort;
  createControls(camera: InspectionCamera, canvas: HTMLCanvasElement): ControlsPort;
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
const defaultViewOptions = (): NativeViewOptions => ({
  shading: 'material',
  background: 'dark',
  lighting: 'studio',
  grid: false,
  axes: false,
  bounds: false,
});
const defaultDirection = () => new Vector3(1, 0.75, 1).normalize();
const fallbackBounds = () => new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
// A point far from the origin still needs a representable camera offset.
const boundsRadius = (bounds: Box3) =>
  Math.max(
    0.01,
    bounds.getSize(new Vector3()).length() / 2,
    Math.max(...bounds.min.toArray().map(Math.abs), ...bounds.max.toArray().map(Math.abs)) *
      Number.EPSILON *
      64,
  );

/** Native-only subset of compact-evaluation-0; not an import/decoder security profile. */
export const NATIVE_EVALUATION_LIMITS = Object.freeze({
  nodes: 1000,
  depth: 64,
  vertices: 100_000,
  triangles: 100_000,
  expandedCorners: 300_000,
});

/** Native contract checking only: no file loading, decoding, URL access, or import limits. */
export function checkNativeProfile(
  project: Project3D,
  textures?: NativeTextureSnapshot,
): ProfileResult {
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
  try {
    const meshIds = new Set<string>();
    for (const skin of project.skins) {
      if (meshIds.has(skin.meshId)) return failure('Multiple skins on one mesh are unsupported.');
      meshIds.add(skin.meshId);
      validateSkinProfile(
        skin,
        project.meshes.find((mesh) => mesh.id === skin.meshId),
        project.nodes,
      );
      if (skin.joints.length > 65535) return failure('Skin joint count exceeds Uint16 indices.');
      if (
        skin.joints.some(
          (joint) => project.nodes.find((node) => node.id === joint.nodeId)?.meshId !== undefined,
        )
      )
        return failure('A joint with its own mesh needs an explicit joint-only conversion.');
    }
    if (project.skins.length) evaluateRigPose(project, []);
  } catch (error) {
    return failure(
      `Invalid native skin: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (project.meshes.some((mesh) => mesh.faces.some((face) => face.vertexIds.length !== 3)))
    unsupported.push('non-triangle faces');
  if (unsupported.length)
    return failure(`This isolated native viewport does not support ${unsupported.join(', ')}.`);
  // Validate every canonical reference, including unassigned materials. Never hide a missing
  // source behind a factor-only fallback. Extra prepared entries are not retained or allocated.
  let totalPixels = 0;
  const textureIds = new Set(project.materials.flatMap((material) => material.textureBlobId ?? []));
  for (const id of textureIds) {
    const image = textures?.get(id);
    if (!image) return failure(`Native textures require a prepared RGBA8 source for ${id}.`);
    if (
      !Number.isSafeInteger(image.width) ||
      !Number.isSafeInteger(image.height) ||
      image.width <= 0 ||
      image.height <= 0 ||
      image.width > NATIVE_TEXTURE_PROFILE.maxEdge ||
      image.height > NATIVE_TEXTURE_PROFILE.maxEdge
    )
      return failure('Native texture dimensions are outside the prepared image profile.');
    const pixels = image.width * image.height;
    totalPixels += pixels;
    if (totalPixels > NATIVE_TEXTURE_PROFILE.maxTotalPixels)
      return failure('Native unique texture pixel count exceeded.');
    if (!(image.pixels instanceof Uint8Array) || image.pixels.byteLength !== pixels * 4)
      return failure('Native textures require an exact RGBA8 byte count.');
  }
  const texturedMaterials = new Set(
    project.materials
      .filter((material) => material.textureBlobId !== undefined)
      .map(({ id }) => id),
  );
  for (const mesh of project.meshes) {
    if (mesh.vertices.some((vertex) => !vertex.position.every(float32Finite)))
      return failure('Geometry is outside the finite Float32 evaluation profile.');
    for (const face of mesh.faces) {
      if (face.materialId && texturedMaterials.has(face.materialId) && !face.uv)
        return failure('Native textured faces require complete finite corner UV0 attributes.');
      if (
        [...(face.uv ?? []), ...(face.normals ?? [])].some((value) => !value.every(float32Finite))
      )
        return failure('Corner attributes are outside the finite Float32 evaluation profile.');
    }
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
  /** One texture per rendered content hash, jointly owned until this graph is released. */
  textures: DataTexture[];
  /** The only pick/edit identity map; helpers never enter it. */
  objects: Map<string, Object3D>;
  skinnedMeshes: SkinnedMesh[];
  skeletons: Skeleton[];
  dispose(): void;
}

/** Stable IDs stay in canonical data; expanded GPU corners are disposable representations. */
export function buildNativeGraph(
  project: Project3D,
  textures?: NativeTextureSnapshot,
): NativeGraph {
  const profile = checkNativeProfile(project, textures);
  if (!profile.ok) throw new Error(profile.reason);
  const root = new Group();
  const geometries: BufferGeometry[] = [];
  const materials: MeshStandardMaterial[] = [];
  const graphTextures: DataTexture[] = [];
  const textureReservations: (() => void)[] = [];
  const nodes = new Map<string, Object3D>();
  const skeletons: Skeleton[] = [];
  const skinnedMeshes: SkinnedMesh[] = [];
  let disposed = false;
  const graph: NativeGraph = {
    root,
    geometries,
    materials,
    textures: graphTextures,
    objects: nodes,
    skeletons,
    skinnedMeshes,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      root.clear();
      nodes.clear();
      skeletons.forEach((skeleton) => skeleton.dispose());
      skeletons.length = 0;
      skinnedMeshes.length = 0;
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      graphTextures.forEach((texture) => {
        texture.dispose();
        texture.image.data = null;
      });
      textureReservations.splice(0).forEach((release) => release());
    },
  };
  try {
    const texturesById = new Map<string, { texture: DataTexture; transparent: boolean }>();
    function textureFor(id: string) {
      const existing = texturesById.get(id);
      if (existing) return existing;
      const image = textures!.get(id)!;
      // One owned upload array plus RGBA8 GPU storage; no mip levels in this profile.
      textureReservations.push(
        reserveNativeTextureBytes('native graph upload and GPU', image.pixels.byteLength * 2),
      );
      const pixels = new Uint8Array(image.pixels.byteLength);
      const rowBytes = image.width * 4;
      // Canonical UV0 starts at the lower left; prepared RGBA starts at the upper left.
      // Reverse rows in the owned copy, so raw typed-array uploads use explicit flipY=false.
      for (let row = 0; row < image.height; row++)
        pixels.set(
          image.pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
          (image.height - row - 1) * rowBytes,
        );
      const texture = new DataTexture(
        pixels,
        image.width,
        image.height,
        RGBAFormat,
        UnsignedByteType,
      );
      graphTextures.push(texture);
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false;
      texture.premultiplyAlpha = false;
      // The initial bounded profile uses bilinear sampling without mip allocation.
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      let transparent = false;
      for (let index = 3; index < pixels.length && !transparent; index += 4)
        transparent = pixels[index] < 255;
      const prepared = { texture, transparent };
      texturesById.set(id, prepared);
      return prepared;
    }
    const materialIndices = new Map<string | undefined, number>();
    function materialIndex(id?: string): number {
      const existing = materialIndices.get(id);
      if (existing !== undefined) return existing;
      const source = project.materials.find((material) => material.id === id);
      const color = source?.baseColor ?? [0.55, 0.65, 0.8, 1];
      const texture = source?.textureBlobId ? textureFor(source.textureBlobId) : undefined;
      const alphaMode = source?.alphaMode ?? 'LEGACY_AUTO';
      const emissive = source?.emissiveColor ?? [0, 0, 0];
      const material = new MeshStandardMaterial({
        color: new Color().setRGB(color[0], color[1], color[2]),
        opacity: alphaMode === 'OPAQUE' ? 1 : color[3],
        transparent:
          alphaMode === 'BLEND' ||
          (alphaMode === 'LEGACY_AUTO' && (color[3] < 1 || texture?.transparent === true)),
        alphaTest: alphaMode === 'MASK' ? (source?.alphaCutoff ?? 0.5) : 0,
        side: source?.doubleSided ? DoubleSide : FrontSide,
        emissive: new Color().setRGB(...emissive),
        map: texture?.texture ?? null,
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
      const skin = project.skins.find((value) => value.meshId === mesh.id);
      const weights = new Map(skin?.weights.map((value) => [value.vertexId, value]));
      const jointIndices = new Map(skin?.joints.map((joint, index) => [joint.nodeId, index]));
      const skinIndices: number[] = [],
        skinWeights: number[] = [];
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
          if (skin) {
            const assignment = weights.get(face.vertexIds[index])!;
            for (let influence = 0; influence < 4; influence++) {
              skinIndices.push(
                influence < assignment.jointIds.length
                  ? jointIndices.get(assignment.jointIds[influence])!
                  : 0,
              );
              skinWeights.push(assignment.values[influence] ?? 0);
            }
          }
          normals.push(...(face.normals?.[index] ?? normal.toArray()));
          uvs.push(...(face.uv?.[index] ?? [0, 0]));
        });
      }
      if (skin) {
        geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4));
        geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4));
      }
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      geometryById.set(mesh.id, geometry);
    }
    const jointIds = new Set(
      project.skins.flatMap((skin) => skin.joints.map((joint) => joint.nodeId)),
    );
    for (const node of project.nodes) {
      const skin = project.skins.find((value) => value.meshId === node.meshId);
      const object = jointIds.has(node.id)
        ? new Bone()
        : node.meshId === undefined
          ? new Group()
          : skin
            ? new SkinnedMesh(geometryById.get(node.meshId)!, materials)
            : new Mesh(geometryById.get(node.meshId)!, materials);
      object.name = node.name;
      object.visible = node.visible !== false;
      object.userData = { canonicalNodeId: node.id };
      object.position.fromArray(node.transform.translation);
      object.quaternion.fromArray(node.transform.rotation);
      object.scale.fromArray(node.transform.scale);
      nodes.set(node.id, object);
    }
    for (const node of project.nodes)
      (node.parentId === null ? root : nodes.get(node.parentId)!).add(nodes.get(node.id)!);
    root.updateMatrixWorld(true);
    for (const node of project.nodes) {
      const skin = project.skins.find((value) => value.meshId === node.meshId);
      if (!skin) continue;
      const object = nodes.get(node.id) as SkinnedMesh;
      const skeleton = new Skeleton(
        skin.joints.map((joint) => nodes.get(joint.nodeId) as Bone),
        skin.joints.map((joint) => new Matrix4().fromArray(joint.inverseBind)),
      );
      skeletons.push(skeleton);
      skinnedMeshes.push(object);
      object.bind(skeleton, object.matrixWorld);
      skeleton.update();
      object.computeBoundingBox();
      object.computeBoundingSphere();
    }
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
    Math.max(...bounds.min.map(Math.abs), ...bounds.max.map(Math.abs)) * Number.EPSILON * 64,
  );
  const halfVertical = (fovDegrees * Math.PI) / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const distance = (radius / Math.sin(Math.min(halfVertical, halfHorizontal))) * 1.2;
  const direction = defaultDirection();
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
  private animation: AnimationBinding | null = null;
  private animationUnsubscribe: (() => void) | null = null;
  private rigPose: RigPoseBinding | null = null;
  private poseUnsubscribe: (() => void) | null = null;
  private readonly scene = new Scene();
  private camera: InspectionCamera = new PerspectiveCamera(45, 1, 0.01, 1000);
  private readonly target = new Vector3();
  private fov = 45;
  private span = 4;
  private viewOptions = defaultViewOptions();
  private readonly ambient = new AmbientLight(0xffffff, 1.5);
  private readonly light = new DirectionalLight(0xffffff, 3);
  private inspectionMaterial: MeshStandardMaterial | MeshBasicMaterial | null = null;
  private helpers: (GridHelper | AxesHelper | Box3Helper)[] = [];
  private disposedHelperGeometries = 0;
  private disposedHelperMaterials = 0;
  private disposedInspectionMaterials = 0;
  private readonly dependencies: NativeViewportDependencies;
  private readonly document: Document;
  private readonly cleanup: (() => void)[] = [];
  private readonly canvasCleanup: (() => void)[] = [];
  private readonly pointers = new Set<number>();
  private observer: ResizePort | null = null;
  private renderer: RendererPort | null = null;
  private context: WebGL2RenderingContext | null = null;
  private controls: ControlsPort | null = null;
  private controlsListening = false;
  private graph: NativeGraph | null = null;
  private editBinding: NativeEditBinding | null = null;
  private editUnsubscribe: (() => void) | null = null;
  private editController: NativeEditController | null = null;
  private readonly selectionHelpers = new Map<string, Box3Helper[]>();
  private runtimeGeneration = 0;
  private captureVersion = 0;
  private editSequence = -1;
  private applyingEdit = false;
  private previewApplied = false;
  private snapshot: Project3D | null = null;
  private textureSnapshot: NativeTextureSnapshot | undefined;
  private releaseTextureReservation: (() => void) | null = null;
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
  private disposedTextures = 0;
  private disposedRenderers = 0;
  private renderFailures = 0;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private fitPending = true;
  private resetPending = true;
  private clippingPending = true;

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
    this.scene.add(this.ambient);
    this.light.position.set(3, 5, 4);
    this.scene.add(this.light);
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
      textures: this.graph?.textures.length ?? 0,
      preparedTextures: this.textureSnapshot?.size ?? 0,
      preparedTextureBytes: [...(this.textureSnapshot?.values() ?? [])].reduce(
        (bytes, image) => bytes + image.pixels.byteLength,
        0,
      ),
      helperGeometries: this.helpers.length,
      helperMaterials: this.helpers.length,
      inspectionMaterials: this.inspectionMaterial ? 1 : 0,
      disposedHelperGeometries: this.disposedHelperGeometries,
      disposedHelperMaterials: this.disposedHelperMaterials,
      disposedInspectionMaterials: this.disposedInspectionMaterials,
      controls: this.controls ? 1 : 0,
      editing: this.editController?.diagnostics ?? null,
      editSubscriptions: this.editUnsubscribe ? 1 : 0,
      selectionHelpers: [...this.selectionHelpers.values()].reduce(
        (sum, value) => sum + value.length,
        0,
      ),
      previewApplied: this.previewApplied,
      runtimeGeneration: this.runtimeGeneration,
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
      disposedTextures: this.disposedTextures,
      disposedRenderers: this.disposedRenderers,
      renderFailures: this.renderFailures,
      gpuGeometries: this.renderer?.info?.memory.geometries ?? null,
      gpuTextures: this.renderer?.info?.memory.textures ?? null,
      camera: {
        ...this.getCamera(),
        aspect: this.width / this.height,
      },
      viewOptions: this.getViewOptions(),
    };
  }

  setProject(project: Project3D, textures?: NativeTextureSnapshot): ProfileResult {
    if (this.disposed) return failure('Viewport is disposed.');
    this.runtimeGeneration++;
    const profile = checkNativeProfile(project, textures);
    const sameProject = this.snapshot?.id === project.id;
    this.cancelRender();
    this.releaseControls();
    this.releaseGraph();
    this.editSequence = -1;
    this.fault = null;
    this.releaseTextureSnapshot();
    if (!profile.ok) {
      this.snapshot = null;
      this.fault = { state: 'unsupported', reason: profile.reason };
      this.releaseRuntime();
      this.publish();
      return profile;
    }
    try {
      this.snapshot = cloneProject(project);
      const textureIds = new Set(
        project.materials.flatMap((material) => material.textureBlobId ?? []),
      );
      if (textureIds.size)
        this.releaseTextureReservation = reserveNativeTextureBytes(
          'native viewport retained source',
          [...textureIds].reduce((bytes, id) => bytes + textures!.get(id)!.pixels.byteLength, 0),
        );
      this.textureSnapshot = new Map(
        [...textureIds].map((id) => {
          const image = textures!.get(id)!;
          return [
            id,
            { width: image.width, height: image.height, pixels: new Uint8Array(image.pixels) },
          ];
        }),
      );
    } catch (error) {
      this.snapshot = null;
      this.releaseTextureSnapshot();
      this.fault = {
        state: 'error',
        reason: `Native source snapshot failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
      this.releaseRuntime();
      this.publish();
      return failure(this.fault.reason!);
    }
    this.clippingPending = true;
    if (!sameProject) {
      this.fitPending = true;
      this.resetPending = true;
    }
    if (!this.suspended && !this.contextLost) {
      if (!this.ensureRuntime() || !this.rebuild())
        return failure(this.status.reason ?? 'Viewport construction failed.');
      if (!this.restoreView()) return failure(this.status.reason ?? 'Camera construction failed.');
    }
    this.syncActivity();
    const status = this.status;
    return status.state === 'error' || status.state === 'unavailable'
      ? failure(status.reason ?? 'Viewport construction failed.')
      : { ok: true };
  }

  bindAnimation(binding: AnimationBinding | null): void {
    if (this.disposed || this.animation === binding) return;
    this.animationUnsubscribe?.();
    this.animation?.cancel('再生表示接続が変わりました。');
    this.animation?.setAvailable(false);
    this.animation = binding;
    this.animation?.setAvailable(this.canRender());
    this.animationUnsubscribe = binding?.subscribe(() => this.applyRigPose()) ?? null;
    this.applyRigPose();
  }
  bindRigPose(binding: RigPoseBinding | null): void {
    if (this.disposed || this.rigPose === binding) return;
    this.poseUnsubscribe?.();
    this.rigPose?.cancel('pose表示接続が変わりました。');
    this.rigPose = binding;
    this.poseUnsubscribe = binding?.subscribe(() => this.applyRigPose()) ?? null;
    this.applyRigPose();
  }

  private gamePreviewEnabled = false;
  private gamePreviewError: string | null = null;
  private gameHelpers: {
    object: Object3D;
    nodeId: string | null;
    local: Matrix4;
    extent: number;
    dispose: () => void;
  }[] = [];
  setGamePreview(visible: boolean): NativeViewportResult {
    if (this.disposed) return { ok: false, reason: 'Viewport disposed' };
    if (visible === this.gamePreviewEnabled) return { ok: true };
    this.gamePreviewEnabled = visible;
    this.gamePreviewError = null;
    try {
      this.rebuildGamePreview();
      this.requestRender();
      return { ok: true };
    } catch (error) {
      this.gamePreviewEnabled = false;
      this.gamePreviewError = String(error);
      this.clearGamePreview();
      return { ok: false, reason: String(error) };
    }
  }
  private clearGamePreview() {
    for (const entry of this.gameHelpers) {
      entry.object.removeFromParent();
      entry.dispose();
    }
    this.gameHelpers = [];
  }
  private rebuildGamePreview() {
    this.clearGamePreview();
    if (!this.gamePreviewEnabled || !this.graph || !this.snapshot) return;
    const add = (
      object: Object3D,
      nodeId: string | null,
      transform: Project3D['nodes'][number]['transform'],
      dispose: () => void,
    ) => {
      object.matrixAutoUpdate = false;
      const local = new Matrix4().compose(
        new Vector3(...transform.translation),
        new Quaternion(...transform.rotation),
        new Vector3(...transform.scale),
      );
      if (!local.elements.every(float32Finite)) {
        dispose();
        throw new Error('Game preview exceeds Float32 range');
      }
      let extent = 0.5;
      if (object instanceof Mesh) {
        const array = object.geometry.getAttribute('position').array;
        for (const value of array) {
          if (!Number.isFinite(value)) {
            dispose();
            throw new Error('Game helper geometry exceeds Float32 range');
          }
          extent = Math.max(extent, Math.abs(value));
        }
      }
      this.gameHelpers.push({ object, nodeId, local, extent, dispose });
      this.scene.add(object);
    };
    for (const anchor of this.snapshot.game.anchors) {
      const axes = new AxesHelper(0.3);
      axes.name = 'Game anchor ' + anchor.id;
      add(axes, anchor.nodeId, anchor.transform, () => axes.dispose());
    }
    for (const collider of this.snapshot.game.colliders) {
      if ([...collider.size, collider.radius, collider.height].some((x) => !float32Finite(x)))
        throw new Error('Collider exceeds Float32 range');
      const geometry =
        collider.shape === 'box'
          ? new BoxGeometry(...collider.size)
          : collider.shape === 'sphere'
            ? new SphereGeometry(collider.radius, 12, 8)
            : new CapsuleGeometry(collider.radius, collider.height, 4, 8);
      const material = new MeshBasicMaterial({
        color: 0xffa500,
        wireframe: true,
        depthTest: false,
      });
      const object = new Mesh(geometry, material);
      object.name = 'Game collider ' + collider.id;
      add(object, collider.nodeId, collider.transform, () => {
        geometry.dispose();
        material.dispose();
      });
    }
    const origin = new AxesHelper(0.5);
    origin.name = 'Game origin';
    add(
      origin,
      null,
      { translation: this.snapshot.game.origin, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      () => origin.dispose(),
    );
    this.updateGamePreview();
    if (this.gamePreviewError) throw new Error(this.gamePreviewError);
  }
  private updateGamePreview() {
    for (const entry of this.gameHelpers) {
      const parent = entry.nodeId ? this.graph?.objects.get(entry.nodeId) : undefined;
      entry.object.matrix.copy(parent ? parent.matrixWorld : new Matrix4()).multiply(entry.local);
      if (
        !entry.object.matrix.elements.every(float32Finite) ||
        Math.max(...entry.object.matrix.elements.map(Math.abs)) * (entry.extent * 3 + 1) > 1e30
      ) {
        this.gamePreviewError = 'Game world transform exceeds Float32 range';
        this.gamePreviewEnabled = false;
        this.clearGamePreview();
        return;
      }
      entry.object.visible =
        !entry.nodeId || (!!this.snapshot && isNodeVisible(this.snapshot, entry.nodeId));
      entry.object.updateMatrixWorld(true);
    }
  }

  private applyRigPose(): void {
    if (!this.graph || !this.snapshot || this.disposed) return;
    this.restoreCanonicalTransforms();
    const state = this.animation?.state.active ? this.animation.state : this.rigPose?.state;
    if (
      state?.active &&
      state.projectId === this.snapshot.id &&
      state.revision === this.snapshot.revision
    ) {
      for (const { nodeId, transform } of state.updates) {
        const object = this.graph.objects.get(nodeId);
        if (!object) continue;
        object.position.fromArray(transform.translation);
        object.quaternion.fromArray(transform.rotation);
        object.scale.fromArray(transform.scale);
      }
    }
    this.graph.root.updateMatrixWorld(true);
    this.updateGamePreview();
    this.graph.skeletons.forEach((skeleton) => skeleton.update());
    this.graph.skinnedMeshes.forEach((mesh) => {
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
    });
    for (const helper of this.helpers)
      if (helper instanceof Box3Helper) helper.box.copy(this.modelBounds());
    if (this.editBinding)
      this.updateSelection(
        this.editBinding.state,
        this.editBinding.state.projectId === this.snapshot.id &&
          this.editBinding.state.revision === this.snapshot.revision,
      );
    this.captureVersion++;
    this.requestRender();
  }

  bindEditing(binding: NativeEditBinding | null): void {
    if (this.disposed || binding === this.editBinding) return;
    this.editUnsubscribe?.();
    this.editUnsubscribe = null;
    this.releaseEditing();
    if (this.editBinding) this.syncEditingBlocks(this.editBinding, true);
    this.restoreCanonicalTransforms();
    this.clearSelection();
    this.editBinding = binding;
    this.editSequence = -1;
    if (binding) {
      binding.setEvaluator(nativeTransformEvaluator);
      this.syncEditingBlocks(binding);
      this.editUnsubscribe = binding.subscribe(() => this.applyEditState());
      this.applyEditState();
      this.ensureEditing();
    }
    this.requestRender();
  }

  private ensureEditing(): void {
    if (
      this.editController ||
      !this.editBinding ||
      !this.controls ||
      !this.graph ||
      !this.element ||
      !this.canRender()
    )
      return;
    const identity = this.editBinding.state;
    if (identity.projectId !== this.snapshot?.id || identity.revision !== this.snapshot.revision)
      return;
    const graph = this.graph,
      canvas = this.element,
      orbit = this.controls;
    const generation = this.runtimeGeneration;
    try {
      this.editController = new NativeEditController({
        canvas,
        camera: this.camera,
        scene: this.scene,
        root: graph.root,
        binding: this.editBinding,
        orbit,
        document: this.document,
        window: this.document.defaultView ?? this.document,
        changed: () => this.requestRender(),
        isCurrent: () =>
          !this.disposed &&
          this.runtimeGeneration === generation &&
          this.graph === graph &&
          this.element === canvas &&
          this.controls === orbit,
        resetCameraGesture: () => {
          orbit.disconnect?.();
          orbit.connect?.(canvas);
        },
      });
      this.applyEditState();
    } catch (error) {
      this.fault = {
        state: 'error',
        reason: `Native editing construction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
      this.releaseRuntime();
      this.publish();
    }
  }

  /** Same-revision previews mutate only existing objects, never canonical data or GPU owners. */
  private applyEditState(): void {
    if (this.disposed || this.applyingEdit || !this.graph || !this.snapshot || !this.editBinding)
      return;
    const state = this.editBinding.state;
    if (state.sequence < this.editSequence) return;
    this.applyingEdit = true;
    try {
      this.restoreCanonicalTransforms();
      const matches =
        state.projectId === this.snapshot.id && state.revision === this.snapshot.revision;
      const preview = state.preview;
      if (
        matches &&
        preview &&
        state.active &&
        state.token &&
        preview.projectId === this.snapshot.id &&
        preview.baseRevision === this.snapshot.revision &&
        preview.generation === state.token.generation &&
        preview.sequence === state.sequence &&
        state.token.projectId === this.snapshot.id &&
        state.token.revision === this.snapshot.revision
      ) {
        for (const { id, transform } of preview.updates) {
          const object = this.graph.objects.get(id);
          if (!object) continue;
          object.position.fromArray(transform.translation);
          object.quaternion.fromArray(transform.rotation);
          object.scale.fromArray(transform.scale);
        }
        this.previewApplied = true;
      }
      this.editSequence = state.sequence;
      this.graph.root.updateMatrixWorld(true);
      this.updateGamePreview();
      if (this.rigPose?.state.active || this.animation?.state.active) this.applyRigPose();
      this.updateSelection(state, matches);
      this.requestRender();
    } finally {
      this.applyingEdit = false;
    }
  }

  private restoreCanonicalTransforms(): void {
    if (!this.graph || !this.snapshot) return;
    for (const node of this.snapshot.nodes) {
      const object = this.graph.objects.get(node.id);
      if (!object) continue;
      object.position.fromArray(node.transform.translation);
      object.quaternion.fromArray(node.transform.rotation);
      object.scale.fromArray(node.transform.scale);
    }
    this.graph.root.updateMatrixWorld(true);
    this.updateGamePreview();
    this.previewApplied = false;
  }

  private updateSelection(state: NativeEditState, matches: boolean): void {
    const selected = new Set(
      matches && this.snapshot
        ? state.context.selection.filter((id) => isNodeVisible(this.snapshot!, id))
        : [],
    );
    for (const [id, helpers] of this.selectionHelpers) {
      const count = id === state.context.activeId ? 2 : 1;
      if (!selected.has(id) || helpers.length !== count) {
        helpers.forEach((helper) => {
          helper.removeFromParent();
          helper.dispose();
        });
        this.selectionHelpers.delete(id);
      }
    }
    for (const id of selected) {
      const object = this.graph?.objects.get(id);
      if (!object) continue;
      const box = visibleBounds(object);
      if (box.isEmpty()) continue;
      let helpers = this.selectionHelpers.get(id);
      if (!helpers) {
        const active = id === state.context.activeId;
        helpers = Array.from(
          { length: active ? 2 : 1 },
          () => new Box3Helper(box.clone(), active ? 0xffd166 : 0x91c7ff),
        );
        helpers.forEach((helper) => {
          helper.name = active ? 'Active object selection' : 'Selected object';
          for (const material of Array.isArray(helper.material)
            ? helper.material
            : [helper.material])
            material.depthTest = false;
          helper.renderOrder = 1000;
          this.scene.add(helper);
        });
        this.selectionHelpers.set(id, helpers);
      }
      helpers.forEach((helper, index) =>
        helper.box.copy(box).expandByScalar(index ? boundsRadius(box) * 0.04 : 0),
      );
    }
  }

  private clearSelection(): void {
    for (const helpers of this.selectionHelpers.values())
      helpers.forEach((helper) => {
        helper.removeFromParent();
        helper.dispose();
      });
    this.selectionHelpers.clear();
  }

  private releaseEditing(): void {
    const controller = this.editController;
    this.editController = null;
    controller?.dispose();
    this.restoreCanonicalTransforms();
  }

  resize(width?: number, height?: number, pixelRatio?: number): void {
    if (this.disposed) return;
    const bounds = this.host.getBoundingClientRect();
    const nextWidth = width ?? bounds.width;
    const nextHeight = height ?? bounds.height;
    const nextRatio = pixelRatio ?? this.document.defaultView?.devicePixelRatio ?? 1;
    if (![nextWidth, nextHeight, nextRatio].every(Number.isFinite)) return;
    const widthValue = Math.max(1, Math.floor(nextWidth));
    const heightValue = Math.max(1, Math.floor(nextHeight));
    const projection = this.camera.clone();
    this.updateProjection(projection, widthValue / heightValue);
    if (
      ![
        ...projection.projectionMatrix.elements,
        ...projection.projectionMatrixInverse.elements,
      ].every(float32Finite)
    )
      return;
    this.captureVersion++;
    this.width = widthValue;
    this.height = heightValue;
    this.pixelRatio = Math.min(2, Math.max(0.5, nextRatio));
    this.updateProjection();
    this.renderer?.setPixelRatio(this.pixelRatio);
    this.renderer?.setSize(this.width, this.height, false);
    this.requestRender();
  }

  resetCamera(): void {
    if (!this.graph || this.disposed) return;
    const bounds = this.modelBounds();
    let result = this.fitBounds(bounds, defaultDirection(), new Vector3(0, 1, 0));
    // Recover even from an accepted but impractically narrow numeric field of view.
    if (!result.ok) result = this.fitBounds(bounds, defaultDirection(), new Vector3(0, 1, 0), 45);
    if (!result.ok) throw new Error(result.reason);
  }

  getCamera(): NativeCameraState {
    return {
      position: this.camera.position.toArray() as Vec3,
      target: this.target.toArray() as Vec3,
      up: this.camera.up.toArray() as Vec3,
      projection: this.camera instanceof OrthographicCamera ? 'orthographic' : 'perspective',
      fov: this.fov,
      span:
        this.camera instanceof OrthographicCamera
          ? (this.camera.top - this.camera.bottom) / this.camera.zoom
          : this.span,
    };
  }

  setCamera(state: NativeCameraState): ProfileResult {
    if (!this.canRender()) return failure('Camera edits require an active native viewport.');
    return this.applyCamera(state);
  }

  cameraPreset(preset: NativeCameraPreset): ProfileResult {
    if (!this.canRender()) return failure('Camera presets require an active native viewport.');
    const directions = { front: [0, 0, 1], right: [1, 0, 0], top: [0, 1, 0] } as const;
    if (!Object.hasOwn(directions, preset)) return failure('Unknown native camera preset.');
    return this.fitBounds(
      this.modelBounds(),
      new Vector3(...directions[preset]),
      new Vector3(0, preset === 'top' ? 0 : 1, preset === 'top' ? -1 : 0),
    );
  }

  focusNode(nodeId: string): ProfileResult {
    if (!this.canRender()) return failure('Focus requires an active native viewport.');
    let selected: Object3D | undefined;
    this.graph!.root.traverse((node) => {
      if (node.userData.canonicalNodeId === nodeId) selected = node;
    });
    if (this.snapshot && !isNodeVisible(this.snapshot, nodeId))
      return failure('The selected node is hidden.');
    if (!selected) return failure('The selected canonical node is not present.');
    const bounds = visibleBounds(selected);
    if (bounds.isEmpty())
      return failure('The selected node has no native geometry in its subtree.');
    return this.fitBounds(bounds, this.viewDirection());
  }

  getViewOptions(): NativeViewOptions {
    return { ...this.viewOptions };
  }

  setViewOptions(options: NativeViewOptions): ProfileResult {
    if (!this.canRender()) return failure('View options require an active native viewport.');
    if (
      !options ||
      !['material', 'solid', 'wireframe'].includes(options.shading) ||
      !['dark', 'light'].includes(options.background) ||
      !['studio', 'soft'].includes(options.lighting) ||
      ![options.grid, options.axes, options.bounds].every((value) => typeof value === 'boolean')
    )
      return failure('Valid native shading, background, lighting and helper options are required.');
    try {
      this.applyInspection(options);
    } catch (error) {
      return failure(
        `View construction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
    this.viewOptions = { ...options };
    this.captureVersion++;
    this.requestRender();
    return { ok: true };
  }

  /** Build and validate a temporary camera before changing any live camera or controls. */
  private applyCamera(state: NativeCameraState, preserveClipping = false): ProfileResult {
    if (
      !state ||
      !Array.isArray(state.position) ||
      !Array.isArray(state.target) ||
      state.position.length !== 3 ||
      state.target.length !== 3 ||
      ![...state.position, ...state.target, state.fov, state.span].every(
        (value) => typeof value === 'number' && float32Finite(value),
      ) ||
      !['perspective', 'orthographic'].includes(state.projection) ||
      state.fov <= 0 ||
      state.fov >= 180 ||
      state.span <= 0
    )
      return failure(
        'Finite position/target, 0 < field of view < 180, and a positive span are required.',
      );
    const position = new Vector3(...state.position);
    const target = new Vector3(...state.target);
    const direction = position.clone().sub(target);
    if (!float32Finite(direction.length()) || direction.lengthSq() === 0)
      return failure('The camera requires a finite position and a separate target.');
    if (
      state.up !== undefined &&
      (!Array.isArray(state.up) ||
        state.up.length !== 3 ||
        !state.up.every((value) => typeof value === 'number' && float32Finite(value)))
    )
      return failure('A finite screen-up vector is required.');
    direction.normalize();
    const up =
      state.up === undefined
        ? new Vector3(
            0,
            Math.abs(direction.y) > 1 - 1e-12 ? 0 : 1,
            Math.abs(direction.y) > 1 - 1e-12 ? -1 : 0,
          )
        : new Vector3(...state.up);
    // OrbitControls permits polar angles of 1e-6 rad (squared sine about 1e-12).
    if (
      !float32Finite(up.length()) ||
      up.lengthSq() === 0 ||
      new Vector3().crossVectors(up.clone().normalize(), direction).lengthSq() < 1e-20
    )
      return failure('Screen-up must be nonzero and separate from the viewing direction.');
    up.normalize();
    const bounds = this.modelBounds();
    const radius = boundsRadius(bounds);
    const distance = position.distanceTo(bounds.getCenter(new Vector3()));
    const near = preserveClipping
      ? this.camera.near
      : Math.max(0.00001, Math.min(radius / 1000, Math.max(0.00002, distance - radius) / 2));
    const far = preserveClipping ? this.camera.far : Math.max(distance + radius * 100, near * 2);
    const aspect = this.width / this.height;
    if (![near, far, state.span * aspect].every(float32Finite) || near <= 0 || far <= near)
      return failure('Camera clipping is outside the finite Float32 evaluation profile.');
    const next: InspectionCamera =
      state.projection === 'perspective'
        ? new PerspectiveCamera(state.fov, aspect, near, far)
        : new OrthographicCamera(
            (-state.span * aspect) / 2,
            (state.span * aspect) / 2,
            state.span / 2,
            -state.span / 2,
            near,
            far,
          );
    next.position.copy(position);
    next.up.copy(up);
    next.lookAt(target);
    next.updateMatrixWorld(true);
    if (
      ![
        ...next.projectionMatrix.elements,
        ...next.projectionMatrixInverse.elements,
        ...next.matrixWorld.elements,
        ...next.matrixWorldInverse.elements,
      ].every(float32Finite)
    )
      return failure('Camera projection is outside the finite Float32 evaluation profile.');
    this.captureVersion++;
    this.editController?.cancel('camera changed');
    const replace = this.camera.constructor !== next.constructor || !this.camera.up.equals(next.up);
    if (replace) {
      this.releaseControls();
      this.camera = next;
    } else if (this.camera instanceof PerspectiveCamera && next instanceof PerspectiveCamera) {
      this.camera.copy(next);
    } else if (this.camera instanceof OrthographicCamera && next instanceof OrthographicCamera) {
      this.camera.copy(next);
    }
    this.fov = state.fov;
    this.span = state.span;
    this.target.copy(target);
    this.fitPending = false;
    if (this.controls) {
      this.controls.target.copy(target);
      this.controls.update();
    } else if (this.canRender()) this.syncActivity();
    this.requestRender();
    return { ok: true };
  }

  private updateProjection(camera = this.camera, aspect = this.width / this.height): void {
    if (camera instanceof PerspectiveCamera) camera.aspect = aspect;
    else {
      const half = (camera.top - camera.bottom) / 2;
      camera.left = -half * aspect;
      camera.right = half * aspect;
    }
    camera.updateProjectionMatrix();
  }

  private modelBounds(): Box3 {
    const bounds = this.graph ? visibleBounds(this.graph.root) : new Box3();
    return bounds.isEmpty() ? fallbackBounds() : bounds;
  }

  private viewDirection(): Vector3 {
    const direction = this.camera.position.clone().sub(this.target);
    return direction.lengthSq() > 0 ? direction.normalize() : defaultDirection();
  }

  private fitBounds(
    bounds: Box3,
    direction: Vector3,
    up = this.camera.up,
    fov = this.fov,
  ): ProfileResult {
    const state = { ...this.getCamera(), fov };
    const aspect = this.width / this.height;
    const radius = boundsRadius(bounds);
    const target = bounds.getCenter(new Vector3());
    const halfVertical = (state.fov * Math.PI) / 360;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
    const distance =
      state.projection === 'perspective'
        ? (radius / Math.sin(Math.min(halfVertical, halfHorizontal))) * 1.2
        : radius * 3;
    return this.applyCamera({
      ...state,
      position: target
        .clone()
        .add(direction.clone().normalize().multiplyScalar(distance))
        .toArray() as Vec3,
      target: target.toArray() as Vec3,
      span: (radius * 2.4) / Math.min(1, aspect),
      up: up.toArray() as Vec3,
    });
  }

  /** Discrete accessible controls share the pointer camera without owning another event loop. */
  cameraAction(action: NativeCameraAction): ProfileResult {
    if (!this.canRender() || !this.controls?.enabled)
      return failure('Camera actions require an active native viewport.');
    const target = this.controls.target.clone();
    const position = this.camera.position.clone();
    const offset = position.clone().sub(target);
    const distance = offset.length();
    let span = this.getCamera().span;
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
        const toYUp = new Quaternion().setFromUnitVectors(
          this.camera.up.clone().normalize(),
          new Vector3(0, 1, 0),
        );
        const spherical = new Spherical().setFromVector3(offset.clone().applyQuaternion(toYUp));
        if (action === 'orbit-left') spherical.theta -= angle;
        if (action === 'orbit-right') spherical.theta += angle;
        if (action === 'orbit-up') spherical.phi -= angle;
        if (action === 'orbit-down') spherical.phi += angle;
        spherical.makeSafe();
        position
          .copy(target)
          .add(new Vector3().setFromSpherical(spherical).applyQuaternion(toYUp.invert()));
        break;
      }
      case 'pan-left':
      case 'pan-right':
      case 'pan-up':
      case 'pan-down': {
        const direction = offset.normalize();
        const right = new Vector3().crossVectors(this.camera.up, direction);
        if (right.lengthSq() < 1e-20) right.set(1, 0, 0);
        right.normalize();
        const up = new Vector3().crossVectors(direction, right).normalize();
        const movement = action === 'pan-left' || action === 'pan-right' ? right : up;
        const sign = action === 'pan-left' || action === 'pan-down' ? -1 : 1;
        const scale =
          this.camera instanceof OrthographicCamera
            ? span *
              (action === 'pan-left' || action === 'pan-right' ? this.width / this.height : 1)
            : distance;
        movement.multiplyScalar(scale * 0.1 * sign);
        position.add(movement);
        target.add(movement);
        break;
      }
      case 'zoom-in':
      case 'zoom-out': {
        if (this.camera instanceof OrthographicCamera) {
          span = Math.min(1e30, Math.max(0.000001, span * (action === 'zoom-in' ? 1 / 1.2 : 1.2)));
          break;
        }
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
    return this.applyCamera(
      {
        ...this.getCamera(),
        position: position.toArray() as Vec3,
        target: target.toArray() as Vec3,
        span,
      },
      action === 'zoom-in' || action === 'zoom-out' || action.startsWith('orbit-'),
    );
  }

  fitCamera(): void {
    if (this.disposed || !this.graph) return;
    const result = this.fitBounds(this.modelBounds(), this.viewDirection());
    if (!result.ok) throw new Error(result.reason);
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
    this.editController?.cancel('GPU pause');
    this.editBinding?.cancel('GPU pause');
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
    const status = this.status;
    return status.state === 'error' || status.state === 'unavailable'
      ? failure(status.reason ?? 'Viewport restoration failed.')
      : { ok: true };
  }

  async capturePng(): Promise<Blob> {
    if (!this.canRender()) throw new Error('PNG capture requires an active native viewport.');
    if (
      this.editBinding &&
      (this.editBinding.state.projectId !== this.snapshot?.id ||
        this.editBinding.state.revision !== this.snapshot?.revision)
    )
      throw new Error('PNG capture requires the displayed canonical revision.');
    if (this.animation?.state.active) this.animation.cancel('PNGは保存正本のrestから取得します。');
    if (this.rigPose?.state.active) this.rigPose.cancel('PNGは保存正本のrestから取得します。');
    const guard = this.editBinding?.beginCapture();
    let poseGuard: ReturnType<RigPoseBinding['beginCapture']> | undefined;
    let animationGuard: ReturnType<AnimationBinding['beginCapture']> | undefined;
    const generation = this.runtimeGeneration,
      viewVersion = this.captureVersion;
    const projectId = this.snapshot?.id,
      revision = this.snapshot?.revision;
    const canvas = this.element;
    try {
      poseGuard = this.rigPose?.beginCapture();
      animationGuard = this.animation?.beginCapture();
      this.cancelRender();
      this.editController?.setHelpersVisible(false);
      this.gameHelpers.forEach((entry) => {
        entry.object.visible = false;
      });
      for (const helpers of this.selectionHelpers.values())
        helpers.forEach((helper) => {
          helper.visible = false;
        });
      if (!this.renderNow() || !canvas)
        throw new Error('The native viewport could not render a PNG.');
      // Read during the render task. Encoding must still belong to this canonical/runtime epoch.
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (
            generation !== this.runtimeGeneration ||
            viewVersion !== this.captureVersion ||
            canvas !== this.element ||
            !this.canRender() ||
            projectId !== this.snapshot?.id ||
            revision !== this.snapshot?.revision ||
            (guard && !guard.isCurrent()) ||
            (poseGuard && !poseGuard.isCurrent()) ||
            (animationGuard && !animationGuard.isCurrent())
          ) {
            reject(new Error('PNG capture became stale during encoding.'));
          } else if (blob) resolve(blob);
          else reject(new Error('Canvas PNG encoding failed.'));
        }, 'image/png');
      });
    } finally {
      guard?.release();
      poseGuard?.release();
      animationGuard?.release();
      if (generation === this.runtimeGeneration) {
        this.editController?.setHelpersVisible(true);
        this.updateGamePreview();
        for (const helpers of this.selectionHelpers.values())
          helpers.forEach((helper) => {
            helper.visible = true;
          });
        if (this.editBinding) this.requestRender();
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.animationUnsubscribe?.();
    this.animationUnsubscribe = null;
    this.animation?.setAvailable(false);
    this.animation?.cancel('3D表示を終了しました。');
    this.animation = null;
    this.poseUnsubscribe?.();
    this.poseUnsubscribe = null;
    this.rigPose?.cancel('3D表示を終了しました。');
    this.rigPose = null;
    this.editUnsubscribe?.();
    this.editUnsubscribe = null;
    this.disposed = true;
    this.releaseRuntime();
    if (this.editBinding) this.syncEditingBlocks(this.editBinding, true);
    this.editBinding = null;
    this.observer?.disconnect();
    this.observer = null;
    this.cleanup.splice(0).forEach((remove) => remove());
    this.scene.clear();
    this.snapshot = null;
    this.releaseTextureSnapshot();
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
    if (
      this.editBinding &&
      (this.editBinding.state.projectId !== this.snapshot.id ||
        this.editBinding.state.revision !== this.snapshot.revision)
    )
      return failure('GPU pause/resume requires the current canonical session revision.');
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
    canvas.tabIndex = 0;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    this.element = canvas;
    this.runtimeGeneration++;
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
          this.releaseControls();
          this.releaseGraph();
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
      this.graph = buildNativeGraph(this.snapshot, this.textureSnapshot);
      this.scene.add(this.graph.root);
      this.applyInspection();
      try {
        this.rebuildGamePreview();
      } catch (error) {
        this.gamePreviewEnabled = false;
        this.gamePreviewError = String(error);
        this.clearGamePreview();
      }
      this.applyRigPose();
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
      if (this.resetPending) {
        this.camera = new PerspectiveCamera(45, this.width / this.height, 0.01, 1000);
        this.fov = 45;
        this.span = 4;
        this.viewOptions = defaultViewOptions();
        this.applyInspection();
      }
      const result = this.fitPending
        ? this.fitBounds(
            this.modelBounds(),
            this.resetPending ? defaultDirection() : this.viewDirection(),
          )
        : this.applyCamera(this.getCamera(), !this.clippingPending);
      if (!result.ok) throw new Error(result.reason);
      this.resetPending = false;
      this.clippingPending = false;
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

  private syncEditingBlocks(binding: NativeEditBinding, clear = false): void {
    binding.setBlocked('renderer-viewport-hidden', !clear && (this.hidden || this.documentHidden));
    binding.setBlocked('renderer-document-frozen', !clear && this.frozen);
    binding.setBlocked('renderer-page-hidden', !clear && this.pageHidden);
  }

  private syncActivity(): void {
    this.animation?.setAvailable(this.canRender());
    if (!this.canRender()) this.animation?.pause('表示中断で再生を停止しました。');
    if (!this.canRender()) this.rigPose?.cancel('表示が中断したためrestに戻しました。');
    if (this.editBinding) this.syncEditingBlocks(this.editBinding);
    if (this.canRender() && this.element) {
      try {
        if (!this.controls) {
          this.controls = this.dependencies.createControls(this.camera, this.element);
          this.controls.enableDamping = false;
          this.controls.autoRotate = false;
          this.controls.target.copy(this.target);
          this.controls.update();
          this.controls.addEventListener('change', this.onControlsChange);
          this.controlsListening = true;
          this.listenerCount++;
        }
        this.ensureEditing();
        this.requestRender();
      } catch (error) {
        this.fault = {
          state: 'error',
          reason: `Native controls construction failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        };
        this.releaseRuntime();
      }
    } else {
      this.cancelRender();
      this.editBinding?.cancel(`viewport ${this.status.state}`);
      this.releaseControls();
    }
    this.publish();
  }

  private requestRender(): void {
    if (!this.canRender() || this.frame !== null) return;
    this.frame = this.dependencies.requestFrame((timestamp) => {
      this.frame = null;
      this.animation?.advance(timestamp);
      this.renderNow();
      if (this.animation?.state.playing) this.requestRender();
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

  private applyInspection(options = this.viewOptions): void {
    const helpers: (GridHelper | AxesHelper | Box3Helper)[] = [];
    let material: MeshStandardMaterial | MeshBasicMaterial | null = null;
    try {
      if (this.graph) {
        const bounds = this.modelBounds();
        const size = Math.min(1e30, Math.max(1, boundsRadius(bounds) * 4));
        if (options.grid) {
          const grid = new GridHelper(
            size,
            10,
            0x7c8798,
            options.background === 'dark' ? 0x465266 : 0xaeb9c8,
          );
          grid.name = 'Inspection grid';
          helpers.push(grid);
        }
        if (options.axes) {
          const axes = new AxesHelper(size / 2);
          axes.name = 'Inspection axes';
          helpers.push(axes);
        }
        if (options.bounds && !new Box3().setFromObject(this.graph.root).isEmpty()) {
          const helper = new Box3Helper(bounds, 0xf4ad42);
          helper.name = 'Inspection bounds';
          helpers.push(helper);
        }
        if (options.shading !== 'material')
          material =
            options.shading === 'wireframe'
              ? new MeshBasicMaterial({
                  color: options.background === 'light' ? 0x263449 : 0xdce5ef,
                  wireframe: true,
                  toneMapped: false,
                })
              : new MeshStandardMaterial({ color: 0xb8bfcb, roughness: 0.8, metalness: 0 });
      }
    } catch (error) {
      helpers.forEach((helper) => helper.dispose());
      material?.dispose();
      throw error;
    }
    this.releaseInspection();
    this.helpers = helpers;
    this.inspectionMaterial = material;
    this.graph?.root.traverse((object) => {
      if (object instanceof Mesh) object.material = material ?? this.graph!.materials;
    });
    helpers.forEach((helper) => this.scene.add(helper));
    this.scene.background = new Color(options.background === 'dark' ? 0x18202b : 0xe8edf3);
    this.ambient.intensity = options.lighting === 'studio' ? 1.5 : 2.5;
    this.light.intensity = options.lighting === 'studio' ? 3 : 1;
  }

  private releaseInspection(): void {
    this.disposedHelperGeometries += this.helpers.length;
    this.disposedHelperMaterials += this.helpers.length;
    this.helpers.forEach((helper) => {
      helper.removeFromParent();
      helper.dispose();
    });
    this.helpers = [];
    if (this.inspectionMaterial) {
      this.inspectionMaterial.dispose();
      this.inspectionMaterial = null;
      this.disposedInspectionMaterials++;
    }
  }

  private releaseControls(): void {
    this.releaseEditing();
    if (this.controls) {
      this.target.copy(this.controls.target);
      this.controls.enabled = false;
      if (this.controlsListening) {
        this.controls.removeEventListener('change', this.onControlsChange);
        this.listenerCount--;
        this.controlsListening = false;
      }
      this.controls.dispose();
      this.controls = null;
    }
    for (const pointer of this.pointers)
      if (this.element?.hasPointerCapture(pointer)) this.element.releasePointerCapture(pointer);
    this.pointers.clear();
  }
  private releaseTextureSnapshot(): void {
    this.textureSnapshot = undefined;
    this.releaseTextureReservation?.();
    this.releaseTextureReservation = null;
  }

  private releaseGraph(): void {
    this.releaseEditing();
    this.clearSelection();
    this.releaseInspection();
    this.clearGamePreview();
    if (!this.graph) return;
    this.disposedGeometries += this.graph.geometries.length;
    this.disposedMaterials += this.graph.materials.length;
    this.disposedTextures += this.graph.textures.length;
    this.graph.dispose();
    this.graph = null;
  }
  private releaseRuntime(): void {
    this.animation?.cancel('表示資源を解放したため再生を解除しました。');
    this.animation?.setAvailable(false);
    this.rigPose?.cancel('表示資源を解放したためrestに戻しました。');
    this.runtimeGeneration++;
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

function visibleBounds(root: Object3D): Box3 {
  const bounds = new Box3();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((object) => {
    if (object instanceof Mesh) {
      if (object instanceof SkinnedMesh) {
        object.computeBoundingBox();
        if (object.boundingBox)
          bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
      } else {
        object.geometry.computeBoundingBox();
        if (object.geometry.boundingBox)
          bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
    }
  });
  return bounds;
}
