# OPS-10 dependency audit refresh — 2026-10-13

## 対象と現行監査

監査対象HEADは`4687ec6`（Draft PR #391のheadから始めた下流branch）。`package-lock.json`のSHA-256は`184a955be3bbd501890cd5b618534813bc4dff72c1343c6142d886e79ac34550`。npm `11.17.0`を使い、registryは`https://registry.npmjs.org/`だった。

| 監査範囲 | コマンド | 終了コード | info / low / moderate / high / critical / total |
| --- | --- | --- | --- |
| 全依存 | `npm audit --json` | 0 | 0 / 0 / 0 / 0 / 0 / 0 |
| production依存 | `npm audit --omit=dev --json` | 0 | 0 / 0 / 0 / 0 / 0 / 0 |

現lockfileの修正後版は`fast-uri@3.1.8`と`vitest@4.1.11`。このbranchでは`package.json` / `package-lock.json`を変更しておらず、`npm audit fix`や依存更新は実行していない。

## 過去11件の根拠と処置

PR #317で記録された11件（2 moderate / 7 high / 2 critical）は、後続の再監査で再現・処置された。内訳と修正根拠は[POST-318 evidence](POST_318_LOCAL_CHROMIUM_2026-10-10.md)と[acceptance follow-up](ACCEPTANCE_GAPS_2026-10-10.md)に記録されている。唯一のproduction findingは`fast-uri@3.1.3`（root runtime `ajv@8.20.0`経由）で、Ajv既存range内の`fast-uri@3.1.8`へlockfileを更新。非強制の`npm audit fix`でsemver互換の開発依存も更新し、残ったVitest/Tinypool 3 findingはmajorを5へ強制せず、patched `vitest@4.1.11`で解消された。今回の現lockfile監査は、その修正後状態が引き続き0件であることを確認した。

## 解釈と境界

[npm audit command](https://docs.npmjs.com/cli/v9/commands/npm-audit/)および[npmのsecurity auditガイド](https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities/)によれば、`npm audit`は設定済みdefault registryへ依存情報を送り、既知脆弱性レポートを取得する。`--omit`指定は監査から依存種別を除外し、npm文書はpeer dependenciesを監査しないと説明している。したがって、これは監査時点のadvisory照合であり、恒久的な安全保証、全runtime pathの到達性解析、第三者依存の包括的なsecurity reviewではない。lockfileやadvisory databaseの変化に応じて再監査する。リモートCIは監視していない。
