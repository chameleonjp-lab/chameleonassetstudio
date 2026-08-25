# Chameleon Asset Studio Group 20 implementation handoff

最終更新日: 2026-08-26  
対象リポジトリ: chameleonjp-lab/chameleonassetstudio  
正式work package: 2D-5-RPGMZ + 2D-5-HELPER-GATE  
基準main SHA: 27c4cc25f0997cced943e31673d313b3b4b5c8ac  
文書種別: implementation handoff / decision proposal  
状態: proposal / docs-only / runtime-pending / human-decision-pending

上位文書: docs/IMPLEMENTATION_PLAN.md, docs/future/2D_COMPLETION_ROADMAP.md  
関連文書: docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md, docs/ENGINE_INTEGRATION.md, docs/EXPORT_FORMATS.md, docs/future/2D_5_EVIDENCE_LABELS_PLAN.md  
前段: docs/future/2D_5_UNITY_GODOT_PLAN.md

> このhandoffはGroup 19のUnity runtimeを成功扱いに変更しない。PCが使用できないという人間判断により、Unity runtime実行はスキップし、Group 19をruntime-partial / runtime-verification-unverifiedのまま保持したうえで、PC不要のGroup 20 docs-only準備を開始する。

## 1. 今回の開始条件と境界

### 1.1 確認済み事実

- mainはPR #258のmerge commit `27c4cc25f0997cced943e31673d313b3b4b5c8ac`。
- Godot 4.7.1-stableのfixture-local runtime artifactは成功済みである。
- Unity 6000.3.21f1はlicensed editorの実行結果とruntime artifactが未取得である。
- Unity runtimeは、PCが使用できないという人間判断により、当面スキップする。
- Group 19の進捗は18/27のままとし、UnityまたはGroup 19全体を`verified`へ昇格しない。
- Group 20は、ユーザーの明示的なスキップ判断を例外として、docs-onlyのhandoffと選択肢整理を開始する。RPG Maker MZの実行確認、artifact取得、`verified`昇格はPC等の実行環境が用意されるまで行わない。

### 1.2 今回変更してはいけないもの

- 製品export、既存PNG / sheet / sidecarの意味、`asset.json`、`.casproj`、schema、migration、legacy ZIP。
- 既存helper API、package.json、package-lock.json、依存関係。
- RPG Maker MZのnative project、plugin、addon、プロジェクト自動生成。
- 実行していないRPG Maker MZ version、素材種別、OS、手順を`verified`として表示すること。
- RPG Maker MZの公式素材・第三者素材をfixtureへ無断再配布すること。fixtureは新規の最小PNGまたは権利を確認した素材を使う。

## 2. RPG Maker MZで固定すべき事実

公式ヘルプでは、画像素材はPNGで、素材種別ごとに配置先・ファイル名・並び・寸法規則が異なる。たとえば、map characterは4方向×3パターンの12パターン、`$`接頭辞は1キャラクター1ファイル、`!`接頭辞は6px上方向シフトを抑止する。faceは2行×4列の8画像（1画像144×144）、side-view characterは9×6の54パターン（標準576×384）である。

- [RPG Maker MZ Asset Standards](https://rpgmakerofficial.com/product/MZ_help-en/01_11_01.html)
- [RPG Maker MZ Side-view Character Standards](https://rpgmakerofficial.com/product/MZ_help-en/01_11_02.html)

これらは形式・配置の設計根拠であり、対象version上の実際の読み込み成功を意味しない。

## 3. G20-C1: 対象versionとfixture境界

| 案 | 内容 | 判定 |
|---|---|---|
| **A（推奨）** | RPG Maker MZの実行環境で、製品の正確なversion文字列（patchを含む）を記録する。characters / faces / tilesets / side-view battlersなどを型別fixtureに分け、対象version・fixture hash・配置先を固定する。 | 再現性とラベル境界が最も明確。 |
| B | RPG Maker MZ 1.xなどmajorだけを固定し、patchは可変とする。 | 環境差を隠すため、`verified`の根拠が弱い。 |
| C | versionを固定せず、公式仕様とPNGの配置説明だけを作る。 | docs-onlyの候補資料にはなるが、runtime `verified`にはならない。 |

現時点では具体versionを推測しない。Steam / standalone、OS、更新状態を含む実行環境が利用可能になった時点で、Aの固定値を人間判断として記録する。

## 4. G20-C2: engine別受入証拠

| 案 | 内容 | 判定 |
|---|---|---|
| **A（推奨）** | 対象versionへ、characters、faces、tilesets、side-view battlersの最小fixtureを別々に取り込む。配置先、ファイル名、並び、寸法、表示結果、console / import error、fixture hash、実行環境を記録する。 | 型別の失敗を隠さず、対象version付き`verified`を成立させられる。 |
| B | 画像と配置説明の目視確認、スクリーンショット、手順記録だけを残す。 | `candidate / import-notes`の証拠にはなるが、runtime `verified`ではない。 |
| C | Generic PNGまたは既存Unity / Godot fixtureでRPG Maker MZを代表させる。 | engine固有の配置・命名・並びを確認できないため不採用。 |

PCが利用できない間は、Cを実行済み扱いにせず、docs-onlyでAの受入IDとfixture仕様だけを準備する。

## 5. G20-C3: helper / addon / plugin Gate

| 案 | 内容 | 判定 |
|---|---|---|
| **A（推奨）** | まず既存PNG / sheet / sidecarとimport notesの手動取り込みを正本とする。手動で安全に再現できる範囲では、製品helper、addon、plugin、native project生成を追加しない。 | 既存exportと保存正本を守り、依存関係・保守負担を増やさない。 |
| B | 製品外のfixture-local変換スクリプトだけを、別ディレクトリ・別記録で検討する。 | 手動取り込みの不足が実証された場合だけ、別ADRで再検討できる。 |
| C | RPG Maker MZ plugin / addon、native project生成、製品helper APIを追加する。 | schema・依存関係・配布境界を変えるため、G20-C3の初回実装には採用しない。 |

plugin / addonを使う必要が出た場合は、対象version、権利・ライセンス、入力・出力、保守責任、失敗時の手動代替をADRで先に固定する。人間判断なしに製品へ追加しない。

## 6. 推奨案と未決定事項

現時点の推奨は次の組み合わせである。

~~~text
G20-C1 A + G20-C2 A + G20-C3 A
~~~

ただし、これは「推奨」であり、accepted記録ではない。次の2点を人間判断として確定するまで、Group 20はproposal / runtime-pendingに留める。

1. RPG Maker MZの正確な対象version（patchを含む）。
2. `G20-C1 A + G20-C2 A + G20-C3 A`を採用するか、各Cの別案を採用するか。

## 7. 受入ID

| ID | 受入内容 |
|---|---|
| G20-VERSION-PIN | 正確なMZ version、OS、実行日、fixture manifestで値が一致する。 |
| G20-FIXTURE-SCOPE | characters / faces / tilesets / side-view battlersの対象・対象外が型別に記録される。 |
| G20-PNG-CONTRACT | PNG、配置先、ファイル名、並び、寸法、`$` / `!`の意味をfixtureと手順に記録する。 |
| G20-IMPORT-EVIDENCE | 対象version上の取り込み結果、表示、並び、error 0、artifactを記録する。 |
| G20-LABEL-SCOPE | 実行したversion・素材種別だけを`verified`、未実行を`candidate / import-notes`、現在の対象外を`unsupported`とする。 |
| G20-HELPER-GATE | helper / addon / pluginの採否をADRなしに変更しない。 |
| G20-NO-REGRESSION | schema、migration、.casproj、legacy ZIP、既存helper、dependenciesを変更しない。 |

## 8. 停止条件

- 正確なMZ versionまたは実行環境が記録できない。
- PCが使えない状態でruntime実行やartifact生成を試みる。
- Generic Web、Godot、Unityの結果をRPG Maker MZの成功に読み替える。
- 公式仕様だけで対象version付き`verified`を宣言する。
- plugin / addon / native project生成を、ADRと人間判断なしに製品へ追加する。
- PNG以外や、対応できない可変時間・event・polygonなどを黙って変換する。

## 9. 次の許可された作業

1. このhandoffをdocs-only PRとしてmainへ提案する。
2. ユーザーが対象versionとG20-C1〜C3を確定した後、PC等の実行環境が利用可能な場合だけfixtureとruntime evidenceを実装する。
3. runtime未実行のまま、Group 19のUnity状態とGroup 20のMZ状態を`verified`へ昇格しない。

RPG Maker / Tiled / Construct / Blenderの現行compatibility matrixラベルは、実行証拠がないため引き続き`unsupported`または`candidate / import-notes`の既存境界に従う。
