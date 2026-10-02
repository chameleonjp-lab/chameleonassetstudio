import {
  DEFAULT_RICH_DISTRIBUTION_SETTINGS,
  readRichDistributionSettings,
  withRichDistributionSettings,
} from '../model/exportPreset';
import { loadProjectBackup } from './projectBackup';
import { exportCasproj, importCasproj } from './casproj';
import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import type { ExportPresetFile } from '../model';
import { createEmptyProject } from '../model';
import presetsJson from '../samples/export-presets.sample.json';
import { resetDbForTests } from './db';
import {
  saveProject,
  saveProjectBundle,
  deleteProject,
  purgeTrash,
  loadBlob,
} from './projectStore';
import { restoreProject } from './projectRecovery';
import {
  exportSettingsKey,
  loadProjectExportPresets,
  saveProjectExportPresets,
} from './exportSettings';

beforeEach(resetDbForTests);
const presets = presetsJson as unknown as ExportPresetFile;

it('設定不在の旧Projectを読み、設定を保存・再読込・ごみ箱復元できる', async () => {
  const project = createEmptyProject('settings');
  await saveProject(project);
  expect(await loadProjectExportPresets(project.id)).toBeUndefined();
  await saveProjectExportPresets(project.id, presets);
  expect(await loadProjectExportPresets(project.id)).toEqual(presets);
  const backup = await exportCasproj(await loadProjectBackup(project.id));
  const decoded = await importCasproj(backup);
  expect(decoded.bundle.exportPresets).toEqual(presets);
  expect(decoded.bundle.project).toEqual(project);
  await deleteProject(project.id);
  await restoreProject(project.id);
  expect(await loadProjectExportPresets(project.id)).toEqual(presets);
  await deleteProject(project.id);
  await purgeTrash(project.id);
  expect(await loadBlob(exportSettingsKey(project.id))).toBeNull();
});

it('bundleの設定検査失敗はProjectも保存しない', async () => {
  const project = createEmptyProject('bad settings');
  await expect(saveProjectBundle(project, [], [], { ...presets, version: 'bad' })).rejects.toThrow(
    '出力設定が不正',
  );
  await expect(loadProjectExportPresets(project.id)).rejects.toThrow(
    'プロジェクトが見つかりません',
  );
});

it('新版の設定を追加しても旧設定を変更せず、バックアップ再取込で保持する', async () => {
  const project = createEmptyProject('rich settings');
  await saveProject(project);
  const settings = {
    format: 'distribution-0.2.0',
    profile: 'packed',
    padding: 7,
    target: 'phaser',
    scale: 3,
  } as const;
  const rich = withRichDistributionSettings(presets, settings);
  expect(rich.presets.slice(0, presets.presets.length)).toEqual(presets.presets);
  await saveProjectExportPresets(project.id, rich);
  expect(readRichDistributionSettings(await loadProjectExportPresets(project.id))).toEqual(
    settings,
  );
  const decoded = await importCasproj(await exportCasproj(await loadProjectBackup(project.id)));
  expect(decoded.bundle.exportPresets).toEqual(rich);
  await saveProjectBundle(
    decoded.bundle.project,
    decoded.bundle.assets,
    [],
    decoded.bundle.exportPresets,
  );
  expect(await loadProjectExportPresets(project.id)).toEqual(rich);
});

it('設定不在・旧設定では新版既定値を使い、同名の旧preset IDも上書きしない', () => {
  expect(readRichDistributionSettings()).toEqual(DEFAULT_RICH_DISTRIBUTION_SETTINGS);
  expect(readRichDistributionSettings(presets)).toEqual(DEFAULT_RICH_DISTRIBUTION_SETTINGS);
  const collision = { ...presets, presets: [{ ...presets.presets[0], id: 'rich-distribution' }] };
  const rich = withRichDistributionSettings(collision, { ...DEFAULT_RICH_DISTRIBUTION_SETTINGS });
  expect(rich.presets[0]).toEqual(collision.presets[0]);
  expect(rich.presets[1].id).toBe('rich-distribution-2');
  const updated = withRichDistributionSettings(rich, {
    ...DEFAULT_RICH_DISTRIBUTION_SETTINGS,
    padding: 4,
  });
  expect(updated.presets).toHaveLength(2);
  expect(updated.presets[0]).toEqual(collision.presets[0]);
  expect(updated.presets[1].distribution?.padding).toBe(4);
});

it.each([
  { padding: -1 },
  { padding: 1.5 },
  { padding: 65 },
  { scale: 0 },
  { scale: 4 },
  { target: 'unknown' },
  { profile: 'unknown' },
  { format: 'distribution-0.1.0' },
])('不正な新版設定を保存しない: %j', async (invalid) => {
  const project = createEmptyProject('invalid rich settings');
  await saveProject(project);
  const file = withRichDistributionSettings(undefined, { ...DEFAULT_RICH_DISTRIBUTION_SETTINGS });
  Object.assign(file.presets[0].distribution!, invalid);
  await expect(saveProjectExportPresets(project.id, file)).rejects.toThrow('出力設定が不正');
  expect(await loadProjectExportPresets(project.id)).toBeUndefined();
});
