import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

async function makeSolidPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#224466';
    context.fillRect(0, 0, 8, 8);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

function packGifCodes(codes: number[]): number[] {
  const bytes: number[] = [];
  let buffer = 0;
  let bitCount = 0;
  for (const code of codes) {
    buffer |= code << bitCount;
    bitCount += 3;
    while (bitCount >= 8) {
      bytes.push(buffer & 0xff);
      buffer >>= 8;
      bitCount -= 8;
    }
  }
  if (bitCount > 0) bytes.push(buffer & 0xff);
  return bytes;
}

function gifFrame(colorIndex: number, delayCentiseconds: number): number[] {
  const codes = Array.from({ length: 4 }, () => [4, colorIndex]).flat();
  codes.push(5);
  const imageData = packGifCodes(codes);
  return [
    0x21,
    0xf9,
    0x04,
    0,
    delayCentiseconds & 0xff,
    (delayCentiseconds >> 8) & 0xff,
    0,
    0,
    0x2c,
    0,
    0,
    0,
    0,
    2,
    0,
    2,
    0,
    0,
    2,
    imageData.length,
    ...imageData,
    0,
  ];
}

function animatedGifBuffer(frameCount = 2, loopCount = 0): Buffer {
  const frames = Array.from({ length: frameCount }, (_, index) =>
    gifFrame(index % 2, index === 0 ? 10 : 20),
  ).flat();
  return Buffer.from([
    ...Buffer.from('GIF89a'),
    2,
    0,
    2,
    0,
    0x80,
    0,
    0,
    0xff,
    0,
    0,
    0,
    0xff,
    0,
    0x21,
    0xff,
    0x0b,
    ...Buffer.from('NETSCAPE2.0'),
    3,
    1,
    loopCount & 0xff,
    (loopCount >> 8) & 0xff,
    0,
    ...frames,
    0x3b,
  ]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value >>> 0);
  return bytes;
}

function pngChunk(type: string, data: Uint8Array = new Uint8Array()): Buffer {
  const typeBytes = Buffer.from(type, 'ascii');
  const payload = Buffer.from(data);
  return Buffer.concat([
    uint32(payload.length),
    typeBytes,
    payload,
    uint32(crc32(Buffer.concat([typeBytes, payload]))),
  ]);
}

function pngFramePixels(r: number, g: number, b: number): Buffer {
  return deflateSync(Buffer.from([0, r, g, b, 255, r, g, b, 255, 0, r, g, b, 255, r, g, b, 255]));
}

function frameControl(sequence: number, delayNumerator: number): Buffer {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  data.writeUInt32BE(2, 4);
  data.writeUInt32BE(2, 8);
  data.writeUInt32BE(0, 12);
  data.writeUInt32BE(0, 16);
  data.writeUInt16BE(delayNumerator, 20);
  data.writeUInt16BE(10, 22);
  data[24] = 0;
  data[25] = 0;
  return data;
}

function animatedPngBuffer(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const animationControl = Buffer.concat([uint32(2), uint32(0)]);
  const secondFrame = Buffer.concat([uint32(2), pngFramePixels(0, 255, 0)]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('acTL', animationControl),
    pngChunk('fcTL', frameControl(0, 1)),
    pngChunk('IDAT', pngFramePixels(255, 0, 0)),
    pngChunk('fcTL', frameControl(1, 1)),
    pngChunk('fdAT', secondFrame),
    pngChunk('IEND'),
  ]);
}

async function createProject(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function confirmLossPreview(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  const confirm = dialog.getByRole('button', { name: '取り込みを確定' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/loss・warningを確認/).check();
  await confirm.click();
  await expect(dialog).toBeHidden();
}

interface OptionalStoredAsset {
  id: string;
  name: string;
  textures: Array<{ id: string; kind: string; mimeType: string; path: string }>;
  layers: Array<{ id: string; visible: boolean }>;
  frames: Array<{
    id: string;
    layerStates: Array<{ layerId: string; visible?: boolean }>;
  }>;
  animations: Array<{
    fps: number;
    loop: boolean;
    durationMs?: number;
    frameIds: string[];
  }>;
  provenance?: Array<{
    sourceFileName: string;
    mimeType: string;
    byteLength: number;
    hash: string;
    textureId?: string;
  }>;
}

async function readAssets(page: Page): Promise<OptionalStoredAsset[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ data: OptionalStoredAsset }>>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result as never);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records.map(({ data }) => data);
  });
}

async function readQuarantineCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction('quarantine', 'readonly').objectStore('quarantine').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return count;
  });
}

async function readEditColors(page: Page, assetId: string): Promise<number[][]> {
  return page.evaluate(async (targetAssetId) => {
    const requestResult = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const assets = (await requestResult(
      db.transaction('assets', 'readonly').objectStore('assets').getAll(),
    )) as Array<{ data: OptionalStoredAsset }>;
    const blobs = (await requestResult(
      db.transaction('blobs', 'readonly').objectStore('blobs').getAll(),
    )) as Array<{ key: string; mimeType: string; bytes: ArrayBuffer }>;
    db.close();
    const asset = assets.find(({ data }) => data.id === targetAssetId)?.data;
    if (!asset) throw new Error('Asset not found');
    const colors: number[][] = [];
    for (const texture of asset.textures.filter(({ kind }) => kind === 'edit')) {
      const record = blobs.find(({ key }) => key === `${asset.id}/${texture.path}`);
      if (!record) throw new Error(`Blob not found: ${texture.path}`);
      const bitmap = await createImageBitmap(new Blob([record.bytes], { type: record.mimeType }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      colors.push([...context.getImageData(0, 0, 1, 1).data]);
      bitmap.close();
    }
    return colors;
  }, assetId);
}

async function readSourceBytes(page: Page, asset: OptionalStoredAsset): Promise<number[]> {
  return page.evaluate(
    async ({ id, path }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('chameleon-asset-studio');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<{ bytes: ArrayBuffer }>((resolve, reject) => {
        const request = db
          .transaction('blobs', 'readonly')
          .objectStore('blobs')
          .get(`${id}/${path}`);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return [...new Uint8Array(record.bytes)];
    },
    { id: asset.id, path: asset.textures.find(({ kind }) => kind === 'source')!.path },
  );
}

test('safe SVGをrasterizeし、source原本・Undo・reloadを維持する', async ({ page }) => {
  await createProject(page, 'optional SVG');
  await expect(page.getByLabel('画像取り込み対応状況')).toContainText('Aseprite');
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#663399"/></svg>',
  );
  const input = page.getByLabel('画像を選ぶ');
  await input.setInputFiles({ name: 'safe.svg', mimeType: 'image/svg+xml', buffer: svg });
  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText('safe.svgをbrowser画像contextで8 x 8のPNGへrasterizeします');
  await expect(dialog).toContainText('ベクター構造は編集対象にせず');
  await dialog.getByRole('button', { name: '取り込みを取消' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(0);

  const png = await makeSolidPng(page);
  await input.setInputFiles([
    { name: 'normal.png', mimeType: 'image/png', buffer: png },
    { name: 'safe.svg', mimeType: 'image/svg+xml', buffer: svg },
  ]);
  await expect(dialog).toContainText('新規Asset画像（通常 + optional形式）');
  await expect(dialog).toContainText('2件の独立Asset');
  await confirmLossPreview(page);
  const asset = (await readAssets(page)).find(({ name }) => name === 'safe')!;
  expect(asset.textures.find(({ kind }) => kind === 'source')?.mimeType).toBe('image/svg+xml');
  expect(asset.textures.find(({ kind }) => kind === 'edit')?.mimeType).toBe('image/png');
  expect(asset.provenance?.[0]).toMatchObject({
    sourceFileName: 'safe.svg',
    mimeType: 'image/svg+xml',
    byteLength: svg.byteLength,
    hash: `sha256:${createHash('sha256').update(svg).digest('hex')}`,
  });
  expect(Buffer.from(await readSourceBytes(page, asset))).toEqual(svg);

  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(0);
  await page.getByRole('button', { name: 'やり直す' }).click();
  await expect.poll(async () => (await readAssets(page)).length).toBe(2);
  await page.reload();
  await page.getByRole('button', { name: '「optional SVG」を開く' }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
});

test('active/external SVGをdecode前に拒否し、script・通信・正本・quarantineを変更しない', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('example.invalid')) externalRequests.push(request.url());
  });
  await createProject(page, 'unsafe SVG');
  await page.evaluate(() => {
    (globalThis as typeof globalThis & { __unsafeSvgExecuted?: boolean }).__unsafeSvgExecuted =
      false;
  });
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><script>globalThis.__unsafeSvgExecuted=true</script><image href="https://example.invalid/tracker.png"/></svg>',
  );
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'unsafe.svg',
    mimeType: 'image/svg+xml',
    buffer: svg,
  });
  await expect(page.getByRole('alert')).toContainText('安全のためSVGを取り込めません');
  expect(
    await page.evaluate(
      () =>
        (globalThis as typeof globalThis & { __unsafeSvgExecuted?: boolean }).__unsafeSvgExecuted,
    ),
  ).toBe(false);
  expect(externalRequests).toEqual([]);
  expect(await readAssets(page)).toHaveLength(0);
  expect(await readQuarantineCount(page)).toBe(0);
});

test('animated GIFを全frame化し、総durationをuniform fpsへ写像する', async ({ page }) => {
  await createProject(page, 'animated GIF');
  const gif = animatedGifBuffer(2, 2);
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'traffic.gif',
    mimeType: 'image/gif',
    buffer: gif,
  });
  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText('frame 2件 / animation 1件');
  await expect(dialog).toContainText('7fps');
  await expect(dialog).toContainText('可変表示時間');
  await expect(dialog).toContainText('有限回repeat');
  await confirmLossPreview(page);

  const asset = (await readAssets(page))[0];
  expect(asset.layers).toHaveLength(2);
  expect(asset.frames).toHaveLength(2);
  expect(asset.animations[0]).toMatchObject({ fps: 7, loop: false, durationMs: 300 });
  expect(asset.animations[0].frameIds).toHaveLength(2);
  expect(await readEditColors(page, asset.id)).toEqual([
    [255, 0, 0, 255],
    [0, 255, 0, 255],
  ]);
  expect(Buffer.from(await readSourceBytes(page, asset))).toEqual(gif);
});

test('image/png宣言のAPNGをacTLで判別し、canonical source MIMEの全frame Assetにする', async ({
  page,
}) => {
  await createProject(page, 'animated PNG');
  const apng = animatedPngBuffer();
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'signal.png',
    mimeType: 'image/png',
    buffer: apng,
  });
  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText(
    'signal.pngから2件のedit PNG・layer・frameとanimationを作成します',
  );
  await expect(dialog).toContainText('10fps');
  await confirmLossPreview(page);

  const asset = (await readAssets(page))[0];
  expect(asset.frames).toHaveLength(2);
  expect(asset.animations[0]).toMatchObject({ fps: 10, loop: true, durationMs: 200 });
  expect(asset.textures.find(({ kind }) => kind === 'source')).toMatchObject({
    mimeType: 'image/png',
    path: 'source/original.png',
  });
  expect(asset.provenance?.[0].mimeType).toBe('image/png');
  expect(await readEditColors(page, asset.id)).toEqual([
    [255, 0, 0, 255],
    [0, 255, 0, 255],
  ]);
  expect(Buffer.from(await readSourceBytes(page, asset))).toEqual(apng);
});

test('ImageDecoder非対応環境では先頭frame + 必須loss確認へfallbackする', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, 'ImageDecoder', {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });
  await createProject(page, 'animated fallback');
  await page.getByLabel('画像を選ぶ').setInputFiles({
    name: 'fallback.gif',
    mimeType: 'image/gif',
    buffer: animatedGifBuffer(),
  });
  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await expect(dialog).toContainText('2frame中の先頭1frameだけ');
  await confirmLossPreview(page);
  const asset = (await readAssets(page))[0];
  expect(asset.frames).toHaveLength(1);
  expect(asset.layers).toHaveLength(1);
  expect(asset.animations[0]).toMatchObject({ fps: 8, loop: true });
  expect(asset.animations[0].durationMs).toBeUndefined();
  expect(await readQuarantineCount(page)).toBe(0);
});

test('unsupported形式と17frame GIFを理由付き拒否し、正本・quarantineを変更しない', async ({
  page,
}) => {
  await createProject(page, 'optional limits');
  const input = page.getByLabel('画像を選ぶ');
  await input.setInputFiles({
    name: 'hero.aseprite',
    mimeType: 'application/x-aseprite',
    buffer: Buffer.from('aseprite'),
  });
  await expect(page.getByRole('alert')).toContainText('PNG Sprite Sheet');

  await input.setInputFiles({
    name: 'too-many.gif',
    mimeType: 'image/gif',
    buffer: animatedGifBuffer(17),
  });
  await expect(page.getByRole('alert')).toContainText('最大16frame');
  expect(await readAssets(page)).toHaveLength(0);
  expect(await readQuarantineCount(page)).toBe(0);
});

test.describe('iPhone SE級touch optional fallback', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 667 } });

  test('loss確認・確定・Undo・reloadへ横overflowなしで到達する', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis, 'ImageDecoder', {
        configurable: true,
        value: undefined,
        writable: true,
      });
    });
    await createProject(page, 'mobile optional');
    await page.getByLabel('画像を選ぶ').setInputFiles({
      name: 'mobile.gif',
      mimeType: 'image/gif',
      buffer: animatedGifBuffer(),
    });
    const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
    await dialog.getByLabel(/loss・warningを確認/).tap();
    await dialog.getByRole('button', { name: '取り込みを確定' }).tap();
    await page.getByRole('button', { name: '元に戻す' }).tap();
    await expect.poll(async () => (await readAssets(page)).length).toBe(0);
    await page.getByRole('button', { name: 'やり直す' }).tap();
    await expect.poll(async () => (await readAssets(page)).length).toBe(1);
    await page.reload();
    await page.getByRole('button', { name: '「mobile optional」を開く' }).tap();
    await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
});
