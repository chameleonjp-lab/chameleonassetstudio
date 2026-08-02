# 2D-3 Game Data / Collider Override / Polygon Plan

最終更新日: 2026-08-02  
対象: Group 13 `2D-3-GAME-DATA + 2D-3-COLLIDER-OVERRIDE + 2D-3-POLYGON`  
基準main: `f54526210f0d563cff408b0e66c4234b90c4324f`
状態: `accepted: G1 + O1 + P1 / G1 Slice A implementation-in-draft`

---

## 1. 目的

Group 13を、次の3つへ分離する。

1. 既存形式で完成できるゲーム用情報の仕上げ。
2. Frameごとの当たり判定上書き。
3. polygon colliderの採否。

PR #215でdocs-only契約監査、PR #216で`G1+O1+P1`の採用記録をmainへ反映した。本Slice Aは、その採用判断のうちG1だけを製品コード、試験、利用者向け説明へ反映する。schema、version、migration、保存形式、export形式は変更しない。

## 2. 現在位置

- Group 12はcompletedで、Group 13の契約監査PR #215もmainへ反映済みである。
- 2D完成ロードマップは27工程で、Group 12までの14工程が完了している。
- 現在は15工程目のGroup 13である。
- `G1+O1+P1`はacceptedで、G1のSlice Aを本Draft PRで実装中である。Group 13全体は未完了で、完了数は14工程のままである。
- Group 14はGroup 13完了後に開始する。
- Slice Aのmerge後にO1の正式契約Slice Bへ進む。O1製品実装とpolygonは本PRへ含めない。

## 3. 監査で確認した既存実装

### 3.1 共通ゲーム用情報

次はTypeScript型、Asset `0.2.0`、画面編集、History、autosave、IndexedDB、単体`asset.json`、`.casproj`へ接続済みである。

- `origin`
- `anchors`
- rect / circleの`colliders`
- `tags`
- `gameAttributes`

origin、anchor、rect / circleは追加、変更、削除、Undo / Redo、reload、書き出しの自動試験がある。colliderはキャンバス上の選択、移動、rectのサイズ変更、circleの半径変更にも対応している。

### 3.2 種別ごとのゲーム用情報

次も型、schema、編集画面、保存経路へ接続済みである。

| Asset種別 | 現在の情報 |
|---|---|
| tile | `tileSize`、`collisionType`、`visualType` |
| background | Layerごとの`role`、`parallaxSpeed`、`loopX`、`loopY` |
| gimmick | `movementPreset`と用途tag |
| effect | `effectType`、正の`durationMs`、`loop`、`blendMode` |
| item | pickup collider、tag、`gameAttributes`を使う既存導線 |

balanced profileでは、すべてのAssetへanchorやcolliderを強制しない。素材種別ごとに必須不足と推奨不足を分ける既存契約を維持する。

## 4. 既存範囲で残る安全性の穴

### 4.1 構造を持つgameAttributes

`gameAttributes`はschema上、配列やobjectを含むJSON値を保持できる。一方、現在の入力欄は文字列と数値向けであり、配列やobjectを文字列化して編集すると意味を失う。

G1では、文字列と有限数値だけを通常入力で編集し、配列・object・boolean・nullは読み取り専用で表示する。構造を持つ値を編集する専用JSON editorはGroup 13の必須範囲に含めない。

### 4.2 Asset種別を変えた後の旧設定

Asset種別を変えても、以前の`tile`、`gimmick`、`effect`、Layerのbackground設定はデータ内に残る。これは非破壊保持として安全だが、画面から見えにくい。

G1では自動削除せず、別種別の設定が残っていることを理由付きで表示し、削除は利用者の明示操作だけで行う。

### 4.3 入力ごとのHistory

原点、anchor、colliderの数値・文字入力は、入力中の変更を確定時の1 Historyへまとめる。種別設定とgame attributesは入力のたびにHistoryを作り得る。

G1では、文字・数値入力をEnterまたはフォーカス離脱で最大1 Historyへまとめ、Escで取消、no-opではHistoryを作らない既存方式へ揃える。

## 5. Frame別collider上書きの既存決定

ADR-0010 / 0011で、将来境界はacceptedである。ただし実装許可ではない。

- 正本は`Asset.colliders`のまま維持する。
- 上書きはFrame単位だけとし、Animation単位には置かない。
- 優先順位は「Frame上書き > Asset共通」とする。
- 対象はAsset共通に実在するcolliderだけとする。
- rectは`x`、`y`、`width`、`height`、circleは`x`、`y`、`radius`、共通で`visible`だけを上書きできる。
- `visible`は編集・debug表示だけを制御し、ゲーム内の当たり判定の有効 / 無効を表さない。Frame別の有効時間帯が必要な場合は、`enabled`等の別fieldを別の人間判断で設計する。
- colliderの追加・削除、`purpose`変更、`shape`変更は上書きで行わない。
- 同じFrameを複数Animationが参照する場合、同じ上書きを使う。

## 6. Frame別上書きで追加固定が必要な点

実装する場合は、次を同じ契約で固定する。

- `Frame.colliderOverrides?`はoptional・additiveとし、不在時はAsset共通colliderだけを使う。
- ADR-0015の既存規則に従い、optional・additive追加ではAsset `0.2.0`を維持し、migrationを追加しない。
- collider ID重複、参照切れ、shape不一致、非有限値、0以下のサイズを理由付きで拒否する。
- 共通colliderを削除するとき、参照中のFrame上書きがあれば削除を拒否し、先に上書き解除を求める。暗黙の連鎖削除はしない。
- Frame複製では上書き内容を複製する。Asset複製ではcollider IDを張り替える。
- 左右反転コピーではcollider IDを張り替え、rect / circleの座標を既存反転式で変換する。
- Asset canvas resizeでは、共通colliderと同じ移動量を上書き座標へ適用する。
- D4 frame alignmentは既存write-setを維持し、Frame上書きを自動移動しない。必要な場合は利用者が上書きを明示調整する。
- 一時的な選択、表示切替、preview状態をAssetへ保存しない。

### 6.1 現行書き出しとの境界

現行Atlas `0.1.0`、helpers、examplesはFrame別上書きを表現できない。黙ってAsset共通colliderへ丸めたり、上書きを削除したりしない。

Group 13で上書きを実装する場合、上書きを含むAssetについて次を適用する。

- 許可: PNG、WebP、単体`asset.json`、`.casproj`
- 理由付き拒否: `atlas.json`、それを含む製品ZIP、helpers、examples
- 再開: Group 15〜17で共通export形式と対象別fixtureが上書きを表現できる契約を固定した後

## 7. polygon collider

現在の正式状態は`unsupported`である。rect / circleだけでGroup 13の必須ゲーム用情報を完成できる。

polygonを採用するには、少なくとも次を別の設計で固定する必要がある。

- 点を絶対座標にするか相対座標にするか
- 最小点数、重複点、自己交差、凸 / 凹、頂点順
- 左右反転後の頂点順
- schema、TypeScript型、version / migration
- `.casproj`、atlas、helpers、target adapter、E2E
- 古いrect / circleと旧`.casproj`の互換性

P1により2D Pro Gateまで`unsupported`を維持し、必要性と対象別出力の条件が揃った後の別work packageへ送る。

## 8. 採用判断

### G1: 既存Game Dataの仕上げ

| 候補 | 内容 | 影響 |
|---|---|---|
| **G1（採用）** | §3の既存範囲をGroup 13必須範囲とし、§4のデータ損失防止、旧種別設定の警告、入力確定単位を補修する。 | schema、version、migration、export形式を変えず、既存機能を安全に仕上げられる。 |
| G2（不採用） | 既存実装をそのまま完了扱いにする。 | 早いが、構造を持つgameAttributesの誤編集と、旧種別設定の見落としを残す。 |

### O1: Frame別collider上書き

| 候補 | 内容 | 影響 |
|---|---|---|
| **O1（採用）** | §5〜§6.1の限定仕様で、G1後の独立sliceとして実装する。 | 既存colliderのFrame別位置・サイズ調整とdebug表示上書きを扱える。ゲーム内の有効 / 無効は扱わない。複製、反転、resize、保存、書き出し拒否まで横断テストが必要。 |
| O2（不採用） | Group 13では不採用とし、2D Pro Gate後のfuture backlog `POST-2D-COLLIDER-OVERRIDE`へ延期する。 | O2の採用記録をもって`2D-3-COLLIDER-OVERRIDE`のGroup 13 Gateはcloseできる。別ADRがacceptedになるまでFrame上書きは実装しない。 |

### P1: polygon

| 候補 | 内容 | 影響 |
|---|---|---|
| **P1（採用）** | 2D Pro Gateまで`unsupported`を維持し、別work packageへ延期する。 | rect / circleの互換性を守り、Group 13を先へ進められる。 |
| P2（不採用） | Group 13で別設計から開始する。 | schema、version、migration、全export / target対応までGroup 13が大幅に広がる。 |

2026-08-02の人間判断で`G1+O1+P1`をacceptedとした。この採用はGroup 13の実装順と能力境界だけを許可し、製品コード、schema、version、migration、保存形式、export形式の変更自体を完了扱いにしない。

## 9. 実装分割

採用した`G1+O1+P1`を同じ実装PRへ混ぜない。

1. Slice A `2D-3-GAME-DATA-CLOSEOUT`: G1の既存範囲補修。本Draft PRで実装・検証中。
2. Slice B `2D-3-COLLIDER-OVERRIDE-CONTRACT`: O1の正式schema / data / export拒否契約。
3. Slice C `2D-3-COLLIDER-OVERRIDE`: Slice B merge後の製品実装。
4. Group 13 closeout: P1のunsupported維持、Group 14開始条件、残リスクを同期する。

各sliceは1 branch、1 Draft Pull Request、単一writerとする。CI失敗は同じPull Requestで直す。

Slice Bでは`Frame.colliderOverrides?`のcanonical schema形、semantic validation、UI操作、保存と書き出し拒否の正確な契約を固定する。Slice Bがmainへmergeされるまで、Slice Cの製品実装を開始しない。P1によりpolygonは`unsupported`を維持し、Group 13 closeoutで延期先とGroup 14開始条件を同期する。

## 10. 必須検証

### Slice A

- 構造を持つgameAttributesを表示しても値を壊さない。
- 旧種別設定を自動削除せず、理由付きで表示する。
- 文字・数値入力のEnter / blur二重commitなし、Esc取消、no-op、Undo / Redo、autosave、reload。
- 既存origin、anchor、rect / circle、tile、background、gimmick、effectのE2Eを弱めない。
- `src/features/editor/gameDataSafety.test.ts`と`src/core/model/assetOps.test.ts`で編集可否、旧設定列挙、no-opを固定する。
- `e2e/game-data-safety.spec.ts`で構造値の保存・再読込・書き出し、重複key拒否、全旧設定の保持・個別削除、入力確定、Undo / Redo、375 x 667を固定する。ローカルにbrowser binaryがない場合もskipへ変えず、GitHub Actions Chromiumの成功を合格証拠とする。

### Slice B / C

- schema / model: 正常値、参照切れ、shape不一致、非有限値、0以下サイズ、重複。
- 有効値の解決: 上書き不在時はAsset共通値へfallbackし、上書き存在時はFrame値を優先する。rectの位置・幅・高さ、circleの位置・半径を編集してpreviewへ反映する。
- 表示意味: `visible`は編集・debug表示だけへ作用し、ゲーム内の有効 / 無効として解釈しない。`enabled`を暗黙に作成、解釈、編集しない。
- Frame共有: 同じFrameを参照する複数Animationで、同じ上書き結果を得る。
- 操作: Frame複製、Asset複製、flip、canvas resize、D4非追従、共通collider削除拒否。
- 保存: History、Undo / Redo、autosave、IndexedDB、旧`.casproj`、新データroundtrip、保存失敗時の原子的復旧。
- 書き出し: 許可形式の保持と、Atlas / 製品ZIP / helperの理由付き拒否。
- 375 x 667 Chromium: 44px以上の操作対象、16px以上の入力文字、横overflowなし。
- 物理Safari確認は人間の現在方針に従い、追加の停止Gateにはしない。

## 11. 変更しない範囲

- polygonの型、schema、編集、描画、書き出し。
- Animation単位のcollider上書き。
- colliderのFrame別追加・削除、purpose / shape変更。
- 3D collider、physics engine、IK、mesh、state machine。
- UI / iconの新しい`assetType`。
- 外部dependency、SaaS、外部API。
- 2D Pro Gate前の3D実装。

## 12. 次のGate

1. PR #215のdocs-only監査をmainへ置く。完了済み。
2. 人間が`G1+O1+P1`を明示決定する。2026-08-02に完了済み。
3. docs-only採用記録PR #216をmainへ置く。完了済み。
4. 採用記録のmerge後、Slice AのG1だけを単一writerで開始する。本Draft PRで進行中。
5. Slice AのCIと固定head独立確認を通し、人間がmergeを判断する。
6. Slice Aのmerge後、Slice BでO1の正式契約を固定し、そのmerge後にだけSlice Cの製品実装へ進む。
