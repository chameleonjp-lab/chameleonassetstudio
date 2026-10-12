import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { assetIoPng } from '../src/core3d/fixtures/assetIo';
import { nativeBox } from '../src/core3d/fixtures/nativeBox';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';
import type { StoredProject3D } from '../src/core3d/model/project';
import { sha256 } from '../src/core3d/export/snapshot';
import { PROJECT_3D_DB_NAME } from '../src/core3d/storage/db';

async function retainedBackups(page: Page) {
  return page.evaluate(async (databaseName) => {
    const open = indexedDB.open(databaseName);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () =>
        reject(open.error ?? new Error('Could not open the 3D project database'));
    });
    if (!database.objectStoreNames.contains('legacyBackups')) {
      database.close();
      throw new Error('The recovery archive store is missing');
    }
    const transaction = database.transaction(['legacyBackups'], 'readonly');
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Recovery read aborted'));
      transaction.onerror = () => undefined;
    });
    const records = await new Promise<{ id: string; hash: string; bytes: Uint8Array }[]>(
      (resolve, reject) => {
        const request = transaction.objectStore('legacyBackups').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error('Could not read recovery archives'));
      },
    );
    await completed;
    database.close();
    return records.map(({ id, hash, bytes }) => ({ id, hash, bytes: Array.from(bytes) }));
  }, PROJECT_3D_DB_NAME);
}

test('product restore upgrades a 0.1.0 backup to a detached 0.3.0 copy and retains exact recovery bytes', async ({
  page,
}) => {
  const { game: _game, ...legacyBase } = nativeBox('legacy-backup-browser');
  void _game;
  const source = await assetIoPng();
  const blobId = await sha256(source);
  const legacy = {
    ...legacyBase,
    schemaVersion: '0.1.0' as const,
    name: 'Legacy 0.1 backup work',
    blobIds: [blobId],
    sources: [
      {
        id: 'legacy-backup-source',
        blobId,
        mimeType: 'image/png',
        rights: { declared: 'fixture original', embedded: '' },
      },
    ],
  } as StoredProject3D;
  const archive = await exportBackup(legacy, new Map([[blobId, source]]));
  const archivedFiles = unzipSync(archive);
  expect(JSON.parse(strFromU8(archivedFiles['manifest.json'])).version).toBe('0.1.0');
  expect(JSON.parse(strFromU8(archivedFiles['project.json'])).schemaVersion).toBe('0.1.0');

  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'legacy-0.1.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole('heading', { name: legacy.name, exact: true })).toBeVisible();
  await expect(page.locator('.editor3d-notice')).toContainText(
    '新しいプロジェクトとして復元しました。元のプロジェクトは上書きしていません。',
  );

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const download = await downloadEvent;
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('Playwright did not provide the restored backup path');
  const restored = await importBackup(new Uint8Array(await readFile(downloadPath)));
  expect(restored.project.schemaVersion).toBe('0.3.0');
  expect(restored.project.id).not.toBe(legacy.id);
  expect(restored.project.revision).toBe(0);
  expect(restored.project.name).toBe(legacy.name);
  expect(
    restored.project.nodes.map(({ id, meshId, transform }) => ({ id, meshId, transform })),
  ).toEqual(legacy.nodes.map(({ id, meshId, transform }) => ({ id, meshId, transform })));
  expect(restored.project.meshes).toEqual(legacy.meshes);
  expect(restored.project.materials).toHaveLength(legacy.materials.length);
  expect(restored.project.materials[0].alphaMode).toBe('LEGACY_AUTO');
  expect(restored.project.sources).toEqual(legacy.sources);
  expect(restored.project.blobIds).toEqual([blobId]);
  expect(restored.blobs.get(blobId)).toEqual(source);

  const recoveryArchives = await retainedBackups(page);
  expect(recoveryArchives).toEqual([
    { id: restored.project.id, hash: await sha256(archive), bytes: Array.from(archive) },
  ]);
});

test('EXP-10: a valid 2D .casproj is refused by 3D restore without replacing a saved project', async ({
  page,
}) => {
  const [projectText, assetJson, imageBase64] = await Promise.all([
    readFile('src/core/storage/__fixtures__/v0.1.0-project.json', 'utf-8'),
    readFile('src/core/storage/__fixtures__/v0.1.0-asset.json', 'utf-8'),
    readFile('src/core/storage/__fixtures__/v0.1.0-image-8x8.png.base64.txt', 'utf-8'),
  ]);
  const asset = JSON.parse(assetJson) as { id: string; textures: Array<{ path: string }> };
  const twoDArchive = zipSync(
    {
      'project.json': strToU8(projectText),
      [`assets/${asset.id}/asset.json`]: strToU8(assetJson),
      [`assets/${asset.id}/${asset.textures[0].path}`]: Buffer.from(imageBase64.trim(), 'base64'),
    },
    { level: 0 },
  );

  const preserved = nativeBox('exp10-preserved-project');
  preserved.name = 'EXP-10 preserved 3D project';
  const validBackup = await exportBackup(preserved, new Map());
  expect((await importBackup(validBackup)).project).toEqual(preserved);

  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'preserved-project.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(validBackup),
  });
  await expect(page.getByRole('heading', { name: preserved.name, exact: true })).toBeVisible();
  await page.reload();

  const library = page.getByRole('complementary', { name: '3Dプロジェクト一覧と復元' });
  const preservedProject = library.getByText(preserved.name, { exact: true });
  await expect(library).toBeVisible();
  await expect(preservedProject).toBeVisible();
  await expect(importBackup(twoDArchive)).rejects.toThrow('Unsupported backup path');

  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'legacy-2d-casproj-as-native.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(twoDArchive),
  });
  const alert = page.locator('.editor3d-alert');
  await expect(alert).toContainText('編集用バックアップの形式を確認してください');
  await expect(alert).toContainText('対応する.cas3dprojファイルを選び直してください');
  await expect(alert).toContainText('[EDIT_STORAGE_BACKUP]');
  await expect(preservedProject).toBeVisible();
  await expect(library.getByText('旧形式フィクスチャ', { exact: true })).toHaveCount(0);
});

test('IMP-03: compressed native backup entries are refused without changing the saved project', async ({
  page,
}) => {
  const project = nativeBox('imp03-compressed-backup');
  project.name = 'IMP-03 preserved 3D project';
  const storedBackup = await exportBackup(project, new Map());
  expect((await importBackup(storedBackup)).project).toEqual(project);

  const compressedBackup = zipSync(unzipSync(storedBackup), { level: 6 });
  const compressionMethods: number[] = [];
  unzipSync(compressedBackup, {
    filter: (file) => {
      compressionMethods.push(file.compression);
      return false;
    },
  });
  expect(compressionMethods.some((method) => method !== 0)).toBe(true);
  await expect(importBackup(compressedBackup)).rejects.toThrow(
    'This backup profile requires stored ZIP entries',
  );

  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'imp03-preserved.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(storedBackup),
  });
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await page.reload();

  const library = page.getByRole('complementary', { name: '3Dプロジェクト一覧と復元' });
  const preservedProject = library.getByText(project.name, { exact: true });
  await expect(library).toBeVisible();
  await expect(preservedProject).toBeVisible();
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'deflated-native-backup.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(compressedBackup),
  });
  const alert = page.locator('.editor3d-alert');
  await expect(alert).toContainText('編集用バックアップの形式を確認してください');
  await expect(alert).toContainText('[EDIT_STORAGE_BACKUP]');
  await expect(preservedProject).toBeVisible();
});
