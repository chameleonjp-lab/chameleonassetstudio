# Group 21B 保存・復旧・オフライン契約

最終更新日: 2026-08-26  
対象: `2D-6-RECOVERY` + `2D-6-OFFLINE`  
状態: implemented-candidate / CI-passed / runtime-verification-unverified

## 1. 目的

Group 21Aで画面導線と入力境界を検査した。Group 21Bでは、保存途中の離脱、保存失敗、既存の復旧点、ごみ箱、`.casproj`の移動、読み込み済み画面のオフライン利用を、利用者が誤解しない形で確認する。

この工程は、クラウド同期やアカウントを追加する工程ではない。正本は引き続きブラウザのIndexedDBと、利用者がダウンロードする`.casproj`である。

## 2. 今回の実装

- `AutosaveQueue`が最後に失敗した保存を保持し、画面の「保存を再試行」ボタンから明示的に再実行できるようにした。
- Editorの`visibilitychange`（画面を隠した時）と`pagehide`（ページを離れる時）で、保留中のローカル保存を開始する。
- 保存失敗中はホームへ戻る処理を止め、保存失敗の理由と再試行導線を残す。
- `navigator.onLine`の変化を全画面に表示する。オフライン表示は通信の完全な保証ではなく、読み込み済み画面で端末内保存・書き出しを続けられることを説明する。
- Group 21BのChromium E2Eで、オフライン中の名前変更保存とPNG書き出し、ページ離脱時の名前変更保存、再読み込み後のプロジェクト再開を検査する。
- ごみ箱復元、`.casproj`の書き出し・削除後の読み込み、壊れた入力の隔離は既存の保存回帰E2Eで継続する。

## 3. 合格条件

| ID | 条件 | 自動検査 |
|---|---|---|
| B-01 | 保存失敗後に同じ保存を再試行でき、成功後に状態が「保存済み」へ戻る | `src/core/storage/autosave.test.ts` |
| B-02 | 読み込み済み画面をオフラインにしても、端末内保存とPNG書き出しを続けられる | `e2e/recovery-offline.spec.ts` |
| B-03 | ページを離れる前の保留中の名前変更を保存し、再読み込み後に一覧から開ける | `e2e/recovery-offline.spec.ts` |
| B-04 | ごみ箱から復元したProjectと画像が戻る | `e2e/storage.spec.ts` |
| B-05 | `.casproj`を別の作業として読み込み、元データを変更せず再編集できる | `e2e/casproj.spec.ts` |
| B-06 | 壊れた`.casproj`を正本へ保存せず隔離し、理由を表示する | `e2e/storage.spec.ts` / `e2e/casproj.spec.ts` |

## 4. 明示する境界

- オフラインで新しいページを読み込めることや、ブラウザを終了してもアプリ本体が必ず開くことは、このPRでは保証しない。アプリ本体のキャッシュと更新は別設計が必要である。
- `navigator.onLine`は接続の目安であり、IndexedDBの保存成功を置き換えない。保存状態は別に表示する。
- iPhone / iPad Safariでの実機オフライン、Filesアプリとの受け渡し、ソフトウェアキーボード、実メモリ、PC実機は未確認である。
- `asset.json`、`.casproj`、export ZIP、JSON Schema、既存の保存形式、依存関係、ランキング送信は変更しない。
- Group 21Bだけでは進捗を18/27から増やさない。CI成功後も、実機確認前は`runtime-verification-unverified`を維持する。

## 5. 利用者向けの安全な手順

1. 編集後、Editor上部が「保存済み」になるまで待つ。
2. オフライン表示中に作業する場合も、書き出しをバックアップとして保存する。
3. ページ更新やタブを閉じる前に、保存失敗が表示されていないことを確認する。
4. 保存失敗が出た場合は「保存を再試行」を押し、成功しない時は`.casproj`の退避や不要データの整理を先に行う。

## 6. 未完了の次工程

Group 21Cで、性能、アクセシビリティ、安全性を別PRとして扱う。オフライン用のアプリキャッシュ、更新時の差分案内、実機Safariの確認は、Group 21Bの自動検査を合格させた後に必要性を判断する。


## 7. CI記録

CI Run #852（Actions ID `32887615937`）で次を確認した。

- classify-changes: success
- build-and-test: success（lint / format / build / unit testを含む）
- e2e: success
- Chromium E2E: 202件成功（既存200件 + Group 21B 2件）
- H3計測、Pages公開、Pages閉鎖後のアプリ利用確認: success

このCIはChromium上の自動検査であり、iPhone / iPad Safariの実機オフライン確認ではない。