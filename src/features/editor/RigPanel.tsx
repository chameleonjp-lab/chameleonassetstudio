import { useState } from 'react';
import {
  generateId,
  setRigAnimations,
  type Asset,
  type PartPose,
  type RigAnimation,
  type RigKeyframe,
} from '../../core/model';
import {
  buildMotionTemplate,
  MOTION_TEMPLATES,
  type MotionTemplateName,
} from '../../core/rig/motionTemplates';
import { bakeRigAnimation } from '../../core/rig/rig';

interface RigPanelProps {
  asset: Asset;
  onCommit: (label: string, next: Asset) => void;
}

function replaceRig(rigs: RigAnimation[], next: RigAnimation): RigAnimation[] {
  return rigs.map((rig) => (rig.id === next.id ? next : rig));
}

/**
 * 簡易リグパネル（Phase 15）。リグアニメーションのキーフレームを編集し、
 * フレームアニメーションへ焼き込む。
 */
export function RigPanel({ asset, onCommit }: RigPanelProps) {
  const rigs = asset.rigAnimations ?? [];
  const [selectedRigId, setSelectedRigId] = useState<string | null>(rigs[0]?.id ?? null);
  const [newRigName, setNewRigName] = useState('');
  const [newKeyframeTime, setNewKeyframeTime] = useState('0');
  const [templateName, setTemplateName] = useState<MotionTemplateName>(MOTION_TEMPLATES[0]);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const selectedRig = rigs.find((rig) => rig.id === selectedRigId) ?? rigs[0] ?? null;

  const commitRigs = (label: string, nextRigs: RigAnimation[]) => {
    onCommit(label, setRigAnimations(asset, nextRigs));
  };

  const handleCreateRig = () => {
    const rig: RigAnimation = {
      id: generateId('rig'),
      name: newRigName.trim() || 'idle',
      fps: 8,
      loop: true,
      durationMs: 1000,
      keyframes: [],
    };
    commitRigs('リグ作成', [...rigs, rig]);
    setSelectedRigId(rig.id);
    setNewRigName('');
  };

  const handleApplyTemplate = () => {
    const rig = buildMotionTemplate(asset, templateName);
    if (!rig) {
      setTemplateError('対象パーツがありません（body などのパーツ種別を設定してください）');
      return;
    }
    setTemplateError(null);
    commitRigs('テンプレート適用', [...rigs, rig]);
    setSelectedRigId(rig.id);
  };

  const handleAddKeyframe = () => {
    if (!selectedRig) {
      return;
    }
    const time = Math.min(1, Math.max(0, Number(newKeyframeTime) || 0));
    const keyframes = [...selectedRig.keyframes, { time, poses: {} }].sort(
      (a, b) => a.time - b.time,
    );
    commitRigs('キーフレーム追加', replaceRig(rigs, { ...selectedRig, keyframes }));
  };

  const updateKeyframe = (index: number, next: RigKeyframe, label: string) => {
    if (!selectedRig) {
      return;
    }
    const keyframes = selectedRig.keyframes.map((kf, i) => (i === index ? next : kf));
    commitRigs(label, replaceRig(rigs, { ...selectedRig, keyframes }));
  };

  const updatePose = (
    index: number,
    partId: string,
    update: (pose: PartPose) => PartPose,
    label: string,
  ) => {
    if (!selectedRig) {
      return;
    }
    const keyframe = selectedRig.keyframes[index];
    const pose = keyframe.poses[partId] ?? {};
    updateKeyframe(
      index,
      { ...keyframe, poses: { ...keyframe.poses, [partId]: update(pose) } },
      label,
    );
  };

  return (
    <div className="rig-panel">
      <div className="gamedata-inline-fields">
        <label className="editor-field">
          新しいリグ名
          <input
            type="text"
            value={newRigName}
            placeholder="idle"
            onChange={(event) => setNewRigName(event.target.value)}
          />
        </label>
        <button type="button" onClick={handleCreateRig}>
          リグを作成
        </button>
      </div>

      <div className="gamedata-inline-fields">
        <label className="editor-field">
          モーションテンプレート
          <select
            aria-label="モーションテンプレート"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value as MotionTemplateName)}
          >
            {MOTION_TEMPLATES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleApplyTemplate}>
          テンプレートを適用
        </button>
      </div>
      {templateError && <p role="alert">{templateError}</p>}

      {rigs.length > 0 && (
        <label className="editor-field">
          リグ
          <select
            aria-label="リグ"
            value={selectedRig?.id ?? ''}
            onChange={(event) => setSelectedRigId(event.target.value)}
          >
            {rigs.map((rig) => (
              <option key={rig.id} value={rig.id}>
                {rig.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {selectedRig && (
        <div className="editor-fieldset rig-editor">
          <div className="gamedata-inline-fields">
            <label className="editor-field">
              fps
              <input
                type="number"
                min={1}
                value={selectedRig.fps}
                onChange={(event) =>
                  commitRigs(
                    'リグ fps 変更',
                    replaceRig(rigs, {
                      ...selectedRig,
                      fps: Math.max(1, Number(event.target.value) || 1),
                    }),
                  )
                }
              />
            </label>
            <label className="editor-field">
              長さ(ms)
              <input
                type="number"
                min={1}
                value={selectedRig.durationMs}
                onChange={(event) =>
                  commitRigs(
                    'リグ長さ変更',
                    replaceRig(rigs, {
                      ...selectedRig,
                      durationMs: Math.max(1, Number(event.target.value) || 1),
                    }),
                  )
                }
              />
            </label>
            <label className="editor-field timeline-loop-field">
              ループ
              <input
                type="checkbox"
                checked={selectedRig.loop}
                onChange={(event) =>
                  commitRigs(
                    'リグループ変更',
                    replaceRig(rigs, { ...selectedRig, loop: event.target.checked }),
                  )
                }
              />
            </label>
            <button
              type="button"
              aria-label={`リグ「${selectedRig.name}」を削除`}
              onClick={() =>
                commitRigs(
                  'リグ削除',
                  rigs.filter((rig) => rig.id !== selectedRig.id),
                )
              }
            >
              削除
            </button>
          </div>

          <div className="gamedata-inline-fields">
            <label className="editor-field">
              キーフレーム時刻
              <input
                type="number"
                aria-label="キーフレーム時刻"
                min={0}
                max={1}
                step={0.1}
                value={newKeyframeTime}
                onChange={(event) => setNewKeyframeTime(event.target.value)}
              />
            </label>
            <button type="button" onClick={handleAddKeyframe}>
              キーフレーム追加
            </button>
          </div>

          <ul className="gamedata-list" aria-label="キーフレーム一覧">
            {selectedRig.keyframes.map((keyframe, index) => (
              <li key={`${keyframe.time}-${index}`} className="gamedata-row">
                <div className="gamedata-row-header">
                  <span className="gamedata-shape">t = {keyframe.time}</span>
                  <button
                    type="button"
                    aria-label={`キーフレーム t=${keyframe.time} を削除`}
                    onClick={() =>
                      commitRigs(
                        'キーフレーム削除',
                        replaceRig(rigs, {
                          ...selectedRig,
                          keyframes: selectedRig.keyframes.filter((_, i) => i !== index),
                        }),
                      )
                    }
                  >
                    削除
                  </button>
                </div>
                <KeyframePoseEditor
                  asset={asset}
                  keyframe={keyframe}
                  onAddPose={(partId) =>
                    updatePose(index, partId, (pose) => ({ ...pose }), 'ポーズ追加')
                  }
                  onRemovePose={(partId) => {
                    const poses = { ...keyframe.poses };
                    delete poses[partId];
                    updateKeyframe(index, { ...keyframe, poses }, 'ポーズ削除');
                  }}
                  onChangePose={(partId, update) => updatePose(index, partId, update, 'ポーズ変更')}
                />
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={selectedRig.keyframes.length === 0}
            onClick={() => onCommit('リグ焼き込み', bakeRigAnimation(asset, selectedRig))}
          >
            フレームへ焼き込み
          </button>
        </div>
      )}
    </div>
  );
}

interface KeyframePoseEditorProps {
  asset: Asset;
  keyframe: RigKeyframe;
  onAddPose: (partId: string) => void;
  onRemovePose: (partId: string) => void;
  onChangePose: (partId: string, update: (pose: PartPose) => PartPose) => void;
}

function KeyframePoseEditor({
  asset,
  keyframe,
  onAddPose,
  onRemovePose,
  onChangePose,
}: KeyframePoseEditorProps) {
  const [partToAdd, setPartToAdd] = useState('');
  const unusedParts = asset.parts.filter((part) => !(part.id in keyframe.poses));

  return (
    <div className="rig-pose-editor">
      {Object.entries(keyframe.poses).map(([partId, pose]) => {
        const part = asset.parts.find((p) => p.id === partId);
        return (
          <div key={partId} className="gamedata-inline-fields">
            <span className="gamedata-shape">{part?.name ?? partId}</span>
            <label className="editor-field">
              ポーズ X
              <input
                type="number"
                aria-label={`「${part?.name ?? partId}」のポーズ X`}
                value={pose.localPosition?.x ?? 0}
                onChange={(event) =>
                  onChangePose(partId, (prev) => ({
                    ...prev,
                    localPosition: {
                      x: Number(event.target.value) || 0,
                      y: prev.localPosition?.y ?? 0,
                    },
                  }))
                }
              />
            </label>
            <label className="editor-field">
              ポーズ Y
              <input
                type="number"
                aria-label={`「${part?.name ?? partId}」のポーズ Y`}
                value={pose.localPosition?.y ?? 0}
                onChange={(event) =>
                  onChangePose(partId, (prev) => ({
                    ...prev,
                    localPosition: {
                      x: prev.localPosition?.x ?? 0,
                      y: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </label>
            <label className="editor-field">
              ポーズ回転
              <input
                type="number"
                aria-label={`「${part?.name ?? partId}」のポーズ回転`}
                value={pose.localRotation ?? 0}
                onChange={(event) =>
                  onChangePose(partId, (prev) => ({
                    ...prev,
                    localRotation: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="editor-field">
              拡大 X
              <input
                type="number"
                step={0.1}
                min={0.01}
                aria-label={`「${part?.name ?? partId}」のポーズ拡大X`}
                value={pose.localScale?.x ?? 1}
                onChange={(event) =>
                  onChangePose(partId, (prev) => ({
                    ...prev,
                    localScale: {
                      x: Math.max(0.01, Number(event.target.value) || 1),
                      y: prev.localScale?.y ?? 1,
                    },
                  }))
                }
              />
            </label>
            <label className="editor-field">
              拡大 Y
              <input
                type="number"
                step={0.1}
                min={0.01}
                aria-label={`「${part?.name ?? partId}」のポーズ拡大Y`}
                value={pose.localScale?.y ?? 1}
                onChange={(event) =>
                  onChangePose(partId, (prev) => ({
                    ...prev,
                    localScale: {
                      x: prev.localScale?.x ?? 1,
                      y: Math.max(0.01, Number(event.target.value) || 1),
                    },
                  }))
                }
              />
            </label>
            <button
              type="button"
              aria-label={`「${part?.name ?? partId}」のポーズを削除`}
              onClick={() => onRemovePose(partId)}
            >
              削除
            </button>
          </div>
        );
      })}

      {unusedParts.length > 0 && (
        <div className="gamedata-inline-fields">
          <label className="editor-field">
            パーツ
            <select
              aria-label="ポーズ対象パーツ"
              value={partToAdd}
              onChange={(event) => setPartToAdd(event.target.value)}
            >
              <option value="">選択…</option>
              {unusedParts.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!partToAdd}
            onClick={() => {
              onAddPose(partToAdd);
              setPartToAdd('');
            }}
          >
            ポーズ追加
          </button>
        </div>
      )}
    </div>
  );
}
