import { useId, useRef, useState } from 'react';
import type { Project3D, Vec3 } from '../../core3d/model/project';
import {
  groupNodes,
  reparentNodes,
  ungroupNode,
  relocatePivot,
  mirrorNode,
  type ReparentMode,
  type MirrorAxis,
} from '../../core3d/commands/sceneAssembly';
import './nativeAssemblyControls.css';

type ReviewedTargets = {
  projectId: string;
  revision: number;
  selection: string;
  parentId: string | null;
};
type OffsetDraft = Record<'x' | 'y' | 'z', string>;

function pivotOffset(draft: OffsetDraft): Vec3 {
  return (['x', 'y', 'z'] as const).map((axis) => {
    if (!draft[axis].trim() || !Number.isFinite(Number(draft[axis])))
      throw new Error('原点の移動量は空欄を残さず、有限の数値を入力してください。');
    return Number(draft[axis]);
  }) as Vec3;
}

/** Canonical IDs and reviewed revisions bind these transient drafts to their targets. */
export function NativeAssemblyControls({
  project,
  disabled,
  execute,
}: {
  project: Project3D;
  disabled: boolean;
  execute: (operation: (candidate: Project3D) => void) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [mode, setMode] = useState<ReparentMode>('keep-world');
  const [name, setName] = useState('グループ');
  const [offset, setOffset] = useState<OffsetDraft>({ x: '0', y: '0', z: '0' });
  const [axis, setAxis] = useState<MirrorAxis>('x');
  const [reviewed, setReviewed] = useState<ReviewedTargets | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const composing = useRef(false);
  const descriptionId = useId();
  const nodesById = new Map(project.nodes.map((node) => [node.id, node]));
  const missingIds = selectedIds.filter((id) => !nodesById.has(id));
  const selection = JSON.stringify([...selectedIds].sort());
  const validSelection = selectedIds.length > 0 && missingIds.length === 0;
  const parent = parentId === null ? undefined : nodesById.get(parentId);
  const validParent = parentId === null || !!parent;
  const targetsReady =
    validSelection &&
    reviewed?.projectId === project.id &&
    reviewed.revision === project.revision &&
    reviewed.selection === selection;
  const parentReady = targetsReady && validParent && reviewed?.parentId === parentId;
  const single = selectedIds.length === 1 ? nodesById.get(selectedIds[0]) : undefined;
  const singleIsLeaf = !!single && !project.nodes.some((node) => node.parentId === single.id);

  function changeSelection(ids: string[]) {
    setSelectedIds(ids);
    setReviewed(null);
    setNotice('');
  }

  function reviewTargets() {
    if (disabled || composing.current || !validSelection) return;
    setReviewed({ projectId: project.id, revision: project.revision, selection, parentId });
    setError('');
    setNotice('現在の組立対象を確認しました。入力値と操作内容を確かめて適用してください。');
  }

  function apply(operation: (candidate: Project3D) => string[] | void, needsParent = false) {
    if (disabled || composing.current) return;
    try {
      if (!reviewed || !targetsReady || (needsParent && !parentReady))
        throw new Error('対象や作品が変わりました。現在の組立対象を確認し直してください。');
      const expected = reviewed;
      let nextSelection: string[] | undefined;
      execute((candidate) => {
        if (candidate.id !== expected.projectId || candidate.revision !== expected.revision)
          throw new Error('作品が変わりました。現在の組立対象を確認し直してください。');
        const result = operation(candidate);
        if (result) nextSelection = result;
      });
      if (nextSelection) setSelectedIds(nextSelection);
      setReviewed(null);
      setError('');
      setNotice('適用しました。元に戻す操作で取り消せます。次の操作前に対象を確認してください。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setNotice('');
    }
  }

  return (
    <section
      className="native-assembly"
      aria-label="3D部品の組立"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (
          event.key === 'Enter' &&
          (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
        ) {
          // Let the input commit its composition; there is no implicit form submission.
          event.stopPropagation();
        }
      }}
    >
      <h3>部品を組み立てる</h3>
      <details>
        <summary>部品の組立を開く</summary>
        <p>
          一覧で対象を選び、現在の対象を確認してから適用します。カメラ観察や形・材質の制作対象とは別の選択です。
        </p>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <fieldset disabled={disabled}>
          <legend>組立対象</legend>
          <p id={`${descriptionId}-selection`}>
            複数の部品を選べます。選択中 {selectedIds.length} 個。名前とIDで対象を確認してください。
          </p>
          {project.nodes.length === 0 ? (
            <p>部品がありません。「形と材質を作る」で基本形を追加してください。</p>
          ) : (
            <ul className="native-assembly-list" aria-describedby={`${descriptionId}-selection`}>
              {project.nodes.map((node) => {
                const currentParent =
                  node.parentId === null ? undefined : nodesById.get(node.parentId);
                return (
                  <li key={node.id}>
                    <label className="native-assembly-choice">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(node.id)}
                        aria-label={`組立対象 ${node.name} (${node.id})`}
                        onChange={(event) =>
                          changeSelection(
                            event.target.checked
                              ? [...selectedIds, node.id]
                              : selectedIds.filter((id) => id !== node.id),
                          )
                        }
                      />
                      <span>
                        <strong>{node.name}</strong>
                        <span>ID: {node.id}</span>
                        <span>
                          親:{' '}
                          {currentParent ? `${currentParent.name} (${currentParent.id})` : 'なし'}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {missingIds.length > 0 && (
            <div role="status">
              <p>
                削除・Undo後に存在しない選択ID: {missingIds.join(', ')}。
                別の部品へ自動で選び直しません。存在しない選択を除いてから対象を確認してください。
              </p>
              <button
                type="button"
                onClick={() => changeSelection(selectedIds.filter((id) => nodesById.has(id)))}
              >
                存在しない選択を除く
              </button>
            </div>
          )}
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => changeSelection([])}
          >
            組立対象の選択を解除
          </button>
          <label>
            新しい親
            <select
              value={parentId ?? ''}
              aria-describedby={`${descriptionId}-parent`}
              onChange={(event) => {
                setParentId(event.target.value || null);
                setReviewed(null);
                setNotice('');
              }}
            >
              <option value="">親なし（ルート）</option>
              {!validParent && <option value={parentId!}>選択した親がありません</option>}
              {project.nodes.map((node, index) => (
                <option key={node.id} value={node.id}>
                  {index + 1}: {Array.from(node.name).slice(0, 8).join('')}
                </option>
              ))}
            </select>
          </label>
          <p id={`${descriptionId}-parent`}>
            {parentId === null
              ? '新しい親: なし（シーンのルート）'
              : parent
                ? `新しい親: ${parent.name} / ${parent.id}`
                : `新しい親のID ${parentId} は存在しません。親を選び直してください。`}
          </p>
          <label>
            保持する座標
            <select value={mode} onChange={(event) => setMode(event.target.value as ReparentMode)}>
              <option value="keep-world">worldを保持</option>
              <option value="keep-local">localを保持</option>
            </select>
          </label>
          <p>
            {mode === 'keep-world'
              ? 'world保持: 見た目の位置・向き・大きさを保つよう、親に対するlocal変形を計算します。'
              : 'local保持: 親に対する位置・回転・倍率を保ちます。親の変更により見た目が変わることがあります。'}
            この選択はグループ化・親子付け替え・グループ解除に使います。
          </p>
          <p>
            自分や子孫を親にする循環、親子を同時に選んだグループ化・付け替えは適用できません。
            world保持で回転と不均一な倍率からshear（せん断）が必要になる場合も、変形せず理由を表示します。
            リグ・アニメーションへの影響を安全に保持できない操作は適用できません。
          </p>
          <button type="button" disabled={!validSelection} onClick={reviewTargets}>
            現在の組立対象を確認
          </button>
          {!targetsReady ? (
            <p>
              選択の変更・Undo・別の編集の後は、現在の対象を確認し直してください。入力途中の値は保持しています。
            </p>
          ) : (
            <p>
              確認済み: {selectedIds.length} 個 / revision {reviewed!.revision}
            </p>
          )}
          <details>
            <summary>グループ・親子関係</summary>
            <label>
              新しいグループ名
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <p>指定した親の原点にグループを作り、選んだ部品をまとめます。</p>
            <button
              type="button"
              disabled={!parentReady || !name.trim()}
              onClick={() =>
                apply(
                  (candidate) => [
                    groupNodes(candidate, selectedIds, crypto.randomUUID(), parentId, mode, name),
                  ],
                  true,
                )
              }
            >
              選択部品をグループ化
            </button>
            <button
              type="button"
              disabled={!parentReady}
              onClick={() =>
                apply((candidate) => reparentNodes(candidate, selectedIds, parentId, mode), true)
              }
            >
              選択部品の親を付け替え
            </button>
          </details>
          <details>
            <summary>グループを解除</summary>
            <p>
              meshを持たないグループを1個選びます。直接の子をそのグループの現在の親へ移し、グループを削除します。
              上の「新しい親」は使いません。world/localの保持設定を確認してください。
            </p>
            <button
              type="button"
              disabled={!targetsReady || !single || !!single.meshId}
              onClick={() => apply((candidate) => ungroupNode(candidate, single!.id, mode))}
            >
              選択グループを解除
            </button>
          </details>
          <details>
            <summary>原点（pivot）を移す</summary>
            <p>
              部品を1個選び、現在の原点からlocal XYZ方向への移動量をメートルで指定します。
              geometryと子の位置を補正するため、見た目の位置は変わりません。次の回転・拡縮は新しい原点を基準にします。
            </p>
            {single && <p>現在の原点（親local m）: {single.transform.translation.join(', ')}</p>}
            <div className="native-assembly-fields">
              {(['x', 'y', 'z'] as const).map((component) => (
                <label key={component}>
                  原点移動 {component.toUpperCase()}（m）
                  <input
                    inputMode="decimal"
                    value={offset[component]}
                    onChange={(event) =>
                      setOffset((draft) => ({ ...draft, [component]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <p>共有meshは直接変更できません。必要な部品を独立複製してから操作してください。</p>
            <button
              type="button"
              disabled={!targetsReady || !single}
              onClick={() =>
                apply((candidate) => relocatePivot(candidate, single!.id, pivotOffset(offset)))
              }
            >
              原点移動を適用
            </button>
          </details>
          <details>
            <summary>反転した部品を複製</summary>
            <p>
              子を持たないmesh部品を1個選びます。現在の原点を基準に、指定したlocal軸の座標を符号反転し、
              独立した複製を作ります。面の頂点順と法線も反転へ合わせます。元の部品は残ります。
            </p>
            <label>
              反転軸
              <select value={axis} onChange={(event) => setAxis(event.target.value as MirrorAxis)}>
                <option value="x">local X</option>
                <option value="y">local Y</option>
                <option value="z">local Z</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!targetsReady || !single?.meshId || !singleIsLeaf}
              onClick={() =>
                apply((candidate) => [mirrorNode(candidate, single!.id, axis, crypto.randomUUID())])
              }
            >
              反転した独立部品を作成
            </button>
          </details>
        </fieldset>
      </details>
    </section>
  );
}
