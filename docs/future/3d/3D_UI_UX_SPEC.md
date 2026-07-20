# 3D UI / UX Spec（画面と操作の仕様）

状態: **draft / human review required**
最終更新日: 2026-07-19
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`
上位文書: `README.md`（本ディレクトリ）
関連文書: `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md`, `3D_PERFORMANCE_DEVICE_SECURITY_LICENSE_SPEC.md`

> **この文書は 3D 実装開始の承認ではない。** 画面は段階ごとに増える。各画面がどの段階で入るかは 2 章の表を正とする。

---

## 1. 情報設計の原則

1. **3D Canvas だけに情報を依存させない。** モデルの状態、選択中の node、bounds、警告、anchor、collider は、必ず一覧・数値・文章でも確認できるようにする。視覚的に 3D 表示を確認できない利用者も、すべての作業（読み込み→検品→設定→書き出し）を完了できる。
2. 2D Studio と同じ見た目・言葉遣い・パネル規則を使う（ADR-2026-07-07-004）。
3. 破壊的に見える操作（設定の適用、派生の生成）には必ず before/after の数値を示し、Undo できる。
4. 待たせる処理（読み込み・解析・最適化・書き出し）は進捗・キャンセル・失敗理由を必ず持つ。
5. すべての状態（成功・警告・失敗）を色だけで区別しない。アイコン + 文言を併用する。

---

## 2. 画面一覧と導入段階

| 画面 | 段階 | 目的 |
|---|---|---|
| Home / Project Dashboard（既存拡張） | 1 | 2D / 3D プロジェクトの一覧・作成・読み込み |
| 3D Project 作成 | 1 | 名前を付けて空の 3D プロジェクトを作る |
| Import | 1 | GLB の取り込み（第二段階で glTF bundle） |
| Inspect | 1 | 統計・bounds・警告の確認（第二段階で詳細化） |
| Setup | 1 | unit / axis / origin / feet / scale の確認・設定 |
| Game Data | 1 | anchor / collider の編集 |
| Export | 1 | ZIP / `.cas3dproj` の書き出し |
| Scene | 2 | scene graph（node / mesh / material / texture 一覧）と表示切替 |
| Materials | 2 | material / texture の検査ビュー（読み取り中心） |
| Animation | 2 | クリップ一覧・再生・停止・ループ・速度 |
| Optimize | 3 | 最適化の選択・実行・派生管理 |
| Compare | 3 | 最適化前後の比較 |
| Project Settings | 2 | プリセット選択、license / provenance の記録編集 |

- 第一段階の 5 画面（Import / Inspect / Setup / Game Data / Export)は旧 3D 要件 10 章の 5 画面構成を踏襲する。
- 画面はすべて `editor3d` route 内のタブとして実装する（`3D_ARCHITECTURE_AND_BOUNDARIES.md` 5 章）。

---

## 3. 画面ごとの定義

各画面を「目的 / 表示 / 操作 / 状態（空・読み込み中・成功・警告・失敗）/ 取り消し / 端末別配置」で定義する。ここに書く UI 詳細は候補であり、実装 PR で画面ごとに確定する。

### 3.1 Home / Project Dashboard（既存拡張）

- 目的: 2D と 3D の入口を 1 つにする。
- 表示: プロジェクト一覧に種別バッジ（2D / 3D）。保存容量表示は 2D + 3D 合算。
- 操作: 「3D プロジェクトを作る」「.cas3dproj を読み込む」を既存ボタン群に追加。
- 空状態: 既存の空状態文言に 3D の一文を追加。
- 失敗: `.cas3dproj` 読み込み失敗は理由 + quarantine 案内（2D と同じ画面パターン）。
- 端末: 既存レイアウトを維持（変更は最小限。2D 接点ファイルのため）。

### 3.2 Import

- 目的: モデルファイルを安全に取り込み、アセットとして登録する。
- 表示: 受付条件（GLB のみ / サイズ上限）、選択済みファイル名とサイズ、検証の進捗、検証結果（合格 / 理由付き不合格）。
- 操作: ファイル選択（`<input type="file">`）、D&D（PC のみ補助）、取り込み中断、隔離一覧の確認・削除。
- 読み込み中: 進捗バー + 「解析中（n%）」+ キャンセル。UI は固めない（Worker 実行）。
- 失敗: 理由の日本語文 + 「このファイルは隔離に保存されました」。連続失敗してもアプリ状態は壊れない。
- 取り消し: 取り込み完了直後に「取り込みを取り消す」（アセット削除。Undo 履歴に載せる）。

### 3.3 Inspect

- 目的: モデルの重さと問題点を、3D 表示と一覧の両方で確認する。
- 表示: viewer（カメラ操作可能）+ stats 表（ファイルサイズ / 頂点 / 三角形 / mesh / material / texture / 最大 texture / animation / skin / morph / bounds）+ 警告一覧（checkId・重要度・対象・実測値・推奨値・理由・ゲームでの影響・修正方法。`3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md` 4 章）。
- 操作: プリセット切替（mobile / generic-web / desktop）、再検査、警告の詳細展開、警告一覧のコピー。
- viewer 補助表示: bounds box、ground、axis、wireframe（第二段階）。すべてトグルで、状態は一時状態（保存しない）。
- 空状態: 「まだモデルがありません。Import から取り込んでください」＋ Import への移動ボタン。
- 警告状態: 警告件数をタブバッジに表示（色 + 数字）。

### 3.4 Setup

- 目的: 原点・足元・向き・大きさを、ゲームへ持ち込める状態に整える。
- 表示: viewer（ground + axis + origin マーカー）+ 設定フォーム（unit / unitScale / upAxis / forwardAxis / originMode / originOffset / rotationOffset）+ 適用結果の数値（例: 「表示上の高さ: 1.8m」）。
- 操作: 各設定の選択・数値入力、「足元を bounds 底面中心に設定」ボタン（提案 → 確認 → 適用）、リセット（取り込み時の既定へ）。
- 取り消し: すべて Undo / Redo 経路に載せる（metadata 変更のみなので安全に戻せる）。
- 警告: unknown のままの項目は「未確認」バッジを出し、Export 画面でも再掲する。

### 3.5 Game Data

- 目的: anchor と collider を付ける。
- 表示: viewer（anchor マーカー / collider の半透明表示。purpose 別色 + 形状ラベル）+ anchor 一覧表 + collider 一覧表（各行: 名前 / role・purpose / 座標数値）。
- 操作: 追加（既定値で作成 → 数値・ギズモで調整）、複製、削除、表示/非表示、数値入力（x/y/z を直接入力）、viewer 内ドラッグ（PC）・ハンドル操作（タッチ）。
- 取り消し: すべて Undo / Redo。
- 空状態: 「アンカーがありません。『追加』で作成します」の説明と役割の説明文。

### 3.6 Export

- 目的: ZIP / `.cas3dproj` を書き出す。
- 表示: 書き出し内容の一覧（ファイルと概算サイズ）、settings / license の未確認項目の再掲、進捗。
- 操作: 「3D アセット ZIP をダウンロード」「.cas3dproj をダウンロード」、（第二段階以降）焼き込みオプション、import notes の対象選択。
- 失敗: 理由を `role="alert"` で表示（2D ExportPanel と同じ規則）。書き出し中は全ボタン disabled。

### 3.7 Scene / Materials / Animation（第二段階）

- Scene: node ツリー（ツリービュー + 検索）、選択と viewer ハイライトの相互連動、表示/非表示、mesh / primitive / material / texture の一覧タブ。ツリーはキーボード（矢印 / Enter）で操作可能。
- Materials: material 一覧（名前 / 種類 / texture 割り当て / alphaMode / doubleSided / 色空間の検査結果）。編集は第二段階では行わない（読み取りと検査のみ。簡易調整は `3D-OPEN-14`）。
- Animation: クリップ一覧（名前 / 長さ / channel 数）、再生 / 停止 / ループ / 速度（0.25〜2x）、再生位置スライダー。motion reduction 有効時は自動再生しない（7 章）。

### 3.8 Optimize / Compare（第三段階）

- Optimize: 操作カタログ（prune / dedup / 圧縮 / resize 等。各操作に「見た目が変わる可能性」ラベル）、実行キュー、進捗・中断、派生一覧（label / サイズ / 作成日時 / recipe）。
- Compare: before/after の並列 viewer（同一カメラ同期）、サイズ・三角形数・texture 合計の差分表、animation / anchor / collider 保持チェックの結果、「派生を書き出し対象にする」選択。
- 原則: 見た目やアニメーションを壊す可能性のある処理を自動適用しない。必ず preview → 利用者承認。

---

## 4. 端末別レイアウト

### 4.1 PC（主対象）

- 3 ペイン: 左 = タブ・一覧、中央 = viewer、右 = プロパティ / 警告詳細。
- viewer 操作: 左ドラッグ = 軌道回転（orbit）、ホイール = ズーム、中ドラッグまたは Shift+ドラッグ = パン。ダブルクリック = 対象へフォーカス。

### 4.2 iPad

- 2 ペイン + 下部タブ。viewer を広く取り、プロパティはスライドオーバー。
- タッチ: 1 本指ドラッグ = 回転、ピンチ = ズーム、2 本指ドラッグ = パン。ギズモはハンドルを大きく（44px 以上）。

### 4.3 iPhone

- 1 ペイン + 下部ナビ（2D の MobileView 方式を踏襲: viewer / 一覧 / プロパティ / 書き出し の切替）。
- viewer と数値入力を同時に出せないため、「選択 → プロパティ画面で数値編集」の往復を最短にする（選択状態を維持）。
- iOS の入力ズーム防止・タップ 44px は 2D の実装規則を踏襲。
- 第一段階の iPhone 目標: 「閲覧・検品・数値による設定・書き出し」ができること。ギズモの精密操作は iPad / PC を推奨し、その旨を明記する。

---

## 5. キーボード操作（PC）

| キー | 動作 |
|---|---|
| 矢印 | 選択 anchor / collider の移動（modifier で刻み変更: Shift=10x, Alt=0.1x） |
| Tab / 一覧 | すべての操作要素へフォーカス移動可能（フォーカス可視） |
| R / F | viewer: 選択へフォーカス / 全体表示 |
| Ctrl+Z / Ctrl+Shift+Z | Undo / Redo |
| Esc | 選択解除・モーダル閉じ |

- viewer にフォーカスがある時のカメラ移動（矢印 = 軌道、+/- = ズーム）を提供し、マウス無しでも視点変更できるようにする。

---

## 6. アクセシビリティ

- **代替情報**: viewer の内容はライブリージョンではなく、常設の一覧・数値で提供する（1 章の原則）。選択変更時は `aria-live="polite"` で「〇〇を選択しました」を通知。
- **スクリーンリーダー**: canvas 要素に `role="img"` + 要約 `aria-label`（例: 「3D プレビュー: slime_green、三角形 12,400、警告 2 件」）。詳細は隣接の一覧で読める。
- **色以外の状態表示**: 重要度はアイコン + 文言（エラー / 警告 / 情報）。collider の purpose は色 + ラベル文字。
- **motion reduction**: `prefers-reduced-motion` を尊重し、自動回転（turntable）・アニメーション自動再生・カメラの滑らか補間を無効化する。
- **タップ対象**: 44px 以上（2D の規則を踏襲）。
- **誤操作防止**: 削除は確認、破壊的でない操作は Undo で戻せることを明示。ギズモドラッグ中の誤タップはドラッグ優先。

---

## 7. 状態表示の共通規則

| 状態 | 表示 |
|---|---|
| 空 | 目的と次の操作を 1〜2 文で説明 + 主要ボタン |
| 読み込み中 | 進捗（% か段階名）+ キャンセル。3 秒超は残り目安 |
| 成功 | 控えめな完了表示（保存状態は 2D と同じ「保存済み」表示） |
| 警告 | 件数バッジ + 一覧への導線。作業は続行可能 |
| 失敗 | 理由 + 復旧手段（再試行 / 隔離確認 / `.cas3dproj` 再読込）。`role="alert"` |
| 保存状態 | AutosaveQueue の SaveState（idle/saving/saved/error）をヘッダーに常設 |

---

## 8. Undo / Redo と保存

- metadata 編集（settings / anchors / colliders / 名前 / タグ / license / provenance）はすべて既存 `History` クラスの経路に載せる。
- source 取り込み・派生生成は History に「取り込みを取り消す」「派生を削除」として載せる（バイト列の複製は持たず、参照の付け外しで実装）。
- 自動保存は `AutosaveQueue` を 3D store 向けタスクで再利用。カメラ・選択・タブなどの一時状態は保存しない。

---

## 9. 未決定事項（この文書の範囲）

- `3D-OPEN-14`: Materials 画面での簡易編集（factor 調整・texture 差し替え）を第二段階に含めるか（既定: 含めない。読み取りと検査のみ）。
- `3D-OPEN-12`: カメラ初期位置の保存（既定: 保存しない）。
- ギズモ実装をライブラリ付属（TransformControls 等）にするか自作にするか（`3D-GATE-02` の評価項目に含める）。
