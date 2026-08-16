# Chameleon Asset Studio Group 19 implementation handoff

最終更新日: 2026-08-16  
対象リポジトリ: chameleonjp-lab/chameleonassetstudio  
正式work package: 2D-5-UNITY + 2D-5-GODOT  
基準main SHA: e68cc79c485b87b11989ceec4e416f90f2350e05  
文書種別: implementation handoff  
状態: accepted / implemented-candidate / CI-passed / independently-verified-static / merged / runtime-partial / runtime-verification-unverified

上位文書: docs/IMPLEMENTATION_PLAN.md, docs/future/2D_COMPLETION_ROADMAP.md  
共通契約: docs/future/2D_5_EVIDENCE_LABELS_PLAN.md  
関連文書: docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md, docs/ENGINE_INTEGRATION.md, docs/EXPORT_FORMATS.md, docs/future/2D_4_ENGINE_FIXTURE_EVIDENCE.md

> Group 18（証拠形式・互換性ラベル）はPR #248で実装・CI・独立確認・mergeまで完了した。2026-08-15に人間がG19-C1 A（Unity 6000.3.21f1 / Godot 4.7.1-stable）+ G19-C2 A + G19-C3 Aを採用し、PR #251（merge `e77a721ff3d479bea0f7475f0b0fbc296ce91595`）でcandidate fixture、静的closure test、import notesをmainへ反映した。続くPR #253（merge `e68cc79c485b87b11989ceec4e416f90f2350e05`）でGodot 4.7.1-stableのfixture runtime artifactを取得し、11受入確認を成功として記録した。Unityはmanual workflowとrunnerを用意したが、licensed実行とartifactは未完了である。したがってGodot単体の成功をGroup 19全体の`verified`へ広げず、既存export、保存正本、schema、helper APIは変更しない。

## 1. 現在確認できる事実

| 項目 | 確認結果 | Group 19への意味 |
|---|---|---|
| 最新main | e68cc79c485b87b11989ceec4e416f90f2350e05。PR #253（Godot runtime runner + Unity manual gate）のmerge commit。 | このruntime evidence closeoutの基準head。 |
| open Pull Request | 基準main確認時点（PR #254作成前）は0件。PR #253はmerge済みで、PR #254をruntime evidence closeoutとして1本維持する。 | 同一目的のcloseout PRを1本だけ維持する。 |
| Group 18 | PR #248 final head e3309d57f030e9190cb4c678e49301e4736332b5、merge 3ab844d28d155a438dc8f10f8f9b22099a40093a、CI Run #793成功、contract artifact取得済み。 | candidate / verified / import-notes / unsupportedの共通境界を再利用する。 |
| Group 18 closeout | PR #249 final head 9af46a710376279917f3c5d5cc86f42c3713a3a4、merge fcbf1cc9b7a1a9d0cdd588eaed59de3999bdcabb、CI Run #795成功（docs-only分類）。 | 完了数は18/27。Group 19 runtime Gateを継続する。 |
| 既存互換性表 | Godot 4.7.1-stableはfixture runtime artifactの11確認が成功したが、Unity artifact未取得のためGroup 19全体のラベルはcandidate / import-notesのまま。Unity 6000.3.21f1はruntime未実行。 | Godot単体の成功をUnityやGroup 19全体へ拡大しない。 |
| 既存engine docs | Godot / Unityのengine-local runner・import notesをPR #253で追加。Godot artifactは取得済み、Unityはmanual workflow未実行。 | 実行証拠をengine別に記録し、未確認はcandidateへ留める。 |
| 既存出力 | Chameleon独自のPNG / sheet / atlas / sidecarを出力する。Unity標準.meta、Prefab、Godot.tscn、Resourceそのものではない。 | 標準形式完全互換やnative project生成を推測しない。 |
| Group 19 runtime evidence | Godot workflow Run #9（Actions run `31913489237`、artifact `9254301539`）はstatus `passed`、importErrors 0、consoleErrors 0、11受入確認すべて成功。Unityのartifactはまだない。 | engine・version・fixture別の範囲を維持し、Group 20はUnity Gateまで開始しない。 |

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

- G19採用後の変更はengine-local fixture、静的contract test、import notes、docsに限定し、product export、schema、保存形式、helper、dependencyは変更しない。
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

採用記録でUnity 6000.3.21f1 / Godot 4.7.1-stableを固定した。versionの追加や変更は既存証拠をcandidateへ戻し、runtime Gateを再実施する。

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

- G19採用後の変更はengine-local fixture、静的contract test、import notes、docsに限定し、product export、schema、保存形式、helper、dependencyは変更しない。
- A案の具体versionが固定されていない、対象engineを再現できない、または実行環境のversionが証拠へ記録できない場合は停止する。
- Unity / Godotを同じfixture・同じartifactで済ませようとした場合は、engine別に分離するまで停止する。
- Chameleon独自atlasを対象engine標準形式と同一視する必要が出た場合は、理由付き未対応または別ADRへ戻す。
- 現行出力が表現できない情報を丸める、捨てる、黙って変換する必要が出た場合は、該当素材をunsupportedにする。
- helper/plugin/addon、native project生成、schema・保存形式・export ZIP変更が必要になった場合は、G19から外し別の契約判断へ戻す。
- CIでengine本体のimport、期待結果、artifact保存のどれかが失敗した場合は、同じDraft PRで修正し、成功表示を残さない。

## 8. 採用記録と実装状態

採用日: 2026-08-15

~~~text
G19-C1 A（Unity 6000.3.21f1 / Godot 4.7.1-stable）
+ G19-C2 A
+ G19-C3 A
~~~

契約状態は`accepted`、実装状態は`implemented-candidate / merged`、検証状態は`CI-passed / independently-verified-static / runtime-partial / runtime-verification-unverified`である。PR #251でcandidate fixture、静的closure test、import notesをmainへ反映し、PR #253でGodot 4.7.1-stableのfixture-only runtime artifactを追加した。Godot artifactは11受入確認、importErrors 0、consoleErrors 0で成功したが、Unity artifact未取得のため対象別ラベルとGroup 19全体は`candidate / import-notes`に留め、`verified`へ昇格しない。

次のGateは、Unity 6000.3.21f1のmanual workflowを実行して、Godotと分離されたruntime artifact、import error 0、metadata一致、artifact欠落失敗、固定headの独立確認を満たすことである。Unityのlicensed実行証拠がない現行mainでは、Group 20は開始しない。


## 9. Post-merge verification record

- PR #253の実装head `807808ba3128290c3397e30b27bdf9c85626e1c2`は、Godot runtime runner、Unity manual gate、engine-local fixture、contract runnerをmainへ反映し、merge `e68cc79c485b87b11989ceec4e416f90f2350e05`で完了した。PR #253のmain CI Run #823はclassify、build/lint/format/build/unit、Chromium E2E、Pagesの全job成功である。
- Godot 4.7.1-stableのworkflow Run #9（Actions run [`31913489237`](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/31913489237)）はsuccess。artifact [`9254301539`](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/31913489237/artifacts/9254301539)はstatus `passed`、`importErrors: 0`、`consoleErrors: 0`、textureLoaded / imageDecoded / frameRegions / frameOrder / trimContentOffset / animation / origin / anchor / scale / colliderMetadata / collidersの11確認がすべてtrueである。engine commitは`a13da4feb`、環境はLinux/headless、fixture hashは`sha256:56d58885ea593a3bae4271553b9ac19a8eb448870f85c42cf40f2efe6da99c15`、manifest hashは`sha256:19cb9bbd5951a44dd31385f7b3fbc4906a3e82569d87f663e90843145a759b08`である。
- Godotの成功はfixture-local・version-localの証拠であり、Unity、別version、別OS、native project生成、Group 19全体の`verified`を意味しない。
- Unity 6000.3.21f1はmanual workflowとrunnerをmainへ反映済みだが、licensed editorの実行とartifactは未完了である。Unity実行時にartifact取得・内容確認を満たすまで、UnityとGroup 19全体を`candidate / import-notes`から昇格しない。
- 本closeout PRはMarkdownのみを変更し、docs-only CIではclassify-changesが成功し、build-and-testとChromium E2Eはskipされる。固定head・ahead/behind・CI Runの最新値はPR本文に記録する。
- 固定head、変更3件、CI Run #828の結果を読み取り専用で確認した。これは静的な文書・契約確認であり、Unity runtime検証やGitHubの正式review submissionを意味しない。
