# 2D-3 Timeline + Rig 契約計画

最終更新日: 2026-07-22
work package: Group 12 `2D-3-TIMELINE + 2D-3-RIG`
基準: `main@236571c241bf84747f71f260f3bea99e6abe7f25`
状態: `T1 + R1 + P1 accepted / H1 + H2 + H3 human decision required / product implementation not started`
関連: `docs/adr/0008-motion-time-semantics.md`, `docs/adr/0009-animation-event-boundary.md`, `docs/adr/0021-frame-duration-semantics.md`, `docs/adr/0022-rig-flip-and-bake-parity.md`, `docs/adr/0023-part-layer-replacement.md`

---

## 1. 目的

既存のFrame / Animation / Part / RigAnimation / bake基盤を再利用しながら、可変時間、event、rig flip、part replaceを実装できる契約へ具体化する。2026-07-22の人間承認により、次の中核判断を採用する。

- **T1**: 可変時間はFrame単位のoptionalな追加情報とする。旧fps-onlyデータは不変とし、現行派生exportで黙って均一化しない。
- **R1**: rig flipは既存flipとは別sliceとする。ID参照、位置、回転、可動域を鏡映し、bake前後の結果一致を必須にする。
- **P1**: 初回part replaceは既存`Part.layerIds`の静的な差し替えだけとする。時間依存の衣装・状態切替は別ADRへ分離する。

この文書はdocs-onlyの契約監査であり、型、schema、製品UI、保存、export、dependencyを変更しない。

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

## 3. T1: Frame単位の可変時間

### 3.1 保存と実効時間

- 将来追加するfieldは`Frame.durationMs?: number`。有限かつ0より大きいms値だけを許可する。
- Animation内の各出現の実効時間は`frame.durationMs ?? 1000 / animation.fps`とする。
- Animation全体の実時間は、`frameIds`の各出現について実効時間を合計する。同じFrameが複数回現れれば毎回加算する。
- 同じFrameを複数Animationが参照する場合も同じoverrideを使う。出現ごとに違う時間が必要ならFrameを複製する。
- 既存`Animation.durationMs`はinformationalのままにし、再生・event・派生exportの正本へ昇格せず、自動更新もしない。
- 既存Asset 0.2.0へ値を補完せず、fps-onlyの意味を変えない。optional・additiveなのでAsset versionは0.2.0、migrationなしを維持する。
- Frame複製は`durationMs`を複製し、新規captureはoverrideを持たない。旧GIF / APNG importから失われた可変時間を遡及復元しない。

### 3.2 再生、event、検査

- 固定`setInterval`ではなく、現在Frameの実効時間を読む取消可能な逐次schedulerを使う。
- eventはADR-0009どおりFrameの表示開始時に発火し、同じFrameの各出現・loopの各周回で発火する。
- event参照はFrame IDとし、複製・flipでは張り替える。削除後のdangling参照は黙って削除せず意味検証エラーにする。
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

- Part ID、`parentId`、`layerIds`、rig poseのpart ID key、RigAnimation ID、Frame ID、eventの`frameId`を、先に作った完全mapで張り替える。
- event名はゲーム用文字列なのでleft / rightを自動変更しない。既存のPart type、anchor role、表示名の左右交換規則だけを維持する。
- 参照切れ、重複Layer所属、親子循環、非有限値を旧IDの保持や値の削除で回避せず、理由付きでflip / bakeを拒否する。
- ID、日時、表示名を正規化した上で、`flip(bake(original))`と`bake(flipRig(original))`の全Frame・全Layer transform・最終pixelが許容誤差内で一致することを完了条件にする。
- 親子3段以上、非zero pivot、bind pose、rotation limit、部分keyframe、負scale、非等方scaleをfixtureへ含める。

現行`bakeRigAnimation`はLayer中心を`position + textureSize * scale / 2`で求めるが、accepted座標契約は`position + textureSize / 2`を中心とする。非等方scaleと回転でparityを壊すため、R1製品実装より先に数式を修正し、rendererと同じfixtureで固定する。

## 5. P1: 静的part replace

初回操作のwrite-setは、1 Asset内の1つの既存Partに対する次の置換だけとする。

```text
before.parts[target].layerIds -> validatedReplacementLayerIds
```

- Partの`id / name / partType / parentId / pivot / bindPose / rotationLimit`を維持する。
- Layer、Texture、Blob、Frame、Animation、RigAnimationを作成、削除、再採番しない。
- すでにbakeしたFrameは変更しない。次回bakeだけが新しいLayer集合を使う。
- 置換IDは同一Assetの既存Layerだけとし、重複を許さず、保存順は`Asset.layers`順へ正規化する。
- 1回の確定を1 History操作とし、取消、Undo / Redo、保存・reloadを原子的に扱う。
- schema、version、migration、Family recipe、product exportを変更しない。装備違いは引き続きmanual variantであり、linked recipeへ自動昇格しない。
- 時間依存の衣装、表情、状態切替、keyframe別Part所属、state machineは別ADRへ送る。Group 13のcollider override / polygonへ混ぜない。

## 6. 人間判断が必要な3 Gate

### H1: 固定fps派生export

| 選択肢 | 契約 | 評価 |
| --- | --- | --- |
| **E1（推奨）** | `Frame.durationMs`またはeventを持つAnimationがある場合、`atlas.json`、それを含むZIP、helpers、examplesを理由付きで止める。PNG / WebP、単体`asset.json`、`.casproj`は許可する。 | 情報を失わず、誤ったゲーム再生を作らない。 |
| E2 | 明示loss確認後だけ、現行fpsへ均一化しeventを除外して派生出力する。 | 互換は保てるが、確認後でも時間・eventを失う。 |
| E3 | frameをresampleして近似する。 | Frame数とevent時刻を変えるためGroup 12では採らず、2D-4へ送る。 |

T1の「黙って均一化しない」はacceptedだが、E1 / E2の選択は未決定である。決定までT1製品実装を開始しない。

### H2: Layer所属と空集合

| 選択肢 | 契約 | 評価 |
| --- | --- | --- |
| **L1（推奨）** | `layerIds`は1件以上、各Layerは高々1 Partに所属。別Partで使用中なら確認後に同一操作で移す。 | bake結果がPart順に依存しない。 |
| L2 | 空集合をdetachとして許可するが、1 Layer 1 Partは維持する。 | 空Partの意味とUI表示を追加で定義する必要がある。 |
| L3 | 複数Part所属を許可し、bake優先順位を定義する。 | 現行の後勝ち競合を正本化するため非推奨。 |

既存の重複・空データを自動migrationしない。新規操作のpreflightとread-only inspectionで理由を表示し、競合するdataのbakeを止める。

### H3: rig bake資源上限

現行bakeは同期処理で、`max(1, round(durationMs / 1000 * fps))`個のFrameと、概ね`frameCount * sum(part.layerIds.length)`個のLayerStateを一括生成する。fps、duration、生成Frame、生成Stateに実効上限がない。

ローカルNodeで実コードを使った参考計測は次のとおりだった。これはbrowser、History、autosave、画像合成、iPhone Safariの合格証拠ではない。

| Frame | Part / LayerState per Frame | median | serialized JSON |
| ---: | ---: | ---: | ---: |
| 60 | 4 | 1.50 ms | 51,727 bytes |
| 120 | 8 | 4.54 ms | 188,882 bytes |
| 240 | 8 | 6.36 ms | 374,975 bytes |
| 240 | 16 | 18.86 ms | 722,303 bytes |
| 480 | 16 | 35.00 ms | 1,439,139 bytes |
| 960 | 16 | 71.93 ms | 2,871,688 bytes |

初期候補は**120 Frame超でwarning、240 Frameをhard cap**とする。ただし採用値ではない。Frame上限に加えて、生成LayerState数、推定serialized bytes、sprite-sheet pixel数の上限が必要である。PC Chromium、iPad Safari、iPhone Safariでbake、React反映、autosave、Undo / Redo、reload、`asset.json` / `.casproj` / ZIPを各3回測定し、最弱端末の結果を人間が承認するまで数値をacceptedにしない。

## 7. bake preflight

Frameを1件も割り当てる前に、UI、意味検証、bake関数が同じpreflightを使う。

- fps / durationは有限かつ正、keyframe timeは0〜1、pose数値は有限。
- `rotationLimit.min <= max`、Part / Layer / Texture / parent / pose参照が解決可能、親子循環なし。
- 重複keyframe時刻、重複Part ownership、重複FrameLayerStateを理由付きで検出する。
- 生成Frame、LayerState、推定serialized bytes、sheet pixelを表示し、上限超過を原子的に拒否する。
- 拒否時はAsset、Blob、History、autosaveを変更しない。

既存schemaが許す`durationMs: 0`をこのdocs-only PRで無効化しない。まずbake preflightで拒否し、既存data互換を変えるschema厳格化は別判断とする。

## 8. 実装sliceとGate

| Slice | 内容 | 変更予定 | 完了Gate |
| --- | --- | --- | --- |
| A | T1 model / schema / scheduler / event / inspection | `Frame.durationMs?`と`Animation.events?`のoptional追加、consumer統一 | H1決定、旧data roundtrip、mock clock、保存・export Gate |
| B | bake安全化とR1 | 座標修正、共通preflight、上限、rig flip / ID remap | H3決定、bake parity、原子的拒否、iPhone実測 |
| C | P1 | `Part.layerIds`だけの置換UIとinspection | H2決定、exact write-set、1 History、次回bakeのみ反映 |
| D | Timeline UX | onion skin、loop / event編集、frame alignment後続の接続 | A〜Cの契約を変えず、touch / keyboard / 44px Gate |

1 PR 1 sliceを守る。schemaを変更するT1と、schema不要のR1/P1を同じ製品PRへ混ぜない。各実装PRは固定headでlint、format、build、全unit、Chromium E2Eを成功させ、skip / retryを理由なく残さない。

## 9. 必須test matrix

| Slice | Unit / contract | Chromium E2E・保存 | 実機 |
| --- | --- | --- | --- |
| T1 | fallback、override、反復Frame、loop / event、安全payload、duplicate / delete / flip | mock clock順序、Undo / Redo、reload、IndexedDB、`.casproj`、H1のloss / 拒否 | 長いtimeline、keyboard、入力zoom、44px、縦横 |
| R1 | 完全ID graph、鏡映式、source不変、double flip、親子 / pivot / bind / limit / scale | 全Frame bake parity、Undo / Redo、reload、上限超過の原子的拒否 | 採用上限でbake、応答、Safari reload / crashなし |
| P1 | missing / duplicate / empty / order / ownership、他field不変 | 既存bake不変、次回bake反映、1 History、Undo / Redo、reload | touch選択、長いLayer一覧、keyboard後の確定 / 取消 |

Playwrightのmobile viewportは実iPhone Safariの代替にしない。Group 12完了前にsafe area、software keyboard、入力zoom、orientation、touch target、bake時のmemoryとreloadを実機で記録する。

## 10. 互換性と対象外

- T1はAsset 0.2.0のoptional field追加で、migration、IndexedDB layout、`.casproj`配置を変えない。R1 / P1はschemaを変えない。
- Atlasへduration / eventを追加する変更はChameleon Atlas 0.1.0の形式変更なのでGroup 12では行わない。
- GIF / APNG importは現行のuniform fps + loss表示を維持し、T1と同時に自動拡張しない。
- linked Familyのrig refresh、rebakeによる既存Frame置換、native rig export、collider override / polygon、IK、mesh、physics、state machineは対象外。
- 製品実装、dependency追加、Group 12 PRのReady化・mergeは本docs-only監査の対象外。

## 11. 停止条件

次のいずれかに該当したら製品実装を開始せず、人間判断へ戻す。

- H1 / H2 / H3が未決定。
- accepted座標式とbake parityを同時に満たせない。
- optional追加だけでは旧Asset 0.2.0のroundtripを維持できない。
- iPhone Safariで採用候補上限を安全に完了できない、または計測できない。
- Atlas / ZIP version、storage layout、migration、dependencyの変更が必要になる。
