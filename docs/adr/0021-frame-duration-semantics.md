# 0021-frame-duration-semantics

ステータス: accepted（2026-07-22 人間承認、T1）
上位文書: `docs/future/2D_3_TIMELINE_RIG_PLAN.md`（§3、§6 H1）、`docs/future/2D_ASSET_DATA_CONTRACT.md`（§8.2）
関連 fixture: 将来のT1実装sliceで追加（本ADRはdocs-only）

---

## 文脈

ADR-0008は、既存animationの時間をfpsとFrame数から導き、将来の可変時間をFrame単位のoptional上書きにすると決めた。Group 12で実装へ進む前に、同じFrameの再利用、Animation全体時間、休眠中の`Animation.durationMs`、複製、event、旧data互換を実装可能な形へ固定する必要がある。

## 決定

- `Frame.durationMs?: number`をoptional・additiveで追加する。値は有限かつ0より大きいms値とする。
- Animation内の各出現の実効時間は`frame.durationMs ?? 1000 / animation.fps`、全体時間は`frameIds`の各出現についてその値を合計したものとする。
- 同じFrameを複数Animationまたは同じAnimation内で再利用すると、全出現に同じoverrideが適用される。出現ごとに違う時間が必要ならFrameを複製する。
- `Animation.durationMs`はinformationalのまま維持し、再生、event、検査、派生exportの正本にせず、自動更新もしない。
- 既存Asset 0.2.0へ値を補完せず、fps-onlyの意味を変えない。versionとmigrationは変更しない。
- Frame単体複製は`durationMs`とFrame内容だけをコピーし、Animationの`frameIds`とeventを変更しない。既存eventは元Frameを参照したまま残し、複製Frameのeventは明示作成する。新規captureはoverrideを持たず、旧GIF / APNG importで失った時間を遡及復元しない。
- eventは対象Frameの表示開始時に発火し、同じFrameの各出現とloopの各周回で発火する。独立Asset複製と独立rig flipではevent IDを再採番し、`frameId`を完全mapで張り替える。linked mirrorの内部ID維持modeは既存規則に従う。dangling参照は意味検証で検出する。
- 再生、effect時間検査、関連consumerは同じ実効時間関数を使う。
- export対象Animationが参照するFrameの可変時間または対象Animationのeventを、固定fpsしか表現できない派生exportへ黙って均一化・削除しない。未参照Frameのoverrideだけでは派生exportを止めない。

## 根拠

- Frame単位なら既存fpsをfallbackとして残せ、旧dataを自動変換しないADR-0008 / ADR-0011 / ADR-0015の原則と一致する。
- 同じFrame IDの意味を参照先ごとに変えないことで、ID参照規則と保存roundtripを保てる。
- 現行`atlas.json`、helpers、examplesはfps固定で、可変時間やeventを表現できない。lossを黙らせないことは保存正本と派生物を分けるADR-0007とも一致する。

## 影響と fixture

- 将来の実装: Frame型・schema、再生scheduler、Frame複製、event、`assetInspection`、linked Family対応field、保存roundtrip、export preflight。
- fixture: fps fallback、duration override、同一Frame反復、loop / event、Frame単体複製のevent不変、Asset複製 / flipのevent ID一意性・frameId張替え・発火回数、削除、旧0.2.0 roundtrip、`.casproj`、対応不能exportの拒否またはloss確認を固定する。
- 影響なし: Project / export-presets / atlas version、IndexedDB layout、`.casproj`配置、既存GIF / APNG importのuniform fps写像。
- 本docs-only PRでは型、schema、製品UI、exportを変更しない。

## 再検討条件

派生exportの初期挙動は`2D_3_TIMELINE_RIG_PLAN.md`のH1で人間判断する。H1未決定の間はT1製品実装を開始しない。Animation出現単位のduration、Atlasへのduration / event追加、resample、有限repeat保存を採用する場合は、別ADR、形式version監査、独立review、人間承認を必要とする。
