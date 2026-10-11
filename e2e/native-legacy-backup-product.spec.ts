import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
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
