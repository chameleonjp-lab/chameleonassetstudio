# 関係図のレビュー記録

基準main `eabbeff3062c24a0d72d23df63d45433274af717`、要件169ID、計画PR #295。対象は [索引](README.md) 配下の文書と3つの既存入口リンク。runtime・依存・schema・CI設定は変更しない。

## レビューの方法

制作経路、静的依存、資源/保存、入出力/security、mobile/読取、追跡/提供の観点で自己点検し、独立担当が対象図文書を上位要件・計画の関連契約と照合し、169行のID/優先/B/F/Tを全件比較した。役割名を付けた自己点検を独立検査と呼ばない。以下は文書上の検査で、renderer/prototype/実機の成功を意味しない。

| ID | 程度 / 観点 | 発見した問題 | 処置 / 確認 |
| --- | --- | --- | --- |
| DGR-01 | P1 / bundle・consumer | adapter一括組立に見え、tests-only consumerも製品へ入る余地 | OW-02を必要時lazy製品adapter注入に限定。consumerをe2e配下へ分けproduct import禁止 |
| DGR-02 | P1 / lifecycle | hidden時export・file picker・再生時間の枝が不足 | LC-02にsnapshot export、部分出力拒否、再gesture、picker取消と保存完了の差、復帰clock resetを追加 |
| DGR-03 | P2 / minimal reading | family単位mappingが個別ownerを落とす | PERF-08→M03、IMP-08→M13、EDIT-01→M03/M04/M05、COMPAT-06→M07/M08、QA-02→M14を追加 |

P1は図に従うと重大な仕様違反へつながる余地、P2は配置/読取の不足を示す。修正後の独立再確認と最終文書hashはPR本文に記録する。件数で完了を決めず、重大な未解消指摘があれば同じPRで修正する。

## 検証と限界

- mainの再帰treeでE pathを照合。Pは予定と明記し未作成ファイルへのリンクなし
- 上位対応表との169ID・優先度・主担当・fixture/test一致、Mgroup存在、相対リンク、表列数を静的検査
- Mermaidは単純なflowchart TD、引用label、矢印の限定構文のみ。node定義/参照と構文を検査し、各図に同義の文字版を設置
- GitHub公開文書のhead `840928a882273b8eee5b21aab637185d50762033` をcloud browserで通常閲覧し、12図すべてのdiagram要素とnode labelの描画を確認。入口・保存図は画面画像も観察した。GitHub描画経路で構文が受理された証拠であり、別途公式parser CLIを実行したとは主張しない。製品への描画dependency追加なし
- mobileの狭幅previewは既存Chromium起動時にsandboxの `socket() failed: Operation not permitted` で失敗し、描画画像は取得できなかった。再試行・別executorへの迂回は行わず、狭幅の視覚検証は未完。上記GitHub通常幅確認と区別する。全図に文字版を備えるが、これを実機表示合格としない
- 固定headのdocs-only CI、最終remote内容一致、追加視覚確認の結果はPR本文へ記録する

## 残る実装gate

G02の受理待ち。G00の実行境界、G03のライセンス/配布物/候補評価/採用、S01〜06、全MUSTの製品コード、端末実測、独立consumer実行はこの図で完了しない。保存/依存候補やbudgetを承認済み・計測済みへ変えず、要件と計画に従う。
