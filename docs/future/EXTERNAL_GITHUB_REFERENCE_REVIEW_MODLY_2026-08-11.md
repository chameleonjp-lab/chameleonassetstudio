# 外部 GitHub 追加調査 — lightningpixel/modly

作成日: 2026-08-11  
対象: `chameleonjp-lab/chameleonassetstudio`  
状態: reference only / implementation not approved  
関連: `docs/future/EXTERNAL_GITHUB_REFERENCE_CATALOG.md`, `docs/future/3d/3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md`, `docs/future/3d/3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md`, `docs/future/3d/3D_ASSET_DATA_CONTRACT.md`, `docs/future/3d/3D_PERFORMANCE_DEVICE_SECURITY_LICENSE_SPEC.md`

## 1. 結論

[lightningpixel/modly](https://github.com/lightningpixel/modly) は、Chameleon Asset Studio（CAS）の 3D 版で、**外部の画像→3D 生成 provider と、その実行管理・成果物管理・修復 / 軽量化処理を設計するための重要な参考資料**になる。既存の外部 GitHub 参考資料カタログでは `3D-EXT-002` として登録済みであり、今回の再調査でも **A / HIGH を維持**する。

ただし、Modly 自体を CAS のブラウザ本体へ組み込む判断ではない。Electron、Python、GPU、モデル重みを使うデスクトップ処理であり、CAS の iPhone / iPad / browser 本体とは実行境界を分ける。

| 観点 | 評価 | 判断 |
|---|---|---|
| CAS 3D の外部生成・処理設計 | A / HIGH | provider 差し替え、workflow run、進捗・取消・再開、成果物、修復、最適化を分離する設計が CAS の外部 3D adapter 方針と近い。 |
| CAS の browser / iPhone 本体への直接組み込み | C / CONDITIONAL | Electron + Python + GPU 前提であり、CAS 本体の dependency としては採用しない。 |
| 将来の Extension Host / agent bridge | A 相当 | capability の明示、JSON-first の agent API、extension の隔離・復旧・path 制限が、将来の外部 connector 管理に強く参考になる。 |

既存カタログ ID は `3D-EXT-002` を正とし、重複 ID は追加しない。

調査時点で固定した upstream:

- `main`: `b771e29265887f52e714bdda232579e53ae29264`
- 最新公開 release: `v0.4.1`（2026-07-16 公開）
- `dev`: `148c6a760abad15c6b4bf55a2568a75b1549d60d`
- 2026-08-11 確認時点で `dev` は `main` より 5 commits 進んでいる。`dev` の extension hardening は開発方向の参考にはするが、安定版の採用根拠にはしない。

## 2. Repository の性格

Modly は、画像 1 枚から 3D mesh を生成するローカル AI デスクトップアプリである。画面側は Electron / React / Three.js、生成・処理側は Python / FastAPI を使い、GPU 上で動く model を extension として追加する構造になっている。

公式 README で確認できる主な extension は次のとおり。

- Hunyuan3D 2 Mini / Mini Turbo / Mini Fast
- TripoSG
- Trellis2 GGUF

重要なのは、特定の 1 model を CAS 相当の本体へ固定していない点である。`manifest.json` を持つ model / process extension を追加し、workflow の node として組み合わせる。基本 workflow は `Image → Generate Mesh → Add to Scene` で、mesh の smooth / decimate、GLB export などを後段処理として分離している。

さらに、GUI だけでなく agent / script 向けの CLI と local API を持ち、`health`、`model`、`workflow-run`、`capability`、`process-run` を canonical contract としている。最終結果を machine-readable JSON で返し、生成中の run を status / cancel で後から追跡できる。

## 3. CAS に有用な設計

### 3.1 生成 model と CAS 本体を分離する

CAS の既存 3D 計画は、Python / GPU / model weight を browser 本体へ入れず、外部生成 processor から GLB を受け取って通常の検品へ流す方針である。Modly は、この境界を実際のデスクトップアプリで分離した比較対象になる。

CAS で参照する点:

- CAS 本体は generator の model weight や Python runtime を抱えない。
- provider ごとに入力、options、出力、capability を明示し、provider 名から能力を推測しない。
- 生成結果は CAS の正本を直接上書きせず、新しい受領物 / derived variant として取り込む。
- provider 名、version、extension / model、固定 commit、入力 hash、出力 hash、実行設定を provenance に残す。
- provider が存在しない、停止している、更新に失敗している場合でも、CAS の既存 project と静的 asset は開ける状態を維持する。

### 3.2 workflow run を「画面の一時状態」にしない

Modly CLI は、生成を `workflow-run` として開始し、run ID を使って status / cancel を行う。`generate` の JSON には、再確認に使う status command と cancel command などの recovery metadata が含まれる。

CAS で参照する点:

- 外部生成 job に永続的な request ID / run ID を持たせる。
- UI の再読み込みや一時切断だけで「生成失敗」と判断しない。
- created → approved → running → succeeded / failed / cancelled の状態と、provider 側 run の状態を対応付ける。
- 途中で画面を閉じても、再接続後に status を取得し直せる契約にする。
- cancel が未対応の provider では、対応しているように見せず capability 不足として明示する。

これは CAS の既存 `3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md` 8.2 にある job 状態を具体化する参考になる。

### 3.3 capability と model を明示し、未対応は fail closed にする

Modly CLI は、明示した model ID を実際の model 一覧で検証する。`process-run` 等の canonical contract が存在しない場合は、推測で処理せず structured error を返す。

CAS で参照する点:

- provider 接続時に capability handshake を行う。
- `image-to-3d`、multi-view、cancel、resume、repair、remesh、simplify、texture、rig などを個別 capability として返す。
- provider 名、model 名、文字列の一部から「できるはず」と推測しない。
- 未知の capability、未知の output、未知の version は既定で無効にする。
- legacy / experimental 経路を canonical contract と混同しない。

これは将来の `Extension Host` と capability / permission enforcement を設計するときに再読する価値が高い。

### 3.4 修復・再メッシュ化・平滑化・軽量化を独立した derived 処理にする

Modly の workflow には、mesh exporter、optimizer、remesher、repair、smoother が分かれている。Mesh Repair は duplicate vertex / face、degenerate face、non-manifold edge、単純な boundary hole を対象にし、AI 生成由来の構造的な hole は後処理だけでは直せない場合があることも明示している。

CAS で参照する点:

- 「生成した」ことと「ゲーム用に適切」を分ける。
- 元の受領 mesh は保持し、repair / remesh / smooth / simplify の結果は derived variant として保存する。
- 各処理の parameter、処理前後の triangle / bounds / material / texture / validation 差を記録する。
- 自動 repair が完走しただけで成功扱いにせず、通常の検査と before / after の目視比較を再実行する。
- 穴埋め、非多様体修復、簡略化などで形状意味が変わる可能性を利用者へ隠さない。

CAS の `3D-CHK-GEO-003` / `3D-CHK-GEO-004`、簡略化、before / after comparison と特に相性がよい。

### 3.5 Asset Library / artifact registry で source と derived の関係を持つ

Modly の artifact registry は `Workflows` と `Exports` を明示的な root とし、GLB / glTF 等の asset を分類する。metadata から source、manifest、artifact ID、version ID、provenance を読み、linked path が危険または欠落している場合は無視して warning を残す。

CAS で参照する点:

- provider workspace の file と CAS の正本 Asset を同一視しない。
- source / derived / manifest / provenance を ID と安全な相対 path で関連付ける。
- directory 全体を暗黙走査して外部 file を Asset 化しない。
- `..`、absolute path、encoded escape などで project / workspace 外へ出る参照を拒否する。
- 外部 provider が返した path を、そのまま filesystem access 権限として信用しない。

### 3.6 extension の導入失敗から復旧できる構造

Modly の `main` には extension ID / path の検証、staging、backup、incomplete marker を使う導入保護がある。さらに 2026-08-11 時点の `dev` では model registration validation などの hardening が進んでいる。

CAS で参照する点:

- 将来の外部 provider / module 導入は staging area で準備する。
- manifest、ID、path、capability、必要 file を検査してから active にする。
- 更新途中で落ちた場合は incomplete として隔離し、以前の動作版へ戻せるようにする。
- 起動時に壊れた extension を黙って load せず、corrupted / incomplete として表示する。
- live process が残っている状態で runtime / environment を書き換えない。

ただし `dev` の設計は未 release のため、そのまま仕様化しない。CAS 側で採用するときは固定 release / commit で再評価する。

## 4. 既存 CAS 3D 仕様への接続

直接関係する既存範囲:

- `3D_INTEROP_VRM_VR_AND_CREATION_SPEC.md` 8 章: 外部画像→3D生成、adapter、job 状態、provenance
- `3D_IMPORT_INSPECTION_SETUP_EXPORT_SPEC.md`: GLB 取り込み、検査、修復後の再検査、export
- `3D_ASSET_DATA_CONTRACT.md`: source / derived / provenance / version の関係
- `3D_PERFORMANCE_DEVICE_SECURITY_LICENSE_SPEC.md`: iPhone / iPad / PC の役割分担、未信頼入力、path traversal、dependency / license の Gate
- `EXTERNAL_GITHUB_REFERENCE_CATALOG.md` の `3D-EXT-002`: Modly の正規カタログ項目

将来実装で特に再利用したい考え方は、次の 4 点に絞る。

1. external provider を CAS 本体から分離する。
2. run ID と capability を持つ明示的な agent / automation contract にする。
3. repair / optimize を source を壊さない derived workflow にする。
4. extension / provider の導入失敗を隔離し、復旧可能にする。

## 5. ライセンスと権利の注意

Modly の README は `MIT License` と記載している。一方、2026-08-11 に確認した root `LICENSE` は、標準的な MIT License 本文の後に、fork して独自 application を作る場合は元 project / creator を app UI または documentation で credit するよう求める追加文を含む。GitHub repository metadata の SPDX 表示も `NOASSERTION` である。

そのため CAS では、採用時に単純な「標準 MIT」とだけ記録しない。

- 設計資料として読むだけなら、現時点で Modly code を CAS へ含めない。
- code のコピー、派生、fork、同梱を検討する場合は、固定 commit の `LICENSE` 全文を再確認する。
- official / third-party extension の license は root repository と別に確認する。
- model weight の license、商用条件、地域条件、再配布条件は extension / model ごとに確認する。
- 入力画像、生成 GLB、外部 model の生成物に関する権利を root code license から推測しない。

本書は法的判断を確定する文書ではなく、採用時に確認を漏らさないための記録である。

## 6. CAS の browser / iPhone との境界

Modly の canonical agent API は、公式デスクトップアプリ起動中の `http://127.0.0.1:8765` を使う。これは同一端末内の local API であり、**iPhone の browser CAS から別 PC 上の Modly へ、そのまま接続できる契約ではない**。

したがって将来の接続を考える場合も、次を区別する。

- 同一 PC 上で CAS browser と Modly を併用する local connector
- iPhone / iPad の CAS から別端末の provider を使う remote bridge

後者には、Modly の loopback API を単純に LAN 公開する方法を採用しない。認証、利用者承認、origin、CSRF / request forgery、network exposure、通信暗号化、file transfer 上限、job owner、失敗時の取消を別途設計した bridge が必要になる。

CAS の iPhone / iPad では、生成モデルを端末内で動かすことより、入力準備、job の依頼、進捗確認、受領後の inspection、数値設定、書き出しを担当する方が既存方針と整合する。

## 7. Gate 後の評価条件

3D 実装 Gate 後に Modly を実接続候補として評価する場合は、最低でも次を行う。

1. upstream release / commit を固定し、root と使用 extension / model weight の license を個別確認する。
2. 代表 fixture を画像→3D生成し、run ID、status、cancel、失敗、再開、GLB export の証拠を残す。
3. 受領 GLB を CAS の通常 inspection に通し、生成物特有の geometry / UV / texture / scale / origin 問題を記録する。
4. repair / remesh / simplify を source と別 variant に実行し、before / after と検査差を比較する。
5. extension の破損、途中停止、invalid manifest、危険 path を用意し、他 Asset を壊さず隔離・復旧できるか確認する。
6. provider 側の RAM / VRAM / model download 容量と、CAS 側の PC / iPad / iPhone 表示性能を分けて測定する。

評価で合格しても、Modly 全体を CAS dependency にすることは自動承認しない。必要な contract と設計だけを CAS 用に狭く実装する方法を先に比較する。

## 8. 最終判断

- **設計参考として採用**: Yes — `A / HIGH` を維持する。
- **CAS browser 本体へ直接組み込み**: No。
- **Electron / Python / GPU stack の直接依存**: No。
- **Modly code の直接流用**: 現時点では No。必要になった時に license と保守範囲を再評価する。
- **将来の外部 image-to-3D provider / agent bridge / Extension Host の参考**: Yes。

CAS に最も重要なのは Modly の画面を再現することではない。**重い生成処理を外へ出したまま、provider の能力、job の状態、成果物、失敗、修復、provenance を CAS 側で安全に管理できる境界**を参考にすることである。
