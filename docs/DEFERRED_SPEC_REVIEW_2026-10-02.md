# 過去の除外仕様の再評価とイベント追加データ編集

判断日: 2026-10-02。基準: main `e04902b6d89821d58e2ec44ab8a44ee1d6019524`。
利用者から「過去にあえて外した仕様をPRに遡って確認し、必要なものを判断して仕様へ追加・実装する」指示を受けた。今回は、2D制作からゲーム向け出力までの不足を優先する。

## 調査範囲

初期のゲーム情報、制作・取込、timeline、collider、配布の代表PRを選び、PR本文、#205の元差分・discussion、関連ADRと現在のmodel/schema/UIを照合した。全PR・全除外項目の網羅監査ではない。古い「未実装」をそのまま現状と見なさず、後続実装と照合する。PRに理由がないものは、技術的に拒否されたと推定しない。

| 分野 / 履歴 | 当時の理由・境界 | 現在の判断 |
| --- | --- | --- |
| [#60](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/60)（7/11）、[#153](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/153)（7/23）、[#205](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/205) / [#206](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/206)（7/29）イベントpayload編集 | #60は不活性・浅いJSON契約、#153は保存/再生を先行、#205はpayload編集を明示除外。payload編集固有の技術的拒否理由は記録されていない。#206は当時の契約どおり | **今回採用**。[#289](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/289)（10/2）でWeb/PixiJS/Phaserの受取が実装され、利用者が音の識別名・威力などを画面から入力する価値が高まった |
| #205 イベント並べ替え | 同PRで除外。固有の技術的理由は記録なし。通知は既存配列順 | 今回は保留。既存の追加順で通知できる。並べ替えの明示UIとHistoryの別検査を行う余地はあるが、値を作れない不足を先に解消 |
| #205 出現位置ごとのevent / Frame削除cascade | Frame IDの反復すべてで発火する契約。参照切れを自動除去/再割当すると取込済み情報を失う | **境界維持**。payload追加を契機に保存意味・参照を変えない |
| [#156](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/156) / [#157](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/157)（7/24）B2 rig資源上限 | 生成Frame/LayerState/JSON/sheet容量の数値は実測を要するためB1から分離 | **別の信頼性課題として残す**。現在もrigPreflightは有限/安全整数を調べるが、B2数値上限は未実装。端末実測なしに安全上限や性能保証を創作しない。今回のpayload編集16 KiBはUI入力だけの防護でありB2の代替ではない |
| [#203](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/203) / [#204](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/204)（7/28）onion skinの色/透明度/枚数/保存設定 | 前後1件、赤/青25%、UI-onlyを明示採用 | 今回は保留。現方式は再生順・反復の確認に使える。調整は便利だが出力情報欠落ではなく、保存設定追加の優先度は低い |
| [#98](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/98) / [#102](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/102)（7/16）再編集可能な図形/文字 | 永続表現、renderer/export、font可搬性の設計が必要 | **別設計を維持**。現在のtexture-backed layerとraster文字/図形で制作可能。schema拡張なしで「再編集可能」とは表示しない |
| [#124](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/124) / [#125](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/125)（7/19）、[#135](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/135) / [#138](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/138)（7/20–21）native画像形式 | Aseprite parserは依存・license・browser・容量評価が必要。PSD/ORA/Kritaをreference-onlyで保存すると容量を使い、編集できると誤解させる。ORAはblend/opacity対応の検証後候補 | **理由付き非対応を維持**。SVG/GIF/APNG原本保持・raster取込は後続で実装済み。古い16コマ上限は現状ではなく、[#285](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/285)で64コマ/容量防護へ進んだ。ImageDecoder非対応環境では全コマ読取できないため、非対応表示を消さない |
| #60 / [#219](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/219)（8/2）polygon、animation単位collider上書き等 | polygonは座標/頂点順/自己交差/凸性/反転/schema/adapter契約が必要。Frame共有とanimation単位の意味も要設計 | **現契約を維持**。rect/circleとFrame別上書きを使う。visibleはdebug表示でありゲーム判定のenabledへ読み替えない |
| [#108](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/108)、[#122](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/122)、[#241](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/241)〜[#289](https://github.com/chameleonjp-lab/chameleonassetstudio/pull/289) | frame alignment、修復、一括変更、配布UI等は段階を分けていた | 後続の実装と区別。現在ある機能を再実装しない。今回はpayloadの制作→保存→配布という一つの不足を閉じる |

3D・課金・外部生成・WebGPU必須化は今回の2D不足補完へ含めない。別契約、環境、費用、端末検証が必要であり、過去の調査記録だけを製品採用と扱わない。

## 採用仕様

- 選択したイベントの「追加データ」から、既存schemaどおり文字列、有限数値、真偽値、null、それらだけの配列または平坦なobjectをJSONで編集する。コード/URLを評価・取得しない
- 未設定と明示nullを区別する。空欄は不正、削除buttonはpayloadプロパティだけを取り除く。文字列の空文字はJSONの `""` として保存可能
- 編集中はUI draftだけ。保存/削除だけが1 Historyへ入る。blur/Enterは保存せず、Escape/取消/対象切替/preview移行はdraftを破棄する。整形やobject key順だけの変更はno-op
- 編集入力はUTF-8 16 KiBまで。これは端末性能保証でも保存schema制限でもない。既存の大きなpayloadは読込・保持し、拒否時に切り詰めない。明示的な置換/削除は可能
- targetのpayloadと通常のupdatedAt以外は変えない。ID、name、Frame参照、順序、他event、未知fieldを維持。参照切れeventのpayload編集も参照を補正しない。重複ID等で対象が曖昧なら拒否
- preview/再生/alignmentは編集不可。他操作の保存防護に拒否された場合はdraftと理由を残し、再試行可能にする。Undo/Redo、保存エラー表示、再読込は既存経路を使う
- eventの情報を落とす旧ZIPは引き続き拒否する。新版0.2ではUIで入力したpayloadがWeb/PixiJS/Phaserへそのまま届く

変更対象は `animationEvents.ts` とunit、`EventPayloadEditor.tsx`、timeline/commit結果の接続、局所CSS、E2EとWebKit選択、利用者ガイド。この文書を仕様追加の根拠とする。asset.json/.casproj/schema/version/ZIP構造・dependencyに変更なし。

## 検証と残り

単体で型・入れ子・Infinity・容量境界・不変性・no-op・null/削除・曖昧IDを検査する。ブラウザでdraft/取消/明示保存/連打/Undo/Redo/再読込/mobile/previewを検査し、拒否commitの再試行も独立fixtureで確認する。既存24エンジンケースの先頭eventをUIから設定し、実ZIP受取の既存pixel/時間/event/collider検査を維持する。

GitHub exact-head CIと独立レビューをPRへ記録する。物理iPhone Safari、B2実測、他の保留候補、全履歴の網羅監査を完了と主張しない。
