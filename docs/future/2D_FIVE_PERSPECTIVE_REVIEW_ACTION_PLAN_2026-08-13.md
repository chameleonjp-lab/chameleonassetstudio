# Chameleon Asset Studio 五視点レビュー統合アクション計画

最終更新日: 2026-08-14  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
五視点レビュー統合基準main SHA: `ea7f3964cf7f267622c23d386d8c59cacc4d117c`  
文書種別: docs-only 横断レビュー統合・後続work package割当  
状態: `review-integrated / G16 merged / G17 accepted / implementation in progress / remaining proposals pending`

上位文書: `docs/IMPLEMENTATION_PLAN.md`, `docs/future/2D_COMPLETION_ROADMAP.md`  
現在の契約正本: `docs/future/2D_4_PIXIJS_PHASER_PLAN.md`  
関連文書: `docs/future/2D_COMPLETE_PRODUCT_SPEC.md`, `docs/future/2D_EXPORT_COMPATIBILITY_MATRIX.md`, `docs/future/2D_DEVICE_RELIABILITY_SPEC.md`, `docs/TEST_PLAN.md`, `docs/future/2D_4_PACKAGE_PREFLIGHT_GENERIC_WEB_PLAN.md`

> この文書は、2026-08-13に行った五視点レビューを既存の2D完成ロードマップへ割り当てる。五視点レビューのGroup 17〜23提案は引き続きproposal-onlyである。一方、Group 16の`G16-C1 A + G16-C2 A + G16-C3 A`はユーザーが2026-08-13に採用し、このDraft PRの実装契約へ同期した。後続UI・構造整理の具体契約は各work packageで別途採用する。

---

## 1. GitHubで確認した現在状態

| 項目 | 状態 |
|---|---|
| 最新main | `ea7f3964cf7f267622c23d386d8c59cacc4d117c`。PR #245のmerge commit。 |
| open Pull Request | 基準main `ea7f3964cf7f267622c23d386d8c59cacc4d117c`時点ではopen PR 0件。 |
| 完了数 | 17/27。今回のdocs-only統合では変更しない。 |
| Group 16 docs-only監査 | PR #240でmainへ反映済み。 |
| Group 16契約 | `accepted`。ユーザーが`G16-C1 A + G16-C2 A + G16-C3 A`を2026-08-13に採用。 |
| Group 16製品実装 | `implemented / CI-passed / independently-verified / merged`（PR #242 final head `6616ad30fdae7a05f98e0a0146ce69555bab1bfa`、merge `711bcec268d6e732a24c0c787c6054b41e415c27`、CI Run #765）。 |
| Group 17契約 | Gate A（PR #243 / #244 / #245のdocs反映）完了。2026-08-14に`G17-C1 A + G17-C2 A + G17-C3 A`をacceptedし、契約状態は`accepted`、product implementationは進行中。正本は`docs/future/2D_4_PIXIJS_PHASER_PLAN.md`。 |
| 次の許可された行動 | G17-C1〜C3の人間採用を待つ。採用後に単一writerで新しいDraft PRを作り、採用範囲だけを実装する。 |

PR #240のmergeはGroup 16監査のGate A、2026-08-13のユーザー明示判断`G16-C1 A + G16-C2 A + G16-C3 A`はGate Bであり、PR #242で実装・CI・固定head確認・mergeまで完了した。Group 17はPR #243 / #244 / #245のmain反映でGate Aを完了し、2026-08-14の`G17-C1 A + G17-C2 A + G17-C3 A`でGate Bを完了した。product implementationは進行中である。

---

## 2. 五視点で一致した中心課題

個別機能は、素材の作成・取り込み、非破壊編集、Animation、origin、anchor、collider、ゲーム風確認、保存・復旧、複数形式の書き出しまで広く揃っている。

最大の課題は、初見利用者が一つの成果を得る流れが、製品上の一続きの体験としてまだ閉じていないことである。今後は機能数より、次の初回成功ループを優先する。

```text
素材を1つ作る、または取り込む
→ ゲーム用情報を付ける
→ 問題を検査し、直す場所を理解する
→ Generic Web packageを書き出す
→ ブラウザで見え方と動きを確認する
→ .casprojを別sessionで開き直す
→ 同じ意味の出力を再生成する
```

クリエイター視点では、これを「作る → 画面の中で生きる → 動かして反応を見る → 直してもう一度試す」という短い循環として見せる。新しいゲーム機能を増やすのではなく、既存のGame Check、Animation、game data、Generic Web fixtureを利用者が理解できる順でつなぐ。

---

## 3. 視点別の結論

| 視点 | 強み | 中心課題 | 計画への反映 |
|---|---|---|---|
| プロダクトマネージャー | 制作から保存・検査・書き出しまでの完成像と基盤がある。 | 初回成功の流れが閉じていない。 | Group 16後、Group 21A・21Bを並行開始し、Group 22で全体を証明する。Generic Web成立前に対象を広げない。 |
| クリエイター | 作成、動き、ゲーム用情報、Game Checkを組み合わせられる。 | 「作った素材が生きる」瞬間が一続きになっていない。 | Group 22の代表projectと説明で、作成・試行・修正・再試行を完成させる。 |
| デザイナー | 非破壊で後から直せる安全な基盤がある。 | 最初の一歩、現在地、次の一手を自力で解釈する必要がある。 | Group 21Aで必須操作を先に示し、詳細設定は必要時だけ開く。問題から修正場所へ戻れるようにする。 |
| シニアエンジニア | データ、保存、テスト、変更管理は強く、全面改修は不要。 | `EditorScreen.tsx`が184,599 bytes・約5,000行で責務が集中している。 | Group 21Cの基準計測・分離準備は既存ロードマップどおり継続並行し、責務分離の本実装はGroup 16・17の完了後に、挙動を変えず段階実施する。 |
| 敵対的視点 | 理由付き拒否、非破壊検査、固定head reviewがある。 | unsafe path、名前衝突、秘密情報、誤った`verified`、二重download、古い検査結果、壊れたpackage、小画面停止を潰す必要がある。 | Group 16、18、21A〜21C、22へ停止条件と証拠を分配する。 |

---

## 4. レビュー提案と既存Groupの対応

レビュー中の短い候補名は、新しい工程数を確定する名称ではない。既存Groupへ次のように割り当て、27工程の分母とGroup 16〜23の順序を維持する。

| レビュー上の候補 | 正式な置き場所 | 内容 |
|---|---|---|
| `2D-4-PACKAGE-CONTRACT` | Group 16 | package入口、sidecar、README、import notes、verification record、互換境界。 |
| `2D-4-PREVIEW-VERIFY` | Group 16と18 | Generic Web固有の証拠と、全対象共通の`candidate` / `verified`規律。 |
| `2D-4-ENGINE-VERIFY` | Group 17、19、20 | PixiJS、Phaser、Unity、Godot、RPG Maker MZの個別検証。 |
| `2D-4-DISTRIBUTION-UI` | Group 21A | Group 16完了後に並行開始し、preflightからdownload完了までを製品でつなぐ。 |
| `2D-4-FIRST-SUCCESS-GATE` | Group 21A、21B、22 | 小画面、保存・再開、代表projectを横断した初回成功の証明。 |
| `2D-4-CREATOR-FLOW` | Group 22 | 代表project、説明、Game Checkと実行fixtureを使った試行の循環。 |
| `2D-4-RELEASE-GATE` | Group 21A〜21C、22、23 | 端末、復旧、性能、アクセシビリティ、安全性、最終証拠、人間承認。 |

3D、WebGPU必須化、SaaS、課金、外部アカウント連携、新しい大規模生成機能は、2D Pro Gate後または別の人間判断へ送る。Generic Webの合格から他engineの互換を推測しない。

---

## 5. Group 16採用契約と実装範囲

正式範囲は`2D-4-PACKAGE + 2D-4-PREFLIGHT + 2D-4-GENERIC-WEB`のままとする。`G16-C1 A + G16-C2 A + G16-C3 A`を採用済みであり、以下を実装handoffへ反映する。

### 5.1 packageとpreflight

- 絶対path、`../`、Windows drive、UNC、URL scheme、制御文字、逆向き区切りを拒否し、自動修正しない。
- 完全一致、ASCII大小文字、Unicode NFC同値で衝突するentry名・Frame名を、黙って上書き・再採番せず`block`にする。
- 参照切れ、非有限値、既存形式で表現できないlossがある場合、Blob読込、decode、canvas、ZIP、downloadを開始しない。
- preflightは正本を変更せず、自動修復、dedup、丸め、秘密値の自動マスクを行わない。
- 秘密情報らしい値は対象pathだけを示して`block`にし、値を画面、log、artifact、packageへ複製しない。
- preflight後に入力または設定が変わった場合、古い合格結果を使って生成しない。
- ZIP生成後かつdownload前に全JSON、全参照、entry hash、画像寸法、複数pageを再確認し、失敗時のdownloadを0件にする。
- 同じ入力と設定から、問題code・順序、canonical JSON、entry順、各entryの意味が安定する。PNGは同一環境でpixel一致を証拠にする。

### 5.2 検証記録と決定性

`verification/record.json`へ実行日時やbrowserの細かな実行情報を直接入れると、同じ入力から作るpackageが毎回変わり得る。推奨案Aのhandoffでは次を固定する。

- package内の安定した記録は、対象profile、source commit、fixture hash、manifest hash、証拠参照だけを持つ。
- browser version、実行日時、console error、download数など動的なCI情報はartifactへ分離する。
- package本体の整合情報は、全entryの`path / byteLength / SHA-256`を安定順で記録する。
- package本体のhash範囲と、動的な検証証拠のhash範囲を分けて説明する。

### 5.3 Generic Web証拠

- HTTP経由でpackage入口、manifest、sidecar、画像、複数pageを読み込む。
- frame、trim offset、scale、origin、anchor、rect / circle、Animation順がCanvas 2D表示と一致する。
- `verified`はprofile、browserとversion、fixture、対象機能、期待結果を記録した範囲だけに使う。
- 404、console error、読込失敗、欠落entry、hash不一致があれば`verified`にしない。
- 通常viewportと`375×667`で確認する。ただし、製品distribution UIや物理iPhone Safariの合格を意味しない。

### 5.4 Group 16証拠

- unit、E2E、CI artifactが同じhead SHAを対象にする。
- 高速二重操作でも生成とdownloadは各1回。失敗時は完了表示を出さず、busyを解除し、再試行できる。
- Blob URLの生成数と解放数を一致させる。
- 既存Atlas `0.1.0`、legacy ZIP、helper API、理由付き拒否を変えない。
- skip、flaky、retry、artifact欠落を合格にせず、固定head確認で`BLOCKER 0 / MUST 0`にする。

---

## 6. Group 17〜23へ送る内容

### 6.1 Group 17〜20

- Group 17はPixiJS、Phaser、関連docsを、Generic Webと別fixture・別versionで確認する。
- Group 18は`verified`、`candidate`、`import-notes`、`unsupported`の意味と必要証拠を統一する。
- Group 19・20はUnity、Godot、RPG Maker MZを一つずつ検証する。
- 外部向け設定をEditorへ増やす前に、Group 21Cの責務分離準備と影響を確認する。

### 6.2 Group 21A: distribution製品UI

- Group 16完了後に並行開始する。profile、scale、検査、生成に必要な項目を優先し、詳細設定は必要時に開く。
- 現在地、未完了の必須項目、次の操作を同じ導線で示す。
- `block`と`warning`を区別し、各問題から対象Asset・Frame・設定と修正場所を特定できる。
- 検査中、生成中、成功、失敗、取消後を区別し、失敗後に再試行できる。
- 連打、Enter後のclick、画面回転、復帰で二重commit・二重downloadを起こさない。
- `375×667`で横overflowなし、長い問題一覧を内部scroll可能、主要操作44px以上、入力16px以上を確認する。
- 物理iPhone Safariではsafe area、software keyboard、Safari下部バー、Filesへのdownloadをリリース前に確認する。

### 6.3 Group 21B: 保存・復旧・再生成

- 失敗やpage reload後も、編集用正本と最後に確認できた保存状態を失わない。
- `.casproj`を書き出し、保存領域を空にした別sessionで開き直し、同じ意味のmanifest、画像、game dataを再生成する。
- 壊れた、古い、参照切れのpackageや`.casproj`を部分成功として正本へ混ぜない。
- offline、更新、容量不足、download失敗からの復帰手順を記録する。

### 6.4 Group 21C: 性能・安全性・責務分離

`EditorScreen.tsx`は全面的に書き直さず、既存挙動とtestを維持して、次の境界を一つずつ専用関数またはReact hookへ移す。

1. Project load、save、autosave、保存競合。
2. 画像import、編集、History、Undo / Redo。
3. Variant、派生Asset、一括変更。
4. Frame、Animation、game data、preview接続。

新しい状態管理libraryは、この分離だけを理由に追加しない。各分離は1目的のPRとし、保存、History、`.casproj`、export、375×667の回帰を弱めない。schema、version、migration、IndexedDB配置、保存形式を変える必要が出た場合は停止する。

Group 12から延期したB2の性能budget、warning、hard cap、採用上限product-path実測もGroup 21Cで扱う。平均だけで合格にしない。

### 6.5 Group 22: 代表projectと初回成功

代表projectは、少なくともFrame、Animation、origin、anchor、rectまたはcircle collider、scale、複数pageの対象範囲を含み、次を証明する。

1. 素材を作る、または取り込む。
2. ゲーム用情報を付ける。
3. Game Checkで見え方と動きを確認する。
4. preflightの問題を理解し、修正する。
5. Generic Web packageを書き出す。
6. HTTP fixtureで結果を確認する。
7. `.casproj`を別sessionで開き直す。
8. 同じ意味の出力を再生成する。

利用者向け説明は、目的、現在地、次の操作、成功結果、既知制限の順で示す。source codeや開発者ツールを使わずに完了できることを、E2Eと初見確認の両方で記録する。初見確認の人数や合格基準は、実施前に別途固定する。

### 6.6 Group 23

- Group 16〜22の証拠が同じ対象versionと正本に対応する。
- `BLOCKER 0 / MUST 0`とし、残るSHOULD / NOTEと受容した危険を記録する。
- 物理端末と対象別fixtureの未確認を、自動テスト成功で置き換えない。
- 人間が承認するまで3D本実装へ進まない。

---

## 7. 敵対的検証の停止条件

| ID | 重大度 | 失敗条件 | 工程 |
|---|---|---|---|
| ADV-PATH | BLOCKER | unsafe path、名前衝突、参照切れを含むpackageを生成・上書きする。 | Group 16 |
| ADV-SECRET | BLOCKER | 秘密値を画面、log、artifact、packageへ複製する。 | Group 16 / 21C |
| ADV-LOSS | BLOCKER | `block`があるのにBlob、decode、canvas、ZIP、downloadを開始する。 | Group 16 |
| ADV-VERIFY | BLOCKER | 未確認のbrowser、version、機能、engineを`verified`と表示する。 | Group 16 / 18 |
| ADV-DETERMINISM | BLOCKER | 動的な検証記録により、再現対象packageのhash境界を説明できない。 | Group 16 |
| ADV-STALE | MUST | 入力変更後に古いpreflight合格を使う。 | Group 16 |
| ADV-DOUBLE | MUST | 連打や復帰で二重commit、二重生成、二重downloadが起きる。 | Group 16 / 21A |
| ADV-FAILURE | MUST | 失敗後も成功表示が残る、再試行できない、編集正本を失う。 | Group 21A / 21B |
| ADV-MOBILE | MUST | `375×667`で修正箇所、確定・取消、downloadへ到達できない。 | Group 21A |
| ADV-ROUNDTRIP | MUST | `.casproj`再読込後に、意味の同じ出力を再生成できない。 | Group 21B / 22 |
| ADV-PERF | MUST | 採用上限で停止、極端な遅延、保存・書き出し失敗が起きる。 | Group 21C |

---

## 8. 完了条件

- 代表projectで初回成功ループを最初から最後まで実行できる。
- 自動testは利用者に見える最終状態、download数、再読込後の結果を確認する。
- 初回操作と詳細設定が分かれ、現在地と次の操作が分かる。
- Game Checkとfixtureはread-onlyで、保存データ、History、exportを変えない。
- 問題表示は理由、対象path、修正場所、再実行方法を示し、秘密値を示さない。
- Chromium `375×667`を、物理iPhone Safariの代わりにしない。
- Generic Webの成功を、他engineや未確認versionの成功にしない。
- code、tests、docs、CI、独立確認、実機、人間判断の状態が一致する。

---

## 9. 人間判断と次の行動

Group 16の採用・実装・mergeは完了した。現在はGroup 17の契約候補について人間判断を待つ。

```text
G16-C1 A + G16-C2 A + G16-C3 A
```

Group 16はこの採用範囲でproduct code、unit、E2E、CI workflowを実装し、final head `6616ad30fdae7a05f98e0a0146ce69555bab1bfa`のCI Run #765と固定head確認を経てPR #242をmergeした。Group 17はPR #243とPR #244でdocs-only handoffとmerge後closeoutをmainへ反映済みだが、G17-C1〜C3の採用判断までproduct code、fixture、CIを変更しない。

G17-C1〜C3の採用後、単一writerが新しいbranchとDraft Pull RequestでGroup 17のfixture、E2E、証拠、docsを実装する。CI失敗と`BLOCKER` / `MUST`修正は同じbranchと同じPull Requestで行う。採用前のproduct code、fixture、CIは変更せず、Ready化とmergeは人間が判断する。
