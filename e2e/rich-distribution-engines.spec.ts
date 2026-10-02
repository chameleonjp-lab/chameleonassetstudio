import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { useVerifiedEngineCache } from './engineTestHelpers';

/** Only fixture creation uses app modules. Export and consumption use the public UI/ZIP. */
async function seedRichProject(page: Page, scale: number) {
  await page.goto('/');
  await page.evaluate(async (scale) => {
    const factoriesPath = '/src/core/model/factories.ts';
    const storagePath = '/src/core/storage/index.ts';
    const { createEmptyProject, createImageAsset } = await import(factoriesPath);
    const { saveProjectBundle } = await import(storagePath);
    const project = createEmptyProject('Rich engine integration');
    // Each trimmed frame is larger than half a 2048px page in both axes.
    // Thus all scales exercise real multi-page packing without patching the exporter.
    const side = Math.ceil(1050 / scale);
    const asset = createImageAsset({
      name: 'rich_engine',
      size: { width: side + 12, height: side + 12 },
      sourceMimeType: 'image/png',
      sourceExtension: 'png',
      thumbnailMimeType: 'image/png',
    });
    asset.origin = { x: 4, y: 5 };
    asset.anchors = [{ id: 'hand', name: 'hand', role: 'custom', position: { x: 7, y: 8 } }];
    asset.colliders = [
      {
        id: 'body',
        name: 'body',
        purpose: 'body',
        shape: 'rect',
        visible: true,
        rect: { x: 6, y: 7, width: 8, height: 9 },
      },
    ];
    const template = asset.layers[0];
    asset.textures = [];
    asset.layers = [];
    asset.frames = [];
    const blobs = [];
    for (const [index, color] of ['#ff0000', '#00ff00', '#0000ff'].entries()) {
      const id = `frame_${index}`;
      const textureId = `texture_${index}`;
      const layerId = `layer_${index}`;
      const path = `textures/${index}.png`;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = side + 12;
      const context = canvas.getContext('2d')!;
      context.fillStyle = color;
      context.fillRect(2, 3, side, side);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('PNG encode failed'))),
          'image/png',
        ),
      );
      blobs.push({ key: `${asset.id}/${path}`, blob });
      asset.textures.push({
        id: textureId,
        kind: 'edit',
        name: textureId,
        mimeType: 'image/png',
        size: asset.canvasSize,
        path,
      });
      asset.layers.push({
        ...structuredClone(template),
        id: layerId,
        textureId,
        visible: index === 0,
      });
      asset.frames.push({
        id,
        name: 'same display name',
        durationMs: (index + 1) * 100,
        layerStates: [0, 1, 2].map((n) => ({ layerId: `layer_${n}`, visible: n === index })),
        ...(index === 1
          ? {
              colliderOverrides: [
                {
                  colliderId: 'body',
                  visible: false,
                  rect: { x: 10, y: 11, width: 12, height: 13 },
                },
              ],
            }
          : {}),
      });
    }
    asset.animations = [true, false].map((loop) => ({
      id: loop ? 'loop' : 'once',
      name: 'same animation name',
      fps: 60,
      loop,
      frameIds: ['frame_0', 'frame_1', 'frame_2', 'frame_0'],
      events: [0, 1, 2].map((n) => ({
        id: `event_${loop}_${n}`,
        name: `event_${n}`,
        frameId: `frame_${n}`,
        payload: { value: n, inert: 'globalThis.mustNotRun = true' },
      })),
    }));
    const copy = structuredClone(asset);
    copy.id = asset.id + '_copy';
    const yellow = document.createElement('canvas');
    yellow.width = yellow.height = side + 12;
    const yellowContext = yellow.getContext('2d')!;
    yellowContext.fillStyle = '#ffff00';
    yellowContext.fillRect(2, 3, side, side);
    const yellowBlob = await new Promise<Blob>((resolve, reject) =>
      yellow.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))),
        'image/png',
      ),
    );
    const copyBlobs = blobs.map((entry, index) => ({
      key: entry.key.replace(asset.id + '/', copy.id + '/'),
      blob: index === 0 ? yellowBlob : entry.blob,
    }));
    project.assets = [asset, copy].map((entry) => ({
      id: entry.id,
      name: entry.name,
      displayName: entry.displayName,
      assetType: entry.assetType,
    }));
    await saveProjectBundle(project, [asset, copy], [...blobs, ...copyBlobs]);
  }, scale);
  await page.reload();
  await page.getByRole('button', { name: '「Rich engine integration」を開く' }).click();
}

function consumer(engine: 'canvas2d' | 'pixijs' | 'phaser' | 'phaser-webgl') {
  const script =
    engine === 'pixijs'
      ? '<script src="https://cdn.jsdelivr.net/npm/pixi.js@8.12.0/dist/pixi.min.js"></script>'
      : engine.startsWith('phaser')
        ? '<script src="https://cdn.jsdelivr.net/npm/phaser@4.2.0/dist/phaser.min.js"></script>'
        : '';
  return `<!doctype html><html><body><div id="stage"></div>${script}<script type="module">
    import { loadRichPackage } from './helpers/distributionManifestV2.js';
    import { createCanvasDistribution } from './helpers/distributionCanvas.js';
    import { createPixiDistribution } from './helpers/distributionPixi.js';
    import { createPhaserDistribution } from './helpers/distributionPhaser.js';
    try {
      const loaded = await loadRichPackage(new URL('./package-manifest.json', location.href));
      const source = loaded.assets[0];
      const position = {x: 20, y: 30};
      let make, render, canvas, destroy, rendererType = 'Canvas2D', engineVersion = 'browser Canvas 2D';
      if (${JSON.stringify(engine)} === 'canvas2d') {
        canvas = document.createElement('canvas'); canvas.width = canvas.height = 1200;
        document.querySelector('#stage').append(canvas);
        const context = canvas.getContext('2d');
        make = animationId => createCanvasDistribution({...source, context, position, animationId});
        render = async () => {};
        destroy = () => {};
      } else if (${JSON.stringify(engine)} === 'pixijs') {
        if (PIXI.VERSION !== '8.12.0') throw new Error('Unexpected Pixi version');
        const app = new PIXI.Application();
        await app.init({width:1200,height:1200,backgroundAlpha:0,antialias:false,autoStart:false});
        document.querySelector('#stage').append(app.canvas);
        rendererType = app.renderer.type; engineVersion = PIXI.VERSION;
        const sprite = new PIXI.Sprite(); app.stage.addChild(sprite);
        make = animationId => createPixiDistribution({...source, PIXI, sprite, position, animationId});
        render = async () => { app.render(); canvas = app.renderer.extract.canvas({target:app.stage,
          frame:new PIXI.Rectangle(0,0,1200,1200)}); };
        destroy = () => app.destroy(true);
      } else {
        if (Phaser.VERSION !== '4.2.0') throw new Error('Unexpected Phaser version');
        let scene;
        const ready = new Promise(resolve => {
          const game = new Phaser.Game({type:${engine === 'phaser-webgl' ? 'Phaser.WEBGL' : 'Phaser.CANVAS'},width:1200,height:1200,
            transparent:true,banner:false,audio:{noAudio:true},parent:'stage',
            scene:{create(){ scene=this; resolve(); }}});
          destroy = () => game.destroy(true);
        });
        await ready;
        canvas = scene.sys.game.canvas; rendererType = scene.sys.game.renderer.type; engineVersion = Phaser.VERSION;
        if (rendererType !== ${engine === 'phaser-webgl' ? 'Phaser.WEBGL' : 'Phaser.CANVAS'}) throw new Error('Unexpected Phaser renderer');
        const sprite = scene.add.sprite(0,0,'__DEFAULT');
        make = animationId => createPhaserDistribution({...source, scene, sprite, position,
          keyPrefix:'rich-'+animationId, animationId});
        render = () => new Promise((resolve,reject) => scene.sys.game.events.once('postrender', () => {
          try { scene.sys.game.renderer.snapshotArea(0,0,1200,1200, image => {
            try { const snapshot=document.createElement('canvas'); snapshot.width=snapshot.height=1200;
              snapshot.getContext('2d').drawImage(image,0,0); canvas=snapshot; resolve();
            } catch(error) { reject(error); }
          }); } catch(error) { reject(error); }
        }));
      }
      const results = [];
      for (const animationId of ['loop','once']) {
        const adapter = make(animationId);
        const samples = [];
        for (const delta of [null,99,1,199,1,299,1,99,1,700]) {
          const result = delta === null ? adapter.start() : adapter.advance(delta);
          await render();
          const copy = document.createElement('canvas'); copy.width=copy.height=1200;
          const context = copy.getContext('2d'); context.drawImage(canvas,0,0);
          const pixels=context.getImageData(0,0,1200,1200).data;
          const scale=source.manifest.scale, left=20-2*scale, top=30-2*scale;
          const extent=(source.asset.canvasSize.width-12)*scale;
          const frameIndex=Number(result.sample.occurrence.frameId.slice(-1));
          const color=[[255,0,0],[0,255,0],[0,0,255]][frameIndex];
          let mismatchedPixels=0;
          for(let y=0,index=0;y<1200;y++) for(let x=0;x<1200;x++,index+=4){
            const inside=x>=left&&x<left+extent&&y>=top&&y<top+extent;
            if(pixels[index] !== (inside?color[0]:0) || pixels[index+1] !== (inside?color[1]:0) ||
               pixels[index+2] !== (inside?color[2]:0) || pixels[index+3] !== (inside?255:0)) mismatchedPixels++;
          }
          samples.push({ ...result, mismatchedPixels, pixel:[...context.getImageData(40,50,1,1).data],
            outside:[...context.getImageData(0,0,1,1).data], running:adapter.isRunning() });
        }
        adapter.stop();
        const stopped = adapter.advance(1000);
        const restarted = adapter.start();
        adapter.dispose(); adapter.dispose();
        results.push({animationId,samples,stopped,restarted});
      }
      const secondary = loaded.assets[1];
      const secondaryCanvas = document.createElement('canvas'); secondaryCanvas.width = secondaryCanvas.height = 1200;
      const secondaryContext = secondaryCanvas.getContext('2d');
      const secondaryPlayer = createCanvasDistribution({...secondary, context:secondaryContext, position});
      secondaryPlayer.start();
      const secondaryPixel = [...secondaryContext.getImageData(40,50,1,1).data];
      secondaryPlayer.dispose();
      window.richResult = {results, rendererType, engineVersion, manifest:source.manifest, asset:source.asset,
        secondaryPixel, assetIds:loaded.assets.map(entry=>entry.manifest.assetId)};
      destroy(); loaded.dispose(); loaded.dispose();
    } catch(error) { window.richError = String(error.stack || error); }
  </script></body></html>`;
}

for (const engine of ['canvas2d', 'pixijs', 'phaser', 'phaser-webgl'] as const) {
  const target = engine === 'phaser-webgl' ? 'phaser' : engine;
  for (const profile of ['fixed-grid', 'packed'] as const) {
    for (const scale of [1, 2, 3]) {
      test(`UI rich ZIP → ${engine} ${profile} ${scale}x: pixels, variable timing, events and frame gameplay`, async ({
        page,
        browser,
      }, testInfo) => {
        test.setTimeout(90_000);
        if (engine !== 'canvas2d')
          await useVerifiedEngineCache(page, engine === 'pixijs' ? 'pixi' : 'phaser');
        await seedRichProject(page, scale);
        const panel = page.getByRole('region', { name: '新版配布用ZIP', exact: true });
        await expect(panel.getByRole('checkbox')).toHaveCount(2);
        for (const checkbox of await panel.getByRole('checkbox').all()) await checkbox.check();
        await panel.getByLabel('新版配布の利用先').selectOption(target);
        await panel.getByLabel('新版配布画像の配置').selectOption(profile);
        await panel.getByLabel('新版配布画像の倍率').selectOption(String(scale));
        await panel.getByLabel('新版配布画像間の余白').fill('2');
        const downloaded = page.waitForEvent('download', { timeout: 30_000 });
        void downloaded.catch(() => {});
        await panel.getByRole('button', { name: '新版配布用ZIPをダウンロード' }).click();
        const download = await Promise.race([
          downloaded,
          panel
            .getByRole('alert')
            .waitFor({ state: 'visible', timeout: 30_000 })
            .then(async () => {
              throw new Error(await panel.getByRole('alert').innerText());
            }),
        ]);
        const entries = unzipSync(await readFile((await download.path())!));
        const pkg = JSON.parse(new TextDecoder().decode(entries['package-manifest.json']));
        expect(pkg).toMatchObject({
          format: 'chameleon-package',
          version: '0.2.0',
          target,
        });
        expect(pkg.assets).toHaveLength(2);
        expect(pkg.assets[0].name).toBe(pkg.assets[1].name);
        expect(pkg.assets[0].manifest).not.toBe(pkg.assets[1].manifest);
        for (const name of ['Runtime', 'Canvas', 'Pixi', 'Phaser', 'ManifestV2'])
          expect(entries[`helpers/distribution${name}.js`]).toBeTruthy();
        // Route the actual downloaded bytes. No source-module imports or hand-built manifest
        // are allowed in this consumer, so missing ZIP files fail as HTTP 404s.
        await page.route('**/rich-consumer/**', async (route) => {
          const path = new URL(route.request().url()).pathname.slice('/rich-consumer/'.length);
          if (path === 'index.html')
            return route.fulfill({ contentType: 'text/html', body: consumer(engine) });
          const bytes = entries[path];
          await route.fulfill({
            status: bytes ? 200 : 404,
            body: bytes ? Buffer.from(bytes) : 'Missing ZIP entry',
            contentType: path.endsWith('.js')
              ? 'application/javascript'
              : path.endsWith('.png')
                ? 'image/png'
                : path.endsWith('.html')
                  ? 'text/html'
                  : 'application/json',
          });
        });
        await page.goto('/rich-consumer/index.html');
        await page.waitForFunction(() => 'richResult' in window || 'richError' in window, null, {
          timeout: 30_000,
        });
        const result = await page.evaluate(() => {
          const state = window as typeof window & { richError?: string; richResult?: unknown };
          if (state.richError) throw new Error(state.richError);
          return state.richResult;
        });
        // JSON crossing the browser boundary is checked structurally before individual values.
        const data = result as {
          rendererType: number | string;
          engineVersion: string;
          secondaryPixel: number[];
          assetIds: string[];
          manifest: {
            scale: number;
            pages: unknown[];
            frames: Array<{ contentOffset: { x: number; y: number } }>;
          };
          asset: { animations: Array<{ frameIds: string[] }> };
          results: Array<{
            animationId: string;
            samples: Array<{
              sample: { occurrence: { frameId: string }; cycle: number; complete: boolean };
              events: Array<{
                timeMs: number;
                event: { name: string; payload: { value: number; inert: string } };
              }>;
              projection: {
                origin: { x: number; y: number };
                anchors: Array<{ position: { x: number; y: number } }>;
                colliders: Array<{
                  visible: boolean;
                  rect: { x: number; y: number; width: number; height: number };
                }>;
              };
              mismatchedPixels: number;
              pixel: number[];
              outside: number[];
              running: boolean;
            }>;
            stopped: { events: unknown[] };
            restarted: { events: unknown[] };
          }>;
        };
        expect(data.secondaryPixel).toEqual([255, 255, 0, 255]);
        expect(new Set(data.assetIds).size).toBe(2);
        expect(data.manifest.scale).toBe(scale);
        expect(data.manifest.pages).toHaveLength(3);
        expect(data.manifest.frames[0].contentOffset).toEqual(
          profile === 'packed' ? { x: 2 * scale, y: 3 * scale } : { x: 0, y: 0 },
        );
        expect(data.asset.animations[0].frameIds).toEqual([
          'frame_0',
          'frame_1',
          'frame_2',
          'frame_0',
        ]);
        for (const run of data.results) {
          const loop = run.animationId === 'loop';
          const ids = [0, 0, 1, 1, 2, 2, 0, 0, 0, 0];
          expect(run.samples.map((s) => s.sample.occurrence.frameId)).toEqual(
            ids.map((n) => `frame_${n}`),
          );
          for (const [index, sample] of run.samples.entries()) {
            expect(sample.mismatchedPixels).toBe(0);
            expect(sample.pixel).toEqual(
              [
                [255, 0, 0, 255],
                [0, 255, 0, 255],
                [0, 0, 255, 255],
              ][ids[index]],
            );
            expect(sample.outside[3]).toBe(0);
            expect(sample.projection.origin).toEqual({ x: 20, y: 30 });
            expect(sample.projection.anchors[0].position).toEqual({
              x: 20 + 3 * scale,
              y: 30 + 3 * scale,
            });
            const overridden = ids[index] === 1;
            expect(sample.projection.colliders[0]).toMatchObject({
              visible: !overridden,
              rect: {
                x: 20 + (overridden ? 6 : 2) * scale,
                y: 30 + (overridden ? 6 : 2) * scale,
                width: (overridden ? 12 : 8) * scale,
                height: (overridden ? 13 : 9) * scale,
              },
            });
          }
          expect(run.samples.flatMap((s) => s.events.map((e) => e.timeMs))).toEqual(
            loop ? [0, 100, 300, 600, 700, 800, 1000, 1300, 1400] : [0, 100, 300, 600],
          );
          expect(run.samples[8].sample.complete).toBe(!loop);
          expect(run.samples[9].sample.cycle).toBe(loop ? 2 : 0);
          expect(run.samples[9].running).toBe(loop);
          expect(run.stopped.events).toEqual([]);
          expect(run.restarted.events).toHaveLength(1);
          expect(run.samples[0].events[0].event.payload).toEqual({
            value: 0,
            inert: 'globalThis.mustNotRun = true',
          });
        }
        expect(await page.evaluate(() => 'mustNotRun' in window)).toBe(false);
        const exampleErrors: string[] = [];
        page.on('pageerror', (error) => exampleErrors.push(error.message));
        await page.goto(`/rich-consumer/examples/${target}.html`);
        await expect(page.locator('#status')).toContainText('読み込み成功', { timeout: 30_000 });
        await expect(page.locator('#stage canvas')).toBeVisible();
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        expect(exampleErrors).toEqual([]);
        await testInfo.attach('rich-distribution-runtime-evidence.json', {
          contentType: 'application/json',
          body: JSON.stringify(
            {
              engine,
              profile,
              scale,
              browser: testInfo.project.name,
              browserVersion: browser.version(),
              rendererType: data.rendererType,
              engineVersion: data.engineVersion,
              sourceCommit: process.env.GITHUB_SHA ?? 'local-unrecorded',
              packageHash: createHash('sha256')
                .update(entries['package-manifest.json'])
                .digest('hex'),
              assets: pkg.assets,
              pages: data.manifest.pages,
              results: data.results,
              realDevice: false,
            },
            null,
            2,
          ),
        });
      });
    }
  }
}
