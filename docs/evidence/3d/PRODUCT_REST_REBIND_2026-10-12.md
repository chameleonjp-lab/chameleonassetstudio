# Rest再bindとclip依存の製品確認（2026-10-12）

## 目的

3D要件 **RIG-05** の限定したソフトウェア受け入れとして、製品画面からのrest変更がskinのinverse bindを再計算し、既存clip・骨追従anchorのデータを保持すること、Undo/Redoでrestとbind情報を復元できること、対象boneを動かすclipがある場合は自動変換せず変更を拒否することを確認する。

## UI説明

RIGパネルにrest変更の影響を明記した。関係するskinのinverse bindを再計算すること、影響範囲のanimation clipは自動変換せずrest変更を拒否すること、bone追従anchor/colliderの参照とlocal値を保持しworld位置がboneのrest変更に追従することを説明する。

## 製品E2E

`e2e/native-rig-product.spec.ts` の追加ケースは、製品UIでskin対象box、Root/Tipとmixed skin、skin対象外のboxを作り、後者を対象とする既存clipとTip追従anchorを用意する。Tipのrestを変更し、inverse bindのみ再計算され、skin weights・既存clip・anchor参照/local値が不変であることをnative backup経由で検査する。Undo/Redoでrest transformとinverse bindが元の状態へ戻り、再適用されることも確認する。

同じ作品にTipを対象とする別clipを作成した後、Tip restの変更が依存関係エラーとなり、編集対象の完全なbackup project（revisionを含む）が変更されないことを検査する。

## ローカル検証

- 追加した受け入れケース: Chromium 1/1、WebKit 1/1。
- `native-rig-product.spec.ts` 全件: Chromium 6/6、WebKit 6/6。
- `npm test`: 3,530/3,530。
- `npm run build`: app / H3 とも成功。既存の500 kB超chunk警告あり。
- `npm run lint`: error 0。既存 `NativeViewportPanel.tsx:205` のReact hook警告1件。
- `npm run format:check`、`npm run test:ci-scope`（8/8）、`git diff --check`: 成功。
- 上記はローカル検証結果。提出headのCI結果、物理端末、出荷受け入れは未確認。

## 限界

- 固定した自作boxと二boneによるChromium/WebKitのソフトウェアUI経路であり、RIG-05全体の受け入れ合格ではない。
- anchorのworld変換を実engine・consumerで再生する検査ではない。骨追従とmetadataの独立consumer検査は別境界である。
- 任意の階層・複数skin・全clip依存配置、物理端末、実ユーザー作品、最終CI／出荷受け入れは対象外。
- `asset.json` / `.cas3dproj` / GLB / sidecarのschema・versionは変更しない。製品コード変更は受け入れ時の影響説明文のみ。
