import { expect, test, type Page } from '@playwright/test';

async function frameAlphas(page: Page) {
  return page.evaluate(async () => {
    const storagePath = '/src/core/storage/index.ts';
    const modelPath = '/src/core/model/index.ts';
    const exportPath = '/src/core/export/exportAsset.ts';
    const { listProjects, listProjectAssets } = await import(storagePath);
    const { applyFrameToAsset } = await import(modelPath);
    const { exportImage } = await import(exportPath);
    const projects = await listProjects();
    const asset = (await listProjectAssets(projects[0].id))[0];
    if (!asset?.frames?.length) return [];
    const values: number[] = [];
    for (const frame of asset.frames) {
      const blob = await exportImage(applyFrameToAsset(asset, frame.id), 'image/png');
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < pixels.length; index += 4) alpha += pixels[index];
      values.push(alpha);
    }
    return values;
  });
}

test('2レイヤー8コマの複製だけを描き、Undo・Redo・再読込・バックアップで画素を保持する', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('独立コマ');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  const transparent = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByLabel('画像レイヤーを追加', { exact: true }).setInputFiles({
    name: 'second.png',
    mimeType: 'image/png',
    buffer: Buffer.from(transparent, 'base64'),
  });
  await page.getByRole('dialog').getByRole('button', { name: '取り込みを確定' }).click();
  for (let index = 0; index < 7; index++) {
    await page.getByRole('button', { name: 'フレーム追加', exact: true }).click();
    await expect.poll(async () => (await frameAlphas(page)).length).toBe(index + 1);
  }
  await page.getByRole('button', { name: 'フレーム「frame_1」を複製' }).click();
  await expect.poll(() => frameAlphas(page)).toEqual(Array(8).fill(0));
  await page.getByRole('button', { name: 'フレーム「frame_1_copy」を描く' }).click();
  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toHaveAttribute('data-raster-input-ready', 'true');
  await page.getByLabel('描画色').fill('#ff0000');
  await page.getByLabel('ブラシサイズ').fill('1');
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect.poll(async () => (await frameAlphas(page))[1]).toBeGreaterThan(0);
  const drawn = await frameAlphas(page);
  expect(drawn[0]).toBe(0);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect.poll(() => frameAlphas(page)).toEqual(Array(8).fill(0));
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect.poll(() => frameAlphas(page)).toEqual(drawn);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '.casproj をダウンロード' }).click();
  const file = await download;
  const path = await file.path();
  await page.reload();
  await page.getByRole('button', { name: '「独立コマ」を開く' }).click();
  await expect.poll(() => frameAlphas(page)).toEqual(drawn);
  await page.getByRole('button', { name: '← ホーム' }).click();
  await page.getByLabel('.casproj を読み込む').setInputFiles(path!);
  await expect(page.getByRole('button', { name: '「独立コマ」を開く' })).toHaveCount(2);
  await page.getByRole('button', { name: '「独立コマ」を開く' }).first().click();
  await expect.poll(() => frameAlphas(page)).toEqual(drawn);
});

for (const count of [1, 16, 64]) {
  test(`${count}コマの連番を容量検査付きで保存する`, async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.getByRole('button', { name: '作成', exact: true }).click();
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#70c488';
      context.fillRect(0, 0, 512, 512);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.getByLabel('連番ファイルを選ぶ').setInputFiles(
      Array.from({ length: count }, (_, index) => ({
        name: `frame_${index}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      })),
    );
    await page.getByRole('button', { name: '連番previewを準備' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`frame ${count}件`, { timeout: 30000 });
    await dialog.getByRole('button', { name: '取り込みを確定' }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const path = '/src/core/storage/index.ts';
          const { listProjects, listProjectAssets } = await import(path);
          const assets = await listProjectAssets((await listProjects())[0].id);
          return assets[0]?.frames?.length;
        }),
      )
      .toBe(count);
  });
}

test('連番準備の取消は画像・隔離・previewを保存しない', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByLabel('連番ファイルを選ぶ').setInputFiles(
    Array.from({ length: 64 }, (_, index) => ({
      name: `${index}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    })),
  );
  await page.getByRole('button', { name: '連番previewを準備' }).click();
  await page.getByRole('button', { name: '取り込み準備を取消' }).click();
  await expect(page.getByRole('button', { name: '連番previewを準備' })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(async () => {
      const path = '/src/core/storage/index.ts';
      const { listProjects, listProjectAssets, listQuarantine } = await import(path);
      return {
        assets: (await listProjectAssets((await listProjects())[0].id)).length,
        quarantine: (await listQuarantine()).length,
      };
    }),
  ).toEqual({ assets: 0, quarantine: 0 });
});

test('コマ固有の変形はブラシで保持し、巻戻しは描画を解除する', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    return canvas.toDataURL().split(',')[1];
  });
  await page.getByLabel('連番ファイルを選ぶ').setInputFiles(
    [0, 1].map((index) => ({
      name: `${index}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    })),
  );
  await page.getByRole('button', { name: '連番previewを準備' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取り込みを確定' }).click();
  // Reproduce an existing stored frame override on an exclusive imported layer.
  await page.evaluate(async () => {
    const path = '/src/core/storage/index.ts';
    const { listProjects, listProjectAssets, saveAssetRevision } = await import(path);
    const project = (await listProjects())[0];
    const asset = (await listProjectAssets(project.id))[0];
    const state = asset.frames[1].layerStates.find((entry: { visible: boolean }) => entry.visible);
    state.transform = { position: { x: 20, y: 10 }, scale: { x: 2, y: 2 }, rotation: 0 };
    await saveAssetRevision({ projectId: project.id, asset });
  });
  await page.reload();
  await page
    .getByRole('button', { name: /を開く/ })
    .first()
    .click();
  const draw = page.getByRole('button', { name: /フレーム「.*」を描く/ }).nth(1);
  await draw.click();
  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toHaveAttribute('data-raster-input-ready', 'true');
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  const transform = () =>
    page.evaluate(async () => {
      const path = '/src/core/storage/index.ts';
      const { listProjects, listProjectAssets } = await import(path);
      const asset = (await listProjectAssets((await listProjects())[0].id))[0];
      return asset.frames[1].layerStates.find((entry: { visible: boolean }) => entry.visible)
        .transform;
    });
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  expect(await transform()).toEqual({
    position: { x: 20, y: 10 },
    scale: { x: 2, y: 2 },
    rotation: 0,
  });
  await page.getByRole('button', { name: '先頭へ', exact: true }).click();
  await expect(page.getByText('このコマだけを描いています', { exact: false })).toHaveCount(0);
});
