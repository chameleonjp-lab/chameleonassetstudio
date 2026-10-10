import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assetIoFixture, assetIoPng } from '../src/core3d/fixtures/assetIo';
import { exportGlb } from '../src/adapters3d/gltf/export';
import { captureAssetSnapshot, sha256 } from '../src/core3d/export/snapshot';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';
import { PROJECT_3D_DB_NAME, STORAGE_STORES } from '../src/core3d/storage/db';
async function original() {
  const project = assetIoFixture();
  project.name = 'Binary rescue';
  const png = await assetIoPng(),
    hash = await sha256(png);
  project.blobIds = [hash];
  project.sources = [
    {
      id: 'image',
      blobId: hash,
      mimeType: 'image/png',
      rights: { declared: 'Original fixture', embedded: '' },
    },
  ];
  project.materials[0].textureBlobId = hash;
  project.meshes[0].faces.forEach(
    (face) =>
      (face.uv = [
        [0, 0],
        [1, 0],
        [0, 1],
      ]),
  );
  const glb = (await exportGlb(captureAssetSnapshot(project, () => png))).bytes,
    glbHash = await sha256(glb);
  project.blobIds.push(glbHash);
  project.sources.push({
    id: 'source-glb',
    blobId: glbHash,
    mimeType: 'model/gltf-binary',
    rights: { declared: 'Original fixture', embedded: '' },
  });
  const blobs = new Map([
    [hash, png],
    [glbHash, glb],
  ]);
  return { bytes: await exportBackup(project, blobs), blobs };
}
async function restore(page: Page, bytes: Uint8Array) {
  await page.goto(
    new URL('/3d/', String(test.info().project.use.baseURL ?? 'http://localhost:5173')).href,
  );
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'rescue.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByRole('heading', { name: 'Binary rescue', exact: true })).toBeVisible();
}
async function download(page: Page, label: string) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  return new Uint8Array(await readFile((await (await event).path())!));
}
async function assertBytes(bytes: Uint8Array, blobs: Map<string, Uint8Array>) {
  const archive = await importBackup(bytes);
  expect(archive.blobs).toEqual(blobs);
  expect(archive.project.skins).toHaveLength(1);
  expect(archive.project.clips).toHaveLength(2);
  return archive;
}
test('a real editor render failure retains resident image/GLB bytes for rescue and independent restoration', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  let injected = 0;
  // Fault injection changes only this test's served component expression, never production source.
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (
      route.request().resourceType() !== 'script' ||
      (!url.includes('NativeAuthoringPanel') && !/\/assets\/Editor3DShell-[^/]+\.js/.test(url))
    )
      return route.continue();
    const response = await route.fetch(),
      body = await response.text();
    const pattern = /("aria-label"\s*:\s*)(["'])3D制作\2/;
    if (!pattern.test(body)) return route.fulfill({ response });
    injected++;
    return route.fulfill({
      response,
      body: body.replace(
        pattern,
        '$1(globalThis.__nativeRescueFault ? (()=>{throw new Error("Expected rescue fixture render fault")})() : "3D制作")',
      ),
    });
  });
  const fixture = await original();
  await restore(page, fixture.bytes);
  expect(injected).toBeGreaterThan(0);
  await page.getByText('ゲーム向け情報を編集', { exact: true }).click();
  await page.evaluate(() => Object.assign(globalThis, { __nativeRescueFault: true }));
  await page.getByLabel('anchor・collider・原点をプレビュー', { exact: true }).check();
  await expect(
    page.getByRole('heading', { name: '3D画面の表示を続けられませんでした', exact: true }),
  ).toBeVisible();
  await page.getByText('問題報告用の診断情報', { exact: true }).click();
  await page.getByRole('button', { name: '診断情報を作成', exact: true }).click();
  const diagnostic = await page.getByLabel('共有前の確認・編集', { exact: true }).inputValue();
  expect(diagnostic).toContain('editor-render-failed');
  expect(diagnostic).not.toContain('Binary rescue');
  const rescued = await download(page, '現在の内容をバックアップ');
  await assertBytes(rescued, fixture.blobs);
  await assertBytes(await download(page, '現在の内容をバックアップ'), fixture.blobs);
  const fresh = await browser.newContext();
  try {
    const other = await fresh.newPage();
    await restore(other, rescued);
    await assertBytes(await download(other, '現在の内容をバックアップ'), fixture.blobs);
  } finally {
    await fresh.close();
  }
  await test.info().attach('native-visual-binary-rescue', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
test('saved source-backed backup succeeds under total write quota and leaves every store unchanged', async ({
  page,
}) => {
  const fixture = await original();
  await restore(page, fixture.bytes);
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      if (args[1] === 'readwrite') {
        throw new DOMException('Fixture write quota', 'QuotaExceededError');
      }
      return transaction.call(
        this,
        typeof args[0] === 'string' ? args[0] : Array.from(args[0]),
        args[1],
        args[2],
      );
    };
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: '保存済みの版をバックアップ: Binary rescue', exact: true }),
  ).toBeVisible();
  const stored = () =>
    page.evaluate(
      async ({ name, stores }) => {
        const request = indexedDB.open(name);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const transaction = db.transaction(stores, 'readonly');
          const result = await Promise.all(
            stores.map(
              (store) =>
                new Promise<unknown[]>((resolve, reject) => {
                  const get = transaction.objectStore(store).getAll();
                  get.onsuccess = () => resolve(get.result);
                  get.onerror = () => reject(get.error);
                }),
            ),
          );
          return JSON.stringify(result);
        } finally {
          db.close();
        }
      },
      { name: PROJECT_3D_DB_NAME, stores: [...STORAGE_STORES] },
    );
  const before = await stored();
  await assertBytes(
    await download(page, '保存済みの版をバックアップ: Binary rescue'),
    fixture.blobs,
  );
  expect(await stored()).toBe(before);
});
