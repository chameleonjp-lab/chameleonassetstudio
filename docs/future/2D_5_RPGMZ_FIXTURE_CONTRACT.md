# Group 20 RPG Maker MZ fixture contract

最終更新日: 2026-08-26  
対象version: RPG Maker MZ 1.10.0  
契約: G20-C1 A + G20-C2 A + G20-C3 A  
状態: accepted / static-contract-ready / runtime-verification-unverified

## 1. 目的

RPG Maker MZへ画像を持ち込むとき、対象versionと素材種別を混ぜない。製品exportをRPG Maker MZのnative projectへ変換することも、pluginを製品へ追加することもしない。

公式のv1.10.0告知は、2026-02-02に公開された。実行環境が利用できないため、これは対象versionのpinであり、runtime成功の証拠ではない。

- [RPG Maker MZ v1.10.0 official notice](https://guild.rpgmakerofficial.com/t/topic/1136)
- [RPG Maker MZ Asset Standards](https://rpgmakerofficial.com/product/MZ_help-en/01_11_01.html)
- [RPG Maker MZ Side-view Character Standards](https://rpgmakerofficial.com/product/MZ_help-en/01_11_02.html)

## 2. Fixture scope

| fixture ID | MZ配置先 | 最低限固定する意味 | runtime状態 |
|---|---|---|---|
| rpgmz-characters-1.10.0 | img/characters | 4方向×3パターン。通常は1ファイルに8キャラクター分、$は1キャラクター1ファイル、!は6px上方向シフトを抑止。 | not-run |
| rpgmz-faces-1.10.0 | img/faces | 2行×4列の8画像。標準1画像144×144。 | not-run |
| rpgmz-tilesets-1.10.0 | img/tilesets | タイルの並び、透明、tileSize、配置先。tileSizeは入力fixtureのmanifestで固定し、公式仕様にない値を推測しない。 | not-run |
| rpgmz-sv-battlers-1.10.0 | img/sv_actors / img/sv_enemies | 9×6の54パターン。標準画像は576×384、3パターンを1モーションとして扱う。 | not-run |

fixture画像は、第三者の公式素材を無断で再配布せず、新規に作成した最小PNGまたは利用条件を確認した素材を使う。各fixtureは次を別々に保持する。

- source PNG hash
- output PNG hash
- manifest / import notes hash
- 配置先とファイル名
- 期待する並び・寸法
- 対象version、OS、実行日
- runtime結果、error、artifact参照

## 3. 受入条件

### G20-VERSION-PIN

- エディタに表示されるversionが1.10.0である。
- Steam / standaloneの別、OS、実行日、core scriptsの状態を記録する。
- versionが一致しない場合は、既存記録をcandidate / import-notesへ戻す。

### G20-FIXTURE-SCOPE

- 4種類のfixtureを混ぜず、各配置先と素材種別を独立して記録する。
- 公式仕様に記載がない寸法や変換規則を推測しない。
- $ / !のファイル名規則をcharacters fixtureの期待結果に含める。

### G20-IMPORT-EVIDENCE

PC等の実行環境が利用可能になった後、各fixtureをMZ 1.10.0へ取り込む。次をfixture別に記録する。

1. ファイルを所定の配置先へ置ける。
2. Resource Managerまたは対象画面から選択できる。
3. 並び、寸法、表示、$ / !の挙動が期待結果と一致する。
4. import / console errorが0である。
5. 実行環境、固定head、artifact、hashを記録する。

## 4. Label mapping

| 状態 | 意味 |
|---|---|
| candidate | 対象versionとfixture仕様は固定したが、MZ上の取り込みをまだ実行していない。 |
| import-notes | 人が行う配置・命名・確認手順を文書化したが、runtime証拠はない。 |
| verified | MZ 1.10.0、型別fixture、error 0、期待結果、artifact、hashを確認済み。 |
| unsupported | MZの範囲外、または現行出力で安全に表現できないもの。 |

現在のGroup 20はcandidate / import-notesであり、verifiedではない。

## 5. Helper Gate

G20-C3 Aにより、初回の正本は既存PNG / sheet / sidecarと手動import notesとする。

- RPG Maker MZ plugin / addonを製品へ追加しない。
- native project、database JSON、plugin parameter、event、mapを自動生成しない。
- fixture-localの補助スクリプトが必要になった場合も、製品helperとは分離する。
- 手動取り込みで再現できない意味が実証された場合だけ、別ADRで対象version、ライセンス、保守責任、手動代替を判断する。

## 6. PC未使用期間の扱い

PCが使えない間は、MZエディタの起動、runtime取り込み、スクリーンショット、artifact生成を行わない。静的な契約、import notes、受入IDの整理だけを進める。

したがって、Group 20の契約採用は完了しても、runtime検証は未完了である。Group 19のUnity未検証状態と、Group 20のMZ未検証状態を成功扱いにしない。
