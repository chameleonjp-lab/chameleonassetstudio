import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createProject, identityTransform } from '../src/core3d/model/project';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';

const panel = (page: Page) => page.getByRole('region', { name: '画像とUVを編集', exact: true });
async function fixture() {
  const p = createProject('texture-fixture', 'Texture fixture');
  p.nodes = [
    {
      id: 'quad',
      name: 'UV quad',
      parentId: null,
      transform: identityTransform(),
      meshId: 'quad-mesh',
    },
  ];
  p.meshes = [
    {
      id: 'quad-mesh',
      vertices: [
        { id: 'a', position: [-1, -1, 0] },
        { id: 'b', position: [1, -1, 0] },
        { id: 'c', position: [1, 1, 0] },
        { id: 'd', position: [-1, 1, 0] },
      ],
      faces: [
        {
          id: 'abc',
          vertexIds: ['a', 'b', 'c'],
          uv: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
          materialId: 'white',
        },
        {
          id: 'acd',
          vertexIds: ['a', 'c', 'd'],
          uv: [
            [0, 0],
            [1, 1],
            [0, 1],
          ],
          materialId: 'white',
        },
      ],
    },
  ];
  p.materials = [{ id: 'white', baseColor: [1, 1, 1, 1], metallic: 0, roughness: 1 }];
  return exportBackup(p, new Map());
}
async function open(page: Page, bytes?: Uint8Array) {
  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'texture.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(bytes ?? (await fixture())),
  });
  await expect(page.getByRole('heading', { name: 'Texture fixture', exact: true })).toBeVisible();
  await panel(page).getByText('画像とUVを開く', { exact: true }).click();
}
async function image(page: Page, mime = 'image/png') {
  const base64 = await page.evaluate((mime) => {
    const c = document.createElement('canvas');
    c.width = 32;
    c.height = 32;
    const x = c.getContext('2d')!;
    for (const [color, left, top] of [
      ['#ff0000', 0, 0],
      ['#00ff00', 16, 0],
      ['#0000ff', 0, 16],
      ['#ffffff', 16, 16],
    ] as const) {
      x.fillStyle = color;
      x.fillRect(left, top, 16, 16);
    }
    return c.toDataURL(mime, 0.95).split(',')[1];
  }, mime);
  return Buffer.from(base64, 'base64');
}
async function apply(page: Page, bytes: Buffer, mime = 'image/png') {
  await panel(page)
    .getByLabel('baseColor画像', { exact: true })
    .setInputFiles({
      name: mime === 'image/png' ? 'colors.png' : 'colors.jpg',
      mimeType: mime,
      buffer: bytes,
    });
  await panel(page)
    .getByLabel('画像の権利・出典', { exact: true })
    .fill('CC0: original 32px four-color fixture');
  await panel(page).getByRole('button', { name: '画像を取り込み適用', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('一回の操作');
}
async function backup(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const bytes = await readFile((await (await pending).path())!);
  return { bytes, ...(await importBackup(bytes)) };
}
async function visual(name: string, bytes: Buffer) {
  const path = test.info().outputPath(`native-visual-texture-${name}.png`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  await test.info().attach(name, { path, contentType: 'image/png' });
}

test('native image and derived color retain original bytes through Undo and independent recovery without WebGL', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.call(this, type, ...(args as [])) as never;
    } as typeof original;
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  const original = await image(page);
  await apply(page, original);
  const initial = await backup(page);
  const originalHash = initial.project.materials[0].textureBlobId!;
  expect(Buffer.from(initial.blobs.get(originalHash)!)).toEqual(original);
  await panel(page)
    .getByRole('combobox', { name: '来歴の対象画像', exact: true })
    .selectOption(initial.project.sources[0].id);
  await panel(page)
    .getByLabel('画像の権利・出典', { exact: true })
    .fill('CC0: corrected attribution');
  await panel(page).getByRole('button', { name: '画像を取り込み適用', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('一回の操作');
  const replaced = await backup(page);
  const newSource = replaced.project.sources.find(
    (source) => source.rights.declared === 'CC0: corrected attribution',
  )!;
  await expect(
    panel(page).getByRole('combobox', { name: '来歴の対象画像', exact: true }),
  ).toHaveValue(newSource.id);
  const uv = initial.project.meshes[0].faces.map((f) => f.uv);
  await panel(page).getByLabel('赤の倍率', { exact: true }).fill('0.25');
  await panel(page).getByRole('button', { name: '色調を派生画像として適用', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('一回の操作');
  const derived = await backup(page);
  const derivedHash = derived.project.materials[0].textureBlobId!;
  expect(derivedHash).not.toBe(originalHash);
  expect(derived.project.revision).toBe(replaced.project.revision + 1);
  expect(derived.project.meshes[0].faces.map((f) => f.uv)).toEqual(uv);
  expect(derived.project.sources.find((s) => s.blobId === derivedHash)?.derivedFrom?.hash).toBe(
    originalHash,
  );
  expect(derived.project.sources.find((s) => s.blobId === derivedHash)?.rights.declared).toBe(
    'CC0: corrected attribution',
  );
  expect(Buffer.from(derived.blobs.get(originalHash)!)).toEqual(original);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect((await backup(page)).project.materials[0].textureBlobId).toBe(originalHash);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  expect((await backup(page)).project.materials[0].textureBlobId).toBe(derivedHash);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await visual('mobile', await page.screenshot({ fullPage: true }));
  const independent = await context
    .browser()!
    .newContext({ baseURL: new URL(page.url()).origin, viewport: { width: 375, height: 812 } });
  try {
    const restored = await independent.newPage();
    await open(restored, derived.bytes);
    await panel(restored).getByRole('button', { name: '元画像へ戻す', exact: true }).click();
    const recovered = await backup(restored);
    expect(recovered.project.materials[0].textureBlobId).toBe(originalHash);
    expect(Buffer.from(recovered.blobs.get(originalHash)!)).toEqual(original);
  } finally {
    await independent.close();
  }
});

test('image authoring respects IME, backup interruption and another tab ownership', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const encode = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (document.documentElement.dataset.nativeEncodeGate !== 'armed') {
        return encode.call(this, callback, type, quality);
      }
      document.documentElement.dataset.nativeEncodeGate = 'held';
      window.addEventListener(
        'native-test-release-encode',
        () => {
          encode.call(
            this,
            (blob) => {
              callback(blob);
              document.documentElement.dataset.nativeEncodeGate = 'released';
            },
            type,
            quality,
          );
        },
        { once: true },
      );
    };
  });
  await open(page);
  await panel(page)
    .getByLabel('baseColor画像', { exact: true })
    .setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: await image(page) });
  const rights = panel(page).getByLabel('画像の権利・出典', { exact: true });
  await rights.fill('自作');
  await rights.dispatchEvent('compositionstart');
  await panel(page).getByRole('button', { name: '画像を取り込み適用', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('変換を確定');
  expect((await backup(page)).project.materials[0].textureBlobId).toBeUndefined();
  await rights.dispatchEvent('compositionend');
  await panel(page).getByRole('button', { name: '画像を取り込み適用', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('一回の操作');
  const before = await backup(page);
  await panel(page).getByLabel('彩度', { exact: true }).fill('0.5');
  await page.evaluate(() => {
    document.documentElement.dataset.nativeEncodeGate = 'armed';
  });
  try {
    await panel(page)
      .getByRole('button', { name: '色調を派生画像として適用', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-native-encode-gate', 'held');
    await expect(
      panel(page).getByRole('button', { name: '画像操作を取り消す', exact: true }),
    ).toBeVisible();
    const during = await backup(page);
    expect(during.project).toEqual(before.project);
    await expect(panel(page).getByRole('status')).toContainText('取り消しました');
  } finally {
    await page.evaluate(() => {
      if (document.documentElement.dataset.nativeEncodeGate === 'armed') {
        delete document.documentElement.dataset.nativeEncodeGate;
      }
      window.dispatchEvent(new Event('native-test-release-encode'));
    });
  }
  await expect(page.locator('html')).toHaveAttribute('data-native-encode-gate', 'released');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect((await backup(page)).project).toEqual(before.project);
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  const second = await context.newPage();
  try {
    await second.goto('/3d/');
    await second.getByRole('button', { name: /Texture fixture/ }).click();
    await expect(
      second.getByText(
        '別のタブが編集権を持っているか、編集権が切り替わりました。このタブでは内容を保持し、読み取り専用にしています。',
        { exact: true },
      ),
    ).toBeVisible();
    await panel(second).getByText('画像とUVを開く', { exact: true }).click();
    await expect(panel(second).getByLabel('baseColor画像', { exact: true })).toBeDisabled();
    await expect(
      panel(second).getByRole('button', { name: '色調を派生画像として適用', exact: true }),
    ).toBeDisabled();
    expect((await backup(second)).project.materials[0].textureBlobId).toBe(
      before.project.materials[0].textureBlobId,
    );
  } finally {
    await second.close();
  }
});

test('UV0 orientation and color survive native display, PNG, GPU suspension and image removal', async ({
  page,
}) => {
  await open(page);
  await apply(page, await image(page));
  await page.getByRole('button', { name: '3D表示を開く', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await page.getByText('カメラ・表示の詳細設定', { exact: true }).click();
  await page.getByRole('button', { name: '正面から見る', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG画像を保存', exact: true }).click();
  const png = await readFile((await (await download).path())!);
  await visual('canonical', png);
  const centroids = await page.evaluate(async (base64) => {
    const im = new Image();
    im.src = 'data:image/png;base64,' + base64;
    await im.decode();
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d')!;
    x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const buckets = [
      { x: 0, y: 0, n: 0 },
      { x: 0, y: 0, n: 0 },
      { x: 0, y: 0, n: 0 },
    ];
    for (let y = 0; y < c.height; y++)
      for (let xx = 0; xx < c.width; xx++) {
        const k = (y * c.width + xx) * 4;
        for (let channel = 0; channel < 3; channel++)
          if (
            d[k + channel] > 80 &&
            d[k + channel] > d[k + ((channel + 1) % 3)] * 2 &&
            d[k + channel] > d[k + ((channel + 2) % 3)] * 2
          ) {
            buckets[channel].x += xx;
            buckets[channel].y += y;
            buckets[channel].n++;
          }
      }
    return buckets.map((b) => ({ x: b.x / b.n, y: b.y / b.n, n: b.n }));
  }, png.toString('base64'));
  for (const c of centroids) expect(c.n).toBeGreaterThan(100);
  expect(centroids[0].x).toBeLessThan(centroids[1].x);
  expect(centroids[0].y).toBeLessThan(centroids[2].y);
  await page.getByRole('button', { name: '保存してGPU表示を休止', exact: true }).click();
  await expect(
    page.getByText('GPU表示を休止しています。保存済みの内容から再開できます。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'GPU表示を再開', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await visual('restored', await page.locator('.native-viewport-host canvas').screenshot());
  await panel(page).getByRole('button', { name: '材質から画像を外す', exact: true }).click();
  const removed = await backup(page);
  expect(removed.project.materials[0].textureBlobId).toBeUndefined();
  expect(removed.project.sources).toHaveLength(1);
  expect(removed.blobs.size).toBe(1);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
});

test('JPEG import and cancelled image preparation keep the committed project recoverable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const decode = window.createImageBitmap.bind(window);
    window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
      document.documentElement.dataset.nativeDecodeCalls = String(
        Number(document.documentElement.dataset.nativeDecodeCalls ?? 0) + 1,
      );
      const held = document.documentElement.dataset.nativeDecodeGate === 'armed';
      if (held) {
        document.documentElement.dataset.nativeDecodeGate = 'held';
        await new Promise<void>((resolve) => {
          window.addEventListener('native-test-release-decode', () => resolve(), { once: true });
        });
      }
      const bitmap = await Reflect.apply(decode, window, args);
      if (held) document.documentElement.dataset.nativeDecodeGate = 'released';
      return bitmap;
    }) as typeof createImageBitmap;
  });
  await open(page);
  const jpeg = await image(page, 'image/jpeg');
  await apply(page, jpeg, 'image/jpeg');
  await page.getByRole('button', { name: '3D表示を開く', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  const calls = await page.locator('html').getAttribute('data-native-decode-calls');
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect(await page.locator('html').getAttribute('data-native-decode-calls')).toBe(calls);
  const before = await backup(page);
  const invalid = Buffer.from('not a PNG');
  await panel(page)
    .getByLabel('baseColor画像', { exact: true })
    .setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: invalid });
  await panel(page).getByRole('button', { name: '画像を取り込み適用', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toBeVisible();
  expect((await backup(page)).project).toEqual(before.project);
  await panel(page)
    .getByLabel('baseColor画像', { exact: true })
    .setInputFiles({ name: 'next.png', mimeType: 'image/png', buffer: await image(page) });
  await page.evaluate(() => {
    document.documentElement.dataset.nativeDecodeGate = 'armed';
  });
  try {
    await panel(page).getByRole('button', { name: '画像を取り込み適用', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-native-decode-gate', 'held');
    await panel(page).getByRole('button', { name: '画像操作を取り消す', exact: true }).click();
    await expect(panel(page).getByRole('status')).toContainText('取り消しました');
  } finally {
    await page.evaluate(() => {
      if (document.documentElement.dataset.nativeDecodeGate === 'armed') {
        delete document.documentElement.dataset.nativeDecodeGate;
      }
      window.dispatchEvent(new Event('native-test-release-decode'));
    });
  }
  await expect(page.locator('html')).toHaveAttribute('data-native-decode-gate', 'released');
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  expect((await backup(page)).project).toEqual(before.project);
});
