import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from 'fflate';
import type { Asset, ExportPresetFile, Project } from '../model';
import { MigrationError, migrateAsset, migrateExportPresets, migrateProject } from '../model';
import { validateAsset, validateExportPresets, validateProject } from '../schema/validate';

export type CasprojErrorCode =
  | 'invalid-archive'
  | 'missing-project'
  | 'invalid-document'
  | 'unsupported-version'
  | 'incomplete-bundle'
  | 'inconsistent-bundle';

export class CasprojError extends Error {
  readonly code: CasprojErrorCode;

  constructor(
    message: string,
    options?: ErrorOptions & {
      code?: CasprojErrorCode;
    },
  ) {
    super(message, options);
    this.name = 'CasprojError';
    this.code = options?.code ?? 'invalid-document';
  }
}

/** `.casproj` 内のバイナリファイル 1 件。path は ZIP 内の相対パス。 */
export interface CasprojFileEntry {
  path: string;
  bytes: Uint8Array;
}

/** `.casproj` の内容一式。 */
export interface CasprojBundle {
  project: Project;
  assets: Asset[];
  exportPresets?: ExportPresetFile;
  /** 画像などのバイナリファイル（例: assets/asset_001/textures/main.png）。 */
  files: CasprojFileEntry[];
  readme?: string;
}

export interface CasprojImportResult {
  bundle: CasprojBundle;
  /** 古い形式から移行した場合の適用ログ。 */
  appliedMigrations: string[];
  /** 読み込みは継続するが、canonical保存前にユーザーへ伝えるべき互換上の問題。 */
  warnings: string[];
}

const PROJECT_JSON_PATH = 'project.json';
const EXPORT_PRESETS_PATH = 'settings/export-presets.json';
const README_PATH = 'README.md';
const ASSET_JSON_PATTERN = /^assets\/([^/]+)\/asset\.json$/;

const DEFAULT_README = [
  '# Chameleon Asset Studio プロジェクト',
  '',
  'このファイルは Chameleon Asset Studio の `.casproj`（ZIP 形式）です。',
  '`project.json` と `assets/*/asset.json` にゲーム用メタデータが入っています。',
  '',
].join('\n');

function zipAsync(data: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(data, (error, output) => {
      if (error) {
        reject(new CasprojError('ZIP の作成に失敗しました', { cause: error }));
      } else {
        resolve(output);
      }
    });
  });
}

function unzipAsync(bytes: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(bytes, (error, output) => {
      if (error) {
        reject(
          new CasprojError('ZIP として読み込めませんでした', {
            cause: error,
            code: 'invalid-archive',
          }),
        );
      } else {
        resolve(output);
      }
    });
  });
}

/** '..' や先頭 '/' を含む危険なパスを弾く。 */
function isSafePath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\')) {
    return false;
  }
  return path.split('/').every((segment) => segment !== '' && segment !== '..' && segment !== '.');
}

function toJsonBytes(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJson(path: string, bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch (error) {
    throw new CasprojError(`${path} が JSON として読めません`, {
      cause: error,
      code: 'invalid-document',
    });
  }
}

function migrateForImport(
  path: string,
  migrate: () => { data: Record<string, unknown>; appliedMigrations: string[] },
): { data: Record<string, unknown>; appliedMigrations: string[] } {
  try {
    return migrate();
  } catch (error) {
    if (error instanceof MigrationError) {
      throw new CasprojError(`${path} を移行できません: ${error.message}`, {
        cause: error,
        code: 'unsupported-version',
      });
    }
    throw error;
  }
}

function assertBundleDocumentConsistency(project: Project, assets: Asset[]): void {
  const projectAssetIds = new Set<string>();
  for (const entry of project.assets) {
    if (projectAssetIds.has(entry.id)) {
      throw new CasprojError(`Projectに同じAsset IDが複数あります: ${entry.id}`, {
        code: 'inconsistent-bundle',
      });
    }
    projectAssetIds.add(entry.id);
  }

  const assetsById = new Map<string, Asset>();
  for (const asset of assets) {
    if (assetsById.has(asset.id)) {
      throw new CasprojError(`同じAsset IDが複数あります: ${asset.id}`, {
        code: 'inconsistent-bundle',
      });
    }
    assetsById.set(asset.id, asset);
  }

  for (const entry of project.assets) {
    const asset = assetsById.get(entry.id);
    if (!asset) {
      throw new CasprojError(`Projectが参照するAssetがありません: ${entry.id}`, {
        code: 'incomplete-bundle',
      });
    }
    if (
      entry.name !== asset.name ||
      entry.assetType !== asset.assetType ||
      entry.displayName !== asset.displayName
    ) {
      throw new CasprojError(`ProjectのAsset summaryとAssetが一致しません: ${asset.id}`, {
        code: 'inconsistent-bundle',
      });
    }
  }
  for (const asset of assets) {
    if (!projectAssetIds.has(asset.id)) {
      throw new CasprojError(`Projectから参照されないAssetがあります: ${asset.id}`, {
        code: 'inconsistent-bundle',
      });
    }
  }
}

/** `.casproj`（ZIP）を生成する。書き出し前に schema 検証を行う（要件 14）。 */
export async function exportCasproj(bundle: CasprojBundle): Promise<Blob> {
  const projectResult = validateProject(bundle.project);
  if (!projectResult.valid) {
    throw new CasprojError(`project.json の内容が不正です: ${projectResult.errors.join(' / ')}`);
  }
  for (const asset of bundle.assets) {
    const assetResult = validateAsset(asset);
    if (!assetResult.valid) {
      throw new CasprojError(
        `asset（id: ${asset.id}）の内容が不正です: ${assetResult.errors.join(' / ')}`,
      );
    }
  }
  if (bundle.exportPresets) {
    const presetsResult = validateExportPresets(bundle.exportPresets);
    if (!presetsResult.valid) {
      throw new CasprojError(
        `export-presets.json の内容が不正です: ${presetsResult.errors.join(' / ')}`,
      );
    }
  }
  assertBundleDocumentConsistency(bundle.project, bundle.assets);

  // 画像欠けの .casproj は復元不能になるため、全 TextureRef に対応するファイルが
  // 揃っていることを書き出し時点で保証する（Phase 15.5-A）。
  const filePaths = new Set<string>();
  for (const file of bundle.files) {
    if (filePaths.has(file.path)) {
      throw new CasprojError(`同じファイルパスが複数あります: ${file.path}`, {
        code: 'inconsistent-bundle',
      });
    }
    if (
      file.path === PROJECT_JSON_PATH ||
      file.path === EXPORT_PRESETS_PATH ||
      file.path === README_PATH ||
      ASSET_JSON_PATTERN.test(file.path)
    ) {
      throw new CasprojError(`予約済みファイルパスは上書きできません: ${file.path}`, {
        code: 'inconsistent-bundle',
      });
    }
    filePaths.add(file.path);
  }
  for (const asset of bundle.assets) {
    for (const texture of asset.textures) {
      const expectedPath = `assets/${asset.id}/${texture.path}`;
      if (!filePaths.has(expectedPath)) {
        throw new CasprojError(
          `画像 Blob が見つかりません: asset=${asset.id} texture=${texture.id} path=${texture.path}（.casproj 書き出し）`,
        );
      }
    }
  }

  const entries: Zippable = {
    [PROJECT_JSON_PATH]: toJsonBytes(bundle.project),
    [README_PATH]: strToU8(bundle.readme ?? DEFAULT_README),
  };
  for (const asset of bundle.assets) {
    entries[`assets/${asset.id}/asset.json`] = toJsonBytes(asset);
  }
  if (bundle.exportPresets) {
    entries[EXPORT_PRESETS_PATH] = toJsonBytes(bundle.exportPresets);
  }
  for (const file of bundle.files) {
    if (!isSafePath(file.path)) {
      throw new CasprojError(`ファイルパスが不正です: ${file.path}`);
    }
    entries[file.path] = file.bytes;
  }

  const zipped = await zipAsync(entries);
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

async function toUint8Array(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  return new Uint8Array(await input.arrayBuffer());
}

/**
 * `.casproj`（ZIP）を読み込む。
 * project.json と各 asset.json は migrate と schema 検証を通し、
 * 不正なデータはどの項目が不正かが分かる CasprojError にする。
 */
export async function importCasproj(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<CasprojImportResult> {
  const bytes = await toUint8Array(input);
  const unzipped = await unzipAsync(bytes);
  const appliedMigrations: string[] = [];

  const projectBytes = unzipped[PROJECT_JSON_PATH];
  if (!projectBytes) {
    throw new CasprojError(
      'project.json が見つかりません。casproj ファイルではない可能性があります',
      { code: 'missing-project' },
    );
  }
  const projectMigration = migrateForImport(PROJECT_JSON_PATH, () =>
    migrateProject(parseJson(PROJECT_JSON_PATH, projectBytes)),
  );
  appliedMigrations.push(
    ...projectMigration.appliedMigrations.map((entry) => `${PROJECT_JSON_PATH}: ${entry}`),
  );
  const projectResult = validateProject(projectMigration.data);
  if (!projectResult.valid) {
    throw new CasprojError(`project.json の内容が不正です: ${projectResult.errors.join(' / ')}`);
  }
  const project = projectMigration.data as unknown as Project;

  const assets: Asset[] = [];
  let exportPresets: ExportPresetFile | undefined;
  let readme: string | undefined;
  const files: CasprojFileEntry[] = [];
  const assetIds = new Set<string>();

  for (const [path, entryBytes] of Object.entries(unzipped)) {
    if (path === PROJECT_JSON_PATH) {
      continue;
    }
    if (path.endsWith('/')) {
      continue;
    }
    if (!isSafePath(path)) {
      continue;
    }
    const assetMatch = ASSET_JSON_PATTERN.exec(path);
    if (assetMatch) {
      const assetMigration = migrateForImport(path, () =>
        migrateAsset(parseJson(path, entryBytes)),
      );
      appliedMigrations.push(
        ...assetMigration.appliedMigrations.map((entry) => `${path}: ${entry}`),
      );
      const assetResult = validateAsset(assetMigration.data);
      if (!assetResult.valid) {
        throw new CasprojError(`${path} の内容が不正です: ${assetResult.errors.join(' / ')}`);
      }
      const importedAsset = assetMigration.data as unknown as Asset;
      if (assetMatch[1] !== importedAsset.id) {
        throw new CasprojError(
          `${path} のdirectory ID（${assetMatch[1]}）とAsset ID（${importedAsset.id}）が一致しません`,
          { code: 'inconsistent-bundle' },
        );
      }
      if (assetIds.has(importedAsset.id)) {
        throw new CasprojError(`同じAsset IDのasset.jsonが複数あります: ${importedAsset.id}`, {
          code: 'inconsistent-bundle',
        });
      }
      assetIds.add(importedAsset.id);
      assets.push(importedAsset);
      continue;
    }
    if (path === EXPORT_PRESETS_PATH) {
      const presetsMigration = migrateForImport(path, () =>
        migrateExportPresets(parseJson(path, entryBytes)),
      );
      appliedMigrations.push(
        ...presetsMigration.appliedMigrations.map((entry) => `${path}: ${entry}`),
      );
      const presetsResult = validateExportPresets(presetsMigration.data);
      if (!presetsResult.valid) {
        throw new CasprojError(`${path} の内容が不正です: ${presetsResult.errors.join(' / ')}`);
      }
      exportPresets = presetsMigration.data as unknown as ExportPresetFile;
      continue;
    }
    if (path === README_PATH) {
      readme = strFromU8(entryBytes);
      continue;
    }
    files.push({ path, bytes: entryBytes });
  }

  // 画像ファイル欠落は互換のためエラーにしないが、警告として返す（Phase 17-B）
  const warnings: string[] = [];
  const filePaths = new Set(files.map((file) => file.path));
  for (const importedAsset of assets) {
    for (const texture of importedAsset.textures) {
      const expectedPath = `assets/${importedAsset.id}/${texture.path}`;
      if (!filePaths.has(expectedPath)) {
        warnings.push(
          `一部の画像が見つかりませんでした: asset=${importedAsset.id} texture=${texture.id} path=${texture.path}`,
        );
      }
    }
  }

  return {
    bundle: { project, assets, exportPresets, files, readme },
    appliedMigrations,
    warnings,
  };
}
