# 0018-chameleon-atlas-semantic-reimport

ステータス: accepted
上位文書: `docs/future/2D_2_IMPORT_PLAN.md`（W1 / Slice D）、`docs/adr/0007-data-layer-separation.md`、`docs/adr/0015-migration-detailed-contract.md`
関連 fixture: `src/core/images/importAtlasBundle.test.ts`（ADR-0018）、`e2e/import-frame-set.spec.ts`

---

## 文脈

`2D-2-IMPORT-GATE` Slice Dは、Chameleonの`buildAtlas`が出力する`atlas.json + spritesheet.png`を再編集可能なAssetへ取り込む。一方、ADR-0007は配布物を正本として再取り込みしないとし、ADR-0015はatlas versionをmigration対象外としていた。また現行Atlasは元Assetのlayer topology、parts、tags、gameAttributes、rig、provenance、identityを持たず、raw JSONを保存する画像TextureRefもない。

このため「元Assetの完全復元」ではなく、現行Atlasが明示するゲーム上の意味を新しいflattened Assetへ復元する限定例外として境界を固定する。ユーザーは2026-07-20に本ADRの決定1〜7を承認した。

## 決定

1. **意味上roundtripの限定例外**: ADR-0007の一般原則を維持したまま、Chameleon自形式atlasだけを未信頼入力として再取り込みできる。配布物を元の正本へ戻す操作ではなく、新しいID namespaceのflattened Assetを作る。framesの名前・順序、animationsのname / fps / loop / frame列、origin、anchors、colliders、tile / effect設定とframe pixelを意味比較する。
2. **原本保持境界**: `spritesheet.png`はsource Blobとしてverbatim保持する。`atlas.json`はraw bytesを保存せず、file名、MIME、byte数、原本bytesのSHA-256、importedAtを2件目のprovenance recordへ残す。確定前previewでraw JSON非保持を常時loss表示する。
3. **厳格profile**: 入力はbasenameがexactな`atlas.json + spritesheet.png`の2 fileだけとする。`format: chameleon-atlas`、`version: 0.1.0`、`texture: spritesheet.png`を必須とし、JSONは4MiB・UTF-8・depth 64の既存bounded parserを通す。ZIP、directory、外部URL、Phaser / Aseprite / Tiled等の外部JSON、future versionは対象外である。
4. **canonical subset**: frameは1〜16件、nameは非空・一意、矩形は正の整数cellSizeと一致し、`computeSheetLayout`の行優先配置および実texture寸法と一致しなければならない。animationは0 < fps <= 240とし、全frame参照を一意に解決する。未知field、tile/effect同居、anchor role、collider union、tile/effect設定の不整合を理由付き拒否する。現行exportの全出力が再取り込み可能とは表現しない。
5. **Tileset写像**: Tilesetは独立モードとし、既存手動格子の1〜16cellを各1 edit texture / layer / frameへ展開する。`assetType: tile`、`canvasSize = cellSize`、`tileSize = cellSize`を既定とし、tileSizeはcellSize以下を必須、非除算はwarningとする。collisionTypeとvisualTypeはAsset全体に1設定、colliderは自動生成せず、自動animationも作らない。
6. **lossとID**: Atlasから欠落する元layer構造・transform・parts・tags・gameAttributes・rig・元provenance・identity・animation durationMsを復元しない。Asset / frame / animation / anchor / collider IDは新規生成し、確定にはloss / warning確認を必須とする。tile / effectがあればtypeを推定し、なければ利用者がnameとtypeを指定する。
7. **保存・拒否・quarantine**: Slice Cのcommon preview、stale guard、`saveProjectBundle`、History 1 entryを再利用する。取消・検証失敗・保存失敗ではProject / Asset / Blobを変更しない。quarantineはtexture画像のsignature不一致・decode失敗・寸法超過だけとし、JSON parse / version / geometry / reference / 外部形式の不整合は隔離せず理由付き拒否する。

## 根拠

- 現行`AtlasJson`は`src/core/export/atlas.ts`のfieldだけを持ち、編集正本の全構造は含まない。
- `TextureRef`は画像MIMEのsource / edit / thumbnailだけを持つため、raw JSONをschema変更なしでBlob保存できない。
- `Asset.provenance?`のsource-file recordは`textureId`をoptionalとしており、JSONのhash記録に既存schemaを利用できる。
- `computeSheetLayout`は5 frameを3 x 2へ配置するため、manual gridをそのまま逆適用すると空の6cell目を誤生成する。JSONの`frames[]`矩形だけを明示regionとして切り出す必要がある。
- Slice Cのstaging / atomic save / History / quarantine境界は、新しい保存APIを作らず再利用できる。

## 影響と fixture

- 影響実装: `src/core/images/importAtlasBundle.ts`、`src/core/images/importFrameSet.ts`、`ImportFrameSetPanel.tsx`、`EditorScreen.tsx`。
- unit: 現行`buildAtlas`の5-frame出力、format/version/unknown field、重複名、参照切れ、非canonical座標、collider union、texture寸法を固定する。
- E2E: Tileset設定、実export 5-frame bundleのimport → save → reload → re-export、空cell非生成、raw JSON Blob非保存、1 Undo / Redo、Desktop / touch / iPhone SE級到達性を確認する。
- 影響なし: Asset / Project schemaとversion、migration、IndexedDB store、`.casproj`配置、product export ZIP、dependencies。

## 現状の制限

- 17 frame以上、4096px超、25MiB超、空または重複frame名、非canonical配置を持つ自形式exportは理由付きで再取り込みを拒否する。
- raw `atlas.json`、元Assetの編集構造、内部IDはroundtripしない。
- automated E2EはChromiumであり、iPhone / iPad Safariのfile picker、native dialog、safe-area、メモリ圧迫は実機確認を残す。

## 再検討条件

raw JSON保存、Atlas version migration、ZIP直接取込、17 frame以上、packed / multi-page Atlas、外部Atlas形式、元Asset完全復元へ拡張する場合は、schema / storage / version / dependency影響を監査する別ADR、Opus 4.8レビュー、人間承認を経る。
