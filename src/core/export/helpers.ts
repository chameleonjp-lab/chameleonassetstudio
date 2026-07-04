/**
 * ZIP に同梱する「組み込み用ヘルパースクリプト」の生成（Phase 16、要件 16.x）。
 * examples.ts が生成する HTML は「動く見本」であるのに対し、こちらは実プロジェクトへ
 * コピーして使う ESM の .js ソース文字列を作る「組み込む部品」であり、役割を重複させない。
 * atlas.json / spritesheet.png は書き出しフォルダの `atlas/` に配置されている前提で、
 * それぞれの呼び出し側から相対パス（baseUrl 等）を渡してもらう設計にする（生成時定数への
 * 依存を最小にし、コピー先が変わっても動くようにするため）。
 */
import type { Asset } from '../model';

/** 座標系・使い方などヘルパー共通の先頭コメントを組み立てる。 */
function commonHeader(asset: Asset, usageLine: string): string {
  return `/**
 * ${asset.name} 用ヘルパー（Chameleon Asset Studio 書き出し）。
 *
 * 座標系: 左上原点、右方向が x+、下方向が y+、単位は px、回転は度（degree）。
 * 使い方: ${usageLine}
 * 前提: このファイルと同じ構成で書き出された atlas.json / spritesheet.png を
 *       fetch できる場所（例: 同一フォルダの atlas/ 以下）に配置してください。
 */`;
}

/**
 * Canvas 2D 用ヘルパー（chameleon-helpers.js）。
 * エンジン非依存で、fetch と Image / CanvasRenderingContext2D のみに依存する。
 */
export function buildCanvasHelpers(asset: Asset): string {
  return `${commonHeader(
    asset,
    "const { atlas, image } = await loadChameleonAtlas('./atlas/atlas.json');",
  )}

/**
 * atlas.json を fetch し、同階層の spritesheet.png（atlas.texture に記載のファイル名）を
 * Image として読み込んで decode 完了まで待つ。
 * @param {string} url atlas.json への URL（相対パス可）
 * @returns {Promise<{ atlas: object, image: HTMLImageElement }>}
 */
export async function loadChameleonAtlas(url) {
  const atlas = await (await fetch(url)).json();
  const textureUrl = new URL(atlas.texture, new URL(url, window.location.href));
  const image = new Image();
  image.src = textureUrl.href;
  if (typeof image.decode === 'function') {
    await image.decode();
  } else {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });
  }
  return { atlas, image };
}

/**
 * atlas.frames からフレーム名に対応する矩形を取得する。
 * @param {object} atlas atlas.json をパースしたもの
 * @param {string} frameName フレーム名
 * @returns {{ x: number, y: number, width: number, height: number } | undefined}
 */
export function getFrameRect(atlas, frameName) {
  const frame = atlas.frames.find((f) => f.name === frameName);
  if (!frame) {
    return undefined;
  }
  return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}

/**
 * 配置座標から描画位置を求める（描画位置 = 配置座標 - 原点）。
 * @param {{ x: number, y: number }} position 画面上に置きたい座標（原点基準）
 * @param {object} atlas atlas.json をパースしたもの
 * @returns {{ x: number, y: number }} drawImage に渡す描画位置
 */
export function applyOrigin(position, atlas) {
  return { x: position.x - atlas.origin.x, y: position.y - atlas.origin.y };
}

/**
 * atlas.anchors から role 名に対応するアンカー座標を取得する。
 * @param {object} atlas atlas.json をパースしたもの
 * @param {string} role アンカー名（例: 'hand', 'head'）
 * @returns {{ x: number, y: number } | null}
 */
export function getAnchor(atlas, role) {
  const anchor = atlas.anchors.find((a) => a.name === role);
  return anchor ? { x: anchor.x, y: anchor.y } : null;
}

/**
 * 原点（十字）、当たり判定（矩形・円 + 用途名）を Canvas 2D コンテキストへ重ね描きする。
 * examples.ts が生成する Canvas サンプルと同じ座標解釈（offsetX/offsetY は描画位置の左上）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} atlas atlas.json をパースしたもの
 * @param {number} [offsetX] 描画位置の x（drawImage に渡した値と同じにする）
 * @param {number} [offsetY] 描画位置の y（drawImage に渡した値と同じにする）
 */
export function drawColliderDebug(ctx, atlas, offsetX = 0, offsetY = 0) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '10px sans-serif';

  ctx.strokeStyle = '#ff2d55';
  ctx.beginPath();
  ctx.moveTo(offsetX + atlas.origin.x - 8, offsetY + atlas.origin.y);
  ctx.lineTo(offsetX + atlas.origin.x + 8, offsetY + atlas.origin.y);
  ctx.moveTo(offsetX + atlas.origin.x, offsetY + atlas.origin.y - 8);
  ctx.lineTo(offsetX + atlas.origin.x, offsetY + atlas.origin.y + 8);
  ctx.stroke();

  ctx.strokeStyle = '#22c55e';
  ctx.fillStyle = '#22c55e';
  for (const collider of atlas.colliders) {
    if (collider.shape === 'rect') {
      const r = collider.rect;
      ctx.strokeRect(offsetX + r.x, offsetY + r.y, r.width, r.height);
      ctx.fillText(collider.purpose, offsetX + r.x, offsetY + r.y - 2);
    } else {
      const c = collider.circle;
      ctx.beginPath();
      ctx.arc(offsetX + c.x, offsetY + c.y, c.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(collider.purpose, offsetX + c.x, offsetY + c.y - c.radius - 2);
    }
  }
  ctx.restore();
}

/**
 * atlas.animations から animationName に対応するアニメーションを解釈し、経過時間から
 * 現在のフレーム名を返す小さなアニメータを作る。
 * @param {object} atlas atlas.json をパースしたもの
 * @param {string} animationName 再生したいアニメーション名
 * @returns {{ frameName: (elapsedMs: number) => string }}
 */
export function createFrameAnimator(atlas, animationName) {
  const animation = atlas.animations.find((a) => a.name === animationName);
  if (!animation || animation.frames.length === 0) {
    return { frameName: () => atlas.frames[0].name };
  }
  const intervalMs = 1000 / animation.fps;
  return {
    frameName(elapsedMs) {
      let index = Math.floor(elapsedMs / intervalMs);
      if (animation.loop) {
        index = index % animation.frames.length;
      } else {
        index = Math.min(index, animation.frames.length - 1);
      }
      return animation.frames[index];
    },
  };
}
`;
}

/**
 * PixiJS v8 用ヘルパー（chameleon-pixi.js）。
 * PIXI は呼び出し側から実引数として受け取り、import はコメントで案内するだけに留める
 * （バンドラー構成の違いに依存しないようにするため）。
 */
export function buildPixiHelpers(asset: Asset): string {
  return `${commonHeader(
    asset,
    "import * as PIXI from 'pixi.js'; const { atlas, baseTexture } = await loadChameleonPixi(PIXI, './atlas/atlas.json');",
  )}

/**
 * atlas.json を fetch し、PIXI.Assets でスプライトシートの Texture を読み込む。
 * @param {typeof import('pixi.js')} PIXI 呼び出し側の pixi.js モジュール
 * @param {string} atlasUrl atlas.json への URL（相対パス可）
 * @returns {Promise<{ atlas: object, baseTexture: import('pixi.js').Texture }>}
 */
export async function loadChameleonPixi(PIXI, atlasUrl) {
  const atlas = await (await fetch(atlasUrl)).json();
  const textureUrl = new URL(atlas.texture, new URL(atlasUrl, window.location.href)).href;
  const baseTexture = await PIXI.Assets.load(textureUrl);
  return { atlas, baseTexture };
}

/**
 * atlas.frames から、フレーム名 -> Texture の Map を作る（Rectangle で切り出し）。
 * @param {typeof import('pixi.js')} PIXI
 * @param {object} atlas atlas.json をパースしたもの
 * @param {import('pixi.js').Texture} baseTexture loadChameleonPixi が返したテクスチャ
 * @returns {Map<string, import('pixi.js').Texture>}
 */
export function createPixiFrameTextures(PIXI, atlas, baseTexture) {
  const textures = new Map();
  for (const frame of atlas.frames) {
    const rect = new PIXI.Rectangle(frame.x, frame.y, frame.width, frame.height);
    textures.set(frame.name, new PIXI.Texture({ source: baseTexture.source, frame: rect }));
  }
  return textures;
}

/**
 * atlas.animations から AnimatedSprite を作る。fps は animationSpeed（60fps 基準）へ変換し、
 * loop をそのまま反映する。
 * @param {typeof import('pixi.js')} PIXI
 * @param {object} atlas atlas.json をパースしたもの
 * @param {Map<string, import('pixi.js').Texture>} textures createPixiFrameTextures の結果
 * @param {string} animationName 再生したいアニメーション名
 * @returns {import('pixi.js').AnimatedSprite}
 */
export function createPixiAnimatedSprite(PIXI, atlas, textures, animationName) {
  const animation = atlas.animations.find((a) => a.name === animationName);
  const frameNames = animation ? animation.frames : [atlas.frames[0].name];
  const frames = frameNames.map((name) => textures.get(name));
  const sprite = new PIXI.AnimatedSprite(frames);
  sprite.animationSpeed = animation ? animation.fps / 60 : 1;
  sprite.loop = animation ? animation.loop : true;
  return sprite;
}

/**
 * 原点を position 補正で適用する（sprite.position を origin 分ずらす）。
 * 別案: anchor を使う場合は cellSize から比率換算する（例:
 * `sprite.anchor.set(atlas.origin.x / atlas.cellSize.width, atlas.origin.y / atlas.cellSize.height);`）。
 * ただし anchor は回転・スケールの中心にも影響するため、当たり判定や原点表示との整合を
 * 取りやすい position 補正をデフォルトにしている。
 * @param {import('pixi.js').Sprite} sprite
 * @param {object} atlas atlas.json をパースしたもの
 */
export function applyPixiOrigin(sprite, atlas) {
  sprite.position.set(sprite.position.x - atlas.origin.x, sprite.position.y - atlas.origin.y);
}

/**
 * 当たり判定（矩形・円）を Graphics に描く。
 * @param {import('pixi.js').Graphics} graphics
 * @param {object} atlas atlas.json をパースしたもの
 */
export function drawPixiColliderDebug(graphics, atlas) {
  graphics.clear();
  for (const collider of atlas.colliders) {
    if (collider.shape === 'rect') {
      const r = collider.rect;
      graphics.rect(r.x, r.y, r.width, r.height).stroke({ width: 1, color: 0x22c55e });
    } else {
      const c = collider.circle;
      graphics.circle(c.x, c.y, c.radius).stroke({ width: 1, color: 0x22c55e });
    }
  }
}
`;
}

/**
 * Phaser 4 用ヘルパー（chameleon-phaser.js）。
 * spritesheet の読み込みには cellSize（frameWidth/frameHeight）が必要なので、
 * preload では atlas.json を先に読み込み、create 側でスプライトシートを追加する
 * 2 段構成にする（1 関数に無理に詰め込まない）。
 */
export function buildPhaserHelpers(asset: Asset): string {
  return `${commonHeader(
    asset,
    "// preload(): preloadChameleonAsset(this, 'hero', './atlas'); " +
      "// create(): const atlas = this.cache.json.get('hero-atlas'); " +
      "this.textures.addSpriteSheet('hero', this.textures.get('hero-sheet').source[0].image, " +
      '{ frameWidth: atlas.cellSize.width, frameHeight: atlas.cellSize.height });',
  )}

/**
 * preload() 内で呼び出す。atlas.json を JSON として、spritesheet.png を画像として読み込む。
 * cellSize が未確定な時点なので spritesheet はまず画像として読み込み、create() 側で
 * atlas.json の cellSize を使って addSpriteSheet する（下記 createChameleonAnims と併用）。
 * @param {Phaser.Scene} scene
 * @param {string} key 生成するテクスチャ・JSON のキーの元になる名前
 * @param {string} baseUrl atlas.json / spritesheet.png が置かれているフォルダの URL
 */
export function preloadChameleonAsset(scene, key, baseUrl) {
  scene.load.json(key + '-atlas', baseUrl + '/atlas.json');
  scene.load.image(key + '-sheet', baseUrl + '/spritesheet.png');
}

/**
 * atlas.animations から scene.anims.create でアニメーションを登録する。
 * フレーム名 -> フレーム index は atlas.frames の並び順に対応する
 * （事前に this.textures.addSpriteSheet(key, ...) 済みであること）。
 * @param {Phaser.Scene} scene
 * @param {string} key addSpriteSheet で使ったテクスチャキー
 * @param {object} atlas atlas.json をパースしたもの
 */
export function createChameleonAnims(scene, key, atlas) {
  const frameIndexByName = new Map(atlas.frames.map((frame, index) => [frame.name, index]));
  for (const animation of atlas.animations) {
    scene.anims.create({
      key: animation.name,
      frames: animation.frames.map((name) => ({
        key,
        frame: frameIndexByName.get(name),
      })),
      frameRate: animation.fps,
      repeat: animation.loop ? -1 : 0,
    });
  }
}

/**
 * atlas.colliders をそのまま返す。Arcade Physics で使う場合の例:
 * \`\`\`js
 * const collider = readColliders(atlas).find((c) => c.purpose === 'hurtbox');
 * if (collider.shape === 'rect') {
 *   sprite.body.setSize(collider.rect.width, collider.rect.height);
 *   sprite.body.setOffset(collider.rect.x, collider.rect.y);
 * }
 * \`\`\`
 * @param {object} atlas atlas.json をパースしたもの
 * @returns {Array<object>} atlas.colliders
 */
export function readColliders(atlas) {
  return atlas.colliders;
}

/**
 * 原点を Phaser の setOrigin（0-1 の比率）に変換して適用する。
 * @param {Phaser.GameObjects.Sprite} sprite
 * @param {object} atlas atlas.json をパースしたもの
 */
export function applyPhaserOrigin(sprite, atlas) {
  sprite.setOrigin(atlas.origin.x / atlas.cellSize.width, atlas.origin.y / atlas.cellSize.height);
}
`;
}
