# Chameleon Asset Studio Group 19 契約監査・人間判断 handoff

最終更新日: 2026-08-15  
対象リポジトリ: chameleonjp-lab/chameleonassetstudio  
正式work package: 2D-5-UNITY + 2D-5-GODOT  
基準main SHA: fcbf1cc9b7a1a9d0cdd588eaed59de3999bdcabb  
文書種別: docs-only 契約監査・人間判断 handoff  
状態: proposal / human-decision-pending / implementation-not-started

上位文書: docs/IMPLEMENTATION_PLAN.md, docs/future/2D_COMPLETION_ROADMAP.md  
共通契約: docs/future/2D_5_EVIDENCE_LABELS_PLAN.md  
関連文書: docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md, docs/ENGINE_INTEGRATION.md, docs/EXPORT_FORMATS.md, docs/future/2D_4_ENGINE_FIXTURE_EVIDENCE.md

> Group 18（証拠形式・互換性ラベル）はPR #248で実装・CI・独立確認・mergeまで完了した。Group 19ではUnity 2DとGodot 2Dを、対象versionと素材種別を限定したfixtureで確認する。既存export、保存正本、schema、helper APIを先に変更して対象へ合わせることはしない。G19-C1〜C3の採用前は、製品コード、target fixture、CI workflow、dependencyを変更しない。

## 1. 現在確認できる事実

| 項目 | 確認結果 | Group 19への意味 |
|---|---|---|
| 最新main | fcbf1cc9b7a1a9d0cdd588eaed59de3999bdcabb。PR #249（Group 18 closeout）のmerge commit。 | このhandoffの基準head。 |
| open Pull Request | 0件（このhandoff Draft PR作成前の確認）。 | 同一目的のDraft PRを1本だけ作る。 |
| Group 18 | PR #248 final head e3309d57f030e9190cb4c678e49301e4736332b5、merge 3ab844d28d155a438dc8f10f8f9b22099a40093a、CI Run #793成功、contract artifact取得済み。 | candidate / verified / import-notes / unsupportedの共通境界を再利用する。 |
| Group 18 closeout | PR #249 final head 9af46a710376279917f3c5d5cc86f42c3713a3a4、merge fcbf1cc9b7a1a9d0cdd588eaed59de3999bdcabb、CI Run #795成功（docs-only分類）。 | 完了数は18/27。次の正式work packageはGroup 19。 |
| 既存互換性表 | Unity 2D / Godot 2Dは現状import-notes扱いで、対象version付きのverified fixtureはない。 | 未確認の対象をverifiedと表示しない。 |
| 既存engine docs | docs/ENGINE_INTEGRATION.mdは手動取り込みガイドと将来helper案を定義するが、Unity/Godotの実行fixtureはない。 | まず手動importの意味と実行証拠を固定する。 |
| 既存出力 | Chameleon独自のPNG / sheet / atlas / sidecarを出力する。Unity標準.meta、Prefab、Godot.tscn、Resourceそのものではない。 | 標準形式完全互換やnative project生成を推測しない。 |
| 既存Group 17 | PixiJS 8.12.0 / Phaser 4.2.0の専用fixtureでverified範囲を固定済み。 | Generic WebまたはGroup 17の成功をUnity/Godotへ流用しない。 |

## 2. 今回の目的

Group 19の完了時に、次の狭い範囲だけを対象version付きで説明できるようにする。

1. Unity 2DとGodot 2Dそれぞれについて、具体的な対象versionを固定する。
2. 同じsource fixtureから出したPNG / sprite sheet / sidecar / import notesを対象engineへ取り込む。
3. frame、trim後のoffset、scale、origin / pivot、anchor、rect / circle collider、animation順など、対象engineが表現できる意味を確認する。
4. UnityとGodotを別fixture・別検証記録・別artifactに分け、片方の成功をもう片方へ広げない。
5. Group 18のラベル規則に従い、実行したversion・fixture・素材種別だけをverifiedとする。未確認はcandidateまたはimport-notes、対象外やlossがあるものは理由付きunsupportedとする。

## 3. 対象と対象外

### 3.1 対象

- Unity用とGodot用にfixtureを分ける。fixtureにはsource hash、出力hash、manifest / sidecar hash、期待結果、対象versionを含める。
- fixtureの素材種別は、少なくとも通常sprite、複数frame animation、trimあり、origin / anchorあり、rectまたはcircle colliderありを含める。採用後に対象種別を固定し、未実施の種別をverifiedに含めない。
- UnityではSprite import、slice / pivot、animation、対象colliderの手動またはfixture-localな再現を確認する。
- GodotではSpriteFramesまたはAnimatedSprite2D、frame順、offset / scale、対象colliderの手動またはfixture-localな再現を確認する。
- 通常viewportとChromium 375×667での補助表示確認は、fixture閲覧経路がある場合だけ行う。これは物理端末のrelease Gateを代替しない。
- engine version、fixture hash、manifest / sidecar hash、source hash、素材種別、受入ID、実行環境、console / import error、artifact参照を証拠へ記録する。
- docs/EXPORT_FORMATS.md、docs/ENGINE_INTEGRATION.md、docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.mdへ、実行した対象version・手順・既知制限を反映する。

### 3.2 対象外

- G19-C1〜C3の採用前にproduct code、target fixture、CI、dependencyを変更すること。
- asset.json、.casproj、schema、migration、IndexedDB、History、既存Atlas 0.1.0、legacy ZIP、Group 16 package入口を変更すること。
- Unity package、.meta、Prefab、Animator Controller、Godot plugin、.tscn、Resourceを製品出力として無検証生成すること。
- Chameleon独自atlasをUnity / Godot標準atlasと同一視すること。
- variable duration、event、polygon、frame別collider overrideなど、現行出力が表現できない情報を丸めて成功扱いにすること。
- Unityの成功をGodot、別version、別素材種別、別OS、別render pipelineへ推測すること。
- Godotの成功をUnity、別version、別素材種別、別rendererへ推測すること。
- 物理iPhone Safariの合格判定。これはGroup 21A / release Gateで扱う。

## 4. 人間判断が必要な選択

### G19-C1: 対象versionとfixture境界

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | UnityとGodotを別対象として扱い、実装開始前にそれぞれ具体的なversion（patchを含む固定値）を採用記録へ記す。各versionの最小fixtureを用意し、PNG / sheet / sidecar / import notesの手動取り込みと意味確認を行う。latest、major wildcard、別versionへの推測はしない。 | 再現性とverified範囲が明確になる。対象versionの実行環境を用意できない場合は実装を止める。 |
| B | Unity 6系、Godot 4系のようにmajor/minorだけを固定し、patchは可変とする。 | 環境ごとに挙動が変わり、同じartifactを再現しにくい。 |
| C | versionを固定せず、既存のimport notesと画像の目視確認だけを行う。 | 対象version付きverifiedを成立させられず、Group 19の目的を満たさない。 |

A案を採用しても、具体versionが採用記録・fixture・artifact・docsへ記載されるまで実装Gateは開かない。versionの追加や変更は既存証拠をcandidateへ戻す。

### G19-C2: engine別の受入証拠

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | UnityとGodotを別fixture・別検証・別artifactで実行する。両方で固定fixtureからの入力、画像読込、frame順、trim / offset、scale、origin / pivot、anchor、rect / circle、animation、import error 0、artifact欠落失敗を確認する。実行できないengineはverifiedにしない。 | engine・version・fixtureごとの範囲を説明できる。片方の失敗が他方を隠さない。 |
| B | import notesと出力ファイルのunit / schema確認だけを行い、対象engine上の取り込みを実行しない。 | 手順の存在は示せるが、実際のimport・座標・animationの失敗を検出できない。 |
| C | UnityとGodotを同じfixtureまたはGeneric Webの成功で代表させる。 | engine差・座標差・import差を隠すため、verifiedの根拠にならない。 |

### G19-C3: 出力・helper・互換性ラベルの境界

| 案 | 内容 | 影響 |
|---|---|---|
| **A（推奨）** | 製品の既存PNG / sheet / sidecar / import notesを正本とし、target fixture-localなadapterまたは手動手順だけを追加する。Unity / Godotの対象versionと実行した素材種別だけをverifiedへ昇格し、native project生成、helper/plugin/addonの採否はGroup 20以降または別ADRへ送る。 | 既存export・保存形式を守りながら、確認済み範囲だけを利用者へ示せる。 |
| B | import notesを更新するが、対象engineの実行証拠はcandidate / import-notesのままにする。 | 安全だが、Group 19のtarget runtime検証が完了しない。 |
| C | Unity package / Prefab、Godot plugin / Sceneなどを生成し、広い互換対応を表示する。 | 新しい形式、version差、helper API、dependencyの影響が発生し、今回の境界を越える。 |

## 5. 推奨採用範囲

~~~text
G19-C1 A + G19-C2 A + G19-C3 A
~~~

A案は、Group 18の対象version・fixture単位の証拠規則をUnity/Godotへ適用しながら、既存exportと保存正本を変更しない。具体的versionが固定できない場合や、対象engineでの取り込みを再現できない場合は、該当対象をimport-notesまたはcandidateに留める。

## 6. 採用後の実装handoff候補

### 6.1 変更候補

- 新規: Unity用のfixture data、実行確認用の最小fixture projectまたは手動import手順。製品exportのnative project生成ではない。
- 新規: Godot用のfixture data、実行確認用の最小fixture projectまたは手動import手順。製品exportのnative project生成ではない。
- 新規: Unity / Godotを混ぜない検証recordとengine別artifact。
- 更新候補: docs/EXPORT_FORMATS.md、docs/ENGINE_INTEGRATION.md、docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md、必要なGroup 19証拠docs。
- CIへ変更を加える場合は、対象engineを実際に実行でき、version・fixture・artifact欠落を失敗にできることを先に確認する。実行環境がないCIを成功扱いにしない。
- src/core/export/examples.ts、src/core/export/helpers.ts、package.json、package-lock.jsonは変更しない。helperが必要になった場合は別の人間判断へ戻す。

### 6.2 受入ID

| ID | 受入内容 |
|---|---|
| G19-VERSION-PIN | Unity / Godotの具体version（patch含む）がfixture・docs・artifactで一致し、可変URL・latest表記がない。 |
| G19-FIXTURE-SCOPE | UnityとGodotのfixture、source / output / manifest / sidecar hash、素材種別、期待結果が分離されている。 |
| G19-UNITY-IMPORT | Unity対象versionでsprite、sheet、pivot、animation、rect / circleの意味を確認し、import error 0を記録する。 |
| G19-GODOT-IMPORT | Godot対象versionでsprite、sheet、frame順、offset / scale、animation、rect / circleの意味を確認し、import error 0を記録する。 |
| G19-METADATA | trim / offset、scale、origin / pivot、anchor、animation順の確認結果が対象engineごとに追跡できる。 |
| G19-EVIDENCE | engine別のversion、hash、受入ID、実行環境、error、artifact参照を残し、欠落を成功にしない。 |
| G19-LABEL-SCOPE | 実行したengine・version・fixture・素材種別だけをverifiedとし、未確認をcandidate / import-notesへ戻す。 |
| G19-NO-REGRESSION | schema、migration、IndexedDB、.casproj、legacy ZIP、Atlas 0.1.0、既存helper、dependencyを変更しない。 |

## 7. 停止条件

- G19-C1〜C3採用前は、product code、fixture、CI、dependencyを変更しない。
- A案の具体versionが固定されていない、対象engineを再現できない、または実行環境のversionが証拠へ記録できない場合は停止する。
- Unity / Godotを同じfixture・同じartifactで済ませようとした場合は、engine別に分離するまで停止する。
- Chameleon独自atlasを対象engine標準形式と同一視する必要が出た場合は、理由付き未対応または別ADRへ戻す。
- 現行出力が表現できない情報を丸める、捨てる、黙って変換する必要が出た場合は、該当素材をunsupportedにする。
- helper/plugin/addon、native project生成、schema・保存形式・export ZIP変更が必要になった場合は、G19から外し別の契約判断へ戻す。
- CIでengine本体のimport、期待結果、artifact保存のどれかが失敗した場合は、同じDraft PRで修正し、成功表示を残さない。

## 8. 人間判断

次の形式で採用する。

~~~text
G19-C1 [A/B/C] + G19-C2 [A/B/C] + G19-C3 [A/B/C]
~~~

A案を採用する場合は、可能なら同じ回答または次の短い記録でUnity / Godotの具体version（patchを含む）も固定する。version未固定のまま実装PRを開始しない。Group 20（RPG Maker MZ / helper gate）はGroup 19の共通ラベルと証拠境界を前提に、別handoffと別判断で扱う。
