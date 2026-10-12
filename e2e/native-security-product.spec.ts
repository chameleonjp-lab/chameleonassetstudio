import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';
import { assetIoFixture } from '../src/core3d/fixtures/assetIo';
import { sha256 } from '../src/core3d/export/snapshot';

function glb(json: unknown): Uint8Array {
  const text = new TextEncoder().encode(typeof json === 'string' ? json : JSON.stringify(json));
  const jsonSize = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(20 + jsonSize);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonSize, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20);
  bytes.set(text, 20);
  return bytes;
}

test('SEC-02: imported names and metadata stay inert and reserved JSON keys cannot pollute prototypes', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const projectPayload =
      '<img id="sec02-project-injected" src="/__sec02_probe__" onerror="window.__sec02Xss=true;Object.prototype.sec02Polluted=true">',
    metadataPayload =
      '<svg id="sec02-metadata-injected" onload="window.__sec02Xss=true;Object.prototype.sec02Polluted=true"></svg>',
    rightsPayload = '<svg id="sec02-rights-injected" onload="window.__sec02Xss=true"></svg>',
    project = assetIoFixture();
  project.name = projectPayload;
  project.nodes[0].name = projectPayload;

  const safeMetadata = glb({
      asset: { version: '2.0', copyright: metadataPayload },
      extensions: { VRMC_vrm: { specVersion: '1.0', meta: { title: metadataPayload } } },
    }),
    reservedKeyMetadata = glb('{"asset":{"version":"2.0"},"__proto__":{"sec02Polluted":"yes"}}'),
    safeHash = await sha256(safeMetadata),
    reservedKeyHash = await sha256(reservedKeyMetadata);
  project.blobIds = [safeHash, reservedKeyHash];
  project.sources = [
    {
      id: 'safe-metadata',
      blobId: safeHash,
      mimeType: 'model/gltf-binary',
      rights: { declared: rightsPayload, embedded: '' },
    },
    {
      id: 'reserved-key',
      blobId: reservedKeyHash,
      mimeType: 'model/gltf-binary',
      rights: { declared: 'synthetic defensive fixture', embedded: '' },
    },
  ];
  const blobs = new Map([
      [safeHash, safeMetadata],
      [reservedKeyHash, reservedKeyMetadata],
    ]),
    archive = await exportBackup(project, blobs);

  await page.addInitScript(() => {
    (window as Window & { __sec02Xss?: boolean }).__sec02Xss = false;
  });
  await page.route('**/__sec02_probe__', (route) => route.abort());
  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'sec02-inert-input.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole('heading', { name: projectPayload, exact: true })).toBeVisible();
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  const quality = page.getByRole('region', { name: '作品の品質検査', exact: true });
  await quality.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(quality.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();

  const sourceDetails = (sourceId: string) =>
    quality.locator('details').filter({ hasText: sourceId });
  const safeDetails = sourceDetails('safe-metadata');
  await safeDetails.locator('summary').click();
  await expect(safeDetails.locator('pre')).toContainText('sec02-metadata-injected');
  await expect(safeDetails.locator('pre')).toContainText('onload=');
  await expect(safeDetails.locator('pre')).toContainText('sec02-rights-injected');

  const reservedDetails = sourceDetails('reserved-key');
  await reservedDetails.locator('summary').click();
  await expect(reservedDetails.locator('pre')).toContainText('"status": "invalid"');
  await expect(reservedDetails.locator('pre')).toContainText('Unsafe source metadata JSON key');

  await expect(page.locator('img#sec02-project-injected')).toHaveCount(0);
  await expect(page.locator('svg#sec02-metadata-injected')).toHaveCount(0);
  await expect(page.locator('svg#sec02-rights-injected')).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      executed: Boolean((window as Window & { __sec02Xss?: boolean }).__sec02Xss),
      polluted: Object.prototype.hasOwnProperty.call(Object.prototype, 'sec02Polluted'),
    })),
  ).toEqual({ executed: false, polluted: false });

  const diagnostics = page.locator('footer details').filter({ hasText: '問題報告用の診断情報' });
  await diagnostics.locator('summary').click();
  await diagnostics.getByRole('button', { name: '診断情報を作成', exact: true }).click();
  const diagnosticText = await diagnostics
    .getByLabel('共有前の確認・編集', { exact: true })
    .inputValue();
  for (const privatePayload of [projectPayload, metadataPayload, rightsPayload, 'sec02Polluted'])
    expect(diagnosticText).not.toContain(privatePayload);

  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  const backupPath = await (await backupDownload).path();
  const restored = await importBackup(new Uint8Array(await readFile(backupPath!)));
  expect(restored.project.name).toBe(projectPayload);
  expect(restored.blobs.get(safeHash)).toEqual(safeMetadata);
  expect(restored.blobs.get(reservedKeyHash)).toEqual(reservedKeyMetadata);
});
