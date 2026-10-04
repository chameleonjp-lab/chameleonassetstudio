import { useId, useRef, useState } from 'react';
import type { Project3D, Vec3 } from '../../core3d/model/project';
import type { NativeEditBinding } from '../../core3d/ports/editPort';
import { useNativeObjectSelection } from './useNativeEditState';
import type {
  NativeCameraState,
  NativeViewOptions,
  NativeViewportPort,
  NativeViewportResult,
} from '../../core3d/ports/renderPort';

type CameraDraft = {
  [K in 'px' | 'py' | 'pz' | 'tx' | 'ty' | 'tz' | 'ux' | 'uy' | 'uz' | 'fov' | 'span']: string;
} & {
  projection: NativeCameraState['projection'];
};
const initialDraft: CameraDraft = {
  px: '',
  py: '',
  pz: '',
  tx: '',
  ty: '',
  tz: '',
  ux: '',
  uy: '',
  uz: '',
  fov: '',
  span: '',
  projection: 'perspective',
};
const defaultOptions: NativeViewOptions = {
  shading: 'material',
  background: 'dark',
  lighting: 'studio',
  grid: false,
  axes: false,
  bounds: false,
};
function requireSuccess(result: NativeViewportResult) {
  if (!result.ok) throw new Error(result.reason);
}
function toDraft(camera: NativeCameraState): CameraDraft {
  return {
    px: String(camera.position[0]),
    py: String(camera.position[1]),
    pz: String(camera.position[2]),
    tx: String(camera.target[0]),
    ty: String(camera.target[1]),
    tz: String(camera.target[2]),
    fov: String(camera.fov),
    span: String(camera.span),
    projection: camera.projection,
    ux: String(camera.up?.[0] ?? 0),
    uy: String(camera.up?.[1] ?? 1),
    uz: String(camera.up?.[2] ?? 0),
  };
}

/** Inspection is transient: these controls never dispatch project/history commands. */
export function NativeInspectionControls({
  project,
  disabled,
  run,
  edit,
}: {
  project: Project3D;
  disabled: boolean;
  run: (operation: (port: NativeViewportPort) => void) => void;
  /** Product panels share the session binding; omitted only by standalone fixtures. */
  edit?: NativeEditBinding;
}) {
  const { activeId: selected, selectedIds, setActive } = useNativeObjectSelection(project, edit);
  const selectionDescriptionId = useId();
  const [draft, setDraft] = useState<CameraDraft>(initialDraft);
  const [options, setOptions] = useState(defaultOptions);
  const [error, setError] = useState('');
  const composing = useRef(false);
  const selectedNode = project.nodes.find((node) => node.id === selected);
  function operate(operation: (port: NativeViewportPort) => void) {
    if (disabled || composing.current) return;
    setError('');
    run((port) => {
      try {
        operation(port);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    });
  }
  function readCamera() {
    operate((port) => setDraft(toDraft(port.getCamera())));
  }
  function applyCamera() {
    operate((port) => {
      const numeric = [
        'px',
        'py',
        'pz',
        'tx',
        'ty',
        'tz',
        'ux',
        'uy',
        'uz',
        'fov',
        'span',
      ] as const;
      if (numeric.some((key) => draft[key].trim() === '' || !Number.isFinite(Number(draft[key]))))
        throw new Error('カメラの各欄に有限の数値を入力してください。空欄は適用できません。');
      if (Number(draft.fov) <= 0 || Number(draft.fov) >= 180 || Number(draft.span) <= 0)
        throw new Error(
          '透視画角は0度より大きく180度未満、平行投影の高さは0mより大きくしてください。',
        );
      if (
        Number(draft.px) === Number(draft.tx) &&
        Number(draft.py) === Number(draft.ty) &&
        Number(draft.pz) === Number(draft.tz)
      )
        throw new Error('カメラ位置と注視点を別の位置にしてください。');
      requireSuccess(
        port.setCamera({
          position: [Number(draft.px), Number(draft.py), Number(draft.pz)] as Vec3,
          target: [Number(draft.tx), Number(draft.ty), Number(draft.tz)] as Vec3,
          projection: draft.projection,
          up: [Number(draft.ux), Number(draft.uy), Number(draft.uz)],
          fov: Number(draft.fov),
          span: Number(draft.span),
        }),
      );
      setDraft(toDraft(port.getCamera()));
    });
  }
  function changeOptions(patch: Partial<NativeViewOptions>) {
    operate((port) => {
      const next = { ...port.getViewOptions(), ...patch };
      requireSuccess(port.setViewOptions(next));
      setOptions(port.getViewOptions());
    });
  }
  return (
    <details
      className="native-inspection"
      onToggle={(event) => {
        if (event.currentTarget.open)
          operate((port) => {
            setDraft(toDraft(port.getCamera()));
            setOptions(port.getViewOptions());
          });
      }}
    >
      <summary>カメラ・表示の詳細設定</summary>
      <p>
        制作・組立と同じ選択を使います。「選択対象に合わせる」でアクティブな部品へカメラを移します。
        カメラ・表示設定は作品やUndo履歴を変更しません。再読込では初期表示に戻ります。
      </p>
      <fieldset disabled={disabled}>
        <legend>見る方向と対象</legend>
        <div className="native-inspection-buttons">
          {(
            [
              ['front', '正面'],
              ['right', '右側面'],
              ['top', '上面'],
            ] as const
          ).map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              onClick={() =>
                operate((port) => {
                  requireSuccess(port.cameraPreset(preset));
                  setDraft(toDraft(port.getCamera()));
                })
              }
            >
              {label}から見る
            </button>
          ))}
        </div>
        <label>
          注目するオブジェクト
          <select
            aria-describedby={selectionDescriptionId}
            value={selectedNode ? selected! : ''}
            onChange={(event) => setActive(event.target.value)}
          >
            <option value="">対象を選択</option>
            {project.nodes.map((node, index) => (
              <option key={node.id} value={node.id}>
                {index + 1}. {Array.from(node.name).slice(0, 8).join('')}
                {Array.from(node.name).length > 8 ? '…' : ''}
              </option>
            ))}
          </select>
        </label>
        <p id={selectionDescriptionId}>
          選択中 {selectedIds.length} 個。アクティブな対象:{' '}
          {selectedNode ? `${selectedNode.name} / ID: ${selectedNode.id}` : 'なし'}
        </p>
        <button
          type="button"
          disabled={!selectedNode}
          onClick={() =>
            operate((port) => {
              const active = edit ? edit.state.context.activeId : selected;
              if (!active || active !== selected)
                throw new Error('注目する対象が変わりました。現在の対象を確認してください。');
              requireSuccess(port.focusNode(active));
              setDraft(toDraft(port.getCamera()));
            })
          }
        >
          選択対象に合わせる
        </button>
      </fieldset>
      <fieldset
        disabled={disabled}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
      >
        <legend>数値カメラ</legend>
        <p>
          入力欄は下書きです。ドラッグ後は現在値を読み取り、変更後に適用してください。位置・高さはm、画角は度です。画面上方向は方向ベクトルで、ゼロや見る方向と平行にはできません。迷った時は方向ボタンかカメラリセットを使ってください。極端な画角で全体を表示できない場合、リセットは45度の画角で復旧します。
        </p>
        <button type="button" onClick={readCamera}>
          現在のカメラを読み取る
        </button>
        <label>
          投影方式
          <select
            value={draft.projection}
            onChange={(event) =>
              setDraft({ ...draft, projection: event.target.value as CameraDraft['projection'] })
            }
          >
            <option value="perspective">透視投影</option>
            <option value="orthographic">平行投影</option>
          </select>
        </label>
        <div className="native-inspection-numbers">
          {(
            [
              ['px', 'カメラ位置 X'],
              ['py', 'カメラ位置 Y'],
              ['pz', 'カメラ位置 Z'],
              ['tx', '注視点 X'],
              ['ty', '注視点 Y'],
              ['tz', '注視点 Z'],
              ['ux', '画面上方向 X'],
              ['uy', '画面上方向 Y'],
              ['uz', '画面上方向 Z'],
              ['fov', '透視画角'],
              ['span', '平行投影の高さ'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="text"
                inputMode="decimal"
                value={draft[key]}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <button type="button" onClick={applyCamera}>
          数値カメラを適用
        </button>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend>観察用の表示</legend>
        <label>
          描画モード
          <select
            value={options.shading}
            onChange={(event) =>
              changeOptions({ shading: event.target.value as NativeViewOptions['shading'] })
            }
          >
            <option value="material">材質</option>
            <option value="solid">単色</option>
            <option value="wireframe">ワイヤーフレーム</option>
          </select>
        </label>
        <label>
          背景
          <select
            value={options.background}
            onChange={(event) =>
              changeOptions({ background: event.target.value as NativeViewOptions['background'] })
            }
          >
            <option value="dark">暗い背景</option>
            <option value="light">明るい背景</option>
          </select>
        </label>
        <label>
          照明
          <select
            value={options.lighting}
            onChange={(event) =>
              changeOptions({ lighting: event.target.value as NativeViewOptions['lighting'] })
            }
          >
            <option value="studio">スタジオ</option>
            <option value="soft">柔らかい照明</option>
          </select>
        </label>
        {(
          [
            ['grid', 'グリッド'],
            ['axes', '座標軸'],
            ['bounds', '全体の境界'],
          ] as const
        ).map(([key, label]) => (
          <label className="native-inspection-check" key={key}>
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(event) => changeOptions({ [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
        <p>
          ワイヤーフレームの線は見やすさを保つため照明の影響を受けません。PNGには選んだ背景・描画モードと、表示中の補助線が含まれます。材質・単色表示には照明も反映します。補助線なしの画像は上の3項目をすべてオフにして保存してください。編集データには補助線を追加しません。
        </p>
      </fieldset>
      {error && <p role="alert">表示設定を適用できませんでした。{error}</p>}
    </details>
  );
}
