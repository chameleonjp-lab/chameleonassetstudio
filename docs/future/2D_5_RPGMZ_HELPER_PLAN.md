# Chameleon Asset Studio Group 20 implementation handoff

最終更新日: 2026-08-26  
対象リポジトリ: chameleonjp-lab/chameleonassetstudio  
正式work package: 2D-5-RPGMZ + 2D-5-HELPER-GATE  
基準main SHA: ea76ba1305787f322053f10101e0367a136ee802  
文書種別: implementation handoff / accepted decision record  
状態: accepted / implemented-candidate / CI-passed / independently-verified-static / merged / runtime-verification-unverified

上位文書: docs/IMPLEMENTATION_PLAN.md, docs/future/2D_COMPLETION_ROADMAP.md  
関連文書: docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md, docs/ENGINE_INTEGRATION.md, docs/EXPORT_FORMATS.md, docs/future/2D_5_EVIDENCE_LABELS_PLAN.md  
前段: docs/future/2D_5_UNITY_GODOT_PLAN.md

> ユーザーは `G20-C1 A + G20-C2 A + G20-C3 A` を採用した。PCが使用できないため、Group 20は対象version・型別fixture・手動取り込み手順を先に固定し、RPG Maker MZ runtimeは未実行のまま保持する。Unity runtimeのスキップとGroup 19の未検証状態も変更しない。

## 1. 今回の開始条件と境界

### 1.1 確認済み事実

- mainはPR #259のmerge commit `ea76ba1305787f322053f10101e0367a136ee802`。
- Godot 4.7.1-stableのfixture-local runtime artifactは成功済みである。
- Unity 6000.3.21f1はlicensed editorの実行結果とruntime artifactが未取得である。
- Unity runtimeは、PCが使用できないという人間判断により、当面スキップする。
- Group 19の進捗は18/27のままとし、UnityまたはGroup 19全体を`verified`へ昇格しない。
- Group 20は、ユーザーが `G20-C1 A + G20-C2 A + G20-C3 A` を採用した。RPG Maker MZの実行確認、artifact取得、`verified`昇格はPC等の実行環境が用意されるまで行わない。

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

G20-C1 Aの対象versionは、公式告知で2026-02-02に配信された `RPG Maker MZ v1.10.0` として固定する。これは実行環境で確認した結果ではなく、公式に公開された現行versionを先に固定した値である。runtime実行時には、エディタ表示、OS、Steam / standalone、core scriptsの状態を記録し、1.10.0と一致しない場合は自動的に`candidate / import-notes`へ戻す。根拠: [RPG Maker MZ v1.10.0 official notice](https://guild.rpgmakerofficial.com/t/topic/1136)。

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

## 6. 採用記録

採用日: 2026-08-26

~~~text
G20-C1 A（RPG Maker MZ 1.10.0）
+ G20-C2 A
+ G20-C3 A
~~~

### 6.1 採用した内容

- G20-C1 A: RPG Maker MZ 1.10.0を対象versionとして固定し、characters / faces / tilesets / side-view battlersを型別fixtureに分ける。
- G20-C2 A: 型別fixture、配置先、ファイル名、並び、寸法、表示結果、error、hash、runtime artifactを別々に記録する。PCが使えない間はstatic contractとimport notesまでを実装し、runtime evidenceは未取得のままにする。
- G20-C3 A: 既存PNG / sheet / sidecarと手動import notesを正本とし、製品helper、addon、plugin、native project生成は追加しない。必要性が実証された場合だけ、別ADRと人間判断へ戻す。

### 6.2 現在の状態

- 契約: `accepted`
- docs / static contract: `implemented-candidate / CI-passed / independently-verified-static`
- RPG Maker MZ runtime: `not-run`
- ラベル: `candidate / import-notes`
- `verified`昇格条件: 1.10.0の実行環境、型別fixtureの取り込み、error 0、証拠artifact、固定head確認

RPG Maker MZのruntime未実行は失敗ではなく、PCが使えないという明示的な環境制約による保留である。ただし、未実行を成功扱いにはしない。

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

1. G20-C1〜C3のaccepted記録と、RPG Maker MZ 1.10.0の対象version pinを維持する。
2. PC等の実行環境が利用可能になった場合だけ、型別fixtureのruntime取り込みとartifact取得を行う。
3. runtime未実行のまま、Group 19のUnity状態とGroup 20のMZ状態を`verified`へ昇格しない。

RPG Maker MZ 1.10.0は、契約とimport notesを固定したため`candidate / import-notes`とする。runtime証拠がない状態で`verified`へ昇格しない。MV / Tiled / Construct / Blenderは既存の`unsupported`境界を維持する。
