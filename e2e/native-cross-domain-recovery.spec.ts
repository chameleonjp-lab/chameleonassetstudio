import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { importBackup } from '../src/core3d/backup/backup';
import { PROJECT_3D_DB_NAME } from '../src/core3d/storage/db';
import { confirmImageImport } from './importTestHelpers';

async function download(page: Page, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name, exact: true }).click();
  return new Uint8Array(await readFile((await (await pending).path())!));
}
function assetFromBackup(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const path = Object.keys(files).find((key) => key.endsWith('/asset.json'));
  if (!path) throw new Error('Expected asset.json in the actual 2D backup');
  return JSON.parse(new TextDecoder().decode(files[path])) as { origin: { x: number; y: number } };
}
async function stored(page: Page, name: string, stores: string[]) {
  return page.evaluate(
    async ({ name, stores }) => {
      const opened = indexedDB.open(name);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        opened.onsuccess = () => resolve(opened.result);
        opened.onerror = () => reject(opened.error);
      });
      try {
        const transaction = db.transaction(stores, 'readonly');
        const records = await Promise.all(
          stores.map(
            (store) =>
              new Promise<unknown[]>((resolve, reject) => {
                const request = transaction.objectStore(store).getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }),
          ),
        );
        const bytes = async (value: unknown): Promise<unknown> => {
          if (value instanceof Blob)
            return {
              blob: Array.from(new Uint8Array(await value.arrayBuffer())),
              type: value.type,
            };
          if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
          if (ArrayBuffer.isView(value))
            return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
          if (Array.isArray(value)) return Promise.all(value.map(bytes));
          if (value && typeof value === 'object')
            return Object.fromEntries(
              await Promise.all(
                Object.entries(value).map(async ([key, entry]) => [key, await bytes(entry)]),
              ),
            );
          return value;
        };
        return JSON.stringify(await bytes(records));
      } finally {
        db.close();
      }
    },
    { name, stores },
  );
}
async function quota(page: Page, enabled: boolean) {
  await page.evaluate((enabled) => {
    const state = window as unknown as {
      quotaFixture?: { original: typeof IDBDatabase.prototype.transaction; enabled: boolean };
    };
    if (!state.quotaFixture) {
      state.quotaFixture = { original: IDBDatabase.prototype.transaction, enabled: false };
      IDBDatabase.prototype.transaction = function (...args) {
        if (state.quotaFixture!.enabled && args[1] === 'readwrite')
          throw new DOMException('Same-origin quota fixture', 'QuotaExceededError');
        return state.quotaFixture!.original.call(
          this,
          typeof args[0] === 'string' ? args[0] : Array.from(args[0]),
          args[1],
          args[2],
        );
      };
    }
    state.quotaFixture.enabled = enabled;
  }, enabled);
}

test('same-origin 2D and 3D keep independent durable data and recover pending edits across either quota failure', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.goto('/2d/');
  await page.getByLabel('プロジェクト名', { exact: true }).fill('Shared quota 2D');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#39a45e';
    ctx.fillRect(0, 0, 8, 8);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('画像を選ぶ', { exact: true }).setInputFiles({
    name: 'original.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  const first2d = await download(page, '.casproj をダウンロード');
  const native = await context.newPage();
  await native.goto('/3d/');
  await native.getByLabel('新しいプロジェクト名', { exact: true }).fill('Shared quota 3D');
  await native.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await native.getByRole('button', { name: '箱を追加', exact: true }).click();
  await native.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  const before3d = await stored(native, PROJECT_3D_DB_NAME, ['roots', 'snapshots', 'blobs']);
  await quota(native, true);
  await native.getByLabel('プロジェクト名', { exact: true }).fill('3D resident unsaved');
  await page
    .getByRole('navigation', { name: 'プロパティ内メニュー' })
    .getByRole('link', { name: 'ゲーム情報', exact: true })
    .click();
  await page.getByLabel('原点 X', { exact: true }).fill('12');
  await page.getByLabel('原点 X', { exact: true }).blur();
  await native.getByRole('button', { name: /^(今すぐ保存|保存を再試行)$/ }).click();
  await expect(native.locator('.editor3d-save-status')).toContainText('保存に失敗');
  expect(await stored(native, PROJECT_3D_DB_NAME, ['roots', 'snapshots', 'blobs'])).toBe(before3d);
  const rescued = await importBackup(await download(native, '現在の内容をバックアップ'));
  expect(rescued.project.name).toBe('3D resident unsaved');
  expect(rescued.project.meshes).toHaveLength(1);
  const healthy2d = await download(page, '.casproj をダウンロード');
  expect(assetFromBackup(healthy2d).origin.x).toBe(12);
  expect(Object.keys(unzipSync(healthy2d))).toEqual(Object.keys(unzipSync(first2d)));

  await quota(native, false);
  await native.getByRole('button', { name: '保存を再試行', exact: true }).click();
  await expect(native.locator('.editor3d-save-status')).toContainText('保存済み');
  const before2d = await stored(page, 'chameleon-asset-studio', ['projects', 'assets', 'blobs']);
  await quota(page, true);
  await page.getByLabel('原点 X', { exact: true }).fill('13');
  await page.getByLabel('原点 X', { exact: true }).blur();
  await expect(page.locator('.editor-save-status')).toContainText('保存失敗');
  await native.getByLabel('プロジェクト名', { exact: true }).fill('3D healthy during 2D failure');
  await native.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  await expect(native.locator('.editor3d-save-status')).toContainText('保存済み');
  expect(await stored(page, 'chameleon-asset-studio', ['projects', 'assets', 'blobs'])).toBe(
    before2d,
  );
  const downloads: string[] = [];
  page.on('download', (value) => downloads.push(value.suggestedFilename()));
  await page.getByRole('button', { name: '.casproj をダウンロード', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '書き出しに失敗しました' })).toBeVisible();
  expect(downloads).toEqual([]);
  await expect(page.getByLabel('原点 X', { exact: true })).toHaveValue('13');
  expect(
    (await importBackup(await download(native, '現在の内容をバックアップ'))).project.name,
  ).toBe('3D healthy during 2D failure');
  await quota(page, false);
  await page.getByRole('button', { name: '保存を再試行', exact: true }).click();
  await expect(page.locator('.editor-save-status')).toHaveText('保存済み');
  const final2d = await download(page, '.casproj をダウンロード');
  expect(assetFromBackup(final2d).origin.x).toBe(13);
  const beforeFiles = unzipSync(first2d),
    afterFiles = unzipSync(final2d);
  for (const path of Object.keys(beforeFiles).filter((key) => /\.(png|jpg|jpeg|webp)$/i.test(key)))
    expect(afterFiles[path]).toEqual(beforeFiles[path]);
  await test.info().attach('native-cross-domain-quota', {
    body: Buffer.from(
      JSON.stringify({
        browser: test.info().project.name,
        sameOrigin: new URL(page.url()).origin === new URL(native.url()).origin,
        directions: ['3D-failed-2D-saved', '2D-failed-3D-saved'],
        nativeResidentBackup: true,
        twoDimensionalStaleBackupRejected: true,
        finalRetriesSaved: true,
      }),
    ),
    contentType: 'application/json',
  });
});
