# Open Items

最終更新日: 2026-07-06
文書種別: 未着手項目の整理（Phase 18 整合確認の成果物）
上位文書: `docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md`

Phase 0〜17（+ 15.5）は実装済み・自動テスト通過済み。この文書は、**今すぐ実装しないが今後検討すべき項目**を一覧化する。各項目は対応する将来 Phase を併記する。着手前には必ず人間確認を挟む（`docs/future/FABLELESS_DEVELOPMENT_GUIDE.md` 5 章）。

---

## 1. 2D 制作体験（Phase 19 候補）

- グリッド表示 / スナップ（Phase 19-A で実装済み）
- 左右反転（通常の左右反転 = `LayerTransform.scale.x` 符号反転は実装済み。右向き/左向きを別編集する「左右反転コピー」は未実装で別コマンドとして将来実装。詳細は `docs/future/FLIP_DESIGN.md`）
- フレーム別の当たり判定編集
- 判定編集の操作性強化（Phase 19-C で用途カラー凡例・スワッチを実装済み）

## 2. 書き出し品質（Phase 20 候補）

- Atlas の padding / extrude（隣接コマのにじみ対策）
- 解像度別出力（等倍 / 2x など）
- helper の選択出力（Canvas / Pixi / Phaser を選んで同梱）

## 3. Effect 最小強化（Phase 21 候補）

- `EffectSettings.durationMs` と先頭アニメーションの長さの整合チェック（UI 警告）
- effect 用 helper snippet と docs 追記（本格パーティクル・shader は対象外）

## 4. 3D Asset Preparation Mode（Phase 22〜28 候補）

`docs/future/THREE_D_ASSET_PREPARATION_REQUIREMENTS.md` の順序に従う。生成 AI の実接続は最後。

- glTF-Transform / three.js のライセンス・要件調査（Phase 22）
- GLB / glTF 読み込みと 3D プレビュー（Phase 23）
- ファイルサイズ / ポリゴン数 / テクスチャ数などの検品（Phase 24）
- 中心点・足元基準・アンカー・当たり判定のメタデータ付与（Phase 25）
- GLB + metadata の ZIP 書き出し（Phase 26）
- 軽量化検討（Phase 27）
- 外部 3D 生成モデル連携の設計（Phase 28。TripoSR / Hunyuan3D 等は採用前にライセンス確認必須）

## 5. リリース前の人手確認（v1.0.0 宣言の前提）

- 実機ブラウザ確認: iPhone Safari / iPad Safari / Chrome / Edge / Firefox / Android Chrome（`docs/RELEASE_CHECKLIST.md` 3 章）
- 大画像（4096²）連続編集のメモリ計測（同 4 章。将来課題）

## 6. エンジン連携の将来課題

- Godot import helper script（`@tool` で SpriteFrames / CollisionShape2D を生成）
- Unity import helper script（ScriptedImporter で Sprite スライス + AnimationClip 生成）
- Rive / Spine の取り込み補助（現状は docs 上の関係説明のみ。互換は名乗らない）

---

これらはいずれも現行の `asset.json` / `.casproj` / export ZIP / 座標系を壊さない範囲で、`docs/future/POST_PHASE17_IMPLEMENTATION_PLAN.md` の段階に沿って進める。
