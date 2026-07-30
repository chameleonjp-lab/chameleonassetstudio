import type { Asset } from './asset';
import type { Frame, FrameLayerState } from './animation';
import { applyFrameToAsset } from './assetOps';
import type { LayerTransform } from './layer';

export interface FrameAlignmentSelection {
  assetId: string;
  animationId: string;
  referenceFrameId: string;
  targetFrameId: string;
}

export interface FrameAlignmentDelta {
  x: number;
  y: number;
}

export interface FrameAlignmentCandidate {
  id: string;
  name: string;
  firstOccurrenceIndex: number;
}

export interface FrameAlignmentImpact {
  animationCount: number;
  occurrenceCount: number;
}

export type FrameAlignmentFailureCode =
  | 'asset-changed'
  | 'animation-not-unique'
  | 'frame-not-in-animation'
  | 'frame-not-unique'
  | 'same-frame'
  | 'no-layers'
  | 'duplicate-layer-id'
  | 'missing-layer-state'
  | 'duplicate-layer-state'
  | 'unknown-layer-state'
  | 'invalid-transform'
  | 'invalid-delta'
  | 'invalid-result'
  | 'invalid-timestamp';

export interface FrameAlignmentFailure {
  ok: false;
  code: FrameAlignmentFailureCode;
  reason: string;
}

export interface FrameAlignmentInspection {
  selection: FrameAlignmentSelection;
  referenceFrame: Frame;
  targetFrame: Frame;
  impact: FrameAlignmentImpact;
}

export interface FrameAlignmentPreview extends FrameAlignmentInspection {
  delta: FrameAlignmentDelta;
  referenceAsset: Asset;
  targetAsset: Asset;
}

export interface FrameAlignmentApplied extends FrameAlignmentInspection {
  changed: boolean;
  asset: Asset;
}

export type FrameAlignmentResult<T> = { ok: true; value: T } | FrameAlignmentFailure;

function fail(code: FrameAlignmentFailureCode, reason: string): FrameAlignmentFailure {
  return { ok: false, code, reason };
}

function uniqueMatch<T extends { id: string }>(values: readonly T[], id: string): T[] {
  return values.filter((value) => value.id === id);
}

function finiteTransform(transform: LayerTransform | undefined): boolean {
  return (
    !!transform &&
    Number.isFinite(transform.position?.x) &&
    Number.isFinite(transform.position?.y) &&
    Number.isFinite(transform.scale?.x) &&
    Number.isFinite(transform.scale?.y) &&
    Number.isFinite(transform.rotation)
  );
}

function inspectFrameLayerStates(
  asset: Asset,
  frame: Frame,
  role: '基準' | '対象',
): FrameAlignmentFailure | null {
  if (asset.layers.length === 0) {
    return fail('no-layers', 'AssetにLayerがないため、Frame全体の位置を合わせられません。');
  }

  const assetLayerIds = new Set<string>();
  for (const layer of asset.layers) {
    if (assetLayerIds.has(layer.id)) {
      return fail('duplicate-layer-id', `Assetに同じLayer IDが複数あります: ${layer.id}`);
    }
    assetLayerIds.add(layer.id);
  }

  const statesByLayerId = new Map<string, FrameLayerState[]>();
  for (const state of frame.layerStates) {
    if (!assetLayerIds.has(state.layerId)) {
      return fail(
        'unknown-layer-state',
        `${role}Frameが存在しないLayerを参照しています: ${state.layerId}`,
      );
    }
    const states = statesByLayerId.get(state.layerId) ?? [];
    states.push(state);
    statesByLayerId.set(state.layerId, states);
  }

  for (const layer of asset.layers) {
    const states = statesByLayerId.get(layer.id) ?? [];
    if (states.length === 0) {
      return fail(
        'missing-layer-state',
        `${role}FrameにLayer「${layer.name}」の状態がありません。自動補完せず位置合わせを中止しました。`,
      );
    }
    if (states.length > 1) {
      return fail(
        'duplicate-layer-state',
        `${role}FrameにLayer「${layer.name}」の状態が複数あります。`,
      );
    }
    if (!finiteTransform(states[0].transform)) {
      return fail(
        'invalid-transform',
        `${role}FrameのLayer「${layer.name}」に完全な有限transformがありません。`,
      );
    }
  }

  return null;
}

function frameAlignmentImpact(asset: Asset, targetFrameId: string): FrameAlignmentImpact {
  let animationCount = 0;
  let occurrenceCount = 0;
  for (const animation of asset.animations) {
    const occurrences = animation.frameIds.filter((frameId) => frameId === targetFrameId).length;
    if (occurrences > 0) {
      animationCount += 1;
      occurrenceCount += occurrences;
    }
  }
  return { animationCount, occurrenceCount };
}

/**
 * 選択Animationが参照する実在Frameを、最初の出現順で重複除去する。
 * IDが重複するFrameは候補には残すが、選択後のpreflightで理由付き拒否する。
 */
export function frameAlignmentFrameCandidates(
  asset: Asset,
  animationId: string,
): FrameAlignmentResult<FrameAlignmentCandidate[]> {
  const animationMatches = uniqueMatch(asset.animations, animationId);
  if (animationMatches.length !== 1) {
    return fail(
      'animation-not-unique',
      animationMatches.length === 0
        ? `選択したAnimationが見つかりません: ${animationId}`
        : `同じAnimation IDが複数あります: ${animationId}`,
    );
  }

  const seen = new Set<string>();
  const candidates: FrameAlignmentCandidate[] = [];
  for (const [occurrenceIndex, frameId] of animationMatches[0].frameIds.entries()) {
    if (seen.has(frameId)) {
      continue;
    }
    seen.add(frameId);
    const frame = (asset.frames ?? []).find((candidate) => candidate.id === frameId);
    if (frame) {
      candidates.push({
        id: frame.id,
        name: frame.name,
        firstOccurrenceIndex: occurrenceIndex,
      });
    }
  }
  return { ok: true, value: candidates };
}

/** D4を開始・表示・確定する直前に共通して行うpreflight。 */
export function inspectFrameAlignment(
  asset: Asset,
  selection: FrameAlignmentSelection,
): FrameAlignmentResult<FrameAlignmentInspection> {
  if (asset.id !== selection.assetId) {
    return fail(
      'asset-changed',
      '位置合わせを開始したAssetから選択が変わりました。もう一度開始してください。',
    );
  }

  const candidateResult = frameAlignmentFrameCandidates(asset, selection.animationId);
  if (!candidateResult.ok) {
    return candidateResult;
  }
  const candidateIds = new Set(candidateResult.value.map((candidate) => candidate.id));
  if (!candidateIds.has(selection.referenceFrameId)) {
    return fail('frame-not-in-animation', '基準Frameは選択中Animationの候補ではありません。');
  }
  if (!candidateIds.has(selection.targetFrameId)) {
    return fail('frame-not-in-animation', '対象Frameは選択中Animationの候補ではありません。');
  }
  if (selection.referenceFrameId === selection.targetFrameId) {
    return fail('same-frame', '基準Frameと対象Frameには別のFrameを選んでください。');
  }

  const frames = asset.frames ?? [];
  const referenceMatches = uniqueMatch(frames, selection.referenceFrameId);
  if (referenceMatches.length !== 1) {
    return fail(
      'frame-not-unique',
      referenceMatches.length === 0
        ? `基準Frameが見つかりません: ${selection.referenceFrameId}`
        : `基準Frame IDが重複しています: ${selection.referenceFrameId}`,
    );
  }
  const targetMatches = uniqueMatch(frames, selection.targetFrameId);
  if (targetMatches.length !== 1) {
    return fail(
      'frame-not-unique',
      targetMatches.length === 0
        ? `対象Frameが見つかりません: ${selection.targetFrameId}`
        : `対象Frame IDが重複しています: ${selection.targetFrameId}`,
    );
  }

  const referenceError = inspectFrameLayerStates(asset, referenceMatches[0], '基準');
  if (referenceError) {
    return referenceError;
  }
  const targetError = inspectFrameLayerStates(asset, targetMatches[0], '対象');
  if (targetError) {
    return targetError;
  }

  return {
    ok: true,
    value: {
      selection,
      referenceFrame: referenceMatches[0],
      targetFrame: targetMatches[0],
      impact: frameAlignmentImpact(asset, selection.targetFrameId),
    },
  };
}

function inspectDelta(
  inspection: FrameAlignmentInspection,
  delta: FrameAlignmentDelta,
): FrameAlignmentFailure | null {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
    return fail('invalid-delta', 'XとYには有限な数値を入力してください。');
  }
  for (const state of inspection.targetFrame.layerStates) {
    const position = state.transform!.position;
    if (!Number.isFinite(position.x + delta.x) || !Number.isFinite(position.y + delta.y)) {
      return fail('invalid-result', '移動後の座標が有限値にならないため確定できません。');
    }
  }
  return null;
}

function moveTargetFrame(
  asset: Asset,
  targetFrameId: string,
  delta: FrameAlignmentDelta,
  updatedAt: string,
): Asset {
  return {
    ...asset,
    updatedAt,
    frames: (asset.frames ?? []).map((frame) =>
      frame.id !== targetFrameId
        ? frame
        : {
            ...frame,
            layerStates: frame.layerStates.map((state) => ({
              ...state,
              transform: {
                ...state.transform!,
                position: {
                  ...state.transform!.position,
                  x: state.transform!.position.x + delta.x,
                  y: state.transform!.position.y + delta.y,
                },
              },
            })),
          },
    ),
  };
}

/** 保存データを変えず、基準Frameと移動後の対象Frameを表示用Assetへ派生する。 */
export function previewFrameAlignment(
  asset: Asset,
  selection: FrameAlignmentSelection,
  delta: FrameAlignmentDelta,
): FrameAlignmentResult<FrameAlignmentPreview> {
  const inspection = inspectFrameAlignment(asset, selection);
  if (!inspection.ok) {
    return inspection;
  }
  const deltaError = inspectDelta(inspection.value, delta);
  if (deltaError) {
    return deltaError;
  }

  const previewSource = moveTargetFrame(asset, selection.targetFrameId, delta, asset.updatedAt);
  return {
    ok: true,
    value: {
      ...inspection.value,
      delta,
      referenceAsset: applyFrameToAsset(asset, selection.referenceFrameId),
      targetAsset: applyFrameToAsset(previewSource, selection.targetFrameId),
    },
  };
}

/** 対象Frame全体を1回だけ移動する。no-opと拒否では入力Asset参照を返す。 */
export function applyFrameAlignment(
  asset: Asset,
  selection: FrameAlignmentSelection,
  delta: FrameAlignmentDelta,
  now = new Date(),
): FrameAlignmentResult<FrameAlignmentApplied> {
  const inspection = inspectFrameAlignment(asset, selection);
  if (!inspection.ok) {
    return inspection;
  }
  const deltaError = inspectDelta(inspection.value, delta);
  if (deltaError) {
    return deltaError;
  }
  if (delta.x === 0 && delta.y === 0) {
    return {
      ok: true,
      value: {
        ...inspection.value,
        changed: false,
        asset,
      },
    };
  }
  if (!Number.isFinite(now.getTime())) {
    return fail('invalid-timestamp', '更新日時を作成できないため確定できません。');
  }

  return {
    ok: true,
    value: {
      ...inspection.value,
      changed: true,
      asset: moveTargetFrame(asset, selection.targetFrameId, delta, now.toISOString()),
    },
  };
}
