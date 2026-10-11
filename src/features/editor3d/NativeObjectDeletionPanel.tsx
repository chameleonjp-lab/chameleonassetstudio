import { formatNativeEditingFailure } from './editingFailure';
import { useEffect, useState } from 'react';
import {
  previewObjectDeletion,
  applyObjectDeletion,
  type ObjectDeletionPreview,
} from '../../core3d/commands/objectDeletion';
import type { Project3D } from '../../core3d/model/project';
import type { NativeEditBinding } from '../../core3d/ports/editPort';

/** Confirmation is transient and bound to the exact canonical revision and selection. */
export function NativeObjectDeletionPanel({
  project,
  selectedIds,
  disabled,
  execute,
  edit,
}: {
  project: Project3D;
  selectedIds: readonly string[];
  disabled: boolean;
  execute: (operation: (candidate: Project3D) => void) => void;
  edit?: NativeEditBinding;
}) {
  const [includeDescendants, setIncludeDescendants] = useState(false);
  const [preview, setPreview] = useState<ObjectDeletionPreview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ projectId: string; revision: number } | null>(null);
  const selectionKey = JSON.stringify(selectedIds);
  useEffect(() => {
    setPreview(null);
    setError('');
  }, [project.id, project.revision, selectionKey, includeDescendants]);
  function checkCurrent() {
    if (disabled) throw new Error('編集できる状態に戻ってから確認してください。');
    if (
      edit &&
      (edit.state.projectId !== project.id ||
        edit.state.revision !== project.revision ||
        JSON.stringify(edit.state.context.selection) !== selectionKey)
    )
      throw new Error('作品や選択が変わりました。削除対象を確認し直してください。');
  }
  function prepare() {
    try {
      checkCurrent();
      setPreview(previewObjectDeletion(project, selectedIds, { includeDescendants }));
      setError('');
      setNotice(null);
    } catch (cause) {
      setNotice(null);
      setPreview(null);
      setError(formatNativeEditingFailure(cause, 'deletion'));
    }
  }
  function apply() {
    if (!preview) return;
    try {
      checkCurrent();
      if (JSON.stringify(preview.requestedNodeIds) !== selectionKey)
        throw new Error('選択が変わりました。確認し直してください。');
      execute((candidate) => applyObjectDeletion(candidate, preview));
      setPreview(null);
      setError('');
      setNotice({ projectId: preview.projectId, revision: preview.revision + 1 });
    } catch (cause) {
      setNotice(null);
      setPreview(null);
      setError(formatNativeEditingFailure(cause, 'deletion'));
    }
  }
  return (
    <details>
      <summary>選択した部品の削除</summary>
      <p>複数選択した部品が対象です。ロック中の部品、残るskinが使用するjointは削除しません。</p>
      <label>
        <input
          type="checkbox"
          checked={includeDescendants}
          disabled={disabled}
          onChange={(event) => setIncludeDescendants(event.target.checked)}
        />
        選択した部品の子階層も削除対象に含める
      </label>
      <button type="button" disabled={disabled || !selectedIds.length} onClick={prepare}>
        部品の削除内容を確認
      </button>
      {error && <p role="alert">{error}</p>}
      {notice?.projectId === project.id && notice.revision === project.revision && (
        <p role="status">このrevisionで部品削除を適用しました。元に戻す操作で復元できます。</p>
      )}
      {preview && (
        <section aria-label="部品削除の確認">
          <p>
            対象 {preview.counts.nodes}部品:{' '}
            {preview.nodeIds
              .map((id) => project.nodes.find((node) => node.id === id)?.name || id)
              .join('、')}
          </p>
          <p>
            この部品だけが使う形状 {preview.counts.meshes}、skin {preview.counts.skins}{' '}
            を削除します。共有形状 {preview.counts.retainedMeshes}、共有skin{' '}
            {preview.counts.retainedSkins} は保持します。
          </p>
          <p>
            関連するanimation track {preview.counts.tracks}（key {preview.counts.keys}）、anchor{' '}
            {preview.counts.anchors}、collider {preview.counts.colliders}{' '}
            も除きます。clip本体、材質、画像・GLB原本は保持します。
          </p>
          <p>
            適用後は自動保存の対象になります。元に戻す操作で復元できます。確認後に作品や選択が変わった場合は適用しません。
          </p>
          <button type="button" disabled={disabled} onClick={apply}>
            確認した部品と依存情報を削除
          </button>
          <button type="button" disabled={disabled} onClick={() => setPreview(null)}>
            部品の削除を取り消す
          </button>
        </section>
      )}
    </details>
  );
}
