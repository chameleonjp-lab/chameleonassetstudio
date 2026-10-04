import { useEffect, useId, useRef, useState } from 'react';
import type { Project3D, Vec3 } from '../../core3d/model/project';
import type { NativeEditBinding } from '../../core3d/ports/editPort';
import { useNativeObjectSelection } from './useNativeEditState';
import {
  addPrimitive,
  PRIMITIVE_LIMITS,
  type PrimitiveKind,
} from '../../core3d/commands/primitives';
import {
  moveVertices,
  extrudeFace,
  deleteFaces,
  recalculateNormals,
} from '../../core3d/commands/meshEditing';
import {
  cloneNode,
  renameNode,
  setNodeTransform,
  updateMaterial,
  rotationFromDegrees,
  rotationToDegrees,
} from '../../core3d/commands/objectEditing';
import {
  addMaterial,
  assignMaterial,
  duplicateMaterial,
} from '../../core3d/commands/materialEditing';
import './nativeAuthoringPanel.css';

type Draft = Record<string, string>;
const initial: Draft = {
  width: '1',
  height: '1',
  depth: '1',
  segments: '2',
  x: '0',
  y: '0',
  z: '0',
  sx: '1',
  sy: '1',
  sz: '1',
  rx: '0',
  ry: '0',
  rz: '0',
  dx: '0',
  dy: '0',
  dz: '0',
  distance: '0.2',
  r: '0.15',
  g: '0.7',
  b: '0.35',
  a: '1',
  metallic: '0',
  roughness: '0.65',
};
function numeric(draft: Draft, key: string) {
  if (!draft[key].trim() || !Number.isFinite(Number(draft[key])))
    throw new Error('空欄を残さず、有限の数値を入力してください。');
  return Number(draft[key]);
}
/** Numeric Apply commands are atomic; these drafts never enter autosave. */
export function NativeAuthoringPanel({
  project,
  disabled,
  execute,
  edit,
}: {
  project: Project3D;
  disabled: boolean;
  execute: (operation: (candidate: Project3D) => void) => void;
  /** Product panels share the session binding; omitted only by standalone fixtures. */
  edit?: NativeEditBinding;
}) {
  const [kind, setKind] = useState<PrimitiveKind>('box');
  const {
    activeId: selected,
    selectedIds,
    setActive,
    setSelection,
  } = useNativeObjectSelection(project, edit);
  const [mode, setMode] = useState<'vertex' | 'edge' | 'face'>('vertex');
  const [entity, setEntity] = useState('');
  const [entityTarget, setEntityTarget] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [draft, setDraft] = useState(initial);
  const [name, setName] = useState('');
  const [copyMaterial, setCopyMaterial] = useState(false);
  const [loadedNode, setLoadedNode] = useState('');
  const [loadedMaterial, setLoadedMaterial] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const composing = useRef(false);
  const descriptionId = useId();
  const node = project.nodes.find((n) => n.id === selected);
  const mesh = project.meshes.find((m) => m.id === node?.meshId);
  const targetKey = `${project.id}:${node?.id ?? ''}:${mesh?.id ?? ''}`;
  useEffect(() => {
    setEntity('');
    setEntityTarget(targetKey);
    setMaterialId('');
    setLoadedNode('');
    setLoadedMaterial('');
    setCopyMaterial(false);
    setNotice('');
  }, [targetKey]);
  const edgeMap = new Map<string, string[]>();
  for (const face of mesh?.faces ?? [])
    face.vertexIds.forEach((id, index) => {
      const pair = [id, face.vertexIds[(index + 1) % face.vertexIds.length]].sort();
      edgeMap.set(JSON.stringify(pair), pair);
    });
  const entities =
    mode === 'vertex'
      ? (mesh?.vertices.map((v) => ({ id: v.id, vertices: [v.id] })) ?? [])
      : mode === 'face'
        ? (mesh?.faces.map((f) => ({ id: f.id, vertices: f.vertexIds })) ?? [])
        : [...edgeMap].map(([id, vertices]) => ({ id, vertices }));
  const chosen = entityTarget === targetKey ? entities.find((e) => e.id === entity) : undefined;
  const material = project.materials.find((m) => m.id === materialId);
  const materialUsedHere = !!mesh?.faces.some((face) => face.materialId === materialId);
  const nodeReady = !!node && loadedNode === `${project.id}:${node.id}:${project.revision}`;
  const materialReady =
    !!material && loadedMaterial === `${project.id}:${material.id}:${project.revision}`;
  const uses = project.nodes.filter((n) =>
    project.meshes.find((m) => m.id === n.meshId)?.faces.some((f) => f.materialId === materialId),
  );
  function act(operation: () => void) {
    if (disabled || composing.current) return;
    try {
      if (edit) {
        const current = edit.state;
        if (
          current.projectId !== project.id ||
          current.revision !== project.revision ||
          current.context.activeId !== selected
        )
          throw new Error('制作対象や作品が変わりました。現在の対象を確認し直してください。');
      }
      operation();
      setError('');
      setNotice('適用しました。元に戻す操作で取り消せます。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setNotice('');
    }
  }
  function vector(keys: string[]): Vec3 {
    return keys.map((k) => numeric(draft, k)) as Vec3;
  }
  function field(key: string, label: string) {
    return (
      <label key={key}>
        {label}
        <input
          inputMode="decimal"
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        />
      </label>
    );
  }
  function readNode() {
    if (!node) return;
    const rotation = rotationToDegrees(node.transform.rotation);
    setLoadedNode(`${project.id}:${node.id}:${project.revision}`);
    setName(node.name);
    setDraft((d) => ({
      ...d,
      x: String(node.transform.translation[0]),
      y: String(node.transform.translation[1]),
      z: String(node.transform.translation[2]),
      sx: String(node.transform.scale[0]),
      sy: String(node.transform.scale[1]),
      sz: String(node.transform.scale[2]),
      rx: String(rotation[0]),
      ry: String(rotation[1]),
      rz: String(rotation[2]),
    }));
  }
  function readMaterial() {
    if (!material) return;
    setLoadedMaterial(`${project.id}:${material.id}:${project.revision}`);
    setDraft((d) => ({
      ...d,
      r: String(material.baseColor[0]),
      g: String(material.baseColor[1]),
      b: String(material.baseColor[2]),
      a: String(material.baseColor[3]),
      metallic: String(material.metallic),
      roughness: String(material.roughness),
    }));
  }
  return (
    <section
      className="native-authoring"
      aria-label="3D制作"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
    >
      <h3>形と材質を作る</h3>
      <p>
        数値を入力して「適用」すると一回の編集になります。画面・組立と同じ選択を使います。
        複数選択中も、部品・頂点・辺・面の操作はアクティブな1個が対象です。
        材質変更の影響範囲は材質欄で確認してください。
      </p>
      {selectedIds.length > 1 && (
        <p>
          選択中 {selectedIds.length} 個。制作対象は {node?.name ?? 'なし'} です。
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <fieldset disabled={disabled}>
        <details>
          <summary>基本形を作成</summary>
          <p>
            作成時に寸法をメートルで指定し、直接編集できるmeshを作ります。作成パラメータは保持しません。変更前の複製とUndoを利用できます。
          </p>
          <label>
            基本形
            <select value={kind} onChange={(e) => setKind(e.target.value as PrimitiveKind)}>
              <option value="box">箱</option>
              <option value="plane">平面</option>
              <option value="sphere">球</option>
              <option value="cylinder">円柱</option>
              <option value="cone">円錐</option>
            </select>
          </label>
          <div className="native-authoring-fields">
            {field('width', '幅 X（m）')}
            {field('height', '高さ Y（m）')}
            {field('depth', '奥行 Z（m）')}
            {field('segments', '分割数')}
          </div>
          <p>
            箱・平面は一辺の分割、曲面は四分円の分割です。平面はXZ面に作成し、高さは使いません。
          </p>
          <p>
            寸法 {PRIMITIVE_LIMITS.minDimension}〜{PRIMITIVE_LIMITS.maxDimension} m、分割数 1〜
            {PRIMITIVE_LIMITS.maxSegments[kind]}。一回の作成上限で、端末のメモリ保証ではありません。
          </p>
          <button
            type="button"
            onClick={() =>
              act(() => {
                let id = '';
                execute((p) => {
                  id = addPrimitive(p, crypto.randomUUID(), {
                    kind,
                    width: numeric(draft, 'width'),
                    height: numeric(draft, 'height'),
                    depth: numeric(draft, 'depth'),
                    segments: numeric(draft, 'segments'),
                  });
                });
                setSelection([id], id);
                setEntity('');
                setMaterialId('');
              })
            }
          >
            基本形を追加
          </button>
        </details>
        <label>
          制作オブジェクト
          <select
            value={node?.id ?? ''}
            aria-describedby={`${descriptionId}-node`}
            onChange={(e) => {
              setActive(e.target.value);
              setEntity('');
              setMaterialId('');
              setNotice('');
            }}
          >
            <option value="">選択してください</option>
            {project.nodes.map((n, i) => (
              <option key={n.id} value={n.id}>
                {i + 1}: {Array.from(n.name).slice(0, 8).join('')}
              </option>
            ))}
          </select>
        </label>
        {node ? (
          <p id={`${descriptionId}-node`}>
            制作対象（アクティブ）: {node.name} / {node.id}
          </p>
        ) : (
          <p id={`${descriptionId}-node`}>
            対象を選んでください。削除・Undo後に存在しない対象は操作しません。
          </p>
        )}
        <details>
          <summary>部品の名前・位置・複製</summary>
          <p>
            現在値を置き換える絶対値です。親に対するlocal座標で、選択全体の差分変形とは別の操作です。
            回転は度数（local XYZ順）。負の倍率は反転、0は指定できません。
          </p>
          <button type="button" disabled={!node} onClick={readNode}>
            部品の現在値を読む
          </button>
          {!nodeReady && (
            <p>
              対象の変更やUndoの後は、現在値を読んでから名前・変形を適用してください。入力途中の値は保持しています。
            </p>
          )}
          <label>
            部品名
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button
            type="button"
            disabled={!nodeReady}
            onClick={() => act(() => execute((p) => renameNode(p, node!.id, name)))}
          >
            部品名を適用
          </button>
          <div className="native-authoring-fields">
            {field('x', '位置 X（m）')}
            {field('y', '位置 Y（m）')}
            {field('z', '位置 Z（m）')}
            {field('sx', '倍率 X')}
            {field('sy', '倍率 Y')}
            {field('sz', '倍率 Z')}
            {field('rx', '回転 X（度）')}
            {field('ry', '回転 Y（度）')}
            {field('rz', '回転 Z（度）')}
          </div>
          <button
            type="button"
            disabled={!nodeReady}
            onClick={() =>
              act(() =>
                execute((p) =>
                  setNodeTransform(p, node!.id, {
                    translation: vector(['x', 'y', 'z']),
                    scale: vector(['sx', 'sy', 'sz']),
                    rotation: rotationFromDegrees(vector(['rx', 'ry', 'rz'])),
                  }),
                ),
              )
            }
          >
            部品の変形を適用
          </button>
          <button
            type="button"
            disabled={!node}
            onClick={() =>
              act(() => {
                let id = '';
                execute((p) => {
                  id = cloneNode(p, node!.id, crypto.randomUUID());
                });
                setSelection([id], id);
                setEntity('');
                setMaterialId('');
              })
            }
          >
            独立した部品を複製
          </button>
        </details>
        <details>
          <summary>頂点・辺・面を編集</summary>
          <p>
            mesh
            local座標（m）で移動します。形の変更後はmesh全体をflat法線に再計算します。UVと材質は保持します。共有mesh・bind済みの形状は直接変更できません。
          </p>
          <label>
            編集要素
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                setEntity('');
              }}
            >
              <option value="vertex">頂点</option>
              <option value="edge">辺</option>
              <option value="face">面</option>
            </select>
          </label>
          <label>
            制作要素
            <select
              value={chosen?.id ?? ''}
              onChange={(e) => {
                setEntityTarget(targetKey);
                setEntity(e.target.value);
              }}
            >
              <option value="">選択してください</option>
              {entities.map((e, i) => (
                <option key={e.id} value={e.id}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          {chosen && (
            <p>
              要素ID: {chosen.id}
              <br />
              頂点ID: {chosen.vertices.join(', ')}
              <br />
              座標（local m）:{' '}
              {chosen.vertices
                .map((id) => mesh?.vertices.find((vertex) => vertex.id === id)?.position.join(', '))
                .join(' / ')}
              {mode === 'face' && (
                <>
                  <br />
                  UV:{' '}
                  {mesh?.faces
                    .find((face) => face.id === chosen.id)
                    ?.uv?.map((uv) => uv.join(', '))
                    .join(' / ') ?? '未設定'}
                </>
              )}
            </p>
          )}
          <div className="native-authoring-fields">
            {field('dx', '移動量 X（m）')}
            {field('dy', '移動量 Y（m）')}
            {field('dz', '移動量 Z（m）')}
          </div>
          <button
            type="button"
            disabled={!mesh || !chosen}
            onClick={() =>
              act(() =>
                execute((p) =>
                  moveVertices(p, mesh!.id, chosen!.vertices, vector(['dx', 'dy', 'dz'])),
                ),
              )
            }
          >
            選択要素を移動
          </button>
          {field('distance', '押出し距離（m）')}
          <button
            type="button"
            disabled={!mesh || !chosen || mode !== 'face'}
            onClick={() =>
              act(() => {
                let id = '';
                execute((p) => {
                  id = extrudeFace(
                    p,
                    mesh!.id,
                    chosen!.id,
                    numeric(draft, 'distance'),
                    crypto.randomUUID(),
                  );
                });
                setEntity(id);
              })
            }
          >
            選択面を押し出す
          </button>
          <button
            type="button"
            disabled={!mesh || !chosen || mode !== 'face'}
            onClick={() =>
              act(() => {
                execute((p) => deleteFaces(p, mesh!.id, [chosen!.id]));
                setEntity('');
              })
            }
          >
            選択面を削除
          </button>
          <button
            type="button"
            disabled={!mesh}
            onClick={() => act(() => execute((p) => recalculateNormals(p, mesh!.id, 'flat')))}
          >
            flat法線を適用
          </button>
          <button
            type="button"
            disabled={!mesh}
            onClick={() => act(() => execute((p) => recalculateNormals(p, mesh!.id, 'smooth')))}
          >
            smooth法線を適用
          </button>
          {mesh && (
            <p>
              {mesh.vertices.length} 頂点 / {mesh.faces.length} 面 / UVあり{' '}
              {mesh.faces.filter((f) => f.uv).length} 面。UVがない既存形状へ自動の展開は行いません。
            </p>
          )}
        </details>
        <details>
          <summary>材質の色・金属・粗さ</summary>
          <label>
            制作材質
            <select
              value={material?.id ?? ''}
              onChange={(e) => {
                setMaterialId(e.target.value);
                setCopyMaterial(false);
              }}
            >
              <option value="">選択してください</option>
              {project.materials.map((m, i) => (
                <option key={m.id} value={m.id}>
                  材質 {i + 1}
                </option>
              ))}
            </select>
          </label>
          {material && (
            <p>
              材質ID: {material.id} / 影響する部品 {uses.length} 個:{' '}
              {uses.map((n) => `${n.name} (${n.id})`).join(', ')}
            </p>
          )}
          <button type="button" disabled={!material} onClick={readMaterial}>
            材質の現在値を読む
          </button>
          {!materialReady && (
            <p>現在値を読んでから適用してください。対象や作品の変更後は再読が必要です。</p>
          )}
          <p>値域0〜1。RGBはlinear値です。新しい値は同じ材質を使う全ての面へ適用されます。</p>
          <div className="native-authoring-fields">
            {field('r', '赤 R')}
            {field('g', '緑 G')}
            {field('b', '青 B')}
            {field('a', '不透明度 A')}
            {field('metallic', '金属 metallic')}
            {field('roughness', '粗さ roughness')}
          </div>
          <button
            type="button"
            onClick={() =>
              act(() => {
                let id = '';
                execute((p) => {
                  id = addMaterial(p, crypto.randomUUID(), {
                    baseColor: ['r', 'g', 'b', 'a'].map((k) => numeric(draft, k)) as [
                      number,
                      number,
                      number,
                      number,
                    ],
                    metallic: numeric(draft, 'metallic'),
                    roughness: numeric(draft, 'roughness'),
                  });
                });
                setMaterialId(id);
                setCopyMaterial(false);
              })
            }
          >
            入力した値で材質を新規作成
          </button>
          <button
            type="button"
            disabled={!material}
            onClick={() =>
              act(() => {
                let id = '';
                execute((p) => {
                  id = duplicateMaterial(p, material!.id, crypto.randomUUID());
                });
                setMaterialId(id);
                setCopyMaterial(false);
              })
            }
          >
            選択材質の保存値を複製
          </button>
          <p>
            新規・複製した材質は未割当です。制作対象の面へ明示的に割り当てます。共有meshは先に部品を独立したコピーにしてください。
          </p>
          <button
            type="button"
            disabled={!material || !mesh?.faces.length}
            onClick={() =>
              act(() =>
                execute((p) =>
                  assignMaterial(
                    p,
                    mesh!.id,
                    mesh!.faces.map((face) => face.id),
                    material!.id,
                  ),
                ),
              )
            }
          >
            対象meshの全ての面へ材質を割当
          </button>
          <button
            type="button"
            disabled={!material || !mesh || mode !== 'face' || !chosen}
            onClick={() =>
              act(() => execute((p) => assignMaterial(p, mesh!.id, [chosen!.id], material!.id)))
            }
          >
            選択面へ材質を割当
          </button>
          <label className="native-authoring-check">
            <input
              type="checkbox"
              checked={copyMaterial}
              disabled={!materialUsedHere}
              onChange={(e) => setCopyMaterial(e.target.checked)}
            />
            材質を複製し、このmeshだけに適用
          </label>
          <button
            type="button"
            disabled={!materialReady || (copyMaterial && !materialUsedHere)}
            onClick={() =>
              act(() => {
                execute((p) =>
                  updateMaterial(
                    p,
                    material!.id,
                    {
                      baseColor: ['r', 'g', 'b', 'a'].map((k) => numeric(draft, k)) as [
                        number,
                        number,
                        number,
                        number,
                      ],
                      metallic: numeric(draft, 'metallic'),
                      roughness: numeric(draft, 'roughness'),
                    },
                    copyMaterial ? mesh!.id : undefined,
                  ),
                );
                if (copyMaterial) setMaterialId('');
              })
            }
          >
            材質を適用
          </button>
        </details>
      </fieldset>
    </section>
  );
}
