# 外部 GitHub 追加調査 — earthtojake/text-to-cad

作成日: 2026-07-27  
対象: `chameleonjp-lab/chameleonassetstudio`  
状態: reference only / implementation not approved  
関連: `docs/future/EXTERNAL_GITHUB_REFERENCE_CATALOG.md`, `docs/future/EXTERNAL_GITHUB_REFERENCE_REVIEW_2026-07-26.md`

## 1. 結論

[earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad) は、Chameleon Asset Studio（CAS）の全3Dパイプラインへ直接採用する候補ではない。ただし、将来の機械部品、建築部品、乗り物部品、治具、規則的な道具など、寸法と形状条件が重要な3D素材を扱う追加モジュールでは強い参考になる。

| 観点 | 評価 | 判断 |
|---|---|---|
| ゲーム制作 | B / MEDIUM | 機械的な小道具、建物部品、衝突確認用の規則形状、寸法付きプロトタイプを作る手順が参考になる。人物、動物、自然物などの有機的な素材生成には向かない。 |
| CAS | B / MEDIUM | STEPを正本にして、寸法検査、位置関係検査、画像確認を行い、GLB・STL・3MFへ派生出力する流れが、CASの非破壊・検品・書き出し方針と合う。 |
| 将来のParametric CADモジュール | A相当 | 一般3D機能から分離した追加モジュールとして、文章から寸法付き機械部品を作る場合は優先して読む。 |

既存カタログへ統合するときの候補IDは `3D-EXT-082` とする。最新mainで重複を再確認してから確定する。

調査時点で固定したcommit:

- `fdbb4b4fb62d95ae298cfe9a46fdc7092bdaf423`
- 公開版: `0.3.9`

## 2. Repositoryの性格

このrepositoryは、文章や画像から単に見た目の3D meshを作るものではない。CAD、ロボット記述、製造用データをAI agentが作成・検査・確認・受け渡しするためのSkill群である。

主な範囲:

- STEPを正本にしたparametric CAD
- STEP / STL / 3MF / GLBの生成と確認
- DXF、G-code、URDF、SRDF、SDF
- 市販STEP部品の検索
- CAD Viewerによるlocal browser確認
- 製造前チェック
- 実験的なbrowser-native implicit CAD

CASで重要なのは、形式の多さではなく、生成物をそのまま成功扱いせず、正本、派生出力、寸法検査、画像確認、受け渡しを分けている点である。

## 3. CASに有用な設計

### 3.1 STEPを正本にして派生出力を分ける

CAD Skillは、STEPを主な成果物とし、STL、3MF、GLBを二次的な派生出力として扱う。Python generatorが存在する場合は、生成済みSTEPを直接編集せず、sourceを編集して再生成する。

CASで参照する点:

- Source、編集定義、検品済み正本、配布用派生物を分ける。
- 表示用GLBや軽量meshを正本へ昇格させない。
- 同じsourceとparameterから成果物を再生成できるようにする。
- 出力形式の都合で元の寸法、構造、名前、組立関係を黙って失わない。

これはCASのSource verbatim保持、派生出力、before / after比較、provenanceと一致する。

### 3.2 自然文を先にCAD briefへ変換する

実装前に、寸法、単位、座標、featureの目的、出力先、仮定、検証項目を文章の設計書へ変換する。曖昧な依頼をすぐ形状コードへ変換せず、何を作り、何を測れば完成かを先に決める。

CASで参照する点:

- AI生成依頼を直接実行せず、構造化された生成briefへ変換する。
- 単位、原点、上方向、前方向、expected boundsを先に確定またはunknownとして記録する。
- 生成後の合否を、見た目だけでなく事前の検証項目と照合する。
- named parameterを保持し、後から寸法を変えて再生成できるようにする。

### 3.3 数値検査と画像確認を両方必須にする

CAD Skillは、形状生成後にgeometry facts、plane、寸法、位置、alignment、diffを確認する。さらに、数値検査が成功していてもsnapshot確認を省略しない。

CASで参照する点:

- triangle数やboundsなどの数値検査だけで、見た目を合格にしない。
- 画像比較だけで、寸法、原点、参照、構造を合格にしない。
- fixed cameraの正面、上面、側面、斜視を小さなreview packetとして残す。
- 失敗時は原因となる最小範囲だけを直し、再生成して同じ検査を繰り返す。

これは`F-3D-03` inspection、`F-3D-12` before / after comparison、visual-performance gateの強化材料になる。

### 3.4 明示したfileだけを処理する

CAD Skillは、directory全体を暗黙に処理せず、対象fileを明示して生成・検査する。Viewerもartifact rootと相対file pathを分け、実在確認後にreview linkを返す。

CASで参照する点:

- AIやmoduleがproject全体を無断走査しない。
- 利用者が選んだAsset、明示した派生候補、許可したworkspaceだけを処理する。
- 生成元sourceと生成物fileを取り違えない。
- review URLやpreview対象を返す前に、対象が実在し、許可root内にあることを確認する。

### 3.5 形式別Skillを分ける

CAD、DXF、G-code、URDF、SDFなどを一つの巨大な手順へまとめず、最も狭いSkillを選ぶ構成になっている。

CASで参照する点:

- CoreへCAD、robotics、fabrication機能を混ぜない。
- `Parametric CAD`、`Robot Description`、`Fabrication Export`をinstall-on-demand moduleとして分離する。
- moduleが未導入でも、CASの通常2D / 3D projectを開ける状態を維持する。
- module固有形式をCAS共通の正本形式として扱わない。

## 4. Browser-native implicit CAD

実験機能として、JavaScript module内にGLSLの距離関数を持ち、browserのraymarchingで形状を表示する`implicit CAD`がある。sphere、box、capsule、boolean、repeat、honeycomb、gyroidなどをparameter付きで構成でき、GLB、STL、3MFへmesh化できる。

CASでの位置づけ:

- 規則的なeffect volume、collision prototype、procedural prop、lattice、洞窟断面などの将来研究には有用。
- parameterを変えて複数候補を決定的に生成する例になる。
- source moduleとmesh exportを分ける考え方は有用。

ただし、CASの通常3D正本にはしない。実行可能なJavaScriptとGLSLをprojectへ保存することは、静的なGLBより危険性が高い。採用する場合は次が必須になる。

- 未信頼codeをCAS本体の権限で実行しない。
- network、filesystem、DOM、host APIへ触れない隔離runtime。
- 実行時間、shader step、bounds、mesh resolution、出力triangle数の上限。
- source codeを含むことを利用者へ明示する。
- 静的meshへ変換した結果だけを通常Assetへ取り込む経路。

## 5. ゲーム制作に使える範囲

ゲームで直接役立つのは、次のような硬い形と正確な寸法が必要な素材である。

- 箱、容器、筐体、台座、棚、扉、階段
- 車輪、歯車、配管、軸、ブラケット
- 武器の機械部分、乗り物部品、機械装置
- collider検証用の規則形状
- procedural levelで使う寸法付きbuilding kit

特に、同じparameterから1x / 2xの候補や破損状態、開閉状態を再生成する場合に向く。

一方、次には不向きである。

- 人物、動物、植物、布、髪
- 手描き風の自然な歪み
- textureやmaterialが中心となる見た目
- animation済みcharacter asset

そのため、ゲーム用3D生成全体を置き換えるものではなく、mechanical / architectural prop専用の外部生成providerまたはmoduleとして扱う。

## 6. 既存仕様への接続

直接関係する既存項目:

- `F-3D-01 GLB / glTF safe loading`
- `F-3D-03 3D viewport & inspection`
- `F-3D-04 scene graph / node / mesh / material inspection`
- `F-3D-05 origin / orientation / scale`
- `F-3D-10 mesh simplification`
- `F-3D-12 before / after comparison`
- `F-CORE-06 inspection / validation frame`
- `F-CORE-07 export frame`
- `F-MOD-01`〜`F-MOD-06`
- `F-CORE-09 Extension Host`
- `F-CORE-10 capability / permission enforcement`
- `IDEA-3D-03 code-to-3D制作`
- `IDEA-3D-10 Local provider / agent bridge`

追加候補:

### `IDEA-3D-11 Parametric CAD / Mechanical Asset Provider`

文章または寸法表から、機械部品・建物部品・治具などを外部providerで生成し、検品済みSTEPとgame用GLBをCASへ戻す。

必須条件:

1. STEPまたは同等のparametric sourceをprovider側の正本として保持する。
2. CASには元依頼、parameter、単位、座標、provider version、source hash、STEP hash、GLB hashをprovenanceとして記録する。
3. CAS内の正本GLBを外部providerが直接上書きしない。
4. 生成結果をbounds、原点、scale、node、material、triangle、textureで再検査する。
5. sourceとGLBの意味差、失われたassembly情報、寸法精度を表示する。
6. providerが無くてもCAS projectを開け、既存の静的Assetを編集・書き出しできる。
7. CAD moduleを導入していない利用者の起動時間、memory、配布容量を増やさない。

## 7. 境界・注意

- 実行にはPython 3.12以上、`build123d`、`cadquery-ocp`など、browserやiPhoneへ直接載せられない環境が必要である。
- README上部にはPython 3.11+の表示が残るが、`cadpy 0.3.9`のpackage設定はPython 3.12以上を要求する。採用時はREADMEだけを信用せず、固定releaseの実際のrequirementsを確認する。
- CAD Viewerはlocal Node serverを前提とし、公開Web viewerやCAS内viewerとしてそのまま使うものではない。
- STEP、STL、3MF、GLB間で保持できる情報が異なる。変換成功を意味上の完全一致と表現しない。
- 製造可能性、強度、耐熱、電気安全、公差、法令適合を自動で保証しない。
- 自動生成した機械部品を実物製造へ使う場合は、専門家確認と実測を別に行う。
- robotics、G-code、printer連携をCASの一般3D機能へ持ち込まない。
- root licenseはMITだが、同梱・取得する市販部品、robot model、外部素材の条件は別に確認する。
- `main`はprovider installer向けの生成物を含む公開branchで、開発は`develop`を基準としている。コード調査では対象branchとreleaseを固定する。
- 2D Pro Gateおよび3D実装の人間承認条件を維持する。

## 8. 採用判断

現時点では、CAS本体へのdependency追加やCAD機能の実装は行わない。

採用するのは次の知見だけである。

- parametric sourceを正本にし、meshを派生物として扱う。
- 自然文から検証可能なbriefを作る。
- 数値検査とsnapshot確認を併用する。
- 明示したfileだけを処理する。
- formatごとの責務をmoduleへ分ける。
- 外部providerが停止してもCAS projectを壊さない。

`text-to-cad`は、CASの通常3D編集の参考というより、将来の`Parametric CAD / Mechanical Asset Provider`を検討するときの必読資料として残す。