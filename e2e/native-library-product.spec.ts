import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { assetIoFixture, assetIoPng } from '../src/core3d/fixtures/assetIo';
import { exportBackup, importBackup } from '../src/core3d/backup/backup';
import { sha256 } from '../src/core3d/export/snapshot';
import { identityTransform } from '../src/core3d/model/project';

async function createOriginal(page: Page, hierarchy = false) {
  const project = assetIoFixture(),
    bytes = await assetIoPng(),
    hash = await sha256(bytes);
  project.name = 'Library original';
  project.blobIds = [hash];
  project.sources = [
    {
      id: 'original-image',
      blobId: hash,
      mimeType: 'image/png',
      rights: { declared: 'fixture original', embedded: '' },
    },
  ];
  if (hierarchy) {
    for (const node of project.nodes) if (node.parentId === null) node.parentId = 'whole';
    project.nodes.push({
      id: 'whole',
      name: 'Whole hierarchy',
      parentId: null,
      transform: identityTransform(),
    });
    project.materials[0].textureBlobId = hash;
  }
  const backup = await exportBackup(project, new Map([[hash, bytes]]));
  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'original.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(backup),
  });
  await expect(page.getByRole('heading', { name: 'Library original', exact: true })).toBeVisible();
  return { bytes, hash };
}
async function backupCurrent(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '現在の内容をバックアップ', exact: true }).click();
  return importBackup(new Uint8Array(await readFile((await (await pending).path())!)));
}

test('closed-project trash requires confirmation, preserves original bytes and restores the same identity', async ({
  page,
}, info) => {
  const { bytes, hash } = await createOriginal(page);
  const original = await backupCurrent(page);
  const library = page.getByRole('region', { name: '3D保存履歴とごみ箱' });
  await library.getByRole('button', { name: '保存履歴とごみ箱を読む', exact: true }).click();
  await expect(
    library.getByRole('button', { name: 'ごみ箱移動を確認: Library original', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'プロジェクトを閉じる', exact: true }).click();
  await library
    .getByRole('button', { name: 'ごみ箱移動を確認: Library original', exact: true })
    .click();
  await expect(library.getByText('自動消去の期限はありません。', { exact: false })).toBeVisible();
  await library.getByRole('button', { name: 'この操作を取り消す', exact: true }).click();
  await expect(
    library.getByRole('button', { name: '確認した1作品をごみ箱へ移動', exact: true }),
  ).toHaveCount(0);
  await library
    .getByRole('button', { name: 'ごみ箱移動を確認: Library original', exact: true })
    .click();
  await library.getByRole('button', { name: '確認した1作品をごみ箱へ移動', exact: true }).click();
  await expect(
    library.getByRole('button', { name: 'ごみ箱復元を確認: Library original', exact: true }),
  ).toBeVisible();
  await library
    .getByRole('button', { name: 'ごみ箱復元を確認: Library original', exact: true })
    .click();
  await library.getByRole('button', { name: '確認した1作品をごみ箱から戻す', exact: true }).click();
  await page.getByRole('button', { name: /Library original revision/ }).click();
  const restored = await backupCurrent(page);
  expect(restored.project).toEqual(original.project);
  expect(restored.blobs.get(hash)).toEqual(bytes);
  await info.attach('library-restored', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('recovery comparison opens an earlier saved version as a new copy while preserving the normal latest version', async ({
  page,
}, info) => {
  const { bytes, hash } = await createOriginal(page);
  const original = await backupCurrent(page);
  await page.getByLabel('プロジェクト名', { exact: true }).fill('Library latest');
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  const latest = await backupCurrent(page);
  expect(latest.project.id).toBe(original.project.id);
  const library = page.getByRole('region', { name: '3D保存履歴とごみ箱' });
  await library.getByRole('button', { name: '保存履歴とごみ箱を読む', exact: true }).click();
  await library
    .getByRole('button', { name: '復旧候補を読む: Library latest', exact: true })
    .click();
  await expect(library.getByText('内容hashに差あり', { exact: false })).toBeVisible();
  await library
    .getByRole('button', { name: 'revision 0 の別コピー復旧を確認', exact: true })
    .click();
  await library.getByRole('button', { name: '確認した版を別コピーで復旧', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Library original', exact: true })).toBeVisible();
  const recovered = await backupCurrent(page);
  expect(recovered.project.id).not.toBe(original.project.id);
  expect({ ...recovered.project, id: original.project.id }).toEqual(original.project);
  expect(recovered.blobs.get(hash)).toEqual(bytes);
  await page.getByRole('button', { name: /Library latest revision/ }).click();
  expect((await backupCurrent(page)).project).toEqual(latest.project);
  await info.attach('library-recovery-comparison', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('object deletion confirms dependencies, supports cancel and Undo/Redo, and preserves image originals', async ({
  page,
}, info) => {
  const { bytes, hash } = await createOriginal(page);
  const original = await backupCurrent(page);
  const form = page.getByRole('region', { name: '3D制作', exact: true });
  const node = original.project.nodes.find((entry) => entry.meshId)!;
  await form.getByRole('combobox', { name: '制作オブジェクト', exact: true }).selectOption(node.id);
  await form.getByText('選択した部品の削除', { exact: true }).click();
  await form.getByRole('button', { name: '部品の削除内容を確認', exact: true }).click();
  await expect(form.getByRole('region', { name: '部品削除の確認', exact: true })).toContainText(
    '画像・GLB原本は保持',
  );
  await form.getByRole('button', { name: '部品の削除を取り消す', exact: true }).click();
  expect((await backupCurrent(page)).project).toEqual(original.project);
  await form.getByRole('button', { name: '部品の削除内容を確認', exact: true }).click();
  await form.getByRole('button', { name: '確認した部品と依存情報を削除', exact: true }).click();
  const deleted = await backupCurrent(page);
  expect(deleted.project.nodes.some((entry) => entry.id === node.id)).toBe(false);
  expect(deleted.project.blobIds).toEqual(original.project.blobIds);
  expect(deleted.blobs.get(hash)).toEqual(bytes);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(
    form.getByText('このrevisionで部品削除を適用しました。元に戻す操作で復元できます。', {
      exact: true,
    }),
  ).toHaveCount(0);
  const undo = await backupCurrent(page);
  expect({ ...undo.project, revision: original.project.revision }).toEqual(original.project);
  expect(undo.blobs.get(hash)).toEqual(bytes);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  const redo = await backupCurrent(page);
  expect({ ...redo.project, revision: deleted.project.revision }).toEqual(deleted.project);
  expect(redo.blobs.get(hash)).toEqual(bytes);
  await info.attach('object-deletion-redo', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('hierarchy clone confirms dependencies, invalidates stale selection and preserves source bytes across Undo/Redo and copy restore', async ({
  page,
  context,
}, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { bytes, hash } = await createOriginal(page, true);
  const original = await backupCurrent(page);
  const form = page.getByRole('region', { name: '3D制作', exact: true });
  const selection = form.getByRole('combobox', { name: '制作オブジェクト', exact: true });
  await selection.selectOption('whole');
  await form.getByText('階層と依存情報を複製', { exact: true }).click();
  const prepare = form.getByRole('button', { name: '部品と階層の複製内容を確認', exact: true });
  const confirm = form.getByRole('button', { name: '確認した階層と依存情報を複製', exact: true });
  await prepare.click();
  const preview = form.getByRole('region', { name: '階層複製の確認', exact: true });
  await expect(preview).toContainText('部品 4');
  await expect(preview).toContainText('skin 1');
  await expect(preview).toContainText('既存clip 1');
  await expect(preview).toContainText('anchor 1、collider 1');
  await expect(preview).toContainText('画像・GLB原本と権利情報は保持');
  await form.getByRole('button', { name: '階層の複製を取り消す', exact: true }).click();
  await expect(prepare).toBeFocused();
  expect((await backupCurrent(page)).project).toEqual(original.project);
  await prepare.click();
  await form.getByText('階層と依存情報を複製', { exact: true }).click();
  await form.getByText('階層と依存情報を複製', { exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await prepare.click();
  await selection.selectOption('tip');
  await expect(confirm).toHaveCount(0);
  await selection.selectOption('whole');
  await prepare.click();
  await confirm.focus();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(prepare).toBeFocused();
  await prepare.click();
  await confirm.click();
  const cloned = await backupCurrent(page);
  const copiedRoot = await selection.inputValue();
  expect(copiedRoot).not.toBe('whole');
  expect(cloned.project.nodes).toHaveLength(8);
  expect(cloned.project.meshes).toHaveLength(2);
  expect(cloned.project.skins).toHaveLength(2);
  expect(cloned.project.materials).toHaveLength(2);
  expect(cloned.project.nodes.slice(0, 4)).toEqual(original.project.nodes);
  expect(cloned.project.meshes[0]).toEqual(original.project.meshes[0]);
  expect(cloned.project.skins[0]).toEqual(original.project.skins[0]);
  expect(cloned.project.clips[0].tracks).toHaveLength(2);
  expect(cloned.project.clips[0].tracks[0]).toEqual(original.project.clips[0].tracks[0]);
  expect(cloned.project.clips[1]).toEqual(original.project.clips[1]);
  expect(cloned.project.game.anchors).toHaveLength(2);
  expect(cloned.project.game.colliders).toHaveLength(2);
  expect(cloned.project.sources).toEqual(original.project.sources);
  expect(cloned.project.blobIds).toEqual(original.project.blobIds);
  expect(cloned.blobs.get(hash)).toEqual(bytes);
  expect(
    cloned.project.skins[1].joints.every(
      (joint) => !original.project.nodes.some((node) => node.id === joint.nodeId),
    ),
  ).toBe(true);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(
    form.getByText('このrevisionで階層を複製しました。元に戻す操作で複製を取り消せます。', {
      exact: true,
    }),
  ).toHaveCount(0);
  const undone = await backupCurrent(page);
  expect({ ...undone.project, revision: original.project.revision }).toEqual(original.project);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  const redone = await backupCurrent(page);
  expect({ ...redone.project, revision: cloned.project.revision }).toEqual(cloned.project);
  const backup = await exportBackup(redone.project, redone.blobs);
  const restoredPage = await context.newPage();
  await restoredPage.goto('/3d/');
  await restoredPage.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'cloned.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(backup),
  });
  await expect(
    restoredPage.getByRole('heading', { name: 'Library original', exact: true }),
  ).toBeVisible();
  const restored = await backupCurrent(restoredPage);
  expect(restored.project.id).not.toBe(redone.project.id);
  expect(restored.project.revision).toBe(0);
  expect({ ...restored.project, id: redone.project.id, revision: redone.project.revision }).toEqual(
    redone.project,
  );
  expect(restored.blobs.get(hash)).toEqual(bytes);
  await info.attach('hierarchy-clone-restored', {
    body: await restoredPage.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await restoredPage.close();
});

test('hierarchy clone refuses a skinned part without its joints and preserves the complete project', async ({
  page,
}) => {
  await createOriginal(page);
  const original = await backupCurrent(page);
  const form = page.getByRole('region', { name: '3D制作', exact: true });
  await form
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .selectOption(original.project.nodes.find((node) => node.meshId)!.id);
  await form.getByText('階層と依存情報を複製', { exact: true }).click();
  await form.getByRole('button', { name: '部品と階層の複製内容を確認', exact: true }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await expect(
    form.getByRole('button', { name: '確認した階層と依存情報を複製', exact: true }),
  ).toHaveCount(0);
  expect((await backupCurrent(page)).project).toEqual(original.project);
});

async function createThumbnail(page: Page) {
  const open = page.getByRole('button', { name: '3D表示を開く', exact: true });
  const active = page.getByText('3D表示中', { exact: true });
  // Restore can expose the editor heading before its busy state clears.
  await expect.poll(async () => (await open.isEnabled()) || (await active.isVisible())).toBe(true);
  if (await open.isEnabled()) await open.click();
  await expect(active).toBeVisible();
  const button = page.getByRole('button', { name: '保存してサムネイルを作成', exact: true });
  await button.click();
  await expect(
    page.getByRole('status').filter({ hasText: '派生サムネイルを作成しました' }),
  ).toBeVisible();
}
async function thumbnailPanel(page: Page) {
  const panel = page
    .locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: /^サムネイルと派生cache$/ }) });
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: '派生サムネイルの一覧を読む', exact: true }).click();
  return panel;
}
test('derived thumbnails survive reopening and explicit cache cleanup preserves canonical sources and backups', async ({
  page,
}) => {
  const { bytes, hash } = await createOriginal(page);
  const before = await backupCurrent(page);
  await createThumbnail(page);
  const panel = await thumbnailPanel(page);
  const image = panel.getByRole('img', { name: /Library original.*保存済みrest表示/ });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(
    await image.evaluate((element) =>
      Math.max(
        (element as HTMLImageElement).naturalWidth,
        (element as HTMLImageElement).naturalHeight,
      ),
    ),
  ).toBeLessThanOrEqual(192);
  await expect(
    panel.getByRole('button', { name: '確認した派生cacheを整理', exact: true }),
  ).toBeDisabled();
  await panel.locator('summary').press('Escape');
  await expect(panel.getByRole('img')).toHaveCount(0);
  await expect(panel.locator('summary')).toBeFocused();
  await panel.locator('summary').click();
  await panel.getByRole('button', { name: '派生サムネイルの一覧を読む', exact: true }).click();
  await expect(image).toBeVisible();
  await panel
    .getByLabel('件数と再作成方法を確認し、派生cacheだけを整理する', { exact: true })
    .check();
  await panel.getByRole('button', { name: '確認した派生cacheを整理', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('派生サムネイルだけを整理しました');
  await panel.getByRole('button', { name: '派生サムネイルの一覧を読む', exact: true }).click();
  await expect(panel.getByRole('img')).toHaveCount(0);
  await expect(panel.getByText(/0件 · 0 bytes/)).toBeVisible();
  const after = await backupCurrent(page);
  expect(after.project).toEqual(before.project);
  expect(after.blobs.get(hash)).toEqual(bytes);
});

test('a replacement thumbnail invalidates old cache cleanup confirmation and retains originals', async ({
  page,
}) => {
  await createOriginal(page);
  await createThumbnail(page);
  const panel = await thumbnailPanel(page);
  await expect(panel.getByRole('img')).toBeVisible();
  await panel
    .getByLabel('件数と再作成方法を確認し、派生cacheだけを整理する', { exact: true })
    .check();
  await createThumbnail(page);
  await expect(panel.getByRole('status')).toContainText('一覧を読み直してください');
  await expect(
    panel.getByRole('button', { name: '確認した派生cacheを整理', exact: true }),
  ).toBeDisabled();
  await panel.getByRole('button', { name: '派生サムネイルの一覧を読む', exact: true }).click();
  await expect(panel.getByRole('img')).toBeVisible();
});

test('failed project save refuses thumbnail creation without discarding unsaved edits', async ({
  page,
}) => {
  await createOriginal(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction.db.name === 'chameleon-asset-studio-3d-v3')
        throw new DOMException('fixture quota', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  const before = await backupCurrent(page);
  await page.getByRole('button', { name: '保存してサムネイルを作成', exact: true }).click();
  await expect(
    page.getByText('操作を完了できませんでした。現在の編集内容はこのタブに保持しています。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.native-viewport-reason').first()).toContainText(
    '保存領域を利用できないか、容量が不足しています。',
  );
  await expect(page.locator('.native-viewport-panel')).not.toContainText('fixture quota');
  const panel = await thumbnailPanel(page);
  await expect(panel.getByText(/0件 · 0 bytes/)).toBeVisible();
  expect((await backupCurrent(page)).project).toEqual(before.project);
});

test('closing confirmed cleanup during hash verification preserves the observed thumbnail', async ({
  page,
}) => {
  await createOriginal(page);
  await createThumbnail(page);
  const panel = await thumbnailPanel(page);
  await expect(panel.getByRole('img')).toBeVisible();
  await panel
    .getByLabel('件数と再作成方法を確認し、派生cacheだけを整理する', { exact: true })
    .check();
  await page.evaluate(() => {
    const host = window as Window & {
      finishThumbnailHash?: () => void;
      thumbnailHashPending?: boolean;
    };
    const original = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args: Parameters<SubtleCrypto['digest']>) => {
      const result = await original(...args);
      host.thumbnailHashPending = true;
      return new Promise<ArrayBuffer>((resolve) => {
        host.finishThumbnailHash = () => {
          host.thumbnailHashPending = false;
          resolve(result);
        };
      });
    };
  });
  await panel.getByRole('button', { name: '確認した派生cacheを整理', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { thumbnailHashPending?: boolean }).thumbnailHashPending,
      ),
    )
    .toBe(true);
  await panel.getByRole('button', { name: 'cache操作を閉じる', exact: true }).click();
  await page.evaluate(() =>
    (window as Window & { finishThumbnailHash?: () => void }).finishThumbnailHash?.(),
  );
  // Reload restores the original digest implementation; the cache must still contain the record.
  await page.reload();
  const reopened = await thumbnailPanel(page);
  await expect(reopened.getByRole('img')).toBeVisible();
  await expect(reopened.getByText(/1件 ·/)).toBeVisible();
});

test('cache connection failures redact private details and preserve original projects and sources', async ({
  page,
}) => {
  await createOriginal(page);
  const before = await backupCurrent(page);
  await page.evaluate(() => {
    const open = IDBFactory.prototype.open;
    let failOnce = true;
    IDBFactory.prototype.open = function (...args) {
      if (failOnce && args[0] === 'chameleon-asset-studio-3d-derived-thumbnails') {
        failOnce = false;
        throw new Error('PRIVATE-CACHE file:///private/user/source.glb');
      }
      return open.apply(this, args);
    };
  });
  const panel = await thumbnailPanel(page);
  await expect(panel.getByRole('alert')).toContainText('[EDIT_UNKNOWN]');
  await expect(panel.getByRole('alert')).toContainText('原因を特定できず');
  await expect(panel.getByRole('alert')).not.toContainText('PRIVATE-CACHE');
  await expect(panel.getByRole('alert')).not.toContainText('/private/');
  const after = await backupCurrent(page);
  expect(after.project).toEqual(before.project);
  expect([...after.blobs]).toEqual([...before.blobs]);
  await panel.getByRole('button', { name: '派生サムネイルの一覧を読む', exact: true }).click();
  await expect(panel.getByText(/0件 · 0 bytes/)).toBeVisible();
  expect((await backupCurrent(page)).project).toEqual(before.project);
});
