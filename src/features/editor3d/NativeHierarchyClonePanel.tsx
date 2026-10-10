import { formatNativeEditingFailure } from './editingFailure';
import { guardNativeCompositionKey } from './keyboardSafety';
import { useEffect, useRef, useState } from 'react';
import {
  previewHierarchyClone,
  applyHierarchyClone,
  type HierarchyClonePreview,
} from '../../core3d/commands/hierarchyClone';
import type { Project3D } from '../../core3d/model/project';
import type { NativeEditBinding } from '../../core3d/ports/editPort';
import { estimateCanonicalBytes } from '../../core3d/profile/resourceEstimates';
import { reserveResourceBytes } from '../../core3d/profile/resourceLedger';

type Display = Pick<HierarchyClonePreview, 'projectId' | 'revision' | 'rootNodeId' | 'counts'> & {
  name: string;
  clips: string[];
  dependencies: { label: string; ids: string[] }[];
};
/** The exact baseline remains ticket-owned until confirmation is dismissed. */
export function NativeHierarchyClonePanel({
  project,
  selectedIds,
  disabled,
  execute,
  edit,
  onSelect,
}: {
  project: Project3D;
  selectedIds: readonly string[];
  disabled: boolean;
  execute: (operation: (candidate: Project3D) => void) => void;
  edit?: NativeEditBinding;
  onSelect(id: string): void;
}) {
  const prepareButton = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const held = useRef<{ preview: HierarchyClonePreview; release(): void } | null>(null);
  const [display, setDisplay] = useState<Display | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ id: string; revision: number } | null>(null);
  const selectionKey = JSON.stringify(selectedIds);
  function discard() {
    const old = held.current;
    held.current = null;
    old?.release();
    setDisplay(null);
  }
  useEffect(() => {
    setDisplay(null);
    setError('');
    return () => {
      const old = held.current;
      held.current = null;
      old?.release();
    };
  }, [project.id, project.revision, selectionKey, disabled, edit]);
  function current() {
    if (disabled || selectedIds.length !== 1)
      throw new Error('複製する階層の先頭を1個だけ選択してください。');
    if (
      edit &&
      (edit.state.projectId !== project.id ||
        edit.state.revision !== project.revision ||
        JSON.stringify(edit.state.context.selection) !== selectionKey)
    )
      throw new Error('作品や選択が変わりました。複製内容を確認し直してください。');
    return selectedIds[0];
  }
  function prepare() {
    discard();
    setNotice(null);
    let release: (() => void) | undefined;
    try {
      const root = current();
      // Conservative admission includes expanded candidate, ID maps and escaped
      // exact snapshot. Retain the reservation through Apply/Cancel, not only build.
      release = reserveResourceBytes('history', estimateCanonicalBytes(project) * 12);
      const preview = previewHierarchyClone(project, root, crypto.randomUUID());
      const next: Display = {
        projectId: preview.projectId,
        revision: preview.revision,
        rootNodeId: root,
        counts: preview.counts,
        name: project.nodes.find((node) => node.id === root)?.name || root,
        clips: preview.clipIds.map(
          (id) => `${project.clips.find((clip) => clip.id === id)?.name || '名称なし'} / ${id}`,
        ),
        dependencies: [
          { label: '部品', ids: preview.nodeIds },
          { label: '形状', ids: preview.meshIds },
          { label: '材質', ids: preview.materialIds },
          { label: 'skin', ids: preview.skinIds },
          { label: 'anchor', ids: preview.anchorIds },
          { label: 'collider', ids: preview.colliderIds },
          { label: '保持する階層外の親', ids: preview.retainedAncestorIds },
          { label: '保持する階層外skin', ids: preview.retainedExternalSkinIds },
        ],
      };
      held.current = { preview, release };
      release = undefined;
      setDisplay(next);
      setError('');
    } catch (cause) {
      release?.();
      discard();
      setError(formatNativeEditingFailure(cause, 'clone'));
    }
  }
  function apply() {
    const owner = held.current;
    if (!owner) return;
    try {
      const root = current();
      if (owner.preview.rootNodeId !== root)
        throw new Error('選択が変わりました。確認し直してください。');
      let clonedRoot = '';
      execute((candidate) => {
        clonedRoot = applyHierarchyClone(candidate, owner.preview);
      });
      setNotice({ id: project.id, revision: project.revision + 1 });
      setError('');
      discard();
      onSelect(clonedRoot);
      prepareButton.current?.focus();
    } catch (cause) {
      discard();
      setNotice(null);
      setError(formatNativeEditingFailure(cause, 'clone'));
    }
  }
  const visible =
    display &&
    display.projectId === project.id &&
    display.revision === project.revision &&
    selectedIds.length === 1 &&
    display.rootNodeId === selectedIds[0] &&
    !disabled;
  return (
    <details
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDownCapture={(event) => {
        guardNativeCompositionKey(event, composing.current);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing && held.current) {
          event.preventDefault();
          event.stopPropagation();
          discard();
          prepareButton.current?.focus();
        }
      }}
      onToggle={(event) => {
        if (!event.currentTarget.open) discard();
      }}
    >
      <summary>階層と依存情報を複製</summary>
      <p>
        先頭を1個選び、その子階層をまとめて独立コピーにします。親とlocal
        TRSを保持するため同じ位置に重なります。複製後は新しい先頭を選択します。
      </p>
      <p>
        skinのjointが対象階層の外にある場合は、必要な骨も含む先頭を選んでください。編集ロックや、ロック対象を含むclipに影響する複製は拒否します。
      </p>
      <button
        ref={prepareButton}
        type="button"
        disabled={disabled || selectedIds.length !== 1}
        onClick={prepare}
      >
        部品と階層の複製内容を確認
      </button>
      {error && <p role="alert">{error}</p>}
      {notice?.id === project.id && notice.revision === project.revision && (
        <p role="status">このrevisionで階層を複製しました。元に戻す操作で複製を取り消せます。</p>
      )}
      {visible && (
        <section aria-label="階層複製の確認">
          <p>
            対象: {display.name} / revision {display.revision}
          </p>
          <p>
            部品 {display.counts.nodes}、形状 {display.counts.meshes}、材質{' '}
            {display.counts.materials}、skin {display.counts.skins}{' '}
            を新しいIDで複製します。形状の頂点 {display.counts.vertices}、面 {display.counts.faces}{' '}
            とskinの参照も組み直します。
          </p>
          <p>
            既存clip {display.counts.clips} に複製部品のtrack {display.counts.tracks}（key{' '}
            {display.counts.keys}）を追加します。元のtrackは保持します。対象clip:{' '}
            {display.clips.join('、') || 'なし'}
          </p>
          <p>
            複製skinのjoint {display.counts.joints}、頂点weight {display.counts.weights}（影響先{' '}
            {display.counts.influences}）も参照を更新します。 階層外の親によるtrack{' '}
            {display.counts.inheritedTracks}（key {display.counts.inheritedKeys}
            ）と、元の骨を使う階層外skin {display.counts.retainedExternalSkins}{' '}
            はそのまま保持します。
          </p>
          <p>
            部品に付くanchor {display.counts.anchors}、collider {display.counts.colliders}{' '}
            を複製します。作品全体に付く情報は増やしません。
          </p>
          <p>
            画像・GLB原本と権利情報は保持し、同じhashを参照します。保持する原本情報{' '}
            {display.counts.retainedSources}、Blob {display.counts.retainedBlobs}、共用する画像hash{' '}
            {display.counts.sharedTextureBlobs}。
          </p>
          <details>
            <summary>複製元と保持する依存IDを確認</summary>
            <ul>
              {display.dependencies.map(({ label, ids }) => (
                <li key={label}>
                  {label}: {ids.join('、') || 'なし'}
                </li>
              ))}
            </ul>
          </details>
          <p>
            保存対象に追加されます。元に戻す操作で復元できます。確認後の変更・選択変更では適用しません。
          </p>
          <button type="button" disabled={disabled} onClick={apply}>
            確認した階層と依存情報を複製
          </button>
          <button
            type="button"
            onClick={() => {
              discard();
              prepareButton.current?.focus();
            }}
          >
            階層の複製を取り消す
          </button>
        </section>
      )}
    </details>
  );
}
