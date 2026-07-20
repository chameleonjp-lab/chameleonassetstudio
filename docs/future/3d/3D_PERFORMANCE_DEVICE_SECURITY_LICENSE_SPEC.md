# 3D Performance / Device / Security / License Spec（性能・端末・安全性・利用条件）

状態: **draft / human review required**
最終更新日: 2026-07-19
調査基準commit: `7018984ba9e6867c6fab12fb313308218a35c22b`
外部情報の確認日: 2026-07-19（8 章の表に個別記載）
上位文書: `README.md`（本ディレクトリ）
関連文書: `3D_ARCHITECTURE_AND_BOUNDARIES.md`, `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md`, `3D_TEST_EVIDENCE_AND_RELEASE_SPEC.md`

> **この文書は 3D 実装開始の承認ではない。** 依存関係候補は「候補」であり、install は `3D-GATE-04`（人間承認）まで禁止。性能の数値はすべて「暫定予算」であり、実測（`3D-GATE-02` / `3D-GATE-05`）まで確定値ではない。

---

## 1. bundle と lazy load

方式は `3D_ARCHITECTURE_AND_BOUNDARIES.md` 6 章。予算は次のとおり。

| 項目 | 暫定予算 | 測定方法 |
|---|---|---|
| 2D のみ利用時の JS 合計（gzip） | 3D 導入前の実測値から **+2KB 以内**（Home 入口ボタン分のみ） | `vite build` 出力 + Playwright のネットワーク記録 |
| 3D route を開いた時の追加 JS（gzip） | 暫定 900KB 以下（描画ライブラリ込み。実測で確定） | 同上 |
| WASM decoder（Meshopt / Draco / KTX2） | 3D 初期 chunk に含めない。該当形式に遭遇した時のみ動的取得 | ネットワーク記録 |
| 3D route の初回表示（コード読み込み〜空画面表示） | 暫定 3 秒以内（中位端末・キャッシュ無し） | performance test（`3D_TEST_EVIDENCE_AND_RELEASE_SPEC.md`） |

- 3D 導入前の 2D 実測基準値は `3D-GATE-05` で計測し、`../PERFORMANCE_BUDGET.md` と同じ形式の baseline 報告として記録する。

## 2. 実行時性能（暫定予算と測定項目）

「軽い」「高速」という表現を使わず、次の測定項目で管理する。数値はすべて暫定。

| 項目 | 暫定予算（generic-web fixture 基準） | 備考 |
|---|---|---|
| GLB parse + 解析（25MB / 30 万三角形） | 5 秒以内（PC Chrome）/ 10 秒以内（iPhone Safari） | Worker 実行。進捗表示必須 |
| first render（解析完了〜初回描画） | 2 秒以内 | |
| viewer フレームレート | 30fps 以上（対象 fixture、対象端末） | 計測は E2E + 手動 |
| peak memory（読み込み時） | ファイルサイズの 6 倍以内を目安 | performance.memory は Chrome のみ。代替指標を 5 章 |
| dispose 後の残留 | Object URL 0 件、adapter 解放後に GPU リソース参照 0 | 6 章 |
| export ZIP 生成（第一段階） | 10 秒以内（25MB モデル） | |
| 最適化処理（第三段階） | 上限なし。ただし進捗更新 1 秒間隔以内・中断応答 2 秒以内 | |
| IndexedDB 使用量表示 | 2D + 3D 合算で常時表示。80% で警告（既存の警告レベルを流用） | |

## 3. 端末区分（device matrix）

| 区分 | 位置づけ | 第一段階の目標 |
|---|---|---|
| PC Chrome（最新） | 主開発対象 | 全機能 |
| iPad Safari（現行 iPadOS） | 主対象 | 全機能（ギズモはタッチ調整） |
| iPhone Safari（現行 iOS） | 対象 | 閲覧・検品・数値設定・書き出し（`3D_UI_UX_SPEC.md` 4.3） |
| PC Safari / Firefox | 確認対象 | 主要動線の手動確認 |
| 低性能端末（メモリ 4GB 級 Android 等） | 参考測定 | mobile プリセットの根拠採取 |
| WebGL 制限端末 | エラー表示対象 | 「この端末では 3D 表示を利用できません」+ 一覧・数値のみの閲覧は可能にする |

- WebGL2 を基準とし、WebGL1 フォールバックは初期対応しない（対応可否は viewer ライブラリの実測で確定。`3D-OPEN-09`）。
- **WebGPU は必須にしない**（既存決定の維持。使う場合も任意の高速化オプションのみ、第四段階以降の検討）。
- 実測対象の具体機種は `3D-GATE-05` で人間が確定する（手元の実機に依存するため計画では固定しない）。

## 4. 描画ライブラリ候補の比較（Gate 実測前の事前整理）

**確定は `3D-GATE-02` の実測後**。ここでは一次情報で確認できた事実と、実測すべき項目を分離して記録する。

| 比較項目 | Three.js | Babylon.js |
|---|---|---|
| ライセンス | MIT（公式 LICENSE、2026-07-19 確認） | Apache-2.0（公式 license.md、2026-07-19 確認） |
| GLB / glTF 読み込み | GLTFLoader（examples/jsm） | 組み込み loader |
| animation / skin / morph | 対応 | 対応 |
| Meshopt / Draco / KTX2 | 対応 loader あり（decoder は別配布） | 対応 |
| tree shaking / モジュール性 | ES Modules。addon は個別 import | v7 以降改善（実測で確認） |
| TypeScript | 型定義あり（@types/three） | 本体 TypeScript |
| React との接続 | 手書き adapter（react-three-fiber は不採用候補: 依存を増やすため） | 手書き adapter |
| コミュニティ・保守 | 活発（月次リリース） | 活発（Microsoft 支援） |
| 実測が必要な項目 | gzip 後 bundle 実測、Safari/iPad での GLB 表示、context loss 挙動、dispose 後のメモリ、screenshot 取得 | 同左 |

- 事前の推奨は **Three.js**（bundle を絞りやすい・採用事例・GLTFLoader の実績）。ただし断定せず、`3D-GATE-02` で両者の同一 fixture 実測（bundle・初回表示・fps・メモリ・context loss・dispose）を行い、評価記録を作って人間承認で確定する。
- その他候補（PlayCanvas 等）は要件（ライセンス・エディタ非依存・bundle）で初期比較から除外。理由は `3D_DECISION_LOG_AND_OPEN_ITEMS.md` に記録。

## 5. メモリ管理

- 計測: Chrome は `performance.memory`、Safari は取得不可のため「読み込み可能な最大 fixture サイズ」「クラッシュ再現の有無」を代替指標として手動記録する。
- 規則: ArrayBuffer は解析後に参照を切る。ImageBitmap / texture は `close()` / dispose を徹底。Object URL は生成箇所を 1 モジュールに集約し、生成数と解放数をカウントして E2E で assert（2D Phase 15.5 の Blob URL 安全化と同じ思想）。
- 大容量対策: 64MB 超は警告付き確認（`3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md` 3.1）。メモリ不足による失敗は「アプリ全体を巻き込まず、当該読み込みだけ失敗して隔離」を目標にする（完全な捕捉は不可能なため、再起動後の復旧経路も用意する。iOS のタブ破棄と同じ扱い）。
- iOS タブ破棄・端末終了: 自動保存済みデータ（IndexedDB）から再開できる。読み込み・編集の途中状態は失われてよいが、保存済み source / metadata は失われない。

## 6. GPU context loss と解放

- adapter 契約（`3D_ARCHITECTURE_AND_BOUNDARIES.md` 7 章）に `onContextLost` を含める。
- context loss 時: viewer 領域に「3D 表示が中断されました。再読み込み」を表示し、ボタンで再構築（モデルは IndexedDB から再ロード）。メタデータ編集中の内容は失わない（metadata は React state + IndexedDB にあり、GPU と無関係）。
- 画面遷移（editor3d を離れる / タブ切替）時は `dispose()` を必ず呼ぶ。E2E で「3D → Home → 2D editor」遷移後の残留（Object URL 数）を assert。

## 7. security（信頼できない入力への防御）

検証パイプラインの詳細は `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md` 3 章。ここでは方針のみ列挙する。

- MIME / 拡張子を信用しない。magic number と構造検証で判定。
- 外部 URI（http/https）は解決しない。data URI と bundle 内相対パスのみ。
- path traversal・zip bomb・過大 JSON・過大 node 数・破損 buffer への上限と拒否。
- decoder（WASM）は公式配布物のみを使い、バージョンと hash を記録して同梱（CDN 実行時取得はしない。オフライン動作と supply chain の両面）。
- 失敗の隔離: quarantine3d。隔離からの再試行は明示操作のみ。
- 3D モデル由来の文字列（node 名等）を UI に表示する際は、そのままテキストとして表示（HTML として解釈しない。React の既定で満たされるが、`dangerouslySetInnerHTML` の使用を禁止事項として明記）。

## 8. dependency（依存関係候補表）

**すべて候補**。install は `3D-GATE-04` の人間承認後。ライセンスは一次情報（公式リポジトリの LICENSE ファイル）を 2026-07-19 に確認した。バージョンは install 時点の最新安定版を評価し直す（本計画では固定しない）。

| 候補 | 用途 | 必須/任意 | 導入段階 | ライセンス（確認日） | WASM | Worker | bundle 影響 | 代替 | 削除方法 |
|---|---|---|---|---|---|---|---|---|---|
| three | 描画・GLB 読み込み | どちらか必須 | Stage1 | MIT（2026-07-19） | 無 | 主 thread | 大（3D chunk 内） | babylonjs | 3D chunk ごと削除可 |
| @babylonjs/core | 同上（代替） | どちらか必須 | Stage1 | Apache-2.0（2026-07-19） | 無 | 主 thread | 大 | three | 同上 |
| @gltf-transform/core, /functions, /extensions | glTF の読み書き・最適化 | 任意 | Stage3 | MIT（2026-07-19） | 無（拡張が decoder を使う） | 対応 | 中（optimize worker 内） | 自作最小処理 | worker ごと削除可 |
| meshoptimizer（js/wasm） | 圧縮 decode/encode、simplify | 任意 | Stage3 | MIT（2026-07-19） | 有 | 対応 | 中（遅延取得） | Draco のみ運用 | decoder 単位で削除可 |
| draco3d decoder | Draco 圧縮 GLB の decode | 任意 | Stage3 | Apache-2.0（2026-07-19。特許条項あり） | 有 | 対応 | 中（遅延取得） | 非対応と表示 | 同上 |
| Basis Universal / KTX2 transcoder | KTX2 texture の transcode | 任意 | Stage3 | Apache-2.0（basis_universal LICENSE、2026-07-19） | 有 | 対応 | 中（遅延取得） | 非対応と表示 | 同上 |

未確認（外部確認できなかった/今回確認しなかった項目。採用前 `3D-GATE-04` で必ず確認する）:

- 各候補の**現在の安定版バージョン番号**と、その版でのライセンス変更有無。
- KTX-Software（ktx.js 等を使う場合）のライセンスと同梱物の構成。
- gltfpack（CLI/WASM）を使う場合の同梱 encoder のライセンス構成。
- three.js の examples/jsm 配下（GLTFLoader / TransformControls 等）が本体 MIT に含まれること（含まれる認識だが、install 時に配布物単位で再確認する）。
- 各 WASM decoder の再配布時の NOTICE 要否の詳細。

## 9. sample assets / fixture のライセンス

- 方針: **fixture は原則自作する**（スクリプト生成の最小 GLB、自作モデル）。第三者モデルは、公式に再配布可能なライセンス（CC0 / 明示された sample ライセンス）を文書で確認できた物だけを、出所・ライセンス・確認日つきで採用する（`3D_TEST_EVIDENCE_AND_RELEASE_SPEC.md` 4 章の fixture 台帳）。
- Khronos glTF-Sample-Assets は有力候補だが、**モデルごとにライセンスが異なる**ため、採用するモデル単位で確認・記録する（一括採用しない）。確認は `3D-GATE-06`。
- 利用条件不明のモデルをリポジトリに入れない。大容量モデルもリポジトリに入れない（必要なら Git LFS か生成スクリプト）。

## 10. external generator（外部 3D 生成）との境界

第四段階の設計対象（`3D-STAGE4-01/02`）。原則のみここで固定する。

- Python / GPU / モデル重みをブラウザ本体・本リポジトリに入れない（既存決定の維持）。
- 手動持ち込み（利用者が外部ツールの出力ファイルを Import する）は常に可能で、追加実装を要しない。provenance に external-generator と記録できる。
- 自動接続（ローカル外部処理・外部 API）を作る場合: 送信は**利用者の明示承認を毎回とる**、送信内容と宛先を記録する、失敗時に元画像・元モデルを失わない、provider ごとの利用規約確認を採用条件にする。
- 生成モデル（TripoSR / Stable Fast 3D / SPAR3D / TRELLIS / Hunyuan3D 等、旧要件 7 章の候補）の重み・ライセンス確認は接続設計時に個別に行う。**今回の計画では全候補を「ライセンス・技術確認待ち」に分類**する（`3D_CURRENT_STATE_AND_IDEA_TRACEABILITY.md`）。

## 11. privacy

- 3D 機能は既存方針どおり完全ローカルで動作する（アカウント・クラウド送信なし）。
- 外部送信が発生するのは第四段階の外部 generator 連携を利用者が明示承認した場合のみ。その場合も送信記録をローカルに残す。
- 端末外へ出るデータは、利用者がダウンロードした ZIP / `.cas3dproj` のみ。

## 12. 未決定事項（この文書の範囲）

- `3D-DEC-LIB-01`: 描画ライブラリ確定（4 章）。
- `3D-GATE-05`: 端末 matrix の具体機種・性能基準値の確定。
- `3D-OPEN-09`: WebGL1 フォールバックの要否。
- `3D-OPEN-08`: 圧縮 GLB の読み込み対応を第二段階へ前倒しするか。
- 8 章「未確認」項目のすべて。
