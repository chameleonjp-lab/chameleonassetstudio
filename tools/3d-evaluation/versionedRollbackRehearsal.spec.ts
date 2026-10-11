import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { assetIoPng } from '../../src/core3d/fixtures/assetIo';
import { nativeBox } from '../../src/core3d/fixtures/nativeBox';
import { exportBackup, importBackup } from '../../src/core3d/backup/backup';
import { sha256 } from '../../src/core3d/export/snapshot';
import type { StoredProject3D } from '../../src/core3d/model/project';
import {
  PREVIOUS_PROJECT_3D_DB_NAME,
  PROJECT_3D_DB_NAME,
  STORAGE_STORES,
} from '../../src/core3d/storage/db';

const oldPrefix = '/rollback-old';
const currentPrefix = '/rollback-new';
const databaseStores = STORAGE_STORES.filter((store) => store !== 'leases');

type DatabaseSnapshot = {
  version: number;
  stores: Record<string, unknown[]>;
};

function hex(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
function jsonHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function readArchive(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as { version: string };
  const project = JSON.parse(strFromU8(files['project.json'])) as Record<string, unknown>;
  return { manifest, project };
}
async function downloadCurrentBackup(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const filePath = await (await download).path();
  if (!filePath) throw new Error('Playwright did not provide the downloaded backup path.');
  return new Uint8Array(await readFile(filePath));
}
async function appBuildInfo(page: Page, url: string) {
  const response = await page.context().request.get(new URL(url, 'http://127.0.0.1:4178').href);
  if (!response.ok()) throw new Error(`Could not read build identity: ${response.status()}`);
  return response.json() as Promise<Record<string, unknown>>;
}
async function databaseSnapshot(page: Page, name: string): Promise<DatabaseSnapshot | null> {
  return page.evaluate(
    async ({ name, stores }) => {
      const factory = indexedDB as IDBFactory & {
        databases?: () => Promise<{ name?: string; version?: number }[]>;
      };
      if (!factory.databases)
        throw new Error('Chromium IndexedDB database enumeration is unavailable.');
      const known = (await factory.databases()).find((entry) => entry.name === name);
      if (!known?.version) return null;
      const request = indexedDB.open(name, known.version);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error(`Could not open ${name}`));
      });
      const storeNames = stores.filter((store) => database.objectStoreNames.contains(store)).sort();
      const transaction = database.transaction(storeNames, 'readonly');
      const completed = new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(transaction.error ?? new Error(`Read of ${name} aborted`));
        transaction.onerror = () => undefined;
      });
      const normalize = (value: unknown): unknown => {
        if (value instanceof Uint8Array)
          return { __byteType: 'Uint8Array', bytes: Array.from(value) };
        if (value instanceof ArrayBuffer)
          return { __byteType: 'ArrayBuffer', bytes: Array.from(new Uint8Array(value)) };
        if (ArrayBuffer.isView(value))
          return {
            __byteType: value.constructor.name,
            bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
          };
        if (Array.isArray(value)) return value.map(normalize);
        if (value instanceof Date) return { __date: value.toISOString() };
        if (value && typeof value === 'object')
          return Object.fromEntries(
            Object.entries(value)
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([key, entry]) => [key, normalize(entry)]),
          );
        return value;
      };
      const records = await Promise.all(
        storeNames.map(
          (storeName) =>
            new Promise<unknown[]>((resolve, reject) => {
              const get = transaction.objectStore(storeName).getAll();
              get.onsuccess = () => resolve(get.result.map(normalize));
              get.onerror = () => reject(get.error ?? new Error(`Could not read ${storeName}`));
            }),
        ),
      );
      await completed;
      const version = database.version;
      database.close();
      return {
        version,
        stores: Object.fromEntries(storeNames.map((store, index) => [store, records[index]])),
      };
    },
    { name, stores: databaseStores },
  );
}

async function createPreviousBackup() {
  const source = await assetIoPng();
  const blobId = await sha256(source);
  const { game: _game, ...previousShape } = nativeBox('rehearsal-0-2');
  void _game;
  const project = {
    ...previousShape,
    schemaVersion: '0.2.0',
    name: 'Rollback rehearsal legacy source',
    blobIds: [blobId],
    sources: [
      {
        id: 'rehearsal-source',
        blobId,
        mimeType: 'image/png',
        rights: { declared: 'fixture original', embedded: '' },
      },
    ],
  } as StoredProject3D;
  return {
    project,
    source,
    bytes: await exportBackup(project, new Map([[blobId, source]])),
    blobId,
  };
}

async function createCurrentBackup() {
  const source = await assetIoPng();
  const blobId = await sha256(source);
  const project = nativeBox('rehearsal-0-3');
  project.name = 'Rollback rehearsal current source';
  project.blobIds = [blobId];
  project.sources = [
    {
      id: 'rehearsal-source-current',
      blobId,
      mimeType: 'image/png',
      rights: { declared: 'fixture original', embedded: '' },
    },
  ];
  return {
    project,
    source,
    bytes: await exportBackup(project, new Map([[blobId, source]])),
    blobId,
  };
}

test('version-identified 0.2 to 0.3 migration preserves originals and the old app safely rejects 0.3 backups', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const oldCommit = process.env.ROLLBACK_OLD_COMMIT;
  const currentCommit = process.env.ROLLBACK_CURRENT_COMMIT;
  const oldAppVersion = process.env.ROLLBACK_OLD_APP_VERSION;
  const currentAppVersion = process.env.ROLLBACK_CURRENT_APP_VERSION;
  if (!oldCommit || !currentCommit || !oldAppVersion || !currentAppVersion)
    throw new Error('The versioned rehearsal runner must provide pinned app identities.');

  const oldIdentity = await appBuildInfo(page, `${oldPrefix}/3d/build-info.json`);
  const currentIdentity = await appBuildInfo(page, `${currentPrefix}/native-build-info.json`);
  expect(oldIdentity.revision).toBe(oldCommit);
  expect(currentIdentity.sourceRevision).toBe(currentCommit);
  expect(currentIdentity.appVersion).toBe(currentAppVersion);
  expect(currentIdentity.nativeSchemaVersion).toBe('0.3.0');

  const legacy = await createPreviousBackup();
  const legacySeed = readArchive(legacy.bytes);
  expect(legacySeed.manifest.version).toBe('0.2.0');
  expect(legacySeed.project.name).toBe(legacy.project.name);

  await page.goto(`${oldPrefix}/3d/`);
  const oldCreate = page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true });
  await expect(oldCreate).toBeEnabled();
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'rollback-rehearsal-0.2.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(legacy.bytes),
  });
  await expect(page.getByRole('heading', { name: legacy.project.name, exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }),
  ).toBeVisible();
  const oldAppBackup = await downloadCurrentBackup(page);
  const oldAppBackupInfo = readArchive(oldAppBackup);
  expect(oldAppBackupInfo.manifest.version).toBe('0.2.0');
  expect(oldAppBackupInfo.project.name).toBe(legacy.project.name);
  expect(oldAppBackupInfo.project.id).not.toBe(legacy.project.id);

  // Both app builds share one origin but use separate URL prefixes. The v2/v3
  // IndexedDB names are therefore visible to both applications without sharing
  // a profile with any real user data or touching a deployed release.
  await page.goto(`${currentPrefix}/3d/`);
  await expect(
    page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }),
  ).toBeEnabled();
  const previousBefore = await databaseSnapshot(page, PREVIOUS_PROJECT_3D_DB_NAME);
  expect(previousBefore).not.toBeNull();
  const previousBeforeHash = jsonHash(previousBefore);

  await page.getByRole('button', { name: '旧作品の一覧を読む', exact: true }).click();
  const legacyCopyButton = page.getByRole('button', {
    name: `${legacy.project.name} をコピーして編集`,
    exact: true,
  });
  await expect(legacyCopyButton).toBeVisible();
  await legacyCopyButton.click();
  await page.getByRole('button', { name: '容量増加を確認してコピーを作成', exact: true }).click();
  await expect(page.locator('.editor3d-notice')).toContainText('移行前の復元控えも保存済みです');
  await expect(page.getByRole('heading', { name: legacy.project.name, exact: true })).toBeVisible();

  const migratedBackup = await downloadCurrentBackup(page);
  const migrated = await importBackup(migratedBackup);
  expect(migrated.project.schemaVersion).toBe('0.3.0');
  expect(migrated.project.name).toBe(legacy.project.name);
  expect(migrated.project.id).not.toBe(oldAppBackupInfo.project.id);
  expect(migrated.blobs.get(legacy.blobId)).toEqual(legacy.source);

  const previousAfterMigration = await databaseSnapshot(page, PREVIOUS_PROJECT_3D_DB_NAME);
  expect(previousAfterMigration).toEqual(previousBefore);
  const currentBeforeRollback = await databaseSnapshot(page, PROJECT_3D_DB_NAME);
  expect(currentBeforeRollback).not.toBeNull();
  const currentBeforeRollbackHash = jsonHash(currentBeforeRollback);

  const retainedRecords = currentBeforeRollback?.stores.legacyBackups ?? [];
  expect(retainedRecords).toHaveLength(1);
  const retained = retainedRecords[0] as {
    bytes: { __byteType: string; bytes: number[] };
    hash: string;
  };
  expect(retained.bytes.__byteType).toBe('Uint8Array');
  const retainedArchive = new Uint8Array(retained.bytes.bytes);
  expect(hex(retainedArchive)).toBe(retained.hash);
  const retainedInfo = readArchive(retainedArchive);
  expect(retainedInfo.manifest.version).toBe('0.2.0');
  expect(retainedInfo.project).toEqual(oldAppBackupInfo.project);

  const unsupported = await createCurrentBackup();
  const unsupportedInfo = readArchive(unsupported.bytes);
  expect(unsupportedInfo.manifest.version).toBe('0.3.0');
  await page.goto(`${oldPrefix}/3d/`);
  await expect(
    page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: '一覧を更新', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(legacy.project.name) })).toBeVisible();
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'rollback-rehearsal-0.3-unsupported.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(unsupported.bytes),
  });
  const refusal = page
    .locator('.editor3d-alert')
    .filter({ hasText: 'Unsupported backup format/version' });
  await expect(refusal).toBeVisible();

  const previousAfterRefusal = await databaseSnapshot(page, PREVIOUS_PROJECT_3D_DB_NAME);
  const currentAfterRefusal = await databaseSnapshot(page, PROJECT_3D_DB_NAME);
  expect(previousAfterRefusal).toEqual(previousBefore);
  expect(currentAfterRefusal).toEqual(currentBeforeRollback);

  const screenshot = await page.screenshot({ fullPage: true });
  const screenshotPath = process.env.ROLLBACK_SCREENSHOT_PATH;
  if (screenshotPath) {
    await mkdir(dirname(screenshotPath), { recursive: true });
    await writeFile(screenshotPath, screenshot);
  }
  await testInfo.attach('old-app-safe-refusal-of-0.3-backup', {
    body: screenshot,
    contentType: 'image/png',
  });

  const evidence = {
    format: 'chameleon-versioned-rollback-rehearsal-1',
    generatedAt: new Date().toISOString(),
    appIdentities: {
      old: {
        appVersion: oldAppVersion,
        sourceRevision: oldIdentity.revision,
        projectSchema: '0.2.0',
      },
      current: {
        appVersion: currentIdentity.appVersion,
        sourceRevision: currentIdentity.sourceRevision,
        nativeSchemaVersion: currentIdentity.nativeSchemaVersion,
      },
    },
    backups: {
      oldSeed: { sha256: hex(legacy.bytes), schema: legacySeed.manifest.version },
      oldAppExport: { sha256: hex(oldAppBackup), schema: oldAppBackupInfo.manifest.version },
      currentMigratedExport: {
        sha256: hex(migratedBackup),
        schema: migrated.project.schemaVersion,
      },
      currentUnsupportedImport: {
        sha256: hex(unsupported.bytes),
        schema: unsupportedInfo.manifest.version,
      },
      retainedPreMigrationRecovery: {
        sha256: retained.hash,
        schema: retainedInfo.manifest.version,
        projectId: retainedInfo.project.id,
      },
    },
    invariants: {
      oldDatabaseContentSha256BeforeMigration: previousBeforeHash,
      oldDatabaseContentSha256AfterMigration: jsonHash(previousAfterMigration),
      oldDatabaseUnchangedDuringMigration: jsonHash(previousAfterMigration) === previousBeforeHash,
      currentDatabaseContentSha256BeforeRollback: currentBeforeRollbackHash,
      currentDatabaseContentSha256AfterOldAppRefusal: jsonHash(currentAfterRefusal),
      currentDatabaseUnchangedDuringRollback:
        jsonHash(currentAfterRefusal) === currentBeforeRollbackHash,
      refusalMessage: await refusal.innerText(),
      currentSourceBlobSha256: legacy.blobId,
    },
    scope:
      'Local browser rehearsal only; no deployed release, production data, or device lifecycle behavior is covered.',
  };
  const evidencePath = process.env.ROLLBACK_EVIDENCE_PATH;
  if (evidencePath) {
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  }
  await testInfo.attach('versioned-rollback-rehearsal-evidence', {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: 'application/json',
  });
});
