# Group 21A 端末導線・入力契約

最終更新日: 2026-08-26  
対象リポジトリ: `chameleonjp-lab/chameleonassetstudio`  
work package: `2D-6-DEVICE-FLOW` + `2D-6-INPUT`  
基準main: `5e6fff3da38da7827647f1c317887691388f26e3`

## 1. 目的

PC、iPad、スマホで、同じ編集元を使って次の一連の作業へ到達できることを確認する。

```
ホーム
  → 新規プロジェクト
  → 画像取り込み
  → キャンバス編集
  → プロパティ
  → タイムライン
  → 書き出し
  → ホームへ戻る
  → 再読み込み後に再び開く
```

画面が表示されるだけでは合格にしない。画面切り替え、入力、保存状態、書き出しまでを一つの流れとして確認する。

## 2. 今回の実装範囲

今回のPRでは、次を自動検査できるテストとして固定する。

| 確認 | 自動検査 |
|---|---|
| スマホ最小レイアウト | 320×568で横スクロールがなく、主要画面へ到達できる |
| スマホ標準レイアウト | 375×667で画像取り込み、ツール、プロパティ、タイムライン、書き出しへ到達できる |
| iPadレイアウト | 768×1024でキャンバスと書き出しを同時に使える |
| タップ対象 | スマホの下部ナビと編集ツールを44px以上で表示する |
| iOS入力 | スマホで表示される入力欄を16px以上にする |
| 入力境界 | ページ全体に`touch-action: none`を広げず、キャンバスだけが二本指操作を受ける |
| 回帰 | 画像取り込み後にホームへ戻り、再読み込み後もプロジェクトを開ける |

44pxは、指で押しやすい最小の操作対象としてこの工程で使う基準値である。16pxは、iPhone Safariが入力時に画面を拡大しにくくするための基準値である。

## 3. 自動検査の位置付け

- Playwrightのviewport検査は、端末の画面サイズとDOM上の導線を確認する。
- Playwrightは物理的なiPhone Safari、Apple Pencil、実メモリ、実際のFiles連携を再現しない。
- 自動検査が成功しても、物理端末の操作感や保存・復元が成功したとは記録しない。
- 実機確認は、iPhone 17 Pro、iPhone 11 Pro、iPad Pro 2018を優先する。
- PCを使用できない期間は、PCの実機確認を未確認のまま残す。

## 4. 合格条件

Group 21Aをruntime verifiedへ昇格するには、次のすべてが必要である。

1. 本PRのCIでlint、format、build、unit、E2Eが成功する。
2. 320×568、375×667、768×1024の自動検査が成功する。
3. 物理端末で、作成・取り込み・編集・検査・書き出し・再読み込みを確認する。
4. safe area、ソフトウェアキーボード、向き変更、誤タップ、キャンバスのpan / pinchを物理端末で確認する。
5. 失敗した保存、容量不足、オフライン、画像欠落はGroup 21Bで別に確認する。

現在は、1と2をCIへ委ね、3と4は未確認として扱う。

## 5. 変更しない範囲

このwork packageでは、次を変更しない。

- `asset.json`
- `.casproj`
- export ZIP
- JSON Schema
- 保存データの意味
- 依存関係
- 外部サービス
- PC専用の新機能
- Apple Pencil専用の新しいデータ形式

入力や画面の不足が見つかった場合も、保存形式を変えず、まず既存UIと検査を最小修正する。

## 6. 未確認の境界

| 項目 | 状態 |
|---|---|
| iPhone 17 Pro Safari | 実機未確認 |
| iPhone 11 Pro Safari | 実機未確認 |
| iPad Pro 2018 Safari | 実機未確認 |
| iPhone SE級の実機 | 自動viewportのみ |
| PC Chrome / Edge / Firefox | PC未使用のため未確認 |
| Android Chrome | 未確認 |
| Apple Pencil | 未確認 |
| 実メモリ・長時間操作 | Group 21Cで確認 |
| 保存失敗・オフライン | Group 21Bで確認 |

本契約の状態は、CI成功後も `implemented-candidate / independently-verified-static / runtime-verification-unverified` とする。実機の証拠なしに `verified`へ変更しない。

## 7. CI記録（2026-08-26）

PR #261のCI Run #847（Actions ID `32880786002`）は、`classify-changes`、`build-and-test`、`e2e`の全jobがsuccessとなった。E2Eは200件が成功した。

この記録はLinux上のChromiumによる自動検査であり、物理iPhone / iPad Safari、Apple Pencil、Files連携、ソフトウェアキーボード、実メモリ、PC実機の成功を意味しない。
