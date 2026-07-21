import { decodeImageSource } from './decodeImageSource';
import {
  ImageImportError,
  checkImageDimensions,
  encodeDecodedImageRegion,
  encodeDecodedThumbnail,
  type DecodedImage,
  type EncodedThumbnail,
} from './importImage';
import type { AnimatedImagePreflight, AnimationRepetition } from './imageInputSafety';

export const DEFAULT_OPTIONAL_ANIMATION_FPS = 8;
export const MIN_ANIMATION_FPS = 1;
export const MAX_ANIMATION_FPS = 240;

export interface UniformAnimationTiming {
  fps: number;
  /** 元sourceの合計時間。現行再生・exportでは参照しないinformational値。 */
  durationMs?: number;
  playbackDurationMs: number;
  variableDurations: boolean;
  missingDuration: boolean;
  rounded: boolean;
  clamped: boolean;
}

export function deriveUniformAnimationTiming(
  durationsMicroseconds: readonly (number | null)[],
): UniformAnimationTiming {
  const frameCount = durationsMicroseconds.length;
  if (frameCount < 1) {
    throw new ImageImportError('animation frameは1件以上必要です。', { kind: 'frame-count' });
  }
  const missingDuration = durationsMicroseconds.some(
    (duration) => duration === null || !Number.isFinite(duration) || duration <= 0,
  );
  if (missingDuration) {
    return {
      fps: DEFAULT_OPTIONAL_ANIMATION_FPS,
      playbackDurationMs: (frameCount / DEFAULT_OPTIONAL_ANIMATION_FPS) * 1000,
      variableDurations: false,
      missingDuration: true,
      rounded: false,
      clamped: false,
    };
  }

  const durations = durationsMicroseconds as number[];
  const totalMicroseconds = durations.reduce((sum, duration) => sum + duration, 0);
  const rawFps = (frameCount * 1_000_000) / totalMicroseconds;
  const roundedFps = Math.round(rawFps);
  const fps = Math.min(MAX_ANIMATION_FPS, Math.max(MIN_ANIMATION_FPS, roundedFps));
  return {
    fps,
    durationMs: totalMicroseconds / 1000,
    playbackDurationMs: (frameCount / fps) * 1000,
    variableDurations: new Set(durations).size > 1,
    missingDuration: false,
    rounded: Math.abs(rawFps - roundedFps) > 1e-9,
    clamped: roundedFps < MIN_ANIMATION_FPS || roundedFps > MAX_ANIMATION_FPS,
  };
}

export interface EncodedAnimatedImage {
  frames: Blob[];
  thumbnail: EncodedThumbnail;
  size: { width: number; height: number };
  durationsMicroseconds: Array<number | null>;
  repetition: AnimationRepetition;
  usedFallback: boolean;
}

function decodedVideoFrame(frame: VideoFrame): DecodedImage {
  return {
    source: frame,
    width: frame.displayWidth,
    height: frame.displayHeight,
    close: () => frame.close(),
  };
}

function assertDecodedDimensions(decoded: DecodedImage): void {
  const dimensionError = checkImageDimensions(decoded.width, decoded.height);
  if (dimensionError) {
    throw new ImageImportError(dimensionError, { kind: 'dimension' });
  }
}

async function encodeFrame(decoded: DecodedImage): Promise<Blob> {
  return encodeDecodedImageRegion(decoded, {
    x: 0,
    y: 0,
    width: decoded.width,
    height: decoded.height,
  });
}

async function decodeFirstFrameFallback(
  blob: Blob,
  repetition: AnimationRepetition,
): Promise<EncodedAnimatedImage> {
  let decoded: DecodedImage;
  try {
    decoded = await decodeImageSource(blob);
  } catch (error) {
    throw new ImageImportError(
      '画像をデコードできませんでした。ファイルが壊れている可能性があります。',
      { cause: error, kind: 'decode' },
    );
  }
  try {
    assertDecodedDimensions(decoded);
    const [editBlob, thumbnail] = await Promise.all([
      encodeFrame(decoded),
      encodeDecodedThumbnail(decoded),
    ]);
    return {
      frames: [editBlob],
      thumbnail,
      size: { width: decoded.width, height: decoded.height },
      durationsMicroseconds: [null],
      repetition,
      usedFallback: true,
    };
  } finally {
    decoded.close();
  }
}

function isNotSupportedError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotSupportedError';
}

/**
 * WebCodecs対応時は全frameを逐次PNG化し、各VideoFrameを即時解放する。
 * API不在・MIME非対応だけを先頭frame fallbackへ送り、bad-dataはdecode失敗として返す。
 */
export async function decodeAnimatedImage(
  blob: Blob,
  bytes: Uint8Array,
  canonicalMimeType: 'image/gif' | 'image/png',
  preflight: AnimatedImagePreflight,
): Promise<EncodedAnimatedImage> {
  const Decoder = globalThis.ImageDecoder;
  if (typeof Decoder !== 'function') {
    return decodeFirstFrameFallback(blob, preflight.repetition);
  }

  let supported: boolean;
  try {
    supported = await Decoder.isTypeSupported(canonicalMimeType);
  } catch (error) {
    throw new ImageImportError('この環境ではanimated画像の対応状況を確認できません。', {
      cause: error,
      kind: 'environment',
    });
  }
  if (!supported) {
    return decodeFirstFrameFallback(blob, preflight.repetition);
  }

  let decoder: ImageDecoder;
  try {
    decoder = new Decoder({
      data: bytes,
      type: canonicalMimeType,
      preferAnimation: true,
    });
  } catch (error) {
    if (isNotSupportedError(error)) {
      return decodeFirstFrameFallback(blob, preflight.repetition);
    }
    throw new ImageImportError('animated画像decoderを初期化できませんでした。', {
      cause: error,
      kind: 'decode',
    });
  }

  try {
    await Promise.all([decoder.tracks.ready, decoder.completed]);
    const track = decoder.tracks.selectedTrack;
    if (!track) {
      throw new ImageImportError('animated画像の表示trackを取得できませんでした。', {
        kind: 'decode',
      });
    }
    if (track.frameCount !== preflight.frameCount) {
      throw new ImageImportError(
        `画像の宣言frame数とdecoder結果が一致しません（宣言 ${preflight.frameCount} / decode ${track.frameCount}）。`,
        { kind: 'decode' },
      );
    }

    const frames: Blob[] = [];
    const durationsMicroseconds: Array<number | null> = [];
    let thumbnail: EncodedThumbnail | null = null;
    let size: { width: number; height: number } | null = null;
    for (let frameIndex = 0; frameIndex < track.frameCount; frameIndex += 1) {
      const result = await decoder.decode({ frameIndex, completeFramesOnly: true });
      const decoded = decodedVideoFrame(result.image);
      try {
        assertDecodedDimensions(decoded);
        if (size && (decoded.width !== size.width || decoded.height !== size.height)) {
          throw new ImageImportError(
            `animated画像のframe寸法が一致しません（先頭 ${size.width} x ${size.height} / frame ${
              frameIndex + 1
            } ${decoded.width} x ${decoded.height}）。`,
            { kind: 'decode' },
          );
        }
        size ??= { width: decoded.width, height: decoded.height };
        if (frameIndex === 0) {
          thumbnail = await encodeDecodedThumbnail(decoded);
        }
        frames.push(await encodeFrame(decoded));
        durationsMicroseconds.push(result.image.duration);
      } finally {
        decoded.close();
      }
    }
    if (!size || !thumbnail || frames.length < 1) {
      throw new ImageImportError('animated画像からframeを生成できませんでした。', {
        kind: 'decode',
      });
    }
    return {
      frames,
      thumbnail,
      size,
      durationsMicroseconds,
      // repeatの正本はcodec解釈ではなく、decode前のbounded preflight結果とする。
      repetition: preflight.repetition,
      usedFallback: false,
    };
  } catch (error) {
    if (error instanceof ImageImportError) {
      throw error;
    }
    throw new ImageImportError(
      'animated画像を全frameデコードできませんでした。ファイルが壊れている可能性があります。',
      { cause: error, kind: 'decode' },
    );
  } finally {
    decoder.close();
  }
}
