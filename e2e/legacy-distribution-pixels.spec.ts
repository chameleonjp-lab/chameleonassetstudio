import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';

for (const profile of ['fixed-grid', 'packed']) {
  for (const scale of [1, 2, 3]) {
    test(`legacy 0.1 UI ZIP ${profile} ${scale}x helper preserves exact opaque pixels`, async ({
      page,
    }, testInfo) => {
      await page.goto('/');
      await page.evaluate(async () => {
        const modelPath = '/src/core/model/factories.ts';
        const storagePath = '/src/core/storage/index.ts';
        const { createEmptyProject, createImageAsset } = await import(modelPath);
        const { saveProjectBundle } = await import(storagePath);
        const project = createEmptyProject('Legacy packed pixels');
        const asset = createImageAsset({
          name: 'legacy_pixels',
          size: { width: 32, height: 32 },
          sourceMimeType: 'image/png',
          sourceExtension: 'png',
          thumbnailMimeType: 'image/png',
        });
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ff0000';
        context.fillRect(2, 3, 8, 9);
        context.fillStyle = '#00ff00';
        context.fillRect(4, 5, 2, 3);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))),
            'image/png',
          ),
        );
        project.assets = [
          {
            id: asset.id,
            name: asset.name,
            displayName: asset.displayName,
            assetType: asset.assetType,
          },
        ];
        await saveProjectBundle(
          project,
          [asset],
          asset.textures.map((texture: { path: string }) => ({
            key: `${asset.id}/${texture.path}`,
            blob,
          })),
        );
      });
      await page.reload();
      await page.getByRole('button', { name: '「Legacy packed pixels」を開く' }).click();
      const panel = page.getByRole('region', { name: '配布用ZIP', exact: true });
      await panel.getByLabel('配布画像の配置', { exact: true }).selectOption(profile);
      await panel.getByLabel('配布画像の倍率', { exact: true }).selectOption(String(scale));
      const downloaded = page.waitForEvent('download');
      await panel.getByRole('button', { name: '配布用ZIPをダウンロード', exact: true }).click();
      const outputPath = testInfo.outputPath(`legacy-${profile}-${scale}x.zip`);
      await (await downloaded).saveAs(outputPath);
      await testInfo.attach(`legacy-${profile}-${scale}x.zip`, {
        path: outputPath,
        contentType: 'application/zip',
      });
      const entries = unzipSync(await readFile(outputPath));
      await page.route('**/legacy-pixels/**', async (route) => {
        const path = new URL(route.request().url()).pathname.slice('/legacy-pixels/'.length);
        if (path === 'index.html')
          return route.fulfill({
            contentType: 'text/html',
            body: `<!doctype html><html><body><script type="module">
          import {loadGenericWebPackage,drawGenericWebFrame} from './helpers/chameleon-generic-web.js';
          try {
            const loaded=await loadGenericWebPackage('./package-manifest.json');
            const frame=loaded.manifest.frames[0];
            const actual=document.createElement('canvas');actual.width=frame.sourceSize.width;actual.height=frame.sourceSize.height;
            const context=actual.getContext('2d');context.imageSmoothingEnabled=false;
            drawGenericWebFrame(context,loaded,frame.name);
            const original=new Image();original.src='./textures/main.png';await original.decode();
            const expected=document.createElement('canvas');expected.width=actual.width;expected.height=actual.height;
            const target=expected.getContext('2d');target.imageSmoothingEnabled=false;target.drawImage(original,0,0,expected.width,expected.height);
            window.pixelResult={actual:[...context.getImageData(0,0,actual.width,actual.height).data],expected:[...target.getImageData(0,0,expected.width,expected.height).data],version:loaded.manifest.version};
          }catch(error){window.pixelError=String(error.stack||error);}
        </script></body></html>`,
          });
        const bytes = entries[path];
        await route.fulfill({
          status: bytes ? 200 : 404,
          body: bytes ? Buffer.from(bytes) : 'Missing ZIP entry',
          contentType: path.endsWith('.js')
            ? 'application/javascript'
            : path.endsWith('.png')
              ? 'image/png'
              : 'application/json',
        });
      });
      await page.goto('/legacy-pixels/index.html');
      await page.waitForFunction(() => 'pixelResult' in window || 'pixelError' in window);
      const result = await page.evaluate(() => {
        const state = window as typeof window & {
          pixelError?: string;
          pixelResult?: { actual: number[]; expected: number[]; version: string };
        };
        if (state.pixelError) throw new Error(state.pixelError);
        return state.pixelResult!;
      });
      expect(result.version).toBe('0.1.0');
      expect(result.actual).toEqual(result.expected);
      expect(result.actual.some((value, index) => index % 4 === 3 && value === 255)).toBe(true);
    });
  }
}
