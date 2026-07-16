# 2D-2-PROJECT + 2D-2-CREATE 後続slice 契約監査

作成日: 2026-07-16
状態: `contract audit / human decision pending`
正式work package: `2D-2-PROJECT + 2D-2-CREATE`
基準main: `500397ac7d04b23ac88cd17a6e79843c8405a557`（PR #97 merge）
直前work package: `2D-3-TYPE-PROFILES + 2D-3-INSPECT` completed

## 1. 目的

accepted `C`で保留した`2D-2-CREATE`の残りから、現行0.1.0のschema、保存形式、export形式を変えずに安全に進められる次のsliceを固定する。

今回の監査対象は次の4点である。

- 矩形presetと自由な幅・高さ
- 現行6種の明示的な作成template
- パーツから開始する作成flow
- 図形・文字を最初の要素として置く入口

Family / Variantはaccepted `C`の境界どおり、別のschema契約まで保留する。

## 2. 直前work packageの完了

`2D-3-TYPE-PROFILES + 2D-3-INSPECT`は、契約PR #96と実装PR #97で完了した。

- 採用判断: `A+B+X`
- 実装head: `3e237e3186317095c73cdf411aa13d39e4ac8e6c`
- CI Run #293: lint、format、build、unit test、E2Eが全成功
- PR #97 merge commit: `500397ac7d04b23ac88cd17a6e79843c8405a557`
- 2026-07-16: Opus 4.8 reviewと人間確認が完了し、問題なしと報告された

これにより、型別templateはaccepted profileを参照して設計できる。

## 3. 現行実装の監査結果

| 対象 | 現状 | 判断が必要な点 |
|---|---|---|
| 作成size | UIは32 / 64 / 128 / 256の正方形だけを選べる。coreの`createBlankAsset`と透明PNG生成は幅・高さを別々に扱える。 | UIと入力検査を追加すれば矩形に対応できる。生成前に上限を検査し、無断clampをしない契約が必要。 |
| 端末上限 | accepted端末仕様は、取り込み画像の初期上限を1枚25MB、最大4096 x 4096としている。 | 空キャンバスも同じ寸法上限へ揃えるか、スマホ向けに低い上限を設けるか。 |
| 型別template | characterだけstarter body colliderを自動追加する。他5種は空Assetで始まり、tile / gimmick / effect / background / itemの設定ボタンは作成後に存在する。 | templateを自動適用するか、作成時にユーザーが明示選択するか。用途依存warningを必須化してはいけない。 |
| パーツ | 作成後の`createPart`は存在し、選択したlayerをPartへまとめられる。 | 全型へ一般化する必要はなく、character starterへ限定するか判断する。 |
| 図形 | `LayerType`には`shape`があるが、現行Layerには永続的なshape内容がなく、rendererはTextureを描画する。 | CREATEだけで編集可能な図形を作るには、即時raster化またはschema追加が必要。 |
| 文字 | 現行Asset / Layer schemaにtext内容、font、layoutの保存欄がない。 | CREATEだけで編集可能な文字を作ると、schema / font / raster / Blob処理を先取りする。 |
| 保存 | 新規AssetはProject、Asset、TextureRef、Blobを`saveProjectBundle`で原子的に追加する。 | 新しいsize / templateも保存成功後だけ画面へ反映し、失敗時は全正本を維持する。 |

## 4. 変更しない安全境界

人間判断がacceptedになるまで、次を変更しない。

- Asset / Project schema、data version、DB version、migration
- IndexedDB store / index layout
- `.casproj`内部構成、export ZIP内部構成
- Family / Variant、linked更新、batch
- brush、fill、selection、transform、永続的shape / text編集
- 2D-3、2D-4、3D、WebGPU
- dependencies

作成失敗時はProject要約、Asset、Blob、React stateを追加前の状態に保つ。

## 5. 判断1: 矩形presetと自由sizeの上限

| 選択肢 | 方針 | 利点 / 制約 |
|---|---|---|
| `A`（推奨） | 正方形・横長・縦長presetに加え、幅・高さを1〜4096の整数で自由入力できる。総pixel数も4096 x 4096以下に制限し、Canvas / Blob生成前に拒否する。 | accepted端末仕様と上限を共有できる。大きいsizeは重いため、数値と注意を表示する必要がある。 |
| `B` | 矩形presetだけ追加し、自由入力は保留する。 | 誤入力を減らせるが、ゲームごとの任意sizeを作れない。 |
| `C` | 自由入力を最大2048 x 2048に制限する。 | スマホ負荷は抑えやすいが、accepted仕様の4096上限と別基準になり、PC / iPadでも不要に狭くなる。 |

`A`では値を自動で丸めたり上限へclampしたりしない。正の整数、各辺上限、総pixel数を満たさない場合は、生成前に理由付きで拒否する。

## 6. 判断2: 型別templateの適用方法

| 選択肢 | 方針 | 利点 / 制約 |
|---|---|---|
| `A` | Asset typeを選ぶと、型別starterを自動適用する。 | 操作は短いが、用途依存のcollider、tag、loopなどを無断で決める危険がある。 |
| `B`（推奨） | 作成フォームにtemplate selectorを表示し、`blank`と型別starterをユーザーが明示選択する。既存characterのstarter body colliderは互換性のため既定候補として表示する。 | 意味をユーザーが選べる。template未選択時の扱いと、型変更時の候補更新を明確にできる。 |
| `C` | 作成時templateは追加せず、作成後の既存ボタンだけを使う。 | 実装は小さいが、`2D-2-CREATE`の型別template入口が未完のまま残る。 |

`B`のstarterは、現行型・現行UIですでに編集できる項目だけを使う。template IDはUI定数とし、Asset JSONや`.casproj`へ保存しない。保存するのはtemplate適用後の通常フィールドだけとする。

候補例:

- character: current body collider、任意でmain layerをbody Partへまとめる
- item: pickup colliderと`item` tagを持つpickup starter
- background: main layerへ背景設定を付けるloop starter
- tile: tile settingsを持つfloor starter
- gimmick: gimmick settingsを持つplatform starter
- effect: effect settingsを持つspark starter

候補名と初期値は、実装前にfixtureで固定する。

## 7. 判断3: パーツ・図形・文字の境界

| 選択肢 | 方針 | 利点 / 制約 |
|---|---|---|
| `X`（推奨） | character starterだけ、既存main layerを参照する単純なbody Partを任意で作れる。永続的な図形・文字の入口は`2D-2-RASTER + 2D-2-REPAIR`へ送る。 | 既存Part型を再利用でき、schemaを変えない。中身を持たないshape/text layerを作らずに済む。 |
| `Y` | CREATE内で図形・文字を即時raster化し、通常のimage layerとして作る。 | schema変更は避けられるが、font、描画、Blob生成、再編集性、UndoをRASTERより先に設計する必要がある。 |
| `Z` | shape / textの永続データをschemaへ追加する。 | 再編集性は高いが、version、migration、`.casproj`、export、rendererの別契約が必要で、今回の範囲を超える。 |

`X`でもPart hierarchy、rig、bind pose、親子編集を先取りしない。単純な初期Part作成だけをCREATEで扱い、その後の動作編集は`2D-3-RIG`へ送る。

## 8. 推奨する採用組み合わせ

推奨は`A+B+X`である。

- accepted端末仕様と同じ4096上限で矩形・自由sizeを追加する
- templateは明示選択とし、用途を無断で決めない
- characterの単純な初期Partだけ許可し、図形・文字はRASTERへ送る

この組み合わせなら、schema、version、migration、保存形式を変えずに、残るCREATEの安全な入口を進められる。

## 9. accepted後の最初の実装slice

人間判断がacceptedとなった後、1つのproduct code Draft PRで次を扱う。

1. 幅・高さと総pixel数を検査する純粋なsize validatorを追加する。
2. 正方形・横長・縦長presetと自由size入力を作成フォームへ追加する。
3. 現行6種の`blank` / starter template fixtureと純粋な適用関数を追加する。
4. accepted範囲の初期Partだけを既存Part型で作成する。
5. Project、Asset、Blobを既存の原子的保存経路で追加し、失敗時無変更を維持する。
6. 全6種、境界値、拒否時無変更、reload、`.casproj`退避をunit test / E2Eで確認する。
7. user guideと実装報告を追加し、同じDraft PRでCIを成功させる。

## 10. 完了条件

1. size上限、template適用方法、パーツ・図形・文字境界の組み合わせが人間判断として記録される。
2. 自由sizeは生成前に検査され、無断clampされない。
3. templateはユーザーが意味を確認でき、template IDを保存形式へ追加しない。
4. 作成失敗時にProject、Asset、Blob、画面stateが変わらない。
5. schema、version、migration、`.casproj`、export ZIP、dependenciesを変更しない。
6. Family / Variant、永続shape / text、raster編集、rig編集を先取りしない。
7. unit test、E2E、lint、format、build、GitHub Actionsが成功する。
8. Opus reviewと人間確認前にready化、merge、auto-mergeを行わない。
