import type { Project3D } from '../../core3d/model/project';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import { reserveNativeTextureBytes } from '../../core3d/model/textureResources';
import type { NativeTextureSnapshot } from '../../core3d/ports/renderPort';
import {
  decodeNativeImage,
  inspectNativeImage,
  estimateNativeImageOperationBytes,
  waitForNativeImageOperations,
} from './nativeImage';

export type NativeBlobReader = (hash: string) => Uint8Array | null | undefined;
type TextureImage = NativeTextureSnapshot extends ReadonlyMap<string, infer Image> ? Image : never;
type ImageInfo = { width: number; height: number; mimeType: 'image/png' | 'image/jpeg' };
interface ImageCodec {
  wait?: () => Promise<void>;
  inspect: (bytes: Uint8Array) => ImageInfo;
  decode: (bytes: Uint8Array, signal?: AbortSignal) => Promise<ImageInfo & TextureImage>;
}

function cancelled(): never {
  throw new DOMException('Texture preparation was cancelled.', 'AbortError');
}
export function isTexturePreparationCancelled(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}
export function nativeTexturePixels(textures: NativeTextureSnapshot): number {
  let pixels = 0;
  for (const image of textures.values()) pixels += image.width * image.height;
  return pixels;
}

/** Every canonical material reference is checked, including currently unassigned materials. */
function textureReferences(project: Project3D): Set<string> {
  const hashes = new Set<string>();
  const materials = new Map(project.materials.map((material) => [material.id, material]));
  for (const material of project.materials) {
    if (material.textureBlobId === undefined) continue;
    if (
      !/^[a-f0-9]{64}$/.test(material.textureBlobId) ||
      !project.blobIds.includes(material.textureBlobId)
    )
      throw new Error('テクスチャの素材参照が見つかりません。');
    hashes.add(material.textureBlobId);
  }
  for (const mesh of project.meshes)
    for (const face of mesh.faces) {
      if (!face.materialId || !materials.get(face.materialId)?.textureBlobId) continue;
      if (
        !face.uv ||
        face.uv.length !== face.vertexIds.length ||
        face.uv.some((uv) => uv.length !== 2 || uv.some((value) => !Number.isFinite(value)))
      )
        throw new Error('テクスチャを表示する面には、すべての頂点に有効なUVが必要です。');
    }
  return hashes;
}

function guardBytes(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes > NATIVE_TEXTURE_PROFILE.maxOperationBytes)
    throw new Error('テクスチャの表示準備に必要なメモリが初期評価上限を超えています。');
}
function validateInfo(info: ImageInfo): number {
  const { width, height, mimeType } = info;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > NATIVE_TEXTURE_PROFILE.maxEdge ||
    height > NATIVE_TEXTURE_PROFILE.maxEdge ||
    !['image/png', 'image/jpeg'].includes(mimeType)
  )
    throw new Error('このテクスチャの形式または画像サイズには対応していません。');
  return width * height;
}

/**
 * One panel/project/session owns this cache. Superseded jobs are serialized until their
 * decoder releases its resources, even when the browser cannot interrupt the decode itself.
 * No result enters the cache before every source and the complete revision have succeeded.
 * Returned maps borrow this cache until its next preparation/clear; the synchronous
 * renderer port must detach its own copy before another preparation can replace it.
 */
export class NativeTexturePreparer {
  private cache = new Map<string, TextureImage>();
  private cacheReleases = new Map<string, () => void>();
  private working = false;
  private generation = 0;
  private controller: AbortController | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly codec: ImageCodec = {
      inspect: inspectNativeImage,
      decode: decodeNativeImage,
      wait: waitForNativeImageOperations,
    },
  ) {}

  cancel(clearCache = false): void {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    if (clearCache) {
      const retired = this.cache;
      const releases = this.cacheReleases;
      this.cache = new Map();
      this.cacheReleases = new Map();
      const release = () => {
        retired.clear();
        for (const relinquish of releases.values()) relinquish();
        releases.clear();
      };
      // A pending batch may still borrow cached arrays. Retire its ownership only
      // after that batch has dropped every reference, even following cancellation.
      if (this.working) void this.tail.then(release);
      else release();
    }
  }

  prepare(
    project: Project3D,
    readBlob: NativeBlobReader | undefined,
    retainedRendererPixels = 0,
  ): Promise<NativeTextureSnapshot> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const check = () => {
      if (generation !== this.generation || controller.signal.aborted) cancelled();
    };
    const outputReleases = new Map<string, () => void>();
    let prepared: Map<string, TextureImage> | null = null;
    const operation = this.tail
      .catch(() => undefined)
      .then(async () => {
        this.working = true;
        await this.codec.wait?.();
        check();
        const hashes = textureReferences(project);
        for (const hash of this.cache.keys())
          if (!hashes.has(hash)) {
            this.cache.delete(hash);
            this.cacheReleases.get(hash)?.();
            this.cacheReleases.delete(hash);
          }
        if (!hashes.size) return new Map<string, TextureImage>();
        if (!readBlob)
          throw new Error('テクスチャの元画像を読み取れません。素材の保存状態を確認してください。');
        const cacheBytes = nativeTexturePixels(this.cache) * 4;
        // Count the renderer source image, upload array, and estimated RGBA GPU storage.
        const retainedBytes = retainedRendererPixels * 12;
        const metadata = new Map<string, ImageInfo & { byteLength: number }>();
        let totalPixels = 0;
        let encodedBytes = 0;
        let largestOperation = 0;
        let missingBytes = 0;
        const read = (hash: string) => {
          check();
          // readBlob returns a copy. Reserve the largest admitted input before that copy exists.
          guardBytes(
            retainedBytes +
              cacheBytes +
              NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes +
              NATIVE_TEXTURE_PROFILE.maxFileBytes,
          );
          const release = reserveNativeTextureBytes(
            'viewport texture input copy',
            NATIVE_TEXTURE_PROFILE.maxFileBytes,
          );
          try {
            const bytes = readBlob(hash);
            if (!bytes?.byteLength) throw new Error(`テクスチャの元画像が見つかりません: ${hash}`);
            if (bytes.byteLength > NATIVE_TEXTURE_PROFILE.maxFileBytes)
              throw new Error('テクスチャの元画像がファイルサイズ上限を超えています。');
            return { bytes, release };
          } catch (cause) {
            release();
            throw cause;
          }
        };
        // Inspect every image before the first decoder/canvas allocation. Encoded copies are
        // short lived; decode reads again only after the aggregate budget has passed.
        for (const hash of hashes) {
          const input = read(hash);
          try {
            const { bytes } = input;
            const info = this.codec.inspect(bytes);
            const pixels = validateInfo(info);
            for (const source of project.sources)
              if (source.blobId === hash && source.mimeType !== info.mimeType)
                throw new Error('テクスチャの画像形式と保存された素材情報が一致しません。');
            metadata.set(hash, { ...info, byteLength: bytes.byteLength });
            totalPixels += pixels;
            encodedBytes += bytes.byteLength;
            if (!this.cache.has(hash)) {
              missingBytes += pixels * 4;
              largestOperation = Math.max(
                largestOperation,
                estimateNativeImageOperationBytes(info, bytes.byteLength),
              );
            }
            if (totalPixels > NATIVE_TEXTURE_PROFILE.maxTotalPixels)
              throw new Error('テクスチャの合計画素数が初期評価上限を超えています。');
            if (encodedBytes > NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes)
              throw new Error('テクスチャ元画像の合計サイズが初期評価上限を超えています。');
          } finally {
            input.release();
          }
        }
        // Conservative engineering estimate: source bytes, old cache/renderer images, all
        // pending outputs, decoder bitmap/canvas/readback, and the new renderer copies.
        // The session owns originals/history too. Reserve its entire encoded allowance,
        // not just the material sources decoded by this panel.
        const baseBytes =
          retainedBytes +
          cacheBytes +
          missingBytes +
          NATIVE_TEXTURE_PROFILE.maxRetainedEncodedBytes;
        guardBytes(Math.max(baseBytes + largestOperation, baseBytes + totalPixels * 12));
        prepared = new Map<string, TextureImage>();
        for (const [hash, info] of metadata) {
          check();
          let image = this.cache.get(hash);
          if (!image) {
            // Own the output before the codec allocates it; its own ticket covers
            // transient decoder resources, not the panel's retained pixel cache.
            outputReleases.set(
              hash,
              reserveNativeTextureBytes(
                'viewport decoded texture cache',
                info.width * info.height * 4,
              ),
            );
            const input = read(hash);
            try {
              const { bytes } = input;
              const checked = this.codec.inspect(bytes);
              if (
                bytes.byteLength !== info.byteLength ||
                checked.width !== info.width ||
                checked.height !== info.height ||
                checked.mimeType !== info.mimeType
              )
                throw new Error('表示準備中にテクスチャの元画像が変更されました。');
              const decoded = await this.codec.decode(bytes, controller.signal);
              check();
              if (
                decoded.width !== info.width ||
                decoded.height !== info.height ||
                decoded.mimeType !== info.mimeType ||
                !(decoded.pixels instanceof Uint8Array) ||
                decoded.pixels.byteLength !== info.width * info.height * 4
              )
                throw new Error('テクスチャの画像データを正しく展開できませんでした。');
              image = { width: decoded.width, height: decoded.height, pixels: decoded.pixels };
            } finally {
              input.release();
            }
          } else if (image.width !== info.width || image.height !== info.height) {
            throw new Error('保存されたテクスチャの画像サイズが変更されました。');
          }
          prepared.set(hash, image);
        }
        check();
        // Transfer successful new output tickets to the cache. Reused entries
        // keep their original ownership ticket; no duplicate reservation is made.
        this.cache.clear();
        this.cache = prepared;
        for (const [hash, release] of outputReleases) this.cacheReleases.set(hash, release);
        outputReleases.clear();
        return prepared;
      })
      .finally(() => {
        this.working = false;
        if (prepared !== this.cache) prepared?.clear();
        for (const release of outputReleases.values()) release();
        outputReleases.clear();
      });
    this.tail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }
}
