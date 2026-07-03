/**
 * ZIP に同梱するサンプルコードの生成（Phase 11、要件 11.9）。
 * atlas.json / spritesheet.png を実際のゲーム側で読み込む最小例を HTML 文字列として組み立てる。
 * ブラウザ API に依存しない純関数のみを置き、Node でもテストできるようにする。
 *
 * いずれのサンプルも、完成したゲームではなく「アセットを読み込む最小例」である。
 * fetch は file:// では動作しないため、ローカルサーバー（例: `npx serve`）で開く必要がある。
 */
import type { Asset } from '../model';

/** fetch が file:// では動かない旨の注意書き（各サンプル共通）。 */
const LOCAL_SERVER_NOTE =
  'fetch() は file:// では動作しません。ローカルサーバーで開いてください（例: npx serve .）。';

/** デバッグ表示（原点・アンカー・当たり判定）の凡例文（各サンプル共通）。 */
const DEBUG_LEGEND =
  'デバッグ表示: 原点（赤い十字）、アンカー（青い点と名前）、当たり判定（緑の矩形・円と用途名）を重ねて描画します。';

/** サンプルに埋め込む値（生成時に asset から抜き出したもの）。 */
interface EmbeddedInfo {
  cellSize: { width: number; height: number };
  firstAnimationName: string | null;
  firstAnimationFps: number;
  firstAnimationLoop: boolean;
}

function embeddedInfo(asset: Asset): EmbeddedInfo {
  const first = asset.animations[0];
  return {
    cellSize: { width: asset.canvasSize.width, height: asset.canvasSize.height },
    firstAnimationName: first?.name ?? null,
    firstAnimationFps: first?.fps ?? 8,
    firstAnimationLoop: first?.loop ?? true,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** cellSize と初期アニメーションを生成時に埋め込む JS 定数（3 サンプル共通）。 */
function embeddedConstantsScript(info: EmbeddedInfo): string {
  const animationComment = info.firstAnimationName
    ? `      // 埋め込みデータ（生成時に asset から埋め込み）: 初期アニメーション "${info.firstAnimationName}"（fps: ${info.firstAnimationFps}, loop: ${info.firstAnimationLoop}）`
    : '      // このアセットにはアニメーションが登録されていないため、先頭フレームを表示します。';
  const embeddedAnimation = info.firstAnimationName
    ? `{ name: '${info.firstAnimationName}', fps: ${info.firstAnimationFps}, loop: ${info.firstAnimationLoop} }`
    : 'null';
  return [
    `      // cellSize は Sprite Sheet の 1 コマのピクセルサイズ（生成時に asset.canvasSize から埋め込み）`,
    `      const CELL_SIZE = { width: ${info.cellSize.width}, height: ${info.cellSize.height} };`,
    animationComment,
    `      const EMBEDDED_ANIMATION = ${embeddedAnimation};`,
  ].join('\n');
}

const COMMON_STYLE = [
  '      body { font-family: sans-serif; background: #111; color: #eee; padding: 16px; }',
  '      h1 { font-size: 18px; }',
  '      label.debug-toggle { display: inline-block; margin-bottom: 8px; font-size: 14px; }',
  '      #stage { border: 1px solid #444; background: #222; }',
  '      p.note { font-size: 12px; color: #aaa; max-width: 640px; }',
].join('\n');

/**
 * Canvas 2D 用サンプル HTML を生成する。
 * 外部依存なし（素の JS、requestAnimationFrame ループ）。
 */
export function buildCanvasExample(asset: Asset): string {
  const info = embeddedInfo(asset);
  const title = `${escapeHtml(asset.displayName)} - Canvas 2D サンプル`;

  return `<!doctype html>
<!--
  ${LOCAL_SERVER_NOTE}
  Chameleon Asset Studio が書き出した Canvas 2D 用サンプルです。完成ゲームではなく、
  atlas.json / spritesheet.png を読み込んでキャラクターを表示する最小例です。
-->
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
${COMMON_STYLE}
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p class="note">${LOCAL_SERVER_NOTE}</p>
    <p class="note">${DEBUG_LEGEND}</p>
    <label class="debug-toggle">
      <input type="checkbox" id="debug-toggle" checked />
      デバッグ表示（原点・アンカー・当たり判定）
    </label>
    <div>
      <canvas id="stage" width="${info.cellSize.width}" height="${info.cellSize.height}"></canvas>
    </div>
    <script>
${embeddedConstantsScript(info)}

      const canvas = document.getElementById('stage');
      const ctx = canvas.getContext('2d');
      const debugToggle = document.getElementById('debug-toggle');

      /** 原点（十字）、アンカー（点+名前）、当たり判定（矩形・円+用途名）を重ねて描く。 */
      function drawDebug(atlas, offsetX, offsetY) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.font = '10px sans-serif';

        // 原点
        ctx.strokeStyle = '#ff2d55';
        ctx.beginPath();
        ctx.moveTo(offsetX + atlas.origin.x - 8, offsetY + atlas.origin.y);
        ctx.lineTo(offsetX + atlas.origin.x + 8, offsetY + atlas.origin.y);
        ctx.moveTo(offsetX + atlas.origin.x, offsetY + atlas.origin.y - 8);
        ctx.lineTo(offsetX + atlas.origin.x, offsetY + atlas.origin.y + 8);
        ctx.stroke();

        // アンカー
        ctx.fillStyle = '#2d7dff';
        for (const anchor of atlas.anchors) {
          ctx.beginPath();
          ctx.arc(offsetX + anchor.x, offsetY + anchor.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(anchor.name, offsetX + anchor.x + 4, offsetY + anchor.y - 4);
        }

        // 当たり判定
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

      async function main() {
        // 1. atlas.json を fetch で読み込む
        const atlas = await (await fetch('../atlas/atlas.json')).json();

        // 2. Sprite Sheet 画像を読み込む
        const sheet = new Image();
        sheet.src = '../atlas/spritesheet.png';
        await new Promise((resolve, reject) => {
          sheet.onload = resolve;
          sheet.onerror = reject;
        });

        const animation = atlas.animations[0] ?? null;
        let frameIndex = 0;
        let lastTime = 0;

        function currentFrameName() {
          if (!animation) {
            return atlas.frames[0].name;
          }
          return animation.frames[frameIndex];
        }

        function render(time) {
          if (animation) {
            const intervalMs = 1000 / animation.fps;
            if (time - lastTime >= intervalMs) {
              lastTime = time;
              frameIndex += 1;
              if (frameIndex >= animation.frames.length) {
                frameIndex = animation.loop ? 0 : animation.frames.length - 1;
              }
            }
          }
          const frame = atlas.frames.find((f) => f.name === currentFrameName()) ?? atlas.frames[0];

          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // 3. 原点を基準に画面内の任意座標へ置く例。
          // 描画位置 = 配置座標 - 原点。ここでは分かりやすさのため配置座標を原点と同じにし、
          // 描画位置が (0, 0)（キャンバス左上）になるようにしている。
          const placement = { x: atlas.origin.x, y: atlas.origin.y };
          const drawX = placement.x - atlas.origin.x;
          const drawY = placement.y - atlas.origin.y;
          ctx.drawImage(
            sheet,
            frame.x,
            frame.y,
            frame.width,
            frame.height,
            drawX,
            drawY,
            frame.width,
            frame.height,
          );

          if (debugToggle.checked) {
            drawDebug(atlas, drawX, drawY);
          }
          requestAnimationFrame(render);
        }
        requestAnimationFrame(render);
      }

      main().catch((error) => {
        document.body.appendChild(document.createTextNode('読み込みに失敗しました: ' + error));
      });
    </script>
  </body>
</html>
`;
}

/**
 * PixiJS 用サンプル HTML を生成する。
 * PixiJS 8 系を CDN から読み込み、Texture / Rectangle でフレームを切り出して Sprite 表示する。
 */
export function buildPixiExample(asset: Asset): string {
  const info = embeddedInfo(asset);
  const title = `${escapeHtml(asset.displayName)} - PixiJS サンプル`;

  return `<!doctype html>
<!--
  ${LOCAL_SERVER_NOTE}
  Chameleon Asset Studio が書き出した PixiJS 用サンプルです。完成ゲームではなく、
  atlas.json / spritesheet.png を読み込んでキャラクターを表示する最小例です。
  PixiJS は CDN（jsdelivr）から読み込みます。
-->
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
${COMMON_STYLE}
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p class="note">${LOCAL_SERVER_NOTE}</p>
    <p class="note">${DEBUG_LEGEND}</p>
    <label class="debug-toggle">
      <input type="checkbox" id="debug-toggle" checked />
      デバッグ表示（原点・アンカー・当たり判定）
    </label>
    <div id="stage"></div>
    <script src="https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.js"></script>
    <script>
${embeddedConstantsScript(info)}

      const debugToggle = document.getElementById('debug-toggle');

      /** 原点（十字）、アンカー（点+名前）、当たり判定（矩形・円+用途名）を Graphics で描く。 */
      function drawDebug(graphics, atlas) {
        graphics.clear();
        if (!debugToggle.checked) {
          return;
        }

        // 原点
        graphics
          .moveTo(atlas.origin.x - 8, atlas.origin.y)
          .lineTo(atlas.origin.x + 8, atlas.origin.y)
          .moveTo(atlas.origin.x, atlas.origin.y - 8)
          .lineTo(atlas.origin.x, atlas.origin.y + 8)
          .stroke({ width: 1, color: 0xff2d55 });

        // アンカー
        for (const anchor of atlas.anchors) {
          graphics.circle(anchor.x, anchor.y, 3).fill(0x2d7dff);
        }

        // 当たり判定
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

      async function main() {
        // 1. atlas.json を fetch で読み込む
        const atlas = await (await fetch('../atlas/atlas.json')).json();

        const app = new PIXI.Application();
        await app.init({
          width: CELL_SIZE.width,
          height: CELL_SIZE.height,
          background: '#222222',
        });
        document.getElementById('stage').appendChild(app.canvas);

        // 2. Sprite Sheet を読み込み、Texture / Rectangle でフレームを切り出す
        const baseTexture = await PIXI.Assets.load('../atlas/spritesheet.png');
        const frameTextures = new Map();
        for (const frame of atlas.frames) {
          frameTextures.set(
            frame.name,
            new PIXI.Texture({
              source: baseTexture.source,
              frame: new PIXI.Rectangle(frame.x, frame.y, frame.width, frame.height),
            }),
          );
        }

        const sprite = new PIXI.Sprite(frameTextures.get(atlas.frames[0].name));
        app.stage.addChild(sprite);

        // 3. 原点を基準に画面内の任意座標へ置く例。
        // sprite.pivot を原点にすると、sprite.position が「配置座標」になり、
        // Pixi 側が 描画位置 = 配置座標 - 原点 を自動で計算してくれる。
        sprite.pivot.set(atlas.origin.x, atlas.origin.y);
        sprite.position.set(atlas.origin.x, atlas.origin.y);

        const debugGraphics = new PIXI.Graphics();
        debugGraphics.position.set(sprite.position.x - atlas.origin.x, sprite.position.y - atlas.origin.y);
        app.stage.addChild(debugGraphics);

        const animation = atlas.animations[0] ?? null;
        let frameIndex = 0;
        let elapsedMs = 0;

        function currentFrameName() {
          if (!animation) {
            return atlas.frames[0].name;
          }
          return animation.frames[frameIndex];
        }

        app.ticker.add((ticker) => {
          if (animation) {
            elapsedMs += ticker.deltaMS;
            const intervalMs = 1000 / animation.fps;
            if (elapsedMs >= intervalMs) {
              elapsedMs = 0;
              frameIndex += 1;
              if (frameIndex >= animation.frames.length) {
                frameIndex = animation.loop ? 0 : animation.frames.length - 1;
              }
            }
          }
          sprite.texture = frameTextures.get(currentFrameName());
          drawDebug(debugGraphics, atlas);
        });

        debugToggle.addEventListener('change', () => drawDebug(debugGraphics, atlas));
      }

      main().catch((error) => {
        document.body.appendChild(document.createTextNode('読み込みに失敗しました: ' + error));
      });
    </script>
  </body>
</html>
`;
}

/**
 * Phaser 用サンプル HTML を生成する。
 * Phaser 4.2.0 を CDN から読み込み、spritesheet ローダーと anims.create でアニメーション再生する。
 */
export function buildPhaserExample(asset: Asset): string {
  const info = embeddedInfo(asset);
  const title = `${escapeHtml(asset.displayName)} - Phaser サンプル`;

  return `<!doctype html>
<!--
  ${LOCAL_SERVER_NOTE}
  Chameleon Asset Studio が書き出した Phaser 用サンプルです。完成ゲームではなく、
  atlas.json / spritesheet.png を読み込んでキャラクターを表示する最小例です。
  Phaser は CDN（jsdelivr）から読み込みます。
-->
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
    <style>
${COMMON_STYLE}
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <p class="note">${LOCAL_SERVER_NOTE}</p>
    <p class="note">${DEBUG_LEGEND}</p>
    <label class="debug-toggle">
      <input type="checkbox" id="debug-toggle" checked />
      デバッグ表示（原点・アンカー・当たり判定）
    </label>
    <div id="stage"></div>
    <script src="https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js"></script>
    <script>
${embeddedConstantsScript(info)}

      const debugToggle = document.getElementById('debug-toggle');
      let atlasData = null;

      /** 原点（十字）、アンカー（点+名前）、当たり判定（矩形・円+用途名）を Graphics で描く。 */
      function drawDebug(scene, atlas) {
        scene.debugGraphics.clear();
        if (!debugToggle.checked) {
          return;
        }

        // 原点
        scene.debugGraphics.lineStyle(1, 0xff2d55);
        scene.debugGraphics.lineBetween(
          atlas.origin.x - 8,
          atlas.origin.y,
          atlas.origin.x + 8,
          atlas.origin.y,
        );
        scene.debugGraphics.lineBetween(
          atlas.origin.x,
          atlas.origin.y - 8,
          atlas.origin.x,
          atlas.origin.y + 8,
        );

        // アンカー
        scene.debugGraphics.fillStyle(0x2d7dff);
        for (const anchor of atlas.anchors) {
          scene.debugGraphics.fillCircle(anchor.x, anchor.y, 3);
        }

        // 当たり判定
        scene.debugGraphics.lineStyle(1, 0x22c55e);
        for (const collider of atlas.colliders) {
          if (collider.shape === 'rect') {
            const r = collider.rect;
            scene.debugGraphics.strokeRect(r.x, r.y, r.width, r.height);
          } else {
            const c = collider.circle;
            scene.debugGraphics.strokeCircle(c.x, c.y, c.radius);
          }
        }
      }

      function preload() {
        // 2. Sprite Sheet を spritesheet ローダーで読み込む（frameWidth / frameHeight は
        // 生成時に埋め込んだ CELL_SIZE を使う）
        this.load.spritesheet('sheet', '../atlas/spritesheet.png', {
          frameWidth: CELL_SIZE.width,
          frameHeight: CELL_SIZE.height,
        });
      }

      function create() {
        const atlas = atlasData;

        // 3. 原点を基準に画面内の任意座標へ置く例。
        // Phaser の setOrigin は 0〜1 の比率のため、ピクセル原点をセル幅・高さで割って変換する。
        // 描画位置は Phaser 内部で 配置座標（position）- 原点（origin 比率 × サイズ）として扱われる。
        this.sprite = this.add.sprite(atlas.origin.x, atlas.origin.y, 'sheet', 0);
        this.sprite.setOrigin(atlas.origin.x / CELL_SIZE.width, atlas.origin.y / CELL_SIZE.height);

        if (atlas.animations.length > 0) {
          const animation = atlas.animations[0];
          this.anims.create({
            key: animation.name,
            frames: animation.frames.map((name) => ({
              key: 'sheet',
              frame: atlas.frames.findIndex((frame) => frame.name === name),
            })),
            frameRate: animation.fps,
            repeat: animation.loop ? -1 : 0,
          });
          this.sprite.play(animation.name);
        }

        this.debugGraphics = this.add.graphics();
        drawDebug(this, atlas);
        debugToggle.addEventListener('change', () => drawDebug(this, atlas));
      }

      function update() {
        if (atlasData) {
          drawDebug(this, atlasData);
        }
      }

      async function boot() {
        // 1. atlas.json を fetch で読み込んでから Phaser のゲームを起動する
        atlasData = await (await fetch('../atlas/atlas.json')).json();

        new Phaser.Game({
          type: Phaser.AUTO,
          width: CELL_SIZE.width,
          height: CELL_SIZE.height,
          parent: 'stage',
          backgroundColor: '#222222',
          scene: { preload, create, update },
        });
      }

      boot().catch((error) => {
        document.body.appendChild(document.createTextNode('読み込みに失敗しました: ' + error));
      });
    </script>
  </body>
</html>
`;
}
