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
