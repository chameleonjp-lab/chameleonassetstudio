# Chameleon Asset Studio 書き出し形式書

最終更新日: 2026-07-02  
対象バージョン: 0.1.0  
上位文書: `docs/REQUIREMENTS_SPECIFICATION.md`

---

## 1. 目的

この文書は、Chameleon Asset Studio が書き出すファイル形式を定義する（要件 11.9）。

書き出しの実装は `src/core/export/` に置く。

- `atlas.ts` … Sprite Sheet のグリッド配置と Atlas JSON の組み立て（純関数、ブラウザ API に依存しない）
- `exportAsset.ts` … PNG / WebP / asset.json / Sprite Sheet / ZIP の書き出しと Blob URL ダウンロード（ブラウザ専用）

書き出し前には必ず `validateAsset` による schema 検証を行い、不正なデータは `ExportError` としてどの項目が不正かを含めて投げる。UI（`src/features/editor/ExportPanel.tsx`）は、書き出し中は全ボタンを disabled にし、失敗時は理由を画面に表示する。

---

## 2. 単体書き出し

| 種類       | 生成関数          | ファイル名例               | 内容                                              |
| ---------- | ----------------- | --------------------------- | ------------------------------------------------- |
| PNG        | `exportImage`     | `{asset.name}.png`          | 現在の表示状態（全レイヤーを合成した画像）        |
| WebP       | `exportImage`     | `{asset.name}.webp`         | 同上の WebP 版（非対応環境では書き出しを中止する） |
| asset.json | `exportAssetJson` | `{asset.name}.asset.json`   | アセットデータをそのまま整形した JSON             |
| ZIP        | `exportZip`       | `{asset.name}-export.zip`   | 下記「3. ZIP 構成」一式                           |

いずれも `downloadBlob(blob, filename)` が Blob URL によるダウンロードを開始する。保存先を直接選ぶ機能は対応ブラウザだけの追加機能とし、基本はこの Blob URL 方式で実装する（スマホでも動作する）。

---

## 3. ZIP 構成

```txt
{asset.name}-export.zip
├─ asset.json           … Asset（そのまま整形した JSON。書き出し前に schema 検証済み）
├─ textures/
│  ├─ main.png            … 現在の表示状態を合成した画像
│  └─ main.webp            … 同上の WebP 版（書き出し環境が対応している場合のみ）
├─ atlas/
│  ├─ spritesheet.png       … フレームを並べた Sprite Sheet（フレーム未使用なら 1 コマ）
│  └─ atlas.json             … 下記「4. atlas.json」
└─ README.md                 … アセット名、内容、座標系、原点・アンカー・当たり判定の説明
```

`examples/`（Canvas 2D / PixiJS / Phaser のサンプル HTML）は Phase 11 で追加する。

---

## 4. atlas.json

| フィールド | 型                                      | 説明                                                                         |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| format     | `"chameleon-atlas"`                      | 文書種別                                                                      |
| version    | `"0.1.0"`                                | 形式バージョン                                                                |
| texture    | string                                   | 対応する Sprite Sheet 画像のファイル名（`spritesheet.png`）                  |
| cellSize   | `{ width, height }`                      | 1 コマのピクセルサイズ（= `Asset.canvasSize`）                               |
| frames     | `Array<{ name, x, y, width, height }>`   | Sprite Sheet 内の各コマの位置。フレーム未使用時は `default` の 1 件になる    |
| animations | `Array<{ name, fps, loop, frames }>`     | `frames` は `Frame.name` の配列（`Animation.frameIds` を名前解決したもの）   |
| origin     | `{ x, y }`                               | `Asset.origin` と同じ                                                        |
| anchors    | `Array<{ name, role, x, y }>`            | `Asset.anchors` を平坦化したもの                                             |
| colliders  | `Collider[]`                             | `Asset.colliders` をそのまま含める                                           |

Sprite Sheet のセル配置は `computeSheetLayout`（`src/core/export/atlas.ts`）が計算する。フレーム数を n としたとき、列数は `ceil(sqrt(n))`、行数は `ceil(n / 列数)` とし、左上から行優先で並べる。

---

## 5. 座標系

キャンバス左上を原点 (0, 0) とし、右方向を x+、下方向を y+ とする。単位はピクセル、回転の単位は度。書き出す画像・Atlas JSON・asset.json はすべてこの座標系で統一する（`docs/DATA_FORMAT.md` 6.2 と同一の解釈）。

---

## 6. WebP 非対応環境の挙動

`exportImage(asset, 'image/webp')` は、実行環境が WebP エンコードに対応していない場合、`ExportError('この環境では WebP 書き出しに対応していません。')` を投げる。

`exportZip` はこの場合に限り WebP 書き出しを黙ってスキップし、`textures/main.webp` を含めない ZIP を生成する。単体 WebP ダウンロードボタンから実行した場合は、この理由がそのまま画面にエラー表示される。

---

## 7. 書き出し失敗時の表示

`ExportPanel`（`src/features/editor/ExportPanel.tsx`）は、書き出し中は全ボタンを disabled にして「書き出し中…」を表示する。失敗時は `書き出しに失敗しました: {理由}` を `role="alert"` で表示する。`{理由}` には schema 検証エラーの内容がそのまま入る。
