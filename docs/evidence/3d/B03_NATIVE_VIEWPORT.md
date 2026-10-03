# B03 native viewport限定評価と採用記録

## 実行範囲

PR298をユーザーがmergeしたmain `37572274d5e6f8404d2460c2e0bbd0f84f2649c3` を基準に、採用計画G03a→G03b→限定G03cを順に確認する。

この段階はnativeの小さなshapeの描画、camera、resource寿命だけを対象とする。GLTFLoader、GLB入力/資源検査、decoder、skin/clip/exportは未検証の別gateである。S01全体・B03全体・3D制作完成を示さない。

## G03a 固定配布物と利用条件

`three@0.186.1`、公式npm tarball `https://registry.npmjs.org/three/-/three-0.186.1.tgz`。SHA512は `sha512-blFeqb49wRCSGUGj7gtpfnSGHy2lwDk94RhUmS1c/hTby70kvChbWpkJ4Pm1390LqzzvTmzgXKHPEafJwCb8jA==` と一致（4,648,523bytes）。同梱LICENSEはMIT、copyright 2010–2026 three.js authors、runtime依存なし。使用候補はcoreと明示OrbitControlsのみ。Addons barrel、物理、decoder等をruntimeへ入れない。

上流r186の固定commit候補は採用計画DEC-01の `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8`。npm archiveとの全ソース同一性・registry署名を別途検証済みとは扱わない。

| package | 固定版 | 実LICENSE | npm integrity / tarball再計算一致 |
| --- | --- | --- | --- |
| @types/three | 0.186.0 | MIT | `sha512-mxYSBpDC+D0pLfSP6sW4WZTcT+nrtmZcimMqnVmy36Hte3XpeYSrvgg4TRdaM1GemGog1AWzI5qL2VoIfMXbJQ==` |
| @types/webxr | 0.5.24 | MIT | `sha512-h8fgEd/DpoS9CBrjEQXR+dIDraopAEfu4wYVNY2tEPwk60stPWhvZMf4Foo5FakuQ7HFZoa8WceaWFervK2Ovg==` |
| @types/stats.js | 0.17.4 | MIT | `sha512-jIBvWWShCvlBqBNIZt0KAshWpvSjhkwkEu4ZUcASoAvhmrgAUI2t1dXrjSL4xXVLB4FznPrIsX3nKXFl/Dt4vA==` |
| meshoptimizer | 1.1.1 | MIT | `sha512-oRFNWJRDA/WTrVj7NWvqa5HqE1t9MYDj2VaWirQCzCCrAd2GHrqR/sQezCxiWATPNlKTcRaPRHPJwIRoPBAp5g==` |
| @tweenjs/tween.js | 23.1.3 | MIT | `sha512-vJmvvwFxYuGnF2axRtPYocag6Clbb5YS7kLL+SO/TeVFzHqDIWrNKYtcsPMibjDx9O+bu+psAy9NKfWklassUA==` |
| @dimforge/rapier3d-compat | 0.12.0 | Apache-2.0 | `sha512-uekIGetywIgopfD97oDL5PfeezkFpNhwlzlaEYNOA0N6ghdsOvh/HYjSMek5Q2O1PYvRSDFcqFVJl4r4ZBwOow==` |
| fflate | 0.8.3 | MIT | `sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==` |

全archiveのmanifestと実LICENSE、SHA512/SHA1を読取照合した。@types/threeの6依存は上表で閉じ、leafの追加runtime/peer/optional/bundled依存なし。別NOTICEなし。TweenのRobert Penner attributionとRapierのApache全文を保持する。既存fflate0.8.3の解決値は変えない。

評価専用package/lockで全8 package（Threeを含む）を厳密固定。install scriptsを無効化して取得し、lockの各version/integrityが監査済みarchiveと完全一致することを確認した。型とruntimeの互換は次のコンパイル/実描画で判断する。

## G03b native-render subset（評価headで確認済み）

評価headでは `tools/3d-evaluation/` の評価entryに限定し、トップ/2D/3D製品entryからimportしなかった。candidateのroot devDependency化だけで隔離したと見なさない。

必要証拠: 自作native box（三角形12面）の固定内容、実WebGL2画像、camera操作/reset、project swap、繰返しmount/dispose、hidden/freeze、manual GPU停止のrevision/source条件、context loss/復帰、unavailable fallback、resource/listener/RAF所有数、2D非取得。許可された既存CIで実行し、ローカルbrowserの既知sandbox拒否を再試行しない。

## G03c native表示だけの限定採用（製品接続後の最終検査中）

G03bのnative subsetを実証してから、その契約だけを製品へ接続する。GLB等の未検証契約を同時採用しない。接続後の最終headで2D回帰・browser・domain分離を再検査する。

## ハーネス

Studioの全体採用pinは引き続き未確認。採用計画DEC-10が参照するbatch検査 `50229ded69378ed6392453e73856482eb78b7354` との参考/採用区別を維持する。自動upgradeはしない。

## 未確認条件

iPhone実機、GPU/OS実メモリ、全skin/clip/export/GLB、停止中の旧GLB評価は未実施。mocked unitやresource counterだけで実GPU解放を証明しない。


## 提出前レビューとローカル検査

| ID | 実際に確認した問題 | 是正と検査 |
| --- | --- | --- |
| NVR-01 | canonical metallicがThreeのmetalnessへ渡らない | 正しい引数名、非zero値の回帰 |
| NVR-02 | context loss→unsupported→validがcanvasなしで停止する | 破棄したcontextの状態を解除し再構築する回帰 |
| NVR-03 | 復帰の初期化失敗後に二度目のresumeができない | 失敗時も休止状態を保持し、成功する再試行を検査 |
| NVR-04 | 描画例外後にGPU所有物が残る | errorでrenderer/graph/canvas/contextを解放し再構築可能にする |
| NVR-05 | renderer constructor例外で先に取得したraw contextが残る | raw contextを所有し、失敗時も解放するspy検査 |
| NVR-06 | 同project編集でcameraが戻り、休止中の別projectが旧画角になる | 同IDのcamera保持と、新IDの遅延fitを数値検査 |
| NVR-07 | triangle単位の同material groupが不要なdraw callを作る | 隣接同material groupを結合。boxは1 group、正本の面順は不変 |

109ファイル/1152 unit tests（候補26件を含む）が成功。lint、アプリ+H3 build、独立候補build、CI分類が成功。整形指摘を修正し、再確認も成功。GPUの実測結果ではない。
基準mainの[統合CI 37131413897](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/37131413897)も全成功を確認。

候補にはnative-only `compact-evaluation-0` のnodes/depth/geometry/expanded corners/instances境界を適用する。renderer派生表現の上限でありGLB入力検査を代替しない。合計メモリの実測保証でもない。


## G03b実測結果とG03c限定判断

評価head `24015d7c43d09569ce54b61e81bbb4eb8eb95d34`、tree `b66ab845feda75a34e6c7604d5b71b99a62e6dc3` の[CI983](https://github.com/chameleonjp-lab/chameleonassetstudio/actions/runs/37133785556)が全成功。
Chromium294、WebKit107、production18、H3、Pages open/closedが成功。新しいnative描画4caseは両browserで実行した。devのbuilt-manifest専用1caseはproductionの両engineで実行する既存分担を維持する。

実画像を目視し、3面の形状・陰影、camera操作後の画角、context復帰後の表示を確認した。
最初のPNGは初期camera、復帰後PNGは操作後cameraである。両PNGを直接同一画像とは扱わない。テスト内では「操作後・loss直前」のPNGと復帰後PNGが一致することを検査している。

- [Chromium初期画像](images/chromium-native-box.png) / [操作後のcontext復帰画像](images/chromium-native-box-after-context-restore.png)
- [WebKit初期画像](images/webkit-native-box.png) / [操作後のcontext復帰画像](images/webkit-native-box-after-context-restore.png)
- [画像SHA256と対象head](images/native-evaluation.json)

この結果により、Three0.186.1のcore/OrbitControlsをnative静止mesh表示・camera・resource再構築へ限定採用する。保存正本をThreeへ移さず、GLTFLoader/exporter/decoderやskin/clipを同時採用しない。rootの固定dependency/型/overridesとlockの新規7packageはG03a監査値に一致、既存lock entryは一件も変更していない（既存fflateを再利用）。runtime MIT noticeを `public/licenses/three-MIT.txt` で配布する。

評価packageの独立lockは評価commitに保存済み。製品採用後はrootの固定lockへ統合し、評価入口は同じproduct adapterを継続検査する。製品入口から評価pageへ依存しない。

接続で追加するcameraボタン、PNG同期・非同期factory保全、箱commandは最終headの追加unit/browser検査対象であり、評価headだけの結果で合格とはしない。VIEW-01の数値camera/正面等preset、VIEW-02/03の追加表示、GLB/skin/clip、iPhone実機は未完了。


## 製品接続での追加是正

- keyboard camera操作を追加し、同期操作ではfocused buttonを無効化しない。連続Enter操作のfocusをbrowserで検査する
- PNGのencoding前に表示revisionを同期し、encoding後も同じproject/revisionを照合する
- factory/port例外を局所error状態へ戻し、遅れたfactoryは切り離したhostだけを破棄する
- lazy chunk失敗では常駐の保存/backupを維持し、成功保存・writer解放後に明示ボタンでページを再読込する。古いReact.lazyの失敗Promiseを単なる再openで直せるとは案内しない
- 保存待ち中の新しい編集は、古い保存成功でGPU破棄を許可しない。fake-port browser fixtureで検査する

Three依存はM06予定境界の `src/adapters3d/three/renderer.ts` に置き、renderer-free契約を `src/core3d/ports/renderPort.ts` へ置く。UIとadapterが別々の契約型を持たない。coreの正本とUndo/保存はThreeをimportしない。


製品接続候補のローカル検査: 1178 unit tests（native adapter49件、箱/保存等を含む）、TypeScript、lint、format、app/H3/評価entry build、CI分類が成功。test-only fixtureのFast Refresh警告はcomponent exportに直し、対象lintを再確認した。build auditでhub/2DのThree/adapter到達なし、3Dのlazy closureだけにThreeがあることを確認した。最終browser判定はPRの対象head CIへ記録する。


## 本番WebKitの通信中断復旧

製品接続head `6d01be8c6e0c1c4c1c2a8c8197c658bb2c739a70` のCI984では、dev両engineと本番Chromiumは成功したが、本番WebKitだけoffline chunk失敗後の表示復旧が失敗した。保存・backup・再読込・writer再取得は成功し、失敗箇所はpanelのlazy load boundaryだった。

生成bundleのmodulepreloadと[WebKit bug 270357](https://bugs.webkit.org/show_bug.cgi?id=270357)の既知挙動が一致するため、native panel/rendererだけJS先読みを抑制する。通常のdynamic importとCSS待機は維持する。Vite6実装はCSSをresolveDependenciesの前に分離して後で再追加する。原因の完全な同定とは扱わず、同じoffline失敗・保存・再読込・再表示の受入条件を維持して再検査する。error詳細とrequest/response/navigationをartifactに残し、routingによるcache無効化や期待値緩和は行わない。
