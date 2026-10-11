import { validateProject, type Project3D } from '../../core3d/model/project';
import type { AssetImport } from '../../core3d/ports/assetIoPort';
import {
  ASSET_IO_PROFILE as P,
  assertIoBudget,
  reserveAssetIoBytes,
} from '../../core3d/profile/assetIoProfile';

export interface NativeImportOrigin {
  readonly session: object;
  readonly projectId: string;
  readonly revision: number;
}

/** Small detached display data, safe to read even after the candidate is discarded. */
export interface NativeImportSummary {
  readonly projectId: string;
  readonly projectName: string;
  readonly sourceHash: string;
  readonly losses: readonly string[];
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly materialCount: number;
  readonly clipCount: number;
  readonly sourceCount: number;
  readonly totalBlobBytes: number;
  /** Conservative ownership estimate, not measured device memory or device certification. */
  readonly estimatedBytes: number;
}

export interface NativeImportBorrow {
  /** Borrowed read-only inputs. Consumers must copy before mutating, never clear or transfer. */
  readonly result: AssetImport;
  release(): void;
}

export interface NativeImportReview {
  readonly origin: NativeImportOrigin;
  readonly summary: NativeImportSummary;
  readonly disposed: boolean;
  borrow(): NativeImportBorrow;
  assertCurrent(
    session: object,
    projectId: string,
    revision: number,
    readOnly?: boolean,
    closed?: boolean,
  ): void;
  /** Retires the initial owner; existing decoder/renderer/save borrowers keep their ticket. */
  dispose(): void;
}

const adopted = new WeakSet<AssetImport>();
const hashPattern = /^[a-f0-9]{64}$/;
function fail(reason: string): never {
  throw new Error(`取り込み確認: ${reason}`);
}

/** Bound traversal before canonical validation or JSON allocation, including cycles/depth. */
function boundProject(value: unknown): { jsonBytes: number; structureBytes: number } {
  let bytes = 0;
  let values = 0;
  let containers = 0;
  const ancestors = new Set<object>();
  function add(count: number) {
    bytes += count;
    assertIoBudget(bytes, P.jsonBytes, 'Imported project JSON');
  }
  function string(value: string) {
    add(2);
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) add(2);
      else if (code < 32) add(6);
      else if (code < 128) add(1);
      else if (code < 2048) add(2);
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(i + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          add(4);
          i++;
        } else add(6);
      } else if (code >= 0xdc00 && code <= 0xdfff) add(6);
      else add(3);
    }
  }
  function visit(value: unknown, depth: number) {
    assertIoBudget(++values, P.decodedAccessorValues, 'Imported canonical values');
    assertIoBudget(depth, P.jsonDepth, 'Imported project depth');
    if (typeof value === 'string') string(value);
    else if (typeof value === 'number' && Number.isFinite(value)) add(String(value).length);
    else if (typeof value === 'boolean') add(value ? 4 : 5);
    else if (value === null) add(4);
    else if (typeof value === 'object') {
      if (ancestors.has(value)) fail('循環したデータは確認できません。');
      if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        fail('JSON以外のデータは確認できません。');
      ancestors.add(value);
      containers++;
      add(2);
      if (Array.isArray(value)) {
        assertIoBudget(value.length, P.decodedAccessorValues, 'Imported array length');
        for (let i = 0; i < value.length; i++) {
          if (i) add(1);
          const descriptor = Object.getOwnPropertyDescriptor(value, i);
          if (!descriptor || !('value' in descriptor)) fail('不正な配列です。');
          visit(descriptor.value, depth + 1);
        }
      } else {
        let index = 0;
        for (const key of Object.keys(value)) {
          if (index++) add(1);
          string(key);
          add(1);
          const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
          if (!('value' in descriptor)) fail('不正なプロパティです。');
          visit(descriptor.value, depth + 1);
        }
      }
      ancestors.delete(value);
    } else fail('JSON以外の値は確認できません。');
  }
  visit(value, 0);
  return { jsonBytes: bytes, structureBytes: containers * 96 + values * 16 };
}

function boundProfile(project: Project3D): number {
  assertIoBudget(project.nodes.length, P.nodes, 'Imported nodes');
  assertIoBudget(project.clips.length, P.clips, 'Imported clips');
  let vertices = 0;
  let triangles = 0;
  let joints = 0;
  let keys = 0;
  for (const mesh of project.meshes) {
    vertices += mesh.vertices.length;
    for (const face of mesh.faces) {
      if (face.vertexIds.length !== 3) fail('GLBの確認には三角形の面が必要です。');
      triangles++;
    }
  }
  for (const skin of project.skins) {
    assertIoBudget(skin.joints.length, P.joints, 'Imported skin joints');
    joints += skin.joints.length;
  }
  for (const clip of project.clips) for (const track of clip.tracks) keys += track.keys.length;
  assertIoBudget(vertices, P.vertices, 'Imported vertices');
  assertIoBudget(triangles, P.triangles, 'Imported triangles');
  assertIoBudget(keys, P.keys, 'Imported keys');
  const parents = new Map(project.nodes.map((node) => [node.id, node.parentId]));
  for (const node of project.nodes) {
    let depth = 1;
    let parent = node.parentId;
    while (parent !== null) {
      assertIoBudget(++depth, P.hierarchyDepth, 'Imported hierarchy depth');
      parent = parents.get(parent) ?? null;
    }
  }
  return vertices * 512 + triangles * 768 + joints * 1024 + keys * 160;
}

/**
 * Adopt one successful, strictly validated worker result. This does not import, hash, save,
 * decode or edit anything. The worker already checked content hashes; this boundary checks
 * canonical/profile limits and complete references again before admitting review ownership.
 * The caller transfers exclusive ownership and must not mutate the result afterward.
 */
export function createNativeImportReview(
  result: AssetImport,
  origin: NativeImportOrigin,
  extraWorkingBytes = 0,
): NativeImportReview {
  if (
    !origin ||
    !origin.session ||
    typeof origin.session !== 'object' ||
    typeof origin.projectId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(origin.projectId) ||
    !Number.isSafeInteger(origin.revision) ||
    origin.revision < 0
  )
    fail('確認元の作品情報が不正です。');
  assertIoBudget(extraWorkingBytes, P.estimatedPeakBytes, 'Imported working bytes');
  if (
    !result ||
    typeof result !== 'object' ||
    Object.keys(result).length !== 4 ||
    !['project', 'blobs', 'losses', 'sourceHash'].every((key) => Object.hasOwn(result, key)) ||
    !(result.blobs instanceof Map) ||
    typeof result.sourceHash !== 'string' ||
    !hashPattern.test(result.sourceHash) ||
    !Array.isArray(result.losses) ||
    result.losses.length > 256 ||
    !Array.from(result.losses).every(
      (loss) => typeof loss === 'string' && loss.length > 0 && loss.length <= 4096,
    )
  )
    fail('読み込み結果の識別情報が不正です。');
  if (adopted.has(result)) fail('同じ読み込み結果は再利用できません。');
  const { jsonBytes, structureBytes } = boundProject(result.project);
  // Avoid invoking graph validation on an unbounded worker message.
  if (Array.isArray(result.project?.nodes))
    assertIoBudget(result.project.nodes.length, P.nodes, 'Imported nodes');
  if (Array.isArray(result.project?.clips))
    assertIoBudget(result.project.clips.length, P.clips, 'Imported clips');
  validateProject(result.project);
  const project = result.project;
  const geometryBytes = boundProfile(project);
  if (project.id === origin.projectId) fail('現在の作品とは別のコピーが必要です。');
  if (result.blobs.size !== project.blobIds.length) fail('原本の参照と内容が一致しません。');
  const ids = new Set(project.blobIds);
  const buffers = new Set<ArrayBufferLike>();
  let totalBlobBytes = 0;
  let backingBytes = 0;
  for (const [hash, bytes] of result.blobs) {
    if (
      typeof hash !== 'string' ||
      !hashPattern.test(hash) ||
      !ids.has(hash) ||
      !(bytes instanceof Uint8Array) ||
      !(bytes.buffer instanceof ArrayBuffer) ||
      !bytes.byteLength
    )
      fail('取り込んだ原本の内容または参照が不正です。');
    assertIoBudget(bytes.byteLength, P.sourceBytes, 'Imported source');
    totalBlobBytes += bytes.byteLength;
    if (!buffers.has(bytes.buffer)) {
      backingBytes += bytes.buffer.byteLength;
      buffers.add(bytes.buffer);
    }
    assertIoBudget(totalBlobBytes, P.totalBlobBytes, 'Imported blobs');
    assertIoBudget(backingBytes, P.totalBlobBytes, 'Imported backing buffers');
  }
  if (
    !result.blobs.has(result.sourceHash) ||
    !project.sources.some(
      (source) => source.blobId === result.sourceHash && source.mimeType === 'model/gltf-binary',
    )
  )
    fail('保持する原本GLBが見つかりません。');
  const estimatedBytes =
    jsonBytes * 4 +
    Math.max(structureBytes, geometryBytes) +
    Math.max(totalBlobBytes, backingBytes) * 4 +
    result.losses.reduce((sum, loss) => sum + loss.length * 4 + 64, 0) +
    extraWorkingBytes;
  const releaseReservation = reserveAssetIoBytes(estimatedBytes);
  try {
    const frozenOrigin = Object.freeze({ ...origin });
    const summary: NativeImportSummary = Object.freeze({
      projectId: project.id,
      projectName: project.name,
      sourceHash: result.sourceHash,
      losses: Object.freeze([...result.losses]),
      nodeCount: project.nodes.length,
      meshCount: project.meshes.length,
      materialCount: project.materials.length,
      clipCount: project.clips.length,
      sourceCount: project.sources.length,
      totalBlobBytes,
      estimatedBytes,
    });
    let retained: AssetImport | null = result;
    let references = 1;
    let disposed = false;
    function release() {
      if (--references !== 0) return;
      retained = null;
      // Drop ownership, never clear or detach arrays still visible to an external alias.
      releaseReservation();
    }
    const review = Object.freeze<NativeImportReview>({
      origin: frozenOrigin,
      summary,
      get disposed() {
        return disposed;
      },
      borrow() {
        if (disposed || !retained) fail('この確認は終了しています。');
        references++;
        let released = false;
        return Object.freeze({
          get result() {
            if (released || !retained) fail('この確認データの利用は終了しています。');
            return retained;
          },
          release() {
            if (released) return;
            released = true;
            release();
          },
        });
      },
      assertCurrent(session, projectId, revision, readOnly = false, closed = false) {
        if (
          disposed ||
          readOnly ||
          closed ||
          session !== frozenOrigin.session ||
          projectId !== frozenOrigin.projectId ||
          revision !== frozenOrigin.revision
        )
          fail('確認元の作品や編集権限が変わりました。もう一度読み込んでください。');
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        release();
      },
    });
    adopted.add(result);
    return review;
  } catch (cause) {
    releaseReservation();
    throw cause;
  }
}

/** Synchronous admission authority; React state is only its rendered reflection. */
export function createNativeImportConfirmation() {
  let ready: NativeImportReview | null = null;
  let acknowledged: NativeImportReview | null = null;
  return {
    updateReady(review: NativeImportReview, value: boolean) {
      if (value && !review.disposed) {
        if (ready !== review) acknowledged = null;
        ready = review;
      } else {
        if (ready === review) ready = null;
        if (acknowledged === review) acknowledged = null;
      }
    },
    acknowledge(review: NativeImportReview, value: boolean): boolean {
      acknowledged = value && ready === review && !review.disposed ? review : null;
      return acknowledged === review;
    },
    allows(review: NativeImportReview): boolean {
      return !review.disposed && ready === review && acknowledged === review;
    },
    clear() {
      ready = null;
      acknowledged = null;
    },
  };
}
