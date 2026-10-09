import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { deleteAttachment, putAttachment, updateGame } from '../../core3d/game/authoring';
import { rotationFromDegrees, rotationToDegrees } from '../../core3d/commands/objectEditing';
import { transformPoint, worldMatrix } from '../../core3d/model/coordinates';
import { isNodeLocked } from '../../core3d/model/editability';
import type { Game3D, GameAttachment3D, Project3D, Vec3 } from '../../core3d/model/project';
import type { ProjectSession } from './projectSession';
import './nativeGamePanel.css';

type Kind = 'anchors' | 'colliders';
type Collider = Game3D['colliders'][number];
type Bounds = { min: Vec3; max: Vec3; size: Vec3 };
type Execute = (revision: number, operation: (candidate: Project3D) => void) => Project3D | null;
const axes = ['X', 'Y', 'Z'];

function numeric(value: string, label: string, minimum?: number, exclusive = false) {
  const result = Number(value);
  if (!value.trim() || !Number.isFinite(result))
    throw new Error(`${label}は有限の数値で入力してください。`);
  if (minimum !== undefined && (exclusive ? result <= minimum : result < minimum))
    throw new Error(
      `${label}は${minimum}${exclusive ? 'より大きい' : '以上の'}値で入力してください。`,
    );
  return result;
}

function vector(values: string[], label: string, positive = false): Vec3 {
  return values.map((value, index) =>
    numeric(value, `${label} ${axes[index]}`, positive ? 0 : undefined, positive),
  ) as Vec3;
}

function meshBounds(project: Project3D): Bounds | null {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const meshes = new Map(project.meshes.map((mesh) => [mesh.id, mesh]));
  for (const node of project.nodes) {
    const mesh = node.meshId ? meshes.get(node.meshId) : undefined;
    if (!mesh?.vertices.length) continue;
    const matrix = worldMatrix(project, node.id);
    for (const vertex of mesh.vertices) {
      const point = transformPoint(matrix, vertex.position);
      if (!point.every(Number.isFinite)) return null;
      point.forEach((value, index) => {
        min[index] = Math.min(min[index], value);
        max[index] = Math.max(max[index], value);
      });
    }
  }
  if (!min.every(Number.isFinite)) return null;
  const size = max.map((value, index) => value - min[index]) as Vec3;
  return size.every(Number.isFinite) ? { min, max, size } : null;
}

function automaticOrigin(bounds: Bounds, mode: 'feet' | 'center'): Vec3 {
  return bounds.min.map((value, index) =>
    mode === 'feet' && index === 1 ? value : value / 2 + bounds.max[index] / 2,
  ) as Vec3;
}

function NumericVector({
  label,
  values,
  onChange,
  disabled = false,
}: {
  label: string;
  values: string[];
  onChange(values: string[]): void;
  disabled?: boolean;
}) {
  return (
    <div className="native-game-values">
      {axes.map((axis, index) => (
        <label key={axis}>
          {label} {axis}
          <input
            inputMode="decimal"
            value={values[index]}
            disabled={disabled}
            onChange={(event) =>
              onChange(values.map((value, i) => (i === index ? event.target.value : value)))
            }
          />
        </label>
      ))}
    </div>
  );
}

/** Subscribe to editing boundaries, not pointer samples or animation frames. */
function useGameProject(session: ProjectSession) {
  const store = useMemo(
    () => ({
      subscribe: (listener: () => void) => session.edit.subscribe(listener),
      getSnapshot: () => {
        const state = session.edit.state;
        return JSON.stringify([
          state.revision,
          session.state.readOnly,
          state.context.readOnly,
          state.active,
          state.blocked,
        ]);
      },
    }),
    [session],
  );
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const revision = session.state.revision;
  return useMemo(() => ({ project: session.project, revision }), [session, revision]).project;
}

function settingsDraft(game: Game3D) {
  return {
    assetId: game.assetId,
    assetKind: game.assetKind,
    unitMeters: String(game.unitMeters),
    forward: game.forward,
    originMode: game.originMode,
    origin: game.origin.map(String),
  };
}

function GameSettings({
  project,
  disabled,
  execute,
}: {
  project: Project3D;
  disabled: boolean;
  execute: Execute;
}) {
  const [draft, setDraft] = useState(() => settingsDraft(project.game));
  const [baseRevision, setBaseRevision] = useState(project.revision);
  const [dirty, setDirty] = useState(false);
  const bounds = useMemo(() => meshBounds(project), [project]);
  const stale = baseRevision !== project.revision;
  useEffect(() => {
    if (dirty) return;
    setDraft(settingsDraft(project.game));
    setBaseRevision(project.revision);
  }, [project, dirty]);
  function change(update: Partial<typeof draft>) {
    setDraft((value) => ({ ...value, ...update }));
    setDirty(true);
  }
  function reload() {
    setDraft(settingsDraft(project.game));
    setBaseRevision(project.revision);
    setDirty(false);
  }
  const origin =
    draft.originMode === 'custom' || !dirty
      ? draft.origin
      : bounds
        ? automaticOrigin(bounds, draft.originMode).map(String)
        : ['0', '0', '0'];
  return (
    <section aria-label="ゲーム向け基本情報">
      <h4>種類・寸法・受渡し座標</h4>
      <p>
        {bounds
          ? `rest寸法（m）: X ${bounds.size[0].toPrecision(5)} / Y ${bounds.size[1].toPrecision(5)} / Z ${bounds.size[2].toPrecision(5)}`
          : '寸法を計測できるmeshがありません。feet / centerは使用できません。'}
      </p>
      <p>非表示の部品を含む全meshのworld寸法です。poseとアニメーションは計測に含みません。</p>
      {stale && dirty && (
        <p role="status">
          作品が更新されました。入力を適用する前に基本情報の現在値を読み直してください。
        </p>
      )}
      <button type="button" onClick={reload}>
        基本情報の現在値を読む（入力を戻す）
      </button>
      <fieldset disabled={disabled}>
        <legend>ゲーム向け基本情報の編集</legend>
        <label>
          asset ID
          <input
            value={draft.assetId}
            maxLength={128}
            onChange={(event) => change({ assetId: event.target.value })}
          />
        </label>
        <p>IDは英数字で開始し、英数字・ハイフン・下線の128文字以内です。</p>
        <label>
          asset種類
          <input
            value={draft.assetKind}
            maxLength={4096}
            placeholder="prop / character / environment など"
            onChange={(event) => change({ assetKind: event.target.value })}
          />
        </label>
        <label>
          受渡し単位（1単位あたりのm）
          <input
            inputMode="decimal"
            value={draft.unitMeters}
            onChange={(event) => change({ unitMeters: event.target.value })}
          />
        </label>
        <label>
          受渡し前方向
          <select
            value={draft.forward}
            onChange={(event) => change({ forward: event.target.value as Game3D['forward'] })}
          >
            {['+Z', '-Z', '+X', '-X'].map((direction) => (
              <option key={direction} value={direction}>
                {direction}
              </option>
            ))}
          </select>
        </label>
        <label>
          原点の決め方
          <select
            value={draft.originMode}
            onChange={(event) => change({ originMode: event.target.value as Game3D['originMode'] })}
          >
            <option value="custom">custom（数値指定）</option>
            <option value="feet" disabled={!bounds}>
              feet（足元中央）
            </option>
            <option value="center" disabled={!bounds}>
              center（全体の中央）
            </option>
          </select>
        </label>
        <NumericVector
          label="受渡し原点（m）"
          values={origin}
          disabled={draft.originMode !== 'custom'}
          onChange={(values) => change({ origin: values })}
        />
        {draft.originMode !== 'custom' && (
          <>
            <p>
              {dirty
                ? '原点候補（適用するまで未保存）'
                : '保存済みの原点です。形状の変更には自動追従しません。'}
            </p>
            <button
              type="button"
              disabled={!bounds || stale}
              onClick={() => change({ originMode: draft.originMode })}
            >
              rest寸法から原点を再計算
            </button>
          </>
        )}
        <p>feetは最小Yと中央X/Z、centerは全軸の中央です。適用時のrest寸法から原点を保存します。</p>
        <button
          type="button"
          disabled={!dirty || stale || (draft.originMode !== 'custom' && !bounds)}
          onClick={() => {
            const result = execute(baseRevision, (candidate) => {
              if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(draft.assetId))
                throw new Error('asset IDの文字と長さを確認してください。');
              if (!draft.assetKind.trim()) throw new Error('asset種類を入力してください。');
              let nextOrigin: Vec3;
              if (draft.originMode === 'custom') nextOrigin = vector(draft.origin, '受渡し原点');
              else {
                const currentBounds = meshBounds(candidate);
                if (!currentBounds) throw new Error('原点を計測できるmeshがありません。');
                nextOrigin = automaticOrigin(currentBounds, draft.originMode);
              }
              updateGame(candidate, {
                assetId: draft.assetId,
                assetKind: draft.assetKind,
                unitMeters: numeric(draft.unitMeters, '受渡し単位', 0, true),
                forward: draft.forward,
                originMode: draft.originMode,
                origin: nextOrigin,
              });
            });
            if (result) {
              setDraft(settingsDraft(result.game));
              setBaseRevision(result.revision);
              setDirty(false);
            }
          }}
        >
          ゲーム基本情報を適用
        </button>
      </fieldset>
    </section>
  );
}

function attachmentDraft(attachment?: GameAttachment3D | Collider) {
  const collider = attachment && 'shape' in attachment ? attachment : undefined;
  return {
    name: attachment?.name ?? '',
    purpose: attachment?.purpose ?? '',
    nodeId: attachment?.nodeId ?? '',
    translation: attachment?.transform.translation.map(String) ?? ['0', '0', '0'],
    rotation: attachment
      ? rotationToDegrees(attachment.transform.rotation).map(String)
      : ['0', '0', '0'],
    scale: attachment?.transform.scale.map(String) ?? ['1', '1', '1'],
    shape: collider?.shape ?? 'box',
    size: collider?.size.map(String) ?? ['1', '1', '1'],
    radius: String(collider?.radius ?? 0.5),
    height: String(collider?.height ?? 1),
  };
}

function AttachmentEditor({
  project,
  kind,
  disabled,
  execute,
}: {
  project: Project3D;
  kind: Kind;
  disabled: boolean;
  execute: Execute;
}) {
  const label = kind === 'anchors' ? 'anchor' : 'collider';
  const [id, setId] = useState('');
  const [draft, setDraft] = useState(() => attachmentDraft());
  const [baseRevision, setBaseRevision] = useState(project.revision);
  const [dirty, setDirty] = useState(false);
  const items = project.game[kind];
  const selected = items.find((item) => item.id === id);
  const stale = baseRevision !== project.revision;
  const joints = new Set(project.skins.flatMap((skin) => skin.joints.map((joint) => joint.nodeId)));
  const locked = !!(
    (selected?.nodeId && isNodeLocked(project, selected.nodeId)) ||
    (draft.nodeId && isNodeLocked(project, draft.nodeId))
  );
  useEffect(() => {
    if (dirty) return;
    setDraft(attachmentDraft(selected));
    setBaseRevision(project.revision);
  }, [selected, project.revision, dirty]);
  function change(update: Partial<typeof draft>) {
    setDraft((value) => ({ ...value, ...update }));
    setDirty(true);
  }
  function read(nextId: string) {
    setId(nextId);
    setDraft(attachmentDraft(items.find((item) => item.id === nextId)));
    setBaseRevision(project.revision);
    setDirty(false);
  }
  function save() {
    const nextId = id || crypto.randomUUID();
    const result = execute(baseRevision, (candidate) => {
      if (id && !candidate.game[kind].some((item) => item.id === id))
        throw new Error(`${label}がありません。対象を選び直してください。`);
      if (!draft.name.trim()) throw new Error(`${label}名を入力してください。`);
      const attachment: GameAttachment3D = {
        id: nextId,
        name: draft.name,
        purpose: draft.purpose,
        nodeId: draft.nodeId || null,
        transform: {
          translation: vector(draft.translation, `${label}位置`),
          rotation: rotationFromDegrees(vector(draft.rotation, `${label}回転`)),
          scale: vector(draft.scale, `${label}倍率`, true),
        },
      };
      if (kind === 'anchors') putAttachment(candidate, kind, attachment);
      else {
        const previous = candidate.game.colliders.find((item) => item.id === nextId);
        const collider: Collider = {
          ...attachment,
          shape: draft.shape,
          size:
            draft.shape === 'box'
              ? vector(draft.size, 'collider寸法', true)
              : (previous?.size ?? [1, 1, 1]),
          radius:
            draft.shape !== 'box'
              ? numeric(draft.radius, 'collider半径', 0, true)
              : (previous?.radius ?? 0.5),
          height:
            draft.shape === 'capsule'
              ? numeric(draft.height, 'collider円柱部の長さ', 0)
              : (previous?.height ?? 1),
        };
        putAttachment(candidate, kind, collider);
      }
    });
    if (result) {
      setId(nextId);
      setDraft(attachmentDraft(result.game[kind].find((item) => item.id === nextId)));
      setBaseRevision(result.revision);
      setDirty(false);
    }
  }
  return (
    <section aria-label={`3D ${label}編集`}>
      <h4>
        {label}（{items.length}件）
      </h4>
      <label>
        {label}を選択
        <select value={id} onChange={(event) => read(event.target.value)}>
          <option value="">新しい{label}</option>
          {id && !selected && <option value={id}>削除済みの{label}</option>}
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || '名前なし'} / {item.id}
            </option>
          ))}
        </select>
      </label>
      {selected && <p className="native-game-id">ID: {selected.id}</p>}
      {stale && dirty && (
        <p role="status">作品が更新されました。{label}の現在値を読み直してから編集してください。</p>
      )}
      {locked && <p role="status">追従先がロック中です。先に対象のロックを解除してください。</p>}
      <button type="button" onClick={() => read(selected?.id ?? '')}>
        {label}の現在値を読む（入力を戻す）
      </button>
      <fieldset disabled={disabled}>
        <legend>{label}の設定</legend>
        <label>
          {label}名
          <input
            value={draft.name}
            maxLength={4096}
            onChange={(event) => change({ name: event.target.value })}
          />
        </label>
        <label>
          {label}用途
          <input
            value={draft.purpose}
            maxLength={4096}
            onChange={(event) => change({ purpose: event.target.value })}
          />
        </label>
        <label>
          {label}追従先（node / bone）
          <select value={draft.nodeId} onChange={(event) => change({ nodeId: event.target.value })}>
            <option value="">なし（world）</option>
            {draft.nodeId && !project.nodes.some((node) => node.id === draft.nodeId) && (
              <option value={draft.nodeId}>存在しない追従先</option>
            )}
            {project.nodes.map((node) => (
              <option key={node.id} value={node.id} disabled={isNodeLocked(project, node.id)}>
                {joints.has(node.id) ? 'bone' : 'node'}: {node.name} / {node.id}
                {isNodeLocked(project, node.id) ? '（ロック中）' : ''}
              </option>
            ))}
          </select>
        </label>
        <p>
          位置・回転・倍率は追従先に対するlocal値です。追従先なしではworld値です。変更時にworld位置を自動補正しません。
        </p>
        <NumericVector
          label={`${label}位置（m）`}
          values={draft.translation}
          onChange={(values) => change({ translation: values })}
        />
        <NumericVector
          label={`${label}回転（度・XYZ）`}
          values={draft.rotation}
          onChange={(values) => change({ rotation: values })}
        />
        <NumericVector
          label={`${label}倍率`}
          values={draft.scale}
          onChange={(values) => change({ scale: values })}
        />
        {kind === 'colliders' && (
          <>
            <label>
              collider形状
              <select
                value={draft.shape}
                onChange={(event) => change({ shape: event.target.value as Collider['shape'] })}
              >
                <option value="box">box（箱）</option>
                <option value="sphere">sphere（球）</option>
                <option value="capsule">capsule（カプセル）</option>
              </select>
            </label>
            {draft.shape === 'box' ? (
              <NumericVector
                label="collider全寸法（m）"
                values={draft.size}
                onChange={(values) => change({ size: values })}
              />
            ) : (
              <label>
                collider半径（m）
                <input
                  inputMode="decimal"
                  value={draft.radius}
                  onChange={(event) => change({ radius: event.target.value })}
                />
              </label>
            )}
            {draft.shape === 'capsule' && (
              <>
                <label>
                  collider円柱部の長さ（m）
                  <input
                    inputMode="decimal"
                    value={draft.height}
                    onChange={(event) => change({ height: event.target.value })}
                  />
                </label>
                <p>
                  capsuleはlocal Y方向です。全高 = 円柱部の長さ + 半径 ×
                  2。円柱部が0なら球になります。
                </p>
              </>
            )}
            <p>
              寸法と半径は倍率を掛ける前の値です。非均等な倍率は受渡し先で形状の対応確認が必要です。
            </p>
          </>
        )}
        <div className="native-game-actions">
          <button
            type="button"
            disabled={stale || locked || !!(id && (!selected || !dirty))}
            onClick={save}
          >
            {id ? `${label}の変更を適用` : `${label}を追加`}
          </button>
          <button
            type="button"
            disabled={
              !selected || stale || !!(selected.nodeId && isNodeLocked(project, selected.nodeId))
            }
            onClick={() => {
              const result = execute(baseRevision, (candidate) =>
                deleteAttachment(candidate, kind, id),
              );
              if (result) {
                setId('');
                setDraft(attachmentDraft());
                setBaseRevision(result.revision);
                setDirty(false);
              }
            }}
          >
            選択中の{label}を削除
          </button>
        </div>
      </fieldset>
    </section>
  );
}

export function NativeGamePanel({
  session,
  onChange,
}: {
  session: ProjectSession;
  onChange(): void;
}) {
  const project = useGameProject(session);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const composing = useRef(false);
  const edit = session.edit.state;
  const readOnly = session.state.readOnly || edit.context.readOnly;
  const disabled = readOnly || edit.active || edit.blocked.length > 0;
  function execute(revision: number, operation: (candidate: Project3D) => void): Project3D | null {
    if (composing.current) return null;
    try {
      const current = session.project;
      const currentEdit = session.edit.state;
      if (session.state.readOnly || currentEdit.context.readOnly)
        throw new Error('この作品は読み取り専用です。');
      if (currentEdit.active || currentEdit.blocked.length)
        throw new Error('プレビューや他の操作を終了してから編集してください。');
      if (current.id !== project.id || current.revision !== revision)
        throw new Error('作品が変わりました。現在値を読み直してから編集してください。');
      session.executeAuthoring(operation, { id: project.id, revision });
      setError('');
      setNotice('適用しました。元に戻す操作で取り消せます。');
      return session.project;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setNotice('');
      return null;
    } finally {
      onChange();
    }
  }
  return (
    <section
      className="native-game"
      aria-label="3Dゲーム向け情報"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDownCapture={(event) => {
        if (
          event.key === 'Enter' &&
          (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)
        ) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClickCapture={(event) => {
        if (composing.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <h3>ゲーム向け情報を作る</h3>
      <p>単位・前方向・原点は受渡し用metadataです。正本の形状（m・Y上・+Z前）は変換しません。</p>
      <p>anchorとcolliderもmetadataです。衝突判定やゲームの動作は受渡し先で設定します。</p>
      {readOnly ? (
        <p role="status">読み取り専用です。設定の確認はできます。</p>
      ) : (
        disabled && (
          <p role="status">
            プレビューや他の操作中は編集できません。終了してから操作してください。
          </p>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <GameSettings
        key={`${project.id}:settings`}
        project={project}
        disabled={disabled}
        execute={execute}
      />
      <AttachmentEditor
        key={`${project.id}:anchors`}
        project={project}
        kind="anchors"
        disabled={disabled}
        execute={execute}
      />
      <AttachmentEditor
        key={`${project.id}:colliders`}
        project={project}
        kind="colliders"
        disabled={disabled}
        execute={execute}
      />
    </section>
  );
}
