# Group 21C 品質契約（性能・アクセシビリティ・安全性）

最終更新日: 2026-08-26  
対象 work package: 2D-6-PERFORMANCE / 2D-6-A11Y / 2D-6-SECURITY  
対象リポジトリ: chameleonjp-lab/chameleonassetstudio

## 1. 目的と状態

Group 21C は、既存の保存・書き出し形式を変更せず、利用者が品質上の境界を確認できるようにする。

現時点の状態は、implemented-candidate / CI-passed / runtime-verification-unverified である。PC、iPhone、iPad の実機確認ができないため、実機性能や Safari の合格を意味しない。進捗は 18/27 のまま維持する。Actions Run #866（Actions ID `32935188646`）では build-and-test（lint / format / build / unit）、Chromium E2E 204件、H3計測、Pages経路検証を含む全jobが成功した。

この契約は、PERFORMANCE_BUDGET.md の baseline を置き換えない。未決定の数値 budget、warning、hard cap を新設せず、取得不能な値を 0 や成功値として扱わない。

## 2. 性能（2D-6-PERFORMANCE）

- アプリの品質情報を開くと、長時間タスク監視、長時間タスクの累積値、JS ヒープ、端末メモリ目安を表示する。
- PerformanceObserver、performance.memory、navigator.deviceMemory が未対応または非公開の場合は「未計測」と表示する。
- 長時間タスクの件数と合計時間は、画面表示後に観測できた値だけを累積する。初期値の 0 は「問題なし」の意味に使わない。
- 表示値はブラウザ API の参考値であり、Safari、Canvas、GPU、画像 decode、IndexedDB、ZIP、実機全体の性能を保証しない。
- Worker 化、chunk 分割、画像 import / export の取消、preview 軽量化は、この契約の後続改善として引き継ぐ。

## 3. アクセシビリティ（2D-6-A11Y）

- キーボードフォーカス中の位置を focus-visible の輪郭で示し、色だけに依存しない。
- prefers-reduced-motion: reduce を尊重し、アニメーション、遷移、smooth scroll を抑える。
- 品質情報、通信状態、保存状態、エラーは、テキストと適切な status / alert semantics を持つ。
- Chromium E2E で、表示中の button、link、input、select、textarea、summary に空でない accessible name があること、狭い viewport の横スクロールがないことを確認する。
- これは WCAG 適合宣言やスクリーンリーダー、VoiceOver、Apple Pencil、ソフトウェアキーボードの実機確認ではない。

## 4. 安全性（2D-6-SECURITY）

- React の通常レンダリングを使い、利用者入力を raw HTML として解釈しない。
- target=_blank のガイドリンクには noopener と noreferrer を明示し、新しいタブから元画面を操作できないようにする。
- 品質計測は端末内の標準ブラウザ API のみを使い、外部送信、外部 AI、CDN、認証情報、保存形式の変更を行わない。
- 計測表示はネットワーク接続や保存成功そのものを保証しない。ConnectionStatus と同じ境界を維持する。
- E2E で利用者入力の HTML 非解釈と新規タブリンクの rel を確認する。これはペネトレーションテストや CSP 導入の代替ではない。

## 5. 自動検査と未確認範囲

- unit: API 不在、非有限値、表示整形の境界を確認する。
- Chromium E2E: 品質情報の表示、キーボード focus、reduced motion、accessible name、横スクロール、入力の HTML 非解釈、リンク分離を確認する。
- 実機未確認: iPhone 17 Pro、iPhone 11 Pro、iPad Pro 2018 の Safari、VoiceOver、実メモリ、GPU、Files、オフライン cache、PC ブラウザ。
- CI が成功しても、実機未確認のため状態は runtime-verification-unverified のままとする。
- 保存 schema、IndexedDB、.casproj、export ZIP、JSON Schema、既存の製品機能は変更しない。
