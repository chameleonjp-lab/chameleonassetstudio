import { Engine } from '@babylonjs/core/Engines/engine.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Vector3, Quaternion, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Animation } from '@babylonjs/core/Animations/animation.js';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup.js';
import { AnimationKeyInterpolation } from '@babylonjs/core/Animations/animationKey.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { ImportMeshAsync } from '@babylonjs/core/Loading/sceneLoader.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { IGLTF } from '@babylonjs/loaders/glTF/2.0/glTFLoaderInterfaces.js';
// Register only the basic loader and inert extras. No Draco, meshopt, Basis or validator fetches.
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import '@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata.js';
import {
  attachmentWorld,
  checkConsumerAsset,
  oracleScene,
  worldOrigin,
  type CheckedAsset,
  type Attachment,
} from './sidecar';
import { compose, maximumPositionError, secondsForSample } from './oracles';

const FPS = 60;
interface RestTransform {
  node: TransformNode;
  position: Vector3;
  rotation: Vector3;
  quaternion: Quaternion | null;
  scaling: Vector3;
}
interface Loaded {
  scene: Scene;
  camera: ArcRotateCamera;
  asset: CheckedAsset;
  runtime: IGLTF;
  rest: RestTransform[];
  logical: TransformNode[];
}
interface SampleState {
  clipId: string | null;
  requested: number;
  time: number;
  mode: 'scrub' | 'playback';
  loop: boolean;
  duration: number;
}

/** Pinned Babylon adapter. Raw loader index associations are isolated to this test-only entry. */
export class IndependentConsumer {
  private engine: AbstractEngine | null = null;
  private loaded: Loaded | null = null;
  private pending = new Set<Scene>();
  private generation = 0;
  private loading = false;
  private state: SampleState = {
    clipId: null,
    requested: 0,
    time: 0,
    mode: 'scrub',
    loop: false,
    duration: 0,
  };
  private playback = {
    playing: false,
    loops: 0,
    ends: 0,
    source: 'none' as 'none' | 'animation-group' | 'empty-clip-clock',
  };
  private playbackGroup: AnimationGroup | null = null;
  private removePlaybackObservers: (() => void) | null = null;
  private playbackStart = 0;
  private playbackSpeed = 1;
  constructor(
    private readonly engineFactory: () => AbstractEngine,
    private readonly canvas?: HTMLCanvasElement,
  ) {}

  async load(
    glbInput: readonly number[] | Uint8Array,
    sidecarInput: readonly number[] | Uint8Array,
  ) {
    if (this.loading) throw new Error('A consumer load is already in progress');
    this.loading = true;
    try {
      return await this.loadAsset(glbInput, sidecarInput);
    } finally {
      this.loading = false;
    }
  }
  private async loadAsset(
    glbInput: readonly number[] | Uint8Array,
    sidecarInput: readonly number[] | Uint8Array,
  ) {
    if (glbInput.length > 32 * 1024 * 1024 || sidecarInput.length > 8 * 1024 * 1024)
      throw new Error('Consumer input limit');
    const generation = ++this.generation;
    const glb = new Uint8Array(glbInput),
      sidecar = new Uint8Array(sidecarInput);
    const asset = await checkConsumerAsset(glb, sidecar);
    if (generation !== this.generation) throw new Error('Consumer load cancelled');
    if (!this.engine) {
      this.engine = this.engineFactory();
      this.engine.runRenderLoop(() => {
        this.loaded?.scene.render();
        this.syncPlayback();
      });
    }
    const scene = new Scene(this.engine);
    this.pending.add(scene);
    scene.useRightHandedSystem = true;
    scene.clearColor = new Color4(0.12, 0.14, 0.18, 1);
    scene.imageProcessingConfiguration.toneMappingEnabled = false;
    scene.imageProcessingConfiguration.exposure = 1;
    scene.imageProcessingConfiguration.contrast = 1;
    const camera = new ArcRotateCamera(
      'consumer-camera',
      Math.PI / 2,
      Math.PI / 2,
      5,
      Vector3.Zero(),
      scene,
    );
    camera.minZ = 0.01;
    camera.maxZ = 10000;
    camera.fov = Math.PI / 4;
    if (this.canvas) camera.attachControl(this.canvas, true);
    const hemisphere = new HemisphericLight('consumer-hemisphere', new Vector3(0, 1, 0), scene);
    hemisphere.intensity = 0.8;
    const key = new DirectionalLight('consumer-key', new Vector3(-1, -2, -3), scene);
    key.intensity = 1.2;
    let runtime: IGLTF | undefined;
    let previous: Loaded | null = null;
    const previousState = this.state;
    try {
      await ImportMeshAsync(glb, scene, {
        pluginExtension: '.glb',
        name: 'bounded-model.glb',
        pluginOptions: {
          gltf: {
            animationStartMode: 0,
            coordinateSystemMode: 1,
            targetFps: FPS,
            createInstances: false,
            skipMaterials: false,
            validate: false,
            onParsed: (data) => {
              runtime = data.json as IGLTF;
            },
            preprocessUrlAsync: async () => {
              throw new Error('External resource forbidden by independent consumer');
            },
          },
        },
      });
      if (generation !== this.generation || scene.isDisposed)
        throw new Error('Consumer load cancelled');
      if (!runtime) throw new Error('Babylon loader did not expose its parsed index associations');
      const logical = this.logicalHierarchy(scene, asset, runtime);
      const rest = [...scene.transformNodes, ...scene.meshes].map((node) => ({
        node,
        position: node.position.clone(),
        rotation: node.rotation.clone(),
        quaternion: node.rotationQuaternion?.clone() ?? null,
        scaling: node.scaling.clone(),
      }));
      const candidate: Loaded = { scene, camera, asset, runtime, rest, logical };
      this.validateRuntimeMapping(candidate);
      await scene.whenReadyAsync();
      if (generation !== this.generation || scene.isDisposed)
        throw new Error('Consumer load cancelled');
      previous = this.loaded;
      this.loaded = candidate;
      this.pending.delete(scene);
      this.sample(null, 0);
      const report = this.snapshot();
      const points = report.meshes.flatMap((mesh) => mesh.positions);
      if (points.length) {
        const low = [Infinity, Infinity, Infinity],
          high = [-Infinity, -Infinity, -Infinity];
        points.forEach((v, i) => {
          low[i % 3] = Math.min(low[i % 3], v);
          high[i % 3] = Math.max(high[i % 3], v);
        });
        camera.setTarget(
          new Vector3(...(low.map((v, i) => (v + high[i]) / 2) as [number, number, number])),
        );
        camera.radius = Math.max(1, Math.hypot(...low.map((v, i) => high[i] - v)) * 1.6);
        camera.maxZ = Math.max(100, camera.radius * 20);
      }
      scene.render();
      const result = this.snapshot();
      previous?.scene.dispose();
      return result;
    } catch (error) {
      if (this.loaded?.scene === scene) {
        this.loaded = previous;
        this.state = previousState;
      }
      this.pending.delete(scene);
      scene.dispose();
      if (!this.loaded && this.engine && !this.pending.size) {
        this.engine.dispose();
        this.engine = null;
      }
      throw error;
    }
  }

  /** Babylon deliberately ignores skinned-node TRS. Metadata bindings retain the authored
   * logical hierarchy separately; never parent rendered skin geometry under this graph. */
  private logicalHierarchy(scene: Scene, asset: CheckedAsset, runtime: IGLTF): TransformNode[] {
    const nodes = (asset.gltf.nodes ?? []).map((raw, index) => {
      const node = new TransformNode('metadata-' + index, scene);
      node.rotationQuaternion = Quaternion.Identity();
      if (raw.matrix)
        Matrix.FromArray(raw.matrix).decompose(
          node.scaling,
          node.rotationQuaternion,
          node.position,
        );
      else {
        node.position = Vector3.FromArray(raw.translation ?? [0, 0, 0]);
        node.rotationQuaternion = Quaternion.FromArray(raw.rotation ?? [0, 0, 0, 1]);
        node.scaling = Vector3.FromArray(raw.scale ?? [1, 1, 1]);
      }
      return node;
    });
    asset.gltf.nodes?.forEach((raw, index) =>
      raw.children?.forEach((child) => {
        nodes[child].parent = nodes[index];
      }),
    );
    asset.gltf.animations?.forEach((clip, index) => {
      const group = runtime.animations![index]._babylonAnimationGroup!;
      for (const channel of clip.channels) {
        const sampler = clip.samplers[channel.sampler],
          rotation = channel.target.path === 'rotation';
        const values = asset.read(sampler.output),
          times = asset.read(sampler.input),
          width = rotation ? 4 : 3;
        const animation = new Animation(
          'metadata-channel',
          rotation
            ? 'rotationQuaternion'
            : channel.target.path === 'scale'
              ? 'scaling'
              : 'position',
          FPS,
          rotation ? Animation.ANIMATIONTYPE_QUATERNION : Animation.ANIMATIONTYPE_VECTOR3,
          Animation.ANIMATIONLOOPMODE_CYCLE,
        );
        animation.setKeys(
          times.map((time, key) => ({
            frame: time * FPS,
            value: rotation
              ? Quaternion.FromArray(values, key * width)
              : Vector3.FromArray(values, key * width),
            interpolation:
              sampler.interpolation === 'STEP'
                ? AnimationKeyInterpolation.STEP
                : AnimationKeyInterpolation.NONE,
          })),
        );
        group.addTargetedAnimation(animation, nodes[channel.target.node]);
      }
    });
    return nodes;
  }

  private validateRuntimeMapping(loaded: Loaded) {
    loaded.asset.sidecar.nodes.forEach(({ index, id }) => {
      const raw = loaded.runtime.nodes?.[index];
      const node = raw?._babylonTransformNodeForSkin ?? raw?._babylonTransformNode;
      if (!node) throw new Error('Runtime node missing for stable ID ' + id);
      const gltf = node.metadata?.gltf as { extras?: { casId?: string } } | undefined;
      if (gltf?.extras?.casId !== id) throw new Error('Runtime extras identity mismatch: ' + id);
      const source = loaded.asset.gltf.nodes![index];
      if (
        source.mesh !== undefined &&
        raw?._primitiveBabylonMeshes?.length !==
          loaded.asset.gltf.meshes![source.mesh].primitives.length
      )
        throw new Error('Runtime primitive mapping mismatch');
    });
    loaded.asset.sidecar.clips.forEach((clip) => {
      if (clip.index !== null && !loaded.runtime.animations?.[clip.index]?._babylonAnimationGroup)
        throw new Error('Runtime clip mapping mismatch');
    });
  }

  sample(clipId: string | null, requested: number, mode: 'scrub' | 'playback' = 'scrub') {
    const loaded = this.requireLoaded();
    if (mode !== 'scrub' && mode !== 'playback') throw new Error('Invalid sample mode');
    const clip =
      clipId === null ? null : loaded.asset.sidecar.clips.find((value) => value.id === clipId);
    if (clipId !== null && !clip) throw new Error('Unknown clip stable ID');
    const time = secondsForSample(clip?.duration ?? 0, requested, clip?.loop ?? false, mode);
    this.haltPlayback();
    loaded.scene.animationGroups.forEach((group) => group.stop(true));
    for (const rest of loaded.rest) {
      rest.node.position.copyFrom(rest.position);
      rest.node.rotation.copyFrom(rest.rotation);
      rest.node.rotationQuaternion = rest.quaternion?.clone() ?? null;
      rest.node.scaling.copyFrom(rest.scaling);
    }
    if (clip?.index !== null && clip?.index !== undefined) {
      const group = loaded.runtime.animations![clip.index]._babylonAnimationGroup!;
      group.start(false, 1).pause();
      group.goToFrame(time * FPS);
    }
    loaded.rest.forEach(({ node }) => node.computeWorldMatrix(true));
    loaded.scene.skeletons.forEach((skeleton) => skeleton.prepare(true));
    this.state = {
      clipId,
      requested,
      time,
      mode,
      duration: clip?.duration ?? 0,
      loop: clip?.loop ?? false,
    };
    loaded.scene.render();
    return this.snapshot();
  }

  /** Real engine playback. The observable counters are not synthesized from manual sample calls. */
  play(clipId: string, speedRatio = 1) {
    if (!Number.isFinite(speedRatio) || speedRatio <= 0 || speedRatio > 100)
      throw new Error('Invalid playback speed');
    this.sample(clipId, 0, 'playback');
    const loaded = this.requireLoaded(),
      clip = loaded.asset.sidecar.clips.find((item) => item.id === clipId)!;
    this.playback = {
      playing: true,
      loops: 0,
      ends: 0,
      source: clip.index === null ? 'empty-clip-clock' : 'animation-group',
    };
    this.playbackStart = performance.now();
    this.playbackSpeed = speedRatio;
    if (clip.duration === 0) {
      this.playback.playing = false;
      this.playback.ends = 1;
    } else if (clip.index !== null) {
      const group = loaded.runtime.animations![clip.index]._babylonAnimationGroup!;
      group.stop(true);
      this.playbackGroup = group;
      const loop = group.onAnimationGroupLoopObservable.add(() => {
        this.playback.loops++;
      });
      const end = group.onAnimationGroupEndObservable.add(() => {
        this.playback.playing = false;
        this.playback.ends++;
        this.state.time = clip.duration;
        this.state.requested = clip.duration;
      });
      this.removePlaybackObservers = () => {
        group.onAnimationGroupLoopObservable.remove(loop);
        group.onAnimationGroupEndObservable.remove(end);
      };
      group.start(clip.loop, speedRatio, 0, clip.duration * FPS);
    }
    return this.snapshot();
  }
  stop() {
    this.syncPlayback();
    this.haltPlayback();
    return this.snapshot();
  }
  private haltPlayback() {
    this.playbackGroup?.pause();
    this.playbackGroup = null;
    this.removePlaybackObservers?.();
    this.removePlaybackObservers = null;
    this.playback.playing = false;
  }
  private syncPlayback() {
    if (!this.loaded || !this.playback.playing) return;
    if (this.playbackGroup) {
      this.state.time = this.playbackGroup.getCurrentFrame() / FPS;
      this.state.requested = this.state.time + this.playback.loops * this.state.duration;
    } else {
      const elapsed = Math.max(
        0,
        ((performance.now() - this.playbackStart) * this.playbackSpeed) / 1000,
      );
      this.state.requested = elapsed;
      this.state.time = secondsForSample(this.state.duration, elapsed, this.state.loop, 'playback');
      if (this.state.loop) this.playback.loops = Math.floor(elapsed / this.state.duration);
      else if (elapsed >= this.state.duration) {
        this.playback.playing = false;
        this.playback.ends++;
      }
    }
  }

  private requireLoaded(): Loaded {
    if (!this.loaded) throw new Error('No asset loaded');
    return this.loaded;
  }
  private node(loaded: Loaded, index: number): TransformNode {
    return loaded.logical[index];
  }
  private primitivePositions(mesh: AbstractMesh): number[] {
    const data = mesh.getPositionData(true, true);
    if (!data) throw new Error('Runtime mesh positions missing');
    const world = mesh.computeWorldMatrix(true),
      positions: number[] = [];
    for (let i = 0; i < data.length; i += 3)
      positions.push(...Vector3.TransformCoordinates(Vector3.FromArray(data, i), world).asArray());
    return positions;
  }

  snapshot() {
    this.syncPlayback();
    const loaded = this.requireLoaded(),
      { asset, runtime, scene } = loaded;
    loaded.rest.forEach(({ node }) => node.computeWorldMatrix(true));
    scene.skeletons.forEach((skeleton) => skeleton.prepare(true));
    const nodes = asset.sidecar.nodes.map(({ id, index }) => {
      const world = Array.from(this.node(loaded, index).computeWorldMatrix(true).asArray());
      return { id, index, world, position: worldOrigin(world) };
    });
    const clip =
      this.state.clipId === null
        ? undefined
        : asset.sidecar.clips.find((c) => c.id === this.state.clipId);
    const expected = oracleScene(asset, clip?.index ?? null, this.state.time);
    let maximumError = 0,
      positionPass = true;
    const nodePass = nodes.every((node, index) =>
      node.world.every(
        (value, i) =>
          Math.abs(value - expected.worlds[index][i]) <=
          1e-6 + 1e-5 * Math.max(Math.abs(value), Math.abs(expected.worlds[index][i])),
      ),
    );
    const meshes = (asset.gltf.nodes ?? []).flatMap((node, nodeIndex) =>
      node.mesh === undefined
        ? []
        : (runtime.nodes![nodeIndex]._primitiveBabylonMeshes ?? []).map((mesh, primitiveIndex) => {
            const positions = this.primitivePositions(mesh),
              oracle = expected.primitives.find(
                (x) => x.nodeIndex === nodeIndex && x.primitiveIndex === primitiveIndex,
              )!;
            const error = maximumPositionError(positions, oracle.positions);
            maximumError = Math.max(maximumError, error);
            if (
              positions.some(
                (v, i) =>
                  Math.abs(v - oracle.positions[i]) >
                  1e-6 + 1e-5 * Math.max(Math.abs(v), Math.abs(oracle.positions[i])),
              )
            )
              positionPass = false;
            return {
              nodeId: asset.sidecar.nodes[nodeIndex].id,
              nodeIndex,
              meshIndex: node.mesh!,
              primitiveIndex,
              positions,
              indices: Array.from(mesh.getIndices() ?? []),
              uv: Array.from(mesh.getVerticesData('uv') ?? []),
              materialIndex:
                asset.gltf.meshes![node.mesh!].primitives[primitiveIndex].material ?? null,
              maximumError: error,
            };
          }),
    );
    const game = <T extends Attachment>(items: T[]) =>
      items.map((item) => {
        const parent =
          item.nodeId === null ? undefined : nodes.find((node) => node.id === item.nodeId)!.world;
        const world = attachmentWorld(parent, compose(item.transform));
        return { ...structuredClone(item), world, position: worldOrigin(world) };
      });
    const materials = (runtime.materials ?? []).map((raw, index) => {
      const material = Object.values(raw._data ?? {})[0]?.babylonMaterial;
      if (!material)
        return {
          index,
          id: asset.gltf.materials?.[index].extras?.casId ?? null,
          loaded: false as const,
        };
      if (!(material instanceof PBRMaterial))
        throw new Error('Independent consumer expected PBR material');
      const size = material.albedoTexture?.getSize();
      return {
        index,
        id: asset.gltf.materials?.[index].extras?.casId ?? null,
        loaded: true as const,
        baseColor: [...material.albedoColor.asArray(), material.alpha],
        metallic: material.metallic,
        roughness: material.roughness,
        alphaMode: material.transparencyMode,
        alphaCutoff: material.alphaCutOff,
        doubleSided: !material.backFaceCulling,
        emissive: material.emissiveColor.asArray(),
        textureSize: size ? [size.width, size.height] : null,
      };
    });
    return {
      engine: 'Babylon.js',
      version: Engine.Version,
      rightHanded: scene.useRightHandedSystem,
      hash: asset.hash,
      revision: asset.sidecar.revision,
      sample: { ...this.state },
      playback: { ...this.playback },
      nodes,
      meshes,
      materials,
      game: {
        assetId: asset.sidecar.game.assetId,
        assetKind: asset.sidecar.game.assetKind,
        originMode: asset.sidecar.game.originMode,
        unitMeters: asset.sidecar.game.unitMeters,
        forward: asset.sidecar.game.forward,
        origin: [...asset.sidecar.game.origin],
        coordinatesApplied: false,
      },
      anchors: game(asset.sidecar.game.anchors),
      colliders: game(asset.sidecar.game.colliders),
      oracle: { positionPass, nodePass, maximumError },
      resources: {
        meshes: scene.meshes.length,
        geometries: scene.geometries.length,
        materials: scene.materials.length,
        textures: scene.textures.length,
        skeletons: scene.skeletons.length,
        animations: scene.animationGroups.length,
      },
    };
  }

  camera(options: { position: number[]; target: number[]; span?: number }) {
    const { camera, scene } = this.requireLoaded();
    if (
      [...options.position, ...options.target, options.span ?? 1].some(
        (x) => !Number.isFinite(x),
      ) ||
      options.position.length !== 3 ||
      options.target.length !== 3 ||
      (options.span !== undefined && options.span <= 0)
    )
      throw new Error('Invalid consumer camera');
    camera.setTarget(Vector3.FromArray(options.target));
    camera.setPosition(Vector3.FromArray(options.position));
    camera.mode = options.span === undefined ? 0 : 1;
    if (options.span !== undefined) {
      const ratio = this.engine!.getRenderWidth() / this.engine!.getRenderHeight();
      camera.orthoLeft = (-options.span * ratio) / 2;
      camera.orthoRight = (options.span * ratio) / 2;
      camera.orthoTop = options.span / 2;
      camera.orthoBottom = -options.span / 2;
    }
    scene.render();
  }
  async pixels() {
    const engine = this.engine;
    if (!engine) throw new Error('No consumer engine');
    this.requireLoaded().scene.render();
    const bytes = await engine.readPixels(0, 0, engine.getRenderWidth(), engine.getRenderHeight());
    return Array.from(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  }
  dispose() {
    ++this.generation;
    this.haltPlayback();
    this.pending.forEach((scene) => scene.dispose());
    this.pending.clear();
    this.loaded?.scene.dispose();
    this.loaded = null;
    this.engine?.dispose();
    this.engine = null;
    return { disposed: true, pending: 0 };
  }
}

export type ConsumerReport = ReturnType<IndependentConsumer['snapshot']>;

declare global {
  interface Window {
    __assetConsumer: IndependentConsumer;
  }
}
if (typeof document !== 'undefined' && document.querySelector('#consumer-canvas')) {
  const canvas = document.querySelector<HTMLCanvasElement>('#consumer-canvas')!;
  const consumer = new IndependentConsumer(
    () =>
      new Engine(
        canvas,
        true,
        { preserveDrawingBuffer: true, stencil: true, disableWebGL2Support: false },
        false,
      ),
    canvas,
  );
  window.__assetConsumer = consumer;
  const status = document.querySelector<HTMLElement>('#status')!;
  document.querySelector('#load')!.addEventListener('click', () => {
    void (async () => {
      try {
        const glb = document.querySelector<HTMLInputElement>('#glb')!.files?.[0],
          sidecar = document.querySelector<HTMLInputElement>('#sidecar')!.files?.[0];
        if (!glb || !sidecar) throw new Error('Select GLB and matching game.json');
        if (glb.size > 32 * 1024 * 1024 || sidecar.size > 8 * 1024 * 1024)
          throw new Error('Consumer input limit');
        const report = await consumer.load(
          new Uint8Array(await glb.arrayBuffer()),
          new Uint8Array(await sidecar.arrayBuffer()),
        );
        status.textContent = `${report.engine} ${report.version}: ${report.hash}; independent position check ${report.oracle.positionPass ? 'passed' : 'FAILED'}`;
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    })();
  });
  document.querySelector('#dispose')!.addEventListener('click', () => {
    consumer.dispose();
    status.textContent = 'Disposed; ready to reload';
  });
  window.addEventListener('pagehide', () => consumer.dispose());
}
