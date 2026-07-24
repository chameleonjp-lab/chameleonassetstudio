# 2D-3 Timeline + Rig 契約計画

最終更新日: 2026-07-24
work package: Group 12 `2D-3-TIMELINE + 2D-3-RIG`
監査基準: `main@236571c241bf84747f71f260f3bea99e6abe7f25`
マージ後基準: PR #146 merge `cb21ea4` / PR #147 final head `1ba671f7` / merge `24a089c` / PR #148 final head `0cfc1ea` / merge `fbdeb357` / PR #149 merge `536318f` / PR #153 merge `e8fac95` / PR #154 final head `fdf75f0` / merge `1c700e7`
状態: `T1 Slice A merged / P1 Slice C merged / R1 Slice B1 accepted for implementation / Slice B2 numeric Gate pending / formal B0 deferred`
関連: `docs/adr/0008-motion-time-semantics.md`, `docs/adr/0009-animation-event-boundary.md`, `docs/adr/0021-frame-duration-semantics.md`, `docs/adr/0022-rig-flip-and-bake-parity.md`, `docs/adr/0023-part-layer-replacement.md`, `docs/future/2D_3_H3_MEASUREMENT_PROTOCOL.md`

---

## 1. 目的

既存のFrame / Animation / Part / RigAnimation / bake基盤を再利用しながら、可変時間、event、rig flip、part replaceを実装できる契約へ具体化する。2026-07-22の人間承認により、次の中核判断を採用する。

- **T1**: 可変時間はFrame単位のoptionalな追加情報とする。旧fps-onlyデータは不変とし、現行派生exportで黙って均一化しない。
- **R1**: rig flipは既存flipとは別sliceとする。ID参照、位置、回転、可動域を鏡映し、bake前後の結果一致を必須にする。
- **P1**: 初回part replaceは既存`Part.layerIds`の静的な差し替えだけとする。時間依存の衣装・状態切替は別ADRへ分離する。

PR #146の契約監査は17文書、製品コード変更なしでmainへ反映済みである。後続の人間判断H1=E1、H2=L1、H3=M1と計測専用`tools/h3/`はPR #147 final head `1ba671f7`、merge `24a089c`でmainへ反映された。CI Run #460とmerge後CI Run #461は全job成功し、固定headの最終独立reviewは全3系統`BLOCKER 0 / MUST 0`だった。PR #148 merge `fbdeb357`で24時間配信基盤、PR #149 merge `536318f`でPages rootのサービス本体と`/h3/`の分離を実装した。T1 Slice AはPR #153 final head `7f684a7`、merge `e8fac95`としてmainへ反映済みで、CI Run #489と固定headの独立reviewを通過した。P1 Slice CはPR #154 final head `fdf75f0`、merge `1c700e7`としてmainへ反映済みで、CI Run #492と固定headの独立review `BLOCKER 0 / MUST 0 / SHOULD 0`を通過した。2026-07-23の人間判断により、正式B0の4端末収集は当面保留し、H3を問題発生時の診断手段として維持する。2026-07-24の人間判断ADR-2026-07-24-027でSlice BをB1とB2へ分割し、H3数値に依存しないB1は本docs-only決定がmainへ入った後に実装可能とした。B2の数値budget、warning、hard cap、採用上限での実機測定、Group 12完了判定とSlice Dの製品実装は、後続の明示判断まで開始しない。

## 2. 監査方法と現状

同一の基準SHAを、仕様、実装・データ安全、テスト・端末の3担当が独立にread-only監査した。Opus 4.8を利用したとは扱わない。統合前の各結果は次のとおりで、全担当がファイルとGitHubを変更していない。

| 担当 | BLOCKER | MUST | SHOULD | NOTE |
| --- | ---: | ---: | ---: | ---: |
| 仕様・ADR | 0 | 6 | 3 | 2 |
| 実装・データ安全 | 0 | 6 | 4 | 4 |
| テスト・端末 | 0 | 4 | 2 | 3 |

重複を整理すると、実装前の必須契約は次の6系統である。

1. T1の実効時間と全consumerを1つの規則へ統一する。
2. 固定fpsしか表現できない派生exportの扱いを人間が決める。
3. R1の鏡映式、完全ID remap、bake equivalenceを固定する。
4. bakeの文書・実装差異を直し、座標計算の既知不一致を実装前に解消する。
5. P1のexact write-setとLayer所属規則を固定する。
6. bakeの有限値検査、資源preflight、上限、iPhone Safari Gateを固定する。

これらはPR #146 final head `20871f7`で文書化し、CI Run #457成功、固定head独立review `BLOCKER 0 / MUST 0 / SHOULD 0`を確認した。PR #146はmerge `cb21ea4`としてmainへ反映され、merge後CI Run #458も成功した。上の監査基準は履歴として維持し、現在状態を古いSHAへ書き換えない。

merge後の人間判断はH1=E1、H2=L1、H3=M1である。E1 / L1の意味は§6、M1の再現手順は`2D_3_H3_MEASUREMENT_PROTOCOL.md`を正本とする。T1 Slice AはPR #153、P1 Slice CはPR #154でmainへ反映済みである。H3の数値budgetと資源上限は後続のまま維持する。ADR-2026-07-24-027でSlice Bの分割を確定し、B1は座標修正、数値・参照・構造preflight、利用可能な独立rig反転コピー、完全ID remap、保存・再読込・parity検査を扱い、B2は資源上限とGroup 12完了Gateを扱う。

## 3. T1: Frame単位の可変時間

### 3.1 保存と実効時間

- T1 Slice Aで追加するfieldは`Frame.durationMs?: number`。有限かつ0より大きいms値だけを許可する。
- Animation内の各出現の実効時間は`frame.durationMs ?? 1000 / animation.fps`とする。
- Animation全体の実時間は、`frameIds`の各出現について実効時間を合計する。同じFrameが複数回現れれば毎回加算する。
- 同じFrameを複数Animationが参照する場合も同じoverrideを使う。出現ごとに違う時間が必要ならFrameを複製する。
- 既存`Animation.durationMs`はinformationalのままにし、再生・event・派生exportの正本へ昇格せず、自動更新もしない。
- 既存Asset 0.2.0へ値を補完せず、fps-onlyの意味を変えない。optional・additiveなのでAsset versionは0.2.0、migrationなしを維持する。
- Frame単体複製は`durationMs`とFrame内容だけを複製し、どのAnimationの`frameIds`もeventも変更しない。既存eventは元Frameを参照したまま残し、複製FrameをAnimationへ追加した後に必要なeventを明示作成する。新規captureはoverrideを持たない。旧GIF / APNG importから失われた可変時間を遡及復元しない。

### 3.2 再生、event、検査

- 固定`setInterval`ではなく、現在Frameの実効時間を読む取消可能な逐次schedulerを使う。
- eventはADR-0009どおりFrameの表示開始時に発火し、同じFrameの各出現・loopの各周回で発火する。
- event参照はFrame IDとする。Frame単体複製ではeventを複製・移動しない。独立Asset複製と独立rig flipでは各eventに新しいevent IDを採番し、`frameId`を新しいFrame IDへ張り替える。linked mirrorの内部ID維持modeではevent IDとFrame IDを既存規則どおり維持する。削除後のdangling参照は黙って削除せず意味検証エラーにする。
- payloadはプリミティブ、プリミティブ配列、値がプリミティブの平坦objectまでとし、実行、URL自動読込、秘密情報の格納を許可しない。
- effect時間検査を含む全consumerは同じ実効時間関数を使う。

### 3.3 現行consumerへの影響

`EditorScreen`の再生、`assetInspection`の時間検査、Frame複製、linked Familyの対応field、flip / Asset複製、保存roundtripを同じsliceで更新する。`Animation.durationMs`を優先する現行検査はT1と不整合なので、本SliceのMUST修正とする。

## 4. R1: rig flipとbake同値

反転軸を`axisX = asset.origin.x`とし、既存の「アセット全体の独立左右反転コピー」を拡張する別sliceで扱う。

| 対象 | 鏡映後 |
| --- | --- |
| `Part.pivot` | `{ x: 2 * axisX - x, y }` |
| bind pose / keyframe `localPosition` | `{ x: -x, y }` |
| `localRotation` | `-rotation` |
| `localScale` | 変更しない |
| `rotationLimit {min,max}` | `{ min: -max, max: -min }` |
| keyframe `time` / fps / loop / duration | 変更しない |

- Part ID、`parentId`、`layerIds`、rig poseのpart ID key、RigAnimation ID、Frame ID、event IDとeventの`frameId`を、先に作った完全mapで張り替える。linked mirrorの内部ID維持modeは既存規則に従う。
- event名はゲーム用文字列なのでleft / rightを自動変更しない。既存のPart type、anchor role、表示名の左右交換規則だけを維持する。
- 参照切れ、親子循環、非有限値、H2=L1（各Part非空、各Layerは高々1 Partへ所属）に反するdataを、旧IDの保持や値の削除で回避せず、理由付きでflip / bakeを拒否する。未所属Layerは許可し、既存違反dataを自動migrationしない。
- 対応Layerを完全ID mapで照合し、position x / y、scale x / y、`[-180, 180)`へ正規化したrotationの絶対差をそれぞれ`1e-6`以下とする。relative toleranceは使わず、配列順、visible、opacity、参照、時間はexact一致とする。
- pixel oracleは同じrenderer・同じfixtureから得た同寸法RGBA bufferを比較する。全pixelのalpha差を1以下、どちらかのalphaが0より大きいpixelのRGB各channel差を1以下とし、両方が完全透明のpixelだけRGBを比較対象外にする。
- parity比較で正規化できるのは、完全mapで対応が証明されたAsset / Part / Layer / Frame / Animation / RigAnimation / event ID、`createdAt / updatedAt`、自動生成されたcopy表示名だけとする。配列順、参照、時間、transform、visible、opacity、pixelを正規化してはならない。
- `.casproj` roundtripは2段階で検証する。ZIP decode直後・製品namespace再採番前はcanonical `asset.json`とBlob bytes / hashをexport直前とexact一致させる。製品import後は、既存契約が要求するProject ID / Asset ID、FamilyのAsset参照、Asset IDをprefixに持つBlob storage keyの対応mapだけを許可する。
- 製品import後もPart / Layer / Frame / Animation / RigAnimation / eventの内部ID、参照、時間、transform、配列順、Blob bytes / hashはexact一致とする。許可したcontainer mapを逆適用してcanonical Assetを比較し、reload後にも`flip(bake(original))`と`bake(flipRig(original))`のparityを再実行する。
- 親子3段以上、非zero pivot、bind pose、rotation limit、部分keyframe、負scale、非等方scaleをfixtureへ含める。

現行`bakeRigAnimation`は入力中心と出力positionの両方にtexture scaleを掛けるが、accepted座標契約はscale非依存の中心を使う。入力は`center0 = position + textureSize / 2`、world pose適用後の中心を`center1`として、出力は`next.position = center1 - textureSize / 2`とする。非等方scaleと回転でparityを壊さないよう、R1製品実装より先に両式を修正し、rendererと同じfixtureで固定する。

B1は、現在の「新しいAssetを作る独立左右反転コピー」を利用者が画面から実行できる形で拡張する。元Assetは変更せず、rig編集データを保持した新Assetへ完全ID mapを適用する。新Asset作成操作は既存契約どおりUndo / Redo対象外とし、保存失敗時は追加途中のAssetや参照をすべて取り消す。成功後の保存・reloadと`.casproj` roundtripで見た目と参照の一致を確認する。

B1は数値上限、warning、hard capを導入しない。有限値、参照解決、親子循環、H2=L1、重複時刻など入力の正しさだけを実行前に検査し、資源量の採用値を使う判断はB2へ残す。

## 5. P1: 静的part replace

初回操作のwrite-setは、1 Asset内の1つの既存Partに対する次の置換だけとする。

```text
before.parts[target].layerIds -> validatedReplacementLayerIds
```

永続dataの例外は通常のcommitで更新する`Asset.updatedAt`だけとする。History labelやUI選択状態はAssetのwrite-setに含めず、対象外Partの`layerIds`を含むその他のdomain fieldを変更しない。

- Partの`id / name / partType / parentId / pivot / bindPose / rotationLimit`を維持する。
- Layer、Texture、Blob、Frame、Animation、RigAnimationを作成、削除、再採番しない。
- すでにbakeしたFrameは変更しない。次回bakeだけが新しいLayer集合を使う。
- 置換IDは同一Assetの既存Layerだけとし、重複を許さず、保存順は`Asset.layers`順へ正規化する。
- 1回の確定を1 History操作とし、取消、Undo / Redo、保存・reloadを原子的に扱う。
- schema、version、migration、Family recipe、product exportを変更しない。装備違いは引き続きmanual variantであり、linked recipeへ自動昇格しない。
- 時間依存の衣装、表情、状態切替、keyframe別Part所属、state machineは別ADRへ送る。Group 13のcollider override / polygonへ混ぜない。

## 6. 人間判断した3 Gate

### H1: 固定fps派生export

| 選択肢 | 契約 | 評価 |
| --- | --- | --- |
| **E1（採用）** | export対象Animationが参照するFrameに`durationMs`がある、または対象Animationにeventがある場合、`atlas.json`、それを含むZIP、helpers、examplesを理由付きで止める。未参照Frameのoverrideだけでは止めない。PNG / WebP、単体`asset.json`、`.casproj`は許可する。 | 情報を失わず、誤ったゲーム再生を作らない。 |
| E2 | 明示loss確認後だけ、現行fpsへ均一化しeventを除外して派生出力する。 | 互換は保てるが、確認後でも時間・eventを失う。 |
| E3 | frameをresampleして近似する。 | Frame数とevent時刻を変えるためGroup 12では採らず、2D-4へ送る。 |

H1=E1を採用した。E2は採らず、E3は2D-4へ残す。この判断は契約を確定するが、T1製品実装を開始する承認ではない。

### H2: Layer所属と空集合

| 選択肢 | 契約 | 評価 |
| --- | --- | --- |
| **L1（採用）** | `layerIds`は1件以上、各Layerは高々1 Partに所属。未所属Layerは許可する。別Partで使用中のLayerは理由付きで拒否し、対象外Partを暗黙変更・移動しない。 | P1の1 Partだけというexact write-setを守り、bake結果がPart順に依存しない。 |
| L2 | 空集合をdetachとして許可するが、1 Layer 1 Partは維持する。 | 空Partの意味とUI表示を追加で定義する必要がある。 |
| L3 | 複数Part所属を許可し、bake優先順位を定義する。 | 現行の後勝ち競合を正本化するため非推奨。 |

H2=L1を採用した。既存の重複・空データを自動migrationしない。新規操作のpreflightとread-only inspectionで理由を表示し、L1に反するdataのbakeを止める。この判断はP1 / R1製品実装を開始する承認ではない。

### H3: rig bake資源上限

現行bakeは同期処理で、`max(1, round(durationMs / 1000 * fps))`個のFrameと、概ね`frameCount * sum(part.layerIds.length)`個のLayerStateを一括生成する。fps、duration、生成Frame、生成Stateに実効上限がない。

H3=M1として、数値を決めず再現可能な測定を先に行う。正本は`2D_3_H3_MEASUREMENT_PROTOCOL.md`、実行資産は`tools/h3/`である。60 / 120 / 240 Frame、flat / chain、64 / 256 / 512pxを分離した固定matrixを使い、現行bake関数とsheet配置関数を直接測る。warm-up 3回、記録10回、raw sample、median、nearest-rank p95、fixture SHA-256、環境を残す。

120 Frame超warning / 240 Frame hard capは測定caseの旧候補であり、採用値、製品定数、合否基準ではない。Frameに加えて生成・最終LayerState、compact / pretty JSON byte、sheet pixel、推定RGBAを記録する。PC Chromium、iPhone 17 Pro Safari、iPhone 11 Pro Safari、iPad Pro 2018 Safariのcore測定後も、製品実装後のReact、保存、Undo / Redo、reload、`asset.json` / `.casproj` / ZIPを別Gateで測り、数値を別途人間承認する。

2026-07-23の人間判断では、正式B0をGroup 12開始前の一律停止条件から外した。移設前commitのiPhone 17 Pro baseline結果2件は参考記録に限り、数値採用には使わない。H3数値が未決定の間は数値warning / hard capと、それに依存するB2およびGroup 12完了判定を保留する。一方、サービス公開、T1 Slice A、P1 Slice Cに加え、数値budgetへ依存しないB1は進めてよい。公開利用で性能や端末固有の問題が見えた場合、本プロトコルを再実行し、必要なら製品path Gateへ検査項目を追加する。

## 7. bake preflight

### 7.1 B1: 数値・参照・構造のpreflight

Frameを1件も割り当てる前に、UI、意味検証、bake関数が同じ構造preflightを使う。

- fps / durationは有限かつ正、keyframe timeは0〜1、pose数値は有限。
- `rotationLimit.min <= max`、Part / Layer / Texture / parent / pose参照が解決可能、親子循環なし。
- 重複keyframe時刻、H2=L1への違反、重複FrameLayerStateを理由付きで検出する。
- 拒否時はAsset、Blob、History、autosaveを変更しない。
- B1の検査結果は理由付きで返し、資源量のwarning、hard cap、Group 12完了を表す文言を出さない。

既存schemaが許す`durationMs: 0`をB1で無効化しない。まずbake前に理由付きで拒否し、既存data互換を変えるschema厳格化は別判断とする。

### 7.2 B2: 資源数値Gate

- 生成Frame、生成・最終LayerState、推定serialized bytes、sheet pixelを割当前に計算して表示する。
- H3と後続人間承認で採用した値に限り、warningとhard capへ使う。
- hard cap超過時は1件も割り当てず、Asset、Blob、History、autosaveを変更しない。
- 採用上限でPC Chromium、iPhone Safari、iPad Safariの製品pathを測り、Group 12完了判定へ使う。

## 8. 実装sliceとGate

| Slice | 内容 | 変更予定 | 完了Gate |
| --- | --- | --- | --- |
| A | T1 model / schema / scheduler / event / inspection | `Frame.durationMs?`と`Animation.events?`のoptional追加、consumer統一 | E1拒否、旧data roundtrip、mock clock、保存・export Gate |
| B0 | H3測定 | 必要時にmainの同一commitから`/h3/`を24時間開き、現行coreを固定matrixでPC / Safari実機測定 | 2026-07-23時点では保留。問題発生時に再実行し、後続数値は別途人間承認 |
| B1 | H3非依存のbake安全化とR1 | 座標修正、数値・参照・構造preflight、画面から使える独立rig反転コピー、完全ID remap | source不変、保存失敗rollback、保存・reload・`.casproj`、全Frame transform / pixel parity、mobile viewport |
| B2 | 資源数値Gate | 生成量表示、採用後のwarning / hard cap、資源超過の原子的拒否 | H3数値決定、採用上限でPC / iPhone / iPad product-path実測、Group 12完了判定 |
| C | P1 | `Part.layerIds`だけの置換UIとinspection | L1拒否、exact write-set、1 History、次回bakeのみ反映 |
| D | Timeline UX | onion skin、loop / event編集、frame alignment後続の接続 | A〜Cの契約を変えず、touch / keyboard / 44px Gate |

PR #154はSlice Cだけを扱い、既存Part 1件の`layerIds`差し替えUI、H2=L1検証、read-only inspection、H2違反だけを割当前に止める狭いbake refusal、History・保存roundtripを実装した。T1のschema・scheduler・export契約は変更していない。

ADR-2026-07-24-027により、後続をB1とB2へ分ける。B1は有限値・座標・参照・構造検査とR1を1つの製品PRで扱い、資源上限を先取りしない。B2はH3数値と別の人間承認後に扱う。event編集、onion skin、frame alignmentはSlice D以降へ残す。

1 PR 1 sliceを守る。schemaを変更するT1と、schema不要のR1/P1を同じ製品PRへ混ぜない。各実装PRは固定headでlint、format、build、全unit、Chromium E2Eを成功させ、skip / retryを理由なく残さない。

## 9. 必須test matrix

| Slice | Unit / contract | Chromium E2E・保存 | 実機 |
| --- | --- | --- | --- |
| T1 | fallback、override、反復Frame、loop / event、安全payload、Frame単体複製はevent不変、Asset複製 / flipはevent ID再採番とframeId張替え、delete | mock clock順序、event ID一意性・発火回数、Undo / Redo、reload、IndexedDB、`.casproj`、E1対象拒否と許可対象 | 長いtimeline、keyboard、入力zoom、44px、縦横 |
| R1 / B1 | 完全ID graph、鏡映式、source不変、double flip、親子 / pivot / bind / limit / scale、有限値・参照・循環・H2=L1、`1e-6` transform / RGBA oracle | 画面から独立copy作成、History不変、保存失敗rollback、保存・reload、`.casproj` decode直後exact＋製品importのcontainer ID map適用後exact＋再parity、375 × 667 / 667 × 375 | B1 merge Gateには数値上限の実機合格を要求しない。物理Safari確認はGroup 12 closeoutへ残す |
| 資源 / B2 | 生成Frame / LayerState / JSON byte / sheet pixelの境界、理由code、warning / hard cap | 採用値の直前・一致・超過、超過時Asset / Blob / History / autosave不変 | 採用上限でbake、操作応答、PC / iPhone / iPad Safari reload / crashなし |
| P1 | missing / duplicate / empty / order / ownership、他field不変 | 既存bake不変、次回bake反映、1 History、Undo / Redo、reload | touch選択、長いLayer一覧、keyboard後の確定 / 取消 |

Playwrightのmobile viewportは実iPhone Safariの代替にしない。Group 12完了前にsafe area、software keyboard、入力zoom、orientation、touch target、bake時のmemoryとreloadを実機で記録する。

## 10. 互換性と対象外

- T1はAsset 0.2.0のoptional field追加で、migration、IndexedDB layout、`.casproj`配置を変えない。R1 / P1はschemaを変えない。
- Atlasへduration / eventを追加する変更はChameleon Atlas 0.1.0の形式変更なのでGroup 12では行わない。
- GIF / APNG importは現行のuniform fps + loss表示を維持し、T1と同時に自動拡張しない。
- linked Familyのrig refresh、rebakeによる既存Frame置換、native rig export、collider override / polygon、IK、mesh、physics、state machineは対象外。
- 製品実装、dependency追加、numeric budget、Ready化・mergeは24時間限定のB0配信準備の対象外。

## 11. 停止条件

次のいずれかに該当したら、影響するsliceだけを止めて人間判断へ戻す。

- H3数値が未決定の間は、数値warning / hard cap、B2、Group 12完了判定を確定しない。これはサービス公開、T1 Slice A、P1 Slice C、B1の停止条件ではない。
- accepted座標式とbake parityを同時に満たせない。
- optional追加だけでは旧Asset 0.2.0のroundtripを維持できない。
- 公開利用で停止、極端な遅延、保存・書き出し失敗などが再現した。この場合はM1 protocolまたは製品path Gateを再開する。
- Atlas / ZIP version、storage layout、migration、dependencyの変更が必要になる。

## ADR-2026-07-23-026: 正式B0を保留し、サービス公開を優先する

### 状態

- accepted（2026-07-23 人間承認）
- サービス公開とGroup 12の進行順だけを変更
- H3 numeric budget、warning、hard capは未決定のまま

### 決定

- 現在のH3確認はいったん完了とする。
- 移設前commitで取得したiPhone 17 Proのbaseline結果2件は参考動作確認として保持し、正式B0や数値budgetへ使わない。
- PC Chromium、iPhone 11 Pro、iPad Pro 2018を含む正式B0は、公開利用で性能や端末固有の問題が見えた時に再開する。
- main更新時はサービス本体を自動公開し、H3は通常閉じる。必要時だけ手動で24時間開く。
- 数値warning / hard capはH3数値と別の人間承認が揃うまで実装しない。
- サービス公開後の次の製品work packageは、数値budgetへ依存しないT1 Slice Aとする。P1 Slice Cも数値budgetを理由に止めない。
- 公開利用から新しい再現可能な問題が見つかった場合、その問題に対応するunit / E2E / 実機項目を追加する。

### 対象外

- H3数値の採用。
- Slice Bの数値上限とGroup 12全体の完了判定。
- `asset.json`、`.casproj`、export ZIP、IndexedDB layout、dependencyの変更。
- Ready化、merge、PagesのUnpublish。

## 12. P1 Slice Cのマージ後closeout

2026-07-24にPR #154のmergeを確認し、`main@1c700e7`を仕様、実装・データ安全、テスト・端末の3方向でread-only監査した。

- P1 Slice Cは`implemented / CI-passed / independently-verified / merged`である。
- CI #492はunit 732件、Chromium 159件、H3 1件、Pages公開・閉鎖各1件を成功した。
- 物理iPhone Safari、safe area、software keyboard、実機reloadはGroup 12 closeout Gateとして未完了のまま維持する。
- R1の意味はacceptedだが、ADR-2026-07-23-026はR1、bake共通preflight、Slice B数値上限を先行許可の対象外にしている。
- H3非依存R1を独立sliceへ分けるか、Slice BをH3再開まで一体で保留するかは、このcloseout時点では人間判断が必要だった。
- 後続のADR-2026-07-24-027でA1を採用し、B1 / B2の分割とB1先行を確定した。


## ADR-2026-07-24-027: Slice BをB1 / B2へ分け、B1を先行する

### 状態

- accepted（2026-07-24 人間承認、A1）
- B1 product implementation not started
- B2 numeric budget / warning / hard cap pending

### 決定

- Slice Bを、H3数値に依存しないB1と、数値採用後のB2へ分ける。
- B1は、accepted座標式への`bakeRigAnimation`修正、有限値・参照・循環・H2=L1などの構造preflight、rig編集データを保持した独立左右反転コピー、完全ID remap、transform / pixel parity、保存・reload・`.casproj` roundtripを扱う。
- B1の反転は現在と同じ「新しいAssetを作る操作」として画面から利用できるようにする。元Assetを変更せず、Undo / Redo対象外とし、保存失敗時は新Asset追加を全て取り消す。
- B1は数値warning、hard cap、H3の候補値を製品定数へ入れず、Group 12完了を名乗らない。
- B2は生成Frame / LayerState / serialized bytes / sheet pixelの採用値、warning、hard cap、資源超過の原子的拒否、採用上限でのPC / iPhone / iPad product-path実測、Group 12完了判定を扱う。

### 実装順

1. 本決定をdocs-only Draft PRで正本へ反映する。
2. そのPRがmainへ入った後、B1を1 branch / 1 Draft PR / 単一writerで実装する。
3. B1のCIと独立検証後も、B2とGroup 12 closeoutはH3数値の後続判断まで保留する。

### 対象外

- H3数値、warning、hard capの採用。
- `asset.json`、schema、version、migration、IndexedDB layout、`.casproj`配置、export ZIP、dependencyの変更。
- linked Familyのrig refresh、rebakeによる既存Frame置換、native rig export、collider override / polygon、IK、mesh、physics、state machine。
- Slice D、Ready化、merge、Pages配信変更。