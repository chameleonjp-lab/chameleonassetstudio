import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

const REFERENCE_ID = '2d-pro-reference-001';
const PROJECT_NAME = '2D Pro代表project';
const ASSET_ID = 'asset_2d_pro_reference_001';
const ASSET_DISPLAY_NAME = '2D Pro代表Asset';
const FIXED_AT = '2026-08-29T00:00:00.000Z';
const IMAGE_PATH = 'textures/main.png';

interface Vec2 {
  x: number;
  y: number;
}

interface Transform {
  position: Vec2;
  scale: Vec2;
  rotation: number;
}

interface ReferenceProject {
  format: string;
  version: string;
  id: string;
  name: string;
  assets: Array<{
    id: string;
    name: string;
    displayName: string;
    assetType: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface ReferenceAsset {
  [key: string]: unknown;
  format: string;
  version: string;
  id: string;
  assetType: string;
  name: string;
  displayName: string;
  canvasSize: { width: number; height: number };
  origin: Vec2;
  textures: Array<{
    id: string;
    kind: string;
    name: string;
    mimeType: string;
    size: { width: number; height: number };
    path: string;
  }>;
  layers: Array<{
    id: string;
    name: string;
    layerType: string;
    visible: boolean;
    locked: boolean;
    opacity: number;
    transform: Transform;
    textureId?: string;
  }>;
  anchors: Array<{ id: string; name: string; role: string; position: Vec2 }>;
  colliders: Array<{
    id: string;
    name: string;
    purpose: string;
    shape: string;
    visible: boolean;
    rect?: { x: number; y: number; width: number; height: number };
    circle?: { x: number; y: number; radius: number };
  }>;
  frames: Array<{
    id: string;
    name: string;
    layerStates: Array<{
      layerId: string;
      visible?: boolean;
      transform?: Transform;
    }>;
    durationMs?: number;
  }>;
  animations: Array<{
    id: string;
    name: string;
    fps: number;
    loop: boolean;
    frameIds: string[];
  }>;
  tags: string[];
  gameAttributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ReferenceArchive {
  project: ReferenceProject;
  asset: ReferenceAsset;
  entryPaths: string[];
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function buildReferenceArchive(includeImage: boolean): Promise<Buffer> {
  const [projectText, assetText, imageBase64] = await Promise.all([
    readFile('src/core/storage/__fixtures__/v0.1.0-project.json', 'utf8'),
    readFile('src/core/storage/__fixtures__/v0.1.0-asset.json', 'utf8'),
    readFile('src/core/storage/__fixtures__/v0.1.0-image-8x8.png.base64.txt', 'utf8'),
  ]);
  const project = JSON.parse(projectText) as ReferenceProject;
  const asset = JSON.parse(assetText) as ReferenceAsset;
  const layerId = asset.layers[0]?.id;
  if (!layerId) {
    throw new Error('代表Assetのレイヤーがありません。');
  }

  project.id = 'project_2d_pro_reference_001';
  project.name = PROJECT_NAME;
  project.createdAt = FIXED_AT;
  project.updatedAt = FIXED_AT;
  asset.version = '0.2.0';
  asset.id = ASSET_ID;
  asset.name = REFERENCE_ID;
  asset.displayName = ASSET_DISPLAY_NAME;
  asset.createdAt = FIXED_AT;
  asset.updatedAt = FIXED_AT;
  asset.gameAttributes = {
    ...asset.gameAttributes,
    referenceId: REFERENCE_ID,
  };
  asset.frames = [
    {
      id: 'frame_ref_0',
      name: 'idle_0',
      layerStates: [
        {
          layerId,
          visible: true,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
          },
        },
      ],
    },
    {
      id: 'frame_ref_1',
      name: 'idle_1',
      layerStates: [
        {
          layerId,
          visible: true,
          transform: {
            position: { x: 1, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
          },
        },
      ],
    },
  ];
  asset.animations = [
    {
      id: 'animation_ref_idle',
      name: 'idle',
      fps: 8,
      loop: true,
      frameIds: ['frame_ref_0', 'frame_ref_1'],
    },
  ];
  project.assets = [
    {
      id: asset.id,
      name: asset.name,
      displayName: asset.displayName,
      assetType: asset.assetType,
    },
  ];

  const entries: Record<string, Uint8Array> = {
    'project.json': strToU8(JSON.stringify(project)),
    ['assets/' + asset.id + '/asset.json']: strToU8(JSON.stringify(asset)),
  };
  if (includeImage) {
    entries['assets/' + asset.id + '/' + IMAGE_PATH] = Buffer.from(imageBase64.trim(), 'base64');
  }
  return Buffer.from(zipSync(entries, { level: 9, mtime: new Date(FIXED_AT) }));
}

function readReferenceArchive(bytes: Uint8Array): ReferenceArchive {
  const entries = unzipSync(bytes);
  const projectBytes = entries['project.json'];
  const assetPath = Object.keys(entries).find((path) => /^assets\/[^/]+\/asset\.json$/.test(path));
  if (!projectBytes || !assetPath) {
    throw new Error('代表projectの正本ファイルが見つかりません。');
  }
  return {
    project: JSON.parse(strFromU8(projectBytes)) as ReferenceProject,
    asset: JSON.parse(strFromU8(entries[assetPath])) as ReferenceAsset,
    entryPaths: Object.keys(entries).sort(),
  };
}

function representativeSnapshot(archive: ReferenceArchive): unknown {
  const { project, asset } = archive;
  const textureById = new Map(asset.textures.map((texture) => [texture.id, texture.path]));
  const frameById = new Map(asset.frames.map((frame) => [frame.id, frame.name]));
  const layerById = new Map(asset.layers.map((layer) => [layer.id, layer.name]));
  return {
    projectName: project.name,
    projectAssets: project.assets.map(({ name, displayName, assetType }) => ({
      name,
      displayName,
      assetType,
    })),
    asset: {
      name: asset.name,
      displayName: asset.displayName,
      assetType: asset.assetType,
      canvasSize: asset.canvasSize,
      origin: asset.origin,
      textures: asset.textures.map(({ kind, name, mimeType, size, path }) => ({
        kind,
        name,
        mimeType,
        size,
        path,
      })),
      layers: asset.layers.map(
        ({ name, layerType, visible, locked, opacity, transform, textureId }) => ({
          name,
          layerType,
          visible,
          locked,
          opacity,
          transform,
          texturePath: textureId ? textureById.get(textureId) : undefined,
        }),
      ),
      anchors: asset.anchors.map(({ name, role, position }) => ({ name, role, position })),
      colliders: asset.colliders.map(({ name, purpose, shape, visible, rect, circle }) => ({
        name,
        purpose,
        shape,
        visible,
        rect,
        circle,
      })),
      frames: asset.frames.map((frame) => ({
        name: frame.name,
        durationMs: frame.durationMs,
        layerStates: frame.layerStates.map((state) => ({
          layerName: layerById.get(state.layerId),
          visible: state.visible,
          transform: state.transform,
        })),
      })),
      animations: asset.animations.map((animation) => ({
        name: animation.name,
        fps: animation.fps,
        loop: animation.loop,
        frameNames: animation.frameIds.map((frameId) => frameById.get(frameId)),
      })),
      tags: asset.tags,
      gameAttributes: asset.gameAttributes,
    },
  };
}

function assertRepresentativeData(archive: ReferenceArchive): void {
  const { asset } = archive;
  expect(asset.gameAttributes.referenceId).toBe(REFERENCE_ID);
  expect(asset.origin).toEqual({ x: 4, y: 8 });
  expect(asset.anchors.some((anchor) => anchor.role === 'foot')).toBe(true);
  expect(asset.colliders.some((collider) => collider.shape === 'rect')).toBe(true);
  expect(
    asset.layers.some((layer) => layer.transform.scale.x === 1 && layer.transform.scale.y === 1),
  ).toBe(true);
  expect(asset.frames.map((frame) => frame.name)).toEqual(['idle_0', 'idle_1']);
  expect(asset.animations[0]?.frameIds).toEqual(['frame_ref_0', 'frame_ref_1']);
}

async function importReferenceArchive(page: Page, bytes: Buffer, filename: string): Promise<void> {
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: filename,
    mimeType: 'application/zip',
    buffer: bytes,
  });
  const openButton = page.getByRole('button', { name: '「' + PROJECT_NAME + '」を開く' });
  await expect(openButton).toBeVisible();
  await openButton.click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function verifyGameCheck(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'ゲーム確認', exact: true }).click();
  const gameCheck = page.getByRole('main', { name: 'ゲーム確認' });
  await expect(gameCheck).toBeVisible();
  await expect(
    gameCheck.getByRole('heading', { name: 'ゲーム確認：' + ASSET_DISPLAY_NAME }),
  ).toBeVisible();
  await gameCheck.getByLabel('Preview Animation').selectOption('animation_ref_idle');
  await expect(gameCheck.getByLabel('Preview Frame')).toHaveValue('frame_ref_0');
  await expect(gameCheck.getByText(/origin：配置基準/)).toBeVisible();
  await gameCheck
    .locator('header')
    .getByRole('button', { name: 'Editorへ戻る', exact: true })
    .click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function downloadCasproj(page: Page): Promise<Buffer> {
  await page
    .locator('.editor-mobile-nav')
    .getByRole('button', { name: '書き出し', exact: true })
    .click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '.casproj をダウンロード', exact: true }).click(),
  ]);
  const path = await download.path();
  if (!path) {
    throw new Error('代表projectの.casproj download pathを取得できません。');
  }
  return readFile(path);
}

async function deleteProject(page: Page): Promise<void> {
  await page.goto('/');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: '「' + PROJECT_NAME + '」を削除' }).click();
  await expect(page.getByText('保存済みのプロジェクトはありません。')).toBeVisible();
}

async function writeEvidence(testInfo: TestInfo, evidence: unknown): Promise<void> {
  const body = Buffer.from(JSON.stringify(evidence, null, 2) + '\n');
  await testInfo.attach('group23-reference-project-flow.json', {
    body,
    contentType: 'application/json',
  });
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/group23-reference-project-flow.json', body);
}

test('2D Pro代表projectを問題修正・再試行・Game Check・.casproj再生成まで同じIDで確認する', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const brokenArchive = await buildReferenceArchive(false);
  await page.goto('/');
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: '2d-pro-reference-001-broken.casproj',
    mimeType: 'application/zip',
    buffer: brokenArchive,
  });
  await expect(page.getByRole('alert')).toContainText('画像ファイルが不足');
  await expect(
    page
      .getByRole('region', { name: '読み込みに失敗したファイル' })
      .getByText('2d-pro-reference-001-broken.casproj'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '「' + PROJECT_NAME + '」を開く' })).toHaveCount(0);

  const fixedArchive = await buildReferenceArchive(true);
  await importReferenceArchive(page, fixedArchive, '2d-pro-reference-001-fixed.casproj');
  await verifyGameCheck(page);

  const firstExport = await downloadCasproj(page);
  const firstArchive = readReferenceArchive(firstExport);
  assertRepresentativeData(firstArchive);
  expect(firstArchive.entryPaths).toContain('project.json');
  expect(firstArchive.entryPaths.some((path) => path.endsWith('/' + IMAGE_PATH))).toBe(true);
  const firstSnapshot = representativeSnapshot(firstArchive);

  await deleteProject(page);
  await importReferenceArchive(page, firstExport, '2d-pro-reference-001-roundtrip.casproj');
  const secondExport = await downloadCasproj(page);
  const secondArchive = readReferenceArchive(secondExport);
  assertRepresentativeData(secondArchive);
  expect(representativeSnapshot(secondArchive)).toEqual(firstSnapshot);

  await writeEvidence(testInfo, {
    workPackage: '2D-6-REFERENCE',
    referenceId: REFERENCE_ID,
    status: 'automated-reference-flow',
    issueFixRetry: {
      status: 'passed',
      issue: 'canonical image file was intentionally omitted',
      fix: 'canonical image file was restored',
      retry: 'the same reference project was imported successfully',
    },
    gameCheck: {
      status: 'passed',
      requiredData: ['frame', 'animation', 'origin', 'anchor', 'rect-collider', 'scale'],
    },
    casprojRoundtrip: {
      status: 'passed',
      semanticSnapshotEqual: true,
      firstExportSha256: sha256(firstExport),
      secondExportSha256: sha256(secondExport),
    },
    manualGate: {
      status: 'not-run',
      reason: 'Chromium CI evidence does not replace physical device or first-time review evidence',
    },
  });
});
