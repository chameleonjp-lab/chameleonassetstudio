import { useEffect, useMemo, useState } from 'react';
import {
  frameAlignmentFrameCandidates,
  type Asset,
  type FrameAlignmentImpact,
  type FrameAlignmentSelection,
} from '../../core/model';

export interface FrameAlignmentDraft {
  selection: FrameAlignmentSelection;
  xInput: string;
  yInput: string;
  impact: FrameAlignmentImpact;
}

interface FrameAlignmentPanelProps {
  asset: Asset;
  animationId: string | null;
  isPlaying: boolean;
  draft: FrameAlignmentDraft | null;
  previewError: string | null;
  onStart: (referenceFrameId: string, targetFrameId: string) => void;
  onDeltaInput: (axis: 'x' | 'y', value: string) => void;
  onNudge: (x: number, y: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function finiteInput(value: string): boolean {
  return value.trim() !== '' && Number.isFinite(Number(value));
}

function candidateLabel(candidate: {
  id: string;
  name: string;
  firstOccurrenceIndex: number;
}): string {
  const shortId = candidate.id.length > 10 ? candidate.id.slice(-8) : candidate.id;
  return `${candidate.name}（出現${candidate.firstOccurrenceIndex + 1}・ID ${shortId}）`;
}

/** D4: 基準Frameと対象Frameを重ね、対象Frame全体の位置だけを手動調整する。 */
export function FrameAlignmentPanel({
  asset,
  animationId,
  isPlaying,
  draft,
  previewError,
  onStart,
  onDeltaInput,
  onNudge,
  onConfirm,
  onCancel,
}: FrameAlignmentPanelProps) {
  const [referenceFrameId, setReferenceFrameId] = useState('');
  const [targetFrameId, setTargetFrameId] = useState('');
  const candidatesResult = useMemo(
    () =>
      animationId
        ? frameAlignmentFrameCandidates(asset, animationId)
        : { ok: true as const, value: [] },
    [animationId, asset],
  );

  useEffect(() => {
    setReferenceFrameId('');
    setTargetFrameId('');
  }, [animationId, asset.id]);

  const candidates = candidatesResult.ok ? candidatesResult.value : [];
  const selectedReferenceFrameId = draft?.selection.referenceFrameId ?? referenceFrameId;
  const selectedTargetFrameId = draft?.selection.targetFrameId ?? targetFrameId;
  const deltaValid = !!draft && finiteInput(draft.xInput) && finiteInput(draft.yInput);

  return (
    <fieldset className="timeline-frame-alignment">
      <legend>フレーム位置合わせ</legend>
      <p className="editor-note">
        基準を半透明で重ね、対象Frame全体を上下左右へ移動します。画像や表示時間は変更しません。
      </p>
      <div className="timeline-frame-alignment-selects">
        <label className="editor-field">
          基準Frame（半透明・読み取り専用）
          <select
            aria-label="位置合わせの基準Frame"
            value={selectedReferenceFrameId}
            disabled={!animationId || !!draft}
            onChange={(event) => setReferenceFrameId(event.target.value)}
          >
            <option value="">選択してください</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidateLabel(candidate)}
              </option>
            ))}
          </select>
        </label>
        <label className="editor-field">
          対象Frame（通常表示・移動）
          <select
            aria-label="位置合わせの対象Frame"
            value={selectedTargetFrameId}
            disabled={!animationId || !!draft}
            onChange={(event) => setTargetFrameId(event.target.value)}
          >
            <option value="">選択してください</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidateLabel(candidate)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!candidatesResult.ok && (
        <p className="import-error" role="alert">
          {candidatesResult.reason}
        </p>
      )}
      {!animationId && <p className="editor-note">先にAnimationを選択してください。</p>}
      {isPlaying && !draft && (
        <p className="editor-note">再生中は開始できません。停止してから操作してください。</p>
      )}

      {!draft ? (
        <button
          type="button"
          disabled={!animationId || !referenceFrameId || !targetFrameId}
          onClick={() => onStart(referenceFrameId, targetFrameId)}
        >
          位置合わせを開始
        </button>
      ) : (
        <div className="timeline-frame-alignment-draft" aria-label="フレーム位置合わせ調整">
          <p className="timeline-frame-alignment-impact" role="status">
            影響: Animation {draft.impact.animationCount}件 / 総出現 {draft.impact.occurrenceCount}
            件
          </p>
          <div className="timeline-frame-alignment-inputs">
            <label className="editor-field">
              X移動量（px）
              <input
                type="number"
                step="any"
                inputMode="decimal"
                aria-label="X移動量（px）"
                aria-invalid={!finiteInput(draft.xInput)}
                value={draft.xInput}
                onChange={(event) => onDeltaInput('x', event.target.value)}
              />
            </label>
            <label className="editor-field">
              Y移動量（px）
              <input
                type="number"
                step="any"
                inputMode="decimal"
                aria-label="Y移動量（px）"
                aria-invalid={!finiteInput(draft.yInput)}
                value={draft.yInput}
                onChange={(event) => onDeltaInput('y', event.target.value)}
              />
            </label>
          </div>
          <div className="timeline-frame-alignment-nudges" aria-label="1pxずつ移動">
            <button type="button" disabled={!deltaValid} onClick={() => onNudge(0, -1)}>
              上へ1px
            </button>
            <button type="button" disabled={!deltaValid} onClick={() => onNudge(-1, 0)}>
              左へ1px
            </button>
            <button type="button" disabled={!deltaValid} onClick={() => onNudge(1, 0)}>
              右へ1px
            </button>
            <button type="button" disabled={!deltaValid} onClick={() => onNudge(0, 1)}>
              下へ1px
            </button>
          </div>
          {!deltaValid && (
            <p className="import-error" role="alert">
              XとYには有限な数値を入力してください。
            </p>
          )}
          {previewError && (
            <p className="import-error" role="alert">
              {previewError}
            </p>
          )}
          <div className="timeline-frame-alignment-actions">
            <button type="button" disabled={!deltaValid || !!previewError} onClick={onConfirm}>
              位置を確定
            </button>
            <button type="button" onClick={onCancel}>
              取消
            </button>
          </div>
          <p className="editor-note">Escでも取消できます。確定前は保存されません。</p>
        </div>
      )}
    </fieldset>
  );
}
