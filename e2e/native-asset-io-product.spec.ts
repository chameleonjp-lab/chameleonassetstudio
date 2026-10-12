import { test, expect, type Page, type Route } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { unzipSync } from 'fflate';
import { importBackup } from '../src/core3d/backup/backup';
import { preflightGlb } from '../src/core3d/import/preflight';
import { assetIoFixture, assetIoPng } from '../src/core3d/fixtures/assetIo';
import { captureAssetSnapshot, sha256 } from '../src/core3d/export/snapshot';
import { exportGlb, encodeGlb } from '../src/adapters3d/gltf/export';
import { importGlb } from '../src/adapters3d/gltf/import';
import { buildAssetPackage } from '../src/core3d/export/mapping';
import { NATIVE_TEXTURE_PROFILE } from '../src/core3d/model/textureProfile';
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
async function tabTo(page: Page, target: ReturnType<Page['getByRole']>) {
  await expect(target).toBeVisible();
  if (await target.evaluate((element) => element === document.activeElement)) return;
  for (let attempt = 0; attempt < 128; attempt++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Tab navigation did not reach the requested control.');
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
function headerOnlyPng(width: number, height: number, colorType: 2 | 6 = 6): Uint8Array {
  const chunk = (type: string, data = new Uint8Array()) => {
    const output = new Uint8Array(data.length + 12);
    new DataView(output.buffer).setUint32(0, data.length);
    output.set(new TextEncoder().encode(type), 4);
    output.set(data, 8);
    return output;
  };
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = colorType;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT'),
    chunk('IEND'),
  ];
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}
function glbWithTextureHeaders(
  source: Uint8Array,
  images: { width: number; height: number; colorType?: 2 | 6 }[],
): Uint8Array {
  const parsed = preflightGlb(source);
  const json = structuredClone(parsed.json);
  const binaryParts = [parsed.binary];
  let binaryLength = parsed.binary.length;
  json.images = [];
  json.textures = [];
  json.samplers = [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }];
  if (!json.bufferViews || !json.buffers?.[0] || !json.materials?.[0] || !json.meshes?.[0])
    throw new Error('Texture budget fixture requires a complete GLB');
  const baseMaterial = structuredClone(json.materials[0]);
  const basePrimitive = structuredClone(json.meshes[0].primitives[0]);
  for (const [index, definition] of images.entries()) {
    const padding = (4 - (binaryLength % 4)) % 4;
    if (padding) {
      binaryParts.push(new Uint8Array(padding));
      binaryLength += padding;
    }
    const image = headerOnlyPng(definition.width, definition.height, definition.colorType);
    const bufferView = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: binaryLength, byteLength: image.length });
    json.images.push({ bufferView, mimeType: 'image/png' });
    json.textures.push({ source: index, sampler: 0 });
    binaryParts.push(image);
    binaryLength += image.length;
  }
  json.buffers[0].byteLength = binaryLength;
  json.materials[0] = {
    ...baseMaterial,
    pbrMetallicRoughness: {
      ...baseMaterial.pbrMetallicRoughness,
      baseColorTexture: { index: 0 },
    },
  };
  if (images.length > 1) {
    json.materials.push({
      ...baseMaterial,
      name: 'Aggregate pixel budget fixture',
      extras: { ...baseMaterial.extras, casId: 'imp04-pixel-budget-material' },
      pbrMetallicRoughness: {
        ...baseMaterial.pbrMetallicRoughness,
        baseColorTexture: { index: 1 },
      },
    });
    json.meshes[0].primitives.push({ ...basePrimitive, material: 1 });
  }
  const binary = new Uint8Array(binaryLength);
  let offset = 0;
  for (const part of binaryParts) {
    binary.set(part, offset);
    offset += part.length;
  }
  return encodeGlb(json, binary);
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
  await panel
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
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
test('keyboard-only Tab flow exports and saves a GLB package', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/3d/');

  const projectName = page.getByLabel('新しいプロジェクト名', { exact: true });
  await tabTo(page, projectName);
  await page.keyboard.type('Keyboard export');
  const create = page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true });
  await page.keyboard.press('Tab');
  await expect(create).toBeFocused();
  await page.keyboard.press('Enter');

  const addBox = page.getByRole('button', { name: '箱を追加', exact: true });
  await tabTo(page, addBox);
  await page.keyboard.press('Enter');
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();

  const openDetails = page.getByText('GLB読込・配布ファイル出力', { exact: true });
  await tabTo(page, openDetails);
  await page.keyboard.press('Enter');
  const panel = io(page);
  await expect(panel).toBeVisible();

  const acknowledgement = panel.getByLabel(
    '固定revisionの出力範囲と変換・損失の注意を確認しました',
    { exact: true },
  );
  await expect(acknowledgement).toBeEnabled();
  await tabTo(page, acknowledgement);
  await page.keyboard.press('Space');
  await expect(acknowledgement).toBeChecked();
  const createPackage = panel.getByRole('button', {
    name: 'GLB・付属情報・ZIPを作成',
    exact: true,
  });
  await tabTo(page, createPackage);
  await page.keyboard.press('Enter');

  const saveZip = panel.getByRole('button', { name: 'ZIPを保存', exact: true });
  await expect(saveZip).toBeVisible();
  await tabTo(page, saveZip);
  const downloadEvent = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const bytes = await readFile((await (await downloadEvent).path())!);
  const zip = unzipSync(bytes);
  const glb = preflightGlb(zip['model.glb']);
  const metadata = JSON.parse(new TextDecoder().decode(zip['game.json']));
  const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']));
  expect(Object.keys(zip).sort()).toEqual(['game.json', 'manifest.json', 'model.glb']);
  expect(glb.json.meshes).toHaveLength(1);
  expect(metadata.format).toBe('chameleon-game-3d');
  expect(metadata.version).toBe('1.0.0');
  expect(Number.isSafeInteger(metadata.revision)).toBe(true);
  expect(metadata.nodes.length).toBeGreaterThan(0);
  expect(metadata.meshes).toHaveLength(1);
  expect(metadata.modelHash).toBe(await sha256(zip['model.glb']));
  expect(manifest.format).toBe('chameleon-asset-package-3d');
  expect(manifest.version).toBe('1.0.0');
  expect(manifest.revision).toBe(metadata.revision);
  expect(manifest.files).toEqual([
    { path: 'model.glb', sha256: metadata.modelHash, bytes: zip['model.glb'].length },
    {
      path: 'game.json',
      sha256: await sha256(zip['game.json']),
      bytes: zip['game.json'].length,
    },
  ]);
  expect(manifest.warnings).toEqual(expect.any(Array));
});
test('keyboard-only import preview, GameData edit and export after fixture upload', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/3d/');

  const projectName = page.getByLabel('新しいプロジェクト名', { exact: true });
  await tabTo(page, projectName);
  await page.keyboard.type('Keyboard import workflow');
  const create = page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true });
  await page.keyboard.press('Tab');
  await expect(create).toBeFocused();
  await page.keyboard.press('Enter');
  const addBox = page.getByRole('button', { name: '箱を追加', exact: true });
  await tabTo(page, addBox);
  await page.keyboard.press('Enter');
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();

  const openDetails = page.getByText('GLB読込・配布ファイル出力', { exact: true });
  await tabTo(page, openDetails);
  await page.keyboard.press('Enter');
  const panel = io(page);
  await expect(panel).toBeVisible();

  const { bytes } = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  const fileInput = panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true });
  const fileChooser = page.waitForEvent('filechooser');
  await tabTo(page, fileInput);
  await page.keyboard.press('Enter');
  // Enter opens the chooser; Playwright injects the fixture so the native OS dialog UI is not tested.
  await (
    await fileChooser
  ).setFiles({
    name: 'keyboard-source.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(bytes),
  });
  await expect(panel.getByText(/^原本: keyboard-source\.glb/)).toBeVisible();
  const inspect = panel.getByRole('button', {
    name: 'GLBを検査して保存前に確認する',
    exact: true,
  });
  await tabTo(page, inspect);
  await page.keyboard.press('Enter');

  const preview = panel.getByRole('region', { name: 'GLBの保存前確認', exact: true });
  await expect(preview.getByText('取込候補を表示中（未保存）', { exact: true })).toBeVisible();
  const frameAll = preview.getByRole('button', { name: '取込候補を全体表示', exact: true });
  await expect(frameAll).toBeEnabled();
  await tabTo(page, frameAll);
  await page.keyboard.press('Enter');
  const orbitLeft = preview.getByRole('button', { name: '取込候補を左から見る', exact: true });
  await tabTo(page, orbitLeft);
  await page.keyboard.press('Enter');
  const importAcknowledgement = preview.getByLabel('変換後の表示と取込の注意を確認しました', {
    exact: true,
  });
  await expect(importAcknowledgement).toBeEnabled();
  await tabTo(page, importAcknowledgement);
  await page.keyboard.press('Space');
  await expect(importAcknowledgement).toBeChecked();
  const saveCopy = preview.getByRole('button', {
    name: '確認した取込候補を新しいコピーに保存',
    exact: true,
  });
  await expect(saveCopy).toBeEnabled();
  await tabTo(page, saveCopy);
  await page.keyboard.press('Enter');

  const savedProjects = page.getByRole('region', { name: '保存したプロジェクト', exact: true });
  const importedProject = savedProjects.getByRole('button', { name: /^Imported GLB revision/ });
  await expect(importedProject).toBeVisible();
  await tabTo(page, importedProject);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Imported GLB', exact: true })).toBeVisible();
  const open3d = page.getByRole('button', { name: '3D表示を開く', exact: true });
  await tabTo(page, open3d);
  await page.keyboard.press('Enter');
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();

  const gameDetails = page.getByText('ゲーム向け情報を編集', { exact: true });
  await tabTo(page, gameDetails);
  await page.keyboard.press('Enter');
  const game = page.getByRole('region', { name: '3Dゲーム向け情報', exact: true });
  const assetKind = game.getByLabel('asset種類', { exact: true });
  await tabTo(page, assetKind);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('character');
  const applyGame = game.getByRole('button', { name: 'ゲーム基本情報を適用', exact: true });
  await expect(applyGame).toBeEnabled();
  await tabTo(page, applyGame);
  await page.keyboard.press('Enter');
  await expect(assetKind).toHaveValue('character');

  const exportPanel = io(page);
  if (!(await exportPanel.isVisible())) {
    await tabTo(page, openDetails);
    await page.keyboard.press('Enter');
  }
  await expect(exportPanel).toBeVisible();
  const exportAcknowledgement = exportPanel.getByLabel(
    '固定revisionの出力範囲と変換・損失の注意を確認しました',
    { exact: true },
  );
  await expect(exportAcknowledgement).toBeEnabled();
  await tabTo(page, exportAcknowledgement);
  await page.keyboard.press('Space');
  const createPackage = exportPanel.getByRole('button', {
    name: 'GLB・付属情報・ZIPを作成',
    exact: true,
  });
  await tabTo(page, createPackage);
  await page.keyboard.press('Enter');
  const saveZip = exportPanel.getByRole('button', { name: 'ZIPを保存', exact: true });
  await expect(saveZip).toBeVisible();
  await tabTo(page, saveZip);
  const downloadEvent = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const zip = unzipSync(await readFile((await (await downloadEvent).path())!));
  const glb = preflightGlb(zip['model.glb']);
  const metadata = JSON.parse(new TextDecoder().decode(zip['game.json']));
  expect(glb.json.meshes?.length).toBeGreaterThan(0);
  expect(metadata.game.assetKind).toBe('character');
  expect(metadata.modelHash).toBe(await sha256(zip['model.glb']));
});
test('retires a stale import preview without canceling a concurrent fixed-revision export', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  const panel = await openIo(page),
    { bytes } = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'model.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(bytes),
  });
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  await expect(panel.getByText('取込候補を表示中（未保存）', { exact: true })).toBeVisible();
  const before = (await importBackup(await download(page, '現在の内容をバックアップ'))).project,
    held = await holdWorker(page);
  try {
    await panel
      .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
      .check();
    await panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
    await held.seen;
    await page.getByRole('button', { name: '箱を追加', exact: true }).click();
    await expect(panel.getByRole('region', { name: 'GLBの保存前確認', exact: true })).toHaveCount(
      0,
    );
    await expect(
      panel.getByRole('progressbar', { name: 'GLB入出力の進捗', exact: true }),
    ).toBeVisible();
  } finally {
    await held.release();
  }
  await expect(panel.getByRole('button', { name: 'ZIPを保存', exact: true })).toBeVisible();
  const zip = unzipSync(await download(page, 'ZIPを保存')),
    glb = preflightGlb(zip['model.glb']),
    meta = JSON.parse(new TextDecoder().decode(zip['game.json'])),
    after = (await importBackup(await download(page, '現在の内容をバックアップ'))).project;
  expect(glb.json.meshes).toHaveLength(before.meshes.length);
  expect(meta.revision).toBe(before.revision);
  expect(after.id).toBe(before.id);
  expect(after.meshes).toHaveLength(before.meshes.length + 1);
  expect(after.revision).toBeGreaterThan(meta.revision);
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
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
  await expect(panel.getByText(/^原本: model\.glb/)).toBeVisible();
  await expect(panel.getByText('付属情報: game.json', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  const importPreview = panel.getByRole('region', { name: 'GLBの保存前確認', exact: true });
  await expect(
    importPreview.getByText('取込候補を表示中（未保存）', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
  const saveCandidate = importPreview.getByRole('button', {
    name: '確認した取込候補を新しいコピーに保存',
    exact: true,
  });
  await expect(saveCandidate).toBeDisabled();
  await importPreview.getByRole('button', { name: '取込候補を全体表示', exact: true }).click();
  await importPreview.getByRole('button', { name: '取込候補を左から見る', exact: true }).click();
  await importPreview.getByLabel('変換後の表示と取込の注意を確認しました', { exact: true }).check();
  await visual(page, 'import-before-save');
  await saveCandidate.click();
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
    await panel
      .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
      .check();
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
test('final package preserves multiple rights notes as unverified paired provenance', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const { exportBackup } = await import('../src/core3d/backup/backup');
  const ancestor = assetIoFixture();
  const originalA = new TextEncoder().encode('synthetic original source A');
  const originalB = new TextEncoder().encode('synthetic original source B');
  const hashA = await sha256(originalA);
  const hashB = await sha256(originalB);
  ancestor.sources = [
    {
      id: 'prior-source-a',
      blobId: hashA,
      mimeType: 'text/plain',
      rights: { declared: 'User-declared source A terms', embedded: 'Embedded source A notice' },
    },
    {
      id: 'prior-source-b',
      blobId: hashB,
      mimeType: 'text/plain',
      rights: { declared: 'User-declared source B terms', embedded: 'Embedded source B notice' },
    },
  ];
  ancestor.blobIds = [hashA, hashB];
  const ancestorBlobs = new Map([
    [hashA, originalA],
    [hashB, originalB],
  ]);
  const first = await exportGlb(captureAssetSnapshot(ancestor, (id) => ancestorBlobs.get(id)!));
  const priorPackage = await buildAssetPackage(
    ancestor,
    first.bytes,
    first.warnings,
    ancestorBlobs,
  );
  const modelHash = await sha256(priorPackage.glb);
  const sidecarHash = await sha256(priorPackage.sidecar);
  const current = structuredClone(ancestor);
  current.name = 'EXP-06 provenance evidence';
  current.sources = [
    {
      id: 'paired-model-source',
      blobId: modelHash,
      mimeType: 'model/gltf-binary',
      rights: { declared: 'User-declared reimported model terms', embedded: '' },
    },
    {
      id: 'paired-sidecar-source',
      blobId: sidecarHash,
      mimeType: 'application/json',
      rights: {
        declared: 'User-declared paired note terms',
        embedded: 'Attribution text has not been verified',
      },
      derivedFrom: {
        sourceId: 'paired-model-source',
        hash: modelHash,
        operation: 'paired-sidecar',
        version: '1.0.0',
        settings: 'paired export fixture',
      },
    },
  ];
  current.blobIds = [modelHash, sidecarHash];
  const backup = await exportBackup(
    current,
    new Map([
      [modelHash, priorPackage.glb],
      [sidecarHash, priorPackage.sidecar],
    ]),
  );

  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'multi-source-provenance.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(backup),
  });
  await expect(page.getByRole('heading', { name: current.name, exact: true })).toBeVisible();
  const panel = await openIo(page);
  await panel
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
  await panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'ZIPを保存', exact: true })).toBeVisible();

  const zip = unzipSync(await download(page, 'ZIPを保存'));
  const sidecar = JSON.parse(new TextDecoder().decode(zip['game.json']));
  const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']));
  expect(sidecar.provenance.claims).toBe('user-declared-not-verified');
  expect(sidecar.provenance.sources).toEqual(current.sources);
  expect(sidecar.provenance.ancestors).toEqual([{ hash: sidecarHash, sources: ancestor.sources }]);
  expect(sidecar.provenance.ancestors[0].sources[0].rights.declared).toBe(
    'User-declared source A terms',
  );
  expect(sidecar.provenance.ancestors[0].sources[1].rights.declared).toBe(
    'User-declared source B terms',
  );
  expect(manifest.format).toBe('chameleon-asset-package-3d');
  expect(manifest.files).toEqual([
    {
      path: 'model.glb',
      sha256: await sha256(zip['model.glb']),
      bytes: zip['model.glb'].length,
    },
    {
      path: 'game.json',
      sha256: await sha256(zip['game.json']),
      bytes: zip['game.json'].length,
    },
  ]);
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
    await panel
      .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
      .check();
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

test('IMP-02: browser rejects malformed GLB header, chunk and accessor ranges before review', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ')),
    panel = await openIo(page),
    project = assetIoFixture(),
    { bytes: valid } = await exportGlb(captureAssetSnapshot(project, () => new Uint8Array()));

  const invalidMagic = valid.slice();
  invalidMagic[0] ^= 0xff;
  const invalidChunkLength = valid.slice();
  new DataView(
    invalidChunkLength.buffer,
    invalidChunkLength.byteOffset,
    invalidChunkLength.byteLength,
  ).setUint32(12, 0xfffffffc, true);
  const parsed = preflightGlb(valid),
    invalidAccessorJson = structuredClone(parsed.json);
  if (!invalidAccessorJson.accessors?.[0]) throw new Error('Fixture GLB has no accessor.');
  invalidAccessorJson.accessors[0].byteOffset = 9999999;
  const invalidAccessorRange = encodeGlb(invalidAccessorJson, parsed.binary);
  const fixtures = [
    {
      name: 'imp02-invalid-magic.glb',
      bytes: invalidMagic,
      expected: 'Invalid GLB header',
    },
    {
      name: 'imp02-invalid-chunk-length.glb',
      bytes: invalidChunkLength,
      expected: 'Invalid GLB chunk range',
    },
    {
      name: 'imp02-accessor-outside-buffer-view.glb',
      bytes: invalidAccessorRange,
      expected: 'Accessor outside bufferView',
    },
  ];
  for (const fixture of fixtures)
    expect(() => preflightGlb(fixture.bytes)).toThrow(fixture.expected);
  await test.info().attach('imp02-fixture-sha256.json', {
    body: JSON.stringify(
      await Promise.all(
        fixtures.map(async ({ name, bytes, expected }) => ({
          name,
          sha256: await sha256(bytes),
          rejectedAt: expected,
          bytes: bytes.byteLength,
        })),
      ),
      null,
      2,
    ),
    contentType: 'application/json',
  });

  const workerUrls: string[] = [];
  page.on('worker', (worker) => workerUrls.push(worker.url()));
  const worker = /assetIo\.worker/;
  for (const fixture of fixtures) {
    const priorWorkerCount = workerUrls.filter((url) => worker.test(url)).length;
    await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
      name: fixture.name,
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(fixture.bytes),
    });
    await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
    await expect
      .poll(() => workerUrls.filter((url) => worker.test(url)).length)
      .toBe(priorWorkerCount + 1);
    const alert = panel.getByRole('alert');
    await expect(alert).toContainText('GLBの取込');
    await expect(alert).toContainText('[IO_FORMAT]');
    await expect(alert).not.toContainText('[IO_WORKER]');
    await expect(alert).toContainText('ファイルの構造・宣言・参照が不正、または破損しています。');
    await expect(alert).toContainText('現在の作品と選択した原本は保持しています。');
    await expect(alert).not.toContainText(fixture.expected);
    await expect(
      panel.getByRole('region', { name: '変換後GLBの未保存プレビュー', exact: true }),
    ).toHaveCount(0);
  }

  const after = await importBackup(await download(page, '現在の内容をバックアップ'));
  expect(after.project).toEqual(before.project);
  expect([...after.blobs]).toEqual([...before.blobs]);
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
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('対応していない必須拡張');
  await expect(panel.getByRole('alert')).toContainText(
    '同じファイルの再試行だけでは対応できません',
  );
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
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('GLBと付属情報の組合せ');
  await expect(panel.getByRole('alert')).toContainText('同じ出力から作成されたGLBとgame.json');
  expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
    before.project,
  );
});

test('IMP-07: worker startup failure gives fixed recovery guidance and preserves the saved project', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ')),
    panel = await openIo(page),
    { bytes } = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'worker-startup-failure.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(bytes),
  });

  let workerRequests = 0;
  const pattern = /assetIo\.worker/;
  const failWorker = async (route: Route) => {
    workerRequests++;
    await route.abort('failed');
  };
  await page.route(pattern, failWorker);
  try {
    await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
    const alert = panel.getByRole('alert');
    await expect(alert).toContainText(
      'GLBの取込: 処理用の機能を準備できないか、応答を確認できませんでした。',
    );
    await expect(alert).toContainText('編集用バックアップを残し');
    await expect(alert).toContainText('[IO_WORKER]');
    await expect(alert).not.toContainText(/assetIo\.worker|worker-startup-failure\.glb|ERR_FAILED/);
    expect(workerRequests).toBeGreaterThan(0);

    const after = await importBackup(await download(page, '現在の内容をバックアップ'));
    expect(after.project).toEqual(before.project);
    expect([...after.blobs]).toEqual([...before.blobs]);
    await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
  } finally {
    await page.unroute(pattern, failWorker);
  }
});

test('IMP-05 rejects external, loopback and internal GLB resource URIs without requests', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ')),
    panel = await openIo(page),
    { bytes } = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  const uriProbePattern = /\/__imp05-uri-probe__\//;
  const attemptedUriRequests: string[] = [];
  const rejectUriProbeRequest = async (route: Route) => {
    attemptedUriRequests.push(route.request().url());
    await route.abort();
  };
  const context = page.context();
  const cases = [
    { id: 'external-buffer', kind: 'buffer', origin: 'https://external-uri-marker.invalid' },
    { id: 'external-image', kind: 'image', origin: 'https://external-uri-marker.invalid' },
    { id: 'localhost-buffer', kind: 'buffer', origin: 'http://localhost:4177' },
    { id: 'loopback-image', kind: 'image', origin: 'http://127.0.0.1:4177' },
    { id: 'private-buffer', kind: 'buffer', origin: 'http://192.168.1.50:4177' },
    { id: 'link-local-image', kind: 'image', origin: 'http://169.254.169.254' },
  ] as const;
  await context.route(uriProbePattern, rejectUriProbeRequest);
  try {
    for (const { id, kind, origin } of cases) {
      const candidate = preflightGlb(bytes),
        uri = `${origin}/__imp05-uri-probe__/${id}.dat`;
      if (kind === 'buffer') candidate.json.buffers![0].uri = uri;
      else candidate.json.images = [{ uri, mimeType: 'image/png' }];
      await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
        name: `${id}.glb`,
        mimeType: 'model/gltf-binary',
        buffer: Buffer.from(encodeGlb(candidate.json, candidate.binary)),
      });
      await panel
        .getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true })
        .click();
      const alert = panel.getByRole('alert');
      await expect(alert).toContainText(
        kind === 'buffer' ? '[IO_EXTERNAL_REFERENCE]' : '[IO_IMAGE]',
      );
      await expect(alert).not.toContainText(new URL(uri).host);
      if (kind === 'buffer')
        await expect(alert).toContainText('外部URLの取得や安全制限の解除は行いません。');
      const after = await importBackup(await download(page, '現在の内容をバックアップ'));
      expect(after.project).toEqual(before.project);
      expect(after.blobs).toEqual(before.blobs);
      await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
    }
    expect(attemptedUriRequests).toEqual([]);
  } finally {
    await context.unroute(uriProbePattern, rejectUriProbeRequest);
  }
});

test('IMP-04: refuses oversized GLB texture dimensions and aggregate pixels without replacing the saved project', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ'));
  const project = assetIoFixture();
  project.meshes[0].faces.forEach((face) => {
    face.uv = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
  });
  const { bytes } = await exportGlb(captureAssetSnapshot(project, () => new Uint8Array()));
  const cases = [
    {
      name: 'over-edge.glb',
      images: [{ width: NATIVE_TEXTURE_PROFILE.maxEdge + 1, height: 1 }],
      reason: '各辺',
    },
    {
      name: 'aggregate-pixels.glb',
      images: [
        { width: NATIVE_TEXTURE_PROFILE.maxEdge, height: NATIVE_TEXTURE_PROFILE.maxEdge },
        {
          width: NATIVE_TEXTURE_PROFILE.maxEdge,
          height: NATIVE_TEXTURE_PROFILE.maxEdge,
          colorType: 2 as const,
        },
      ],
      reason: 'Total image pixels',
    },
  ];
  const panel = await openIo(page);
  for (const fixture of cases) {
    const candidate = glbWithTextureHeaders(bytes, fixture.images);
    await expect(importGlb(candidate, 'imp04-candidate')).rejects.toThrow(fixture.reason);
    await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
      name: fixture.name,
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(candidate),
    });
    await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
    await expect(panel.getByRole('alert')).toBeVisible();
    expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
      before.project,
    );
    await expect(
      page.getByRole('region', { name: '保存したプロジェクト', exact: true }).getByRole('button', {
        name: /^Imported GLB revision/,
      }),
    ).toHaveCount(0);
  }
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
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  await held.seen;
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await held.release();
  await expect(panel.getByRole('status')).toContainText('中止');
  expect(
    (await importBackup(await download(page, '現在の内容をバックアップ'))).project.meshes,
  ).toHaveLength(2);
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
  held = await holdWorker(page);
  await panel
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
  await panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await held.seen;
  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  await held.release();
  await expect(panel).toHaveCount(0);
  await openIo(page);
  await expect(io(page).getByRole('button', { name: 'ZIPを保存', exact: true })).toHaveCount(0);
});

test('cancels an in-flight import before file reselection and only adopts the replacement candidate', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ')),
    panel = await openIo(page),
    original = assetIoFixture(),
    replacement = assetIoFixture();
  replacement.nodes[0].name = 'Replacement candidate';
  const originalGlb = await exportGlb(captureAssetSnapshot(original, () => new Uint8Array())),
    replacementGlb = await exportGlb(captureAssetSnapshot(replacement, () => new Uint8Array()));
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'original.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(originalGlb.bytes),
  });

  const held = await holdWorker(page);
  try {
    await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
    await held.seen;
    await panel.getByRole('button', { name: 'GLB処理を取り消す', exact: true }).click();
    await expect(
      panel.getByRole('progressbar', { name: 'GLB入出力の進捗', exact: true }),
    ).toHaveCount(0);
  } finally {
    await held.release();
  }

  const candidate = panel.getByRole('region', { name: 'GLBの保存前確認', exact: true });
  await expect(candidate).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText('中止');
  expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
    before.project,
  );
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);

  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'replacement.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(replacementGlb.bytes),
  });
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  await expect(candidate.getByText('取込候補を表示中（未保存）', { exact: true })).toBeVisible();
  await expect(
    panel.getByText(`検査した原本GLB SHA-256: ${await sha256(replacementGlb.bytes)}`, {
      exact: true,
    }),
  ).toBeVisible();
  await candidate.getByLabel('変換後の表示と取込の注意を確認しました', { exact: true }).check();
  await candidate
    .getByRole('button', { name: '確認した取込候補を新しいコピーに保存', exact: true })
    .click();

  const importedProject = page
    .getByRole('region', { name: '保存したプロジェクト', exact: true })
    .getByRole('button', { name: /^Imported GLB revision/ });
  await expect(importedProject).toBeVisible();
  await importedProject.click();
  const imported = await importBackup(await download(page, '現在の内容をバックアップ')),
    sourceHash = await sha256(replacementGlb.bytes);
  expect(imported.project.nodes.some((node) => node.name === 'Replacement candidate')).toBe(true);
  expect(imported.blobs.get(sourceHash)).toEqual(replacementGlb.bytes);
  expect(imported.blobs.has(await sha256(originalGlb.bytes))).toBe(false);
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
      await panel
        .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
        .check();
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

test('requires current-revision export review before generation and clears acknowledgement on edit or close', async ({
  page,
}) => {
  const workers: string[] = [];
  page.on('worker', (worker) => {
    if (worker.url().includes('assetIo')) workers.push(worker.url());
  });
  await setup(page);
  const panel = await openIo(page);
  const create = panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true });
  const consent = panel.getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', {
    exact: true,
  });
  const review = panel.getByRole('region', { name: '出力前の範囲と変換・損失の確認', exact: true });
  await expect(review).toContainText('実変換、原本hash、画像decodeの成功判定ではありません');
  await expect(create).toBeDisabled();
  expect(workers).toEqual([]);
  const before = (await importBackup(await download(page, '現在の内容をバックアップ'))).project;
  await consent.check();
  await expect(create).toBeEnabled();
  expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
    before,
  );
  await page.getByLabel('プロジェクト名', { exact: true }).fill('Revised delivery');
  await expect(consent).not.toBeChecked();
  await expect(create).toBeDisabled();
  expect(workers).toEqual([]);
  await consent.check();
  await create.click();
  await expect(panel.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
  expect(workers.length).toBeGreaterThan(0);
  const glb = preflightGlb(await download(page, 'GLBを保存'));
  expect(glb.json.meshes).toHaveLength(1);
  await panel.getByRole('button', { name: 'GLB入出力を閉じる', exact: true }).click();
  await panel.getByRole('button', { name: 'GLB入出力を開く', exact: true }).click();
  await expect(consent).not.toBeChecked();
  await expect(create).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'GLBを保存', exact: true })).toHaveCount(0);
  await visual(page, 'export-prereview');
});

test('pre-export review discloses an omitted native vertex and backup retains it', async ({
  page,
}) => {
  const { nativeBox } = await import('../src/core3d/fixtures/nativeBox');
  const { exportBackup } = await import('../src/core3d/backup/backup');
  const project = nativeBox('unused-vertex-export-review');
  const unused = { id: 'unused-export-vertex', position: [4, 5, 6] as [number, number, number] };
  project.meshes[0].vertices.push(unused);
  const archive = await exportBackup(project, new Map());

  const workers: string[] = [];
  page.on('worker', (worker) => {
    if (worker.url().includes('assetIo')) workers.push(worker.url());
  });
  await page.goto('/3d/');
  await page.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
    name: 'unused-vertex.cas3dproj',
    mimeType: 'application/zip',
    buffer: Buffer.from(archive),
  });
  await expect(page.getByRole('heading', { name: 'Native box', exact: true })).toBeVisible();
  const panel = await openIo(page);
  const review = panel.getByRole('region', { name: '出力前の範囲と変換・損失の確認', exact: true });
  await expect(review).toContainText(
    '面から使われていない頂点は編集後GLBのgeometryへ出力されません。',
  );
  await expect(review).toContainText(
    '未使用頂点を含む編集構造はnative backupに保持します。game.jsonにはgeometryを保持しません。',
  );

  const create = panel.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true });
  const consent = panel.getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', {
    exact: true,
  });
  await expect(consent).not.toBeChecked();
  await expect(create).toBeDisabled();
  expect(workers).toEqual([]);

  await consent.check();
  await create.click();
  await expect(panel.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
  expect(workers.length).toBeGreaterThan(0);
  const glb = preflightGlb(await download(page, 'GLBを保存'));
  const positionAccessor = glb.json.meshes![0].primitives[0].attributes.POSITION;
  expect(glb.read(positionAccessor)).not.toContainEqual(unused.position);

  const backup = await importBackup(await download(page, '現在の内容をバックアップ'));
  expect(backup.project.meshes[0].vertices).toContainEqual(unused);
});

test('successful unsaved import previews cancel on close, Escape, file replacement and canonical changes', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ'));
  const panel = await openIo(page);
  const fixture = assetIoFixture();
  const { bytes } = await exportGlb(captureAssetSnapshot(fixture, () => new Uint8Array()));
  const choose = async (name = 'preview.glb') =>
    panel
      .getByLabel('読み込むGLB（32MiBまで）', { exact: true })
      .setInputFiles({ name, mimeType: 'model/gltf-binary', buffer: Buffer.from(bytes) });
  const start = panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true });
  const candidate = panel.getByRole('region', { name: 'GLBの保存前確認', exact: true });
  const checked = candidate.getByLabel('変換後の表示と取込の注意を確認しました', { exact: true });
  const prepare = async () => {
    await start.click();
    await expect(candidate.getByText('取込候補を表示中（未保存）', { exact: true })).toBeVisible();
    await expect(checked).not.toBeChecked();
  };
  await choose();
  await prepare();
  await checked.check();
  await candidate.getByRole('button', { name: '未保存の取込候補を取り消す', exact: true }).click();
  await expect(candidate).toHaveCount(0);
  await expect(start).toBeFocused();
  expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
    before.project,
  );
  await prepare();
  await tabTo(page, checked);
  await expect(checked).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(candidate).toHaveCount(0);
  await expect(start).toBeFocused();
  await prepare();
  await checked.check();
  await choose('replacement.glb');
  await expect(candidate).toHaveCount(0);
  await prepare();
  await checked.check();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(candidate).toHaveCount(0);
  await prepare();
  await checked.check();
  await page.evaluate(() => document.dispatchEvent(new Event('freeze')));
  await expect(candidate).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new Event('resume')));
  await expect(candidate).toHaveCount(0);
  await prepare();
  await panel.getByRole('button', { name: 'GLB入出力を閉じる', exact: true }).click();
  await panel.getByRole('button', { name: 'GLB入出力を開く', exact: true }).click();
  await expect(candidate).toHaveCount(0);
  await expect(start).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
  const after = await importBackup(await download(page, '現在の内容をバックアップ'));
  expect(after.project.nodes).toHaveLength(before.project.nodes.length + 1);
  expect(after.project.nodes[0]).toEqual(before.project.nodes[0]);
});

test('an unavailable preview renderer never authorizes saving a successful import candidate', async ({
  page,
}) => {
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ'));
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      options?: unknown,
    ) {
      if (kind === 'webgl2') return null;
      return Reflect.apply(original, this, [kind, options]);
    } as typeof original;
  });
  const panel = await openIo(page),
    { bytes } = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'no-preview.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(bytes),
  });
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  const candidate = panel.getByRole('region', { name: 'GLBの保存前確認', exact: true });
  await expect(candidate.getByRole('alert')).toContainText('保存の確認はできません');
  await expect(
    candidate.getByLabel('変換後の表示と取込の注意を確認しました', { exact: true }),
  ).toBeDisabled();
  await expect(
    candidate.getByRole('button', { name: '確認した取込候補を新しいコピーに保存', exact: true }),
  ).toBeDisabled();
  await candidate.getByRole('button', { name: '未保存の取込候補を取り消す', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
  expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
    before.project,
  );
});

test('a synchronous context-loss notification invalidates save before React commits its disabled state', async ({
  page,
}) => {
  await setup(page);
  const panel = await openIo(page);
  const { bytes } = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'context.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(bytes),
  });
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  const candidate = panel.getByRole('region', { name: 'GLBの保存前確認', exact: true });
  await expect(candidate.getByText('取込候補を表示中（未保存）', { exact: true })).toBeVisible();
  const acknowledgement = candidate.getByLabel('変換後の表示と取込の注意を確認しました', {
    exact: true,
  });
  await acknowledgement.check();
  await candidate.evaluate((region) => {
    const canvas = region.querySelector('canvas')!;
    const save = [...region.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '確認した取込候補を新しいコピーに保存',
    )!;
    // Same JavaScript turn: the React disabled-state update has not committed yet.
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    save.click();
  });
  await expect(acknowledgement).not.toBeChecked();
  await expect(
    candidate.getByRole('button', { name: '確認した取込候補を新しいコピーに保存', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
});

test('malformed or over-budget extension declarations show bounded Japanese guidance and retain the project', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ'));
  const panel = await openIo(page);
  const fixture = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  const cases: Array<{ key: string; value: unknown; code: string }> = [
    { key: 'extensionsUsed', value: 'UNKNOWN', code: 'IO_FORMAT' },
    { key: 'extensionsRequired', value: { length: 0 }, code: 'IO_FORMAT' },
    {
      key: 'extensionsUsed',
      value: Array.from({ length: 65 }, (_, index) => `VENDOR_${index}`),
      code: 'IO_PROFILE_LIMIT',
    },
    { key: 'extensionsUsed', value: ['X'.repeat(129)], code: 'IO_PROFILE_LIMIT' },
  ];
  for (const sample of cases) {
    const input = preflightGlb(fixture.bytes);
    // Deliberately malformed/admission-boundary fixture; never a product schema assertion.
    (input.json as unknown as Record<string, unknown>)[sample.key] = sample.value;
    await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
      name: 'PRIVATE-ORIGINAL.glb',
      mimeType: 'model/gltf-binary',
      buffer: Buffer.from(encodeGlb(input.json, input.binary)),
    });
    await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
    const alert = panel.getByRole('alert');
    await expect(alert).toContainText(`[${sample.code}]`);
    await expect(alert).toContainText('GLBの取込');
    await expect(alert).toContainText('現在の作品と選択した原本は保持しています');
    await expect(alert).not.toContainText('PRIVATE-ORIGINAL');
    expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
      before.project,
    );
  }
});

test('a first preview draw failure cannot enable import confirmation or save', async ({ page }) => {
  await setup(page);
  const before = await importBackup(await download(page, '現在の内容をバックアップ'));
  await page.evaluate(() => {
    const original = WebGL2RenderingContext.prototype.drawElements;
    const originalArrays = WebGL2RenderingContext.prototype.drawArrays;
    const fixture = { failures: 0, everEnabled: false };
    (window as unknown as { importDrawFixture: typeof fixture }).importDrawFixture = fixture;
    WebGL2RenderingContext.prototype.drawElements = function (mode, count, type, offset) {
      if (
        this.canvas instanceof HTMLCanvasElement &&
        this.canvas.closest('.native-import-preview-host')
      ) {
        fixture.failures++;
        throw new Error('Injected first preview draw failure');
      }
      return original.call(this, mode, count, type, offset);
    };
    WebGL2RenderingContext.prototype.drawArrays = function (mode, first, count) {
      if (
        this.canvas instanceof HTMLCanvasElement &&
        this.canvas.closest('.native-import-preview-host')
      ) {
        fixture.failures++;
        throw new Error('Injected first preview draw failure');
      }
      return originalArrays.call(this, mode, first, count);
    };
    new MutationObserver(() => {
      const checkbox = document.querySelector<HTMLInputElement>(
        '[aria-label="GLBの保存前確認"] input[type="checkbox"]',
      );
      if (checkbox && !checkbox.disabled) fixture.everEnabled = true;
    }).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled'],
    });
  });
  const panel = await openIo(page);
  const fixture = await exportGlb(captureAssetSnapshot(assetIoFixture(), () => new Uint8Array()));
  await panel.getByLabel('読み込むGLB（32MiBまで）', { exact: true }).setInputFiles({
    name: 'first-draw.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(fixture.bytes),
  });
  await panel.getByRole('button', { name: 'GLBを検査して保存前に確認する', exact: true }).click();
  const candidate = panel.getByRole('region', { name: 'GLBの保存前確認', exact: true });
  await expect(candidate.getByRole('alert')).toContainText('保存の確認はできません');
  await expect(
    candidate.getByLabel('変換後の表示と取込の注意を確認しました', { exact: true }),
  ).toBeDisabled();
  await expect(
    candidate.getByRole('button', { name: '確認した取込候補を新しいコピーに保存', exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { importDrawFixture: { failures: number; everEnabled: boolean } })
          .importDrawFixture,
    ),
  ).toEqual({ failures: 1, everEnabled: false });
  await candidate.getByRole('button', { name: '未保存の取込候補を取り消す', exact: true }).click();
  expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
    before.project,
  );
  await expect(page.getByRole('button', { name: /^Imported GLB revision/ })).toHaveCount(0);
});

test('invalid game identifiers and units keep metadata intact with targeted Japanese guidance', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await setup(page);
  await page.getByText('ゲーム向け情報を編集', { exact: true }).click();
  const game = page.getByRole('region', { name: '3Dゲーム向け情報', exact: true });
  const before = (await importBackup(await download(page, '現在の内容をバックアップ'))).project;
  for (const input of [
    {
      label: 'asset ID',
      value: 'private/source.glb',
      code: 'EDIT_GAME_ID',
      reason: 'asset IDの文字と長さを確認してください。',
    },
    {
      label: '受渡し単位（1単位あたりのm）',
      value: '0',
      code: 'EDIT_GAME_INPUT',
      reason: '受渡し単位は0より大きい値で入力してください。',
    },
    {
      label: '受渡し単位（1単位あたりのm）',
      value: '-1',
      code: 'EDIT_GAME_INPUT',
      reason: '受渡し単位は0より大きい値で入力してください。',
    },
  ]) {
    await game
      .getByRole('button', { name: '基本情報の現在値を読む（入力を戻す）', exact: true })
      .click();
    await game.getByLabel(input.label, { exact: true }).fill(input.value);
    await game.getByRole('button', { name: 'ゲーム基本情報を適用', exact: true }).click();
    await expect(game.getByRole('alert')).toContainText('ゲーム向け情報の編集');
    await expect(game.getByRole('alert')).toContainText(input.reason);
    await expect(game.getByRole('alert')).toContainText(`[${input.code}]`);
    await expect(game.getByRole('alert')).not.toContainText('private/source.glb');
    expect((await importBackup(await download(page, '現在の内容をバックアップ'))).project).toEqual(
      before,
    );
  }
});
