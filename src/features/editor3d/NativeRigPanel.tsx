import { formatNativeEditingFailure, formatNativeMotionStatusReason } from './editingFailure';
import { guardNativeCompositionKey } from './keyboardSafety';
import { useEffect, useRef, useState } from 'react';
import type { Project3D, Transform3D } from '../../core3d/model/project';
import { identityTransform } from '../../core3d/model/project';
import {
  addRigJoint,
  addHumanoidRig,
  extendSkinJoints,
  bindSkin,
  setSkinWeights,
  fitRigJoint,
  reparentRigJoint,
  rebindSkin,
  removeUnusedRigJoint,
} from '../../core3d/rig/authoring';
import { rotationFromDegrees, rotationToDegrees } from '../../core3d/commands/objectEditing';
import type { ProjectSession } from './projectSession';
import { useNativeObjectSelection } from './useNativeEditState';
import './nativeRigPanel.css';
import { NativeRigidAttachmentPanel } from './NativeRigidAttachmentPanel';
import { rigPoseTargetIds } from '../../core3d/rig/pose';

type Draft = Record<string, string>;
const initial: Draft = {
  x: '0',
  y: '0',
  z: '0',
  rx: '0',
  ry: '0',
  rz: '0',
  sx: '1',
  sy: '1',
  sz: '1',
};
function number(value: string) {
  if (!value.trim() || !Number.isFinite(Number(value)))
    throw new Error('有限の数値を入力してください。');
  return Number(value);
}
export function NativeRigPanel({
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
  const [jointId, setJointId] = useState('');
  const [parentId, setParentId] = useState('');
  const [name, setName] = useState('Joint');
  const [draft, setDraft] = useState<Draft>(initial);
  const [loaded, setLoaded] = useState('');
  const [influences, setInfluences] = useState([
    { joint: '', weight: '1' },
    { joint: '', weight: '0' },
    { joint: '', weight: '0' },
    { joint: '', weight: '0' },
  ]);
  const [vertexId, setVertexId] = useState('');
  const [bindJointIds, setBindJointIds] = useState<string[]>([]);
  const [normalize, setNormalize] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [, redraw] = useState(0);
  const composing = useRef(false);
  useEffect(() => session.rigPose.subscribe(() => redraw((value) => value + 1)), [session]);
  const joints = project.nodes.filter((node) => node.meshId === undefined);
  const joint = joints.find((node) => node.id === jointId);
  const object = project.nodes.find((node) => node.id === activeId);
  const mesh = project.meshes.find((value) => value.id === object?.meshId);
  const skin = project.skins.find((value) => value.meshId === mesh?.id);
  const pose = session.rigPose.state;
  const identity = `${project.id}:${project.revision}:${jointId}`;
  useEffect(() => {
    setVertexId('');
  }, [project.id, mesh?.id]);
  const transform = (): Transform3D => ({
    translation: ['x', 'y', 'z'].map((key) => number(draft[key])) as [number, number, number],
    rotation: rotationFromDegrees(
      ['rx', 'ry', 'rz'].map((key) => number(draft[key])) as [number, number, number],
    ),
    scale: ['sx', 'sy', 'sz'].map((key) => number(draft[key])) as [number, number, number],
  });
  function act(operation: () => void) {
    if (disabled || composing.current) return;
    try {
      if (
        session.project.id !== project.id ||
        session.project.revision !== project.revision ||
        session.edit.state.context.activeId !== activeId
      )
        throw new Error('作品や対象が変わりました。確認して再操作してください。');
      operation();
      setError('');
      onChange();
    } catch (cause) {
      setError(formatNativeEditingFailure(cause, 'rig'));
      setNotice('');
    }
  }
  function execute(operation: (candidate: Project3D) => void) {
    session.executeAuthoring(operation, { id: project.id, revision: project.revision });
    setNotice('適用しました。元に戻す操作で取り消せます。');
  }
  function readJoint() {
    if (!joint) return;
    const current =
      pose.updates.find((update) => update.nodeId === jointId)?.transform ?? joint.transform;
    const rotation = rotationToDegrees(current.rotation);
    setDraft(
      Object.fromEntries(
        ['x', 'y', 'z', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz'].map((key, index) => [
          key,
          String([...current.translation, ...rotation, ...current.scale][index]),
        ]),
      ),
    );
    setParentId(joint.parentId ?? '');
    setLoaded(identity);
    setName(joint.name);
  }
  function assignments(ids: string[]) {
    const used = influences.filter((entry) => entry.joint !== '');
    const jointIds = used.map((entry) => entry.joint);
    const values = used.map((entry) => number(entry.weight));
    return ids.map((vertexId) => ({ vertexId, jointIds: [...jointIds], values: [...values] }));
  }
  return (
    <section
      className="native-rig"
      aria-label="3D骨と重み"
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
      <h3>骨と重みを作る</h3>
      <p>
        restは保存する基準形です。poseは変形確認だけで保存しません。bind後の形状変更は元データを守るため拒否します。
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <p role="status">
        {pose.active ? 'pose確認中（未保存）' : 'rest表示'}。
        {formatNativeMotionStatusReason(pose.reason, 'rig')}
      </p>
      <fieldset disabled={disabled}>
        <button
          type="button"
          onClick={() =>
            act(() => {
              const prefix = crypto.randomUUID();
              let ids: string[] = [];
              execute((p) => {
                ids = addHumanoidRig(p, prefix);
              });
              setJointId(ids[0]);
            })
          }
        >
          人型の骨ガイドを追加
        </button>
        <p>自作7jointの少数ガイドです。自動weightや自動fitは行いません。</p>
        <label>
          骨を選択
          <select
            value={joint?.id ?? ''}
            onChange={(e) => {
              session.rigPose.cancel('骨の選択が変わりました。');
              setJointId(e.target.value);
              setLoaded('');
            }}
          >
            <option value="">選択してください</option>
            {joints.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} / {node.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          骨の名前
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          親の骨
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">なし（root）</option>
            {joints.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name} / {node.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            act(() => {
              const id = crypto.randomUUID();
              execute((p) => addRigJoint(p, id, name, parentId || null, identityTransform()));
              setJointId(id);
              setLoaded('');
            })
          }
        >
          骨を追加
        </button>
        <button type="button" disabled={!joint} onClick={readJoint}>
          骨の現在値を読む
        </button>
        <div className="native-rig-fields">
          {Object.keys(initial).map((key) => (
            <label key={key}>
              {
                (
                  {
                    x: '骨位置 X',
                    y: '骨位置 Y',
                    z: '骨位置 Z',
                    rx: '骨回転 X（度）',
                    ry: '骨回転 Y（度）',
                    rz: '骨回転 Z（度）',
                    sx: '骨倍率 X',
                    sy: '骨倍率 Y',
                    sz: '骨倍率 Z',
                  } as Draft
                )[key]
              }
              <input
                inputMode="decimal"
                value={draft[key]}
                onChange={(e) => setDraft((value) => ({ ...value, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <p>
          対象・revisionが変わった後は現在値を読み直してください。rest調整は関係する全skinを再bindします。親変更は入力したlocal値を使います。
        </p>
        <button
          type="button"
          disabled={!joint || loaded !== identity}
          onClick={() => act(() => execute((p) => fitRigJoint(p, jointId, transform())))}
        >
          restを適用して再bind
        </button>
        <button
          type="button"
          disabled={!joint || loaded !== identity}
          onClick={() =>
            act(() => execute((p) => reparentRigJoint(p, jointId, parentId || null, transform())))
          }
        >
          親とlocal restを適用
        </button>
        <button
          type="button"
          disabled={!joint || loaded !== identity || !rigPoseTargetIds(project).has(jointId)}
          onClick={() =>
            act(() => {
              const token = session.rigPose.begin();
              const result = session.rigPose.preview(token, [
                { nodeId: jointId, transform: transform() },
              ]);
              if (!result.ok) throw new Error(result.reason);
              setNotice('poseは表示確認だけです。');
            })
          }
        >
          poseで変形を確認
        </button>
        <button type="button" onClick={() => session.rigPose.cancel('restに戻しました。')}>
          poseを解除してrestへ戻す
        </button>
        <button
          type="button"
          disabled={!joint}
          onClick={() =>
            act(() => {
              execute((p) => removeUnusedRigJoint(p, jointId));
              setJointId('');
            })
          }
        >
          未使用の骨を削除
        </button>
        <p>skin・clip・子を参照している骨は削除しません。</p>
        <NativeRigidAttachmentPanel
          project={project}
          session={session}
          disabled={disabled}
          onChange={onChange}
        />
        <label>
          重み対象の部品
          <select
            value={mesh ? object!.id : ''}
            onChange={(e) => {
              session.rigPose.cancel('重み対象を変更しました。');
              setSelection([e.target.value], e.target.value);
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
          対象mesh: {mesh?.id ?? 'なし'} / {skin ? `bind済み ${skin.id}` : '未bind'}
          。最大4影響。bindでは全頂点へ同じ明示値を割当し、その後1頂点ずつ修正できます。
        </p>
        <details>
          <summary>bindに含める骨を選ぶ</summary>
          <p>
            4影響の上限は1頂点ごとです。skin全体にはさらに多くの骨を含められます。未選択の場合、bindは影響欄の骨だけを含めます。
          </p>
          <div role="group" aria-label="skinに含める骨の候補">
            {joints.map((node) => (
              <label key={node.id}>
                <input
                  type="checkbox"
                  checked={bindJointIds.includes(node.id)}
                  onChange={(event) =>
                    setBindJointIds((ids) =>
                      event.target.checked ? [...ids, node.id] : ids.filter((id) => id !== node.id),
                    )
                  }
                />
                bind候補 {node.name} / {node.id}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={!skin || !bindJointIds.length}
            onClick={() => act(() => execute((p) => extendSkinJoints(p, skin!.id, bindJointIds)))}
          >
            候補の骨を現在skinに追加
          </button>
          {skin && (
            <p>
              現在skinに含まれる骨: {skin.joints.length}。weight変更前に必要な骨を追加してください。
            </p>
          )}
        </details>
        <div className="native-rig-influences">
          {influences.map((entry, i) => (
            <div key={i}>
              <label>
                影響 {i + 1} の骨
                <select
                  value={entry.joint}
                  onChange={(e) =>
                    setInfluences((entries) =>
                      entries.map((value, index) =>
                        index === i ? { ...value, joint: e.target.value } : value,
                      ),
                    )
                  }
                >
                  <option value="">未使用</option>
                  {joints.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.name} / {node.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                影響 {i + 1} の重み
                <input
                  inputMode="decimal"
                  value={entry.weight}
                  onChange={(e) =>
                    setInfluences((entries) =>
                      entries.map((value, index) =>
                        index === i ? { ...value, weight: e.target.value } : value,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={!mesh || !!skin}
          onClick={() =>
            act(() =>
              execute((p) => {
                const values = assignments(mesh!.vertices.map((vertex) => vertex.id));
                bindSkin(
                  p,
                  crypto.randomUUID(),
                  mesh!.id,
                  bindJointIds.length ? bindJointIds : (values[0]?.jointIds ?? []),
                  values,
                );
              }),
            )
          }
        >
          全頂点へ明示weightをbind
        </button>
        <label>
          編集する頂点
          <select
            value={mesh?.vertices.some((vertex) => vertex.id === vertexId) ? vertexId : ''}
            onChange={(e) => setVertexId(e.target.value)}
          >
            <option value="">選択してください</option>
            {mesh?.vertices.map((vertex, index) => (
              <option key={vertex.id} value={vertex.id}>
                {index + 1}: {vertex.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!skin || !vertexId}
          onClick={() => {
            const entry = skin?.weights.find((value) => value.vertexId === vertexId);
            if (entry)
              setInfluences(
                Array.from({ length: 4 }, (_, index) => ({
                  joint: entry.jointIds[index] ?? '',
                  weight: String(entry.values[index] ?? 0),
                })),
              );
          }}
        >
          頂点の現在weightを読む
        </button>
        <label>
          <input
            type="checkbox"
            checked={normalize}
            onChange={(e) => setNormalize(e.target.checked)}
          />
          このweight更新で正規化する
        </label>
        <button
          type="button"
          disabled={!skin || !vertexId}
          onClick={() =>
            act(() =>
              execute((p) => setSkinWeights(p, skin!.id, assignments([vertexId]), { normalize })),
            )
          }
        >
          選択頂点のweightを適用
        </button>
        <button
          type="button"
          disabled={!skin}
          onClick={() => act(() => execute((p) => rebindSkin(p, skin!.id)))}
        >
          現在のrestで明示再bind
        </button>
      </fieldset>
    </section>
  );
}
