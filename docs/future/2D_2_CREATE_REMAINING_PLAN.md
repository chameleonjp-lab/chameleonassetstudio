# 2D-2-PROJECT + 2D-2-CREATE 後続slice 契約監査

作成日: 2026-07-16
状態: `A+B+X accepted / implementation ready`
正式work package: `2D-2-PROJECT + 2D-2-CREATE`
基準main: `0135cfe8859ea1d18af46d387e7089797512b9ed`（PR #98 merge）
直前work package: `2D-3-TYPE-PROFILES + 2D-3-INSPECT` completed
採用判断: `A+B+X`

## 1. 目的

accepted `C`で保留した`2D-2-CREATE`の残りから、現行0.1.0のschema、保存形式、export形式を変えずに安全に進められる次のsliceを固定する。

今回の対象は次の4点である。

- 矩形presetと自由な幅・高さ
- 現行6種の明示的な作成template
- パーツから開始する作成flow
- 図形・文字を最初の要素として置く入口の境界

Family / Variantはaccepted `C`の境界どおり、別のschema契約まで保留する。

## 2. 直前work packageの完了

`2D-3-TYPE-PROFILES + 2D-3-INSPECT`は、契約PR #96と実装PR #97で完了した。

- 採用判断: `A+B+X`
- 実装head: `3e237e3186317095c73cdf411aa13d39e4ac8e6c`
- CI Run #293: lint、format、build、unit test、E2Eが全成功
- PR #97 merge commit: `500397ac7d04b23ac88cd17a6e79843c8405a557`
- 2026-07-16: Opus 4.8 reviewと人間確認が完了し、問題なしと報告された

これにより、型別templateはaccepted profileを参照して設計できる。

## 3. 採用判断

2026-07-16の人間判断により、次の組み合わせを正式に採用する。

- `A`: 正方形・横長・縦長presetと、幅・高さ1〜4096の自由入力を追加する。総pixel数も4096 x 4096以下とし、Canvas / Blob生成前に不正値を理由付きで拒否する。
- `B`: 作成フォームにtemplate selectorを表示し、`blank`と型別starterをユーザーが明示選択する。既存character starterは互換性のため既定候補として見せるが、他型のstarterを無断適用しない。
- `X`: CREATEではcharacter starterに単純なbody Partを任意追加できる範囲だけ扱う。永続shape / textの作成入口は`2D-2-RASTER + 2D-2-REPAIR`へ送る。

この採用は、Family / Variant、linked更新、batch、永続shape / text、raster編集、rig編集、schema変更を許可するものではない。

## 4. 現行実装の監査結果

| 対象 | 現状 | accepted後の扱い |
|---|---|---|
| 作成size | UIは32 / 64 / 128 / 256の正方形だけを選べる。coreの`createBlankAsset`と透明PNG生成は幅・高さを別々に扱える。 | UIと入力検査を追加して矩形へ対応する。生成前に上限を検査し、無断clampしない。 |
| 端末上限 | accepted端末仕様は、取り込み画像の初期上限を1枚25MB、最大4096 x 4096としている。 | 空キャンバスも同じ寸法上限を使い、総pixel数も4096 x 4096以下にする。 |
| 型別template | characterだけstarter body colliderを自動追加する。他5種は空Assetで始まり、型別設定ボタンは作成後に存在する。 | template selectorで明示選択する。用途依存warningを必須化せず、template IDを保存しない。 |
| パーツ | 作成後の`createPart`は存在し、選択したlayerをPartへまとめられる。 | character starterの単純なbody Partだけを任意で作れる。hierarchyやrigは扱わない。 |
| 図形 | `LayerType`には`shape`があるが、現行Layerには永続的なshape内容がなく、rendererはTextureを描画する。 | CREATEで中身のないshape layerを作らず、`2D-2-RASTER + 2D-2-REPAIR`へ送る。 |
| 文字 | 現行Asset / Layer schemaにtext内容、font、layoutの保存欄がない。 | schemaやfont処理を先取りせず、RASTER契約まで保留する。 |
| 保存 | 新規AssetはProject、Asset、TextureRef、Blobを`saveProjectBundle`で原子的に追加する。 | 新しいsize / templateも保存成功後だけ画面へ反映し、失敗時は全正本を維持する。 |

## 5. 変更しない安全境界

本work packageでは、次を変更しない。

- Asset / Project schema、data version、DB version、migration
- IndexedDB store / index layout
- `.casproj`内部構成、export ZIP内部構成
- Family / Variant、linked更新、batch
- brush、fill、selection、transform、永続的shape / text編集
- part hierarchy、rig、bind pose、親子編集
- 2D-3、2D-4、3D、WebGPU
- dependencies

作成失敗時はProject要約、Asset、Blob、React stateを追加前の状態に保つ。

## 6. A: 矩形presetと自由size

- 正方形、横長、縦長のpresetを用意する。
- 幅・高さは1〜4096の整数で自由入力できる。
- 総pixel数は4096 x 4096以下に制限する。
- 値を自動で丸めたり上限へclampしたりしない。
- 正の整数、各辺上限、総pixel数を満たさない場合は、Canvas / Blob生成前に理由付きで拒否する。
- 大きいsizeでは端末負荷が高くなることをフォーム上で説明するが、警告だけを理由に有効な入力を拒否しない。

## 7. B: 明示template selector

作成フォームにtemplate selectorを表示し、`blank`と型別starterをユーザーが明示選択する。

- template IDはUI / code定数とし、Asset JSON、Project、`.casproj`へ保存しない。
- 保存するのはtemplate適用後の通常フィールドだけとする。
- Asset typeを変えた場合は、その型で使える候補へ更新する。別型のstarterを黙って適用しない。
- 既存characterのstarter body colliderは互換性のため既定候補として表示する。
- 他5種は`blank`を既定とし、starterは明示選択時だけ適用する。

最初のstarter fixtureは次で固定する。

- character: current body collider。任意でmain layerを参照するbody Part
- item: pickup colliderと`item` tagを持つpickup starter
- background: main layerへ背景設定を付けるloop starter
- tile: tile settingsを持つfloor starter
- gimmick: gimmick settingsを持つplatform starter
- effect: effect settingsを持つspark starter

用途依存のcollider、tag、loop、game attributeを必須扱いにはしない。

## 8. X: Part・図形・文字の境界

- character starterだけ、既存main layerを参照する単純なbody Partを任意で作れる。
- Part hierarchy、rig、bind pose、rotation / scale animation、親子編集は先取りしない。
- 中身を保存できないshape layerやtext layerをCREATEで作らない。
- 即時raster化も今回のCREATEでは行わない。
- 永続shape / textと編集toolは`2D-2-RASTER + 2D-2-REPAIR`の契約・実装へ送る。

## 9. 最初の実装slice

次のproduct code Draft PRは、1つの目的として次を扱う。

1. 幅・高さと総pixel数を検査する純粋なsize validatorを追加する。
2. 正方形・横長・縦長presetと自由size入力を作成フォームへ追加する。
3. 現行6種の`blank` / starter template fixtureと純粋な適用関数を追加する。
4. accepted範囲のcharacter初期Partだけを既存Part型で作成する。
5. Project、Asset、Blobを既存の原子的保存経路で追加し、失敗時無変更を維持する。
6. 全6種、境界値、拒否時無変更、reload、`.casproj`退避をunit test / E2Eで確認する。
7. user guideと実装報告を追加し、同じDraft PRでCIを成功させる。

## 10. 完了条件

1. `A+B+X`が採用判断として文書に記録される。
2. 自由sizeは生成前に検査され、無断clampされない。
3. templateはユーザーが意味を確認でき、template IDを保存形式へ追加しない。
4. character初期Partは単純な1階層だけで、rig挙動を持たない。
5. 作成失敗時にProject、Asset、Blob、画面stateが変わらない。
6. schema、version、migration、`.casproj`、export ZIP、dependenciesを変更しない。
7. Family / Variant、永続shape / text、raster編集、rig編集を先取りしない。
8. unit test、E2E、lint、format、build、GitHub Actionsが成功する。
9. Opus reviewと人間確認前にready化、merge、auto-mergeを行わない。
