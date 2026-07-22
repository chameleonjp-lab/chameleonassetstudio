# 2D-3 Timeline + Rig 契約計画

最終更新日: 2026-07-22
work package: Group 12 `2D-3-TIMELINE + 2D-3-RIG`
監査基準: `main@236571c241bf84747f71f260f3bea99e6abe7f25`
マージ後基準: PR #146 merge `cb21ea4` / PR #147 final head `1ba671f7` / merge `24a089c`
状態: `T1 + R1 + P1 + H1=E1 + H2=L1 + H3=M1 accepted / H3 numeric budget pending / product implementation not started`
関連: `docs/adr/0008-motion-time-semantics.md`, `docs/adr/0009-animation-event-boundary.md`, `docs/adr/0021-frame-duration-semantics.md`, `docs/adr/0022-rig-flip-and-bake-parity.md`, `docs/adr/0023-part-layer-replacement.md`, `docs/future/2D_3_H3_MEASUREMENT_PROTOCOL.md`

---

## 1. 目的

既存のFrame / Animation / Part / RigAnimation / bake基盤を再利用しながら、可変時間、event、rig flip、part replaceを実装できる契約へ具体化する。2026-07-22の人間承認により、次の中核判断を採用する。

- **T1**: 可変時間はFrame単位のoptionalな追加情報とする。旧fps-onlyデータは不変とし、現行派生exportで黙って均一化しない。
- **R1**: rig flipは既存flipとは別sliceとする。ID参照、位置、回転、可動域を鏡映し、bake前後の結果一致を必須にする。
- **P1**: 初回part replaceは既存`Part.layerIds`の静的な差し替えだけとする。時間依存の衣装・状態切替は別ADRへ分離する。

PR #146の契約監査は17文書、製品コード変更なしでmainへ反映済みである。後続の人間判断H1=E1、H2=L1、H3=M1と計測専用`tools/h3/`はPR #147 final head `1ba671f7`、merge `24a089c`でmainへ反映された。CI Run #460とmerge後CI Run #461は全job成功し、固定headの最終独立reviewは全3系統`BLOCKER 0 / MUST 0`だった。次は同一main commitを24時間だけHTTPS配信してB0実機結果を集める。型、schema、製品UI、保存、product export、dependencyは変更しない。

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

merge後の人間判断はH1=E1、H2=L1、H3=M1である。E1 / L1の意味は§6、M1の再現手順は`2D_3_H3_MEASUREMENT_PROTOCOL.md`を正本とする。H3の数値budgetと製品実装は未承認である。

## 3. T1: Frame単位の可変時間

### 3.1 保存と実効時間

- 将来追加するfieldは`Frame.durationMs?: number`。有限かつ0より大きいms値だけを許可する。
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

`EditorScreen`の再生、`assetInspection`の時間検査、Frame複製、linked Familyの対応field、flip / Asset複製、保存roundtripを同じsliceで更新する。`Animation.durationMs`を優先する現行検査はT1と不整合なので、製品実装時のMUST修正とする。

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

## 7. bake preflight

Frameを1件も割り当てる前に、UI、意味検証、bake関数が同じpreflightを使う。

- fps / durationは有限かつ正、keyframe timeは0〜1、pose数値は有限。
- `rotationLimit.min <= max`、Part / Layer / Texture / parent / pose参照が解決可能、親子循環なし。
- 重複keyframe時刻、H2=L1への違反、重複FrameLayerStateを理由付きで検出する。
- 生成Frame、LayerState、推定serialized bytes、sheet pixelを表示し、上限超過を原子的に拒否する。
- 拒否時はAsset、Blob、History、autosaveを変更しない。

既存schemaが許す`durationMs: 0`をこのdocs-only PRで無効化しない。まずbake preflightで拒否し、既存data互換を変えるschema厳格化は別判断とする。

## 8. 実装sliceとGate

| Slice | 内容 | 変更予定 | 完了Gate |
| --- | --- | --- | --- |
| A | T1 model / schema / scheduler / event / inspection | `Frame.durationMs?`と`Animation.events?`のoptional追加、consumer統一 | E1拒否、旧data roundtrip、mock clock、保存・export Gate |
| B0 | H3測定 | mainの同一commitを24時間限定HTTPS配信し、現行coreを固定matrixでPC / Safari実機測定 | M1 protocol、raw sample、環境、期限後停止、後続数値人間承認 |
| B | bake安全化とR1 | 座標修正、共通preflight、承認後の上限、rig flip / ID remap | H3数値決定、bake parity、原子的拒否、iPhone product-path実測 |
| C | P1 | `Part.layerIds`だけの置換UIとinspection | L1拒否、exact write-set、1 History、次回bakeのみ反映 |
| D | Timeline UX | onion skin、loop / event編集、frame alignment後続の接続 | A〜Cの契約を変えず、touch / keyboard / 44px Gate |

1 PR 1 sliceを守る。schemaを変更するT1と、schema不要のR1/P1を同じ製品PRへ混ぜない。各実装PRは固定headでlint、format、build、全unit、Chromium E2Eを成功させ、skip / retryを理由なく残さない。

## 9. 必須test matrix

| Slice | Unit / contract | Chromium E2E・保存 | 実機 |
| --- | --- | --- | --- |
| T1 | fallback、override、反復Frame、loop / event、安全payload、Frame単体複製はevent不変、Asset複製 / flipはevent ID再採番とframeId張替え、delete | mock clock順序、event ID一意性・発火回数、Undo / Redo、reload、IndexedDB、`.casproj`、E1対象拒否と許可対象 | 長いtimeline、keyboard、入力zoom、44px、縦横 |
| R1 | 完全ID graph、鏡映式、source不変、double flip、親子 / pivot / bind / limit / scale、`1e-6` transform / RGBA oracle | 全Frame bake parity、Undo / Redo、reload、`.casproj` decode直後exact＋製品importのcontainer ID map適用後exact＋再parity、上限超過の原子的拒否 | 採用上限でbake、応答、Safari reload / crashなし |
| P1 | missing / duplicate / empty / order / ownership、他field不変 | 既存bake不変、次回bake反映、1 History、Undo / Redo、reload | touch選択、長いLayer一覧、keyboard後の確定 / 取消 |

Playwrightのmobile viewportは実iPhone Safariの代替にしない。Group 12完了前にsafe area、software keyboard、入力zoom、orientation、touch target、bake時のmemoryとreloadを実機で記録する。

## 10. 互換性と対象外

- T1はAsset 0.2.0のoptional field追加で、migration、IndexedDB layout、`.casproj`配置を変えない。R1 / P1はschemaを変えない。
- Atlasへduration / eventを追加する変更はChameleon Atlas 0.1.0の形式変更なのでGroup 12では行わない。
- GIF / APNG importは現行のuniform fps + loss表示を維持し、T1と同時に自動拡張しない。
- linked Familyのrig refresh、rebakeによる既存Frame置換、native rig export、collider override / polygon、IK、mesh、physics、state machineは対象外。
- 製品実装、dependency追加、numeric budget、Ready化・mergeは24時間限定のB0配信準備の対象外。

## 11. 停止条件

次のいずれかに該当したら製品実装を開始せず、人間判断へ戻す。

- H3のFrame / LayerState / serialized bytes / sheet pixel数値が未決定。
- accepted座標式とbake parityを同時に満たせない。
- optional追加だけでは旧Asset 0.2.0のroundtripを維持できない。
- M1 protocolのPC / iPhone / iPad結果が揃わない、または製品pathで採用候補上限を安全に完了できない。
- Atlas / ZIP version、storage layout、migration、dependencyの変更が必要になる。
