/**
 * 簡易リグの純関数群（Phase 15）。
 * ブラウザ API に依存しない。2D アフィン変換でパーツのローカルポーズ・ワールド変換・
 * キーフレーム補間・フレームアニメーションへの焼き込み（bake）を行う。
 */
import type { Animation, Frame, FrameLayerState } from '../model/animation';
import type { Asset } from '../model/asset';
import type { Vec2 } from '../model/common';
import { generateId } from '../model/factories';
import type { Part, PartPose } from '../model/part';
import type { RigAnimation } from '../model/rig';

/**
 * 2D アフィン変換行列（列優先）。点への適用は以下の通り。
 * x' = a*x + c*y + e
 * y' = b*x + d*y + f
 */
export interface Mat2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function identity(): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/**
 * m1 と m2 を合成する。結果を点 p に適用すると m1(m2(p)) となる
 * （m2 が先に適用され、その結果へ m1 が適用される）。
 */
export function multiply(m1: Mat2D, m2: Mat2D): Mat2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function applyPoint(m: Mat2D, p: Vec2): Vec2 {
  return {
    x: m.a * p.x + m.c * p.y + m.e,
    y: m.b * p.x + m.d * p.y + m.f,
  };
}

export function translation(x: number, y: number): Mat2D {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function rotationDeg(deg: number): Mat2D {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

export function scaleMat(sx: number, sy: number): Mat2D {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const DEFAULT_POSE: Required<PartPose> = {
  localPosition: { x: 0, y: 0 },
  localRotation: 0,
  localScale: { x: 1, y: 1 },
};

/**
 * kfPose（キーフレーム由来）、bindPose、既定値の順で解決した有効なポーズを返す。
 * rotationLimit があれば localRotation を可動域内に clamp する。
 */
export function effectivePose(part: Part, kfPose?: PartPose): Required<PartPose> {
  const bind = part.bindPose;
  const localPosition = kfPose?.localPosition ?? bind?.localPosition ?? DEFAULT_POSE.localPosition;
  let localRotation = kfPose?.localRotation ?? bind?.localRotation ?? DEFAULT_POSE.localRotation;
  const localScale = kfPose?.localScale ?? bind?.localScale ?? DEFAULT_POSE.localScale;
  if (part.rotationLimit) {
    localRotation = clamp(localRotation, part.rotationLimit.min, part.rotationLimit.max);
  }
  return { localPosition, localRotation, localScale };
}

/**
 * パーツのローカル変換行列。pivot（part.pivot ?? {x:0,y:0}）を中心に回転・拡縮し、
 * その後 localPosition だけ平行移動する。
 * T(localPosition) ∘ T(pivot) ∘ R(localRotation) ∘ S(localScale) ∘ T(-pivot)
 */
export function partLocalMatrix(part: Part, pose: Required<PartPose>): Mat2D {
  const pivot = part.pivot ?? { x: 0, y: 0 };
  return multiply(
    translation(pose.localPosition.x, pose.localPosition.y),
    multiply(
      translation(pivot.x, pivot.y),
      multiply(
        rotationDeg(pose.localRotation),
        multiply(scaleMat(pose.localScale.x, pose.localScale.y), translation(-pivot.x, -pivot.y)),
      ),
    ),
  );
}

/**
 * partId から parentId を辿り、root → leaf の順に並べたパーツ配列を返す。
 * 循環（訪問済み id への再訪）を検出した時点で、それ以上は辿らず打ち切る。
 */
function collectChain(asset: Asset, partId: string): Part[] {
  const partsById = new Map(asset.parts.map((part) => [part.id, part] as const));
  const chain: Part[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = partId;
  while (currentId && !visited.has(currentId)) {
    const part = partsById.get(currentId);
    if (!part) {
      break;
    }
    visited.add(currentId);
    chain.push(part);
    currentId = part.parentId;
  }
  return chain.reverse(); // root -> leaf
}

/** partId のワールド変換行列。parentId を辿り、親から順に合成する（root → leaf）。 */
export function partWorldMatrix(
  asset: Asset,
  partId: string,
  poses: Record<string, PartPose>,
): Mat2D {
  const chain = collectChain(asset, partId);
  let world = identity();
  for (const part of chain) {
    const pose = effectivePose(part, poses[part.id]);
    world = multiply(world, partLocalMatrix(part, pose));
  }
  return world;
}

/**
 * partId までのチェーン（root → leaf、自身を含む）上の localRotation 合計と
 * localScale の成分積を返す。bakeRigAnimation でレイヤー transform に反映するために使う。
 */
export function accumulatePartChain(
  asset: Asset,
  partId: string,
  poses: Record<string, PartPose>,
): { rotation: number; scale: Vec2 } {
  const chain = collectChain(asset, partId);
  let rotation = 0;
  let scale: Vec2 = { x: 1, y: 1 };
  for (const part of chain) {
    const pose = effectivePose(part, poses[part.id]);
    rotation += pose.localRotation;
    scale = { x: scale.x * pose.localScale.x, y: scale.y * pose.localScale.y };
  }
  return { rotation, scale };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/**
 * 2 つのポーズをフィールド単位で補間する。両方に存在するフィールドのみ補間し、
 * 片方だけに存在する場合はその値をそのまま使う。どちらにも無ければ省略する。
 */
function interpolatePosePair(
  a: PartPose | undefined,
  b: PartPose | undefined,
  t: number,
): PartPose {
  const pose: PartPose = {};

  const localPosition =
    a?.localPosition && b?.localPosition
      ? lerpVec2(a.localPosition, b.localPosition, t)
      : (a?.localPosition ?? b?.localPosition);
  if (localPosition) {
    pose.localPosition = localPosition;
  }

  const localRotation =
    a?.localRotation !== undefined && b?.localRotation !== undefined
      ? lerp(a.localRotation, b.localRotation, t)
      : (a?.localRotation ?? b?.localRotation);
  if (localRotation !== undefined) {
    pose.localRotation = localRotation;
  }

  const localScale =
    a?.localScale && b?.localScale
      ? lerpVec2(a.localScale, b.localScale, t)
      : (a?.localScale ?? b?.localScale);
  if (localScale) {
    pose.localScale = localScale;
  }

  return pose;
}

function interpolatePoseMaps(
  a: Record<string, PartPose>,
  b: Record<string, PartPose>,
  t: number,
): Record<string, PartPose> {
  const partIds = new Set([...Object.keys(a), ...Object.keys(b)]);
  const result: Record<string, PartPose> = {};
  for (const partId of partIds) {
    result[partId] = interpolatePosePair(a[partId], b[partId], t);
  }
  return result;
}

/**
 * time（0〜1）における各パーツのポーズを、前後の keyframe から線形補間して返す。
 * keyframes は time 昇順にソートしてから使う。範囲外の time は端の keyframe をそのまま返す。
 * keyframes が空なら {} を返す。
 */
export function interpolateRigPoses(rig: RigAnimation, time: number): Record<string, PartPose> {
  const keyframes = [...rig.keyframes].sort((a, b) => a.time - b.time);
  if (keyframes.length === 0) {
    return {};
  }
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (keyframes.length === 1 || time <= first.time) {
    return first.poses;
  }
  if (time >= last.time) {
    return last.poses;
  }
  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const prev = keyframes[i];
    const next = keyframes[i + 1];
    if (time >= prev.time && time <= next.time) {
      const span = next.time - prev.time;
      const ratio = span === 0 ? 0 : (time - prev.time) / span;
      return interpolatePoseMaps(prev.poses, next.poses, ratio);
    }
  }
  return last.poses;
}

/**
 * RigAnimation を fps と durationMs からサンプリングし、通常のフレームアニメーションへ焼き込む。
 * 既存の frames / animations は変更せず、新しい Frame 群と Animation を追加した Asset を返す。
 *
 * レイヤー transform の rotation はテクスチャ中心基準（6.2）のため、パーツの pivot 中心回転は
 * レイヤー中心の移動 + rotation 加算に分解して反映する。
 * 非等方 scale と回転が組み合わさるスキュー（せん断）は簡易リグでは考慮しない
 * （accumulatePartChain は回転合計と scale 成分積のみを扱う）。
 */
export function bakeRigAnimation(asset: Asset, rig: RigAnimation): Asset {
  const frameCount = Math.max(1, Math.round((rig.durationMs / 1000) * rig.fps));
  const newFrames: Frame[] = [];

  for (let i = 0; i < frameCount; i += 1) {
    const t = frameCount === 1 ? 0 : i / (frameCount - 1);
    const poses = interpolateRigPoses(rig, t);
    const layerStates: FrameLayerState[] = [];

    for (const part of asset.parts) {
      const world = partWorldMatrix(asset, part.id, poses);
      const accum = accumulatePartChain(asset, part.id, poses);

      for (const layerId of part.layerIds) {
        const layer = asset.layers.find((candidate) => candidate.id === layerId);
        if (!layer) {
          continue;
        }
        const texture = asset.textures.find((candidate) => candidate.id === layer.textureId);
        if (!texture) {
          continue;
        }

        const center0: Vec2 = {
          x: layer.transform.position.x + (texture.size.width * layer.transform.scale.x) / 2,
          y: layer.transform.position.y + (texture.size.height * layer.transform.scale.y) / 2,
        };
        const center1 = applyPoint(world, center0);

        const rotation = layer.transform.rotation + accum.rotation;
        const scale: Vec2 = {
          x: layer.transform.scale.x * accum.scale.x,
          y: layer.transform.scale.y * accum.scale.y,
        };
        const position: Vec2 = {
          x: center1.x - (texture.size.width * scale.x) / 2,
          y: center1.y - (texture.size.height * scale.y) / 2,
        };

        layerStates.push({ layerId, transform: { position, scale, rotation } });
      }
    }

    newFrames.push({
      id: generateId('frame'),
      name: `${rig.name}_${i + 1}`,
      layerStates,
    });
  }

  const animation: Animation = {
    id: generateId('animation'),
    name: rig.name,
    fps: rig.fps,
    loop: rig.loop,
    frameIds: newFrames.map((frame) => frame.id),
  };

  return {
    ...asset,
    frames: [...(asset.frames ?? []), ...newFrames],
    animations: [...asset.animations, animation],
    updatedAt: new Date().toISOString(),
  };
}
