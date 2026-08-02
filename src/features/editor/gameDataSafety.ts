import type { Asset } from '../../core/model';

export type EditableGameAttribute = string | number;

export function isEditableGameAttribute(value: unknown): value is EditableGameAttribute {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

export function gameAttributeTypeLabel(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return 'finiteでないnumber';
  }
  return typeof value;
}

export function formatReadonlyGameAttribute(value: unknown): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export type RetainedTypeSetting =
  | { kind: 'tile'; label: string; value: unknown }
  | { kind: 'gimmick'; label: string; value: unknown }
  | { kind: 'effect'; label: string; value: unknown }
  | { kind: 'background'; label: string; value: unknown; layerId: string };

/** 現在のAsset種別では使わないが、非破壊で保持している設定をすべて返す。 */
export function retainedTypeSettings(asset: Asset): RetainedTypeSetting[] {
  const retained: RetainedTypeSetting[] = [];
  if (asset.assetType !== 'tile' && asset.tile) {
    retained.push({ kind: 'tile', label: 'タイル設定', value: asset.tile });
  }
  if (asset.assetType !== 'gimmick' && asset.gimmick) {
    retained.push({ kind: 'gimmick', label: 'ギミック設定', value: asset.gimmick });
  }
  if (asset.assetType !== 'effect' && asset.effect) {
    retained.push({ kind: 'effect', label: 'エフェクト設定', value: asset.effect });
  }
  if (asset.assetType !== 'background') {
    for (const layer of asset.layers) {
      if (layer.background) {
        retained.push({
          kind: 'background',
          label: `背景設定（レイヤー: ${layer.name}）`,
          value: layer.background,
          layerId: layer.id,
        });
      }
    }
  }
  return retained;
}
