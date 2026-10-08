import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Project3D } from '../../core3d/model/project';
import type { ProjectSession } from './projectSession';
import { reserveNativeTextureBytes } from '../../core3d/model/textureResources';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import { hashBlob } from '../../core3d/storage/repository';
import {
  assignBaseColorTexture,
  applyDerivedBaseColorTexture,
  removeBaseColorTexture,
  restoreOriginalBaseColorTexture,
} from '../../core3d/commands/textureEditing';
import './nativeTexturePanel.css';

type Props = {
  project: Project3D;
  session: ProjectSession;
  disabled: boolean;
  onChange: () => void;
};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Native image authoring is loaded on demand and never mounts the 2D editor. */
export function NativeTexturePanel({ project, session, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [materialId, setMaterialId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [gain, setGain] = useState(['1', '1', '1']);
  const [brightness, setBrightness] = useState('0');
  const [saturation, setSaturation] = useState('1');
  const [showUv, setShowUv] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const previewController = useRef<AbortController | null>(null);
  const composing = useRef(false);
  const [previewAllowed, setPreviewAllowed] = useState(!document.hidden);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const currentProject = useRef(project);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    let release: (() => void) | undefined;
    try {
      release = reserveNativeTextureBytes('UV preview canvas', 256 * 256 * 8);
      target.width = 256;
      target.height = 256;
    } catch (error) {
      setFailure(message(error));
    }
    return () => {
      target.width = 0;
      target.height = 0;
      release?.();
    };
  }, []);
  useLayoutEffect(() => {
    currentProject.current = project;
  });
  const material = project.materials.find((m) => m.id === materialId) ?? project.materials[0];
  const sources = project.sources.filter((s) => s.blobId === material?.textureBlobId);
  const source =
    sources.find((s) => s.id === sourceId) ?? (sources.length === 1 ? sources[0] : undefined);
  const uses = project.nodes.filter((n) =>
    project.meshes.find((m) => m.id === n.meshId)?.faces.some((f) => f.materialId === material?.id),
  );

  useEffect(() => {
    return () => controller.current?.abort();
  }, [session, project.id, material?.id]);
  useEffect(() => {
    if (disabled || !open) controller.current?.abort();
  }, [disabled, open]);
  useEffect(() => {
    let frozen = false,
      pageHidden = false;
    const update = () => {
      const allowed = !document.hidden && !frozen && !pageHidden;
      if (!allowed) {
        controller.current?.abort();
        previewController.current?.abort();
      }
      setPreviewAllowed(allowed);
    };
    const freeze = () => {
      frozen = true;
      update();
    };
    const resume = () => {
      frozen = false;
      update();
    };
    const hide = () => {
      pageHidden = true;
      update();
    };
    const show = () => {
      pageHidden = false;
      update();
    };
    document.addEventListener('visibilitychange', update);
    document.addEventListener('freeze', freeze);
    document.addEventListener('resume', resume);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    update();
    return () => {
      document.removeEventListener('visibilitychange', update);
      document.removeEventListener('freeze', freeze);
      document.removeEventListener('resume', resume);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, []);

  const displayedMaterialId = material?.id;
  const displayedTextureHash = material?.textureBlobId;
  useEffect(() => {
    const material = currentProject.current.materials.find(
      (item) => item.id === displayedMaterialId,
    );
    const target = canvas.current;
    if (!open || !target || !previewAllowed) return;
    const context = target.getContext('2d');
    if (!context) return;
    const abort = new AbortController();
    previewController.current = abort;
    context.clearRect(0, 0, target.width, target.height);
    const drawUv = () => {
      if (!showUv || !material) return;
      context.strokeStyle = '#ef2f62';
      context.lineWidth = 1;
      for (const mesh of currentProject.current.meshes)
        for (const face of mesh.faces) {
          if (face.materialId !== material.id || !face.uv) continue;
          context.beginPath();
          face.uv.forEach(([u, v], i) => {
            const x = u * target.width,
              y = (1 - v) * target.height;
            if (i) context.lineTo(x, y);
            else context.moveTo(x, y);
          });
          context.closePath();
          context.stroke();
        }
    };
    if (!material?.textureBlobId) {
      drawUv();
      return () => abort.abort();
    }
    void import('./nativeImage')
      .then(async (codec) => {
        abort.signal.throwIfAborted();
        const releaseInput = reserveNativeTextureBytes(
          'UV preview input',
          NATIVE_TEXTURE_PROFILE.maxFileBytes,
        );
        let release = () => {};
        try {
          const bytes = session.readBlob(material.textureBlobId!);
          const info = codec.inspectNativeImage(bytes);
          release = reserveNativeTextureBytes(
            'UV preview output',
            info.width * info.height * 4 + target.width * target.height * 8,
          );
          const image = await codec.decodeNativeImage(bytes, abort.signal);
          if (abort.signal.aborted) return;
          const display = new ImageData(target.width, target.height);
          for (let y = 0; y < target.height; y++)
            for (let x = 0; x < target.width; x++) {
              const source =
                (Math.min(image.height - 1, Math.floor((y * image.height) / target.height)) *
                  image.width +
                  Math.min(image.width - 1, Math.floor((x * image.width) / target.width))) *
                4;
              display.data.set(
                image.pixels.subarray(source, source + 4),
                (y * target.width + x) * 4,
              );
            }
          context.putImageData(display, 0, 0);
          drawUv();
        } finally {
          release();
          releaseInput();
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setFailure(`画像を確認できません。${message(error)}`);
      });
    return () => abort.abort();
  }, [
    open,
    displayedMaterialId,
    displayedTextureHash,
    project.id,
    project.revision,
    session,
    showUv,
    previewAllowed,
  ]);

  async function run(
    operation: (
      signal: AbortSignal,
      expected: ReturnType<ProjectSession['captureBinaryContext']>,
    ) => Promise<void>,
  ) {
    if (disabled || controller.current || !material) return;
    if (composing.current) {
      setFailure('日本語の変換を確定してから適用してください。');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setFailure('');
    setNotice('');
    session.edit.cancel('画像操作のため変形プレビューを取り消しました。');
    try {
      const expected = session.captureBinaryContext();
      await operation(abort.signal, expected);
      setNotice(
        '画像の編集を一回の操作として適用しました。元に戻す操作とバックアップを利用できます。',
      );
      onChange();
    } catch (error) {
      if (abort.signal.aborted)
        setNotice('画像操作を取り消しました。確定済みの内容を保持しています。');
      else setFailure(message(error));
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  function sync(operation: (candidate: Project3D) => void) {
    if (disabled || busy || !material) return;
    if (composing.current) {
      setFailure('日本語の変換を確定してから適用してください。');
      return;
    }
    setNotice('');
    setFailure('');
    try {
      session.executeAuthoring(operation, { id: project.id, revision: project.revision });
      onChange();
      setNotice('材質の画像参照を更新しました。元画像と来歴は保持しています。');
    } catch (error) {
      setFailure(message(error));
    }
  }
  const unavailable = disabled || busy || !material;
  return (
    <section
      className="native-textures"
      aria-label="画像とUVを編集"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing && !composing.current)
          controller.current?.abort();
      }}
    >
      <h3>材質の画像とUV</h3>
      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>画像とUVを開く</summary>
        <p>
          baseColor画像はsRGB、UVはセット0・変換なしです。UVの原点は左下です。画像は辺2,048pxまでの静止PNG/JPEGに対応します。回転情報を持つ画像は、向きを確定して保存し直してください。
        </p>
        <label>
          画像を編集する材質
          <select
            value={material?.id ?? ''}
            disabled={disabled || busy}
            onChange={(e) => {
              setMaterialId(e.target.value);
              setSourceId('');
              setFailure('');
            }}
          >
            {project.materials.map((m, i) => (
              <option key={m.id} value={m.id}>
                材質 {i + 1} · {m.id}
              </option>
            ))}
          </select>
        </label>
        {!material && <p>先に形と材質を作成してください。</p>}
        {material && (
          <p>
            この材質を共有する部品 {uses.length} 個:{' '}
            {uses.map((n) => n.name).join('、') || '未割当'}
            。画像の変更は共有する全ての面に反映します。個別に変更する場合は先に材質を複製してください。
          </p>
        )}
        <p>現在の画像: {material?.textureBlobId ?? '未設定'}</p>
        <canvas ref={canvas} width={256} height={256} aria-label="画像とUV0のプレビュー" />
        <label className="native-texture-checkbox">
          <input type="checkbox" checked={showUv} onChange={(e) => setShowUv(e.target.checked)} />
          UVの面境界を表示
        </label>
        <p>
          赤線は現在の面のUVです。枠外UVは端の色を延長して表示します。UVの再配置・別セット・texture
          transformにはまだ対応していません。
        </p>
        <fieldset disabled={unavailable}>
          <legend>画像を取り込み・差し替え</legend>
          <label>
            baseColor画像
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            画像の権利・出典
            <input
              value={rights}
              maxLength={2000}
              onChange={(e) => setRights(e.target.value)}
              placeholder="例: 自作 / 素材の利用条件と出典"
            />
          </label>
          <button
            type="button"
            disabled={!file || !rights.trim()}
            onClick={() =>
              void run(async (signal, expected) => {
                const codec = await import('./nativeImage');
                if (!file || file.size > NATIVE_TEXTURE_PROFILE.maxFileBytes)
                  throw new Error('画像ファイルが取込上限を超えています。');
                const releaseInput = reserveNativeTextureBytes('image import input', file.size * 2);
                let releaseOutput = () => {};
                try {
                  const bytes = new Uint8Array(await file.arrayBuffer());
                  const inspected = codec.inspectNativeImage(bytes);
                  releaseOutput = reserveNativeTextureBytes(
                    'image validation output',
                    inspected.width * inspected.height * 4,
                  );
                  await codec.decodeNativeImage(bytes, signal);
                  signal.throwIfAborted();
                  const hash = await hashBlob(bytes);
                  signal.throwIfAborted();
                  const nextSourceId = crypto.randomUUID();
                  await session.executeBinaryAuthoring(
                    (p) =>
                      assignBaseColorTexture(p, material!.id, {
                        id: nextSourceId,
                        blobId: hash,
                        mimeType: inspected.mimeType,
                        rights: { declared: rights.trim(), embedded: '' },
                      }),
                    new Map([[hash, bytes]]),
                    expected,
                    { signal },
                  );
                  setSourceId(nextSourceId);
                } finally {
                  releaseOutput();
                  releaseInput();
                }
              })
            }
          >
            画像を取り込み適用
          </button>
          <button
            type="button"
            disabled={!material?.textureBlobId}
            onClick={() => sync((p) => removeBaseColorTexture(p, material!.id))}
          >
            材質から画像を外す
          </button>
        </fieldset>
        <fieldset disabled={unavailable || !material?.textureBlobId}>
          <legend>元画像を保って色調を変更</legend>
          {material?.textureBlobId && sources.length === 0 && (
            <p>
              現在の画像には来歴の記録がないため色調派生はできません。権利・出典を確認して画像を取り込み直してください。
            </p>
          )}
          <label>
            来歴の対象画像
            <select value={source?.id ?? ''} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">来歴を選択</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.derivedFrom ? '派生' : '元画像'} · {s.id}
                </option>
              ))}
            </select>
          </label>
          {sources.length > 1 && !source && (
            <p>同じ画像bytesに複数の来歴があります。使用する来歴を選択してください。</p>
          )}
          {source && (
            <p>
              権利・出典: {source.rights.declared || '未申告'}
              {source.rights.embedded && ` / ${source.rights.embedded}`}
            </p>
          )}
          <div className="native-texture-gains">
            {['赤', '緑', '青'].map((label, i) => (
              <label key={label}>
                {label}の倍率
                <input
                  type="number"
                  min="0"
                  max="4"
                  step="any"
                  value={gain[i]}
                  onChange={(e) => setGain(gain.map((v, j) => (j === i ? e.target.value : v)))}
                />
              </label>
            ))}
          </div>
          <label>
            明るさ（線形値）
            <input
              type="number"
              min="-1"
              max="1"
              step="any"
              value={brightness}
              onChange={(e) => setBrightness(e.target.value)}
            />
          </label>
          <label>
            彩度
            <input
              type="number"
              min="0"
              max="2"
              step="any"
              value={saturation}
              onChange={(e) => setSaturation(e.target.value)}
            />
          </label>
          <p>
            倍率1・明るさ0・彩度1が元の色です。透過率とUVは変更しません。元画像と派生PNGは両方バックアップへ含みます。
          </p>
          <button
            type="button"
            disabled={!source}
            onClick={() =>
              void run(async (signal, expected) => {
                if ([...gain, brightness, saturation].some((v) => !v.trim()))
                  throw new Error('色調の数値を全て入力してください。');
                const settings = {
                  gain: gain.map(Number) as [number, number, number],
                  brightness: Number(brightness),
                  saturation: Number(saturation),
                };
                if (
                  settings.gain.every((v) => v === 1) &&
                  settings.brightness === 0 &&
                  settings.saturation === 1
                )
                  throw new Error('色調を変更してから適用してください。');
                const codec = await import('./nativeImage');
                const releaseInput = reserveNativeTextureBytes(
                  'derived image result and source copy',
                  NATIVE_TEXTURE_PROFILE.maxFileBytes * 2,
                );
                const releaseOutput = () => {};
                try {
                  const bytes = await codec.deriveNativeImage(
                    session.readBlob(material!.textureBlobId!),
                    settings,
                    signal,
                  );
                  const hash = await hashBlob(bytes);
                  signal.throwIfAborted();
                  const nextSourceId = crypto.randomUUID();
                  await session.executeBinaryAuthoring(
                    (p) =>
                      applyDerivedBaseColorTexture(p, material!.id, source!.id, {
                        id: nextSourceId,
                        blobId: hash,
                        operation: 'baseColor-linear-adjustment',
                        version: '1',
                        settings: JSON.stringify(settings),
                      }),
                    new Map([[hash, bytes]]),
                    expected,
                    { signal },
                  );
                  setSourceId(nextSourceId);
                } finally {
                  releaseOutput();
                  releaseInput();
                }
              })
            }
          >
            色調を派生画像として適用
          </button>
          <button
            type="button"
            disabled={!source?.derivedFrom}
            onClick={() =>
              sync((p) => restoreOriginalBaseColorTexture(p, material!.id, source!.id))
            }
          >
            元画像へ戻す
          </button>
        </fieldset>
        {busy && (
          <button type="button" onClick={() => controller.current?.abort()}>
            画像操作を取り消す
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
        {failure && <p role="alert">{failure}</p>}
      </details>
    </section>
  );
}
