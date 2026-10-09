import { test, expect, type Page, type Route } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { unzipSync } from 'fflate';
import { importBackup } from '../src/core3d/backup/backup';
import { preflightGlb } from '../src/core3d/import/preflight';
import { assetIoFixture, assetIoPng } from '../src/core3d/fixtures/assetIo';
import { captureAssetSnapshot, sha256 } from '../src/core3d/export/snapshot';
import { exportGlb, encodeGlb } from '../src/adapters3d/gltf/export';
import { buildAssetPackage } from '../src/core3d/export/mapping';
async function setup(page: Page) {
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Asset delivery');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
}
const io = (page: Page) => page.getByRole('region', { name: '3D GLB入出力', exact: true });
async function openIo(page: Page) {
  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  return io(page);
}
async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return new Uint8Array(await readFile((await (await pending).path())!));
}
async function visual(page: Page, name: string) {
  const path = test.info().outputPath('native-visual-asset-io-' + name + '.png');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await page.screenshot({ fullPage: true }));
  await test.info().attach(name, { path, contentType: 'image/png' });
}
async function holdWorker(page: Page) {
  let resume!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      resume = resolve;
    }),
    seen = new Promise<void>((resolve) => {
      started = resolve;
    });
  const pattern = /assetIo\.worker/;
  const handler = async (route: Route) => {
    started();
    await gate;
    await route.continue().catch(() => undefined);
  };
  await page.route(pattern, handler);
  return {
    seen,
    release: async () => {
      resume();
      await page.unroute(pattern, handler);
    },
  };
}
test('authors game metadata and emits GLB, sidecar and ZIP from a fixed canonical revision', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  await page.getByText('ゲーム向け情報を編集', { exact: true }).click();
  const game = page.getByRole('region', { name: '3Dゲーム向け情報', exact: true });
  await game.getByLabel('asset種類', { exact: true }).fill('prop');
  await game.getByLabel('原点の決め方', { exact: true }).selectOption('feet');
  await game.getByRole('button', { name: 'ゲーム基本情報を適用', exact: true }).click();
  await game.getByLabel('anchor名', { exact: true }).fill('Grip');
  await game.getByLabel('anchor用途', { exact: true }).fill('attachment');
  const binding = game.getByLabel('anchor追従先（node / bone）', { exact: true });
  const target = await binding.locator('option').nth(1).getAttribute('value');
  await binding.selectOption(target!);
  await game.getByRole('button', { name: 'anchorを追加', exact: true }).click();
  await game.getByLabel('collider名', { exact: true }).fill('Hit');
  await game.getByLabel('collider用途', { exact: true }).fill('hitbox');
  await game.getByLabel('collider形状', { exact: true }).selectOption('capsule');
  await game.getByRole('button', { name: 'colliderを追加', exact: true }).click();
  await page.getByLabel('anchor・collider・原点をプレビュー', { exact: true }).check();
  await page.getByRole('button', { name: '全体を表示', exact: true }).click();
  await visual(page, 'game-preview');
  const panel = await openIo(page),
    held = await holdWorker(page);
  await panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await held.seen;
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await held.release();
  await expect(panel.getByRole('button', { name: 'ZIPを保存', exact: true })).toBeVisible();
  const zip = unzipSync(await download(page, 'ZIPを保存')),
    glb = preflightGlb(zip['model.glb']),
    meta = JSON.parse(new TextDecoder().decode(zip['game.json']));
  expect(glb.json.meshes?.length).toBe(1);
  expect(meta.game.anchors[0].name).toBe('Grip');
  expect(meta.game.colliders[0].shape).toBe('capsule');
  expect(meta.game.origin[1]).toBe(-0.5);
  expect(meta.modelHash).toBe(await sha256(zip['model.glb']));
  const backup = await importBackup(await download(page, '現在の内容をバックアップ'));
  expect(backup.project.game).toEqual(meta.game);
  expect(backup.project.meshes).toHaveLength(2);
  expect(meta.revision).toBeLessThan(backup.project.revision);
  expect(backup.project.nodes[0].transform.translation).toEqual([0, 0, 0]);
  const png = await download(page, 'PNG画像を保存');
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});
test('imports actual mixed-skin textured animation bytes in an independent context, edits and reexports', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const p = assetIoFixture(),
    png = await assetIoPng(),
    hash = await sha256(png);
  p.blobIds = [hash];
  p.sources = [
    {
      id: 'four-colors',
      blobId: hash,
      mimeType: 'image/png',
      rights: { declared: 'Original fixture CC0', embedded: '' },
    },
  ];
  p.materials[0].textureBlobId = hash;
  p.meshes[0].faces.forEach((face) => {
    face.uv = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
  });
  const original = await exportGlb(captureAssetSnapshot(p, () => png)),
    pkg = await buildAssetPackage(p, original.bytes, original.warnings);
  await setup(page);
  let panel = await openIo(page);
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'model.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(pkg.glb),
  });
  await panel.getByLabel('対応するgame.json（任意・8MiBまで）', { exact: true }).setInputFiles({
    name: 'game.json',
    mimeType: 'application/json',
    buffer: Buffer.from(pkg.sidecar),
  });
  await panel
    .getByRole('button', { name: 'GLBを検査して新しいコピーへ取り込む', exact: true })
    .click();
  await page
    .getByRole('region', { name: '保存したプロジェクト', exact: true })
    .getByRole('button', { name: /^Imported GLB revision/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Imported GLB', exact: true })).toBeVisible();
  const backup = await download(page, '現在の内容をバックアップ'),
    saved = await importBackup(backup);
  expect(saved.project.clips).toHaveLength(2);
  expect(saved.project.clips[0].loop).toBe(true);
  expect(saved.blobs.get(await sha256(pkg.glb))).toEqual(pkg.glb);
  expect(saved.blobs.get(await sha256(pkg.sidecar))).toEqual(pkg.sidecar);
  const fresh = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const restored = await fresh.newPage();
    await restored.goto('/3d/');
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'asset.cas3dproj',
      mimeType: 'application/zip',
      buffer: Buffer.from(backup),
    });
    await expect(
      restored.getByRole('heading', { name: 'Imported GLB', exact: true }),
    ).toBeVisible();
    await restored.getByRole('button', { name: '3D表示を開く', exact: true }).click();
    await expect(restored.getByText('3D表示中', { exact: true })).toBeVisible();
    await restored.getByRole('button', { name: '全体を表示', exact: true }).click();
    await visual(restored, 'textured-skin-restored');
    await restored.getByText('ゲーム向け情報を編集', { exact: true }).click();
    const game = restored.getByRole('region', { name: '3Dゲーム向け情報', exact: true });
    await game.getByLabel('asset種類', { exact: true }).fill('character');
    await game.getByRole('button', { name: 'ゲーム基本情報を適用', exact: true }).click();
    panel = io(restored);
    if (!(await panel.isVisible())) await openIo(restored);
    await panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'ZIPを保存', exact: true })).toBeVisible();
    const second = unzipSync(await download(restored, 'ZIPを保存')),
      meta = JSON.parse(new TextDecoder().decode(second['game.json']));
    expect(meta.game.assetKind).toBe('character');
    expect(meta.provenance.ancestors.length).toBeGreaterThan(0);
    expect(preflightGlb(second['model.glb']).json.animations).toHaveLength(1);
  } finally {
    await fresh.close();
  }
});
test('phone game numeric editing supports IME and cancels a worker without changing the project', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await setup(page);
    await page.getByText('ゲーム向け情報を編集', { exact: true }).click();
    const game = page.getByRole('region', { name: '3Dゲーム向け情報', exact: true }),
      input = game.getByLabel('asset種類', { exact: true });
    await input.fill('character');
    await input.dispatchEvent('compositionstart');
    await game.getByRole('button', { name: 'ゲーム基本情報を適用', exact: true }).click();
    expect(
      (await importBackup(await download(page, '現在の内容をバックアップ'))).project.game.assetKind,
    ).toBe('prop');
    await input.dispatchEvent('compositionend');
    await game.getByLabel('受渡し単位（1単位あたりのm）', { exact: true }).fill('0.01');
    await game.getByRole('button', { name: 'ゲーム基本情報を適用', exact: true }).focus();
    await page.keyboard.press('Enter');
    const before = await importBackup(await download(page, '現在の内容をバックアップ'));
    expect(before.project.game.assetKind).toBe('character');
    expect(before.project.game.unitMeters).toBe(0.01);
    const panel = await openIo(page),
      held = await holdWorker(page);
    await panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).tap();
    await held.seen;
    // Closing the owning panel terminates work or releases its finished output in either race.
    await panel.getByRole('button', { name: 'GLB入出力を閉じる', exact: true }).tap();
    await held.release();
    const after = await importBackup(await download(page, '現在の内容をバックアップ'));
    expect(after.project).toEqual(before.project);
    await panel.getByRole('button', { name: 'GLB入出力を開く', exact: true }).tap();
    await page.getByRole('button', { name: '全体を表示', exact: true }).click();
    await visual(page, 'phone');
    for (const region of [game, panel]) {
      expect(await region.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
    }
    for (const button of await panel.getByRole('button').all())
      if (await button.isVisible())
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0);
  } finally {
    await context.close();
  }
});
test('mismatched sidecar and unknown required extension reject while the canonical backup survives', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ')),
    panel = await openIo(page);
  const p = assetIoFixture(),
    a = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array())),
    pkg = await buildAssetPackage(p, a.bytes, a.warnings),
    f = preflightGlb(a.bytes);
  f.json.extensionsRequired = ['UNSUPPORTED'];
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'bad.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(encodeGlb(f.json, f.binary)),
  });
  await panel
    .getByRole('button', { name: 'GLBを検査して新しいコピーへ取り込む', exact: true })
    .click();
  await expect(panel.getByRole('alert')).toContainText('required extension');
  p.nodes[0].name = 'Other';
  const b = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array()));
  await panel
    .getByLabel('読み込むGLB（32MiBまで）', { exact: true })
    .setInputFiles({ name: 'b.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(b.bytes) });
  await panel.getByLabel('対応するgame.json（任意・8MiBまで）', { exact: true }).setInputFiles({
    name: 'game.json',
    mimeType: 'application/json',
    buffer: Buffer.from(pkg.sidecar),
  });
  await panel
    .getByRole('button', { name: 'GLBを検査して新しいコピーへ取り込む', exact: true })
    .click();
  await expect(panel.getByRole('alert')).toContainText('match');
  expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
    before.project,
  );
});

test('stale import and outer-panel close discard in-flight workers without publishing their copies', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  const panel = await openIo(page),
    p = assetIoFixture(),
    { bytes } = await exportGlb(captureAssetSnapshot(p, () => new Uint8Array()));
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'model.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(bytes),
  });
  let held = await holdWorker(page);
  await panel
    .getByRole('button', { name: 'GLBを検査して新しいコピーへ取り込む', exact: true })
    .click();
  await held.seen;
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await held.release();
  await expect(panel.getByRole('status')).toContainText('中止');
  expect(
    (await importBackup(await download(page, '現在の内容をバックアップ'))).project.meshes,
  ).toHaveLength(2);
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
  held = await holdWorker(page);
  await panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await held.seen;
  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  await held.release();
  await expect(panel).toHaveCount(0);
  await openIo(page);
  await expect(io(page).getByRole('button', { name: 'ZIPを保存', exact: true })).toHaveCount(0);
});

test('worker validates JPEG and converts WebP with actual four-corner RGBA pixels', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const { assetWebpBase64, assetJpegBase64 } = await import('../src/core3d/fixtures/assetIo');
  const { nativeBox } = await import('../src/core3d/fixtures/nativeBox');
  const { exportBackup } = await import('../src/core3d/backup/backup');
  for (const [mime, encoded] of [
    ['image/webp', assetWebpBase64],
    ['image/jpeg', assetJpegBase64],
  ] as const) {
    const source = new Uint8Array(Buffer.from(encoded, 'base64')),
      hash = await sha256(source),
      p = nativeBox('codec-fixture');
    p.blobIds = [hash];
    p.sources = [
      {
        id: 'original-image',
        blobId: hash,
        mimeType: mime,
        rights: { declared: 'Original codec fixture CC0', embedded: '' },
      },
    ];
    p.materials[0].textureBlobId = hash;
    p.materials[0].alphaMode = 'LEGACY_AUTO';
    p.meshes[0].faces.forEach((face) => {
      face.uv = [
        [0, 0],
        [1, 0],
        [0, 1],
      ];
    });
    const archive = await exportBackup(p, new Map([[hash, source]]));
    const context = await browser.newContext({ baseURL }),
      page = await context.newPage();
    try {
      await page.goto('/3d/');
      await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
        name: 'codec.cas3dproj',
        mimeType: 'application/zip',
        buffer: Buffer.from(archive),
      });
      await expect(page.getByRole('heading', { name: 'Native box', exact: true })).toBeVisible();
      const panel = await openIo(page);
      await panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
      await expect(panel.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
      const bytes = await download(page, 'GLBを保存'),
        f = preflightGlb(bytes),
        image = f.json.images![0],
        view = f.json.bufferViews![image.bufferView!];
      const embedded = f.binary.slice(
        view.byteOffset ?? 0,
        (view.byteOffset ?? 0) + view.byteLength,
      );
      expect(image.mimeType).toBe(mime === 'image/webp' ? 'image/png' : 'image/jpeg');
      if (mime === 'image/jpeg') expect(embedded).toEqual(source);
      const pixels = await page.evaluate(
        async ({ bytes, mime }) => {
          const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }));
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          return [...context.getImageData(0, 0, 2, 2).data];
        },
        { bytes: [...embedded], mime: image.mimeType! },
      );
      if (mime === 'image/webp')
        expect(pixels).toEqual([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 64]);
      else
        for (let i = 0; i < 4; i++) {
          expect(Math.abs(pixels[i * 4] - 80)).toBeLessThanOrEqual(2);
          expect(Math.abs(pixels[i * 4 + 1] - 120)).toBeLessThanOrEqual(2);
          expect(Math.abs(pixels[i * 4 + 2] - 160)).toBeLessThanOrEqual(2);
        }
      const saved = await importBackup(await download(page, '現在の内容をバックアップ'));
      expect(saved.blobs.get(hash)).toEqual(source);
    } finally {
      await context.close();
    }
  }
});
