# SEC-02 製品入力の不活性表示検証 — 2026-10-13 JST

**状態: ローカルproduction-previewの合成fixtureによる部分証拠。SEC-02全体の受入passではない。**

## 対象と再現情報

- Tested code commit: `133f6785be9eb28536b0c2b9ffa68314a8c84094`（PR #409 head `59234231423a23286dc3184de88215f10d1f4f5d` をbaseとしたchild branch）。
- 対象要件: [3D製品要件 SEC-02](../../THREE_D_PRODUCT_REQUIREMENTS_2026-10-03.md) — importするJSON・名称・metadataを不活性dataとして表示し、DOM injection・prototype pollution・任意コード実行を防ぐ。
- E2E: [`e2e/native-security-product.spec.ts`](../../../e2e/native-security-product.spec.ts)、production-previewで製品3D画面を起動。Playwright `chromium` / `webkit-critical`、Node.js `v24.19.0`、Playwright `1.61.1`。
- 入力は本E2Eで合成した`.cas3dproj`とGLB metadataで、第三者素材や利用者の実作品ではない。project/node nameに`<img ... onerror>`、GLB copyright/VRM titleと権利欄に`<svg ... onload>`形式のmarkerを入れ、別のGLB JSONには`__proto__`を含めた。

## 操作と観測

1. 合成`.cas3dproj`を製品UIからコピー復元し、作品名を見出しとして表示。
2. 品質検査を実行し、GLB原本metadataと申告権利を含むsource detailを開く。
3. 悪意あるmarkupは見出し・JSON表示の文字列として確認できる一方、対応する`img` / `svg` DOM要素は存在せず、`onerror` / `onload`の処理markerは実行されない。`Object.prototype.sec02Polluted`も作成されない。
4. `__proto__`を含むGLB source metadataは、原本情報の`status: invalid`と`Unsafe source metadata JSON key`として表示される。
5. 診断情報previewを作成し、project名、GLB metadata、権利文字列、prototype markerが自動レポートへ含まれないことを確認。
6. backupを再保存・再読込し、imported project nameと両GLB source bytesが元fixtureと一致することを確認。拒否されたmetadata sourceも原本bytesとしては改変されない。

この検査は、現行3D appのUI境界と既存の`preflight` / `validateProject` / `inspectSourceProfile`実装を合成入力で検証する。新たなproduct code・schema・依存関係の変更は行っていない。

## 実行結果

- SEC-02製品E2E: Chromium 3回 + WebKit 3回 = **6/6 passed**（tested commit、production preview）。
- `npm run test -- --reporter=dot`: **186 files / 3,553 tests passed**。
- `npm run lint`: **0 errors**。既存warning 1件 `src/features/editor3d/NativeViewportPanel.tsx:205`（`react-hooks/exhaustive-deps`）。
- `npm run format:check`: passed。
- `npm run build`: app + H3 passed。`npm run consumer:build`: passed。Viteの`>500 kB` chunk advisoryは既存。
- `npm run test:ci-scope`: **8/8 passed**。
- Remote CIは照会・監視していない。

## 残る境界

- 合成入力とlocal production previewに限定。公開配信/CDN/cache、実際の第三者・利用者asset全種類、OS network stack、実端末、支援技術、全runtime/engineでの独立評価は未検証。
- PlaywrightによるDOM・実行marker検査であり、広範なfuzzing、browser security audit、外部エンジンでの任意コード実行試験ではない。
- したがってSEC-02は`implemented-candidate / partial`を維持し、製品全体のsecurity保証・外部consumer受入・公開承認には一般化しない。

関連: [SEC-02 status row](ACCEPTANCE_STATUS_2026-10-10.md)、[2026-10-13台帳再照合](ACCEPTANCE_LEDGER_RECHECK_2026-10-13.md)。
