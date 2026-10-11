import { formatNativeEditingFailure } from './editingFailure';
import { guardNativeCompositionKey } from './keyboardSafety';
import { useEffect, useRef, useState } from 'react';
import { cloneProject, type Project3D, type Transform3D } from '../../core3d/model/project';
import { assignRigidPartToJoint } from '../../core3d/rig/authoring';
import { estimateCanonicalBytes } from '../../core3d/profile/resourceEstimates';
import { reserveResourceBytes } from '../../core3d/profile/resourceLedger';
import type { ProjectSession } from './projectSession';
import { useNativeObjectSelection } from './useNativeEditState';

type Mode = 'keep-world' | 'keep-local';
type Preview = {
  projectId: string;
  revision: number;
  partId: string;
  jointId: string | null;
  mode: Mode;
  transform: Transform3D;
  inheritedClips: string[];
};
export function NativeRigidAttachmentPanel({
  project,
  session,
  disabled,
  onChange,
}: {
  project: Project3D;
  session: ProjectSession;
  disabled: boolean;
  onChange(): void;
}) {
  const { activeId, setSelection } = useNativeObjectSelection(project, session.edit);
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<Mode>('keep-world');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<{ id: string; revision: number } | null>(null);
  const composing = useRef(false);
  const part = project.nodes.find((node) => node.id === activeId && node.meshId);
  const joints = project.nodes.filter((node) => node.meshId === undefined);
  useEffect(() => {
    setPreview(null);
    setError('');
  }, [project.id, project.revision, activeId, target, mode, disabled]);
  function current() {
    if (disabled || composing.current) throw new Error('編集できる状態で対象を確認してください。');
    if (
      session.project.id !== project.id ||
      session.project.revision !== project.revision ||
      session.edit.state.context.activeId !== activeId
    )
      throw new Error('作品や対象が変わりました。確認し直してください。');
    if (!part) throw new Error('rigid割当の部品を選択してください。');
    return part;
  }
  function prepare(detach: boolean) {
    setApplied(null);
    try {
      const selected = current(),
        jointId = detach ? null : target;
      if (!detach && !jointId) throw new Error('割当先の骨を選択してください。');
      const release = reserveResourceBytes('history', estimateCanonicalBytes(project) * 3);
      try {
        const candidate = cloneProject(project);
        assignRigidPartToJoint(candidate, selected.id, jointId, mode);
        const ancestry = new Set<string>();
        let id = jointId;
        while (id !== null) {
          if (ancestry.has(id)) throw new Error('階層が循環しています。');
          ancestry.add(id);
          id = project.nodes.find((node) => node.id === id)!.parentId;
        }
        const inheritedClips = project.clips
          .filter((clip) => clip.tracks.some((track) => ancestry.has(track.nodeId)))
          .map((clip) => clip.name || clip.id);
        setPreview({
          projectId: project.id,
          revision: project.revision,
          partId: selected.id,
          jointId,
          mode,
          transform: structuredClone(
            candidate.nodes.find((node) => node.id === selected.id)!.transform,
          ),
          inheritedClips,
        });
        setError('');
      } finally {
        release();
      }
    } catch (cause) {
      setPreview(null);
      setError(formatNativeEditingFailure(cause, 'rigid'));
    }
  }
  function apply() {
    if (!preview) return;
    try {
      const selected = current();
      if (
        preview.projectId !== project.id ||
        preview.revision !== project.revision ||
        preview.partId !== selected.id ||
        preview.mode !== mode ||
        (preview.jointId !== null && preview.jointId !== target)
      )
        throw new Error('確認後に対象が変わりました。再確認してください。');
      session.executeAuthoring(
        (candidate) =>
          assignRigidPartToJoint(candidate, preview.partId, preview.jointId, preview.mode),
        { id: preview.projectId, revision: preview.revision },
      );
      setApplied({ id: preview.projectId, revision: preview.revision + 1 });
      setPreview(null);
      setError('');
      onChange();
    } catch (cause) {
      setApplied(null);
      setPreview(null);
      setError(formatNativeEditingFailure(cause, 'rigid'));
    }
  }
  return (
    <section
      aria-label="rigid部品の骨割当"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDownCapture={(event) => {
        guardNativeCompositionKey(event, composing.current);
      }}
    >
      <h3>rigid部品を骨に割り当てる</h3>
      <p>
        部品全体を骨の子として動かす別操作です。smooth skinのweightやinverse
        bindは作成・変更しません。初期対応は子を持たない未skin部品です。
      </p>
      <label>
        rigid割当の部品
        <select
          value={part?.id ?? ''}
          disabled={disabled}
          onChange={(event) => {
            session.rigPose.cancel('rigid部品の選択を変更しました。');
            setSelection(
              event.target.value ? [event.target.value] : [],
              event.target.value || null,
            );
          }}
        >
          <option value="">選択してください</option>
          {project.nodes
            .filter((node) => node.meshId)
            .map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} / {node.id}
              </option>
            ))}
        </select>
      </label>
      <p>
        現在の親:{' '}
        {project.nodes.find((node) => node.id === part?.parentId)?.name ||
          (part?.parentId ?? 'なし（root）')}
      </p>
      <label>
        rigid割当先の骨
        <select
          value={joints.some((joint) => joint.id === target) ? target : ''}
          disabled={disabled}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">選択してください</option>
          {joints.map((joint) => (
            <option key={joint.id} value={joint.id}>
              {joint.name} / {joint.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        rigid割当の座標保持
        <select
          value={mode}
          disabled={disabled}
          onChange={(event) => setMode(event.target.value as Mode)}
        >
          <option value="keep-world">restのworld配置を保持</option>
          <option value="keep-local">local TRSを保持（world配置は変化）</option>
        </select>
      </label>
      <p>
        world保持は保存するrest配置の保持です。割当後は新しい骨のclipへ追従し、以前の動きの維持やキーの自動変換はしません。部品自身や元の親階層にanimationがある場合は拒否します。
      </p>
      <button type="button" disabled={disabled || !part || !target} onClick={() => prepare(false)}>
        rigid割当の内容を確認
      </button>
      <button
        type="button"
        disabled={disabled || !part || part.parentId === null}
        onClick={() => prepare(true)}
      >
        rigid割当をrootへ解除する内容を確認
      </button>
      {error && <p role="alert">{error}</p>}
      {applied?.id === project.id && applied.revision === project.revision && (
        <p role="status">このrevisionでrigid割当を適用しました。元に戻す操作で復元できます。</p>
      )}
      {preview && (
        <div role="region" aria-label="rigid割当の確認">
          <p>
            対象1部品: {part?.name}。割当先:{' '}
            {joints.find((joint) => joint.id === preview.jointId)?.name ?? 'root'}。
            {preview.mode === 'keep-world'
              ? 'restのworld配置を保持します。'
              : 'local TRSを保持し、world配置が変わります。'}
          </p>
          <p>
            新しいlocal移動: {preview.transform.translation.join(', ')}
            。材質・形状・原本は保持し、skinと既存clipは変更しません。
          </p>
          <p>
            新しく追従する親階層のclip: {preview.inheritedClips.join('、') || '現在はなし'}
            。保存とUndo/Redoの対象になります。
          </p>
          <button type="button" disabled={disabled} onClick={apply}>
            確認したrigid割当を適用
          </button>
          <button type="button" disabled={disabled} onClick={() => setPreview(null)}>
            rigid割当を取り消す
          </button>
        </div>
      )}
    </section>
  );
}
