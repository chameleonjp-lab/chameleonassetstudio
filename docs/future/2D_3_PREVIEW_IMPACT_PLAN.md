# Chameleon Asset Studio Group 14 one-sheet

最終更新日: 2026-08-10
対象リポジトリ: chameleonjp-lab/chameleonassetstudio
対象work package: Group 14 / 2D-3-PREVIEW + 2D-3-IMPACT
基準main SHA: 217c695f22ee494f0ee2166f44d496de09fa3e8e
文書状態: accepted contract / work package completed（G14-P1 + G14-I1 + G14-U1。Group 14限定）

## 0. この文書の扱い

この文書は、Group 13完了後に開始したGroup 14の製品実装前契約と完了証拠を、1枚で記録するためのone-sheetである。§§2〜13は採用した契約と当時の監査履歴として保持し、PR #225以後の時系列と完了証拠は§14を正本とする。

2026-08-09、ユーザーは「G14-P1 + G14-I1 + G14-U1で承認」と明示した。運用仕様に従い、このone-sheetでは3点の詳細をaccepted契約として記録し、Group 14限定で適用する。

Group 13で使ったP1（polygonをunsupportedにする判断）と、この文書のP1（preview）は別である。polygonのunsupported境界はこのGroup 14でも維持する。

## 1. 現在状態

| 項目 | 状態 |
|---|---|
| Work package | Group 14 / 2D-3-PREVIEW + 2D-3-IMPACT |
| 基準main | 217c695f22ee494f0ee2166f44d496de09fa3e8e（PR #227 merge後） |
| Group 14 | completed、全27工程中16工程完了 |
| 契約状態 | accepted（G14-P1 + G14-I1 + G14-U1） |
| 実装状態 | PR #225初期実装、PR #226 verification hardening、PR #227最終補修をmainへ反映済み |
| 検証状態 | CI Run #689の全job成功、artifact検査、固定headの3方向read-only reviewを完了 |
| open Pull Request | 0件（2026-08-10の基準確認時。closeout文書同期Draft PRの作成前） |
| この文書の目的 | P1・I1・U1のaccepted契約を保持し、実装・検証・closeoutの完了証拠を§14へ記録する |
| 次に許可される行動 | Group 15の契約監査だけ。製品実装は契約・受入条件の人間採用前まで開始しない |
| この同期で変更しない範囲 | schema、version、migration、保存形式、IndexedDB配置、.casproj、export ZIP、dependency、polygon、現行Atlas拒否、Group 15仕様採用、Ready化、merge |

作業状態、影響の確度、検証の状態、export互換性の主張は別の軸で扱う。次の語を同じ意味で使わない。

- proposed / accepted / implemented / verified
- 確定 / 可能性 / 未評価
- CI-passed / independently-verified
- current export compatibility

## 2. 今回の目的

Editor内に、既存データを変更せずに次を確認できる読み取り専用の「ゲーム確認」モードを追加するための契約を固定する。

1. 6素材種別を、ゲーム内に近い見え方で確認する。
2. origin、anchor、実効collider、Animation、tile、背景、gimmick、effectの意味を説明する。
3. sourceまたはeditの変更から、影響を受ける関係を確度付きで列挙する。
4. 既存素材検査と影響表示を1か所で確認する。
5. 画面上の確認操作が保存や書き出しへ影響しないことを検証する。

## 3. 変更しない範囲

Group 14では、次を変更しない。

- Asset、Project、Frame、Animation、Game Dataの永続形式。
- JSON Schema、Asset version、Project version、migration。
- IndexedDB、History、Undo / Redo、autosave、Blob、updatedAt。
- .casprojの配置と内容、export ZIPの構成、export API。
- 現行Atlas、Sprite Sheet、atlas.json、product ZIPの事前拒否。
- polygonの型、schema、編集、描画、書き出し。
- Animation単位のcollider上書き。
- colliderのFrame別追加・削除、purpose・shapeの変更。
- 新しいassetTypeとしてのUI / icon。
- 外部dependency、外部API、SaaS、アカウント、クラウド保存。
- 物理演算、ゲームエンジン固有挙動、3D、WebGPU必須化。
- Group 14の合否を決める物理Safari確認。

既存のFrame collider overrideは、Asset共通colliderを基準に、Frame overrideを優先し、visibleを表示専用として扱うGroup 13の契約を再利用する。

## 4. 採用した高位契約

### 4.1 G14-P1: ゲーム風preview

ゲームエンジンを再現するのではなく、現在の素材データから、ゲームで確認したい関係を説明する。previewは読み取り専用の投影であり、物理演算、engine固有の衝突、実行時の正確な挙動を保証しない。

### 4.2 G14-I1: 変更影響

現在選択中のAssetと、その時点のsource / edit / variant / animation / frame参照を読み取り、影響候補を列挙する。結果は画面状態としてのみ保持し、保存しない。

### 4.3 G14-U1: Editor内ゲーム確認モード

Editorから入れる読み取り専用モードとし、Preview、Impact、既存素材検査を同じ画面の中で確認する。編集画面へ戻る操作を用意するが、このモードから編集用commit callbackを呼ばない。

## 5. G14-P1 Previewの共通規則（採用契約）

### 5.1 共通表示

すべての素材種別で、利用可能な範囲に次を表示する。

- 現在のAsset名、assetType、Previewが説明用であること。
- AnimationとFrameの選択状態、再生・停止状態。
- origin、anchor、Asset共通collider、Frame overrideを解決した実効collider。
- 表示中の値が未設定、無効、参照切れ、画像表示不能のいずれか。
- 色だけに依存しない凡例。ラベルと理由を併記する。

Frameを選択したときは、既存のFrame collider解決規則を使う。overrideがないときはAsset共通値へfallbackする。意味不正、参照切れ、画像decode失敗などは自動修復せず、「表示できない」「未評価」または具体的な理由を表示する。

### 5.2 FrameとAnimationの初期状態

次を実装時の初期値として採用する。

- Animationがある場合は先頭のAnimation、Frameがある場合は先頭のFrameを初期表示する。
- AnimationもFrameもない場合は静止画として表示し、未設定を示す。
- 再生は初期停止とする。
- 再生、停止、Frame選択、scrub、表示切替はUI-only stateとする。

### 5.3 6素材種別の表示マトリクス（採用）

| assetType | 共通overlay | 種別固有の説明表示 | 未設定・不正時 | 保証しないこと |
|---|---|---|---|---|
| character | origin、anchor、実効collider、Frame / Animation | originが有効なときはoriginのYを接地線として表示し、Animationを再生する | originがなければ接地線を推測せず未設定表示。collider不正は理由表示 | キャラクター制御、重力、実ゲームの接地判定 |
| item | origin、anchor、実効collider、Frame / Animation | 自動の接地物理は加えず、配置基準としてoriginとanchorを表示する | originがなければ配置基準未設定。実効colliderがなければ未設定表示 | 取得、投擲、重量、ゲーム内の配置処理 |
| background | origin、anchor、存在する判定情報 | loopX / loopYとparallax設定を表示し、説明用の位置変更を行う | loop設定がなければ未設定。画像表示不能は理由表示 | カメラ、ワールド座標、実行時のスクロール性能 |
| tile | origin、anchor、実効collider、tileSize | 中央タイルと周囲8セルの3×3反復で継ぎ目とcollision表示を確認する | tileSizeがない・不一致なら推測せず単体表示と理由表示 | autotile、terrain、engine固有の接続規則 |
| gimmick | origin、anchor、実効collider、Frame / Animation | movementPresetの名前と、既知の方向だけを静的な矢印で表示する | 未知のpresetは軌跡を作らず未評価表示 | 物理、AI、状態遷移、実行時の軌道 |
| effect | origin、anchor、Frame / Animation | anchor、duration、loop、blendの設定を表示し、可能なとき再生する | durationや再生対象が不正なら静止表示と未評価理由 | engineごとのblend、粒子物理、実行時の見え方 |

この表の「接地線」「3×3反復」「parallax位置」「movementPresetからの矢印」「effect timingの優先順位」は、G14-P1の採用契約として実装する。

### 5.4 不足・不正・表示不能

Previewは不足データを黙って補わない。

| 状態 | 表示 |
|---|---|
| 任意の値が未設定 | 未設定。推測した値は使わない |
| 参照先が存在しない | 参照切れ。対象IDまたはpathを表示 |
| colliderの意味検証に失敗 | colliderを実効値として扱わず、理由を表示 |
| Blobがない | 画像表示不能。ゲーム風表示は未評価 |
| 画像decodeに失敗 | 画像表示不能。エラーを画面内に表示 |
| Atlas等が現行境界で拒否される | 既存の拒否理由を表示。Group 14で解除しない |

## 6. G14-I1 Impactの規則（採用契約）

### 6.1 影響の入力

Impactは、次を読み取り、現在のAssetから関係を算出する。

- sourceとeditの現在の関係。
- directなlinked variant参照。
- AnimationとFrameの参照。
- 現在のGame DataとPreviewで使う値。
- 現行のexport preflightが返す互換性情報。

保存済みの検証記録や過去exportを、新しい検証済み結果として生成しない。

### 6.2 確度の意味

| 表示 | Group 14での意味 | 例 |
|---|---|---|
| 確定 | 現在のデータに直接存在する関係、または既存の決定済み検査結果 | direct linked variant、Frame参照、既知の拒否境界 |
| 可能性 | 現在のデータから算出した候補で、実際のpreview・対象engine・出力実行までは確認していない | Previewへの影響、現在のexport互換性の見込み |
| 未評価 | Group 14で計算・実行・過去記録の照合をしない | manual variant、過去export、検証記録、transitiveな派生影響 |

Variantの既存状態（up-to-date、staleなど）と、I1の確度は別に表示する。確度は色だけで示さず、理由、対象path、参照IDを併記する。

### 6.3 影響の表示単位

各行に次を表示する。

- 対象の種類。
- 対象IDまたは参照path。
- 確度。
- 影響理由。
- Group 14で実際に確認したこと。
- 未確認の範囲。
- 現在の操作から再確認が必要になる可能性。

directな関係は列挙する。linked variantのtransitiveな連鎖、manual variant、過去export、検証記録は未評価としてまとめ、存在を推測しない。

### 6.4 更新と無保存

Asset、Frame、Animationを選び直したとき、またはPreview内のUI-only状態を変えたときに、影響表示を再計算する。再計算は画面内の純粋な読み取り処理とする。

Impactの結果、展開状態、フィルター、選択状態は次へ書き込まない。

- Asset、Project、Frame、Animation
- History、Undo / Redo、autosave
- IndexedDB、Blob、updatedAt
- .casproj、JSON、export ZIP
- verification record

## 7. G14-U1 Game Check Modeの規則（採用契約）

### 7.1 入口と出口

- EditorでAssetを選択した状態から、アクセシブル名「ゲーム確認」の操作で入る。
- Asset未選択時は入れず、理由を表示する。
- 「戻る」または「閉じる」で直前のEditorへ戻る。
- 入退出、再生、停止、Frame選択、overlay切替、Impact展開、parallax表示位置は保存しない。
- 編集、追加、削除、collider変更、type変更、export実行の操作は置かない。

### 7.2 UI-only state

次を一時状態として扱う。

- modeの入退出。
- selected Animation、selected Frame、再生・停止、再生時刻、scrub位置。
- origin、anchor、collider、tile、parallax、gimmick、effect overlayの表示切替。
- tileの説明用反復、parallaxの説明用位置、gimmickの説明用方向表示。
- Impactの展開、フィルター、選択。
- reduced-motion時の再生停止または静止表示。

この状態には保存用のcommit関数を渡さない。modeを閉じても、保存済みAssetとHistoryの値は変わらない。

### 7.3 画面の構成

縦方向に次の順で表示する。

1. modeのタイトルと「説明用表示。物理演算・engine固有挙動は保証しない」の凡例。
2. Preview領域。
3. Frame / Animationの読み取り選択と再生操作。
4. Overlay凡例と不足・不正理由。
5. Impact一覧。
6. 既存素材検査へのリンクまたは折りたたみ表示。
7. 戻る操作。

小さい画面では内部を縦にスクロールする。canvasに設定するtouch-actionをmode全体へ広げず、通常のscrollとPreview操作を分離する。

## 8. 受入条件と検証

### 8.1 Unit

実装PRで次の純粋処理を固定する。

- 6素材種別のPreview投影。
- 初期Frame / Animationの選択。
- Asset共通colliderとFrame overrideの実効値解決。
- invalid、dangling、missing blob、decode failureの非破壊表示。
- I1の確度分類と理由生成。
- direct参照と未評価範囲の分離。
- UI-only stateが保存入口へ渡らないこと。

既存のresolveFrameColliders、applyFrameToAsset、drawGameOverlaysなど、同じ意味を持つ処理を再利用し、座標変換規則を重複実装しない。

### 8.2 375×667 Chromium E2E

Group 14の自動Gateは、既存のPlaywright環境で幅375、高さ667、portrait、touch操作を可能にしたChromiumで行う。物理Safariの合否はこのGroup 14 Gateに含めない。

最低限、次を確認する。

1. Editorからゲーム確認へ入り、戻れる。
2. 6素材種別の正常fixtureで、対応する表示と凡例が出る。
3. Frame override、未設定、参照切れ、missing blob、decode failureで画面が落ちず、理由が出る。
4. Previewの再生、停止、Frame選択、overlay切替、Impact展開が動く。
5. 横方向のoverflowがない。内部の縦scrollで最下部の戻る操作へ到達できる。
6. 操作対象は44px以上とし、テキスト入力を置く場合は16px以上とする。読み取り専用のため、不要な入力欄は置かない。
7. Tab、Shift+Tab、Enter、Space、Escape、矢印操作の扱いを定義し、focusが見える。
8. 操作前後でAsset、Project、updatedAt、History、autosave、IndexedDB、.casproj、exportの状態が変わらない。
9. reduced-motion設定で自動再生や連続移動を止めても、情報表示が確認できる。

### 8.3 CIとレビュー

- accepted同期PRのようなMarkdown-only PRでは、変更分類を実行し、製品build、Unit、E2Eを製品実装の成功証拠として扱わない。
- 製品実装PRでは、lint、format、build、Unit、Chromium E2Eを実行する。
- src、e2e、ブラウザ表示、CI、依存関係に触れた場合はE2Eを省略しない。
- CI成功後、Opus 4.8または同等の独立reviewを行う。
- 物理SafariはGroup 14の後続端末信頼性Gateへ残す。

### 8.4 no-saveのwrite-setと比較oracle（実装で固定する契約）

読み取り専用を「verified」と扱うには、単に画面上の入力を置かないだけでは足りない。実装PRでは、既存の保存経路に合わせて次のwrite-setを比較対象にする。実際のIndexedDB store名は既存のstorage inventoryを参照し、名前を推測して固定しない。

- Asset、Project、Frame、Animation、Game Dataの保存値。
- updatedAt、History、Undo / Redo、autosaveのpending状態。
- IndexedDBの全対象storeのrecord、metadata、revision、削除・復元情報。
- TextureやsourceのBlob bytes、byteLength、hash、Blob URL管理状態。
- .casprojの出力bytesとmanifestのhash。
- export bytes、export manifest、verification record。Game Check Modeはexportを開始しないため、新規生成物がないことを確認する。
- mode、selected Frame、再生時刻、scrub、overlay、parallax、Impact展開などのUI-only stateは、保存write-setへ入らないこと。

比較oracleは次の順とする。

1. fixtureを読み込み、Asset、Project、History、autosave、IndexedDB、Blob、出力関連のbefore snapshotを取る。
2. Game Check Modeへ入り、6種別のPreview、再生、停止、Frame選択、overlay、Impact、縦scroll、戻る操作を行う。
3. after snapshotを取り、保存対象の値、revision、record数、Blob bytes / hash、既存出力bytes / manifestをbeforeと比較する。
4. reloadまたは再オープン後に同じ比較を行い、画面内の一時stateだけが消え、保存済みデータが変わっていないことを確認する。
5. 変更があった場合は、UI-only境界の失敗として不合格にする。テストを弱めたり、対象を省略したりしない。

このone-sheetでは実行証拠を作成しない。実装PRで、使用したsnapshot helper、対象store一覧、比較結果、artifact URLを記録する。

### 8.5 Fixture、test、artifactの識別子（実装PRで固定する契約）

one-sheet承認後の実装PRでは、次の識別子を使ってfixtureとテストを追跡する。fixture bytesのhashは、実際のfixtureファイルを作成した時点で固定し、このdocs-only PRには未記録とする。

| ID | 対象 | 期待する状態 |
|---|---|---|
| G14-P1-character-normal | character正常 | 接地線、origin、anchor、実効collider、Frame / Animationを表示 |
| G14-P1-item-normal | item正常 | 自動物理を加えず、origin、anchor、実効colliderを表示 |
| G14-P1-background-normal | background正常 | loop、parallax設定、画像表示を確認 |
| G14-P1-tile-normal | tile正常 | tileSizeと3×3反復、collisionを確認 |
| G14-P1-gimmick-normal | gimmick正常 | movementPresetの名前と既知方向を表示 |
| G14-P1-effect-normal | effect正常 | anchor、duration、loop、blend、再生を確認 |
| G14-P1-invalid-collider | semantic-invalid | 自動修復せず理由表示 |
| G14-P1-runtime-invalid-colliders | runtime-invalid | 保存形式の前提を満たさないcolliders値でも補完・例外終了せず、既存Atlas preflightの拒否理由を表示 |
| G14-P1-dangling-reference | dangling reference | 参照IDと表示不能理由を表示 |
| G14-P1-missing-blob | missing Blob | 画像表示不能と未評価を表示 |
| G14-P1-decode-failure | decode failure | エラー理由を表示し画面を落とさない |
| G14-I1-linked-direct | direct linked variant / Frame reference | 確定として対象pathを列挙 |
| G14-I1-manual-unassessed | manual variant / past export / record | 未評価として列挙 |
| G14-EXPORT-atlas-reject | Atlas / Sprite Sheet / product ZIP | 既存の拒否理由を表示しbytesを生成しない |

accepted同期時点は上記のうち`G14-P1-runtime-invalid-colliders`を除く13 IDだった。PR #227で既存の「不正値でも落ちず理由表示」契約を補強する1 IDとして追加し、現在のacceptance fixtureは当初13 ID + 補強1 IDの計14 IDである。新しい製品仕様の追加ではない。

実装PRで固定するtest名と実行方法の候補は次のとおりである。

- Unit: Preview投影、実効collider、invalid表示、I1確度分類、UI-only境界。
- E2E: game-check-mode-375x667。既存repositoryのe2e scriptとPlaywright設定に従い、375×667 portrait・touch操作で実行する。
- Artifact: CI job URL、Playwright report、375×667 screenshot、before / after no-save snapshot、fixture hash一覧。
- 期待値: 対象fixtureの失敗・flaky・不意のskipは0件。docs-onlyのCI Run #677はこの期待値の証拠ではない。

## 9. Fixtureの最小構成（実装PRで固定する契約）

各assetTypeについて、次の状態を用意する。

- 正常な静止画またはAnimation。
- origin / anchor / collider / type固有値の未設定。
- Frame overrideあり。
- danglingまたは意味不正な参照。
- missing Blobまたはdecode failure。
- 現行Atlas / Sprite Sheet / product ZIP拒否境界に該当する状態。

6種別は次のとおりで、Group 14では新しいassetTypeを追加しない。

- character
- item
- background
- tile
- gimmick
- effect

## 10. 実装開始Gate

次のすべてを満たすまでproduct codeへ進まない。

1. G14-P1の承認済み表示マトリクスと不足・不正時の扱いを実装契約として使う。
2. G14-I1の承認済み確度、Impactの対象path、linked variantの範囲、未評価の範囲を実装契約として使う。
3. G14-U1の承認済み入口・出口、UI-only state、375×667受入条件を実装契約として使う。
4. accepted同期PRをmainへ反映し、基準mainを再確認する。
5. 別branch、別Draft PR、単一writerで製品実装を開始する。
6. schema、version、migration、保存、export、Atlas拒否へ影響する提案が出た場合は、Group 14を停止して別の人間判断へ戻す。

## 11. Group 14からGroup 15への境界

Group 14の工程順は次のとおりとする。

1. Group 13の完了確認。現在のmainではcompleted、進捗15/27、polygon unsupported、Atlas系事前拒否維持。
2. 2026-08-09、ユーザーがG14-P1 + G14-I1 + G14-U1を承認し、このone-sheetをacceptedへ同期する。
3. PR #225で初期実装を行い、PR #226で§8のverification hardening、PR #227で固定head review後の最終補修を行う。
4. CI Run #689、artifact検査、固定headの3方向read-only reviewを完了し、PR #227をmainへ反映する。
5. Group 14をcompleted、進捗16/27とし、その後にGroup 15の契約監査だけへ進む。

Group 15は、2D-4-CORE + 2D-4-SHEET + 2D-4-SCALEであり、共通export core、決定的再出力、sheet、atlas、scale、trim、padding、extrudeを扱う。Group 14のone-sheet承認は、Group 15のexport契約を採用したことを意味しない。

Group 15の現在状態は`contract-audit-unblocked / product-not-started / unaccepted`である。旧`docs/future/EXPORT_QUALITY_DESIGN.md`のPhase 20案を、そのままGroup 15のaccepted契約とは扱わない。common manifest、target優先度、直接生成しない範囲、determinismをbyte同一と意味同一のどちらで定義するか、pack順とtie-break、rotation、page上限、trim座標と透明Frame、padding / extrude、1x / 2x / 3xの単一・同時出力、命名・丸め、manifest / atlas version、既存ZIP互換、export-presets schema / migration、現行Atlas拒否の維持・解消を別handoffで固定し、人間が採用するまで製品実装を開始しない。

## 12. 承認記録

この文書で承認した内容は、次の3点である。適用範囲はGroup 14に限る。

1. G14-P1：6素材種別の表示マトリクス、接地線、tile 3×3、parallax、gimmick方向、effect timing、不足・不正時の扱い。
2. G14-I1：確定・可能性・未評価の意味、Impactの対象path、direct / transitiveの範囲、current export compatibilityと既存Atlas拒否の分離。
3. G14-U1：ゲーム確認の入口・出口、UI-only state、画面構成、375×667 Chromium Gate、物理Safariを後続へ残す境界。

## 13. 監査証拠

この節はaccepted同期時点の履歴記録である。PR #225以後の現在状態とcloseout証拠は§14を正本とする。

基準main 6c89339dccac411ceb78a72f7300db5d4df5423f、open PR 0件に対して、承認後の3方向read-only監査を行った。

| 担当 | 結果 |
|---|---|
| 仕様・判断 | accepted同期前の状態不一致を確認 |
| 実装・データ契約 | accepted同期後も保存・schema・export境界は変更不要と確認 |
| テスト・CI・iPhone | CI #677はdocs-only分類成功で、製品検証の証拠ではないと確認 |

accepted同期時点の統合結論は、承認済みG14-P1 + G14-I1 + G14-U1をacceptedとして記録し、既存Group 13の型・保存・export境界を変更せず、別Draft PRで製品実装へ進める状態になった、というものである。当時の実装状態はnot-started、検証はunverifiedだった。

このaccepted同期PRで変更するファイルは、このone-sheetと上位2計画書だけである。製品コード、test、schema、version、migration、保存、export、CI定義、依存関係、polygonは変更しない。

## 14. 補修と完了証拠

PR #225はGroup 14の初期製品実装をmainへ反映し、merge commitは`cd3c3ffa8043353cfbb8a901f46daafea3945101`である。CI Run #682はlint、format、build、Unit 850件、Chromium E2E 185件、H3、Pages open / closedを全成功したが、当時は§8.2〜§8.5のfixture、no-save oracle、artifact、固定head独立reviewが不足していたため、この時点ではcloseoutしなかった。

PR #226はverification hardeningを行い、merge commit `280ab99d39a4857bb6bd7acd0d8f5479d3650766`としてmainへ反映した。その固定head reviewで残った、runtime-invalid値を補完せずAtlas preflight拒否として表示すること、UI-only Impact行のIDを値変更後も維持すること、非空のUndo / Redoを使ってno-saveを検証することの3 MUSTは、PR #227で補修した。PR #227 final headは`95c1e9de81a7c445cbae3e8846a7582c55dd7ded`、merge commitと2026-08-10時点の基準mainは`217c695f22ee494f0ee2166f44d496de09fa3e8e`である。

### 14.1 CIとartifact

[CI Run #689](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/31319970728)（Actions ID `31319970728`、attempt 1）は`classify-changes`、`build-and-test`、`e2e`の全jobを成功した。lint、format、build、Unit 79 files / 870 passed、Chromium E2E 194 passed、Group 14専用10 tests、H3 1 passed、Pages open / closed各1 passedで、failed / flaky / skipped / retryは0件だった。PR CIはhead `95c1e9de81a7c445cbae3e8846a7582c55dd7ded`をbase `280ab99d39a4857bb6bd7acd0d8f5479d3650766`へ統合したsynthetic merge `5d49f2152ab11450e1189811fdb8867c28203763`を検査した。synthetic mergeと最終main merge `217c695f22ee494f0ee2166f44d496de09fa3e8e`の変更ファイル差分は0件である。

| 項目 | 記録 |
|---|---|
| Artifact | [playwright-report-31319970728-1](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/31319970728/artifacts/9039925430) |
| Artifact ID / size | `9039925430` / 727,638 bytes |
| Artifact digest | `sha256:2456b487e140a6ef3ada2aa8cec6f94ca15747581d69b651f6b527bebb5d0bde` |
| 保持期限 | 2026-08-23T15:05:50Z。期限切れ後もID、完全digest、主要hashと件数を本節へ保持する |
| Fixture archive | 11,904 bytes、raw SHA-256 `83a396abdeda8d7a439726ae0e90feb9a4297faa57ff5a08e1319e9a818fa4ab`、manifest SHA-256 `e680aee83806ecc62b0860be653d52d35528918969c1988aefcebe96e827ee4a`、26 entries |
| Browser harness | 3 source files、manifest SHA-256 `3981b3328c028af3a53ce07e6339fe409fbce0c6e0a308307e94585b0c521d64` |

artifactの物理ファイルはPlaywright HTML report 1件とPNG 3件である。JSON証拠8件はHTML report内の添付であり、独立した`test-results/`ファイルがあるとは扱わない。添付は`G14-fixture-hash.json`、`G14-before-no-save-snapshot.json`、`G14-game-check-375x667.png`、`G14-tile-single-overlay-off-375x667.png`、`G14-tile-3x3-375x667.png`、`G14-after-no-save-snapshot.json`、`G14-reopen-ui-only-defaults.json`、`G14-reload-no-save-snapshot.json`である。全画面375×667は2枚で、tile single overlay offは353×287のcanvas cropである。

acceptance fixtureは§8.5の当初13 IDに`G14-P1-runtime-invalid-colliders`を補強した14 IDである。6素材種別それぞれの正常状態と5異常状態、合計6種別×6状態を検証した。no-save oracleでは、before / afterのIndexedDB全store、Editor state、`asset.json`、`.casproj`を完全一致で確認した。Historyは空状態ではなくbefore / afterともUndo 2件、Redo 1件、`canUndo=true / canRedo=true / pendingPush=false`であり、autosaveはsaved、timer / pending task / running / errorなしだった。reload後は保存済みdata、IndexedDB、出力がbeforeと一致し、UI-only state、History、autosaveのsession stateだけが既定値へ戻った。Game Check中のdownloadは0件、Atlas ZIP生成bytesは0、Blob URLは各時点active 0でcreatedとrevokedが一致した。

### 14.2 3方向read-only review

固定head `95c1e9de81a7c445cbae3e8846a7582c55dd7ded`と基準main `217c695f22ee494f0ee2166f44d496de09fa3e8e`を対象に、2026-08-10、ChatGPT Workの3担当がGitHub外でread-only reviewを行った。GitHub上のsubmitted review、review thread、conversation commentは0件であり、次は外部独立reviewの記録である。全担当とも`Changed files: none`だった。

| 担当 | 結果 | closeoutでの扱い |
|---|---|---|
| 仕様・判断 | `BLOCKER 0 / MUST 4 / SHOULD 1` | MUSTは3正本文書のstale状態、完了証拠、14 fixture ID、Group 15境界の同期であり、本closeout文書同期で対応する。製品仕様の追加ではない |
| 実装・データ契約 | `BLOCKER 0 / MUST 0 / SHOULD 0 / NOTE 2` | PR #227の3 MUST閉鎖と、schema・保存・export互換性の維持を確認した |
| テスト・CI・証拠 | CI / artifact側`BLOCKER 0 / MUST 0 / SHOULD 0`、文書drift `G14-CI-01`はMUST | Run #689、artifact、fixture、no-save / reload証拠は充足し、文書driftは本同期で対応する |

Group 14開始前の`15a08d2`から基準main `217c695f22ee494f0ee2166f44d496de09fa3e8e`まで、Asset / Project / export schema、version定数、migration、IndexedDB定義、`.casproj`、製品export、Atlas形式、`package.json`、`package-lock.json`のblobは同一である。History / autosaveの保存挙動と状態遷移も不変だが、検査用の読み取り専用snapshot観測APIは追加されている。polygon `unsupported`と現行Atlas系の事前拒否も維持する。

Game Checkは実際のAtlas生成やengine読込を実行していない。「既知のAtlas拒否理由なし」は可能性表示であり、実export成功やengine挙動を保証しない。物理Safariは採用済み契約どおりGroup 14の追加停止Gateにせず、後続`2D-6`へ残す。

以上によりGroup 14を`accepted / implemented / CI-passed / independently-verified / merged / completed`、全27工程中16工程完了とする。次の正式作業は17工程目のGroup 15契約監査だけであり、Group 15の仕様採用と製品実装は行っていない。
