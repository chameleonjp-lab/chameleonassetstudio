# 2D-2-RASTER + 2D-2-REPAIR 契約監査・実装計画

作成日: 2026-07-16
状態: `contract audit / human decision pending`
正式work package: `2D-2-RASTER + 2D-2-REPAIR`
基準main: `33ebb60c0f78e40439a4c16393ec3e82b4b532eb`（PR #101 merge）
直前slice: `2D-2-PROJECT + 2D-2-CREATE` accepted A+B+X completed

## 1. 目的

画像を取り込む、または空Assetを作るだけで終わらず、選択中のimage layerへ描画し、ゲーム素材として必要な修正を安全に完了できる状態へ進める。

本work packageでは、次を完成対象にする。

- brush、fill、selection、shape、textのraster編集
- transform、align、grid、snapを使った配置修正
- 背景透過、透明縁、alpha trim、余白、layer resize、palette、色違い、flip、outline
- frameずれ修正の意味と実装時期
- sourceを残し、edit Blob、Asset、History、snapshotを整合して確定する編集経路

ただし、shape / textを再編集可能な永続データにするか、pixelsへ確定するか、resize時にAsset座標を変えるかは保存形式と互換性へ影響するため、実装前に人間判断を固定する。

## 2. 着手条件と直前sliceの完了

`2D-2-PROJECT + 2D-2-CREATE`の残るA+B+X sliceは完了した。

- 契約PR #99 merge commit: `261bc2dcd3635c2741323727c6364de579e668c2`
- 実装PR #100 final head: `0151295089a1259e4b4c27e2a64ac55816c5dedb`
- PR #100 merge commit: `5f72c5f3f94df27a293b0131c88cc6550b5c76f0`
- CI Run #306: lint、format、build、unit test、E2Eが全成功
- Opus 4.8事後監査: `BLOCKER 0 / MUST 0 / SHOULD 1 / NOTE 3`
- 軽微指摘反映PR #101 final head: `a5492c298baaf08f60773b61d4104a15ff91dc71`
- PR #101 merge commit: `33ebb60c0f78e40439a4c16393ec3e82b4b532eb`
- CI Run #308: lint、format、build、unit test、E2Eが全成功
- open PR: 0件

PR #101は製品挙動を変更せず、body Part付きstarterのschema validation、負数・Infinityのsize境界test、防御的な総pixel検査の意図を補強した。

## 3. 現行実装の監査結果

| 対象 | 現状 | 不足 / 境界 |
|---|---|---|
| Pixel処理 | `crop`、背景色透過、eraser、HSL、色置換、outlineが純粋な`PixelBuffer`操作として存在する。 | brush、fill、selection mask、shape描画、text描画、resize、padding、alpha bounds検出は未実装。 |
| Worker | `runImageOperation`はWeb Workerを使い、非対応環境では同期処理へfallbackする。元BufferはUndo用に保持する。 | 新しい重い処理も同じrequest / progress / error契約へ追加する必要がある。 |
| 保存 | 編集前Blobからsnapshotを作り、`saveAssetRevision`でAssetとedit Blobを対で保存し、非同期Undo / Redoを登録する。 | 複数layerや複数frameを同時変更する操作は、部分確定を避ける別の原子境界が必要。 |
| source境界 | 選択layerの参照Blobを編集し、source Blobを通常の画像編集で上書きしない。 | 新機能もsourceを直接変更せず、edit / derived側だけを更新する必要がある。 |
| Canvas tool | select、pan、crop、eraser、背景透過、picker、origin、anchor、colliderがある。 | brush、fill、rect / ellipse、text、rectangular selection専用toolがない。 |
| transform | Layer position、scale、rotation、左右反転、grid、snapは存在する。 | selection内pixelsのmove / copy、複数layer align、pixel resizeの補間選択がない。 |
| shape data | `LayerType`に`shape`はあるが、shapeの種類、座標、fill、strokeを保存するpayloadがない。rendererはTexture-backed imageを描画する。 | 再編集可能shapeを保存するならschema、version、migration、renderer、exportの契約変更が必要。 |
| text data | Asset / Layerにtext、font、size、layoutの保存欄がない。 | 再編集可能textを保存するならfont可搬性を含む契約変更が必要。 |
| repair | 背景透過、crop、色置換、outline、layer flipは部分的に成立する。 | 透明縁の検出、alpha trim、padding、layer resize、palette抽出、frameずれ修正がない。 |

## 4. 変更しない安全境界

人間判断がacceptedになるまで、次を変更しない。

- Asset / Project JSON Schema、data version、DB version、migration
- IndexedDB store / index layout
- `.casproj`内部構成、export ZIP内部構成
- source Blobの上書きまたは無断削除
- Family / Variant、linked更新、batch
- animation / rig / collider override / polygonのデータ意味
- 2D-4 exporter、3D、WebGPU、外部parser、dependencies

画像編集は、処理成功と保存成功の前にAsset、Blob、React state、Historyを確定しない。失敗時は直前正本と復旧点を維持する。

## 5. 判断1: shape / textの保存表現

| 選択肢 | 方針 | 利点 / 制約 |
|---|---|---|
| `A`（推奨） | 最初はraster-firstとする。brush、fill、rect、ellipse、textはcommit時に選択image layerのpixelsへ確定する。shape / text設定はcommit前の一時UI状態だけにし、Assetへ保存しない。 | schema、version、migrationを変えずに進められる。確定後は文字列や図形パラメータを再編集できないため、UIで「画像化される」と明示し、Undo / snapshotで戻れるようにする。 |
| `B` | shapeだけ永続化し、textはraster化するhybridにする。 | 図形は再編集できるが、同じ作成toolで保存意味が分かれ、shape payload、renderer、schema変更が必要。 |
| `C` | shape / textを両方とも再編集可能な永続データにする。 | 完成形として強いが、font可搬性、schema、version、migration、renderer、export、unknown dataを別の危険契約として先に固定する必要がある。 |

`A`では、textは汎用font family候補からCanvasへ描画し、確定後のpixelsを正本とする。font名や文字列を保存しないため、別端末での再描画差は発生しない。確定前previewと確定結果が同じCanvas経路を使うことをtestする。

## 6. 判断2: selectionの最初の範囲

| 選択肢 | 方針 | 利点 / 制約 |
|---|---|---|
| `X`（推奨） | 1つのimage layerに対するrectangular selectionを一時UI状態として実装する。選択範囲はbrush / erase / fill / 色置換のmaskと、同一layer内のmove / copy / clearに使う。 | 保存形式を変えず、touchとmouseの両方で扱いやすい。system clipboard、cross-asset paste、lasso、magic wand、複数layer選択は後続へ送る。 |
| `Y` | rectangular、lasso、magic wand、複数layer selectionを同時に実装する。 | 高機能だが、mask、hit test、mobile操作、複数Blob原子更新が大きくなり、最初のsliceとして過大。 |
| `Z` | selectionを保留し、brush / fill / shape / textだけ先行する。 | 実装は小さいが、ロードマップ上のselection / transform / alignが未完のまま残り、後からtool入力モデルを作り直す可能性が高い。 |

selection、copy buffer、preview overlayはAsset、Project、Historyへ保存しない。commit時だけpixel差分を1操作として確定する。

## 7. 判断3: trim / padding / resizeと座標の意味

| 選択肢 | 方針 | 利点 / 制約 |
|---|---|---|
| `P`（推奨） | layer image操作とAsset canvas操作を分離する。alpha trimは選択textureだけを切り詰め、Layer.positionを補正してworld上の見た目を維持する。paddingとlayer resizeもtexture単位とし、origin / anchor / collider / canvasSizeを変更しない。補間はnearest / smoothを明示選択する。 | 既存cropの座標補正と整合し、game dataを無断変更しない。Asset canvas resizeは別の座標契約まで保留する。 |
| `Q` | textureとAsset canvasを同時resizeし、origin / anchor / collider / frame transformを自動scaleまたはtranslateする。 | 一括操作は便利だが、丸め、境界外、frame、tile、backgroundの意味を決める危険契約が必要。 |
| `R` | trimだけ実装し、padding / resizeを後続へ保留する。 | 安全だが、素材修復として必要な余白統一と解像度修正が未完になる。 |

`P`では、layer resize後もAsset canvasとgame dataの座標は維持する。画像がcanvas外へ出る場合は隠さずpreviewとwarningを表示し、自動でcanvasを拡張しない。

## 8. 判断4: frameずれ修正の時期

| 選択肢 | 方針 | 利点 / 制約 |
|---|---|---|
| `M`（推奨） | 最初のRASTER / REPAIR sliceでは単一image layerを完成させる。frameずれ修正は`2D-3-TIMELINE`でframe意味と可変時間を完成させた後、本work packageの後続sliceとして実装する。 | 現行frameがshared layer textureとlayer stateを使う構造に合わせ、独立画像frameを推測しない。 |
| `N` | 現行`frames[].layerStates`のposition差だけを今すぐ整列する。 | schema変更は不要だが、pixel内容のずれではなくtransform差だけを「frameずれ」と呼ぶ制約がある。 |
| `O` | 画像内容を解析して自動位置合わせする。 | 強力だが、特徴点、透明領域、回転、誤補正、性能、Undoの別契約が必要で最初のsliceを超える。 |

## 9. 推奨する採用組み合わせ

推奨は`A+X+P+M`である。

- shape / textを明示的にraster化し、保存形式を変えない
- single-layer rectangular selectionを基礎にする
- layer imageのtrim / padding / resizeとAsset canvas / game dataを分離する
- frameずれ修正はtimelineの意味を完成させた後に扱う

この組み合わせなら、現行schema、`.casproj`、export ZIPを変えず、既存のWorker、snapshot、改訂保存、Undo / Redoを再利用できる。

## 10. accepted後の実装順

正式work packageは分割せず、同じ`2D-2-RASTER + 2D-2-REPAIR`内で利用者体験ごとにsliceを分ける。

### Slice 1: raster foundation

1. brush、fill、rect、ellipseの純粋PixelBuffer操作とWorker requestを追加する。
2. raster text preview / commitを追加し、「確定後はpixelsになる」と表示する。
3. single-layer rectangular selectionとmask、move / copy / clearを追加する。
4. 既存snapshot、`saveAssetRevision`、非同期Undo / Redo、競合guardへ接続する。
5. mouse、touch、iPhone SE級レイアウトのE2Eを追加する。

### Slice 2: layer repair

1. alpha bounds検出、透明縁warning、alpha trimを追加する。
2. paddingとlayer resizeを追加し、nearest / smoothを明示選択する。
3. palette抽出と既存replaceColor、outline、flipを同じ修復導線へ整理する。
4. 操作前後preview、失敗時無変更、snapshot、reload、`.casproj`退避を確認する。

### 後続slice

- 複数layer align / distribute
- canvas resizeとgame data追従契約
- timeline完成後のframeずれ修正
- persistent shape / textを採用する場合の独立schema契約

## 11. 完了条件

1. shape / text表現、selection範囲、resize座標、frameずれ時期が人間判断として記録される。
2. source Blobを変更せず、edit BlobとAssetを改訂単位で確定する。
3. 各raster操作が純粋処理、Worker、progress、理由付きerror、Undo / Redoを持つ。
4. selectionやpreviewなどの一時状態を保存形式へ混入させない。
5. trim / resizeでgame dataを無断変更しない。
6. 失敗、取消、容量不足、reloadで直前正本を維持する。
7. schema、version、migration、`.casproj`、export ZIP、dependenciesを判断前に変更しない。
8. unit test、E2E、lint、format、build、GitHub Actionsが成功する。
9. Opus reviewと人間確認前にready化、merge、auto-mergeを行わない。
