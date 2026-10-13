import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';
import { assetIoFixture, assetIoPng } from '../src/core3d/fixtures/assetIo';
import { sha256 } from '../src/core3d/export/snapshot';
import { test, expect, type Page, type Route } from '@playwright/test';
type InterceptedWorkerWindow = Window & {
  __nativeQualityWorker?: typeof Worker;
  __heldQualityResult?: () => void;
};
async function setup(page: Page) {
  await page.goto(
    new URL('/3d/', String(test.info().project.use.baseURL ?? 'http://localhost:5173')).href,
  );
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Quality');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  return page.getByRole('region', { name: '作品の品質検査', exact: true });
}

async function backupCurrent(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  return importBackup(new Uint8Array(await readFile((await (await download).path())!)));
}

function glbWithMetadata(json: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const bytes = new Uint8Array(20 + jsonLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20);
  bytes.set(encoded, 20);
  return bytes;
}

test('SEC-06: embedded VRM restrictions stay separate from declarations through inspection and package provenance', async ({
  page,
}) => {
  const project = assetIoFixture();
  project.name = 'SEC-06 rights review fixture';
  const sourceBytes = glbWithMetadata({
      asset: { version: '2.0', copyright: 'Synthetic source author' },
      extensions: {
        VRMC_vrm: {
          specVersion: '1.0',
          meta: {
            licenseName: 'CC BY-NC-ND 4.0',
            commercialUsage: 'personalNonProfit',
            allowRedistribution: false,
          },
        },
      },
    }),
    sourceHash = await sha256(sourceBytes);
  const declaredRights = 'Commercial use and redistribution permitted by user declaration.';
  const storedEmbeddedRights = 'Original embedded attribution note';
  project.blobIds = [sourceHash];
  project.sources = [
    {
      id: 'vrm-restricted-source',
      blobId: sourceHash,
      mimeType: 'model/gltf-binary',
      rights: { declared: declaredRights, embedded: storedEmbeddedRights },
    },
  ];
  const archive = await exportBackup(project, new Map([[sourceHash, sourceBytes]]));

  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'sec06-rights-review.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  const panel = page.getByRole('region', { name: '作品の品質検査', exact: true });
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  await expect(
    panel.getByText('警告: 原本の利用条件を確認してください。', { exact: true }),
  ).toBeVisible();

  const sourceDetails = panel.locator('details').filter({ hasText: 'vrm-restricted-source' });
  await sourceDetails.locator('summary').click();
  const sourceProfile = sourceDetails.locator('pre');
  await expect(sourceProfile).toContainText(declaredRights);
  await expect(sourceProfile).toContainText(storedEmbeddedRights);
  await expect(sourceProfile).toContainText('extensions.VRMC_vrm.meta.commercialUsage');
  await expect(sourceProfile).toContainText('personalNonProfit');
  await expect(sourceProfile).toContainText('extensions.VRMC_vrm.meta.allowRedistribution');
  await expect(sourceProfile).toContainText('false');

  const afterInspection = await backupCurrent(page);
  expect(afterInspection.project.sources).toEqual(project.sources);
  expect(afterInspection.blobs.get(sourceHash)).toEqual(sourceBytes);

  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  const assetIo = page.getByRole('region', { name: '3D GLB入出力', exact: true });
  await assetIo
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
  await assetIo.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await expect(assetIo.getByRole('button', { name: 'ZIPを保存', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await assetIo.getByRole('button', { name: 'ZIPを保存', exact: true }).click();
  const packageFiles = unzipSync(new Uint8Array(await readFile((await (await download).path())!))),
    sidecar = JSON.parse(new TextDecoder().decode(packageFiles['game.json']));
  expect(sidecar.provenance.claims).toBe('user-declared-not-verified');
  expect(sidecar.provenance.sources).toEqual(project.sources);
  expect(sidecar.provenance.sources[0]).toMatchObject({
    blobId: sourceHash,
    rights: { declared: declaredRights, embedded: storedEmbeddedRights },
  });
});

test('inspects a fixed revision, distinguishes unknown values and invalidates stale results', async ({
  page,
}) => {
  const panel = await setup(page);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  await expect(panel.getByText('gpuMemoryBytes', { exact: true })).toBeVisible();
  await expect(panel.getByText(/この作品の他エンジン実行: 未検証/)).toBeVisible();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(panel.getByText(/作品が変更されています/)).toBeVisible();
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText(/作品が変更されています/)).toHaveCount(0);
  await test.info().attach('native-visual-quality-statistics', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});
test('QA-01 product statistics distinguish shared geometry, instances and unknown measurements', async ({
  page,
}) => {
  const project = assetIoFixture();
  project.name = 'QA-01 statistics fixture';
  const sourceNode = project.nodes[0];
  sourceNode.transform = { ...sourceNode.transform, translation: [0, 0, 0] };
  project.nodes.push({
    ...sourceNode,
    id: 'box-instance',
    name: 'Second box instance',
    transform: { ...sourceNode.transform, translation: [2, 0, 0] },
  });
  const pixels = await assetIoPng(),
    textureId = await sha256(pixels);
  project.blobIds = [textureId];
  project.materials[0].textureBlobId = textureId;
  const archive = await exportBackup(project, new Map([[textureId, pixels]]));

  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'qa01-statistics.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  const restored = await backupCurrent(page);
  const meshId = restored.project.meshes[0]?.id;
  expect(restored.project.meshes).toHaveLength(1);
  expect(restored.project.meshes[0].vertices).toHaveLength(8);
  expect(restored.project.meshes[0].faces).toHaveLength(12);
  expect(restored.project.nodes.filter((node) => node.meshId === meshId)).toHaveLength(2);
  expect(restored.blobs.get(textureId)).toEqual(pixels);

  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  const panel = page.getByRole('region', { name: '作品の品質検査', exact: true });
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  const valueOf = (name: string) =>
    panel.getByText(name, { exact: true }).locator('xpath=following-sibling::dd[1]');

  await expect(valueOf('vertices')).toHaveText('8');
  await expect(valueOf('triangleFaces')).toHaveText('12');
  await expect(valueOf('materialGroups')).toHaveText('1');
  await expect(valueOf('meshInstances')).toHaveText('2');
  await expect(valueOf('instanceTriangleFaces')).toHaveText('24');
  await expect(valueOf('materials')).toHaveText('1');
  await expect(valueOf('textures')).toHaveText('1');
  await expect(valueOf('joints')).toHaveText('2');
  await expect(valueOf('clips')).toHaveText('2');
  await expect(valueOf('nonemptyClips')).toHaveText('1');
  await expect(valueOf('decodedPixels')).toHaveText('4');
  await expect(valueOf('retainedBlobBytes')).toHaveText(String(pixels.byteLength));
  await expect(valueOf('projectJsonBytes')).toHaveText(
    String(new TextEncoder().encode(JSON.stringify(restored.project)).byteLength),
  );
  await expect(valueOf('exportedGlbBytes')).toHaveText(
    '未確認: No measured GLB output for this snapshot',
  );
  await expect(valueOf('gpuMemoryBytes')).toHaveText('未確認: GPU memory has not been measured');
  await expect(
    panel.getByText(/画素数は画像ヘッダー由来で、デコード成功を保証しません。/),
  ).toBeVisible();
  await expect(valueOf('bounds')).toHaveText(
    '{"min":[-0.5,-0.5,-0.5],"max":[2.5,0.5,0.5],"size":[3,1,1]}',
  );
});
test('closing inspection terminates the held worker and rejects late results', async ({ page }) => {
  const panel = await setup(page);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    seen = new Promise<void>((r) => (started = r));
  const handler = async (route: Route) => {
    started();
    await gate;
    await route.continue().catch(() => undefined);
  };
  await page.route(/assetIo\.worker/, handler);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await seen;
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  release();
  await page.unroute(/assetIo\.worker/, handler);
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  await expect(panel.getByText('検査版:', { exact: false })).toHaveCount(0);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
});
test('backgrounding cancels inspection and suppresses a late worker result', async ({ page }) => {
  const panel = await setup(page);
  await page.evaluate(() => {
    const state = window as InterceptedWorkerWindow;
    const NativeWorker = window.Worker;
    state.__nativeQualityWorker = NativeWorker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler: Worker['onmessage']) {
        if (!handler) {
          super.onmessage = null;
          return;
        }
        super.onmessage = (event) => {
          if (event.data?.kind === 'result' && !state.__heldQualityResult) {
            state.__heldQualityResult = () => handler.call(this, event);
            return;
          }
          handler.call(this, event);
        };
      }
      get onmessage() {
        return super.onmessage;
      }
    };
  });
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await page.waitForFunction(
    () => typeof (window as InterceptedWorkerWindow).__heldQualityResult === 'function',
  );
  await expect(panel.getByRole('status')).toHaveText('検査中…');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(panel.getByRole('status')).toHaveText('背景に移ったため検査を中止しました。');
  await page.evaluate(() => {
    const state = window as InterceptedWorkerWindow;
    state.__heldQualityResult?.();
    delete state.__heldQualityResult;
  });
  await expect(panel.getByText('検査版:', { exact: false })).toHaveCount(0);
  await expect(panel.getByRole('status')).toHaveText('背景に移ったため検査を中止しました。');
  await page.evaluate(() => {
    const state = window as InterceptedWorkerWindow;
    if (state.__nativeQualityWorker) window.Worker = state.__nativeQualityWorker;
    delete state.__nativeQualityWorker;
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
});
test('phone quality controls remain usable and do not mark fixtures as current-asset verification', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    const panel = await setup(page);
    await panel.getByRole('button', { name: '現在の版を検査', exact: true }).tap();
    await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
    for (const button of await panel.getByRole('button').all()) {
      const box = await button.boundingBox();
      if (box) expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await test.info().attach('native-visual-quality-phone', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  } finally {
    await context.close();
  }
});

test('a warning opens the correct material section, preserves drafts and survives package export', async ({
  page,
}) => {
  const panel = await setup(page);
  await page.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await page.getByLabel(/^制作材質/).selectOption({ index: 1 });
  await page.getByRole('button', { name: '材質の現在値を読む', exact: true }).click();
  await page.getByLabel(/^透過モード/).selectOption('LEGACY_AUTO');
  await page.getByRole('button', { name: '材質を適用', exact: true }).click();
  const beforeInspection = await backupCurrent(page);
  const legacyMaterialId = beforeInspection.project.materials.find(
    (material) => material.alphaMode === 'LEGACY_AUTO',
  )?.id;
  expect(legacyMaterialId).toBeDefined();
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  await expect(panel.getByText('警告: 互換用の自動透過設定です。', { exact: true })).toBeVisible();
  await expect(
    panel.getByText('GLBは明示的な透過方式へ変換します。', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText('不透明・切抜き・半透明を確認してください。', { exact: true }),
  ).toBeVisible();
  const afterInspection = await backupCurrent(page);
  expect(afterInspection.project).toEqual(beforeInspection.project);
  expect([...afterInspection.blobs]).toEqual([...beforeInspection.blobs]);
  await page.getByLabel('粗さ roughness', { exact: true }).fill('0.123');
  await page.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await panel.getByRole('button', { name: '編集先を確認', exact: true }).first().click();
  await expect(page.getByLabel('粗さ roughness', { exact: true })).toBeVisible();
  await expect(page.getByLabel('粗さ roughness', { exact: true })).toHaveValue('0.123');
  await expect(page.getByText('材質の色・金属・粗さ', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: '編集先を確認', exact: true }).first(),
  ).toBeDisabled();
  const currentRevision = (await backupCurrent(page)).project.revision;
  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  const assetIo = page.getByRole('region', { name: '3D GLB入出力', exact: true });
  await assetIo
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
  await assetIo.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await expect(assetIo.getByRole('button', { name: 'ZIPを保存', exact: true })).toBeVisible();
  const importantWarning = `Legacy alpha resolved for material ${legacyMaterialId}`;
  await expect(assetIo.getByText(importantWarning, { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await assetIo.getByRole('button', { name: 'ZIPを保存', exact: true }).click();
  const archive = unzipSync(new Uint8Array(await readFile((await (await download).path())!)));
  const manifest = JSON.parse(new TextDecoder().decode(archive['manifest.json']));
  expect(manifest.revision).toBe(currentRevision);
  expect(manifest.warnings).toContain(importantWarning);
});

test('inspection worker startup failure gives safe guidance and leaves the project recoverable', async ({
  page,
}) => {
  const project = assetIoFixture();
  project.name = 'Inspection source preservation';
  const sourceBytes = await assetIoPng(),
    sourceHash = await sha256(sourceBytes);
  project.blobIds = [sourceHash];
  project.materials[0].textureBlobId = sourceHash;
  project.sources = [
    {
      id: 'inspection-original',
      blobId: sourceHash,
      mimeType: 'image/png',
      rights: { declared: 'original fixture', embedded: '' },
    },
  ];
  const archive = await exportBackup(project, new Map([[sourceHash, sourceBytes]]));
  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'inspection-source.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
  await page.getByText('作品の品質検査を開く', { exact: true }).click();
  const panel = page.getByRole('region', { name: '作品の品質検査', exact: true });
  const before = await backupCurrent(page);
  expect(before.blobs.size).toBe(1);
  expect(before.blobs.get(sourceHash)).toEqual(sourceBytes);
  expect(await sha256(before.blobs.get(sourceHash)!)).toBe(sourceHash);
  await page.evaluate(() => {
    const NativeWorker = window.Worker;
    let failOnce = true;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (failOnce && String(url).includes('assetIo.worker')) {
          failOnce = false;
          throw new Error('PRIVATE-WORKER file:///private/user/model.glb');
        }
        super(url, options);
      }
    };
  });
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('[EDIT_QUALITY_WORKER]');
  await expect(panel.getByRole('status')).toContainText(
    '品質検査の処理または応答を確認できませんでした。',
  );
  await expect(panel.getByRole('status')).toContainText('保存・バックアップ');
  await expect(panel.getByRole('status')).not.toContainText('PRIVATE-WORKER');
  await expect(panel.getByRole('status')).not.toContainText('/private/');
  await expect(panel.getByText('検査版:', { exact: false })).toHaveCount(0);
  const after = await backupCurrent(page);
  expect(after.project).toEqual(before.project);
  expect([...after.blobs]).toEqual([...before.blobs]);
  expect(after.blobs.get(sourceHash)).toEqual(sourceBytes);
  await panel.getByRole('button', { name: '現在の版を検査', exact: true }).click();
  await expect(panel.getByText('検査結果を取得しました。', { exact: true })).toBeVisible();
  expect((await backupCurrent(page)).project).toEqual(before.project);
});
