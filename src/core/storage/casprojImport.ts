import { generateId, type Asset, type Project, type ProjectAssetEntry } from '../model';
import {
  CasprojError,
  importCasproj as importCasprojBase,
  type CasprojFileEntry,
  type CasprojImportResult,
} from './casproj';
import { saveProjectBundle, type ProjectBundleBlobInput } from './projectStore';

const ASSET_FILE_PATTERN = /^assets\/([^/]+)\//;

/**
 * 旧 `.casproj` に Project から参照されない asset.json が含まれていても、
 * 警告は維持しつつ正本保存対象へ混ぜない。
 */
export async function importCasproj(
  input: Blob | ArrayBuffer | Uint8Array,
): Promise<CasprojImportResult> {
  const result = await importCasprojBase(input);
  const referencedAssetIds = new Set(result.bundle.project.assets.map((entry) => entry.id));
  const excludedAssetIds = new Set(
    result.bundle.assets
      .filter((asset) => !referencedAssetIds.has(asset.id))
      .map((asset) => asset.id),
  );
  const warnings = [...result.warnings];
  for (const assetId of excludedAssetIds) {
    warnings.push(`Projectから参照されないAssetを正本保存対象から除外しました: asset=${assetId}`);
  }
  for (const entry of result.bundle.files) {
    const match = ASSET_FILE_PATTERN.exec(entry.path);
    if (match && excludedAssetIds.has(match[1])) {
      warnings.push(`未参照Assetのfileを正本保存対象から除外しました: ${entry.path}`);
    }
  }

  return {
    ...result,
    warnings,
    bundle: {
      ...result.bundle,
      assets: result.bundle.assets.filter((asset) => referencedAssetIds.has(asset.id)),
      files: result.bundle.files.filter((entry) => {
        const match = ASSET_FILE_PATTERN.exec(entry.path);
        return !match || referencedAssetIds.has(match[1]);
      }),
    },
  };
}

export interface StagedCasprojImport {
  project: Project;
  assets: Asset[];
  blobs: ProjectBundleBlobInput[];
  warnings: string[];
  appliedMigrations: string[];
}

type IdFactory = (prefix: string) => string;

function assertProjectAssetSummary(entry: ProjectAssetEntry, asset: Asset): void {
  if (
    entry.name !== asset.name ||
    entry.assetType !== asset.assetType ||
    entry.displayName !== asset.displayName
  ) {
    throw new CasprojError(`ProjectのAsset summaryとasset.jsonが一致しません: asset=${asset.id}`, {
      code: 'inconsistent-bundle',
    });
  }
}

function canonicalFilesForAssets(
  assets: Asset[],
  files: CasprojFileEntry[],
  warnings: string[],
): Map<string, CasprojFileEntry> {
  const expectedPaths = new Set<string>();
  for (const asset of assets) {
    const textureIds = new Set<string>();
    for (const texture of asset.textures) {
      if (textureIds.has(texture.id)) {
        throw new CasprojError(
          `Assetに同じTextureRef IDが複数あります: asset=${asset.id} texture=${texture.id}`,
          { code: 'inconsistent-bundle' },
        );
      }
      textureIds.add(texture.id);
      const path = `assets/${asset.id}/${texture.path}`;
      if (expectedPaths.has(path)) {
        throw new CasprojError(`同じ画像fileを複数TextureRefが参照しています: ${path}`, {
          code: 'inconsistent-bundle',
        });
      }
      expectedPaths.add(path);
    }
  }

  const canonicalFiles = new Map<string, CasprojFileEntry>();
  for (const file of files) {
    if (expectedPaths.has(file.path)) {
      canonicalFiles.set(file.path, file);
    } else {
      warnings.push(`TextureRefから参照されないfileを正本保存対象から除外しました: ${file.path}`);
    }
  }

  const missing = [...expectedPaths].filter((path) => !canonicalFiles.has(path));
  if (missing.length > 0) {
    throw new CasprojError(
      `画像ファイルが不足しているため正本へ保存していません: ${missing.join(', ')}`,
      { code: 'incomplete-bundle' },
    );
  }
  return canonicalFiles;
}

/** 正本へ書き込まず、検査済みのimport copyをメモリ上に準備する。 */
export async function stageCasprojImport(
  input: Blob | ArrayBuffer | Uint8Array,
  idFactory: IdFactory = generateId,
): Promise<StagedCasprojImport> {
  const result = await importCasproj(input);
  const warnings = [...result.warnings];
  const projectAssetIds = new Set<string>();
  const assetsById = new Map(result.bundle.assets.map((asset) => [asset.id, asset]));

  for (const entry of result.bundle.project.assets) {
    if (projectAssetIds.has(entry.id)) {
      throw new CasprojError(`Projectに同じAsset IDが複数あります: ${entry.id}`, {
        code: 'inconsistent-bundle',
      });
    }
    projectAssetIds.add(entry.id);
    const asset = assetsById.get(entry.id);
    if (!asset) {
      throw new CasprojError(`Projectが参照するasset.jsonがありません: asset=${entry.id}`, {
        code: 'incomplete-bundle',
      });
    }
    assertProjectAssetSummary(entry, asset);
  }

  const canonicalFiles = canonicalFilesForAssets(
    result.bundle.assets,
    result.bundle.files,
    warnings,
  );
  if (result.bundle.exportPresets) {
    warnings.push(
      'settings/export-presets.jsonは検証しましたが、現在のProject正本には保存されません。元の.casprojファイルを保持してください。',
    );
  }

  const projectId = idFactory('project');
  const assetIdMap = new Map<string, string>();
  const generatedIds = new Set<string>();
  for (const asset of result.bundle.assets) {
    const nextId = idFactory('asset');
    if (generatedIds.has(nextId)) {
      throw new CasprojError(`import copyのAsset ID生成が重複しました: ${nextId}`, {
        code: 'inconsistent-bundle',
      });
    }
    generatedIds.add(nextId);
    assetIdMap.set(asset.id, nextId);
  }

  const assets = result.bundle.assets.map((asset) => ({
    ...asset,
    id: assetIdMap.get(asset.id)!,
  }));
  const project: Project = {
    ...result.bundle.project,
    id: projectId,
    assets: result.bundle.project.assets.map((entry) => {
      const asset = assetsById.get(entry.id)!;
      return {
        id: assetIdMap.get(entry.id)!,
        name: asset.name,
        displayName: asset.displayName,
        assetType: asset.assetType,
      };
    }),
  };

  const blobs: ProjectBundleBlobInput[] = [];
  for (const asset of result.bundle.assets) {
    const nextAssetId = assetIdMap.get(asset.id)!;
    for (const texture of asset.textures) {
      const path = `assets/${asset.id}/${texture.path}`;
      const file = canonicalFiles.get(path)!;
      blobs.push({
        key: `${nextAssetId}/${texture.path}`,
        blob: new Blob([file.bytes.slice().buffer as ArrayBuffer], { type: texture.mimeType }),
      });
    }
  }

  return { project, assets, blobs, warnings, appliedMigrations: result.appliedMigrations };
}

/** 段階検査済みcopyを、既存のbundle保存transactionで確定する。 */
export async function commitStagedCasprojImport(staged: StagedCasprojImport): Promise<void> {
  await saveProjectBundle(staged.project, staged.assets, staged.blobs);
}
