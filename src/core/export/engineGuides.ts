/**
 * ZIP に同梱するエンジン別の読み込み手順ガイド（Phase 16、要件 16.x）を Markdown 文字列として
 * 組み立てる純関数。Godot / Unity はエディタスクリプトを自動生成するのではなく、
 * atlas.json / spritesheet.png を各エンジンの機能でどう読み込むかを説明する文書を作る。
 */
import type { Asset } from '../model';

const AUTOGEN_DISCLAIMER =
  'この文書は読み込み手順の説明です。Godot のシーン / Unity のプレハブを自動生成するものではありません。';

const FILE_LIST = `- \`textures/main.png\`: 元テクスチャ
- \`atlas/spritesheet.png\`: 書き出し済みスプライトシート
- \`atlas/atlas.json\`: フレーム・アニメーション・原点・アンカー・当たり判定の定義
- \`asset.json\`: アセット全体の定義（.casproj から書き出したもの）`;

const COORDINATE_NOTE =
  '座標系: 左上原点、右方向が x+、下方向が y+、単位は px、回転は度（degree）です。';

/** 冒頭の共通見出し・注意書きを組み立てる。 */
function commonHeader(asset: Asset, engineName: string): string {
  return `# ${asset.displayName} - ${engineName} 読み込みガイド

> ${AUTOGEN_DISCLAIMER}

## 使うファイル

${FILE_LIST}

## 座標系

${COORDINATE_NOTE}
`;
}

/**
 * Godot 4 向けの読み込み手順ガイドを Markdown で生成する。
 */
export function buildGodotGuide(asset: Asset): string {
  return `${commonHeader(asset, 'Godot 4')}
## Sprite2D + AtlasTexture

1. \`atlas/spritesheet.png\` を Godot プロジェクトへインポートします。
2. フレームごとに \`AtlasTexture\` を作成し、\`region\` に \`atlas.json\` の
   \`frames[].x / y / width / height\` を設定します（1 フレーム = 1 AtlasTexture）。
3. \`Sprite2D\` の \`texture\` にそのフレームの \`AtlasTexture\` を割り当てます。

## AnimatedSprite2D

1. \`SpriteFrames\` リソースを作成し、\`atlas.json\` の \`animations[]\` ごとに
   アニメーション名（\`animations[].name\`）を追加します。
2. 各アニメーションの \`animations[].frames\` の並び順どおりに、対応する
   \`AtlasTexture\` を \`SpriteFrames\` へ追加します。
3. \`animations[].fps\` を \`SpriteFrames\` の再生速度に、\`animations[].loop\` を
   ループ再生の有無に反映します。

## 原点の補正（offset）

Godot の \`Sprite2D\` / \`AnimatedSprite2D\` はデフォルトでテクスチャ中心が基準になるため、
\`atlas.json\` の \`origin\`（左上原点）との差を \`offset\` で補正します。

\`\`\`
offset = Vector2(cellSize.width / 2 - origin.x, cellSize.height / 2 - origin.y)
\`\`\`

## 当たり判定（Collider）

\`atlas.json\` の \`colliders[]\` を、\`shape\` に応じて次のノードへ対応させます。

- \`rect\`: \`CollisionShape2D\` + \`RectangleShape2D\`（\`size\` に \`rect.width / rect.height\`）
- \`circle\`: \`CollisionShape2D\` + \`CircleShape2D\`（\`radius\` に \`circle.radius\`）

## アンカー（Anchor）

\`atlas.json\` の \`anchors[]\` は \`Marker2D\` として配置し、\`position\` にそれぞれの
\`x / y\` を設定してください（\`name\` はノード名に使うと分かりやすいです）。

## 自動生成について

\`.tscn\` の自動生成には対応していません。import helper script（atlas.json を読んで
\`.tscn\` を組み立てるエディタスクリプト）は将来課題です。設計メモとして、入力仕様は
\`docs/EXPORT_FORMATS.md\` を参照してください。
`;
}

/**
 * Unity 向けの読み込み手順ガイドを Markdown で生成する。
 */
export function buildUnityGuide(asset: Asset): string {
  const width = asset.canvasSize.width;
  const height = asset.canvasSize.height;

  return `${commonHeader(asset, 'Unity')}
## Sprite Import 設定

1. \`atlas/spritesheet.png\` を Unity プロジェクトへインポートします。
2. Inspector で \`Sprite Mode\` を \`Multiple\` にします。
3. \`Sprite Editor\` を開き、\`Slice\` の種類を \`Grid By Cell Size\` にして
   \`Pixel Size\` を \`(${width}, ${height})\`（\`asset.canvasSize\` の実値）に設定します。

## Custom Pivot（原点）

各スライスの \`Pivot\` を \`Custom\` にし、次の式で \`atlas.json\` の \`origin\` から
Unity の Pivot（左下原点・0-1 の正規化座標）へ変換します。
Unity の Pivot は Y 軸が下から上（v 軸反転）である点に注意してください。

\`\`\`
pivot = (origin.x / width, 1 - origin.y / height)
\`\`\`

## Animation クリップ

\`atlas.json\` の \`animations[]\` ごとに Animation クリップを作成し、
\`frames\` の並び順どおりにスプライトを打ちます。

- \`Samples\`（フレームレート）には \`animations[].fps\` を設定します。
- \`Loop Time\` は \`animations[].loop\` の値を反映します。

## Collider

\`atlas.json\` の \`colliders[]\` を、\`shape\` に応じて次のコンポーネントへ対応させます。

- \`rect\`: \`BoxCollider2D\`（\`size\` に \`rect.width / rect.height\`）
- \`circle\`: \`CircleCollider2D\`（\`radius\` に \`circle.radius\`）

PPU（Pixels Per Unit）換算に注意してください。Unity の Collider はワールド単位（Unit）で
サイズを持つため、px 値を \`Sprite\` の \`Pixels Per Unit\` で割った値を設定します。

## Anchor

\`atlas.json\` の \`anchors[]\` は、親スプライトの子 GameObject として配置し、
\`localPosition\` にそれぞれの \`x / y\`（Pivot 変換と同様に Y 軸反転に注意）を設定してください。

## 自動生成について

\`.prefab\` の自動生成には対応していません。import helper script（atlas.json を読んで
プレハブを組み立てるエディタスクリプト）は将来課題です。設計メモとして、入力仕様は
\`docs/EXPORT_FORMATS.md\` を参照してください。
`;
}
