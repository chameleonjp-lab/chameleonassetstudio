import {
  importCasproj as importCasprojBase,
  type CasprojImportResult,
} from './casproj';

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

  return {
    ...result,
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
