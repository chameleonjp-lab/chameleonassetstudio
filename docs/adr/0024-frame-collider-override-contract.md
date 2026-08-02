# 0024-frame-collider-override-contract

ステータス: accepted（2026-08-02 人間承認 O1。Slice BはPR #218 / merge `bbe9df960170942ddac67cad737b77fcb93d7e8d`で完了。Slice CはDraft実装中・未検証）
上位文書: `docs/future/2D_3_GAME_DATA_PLAN.md`（§5〜§6.2、§9〜§12）、`docs/future/2D_ASSET_DATA_CONTRACT.md`（§9.2）
関連 fixture: Slice C `2D-3-COLLIDER-OVERRIDE`で追加する

---

## 文脈

ADR-0010は、当たり判定の正本を`Asset.colliders`に残し、上書きをFrame単位だけに置き、既存colliderの位置・サイズ・`visible`だけを変更できる境界を決めた。ADR-0011は`Frame.colliderOverrides?`をoptional・additiveにできる前方互換条件を決めた。Group 13では2026-08-02の人間判断でO1を採用したため、製品実装前にcanonicalな永続表現、fallback、検証、UI、参照変換、保存、書き出し拒否を一意にする。

本ADRはSlice Bで固定しmainへ反映した正本契約である。Slice Cはこの契約どおりTypeScript型、JSON Schema、製品UI、保存処理、書き出し処理、試験を実装中であり、CIと固定head独立監査が完了するまで検証済みとは扱わない。

## 決定

### 1. canonicalな永続表現

`Frame.colliderOverrides?`は配列とし、各要素はAsset共通colliderを`colliderId`で参照する。配列順はゲーム上の意味を持たない。

```ts
type FrameColliderOverride =
  | {
      colliderId: string;
      rect: { x: number; y: number; width: number; height: number };
      visible?: boolean;
    }
  | {
      colliderId: string;
      circle: { x: number; y: number; radius: number };
      visible?: boolean;
    }
  | {
      colliderId: string;
      visible: boolean;
    };

interface Frame {
  // 既存field
  colliderOverrides?: FrameColliderOverride[];
}
```

- geometryを保存する場合、rectは`x / y / width / height`、circleは`x / y / radius`をすべて持つ。geometry内部の部分patchは保存しない。
- `visible`だけのentryを許可する。geometryと`visible`はそれぞれ省略時にAsset共通値へfallbackする。
- entryは`rect`、`circle`、`visible`の少なくとも1つを持つ。`rect`と`circle`の同時保持は禁止する。
- canonical writer / UIは`shape`、`name`、`purpose`、entry固有`id`、`enabled`を生成・編集・解釈しない。既存dataでrecognized override fieldと併存する同名fieldは未知fieldとしてexact保持するが、上書き値やID参照として扱わない。これらのfieldだけではentryを成立させない。
- `colliderOverrides`不在と空配列は同じ意味である。新しい編集で最後のentryを解除した場合はfield自体を省略する。旧dataへ空配列を自動補完しない。
- Frame、override、geometryにある未知fieldは、既存の前方互換方針どおり保持する。ただし未知field内の意味やID参照を推測して変換しない。

### 2. 有効値の解決

対象FrameとAsset共通colliderから、利用時の値を次の順で決める。

1. `id`、`name`、`purpose`、`shape`は常にAsset共通colliderを使う。
2. geometryは参照先shapeと一致するFrame geometryがあれば使い、なければAsset共通geometryを使う。
3. `visible`はFrame値があれば使い、なければAsset共通値を使う。

同じFrameを複数Animation、または同じAnimation内の複数出現が参照しても、同じ有効値を使う。`visible`は編集・debug表示専用であり、ゲーム内の接触判定の有効・無効を表さない。

### 3. 構造検証と意味検証

JSON Schemaは次を構造検証する。

- `colliderId`は空でない文字列。
- rect / circleの必要field、number型、0より大きいwidth / height / radius。
- rectとcircleの排他、entryに少なくとも1つの上書きfieldがあること。
- 空配列を許可し、各階層の未知fieldを拒否しないこと。`shape`、`name`、`purpose`、`id`、`enabled`という名前もrecognized override fieldと併存する限り未知fieldとして許可・保持し、それだけでentryをvalidにしないこと。

専用のread-only runtime検証は次を意味検証する。

- 同一Frame内の`colliderId`重複。
- Asset共通colliderのID重複、参照切れ。
- 参照先shapeとrect / circleの不一致。
- 非有限座標、0以下のwidth / height / radius。

意味不正は自動修復、暗黙削除、Asset共通値への丸めを行わず、Frame、collider、理由を安定したcodeとpathで返す。`validateAsset`は構造検証の責務を維持し、専用検証を編集、保存、複製、反転、resize、削除、書き出しの各入口から共用する。

### 4. 編集UIと一時状態

- 再生停止中に明示選択したFrameと、Asset共通colliderを対象にする。Frame、collider、編集scopeの選択は一時UI状態であり保存しない。
- 既定scopeはAsset共通である。Frame別編集へ切り替えたことを表示し、意図せず共通値とFrame値を混ぜない。
- geometryを初めてFrame別編集するときは、現在の有効geometryを完全形でentryへ保存する。
- `visible`は「共通値を使う / 表示 / 非表示」の3状態とする。「共通値を使う」は`visible`をentryから除く。
- 「位置・サイズを共通へ戻す」はgeometryだけを除き、「このFrameの上書きをすべて解除」はentryを除く。field単位resetで最後のrecognized override fieldを除くと未知fieldだけが残る場合、そのresetは理由付きで拒否し、未知fieldを含むentry全体が失われることを示したうえで明示的な「上書きをすべて解除」を求める。entry全体を解除して何も残らなければ`colliderOverrides`も省略する。
- `visible: false`でも一覧から選択、解除、再編集できる。全体のdebug表示切替は保存しない。
- 入力中は一時表示だけを変え、Enterまたはblurで最大1 History、Escapeで取消、意味上のno-opではHistoryを作らない。

### 5. 複製、反転、resize、削除

- Frame複製は既存Frame全体をcloneしてから新しいFrame ID / nameだけを割り当て、entryとFrame上の未知fieldをdeep copyする。同じAsset内なので`colliderId`を維持する。既知fieldだけの再構築で未知fieldを落とさない。
- Asset複製は先にAsset共通colliderの完全ID mapを作り、全Frameの`colliderId`を同じmapで張り替える。
- 左右反転コピーはIDを張り替え、rectを`x' = 2 * mirrorX - x - width`、circleを`x' = 2 * mirrorX - x`で反転する。y、寸法、`visible`、未知fieldを保持する。
- linked mirror / refreshもcanonical overrideを対応対象とし、Family recipeのcollider ID mapで参照を張り替える。未対応の未知Frame fieldは既存どおりineligibleにできる。
- Asset canvas resizeはAsset共通colliderと同じ`dx / dy`をFrame geometryのx / yへ1回だけ加える。寸法は変えない。resize後の範囲外件数へFrame geometryも含める。
- D4 frame alignmentは既存LayerState write-setを変えず、Frame overrideを動かさない。
- 参照中のAsset共通colliderを削除、またはshape変更しようとした場合は、先に該当Frameのentry解除を求める。暗黙の連鎖削除・shape変換はしない。

### 6. 保存と失敗時復旧

- O1編集はmetadata-onlyの既存commit、History、autosave、IndexedDB経路を使う。新しいstore、index、Blob、snapshot形式を追加しない。
- semantic不正はcommit前に拒否する。保存失敗や容量不足では既存の原子的rollbackにより、React state、Asset、Project参照、History、IndexedDBの未確定変更を保存前へ戻し、pending autosaveを破棄する。metadata-only操作なのでBlobは変更しない。元の失敗は`AutosaveQueue`のerror state（`SaveState.status === 'error'`と`errorMessage`）として保持し、利用者へのerror表示を消さない。
- field不在の旧Asset / `.casproj`は不在のまま読み、保存し直しても意味を変えない。有効な新dataは単体`asset.json`、IndexedDB、`.casproj`で未知fieldを含めてroundtripする。
- Assetは`0.2.0`、Project / export-presets / Atlasは`0.1.0`を維持し、migrationと`.casproj`内部配置を変更しない。

### 7. 書き出し境界

1件以上のcanonical overrideを持つAssetについて、次を適用する。空配列だけでは拒否しない。

- 許可: PNG、WebP、単体`asset.json`、`.casproj`。
- 理由付き拒否: Atlasと一体のSprite Sheet API、`atlas.json`、それらとhelpers / examplesを含む製品ZIP。

Atlas `0.1.0`へAsset共通値だけを出してFrame値を落とさない。拒否は画像Blob読込、decode、canvas、ZIP生成、保存、download開始より前に行う。理由には対象Frame / collider、失われる情報、利用可能な`asset.json` / `.casproj`を含める。`buildAtlas`等のAssetを受け取る直接経路も同じ共通検査を使う。

## 根拠

- 先行fixtureは`colliderOverrides: [{ colliderId, rect: {...} }]`という配列・完全geometry形を使っている。
- `Frame.layerStates`もFrame単位の配列で、完全なtransformを保存する。完全geometryは反転・resizeをfallback推測なしで決定できる。
- `visible`だけを独立して保存できると、共通geometryの変更へ追従しながらFrameごとのdebug表示だけを変えられる。
- ADR-0002のID参照、ADR-0005の反転式、ADR-0011のoptional・additive、ADR-0014の三段検証、ADR-0015のversion方針と一致する。
- 現行Atlas、helpers、examplesはFrame別colliderを表現できないため、lossyな丸めより理由付き拒否が安全である。

## 影響と fixture

- Slice Bの影響はdocsだけだった。Slice Cでは型、schema、製品挙動、試験を追加する一方、version、migration、IndexedDB / `.casproj`配置、export ZIP構成、dependencyは変更しない。
- Slice Cの必須fixture: field不在、空配列、rect / circle / visible-only、partial geometry、rect / circle同居、recognized override fieldなし、空`colliderId`、予約名fieldのexact保持・非解釈、未知fieldだけを残すfield単位reset拒否と明示的なentry全解除、fallback、重複、参照切れ、shape不一致、非有限値、0以下寸法、共有Frame、Frame / Asset複製、flip、linked mirror、resize、D4非追従、削除拒否、History、Undo / Redo、autosave、IndexedDB、旧 / 新`.casproj`、保存失敗rollbackとerror表示保持、許可 / 拒否export、375 x 667。
- 既存`motionContract.fixtures.test.ts`の参照切れ例は、検証を弱めず、実在するAsset共通colliderを持つ正常fixtureへ直す。
- 物理SafariはGroup 13の追加停止Gateにせず、2D Pro全体の端末確認へ残す。

## 再検討条件

Animation単位上書き、Frame別collider追加・削除、`purpose` / `shape`変更、`enabled`、geometryの部分patch、polygon、Atlasへの保持またはloss確認付き変換を導入する場合は、別ADR、形式・互換性監査、人間承認を必要とする。Slice CはPR #218のmain反映と明示指示後に開始したが、Ready化・merge・Group 13 closeoutは別の判断とする。
