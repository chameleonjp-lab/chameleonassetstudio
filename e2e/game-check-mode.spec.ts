import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  expect,
  test,
  type Download,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { HistorySnapshot } from '../src/core/history/history';
import type { Asset, AssetType, Project } from '../src/core/model';
import type { AutosaveSnapshot } from '../src/core/storage/autosave';

const PROJECT_NAME = 'G14-game-check-mode-375x667';
const NORMAL_FIXTURES: ReadonlyArray<{
  id: string;
  type: AssetType;
  typeLabel: string;
  detail: RegExp;
}> = [
  {
    id: 'G14-P1-character-normal',
    type: 'character',
    typeLabel: 'キャラクター',
    detail: /originのYを接地線/,
  },
  {
    id: 'G14-P1-item-normal',
    type: 'item',
    typeLabel: 'アイテム',
    detail: /自動の接地物理は加えず/,
  },
  {
    id: 'G14-P1-background-normal',
    type: 'background',
    typeLabel: '背景',
    detail: /parallax設定/,
  },
  {
    id: 'G14-P1-tile-normal',
    type: 'tile',
    typeLabel: 'タイル',
    detail: /3×3反復/,
  },
  {
    id: 'G14-P1-gimmick-normal',
    type: 'gimmick',
    typeLabel: 'ギミック',
    detail: /movementPreset「horizontal」/,
  },
  {
    id: 'G14-P1-effect-normal',
    type: 'effect',
    typeLabel: 'エフェクト',
    detail: /duration 500ms.*blend add/,
  },
];

const NEGATIVE_FIXTURE_IDS = [
  'G14-P1-invalid-collider',
  'G14-P1-dangling-reference',
  'G14-P1-missing-blob',
  'G14-P1-decode-failure',
  'G14-P1-character-unset',
  'G14-P1-background-invalid',
] as const;
const MATRIX_ASSET_TYPES = [
  'character',
  'item',
  'background',
  'tile',
  'gimmick',
  'effect',
] as const satisfies readonly AssetType[];
const MATRIX_STATES = [
  'unset',
  'frame-override',
  'dangling-invalid',
  'missing-or-decode',
  'atlas-reject',
] as const;
const MATRIX_FIXTURE_IDS = MATRIX_ASSET_TYPES.flatMap((assetType) =>
  MATRIX_STATES.map((state) => `G14-P1-${assetType}-${state}`),
);

const ACCEPTANCE_FIXTURE_IDS = [
  ...NORMAL_FIXTURES.map((fixture) => fixture.id),
  ...NEGATIVE_FIXTURE_IDS.slice(0, 4),
  'G14-I1-linked-direct',
  'G14-I1-manual-unassessed',
  'G14-EXPORT-atlas-reject',
] as const;

const FIXED_AT = '2026-08-09T00:00:00.000Z';
const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAgUlEQVR42u3YsRUAEBBEwWtOIepQi0SNcjog5iYQXmCi/zbmqOv0SuvH9/p9AAAAAAAAAIkBfv/g7R4AAAAAAADIDKAEAQAAAAAAAHuAEgQAAAAAAADsAUoQAAAAAAAAsAcoQQAAAAAAAMAeoAQBAAAAAAAAe4ASBAAAAAAAAL4D2KI3kneXV+y9AAAAAElFTkSuQmCC',
  'base64',
);

interface ArchiveEntryEvidence {
  path: string;
  byteLength: number;
  sha256: string;
}

interface ArchiveEvidence {
  rawByteLength: number;
  rawSha256: string;
  manifestSha256: string;
  entries: ArchiveEntryEvidence[];
}

interface ExportEvidence {
  assetJson: {
    byteLength: number;
    sha256: string;
  };
  casproj: ArchiveEvidence;
}

interface FixtureBundle {
  buffer: Buffer;
  evidence: ArchiveEvidence & {
    fixtureIds: string[];
    evidenceIds: string[];
    browserHarness: {
      entries: ArchiveEntryEvidence[];
      manifestSha256: string;
      fixtureIds: readonly string[];
    };
  };
}

interface EditorUiState {
  saveStatus: string;
  undo: { disabled: boolean; title: string | null };
  redo: { disabled: boolean; title: string | null };
  history: HistorySnapshot;
  autosave: AutosaveSnapshot;
  localStorage: Array<[string, string]>;
  sessionStorage: Array<[string, string]>;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function archiveEvidence(bytes: Uint8Array): ArchiveEvidence {
  const entries = Object.entries(unzipSync(bytes))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, entryBytes]) => ({
      path,
      byteLength: entryBytes.byteLength,
      sha256: sha256(entryBytes),
    }));
  const manifestBytes = strToU8(JSON.stringify(entries));
  return {
    rawByteLength: bytes.byteLength,
    rawSha256: sha256(bytes),
    manifestSha256: sha256(manifestBytes),
    entries,
  };
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`),
    contentType: 'application/json',
  });
}

function normalAsset(baseAsset: Asset, id: string, assetType: AssetType): Asset {
  const asset = structuredClone(baseAsset);
  asset.id = id;
  asset.assetType = assetType;
  asset.name = id;
  asset.displayName = id;
  asset.canvasSize = { width: 64, height: 64 };
  asset.origin = { x: 32, y: 56 };
  asset.textures = asset.textures.map((texture) => ({
    ...texture,
    size: { width: 64, height: 64 },
  }));
  asset.layers = [structuredClone(asset.layers[0])];
  asset.parts = [{ ...asset.parts[0], layerIds: [asset.layers[0].id] }];
  asset.anchors = [
    {
      id: 'anchor_foot',
      name: 'foot',
      role: 'foot',
      position: { x: 32, y: 56 },
    },
  ];
  asset.colliders = [
    {
      id: 'col_body',
      name: 'body',
      purpose: 'body',
      shape: 'rect',
      visible: true,
      rect: { x: 16, y: 12, width: 32, height: 44 },
    },
  ];
  asset.frames = structuredClone(baseAsset.frames);
  asset.animations = structuredClone(baseAsset.animations);
  asset.tags = ['G14', assetType];
  asset.gameAttributes = { fixture: id };
  asset.createdAt = FIXED_AT;
  asset.updatedAt = FIXED_AT;
  delete asset.tile;
  delete asset.gimmick;
  delete asset.effect;
  delete asset.rigAnimations;

  if (assetType === 'character') {
    if (id === 'G14-P1-character-normal') {
      asset.animations[0].frameIds = ['frame_idle_0', 'frame_idle_1', 'frame_idle_0'];
      const repeatedFrame = asset.frames?.find((frame) => frame.id === 'frame_idle_0');
      if (repeatedFrame) {
        repeatedFrame.durationMs = 10_000;
      }
    }
    asset.frames![0].colliderOverrides = [
      {
        colliderId: 'col_body',
        rect: { x: 18, y: 14, width: 28, height: 40 },
        visible: false,
      },
    ];
    asset.tags.push('G14-EXPORT-atlas-reject');
  } else if (assetType === 'background') {
    asset.layers[0].background = {
      role: 'mid',
      parallaxSpeed: { x: 0.5, y: 0 },
      loopX: true,
      loopY: false,
    };
  } else if (assetType === 'tile') {
    asset.tile = {
      tileSize: { width: 64, height: 64 },
      collisionType: 'solid',
      visualType: 'floor',
    };
  } else if (assetType === 'gimmick') {
    asset.gimmick = { movementPreset: 'horizontal' };
  } else if (assetType === 'effect') {
    asset.effect = {
      effectType: 'spark',
      durationMs: 500,
      loop: true,
      blendMode: 'add',
    };
  }
  return asset;
}

function emptyFamilyIdMap() {
  return {
    textures: {},
    layers: {},
    parts: {},
    anchors: {},
    colliders: {},
    frames: {},
    animations: {},
  };
}

function emptyFamilyWriteSet() {
  return {
    textures: [],
    layers: [],
    parts: [],
    anchors: [],
    colliders: [],
    frames: [],
    animations: [],
    blobPaths: [],
  };
}

async function buildFixture(): Promise<FixtureBundle> {
  const [assetText, harnessHtml, harnessSource] = await Promise.all([
    readFile('src/core/samples/asset.character.json', 'utf8'),
    readFile('tools/game-check-e2e/index.html'),
    readFile('tools/game-check-e2e/main.tsx'),
  ]);
  const baseAsset = JSON.parse(assetText) as Asset;
  const assets = NORMAL_FIXTURES.map((fixture) => normalAsset(baseAsset, fixture.id, fixture.type));
  const linkedId = 'G14-I1-linked-direct';
  const manualId = 'G14-I1-manual-unassessed';
  assets.push(normalAsset(baseAsset, linkedId, 'character'));
  assets.push(normalAsset(baseAsset, manualId, 'character'));

  const project: Project = {
    format: 'chameleon-project',
    version: '0.1.0',
    id: 'G14-project-fixture',
    name: PROJECT_NAME,
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      displayName: asset.displayName,
      assetType: asset.assetType,
    })),
    families: [
      {
        id: 'G14-I1-family',
        name: 'G14 Impact direct and manual fixtures',
        baseAssetId: 'G14-P1-character-normal',
        variants: [
          {
            assetId: linkedId,
            kind: 'linked-mirror',
            recipe: {
              type: 'mirror',
              idMap: emptyFamilyIdMap(),
              writeSet: emptyFamilyWriteSet(),
            },
            fingerprint: {
              base: 'sha256:g14-base',
              variant: 'sha256:g14-linked',
              syncedAt: FIXED_AT,
            },
          },
          { assetId: manualId, kind: 'manual' },
        ],
      },
    ],
    createdAt: FIXED_AT,
    updatedAt: FIXED_AT,
  };

  const entries: Record<string, Uint8Array> = {
    'project.json': strToU8(JSON.stringify(project)),
    'README.md': strToU8('G14 browser acceptance fixture\n'),
  };
  for (const asset of assets) {
    entries[`assets/${asset.id}/asset.json`] = strToU8(JSON.stringify(asset));
    for (const texture of asset.textures) {
      entries[`assets/${asset.id}/${texture.path}`] = FIXTURE_PNG;
    }
  }
  const bytes = zipSync(entries, { level: 9, mtime: new Date(FIXED_AT) });
  const browserHarnessEntries = [
    { path: 'src/core/samples/asset.character.json', bytes: Buffer.from(assetText) },
    { path: 'tools/game-check-e2e/index.html', bytes: harnessHtml },
    { path: 'tools/game-check-e2e/main.tsx', bytes: harnessSource },
  ].map(({ path, bytes: harnessBytes }) => ({
    path,
    byteLength: harnessBytes.byteLength,
    sha256: sha256(harnessBytes),
  }));
  return {
    buffer: Buffer.from(bytes),
    evidence: {
      ...archiveEvidence(bytes),
      fixtureIds: [...ACCEPTANCE_FIXTURE_IDS],
      evidenceIds: [
        'G14-EXPORT-atlas-reject',
        'game-check-mode-375x667',
        'before-no-save-snapshot',
        'after-no-save-snapshot',
        'reload-no-save-snapshot',
      ],
      browserHarness: {
        entries: browserHarnessEntries,
        manifestSha256: sha256(strToU8(JSON.stringify(browserHarnessEntries))),
        fixtureIds: [...NEGATIVE_FIXTURE_IDS, ...MATRIX_FIXTURE_IDS],
      },
    },
  };
}

async function importFixture(page: Page, fixture: FixtureBundle): Promise<void> {
  await page.getByLabel('.casproj を読み込む').setInputFiles({
    name: `${PROJECT_NAME}.casproj`,
    mimeType: 'application/zip',
    buffer: fixture.buffer,
  });
  const openButton = page.getByRole('button', { name: `「${PROJECT_NAME}」を開く` });
  await expect(openButton).toBeVisible();
  await openButton.click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

async function selectAsset(page: Page, displayName: string): Promise<void> {
  await page
    .locator('.editor-mobile-nav')
    .getByRole('button', { name: 'プロパティ', exact: true })
    .click();
  const assetButton = page.locator('.asset-list').getByRole('button', {
    name: displayName,
    exact: true,
  });
  await assetButton.scrollIntoViewIfNeeded();
  await assetButton.click();
  await expect(assetButton).toHaveAttribute('aria-pressed', 'true');
}

async function openGameCheck(
  page: Page,
  key: 'click' | 'Enter' | 'Space' = 'click',
): Promise<void> {
  const button = page.getByRole('button', { name: 'ゲーム確認', exact: true });
  await expect(button).toBeEnabled();
  if (key === 'click') {
    await button.click();
  } else {
    await button.focus();
    await page.keyboard.press(key);
  }
  await expect(page.getByRole('main', { name: 'ゲーム確認' })).toBeVisible();
}

async function downloadBytes(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) {
    throw new Error(`download pathを取得できません: ${download.suggestedFilename()}`);
  }
  return readFile(path);
}

async function triggerDownload(page: Page, buttonName: string): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ]);
  return downloadBytes(download);
}

async function installFixedArchiveClock(page: Page): Promise<void> {
  await page.evaluate((fixedAt) => {
    const scope = window as typeof window & { __g14NativeDate?: DateConstructor };
    const NativeDate = scope.__g14NativeDate ?? Date;
    scope.__g14NativeDate = NativeDate;
    class FixedDate extends NativeDate {
      constructor(...args: unknown[]) {
        super(args.length === 0 ? fixedAt : (args[0] as string | number));
      }

      static now(): number {
        return new NativeDate(fixedAt).getTime();
      }
    }
    Object.setPrototypeOf(FixedDate, NativeDate);
    globalThis.Date = FixedDate as DateConstructor;
  }, FIXED_AT);
}

async function restoreArchiveClock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as typeof window & { __g14NativeDate?: DateConstructor };
    if (scope.__g14NativeDate) {
      globalThis.Date = scope.__g14NativeDate;
      delete scope.__g14NativeDate;
    }
  });
}

async function captureExports(page: Page): Promise<ExportEvidence> {
  await installFixedArchiveClock(page);
  try {
    await page
      .locator('.editor-mobile-nav')
      .getByRole('button', { name: '書き出し', exact: true })
      .click();
    const assetJson = await triggerDownload(page, 'asset.json をダウンロード');
    const casproj = await triggerDownload(page, '.casproj をダウンロード');
    return {
      assetJson: { byteLength: assetJson.byteLength, sha256: sha256(assetJson) },
      casproj: archiveEvidence(casproj),
    };
  } finally {
    await restoreArchiveClock(page);
  }
}

async function readStorageSnapshot(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const digest = async (bytes: ArrayBuffer): Promise<string> => {
      const value = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    };
    const normalize = async (value: unknown): Promise<unknown> => {
      if (value === undefined) return { __type: 'undefined' };
      if (value === null || typeof value === 'string' || typeof value === 'number') return value;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'bigint') return { __type: 'bigint', value: value.toString() };
      if (value instanceof Date) return { __type: 'Date', value: value.toISOString() };
      if (value instanceof Blob) {
        const bytes = await value.arrayBuffer();
        return {
          __type: 'Blob',
          type: value.type,
          byteLength: bytes.byteLength,
          sha256: await digest(bytes),
        };
      }
      if (value instanceof ArrayBuffer) {
        return {
          __type: 'ArrayBuffer',
          byteLength: value.byteLength,
          sha256: await digest(value.slice(0)),
        };
      }
      if (ArrayBuffer.isView(value)) {
        const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
        return {
          __type: value.constructor.name,
          byteLength: value.byteLength,
          sha256: await digest(bytes),
        };
      }
      if (Array.isArray(value)) return Promise.all(value.map(normalize));
      if (value instanceof Map) {
        const entries = await Promise.all(
          [...value.entries()].map(async ([key, entryValue]) => [
            await normalize(key),
            await normalize(entryValue),
          ]),
        );
        return { __type: 'Map', entries };
      }
      if (value instanceof Set) {
        return { __type: 'Set', values: await Promise.all([...value].map(normalize)) };
      }
      if (typeof value === 'object') {
        const source = value as Record<string, unknown>;
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(source).sort()) {
          result[key] = await normalize(source[key]);
        }
        return result;
      }
      return { __type: typeof value, value: String(value) };
    };
    const requestResult = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const databases = (await indexedDB.databases())
      .filter((database): database is IDBDatabaseInfo & { name: string } => !!database.name)
      .sort((left, right) => left.name.localeCompare(right.name));
    const result: Record<string, unknown> = {};
    for (const databaseInfo of databases) {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseInfo.name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const storeSnapshot: Record<string, unknown> = {};
      for (const storeName of [...database.objectStoreNames].sort()) {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const [keys, values] = await Promise.all([
          requestResult(store.getAllKeys()),
          requestResult(store.getAll()),
        ]);
        storeSnapshot[storeName] = {
          keys: await normalize(keys),
          values: await normalize(values),
        };
      }
      result[databaseInfo.name] = {
        version: database.version,
        stores: storeSnapshot,
      };
      database.close();
    }
    return result;
  });
}

async function captureEditorUiState(page: Page): Promise<EditorUiState> {
  const readButton = async (button: Locator) => ({
    disabled: await button.isDisabled(),
    title: await button.getAttribute('title'),
  });
  const diagnosticSnapshots = await page.locator('.editor').evaluate((editor) => {
    const history = editor.getAttribute('data-history-snapshot');
    const autosave = editor.getAttribute('data-autosave-snapshot');
    if (!history || !autosave) {
      throw new Error('History / autosave snapshot属性がありません');
    }
    return { history: JSON.parse(history), autosave: JSON.parse(autosave) };
  });
  return {
    saveStatus: (await page.locator('.editor-save-status').textContent())?.trim() ?? '',
    undo: await readButton(page.getByRole('button', { name: '元に戻す', exact: true })),
    redo: await readButton(page.getByRole('button', { name: 'やり直す', exact: true })),
    ...diagnosticSnapshots,
    ...((await page.evaluate(() => ({
      localStorage: Object.entries(localStorage).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
      sessionStorage: Object.entries(sessionStorage).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    }))) satisfies Pick<EditorUiState, 'localStorage' | 'sessionStorage'>),
  };
}

async function installBlobUrlAudit(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const active = new Set<string>();
    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = originalCreate(object);
      active.add(url);
      created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      active.delete(url);
      revoked.push(url);
      originalRevoke(url);
    };
    Object.defineProperty(window, '__g14BlobUrlAudit', {
      value: { active, created, revoked },
      configurable: false,
      enumerable: false,
      writable: false,
    });
  });
}

async function readBlobUrlAudit(page: Page) {
  return page.evaluate(() => {
    const audit = (
      window as typeof window & {
        __g14BlobUrlAudit?: {
          active: Set<string>;
          created: string[];
          revoked: string[];
        };
      }
    ).__g14BlobUrlAudit;
    return {
      activeCount: audit?.active.size ?? 0,
      createdCount: audit?.created.length ?? 0,
      revokedCount: audit?.revoked.length ?? 0,
    };
  });
}

async function waitForBlobUrlsSettled(page: Page): Promise<void> {
  await expect.poll(async () => (await readBlobUrlAudit(page)).activeCount).toBe(0);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const selectors = [
      'main.game-check-mode',
      '.game-check-layout',
      '.game-check-preview-section',
      '.game-check-controls',
      '.game-check-card',
    ];
    const overflowingElements = selectors.flatMap((selector) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .filter((element) => element.getClientRects().length > 0)
        .filter((element) => element.scrollWidth - element.clientWidth > 1)
        .map((element) => ({
          selector,
          label: element.getAttribute('aria-label') ?? element.tagName,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
    );
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      overflowingElements,
    };
  });
  expect(layout.documentOverflow).toBeLessThanOrEqual(1);
  expect(layout.overflowingElements).toEqual([]);
}

async function expectMinimumTargets(page: Page): Promise<void> {
  const undersized = await page.locator('main.game-check-mode').evaluate((main) => {
    const selectors = [
      'button:not(:disabled)',
      'select:not(:disabled)',
      'input[type="range"]:not(:disabled)',
      'label.game-check-checkbox',
      'summary',
    ];
    return [...main.querySelectorAll<HTMLElement>(selectors.join(','))]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({
        label: element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName,
        height: element.getBoundingClientRect().height,
      }))
      .filter((entry) => entry.height < 44);
  });
  expect(undersized).toEqual([]);
  const textInputs = page.locator(
    'main.game-check-mode input:not([type="checkbox"]):not([type="range"]):not([type="button"]):not([type="submit"])',
  );
  await expect(textInputs).toHaveCount(0);
  const selectFontSizes = await page
    .locator('main.game-check-mode select')
    .evaluateAll((elements) =>
      elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    );
  expect(selectFontSizes.every((fontSize) => fontSize >= 16)).toBe(true);
}

async function scrollToFooterInsideMode(page: Page): Promise<void> {
  const metrics = await page.locator('main.game-check-mode').evaluate((mode) => {
    mode.scrollTop = mode.scrollHeight;
    return {
      clientHeight: mode.clientHeight,
      scrollHeight: mode.scrollHeight,
      scrollTop: mode.scrollTop,
    };
  });
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  expect(metrics.scrollTop).toBeGreaterThan(0);
  await expect(
    page.locator('.game-check-footer').getByRole('button', {
      name: 'Editorへ戻る',
      exact: true,
    }),
  ).toBeVisible();
}

function expectCanonicalExportsEqual(actual: ExportEvidence, expected: ExportEvidence): void {
  expect(actual).toEqual(expected);
}

test.describe('Group 14 Game Check Mode', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test('game-check-mode-375x667: 6種Preview・操作・a11y・no-save oracleを固定する', async ({
    page,
  }, testInfo) => {
    await installBlobUrlAudit(page);
    await page.goto('/');
    const fixture = await buildFixture();
    await attachJson(testInfo, 'G14-fixture-hash.json', fixture.evidence);
    await importFixture(page, fixture);

    await selectAsset(page, 'G14-P1-character-normal');
    const beforeExports = await captureExports(page);
    await waitForBlobUrlsSettled(page);
    const beforeStorage = await readStorageSnapshot(page);
    const beforeUi = await captureEditorUiState(page);
    expect(beforeUi.history.pendingPush).toBe(false);
    expect(beforeUi.autosave).toMatchObject({
      hasTimer: false,
      hasPendingTask: false,
      isRunning: false,
    });
    const beforeBlobUrls = await readBlobUrlAudit(page);
    await attachJson(testInfo, 'G14-before-no-save-snapshot.json', {
      storage: beforeStorage,
      editor: beforeUi,
      blobUrls: beforeBlobUrls,
      exports: beforeExports,
    });

    let gameCheckDownloadCount = 0;
    const countDownload = () => {
      gameCheckDownloadCount += 1;
    };
    page.on('download', countDownload);

    for (const [index, fixtureCase] of NORMAL_FIXTURES.entries()) {
      await selectAsset(page, fixtureCase.id);
      await openGameCheck(page, index === 0 ? 'Enter' : index === 1 ? 'Space' : 'click');
      await expect(
        page.getByRole('heading', { name: `ゲーム確認：${fixtureCase.id}` }),
      ).toBeVisible();
      await expect(page.getByRole('main', { name: 'ゲーム確認' })).toHaveAttribute(
        'aria-busy',
        'false',
      );
      await expect(
        page.getByRole('status').filter({ hasText: fixtureCase.typeLabel }),
      ).toBeVisible();
      await expect(page.getByText(fixtureCase.detail).first()).toBeVisible();
      await expect(page.getByText(/物理演算・engine固有挙動/)).toBeVisible();
      await expect(page.getByText(/Blobが見つかりません/)).toHaveCount(0);
      await expectNoHorizontalOverflow(page);

      if (fixtureCase.type === 'character') {
        const entryButton = page.getByRole('button', { name: 'ゲーム確認', exact: true });
        const closeButton = page.locator('.game-check-header').getByRole('button', {
          name: 'Editorへ戻る',
          exact: true,
        });
        await expect(closeButton).toBeFocused();
        await expect(page.getByRole('checkbox', { name: '実効collider' })).toBeChecked();
        const playButton = page.getByRole('button', { name: '再生', exact: true });
        await playButton.click();
        await expect(page.getByRole('button', { name: '停止', exact: true })).toBeVisible();
        await page.getByRole('button', { name: '停止', exact: true }).click();

        const frameSelect = page.getByLabel('Preview Frame');
        await frameSelect.focus();
        const priorFrame = await frameSelect.inputValue();
        await page.keyboard.press('ArrowDown');
        await expect(frameSelect).not.toHaveValue(priorFrame);
        await frameSelect.selectOption('');
        await expect(page.getByRole('status').filter({ hasText: 'Frame：未設定' })).toBeVisible();
        await frameSelect.selectOption('frame_idle_0');

        const scrub = page.getByLabel('再生位置');
        await scrub.focus();
        await scrub.fill('2');
        await expect(scrub).toHaveValue('2');
        await expect(frameSelect).toHaveValue('frame_idle_0');
        await playButton.click();
        await expect(scrub).toHaveValue('2');
        await page.getByRole('button', { name: '停止', exact: true }).click();
        await scrub.focus();
        await page.keyboard.press('ArrowLeft');
        await expect(scrub).toHaveValue('1');

        const anchorToggle = page.getByRole('checkbox', { name: 'anchor', exact: true });
        await anchorToggle.focus();
        await page.keyboard.press('Space');
        await expect(anchorToggle).not.toBeChecked();
        const colliderToggle = page.getByRole('checkbox', {
          name: '実効collider',
          exact: true,
        });
        await colliderToggle.focus();
        await page.keyboard.press('Space');
        await expect(colliderToggle).not.toBeChecked();

        const impactToggle = page.getByRole('button', { name: /変更影響（Impact）/ });
        await impactToggle.focus();
        await page.keyboard.press('Enter');
        await expect(impactToggle).toHaveAttribute('aria-expanded', 'false');
        await page.keyboard.press('Enter');
        await expect(impactToggle).toHaveAttribute('aria-expanded', 'true');
        await expect(page.getByText(/G14-I1-family/).first()).toBeVisible();
        await expect(page.getByText(/manual variant/).first()).toBeVisible();
        await expect(page.getByText(/既存状態: 更新不可 \[ineligible\]/).first()).toBeVisible();
        await expect(
          page.getByText(/frameIds\[0\].*frames\[id=frame_idle_0\]/).first(),
        ).toBeVisible();
        await expect(page.getByText(/Frame別collider/).first()).toBeVisible();
        await expect(page.getByText(/状態：/).first()).toBeVisible();
        await expect(page.getByText(/未確認：/).first()).toBeVisible();
        await expect(page.getByText(/再確認条件：/).first()).toBeVisible();

        const impactKindFilter = page.getByLabel('Impact種類');
        await impactKindFilter.selectOption('variant');
        await expect(
          page.getByRole('status').filter({ hasText: /Impact表示：\d+ \/ \d+件/ }),
        ).toBeVisible();
        const impactSelection = page.getByRole('button', { name: /Impact行を選択：/ }).first();
        await impactSelection.click();
        await expect(impactSelection).toHaveAttribute('aria-pressed', 'true');
        await impactKindFilter.selectOption('all');

        await closeButton.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(closeButton).toBeFocused();
        expect(
          await closeButton.evaluate(
            (element) =>
              element.matches(':focus-visible') &&
              getComputedStyle(element).outlineStyle !== 'none',
          ),
        ).toBe(true);

        await expectMinimumTargets(page);
        await testInfo.attach('G14-game-check-375x667.png', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
        await page.keyboard.press('Escape');
        await expect(page.locator('.editor')).toBeVisible();
        await expect(entryButton).toBeFocused();
        continue;
      }

      if (fixtureCase.type === 'background') {
        await expect(page.getByText(/loopX.*no loopY/).first()).toBeVisible();
        const parallax = page.getByLabel('parallax位置');
        await parallax.focus();
        const prior = await parallax.inputValue();
        await page.keyboard.press('ArrowRight');
        await expect(parallax).not.toHaveValue(prior);
      }
      if (fixtureCase.type === 'tile') {
        await expect(page.getByText(/中央と周囲8セル/).first()).toBeVisible();
        const tileCanvas = page.getByLabel('ゲーム風プレビューキャンバス');
        const repeatedCanvas = await tileCanvas.screenshot();
        const typeOverlayToggle = page.getByRole('checkbox', {
          name: '種別固有の説明表示',
          exact: true,
        });
        await typeOverlayToggle.uncheck();
        await expect(
          page.getByRole('status').filter({ hasText: /非表示（UI-only）/ }),
        ).toBeVisible();
        await expect
          .poll(async () => sha256(await tileCanvas.screenshot()))
          .not.toBe(sha256(repeatedCanvas));
        const singleCanvas = await tileCanvas.screenshot();
        expect(sha256(singleCanvas)).not.toBe(sha256(repeatedCanvas));
        await testInfo.attach('G14-tile-single-overlay-off-375x667.png', {
          body: singleCanvas,
          contentType: 'image/png',
        });
        await typeOverlayToggle.check();
        await testInfo.attach('G14-tile-3x3-375x667.png', {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
      if (fixtureCase.type === 'effect') {
        await expect(page.getByText(/Preview再生はFrame \/ Animation/)).toBeVisible();
        await page.getByRole('button', { name: '再生', exact: true }).click();
        await expect(page.getByRole('button', { name: '停止', exact: true })).toBeVisible();
        await page.getByRole('button', { name: '停止', exact: true }).click();
      }
      await expectMinimumTargets(page);
      await scrollToFooterInsideMode(page);
      await page
        .locator('.game-check-footer')
        .getByRole('button', { name: 'Editorへ戻る', exact: true })
        .click();
      await expect(page.locator('.editor')).toBeVisible();
    }

    page.off('download', countDownload);
    expect(gameCheckDownloadCount).toBe(0);

    await selectAsset(page, 'G14-P1-character-normal');
    await page
      .locator('.editor-mobile-nav')
      .getByRole('button', { name: '書き出し', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'ZIP をダウンロード' })).toBeDisabled();
    await expect(
      page.getByRole('alert').filter({ hasText: /Frame別の当たり判定情報/ }),
    ).toBeVisible();
    const afterExports = await captureExports(page);
    await waitForBlobUrlsSettled(page);
    const afterStorage = await readStorageSnapshot(page);
    const afterUi = await captureEditorUiState(page);
    const afterBlobUrls = await readBlobUrlAudit(page);
    expect(afterStorage).toEqual(beforeStorage);
    expect(afterUi).toEqual(beforeUi);
    expect(afterBlobUrls.activeCount).toBe(beforeBlobUrls.activeCount);
    expectCanonicalExportsEqual(afterExports, beforeExports);
    await attachJson(testInfo, 'G14-after-no-save-snapshot.json', {
      storage: afterStorage,
      editor: afterUi,
      blobUrls: afterBlobUrls,
      exports: afterExports,
      gameCheckDownloadCount,
      exportBoundary: {
        id: 'G14-EXPORT-atlas-reject',
        zipBytesGenerated: 0,
      },
      rawCasprojHashNote:
        'fixed archive clockでentry timestampを固定し、raw ZIP bytesも合否比較する。',
    });

    await page.reload();
    const reopenButton = page.getByRole('button', { name: `「${PROJECT_NAME}」を開く` });
    await expect(reopenButton).toBeVisible();
    await reopenButton.click();
    await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
    await selectAsset(page, 'G14-P1-character-normal');
    const reloadExports = await captureExports(page);
    await waitForBlobUrlsSettled(page);
    const reloadStorage = await readStorageSnapshot(page);
    const reloadUi = await captureEditorUiState(page);
    const reloadBlobUrls = await readBlobUrlAudit(page);
    expect(reloadStorage).toEqual(beforeStorage);
    expect(reloadUi).toEqual(beforeUi);
    expect(reloadBlobUrls.activeCount).toBe(0);
    expectCanonicalExportsEqual(reloadExports, beforeExports);
    await attachJson(testInfo, 'G14-reload-no-save-snapshot.json', {
      storage: reloadStorage,
      editor: reloadUi,
      blobUrls: reloadBlobUrls,
      exports: reloadExports,
    });
  });

  test('invalid・未設定・参照切れ・missing Blob・decode failureを理由表示し、落ちない', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const cases: ReadonlyArray<{ id: string; expected: RegExp }> = [
      { id: 'G14-P1-invalid-collider', expected: /shape|形状/ },
      { id: 'G14-P1-dangling-reference', expected: /G14-P1-missing-frame|G14-P1-missing-texture/ },
      { id: 'G14-P1-missing-blob', expected: /Blobが見つかりません/ },
      { id: 'G14-P1-decode-failure', expected: /デコードできません/ },
      { id: 'G14-P1-character-unset', expected: /originが未設定/ },
    ];
    for (const fixtureCase of cases) {
      await page.goto(
        `/tools/game-check-e2e/index.html?fixture=${encodeURIComponent(fixtureCase.id)}`,
      );
      await expect(page.getByRole('main', { name: 'ゲーム確認' })).toBeVisible();
      await expect(page.getByLabel('不足・不正・表示不能の理由')).toContainText(
        fixtureCase.expected,
      );
      await expectNoHorizontalOverflow(page);
    }

    await page.goto('/tools/game-check-e2e/index.html?fixture=G14-P1-background-invalid');
    await expect(page.getByLabel('不足・不正・表示不能の理由')).toContainText(/parallax/);
    const parallax = page.getByLabel('parallax位置');
    await parallax.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('main', { name: 'ゲーム確認' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  for (const assetType of MATRIX_ASSET_TYPES) {
    test(`§9 fixture matrix: ${assetType}の未設定・Frame override・不正参照・画像不能・Atlas拒否`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const typeLabel = NORMAL_FIXTURES.find((fixture) => fixture.type === assetType)?.typeLabel;
      if (!typeLabel) {
        throw new Error(`assetType labelがありません: ${assetType}`);
      }

      for (const state of MATRIX_STATES) {
        await page.goto(`/tools/game-check-e2e/index.html?assetType=${assetType}&state=${state}`);
        await expect(page.getByRole('main', { name: 'ゲーム確認' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: typeLabel })).toBeVisible();
        await expectNoHorizontalOverflow(page);

        if (state === 'unset') {
          await expect(page.getByLabel('不足・不正・表示不能の理由')).toContainText(
            /originが未設定/,
          );
        } else if (state === 'frame-override') {
          await expect(page.getByText(/Frame別collider/).first()).toBeVisible();
          await expect(page.getByRole('checkbox', { name: '実効collider' })).toBeChecked();
        } else if (state === 'dangling-invalid') {
          await expect(page.getByLabel('不足・不正・表示不能の理由')).toContainText(
            /missing-frame|missing-texture|参照/,
          );
          await expect(page.getByRole('button', { name: '再生', exact: true })).toBeDisabled();
          await expect(page.getByRole('status').filter({ hasText: '停止中' })).toBeVisible();
        } else if (state === 'missing-or-decode') {
          await expect(page.getByLabel('不足・不正・表示不能の理由')).toContainText(
            /Blobが見つかりません|デコードできません/,
          );
        } else {
          await expect(page.getByText(/既存境界で拒否されます/).first()).toBeVisible();
        }
      }
      expect(errors).toEqual([]);
    });
  }

  test('reduced-motionでは自動再生を止め、情報表示を維持する', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/tools/game-check-e2e/index.html?fixture=G14-P1-missing-blob');
    await expect(page.getByRole('main', { name: 'ゲーム確認' })).toBeVisible();
    await expect(page.getByText(/reduced-motion設定のため自動再生を停止/)).toBeVisible();
    await expect(page.getByRole('button', { name: '再生', exact: true })).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: '停止中' })).toBeVisible();
    await expect(page.getByLabel('不足・不正・表示不能の理由')).toContainText(/Blob/);
  });

  test('Asset未選択時はゲーム確認へ入れず、理由を可視表示する', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('プロジェクト名').fill('G14-no-asset-entry');
    await page.getByRole('button', { name: '作成', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'G14-no-asset-entry' })).toBeVisible();

    const entryButton = page.getByRole('button', { name: 'ゲーム確認', exact: true });
    await expect(entryButton).toBeDisabled();
    await expect(entryButton).toHaveAttribute('aria-describedby', 'game-check-entry-reason');
    await expect(page.locator('#game-check-entry-reason')).toHaveText(
      'アセットを選択するとゲーム確認を開けます。',
    );
    await expectNoHorizontalOverflow(page);
  });
});
