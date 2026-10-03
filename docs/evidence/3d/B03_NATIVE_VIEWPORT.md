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

## G03b native-render subset（未確認）

`tools/3d-evaluation/` の評価entryに限定し、トップ/2D/3D製品entryからimportしない。candidateのroot devDependency化だけで隔離したと見なさない。

必要証拠: 自作native box（三角形12面）の固定内容、実WebGL2画像、camera操作/reset、project swap、繰返しmount/dispose、hidden/freeze、manual GPU停止のrevision/source条件、context loss/復帰、unavailable fallback、resource/listener/RAF所有数、2D非取得。許可された既存CIで実行し、ローカルbrowserの既知sandbox拒否を再試行しない。

## G03c 製品採用（未確認）

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
