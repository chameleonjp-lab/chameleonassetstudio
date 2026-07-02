import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import animationSchema from './animation.schema.json';
import assetSchema from './asset.schema.json';
import exportSchema from './export.schema.json';
import projectSchema from './project.schema.json';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validateAssetFn = ajv.compile(assetSchema);
const validateAnimationFn = ajv.compile(animationSchema);
const validateProjectFn = ajv.compile(projectSchema);
const validateExportPresetsFn = ajv.compile(exportSchema);

export interface ValidationResult {
  valid: boolean;
  /** どの項目が不正かを示すメッセージ。UI 表示とログに使う。 */
  errors: string[];
}

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) {
    return [];
  }
  return errors.map((error) => {
    const path = error.instancePath === '' ? '(root)' : error.instancePath;
    return `${path}: ${error.message ?? '不正な値です'}`;
  });
}

function runValidator(validator: ValidateFunction, data: unknown): ValidationResult {
  const valid = validator(data) === true;
  return { valid, errors: valid ? [] : formatErrors(validator.errors) };
}

/** asset.json を検証する。読み込み時、自動保存前、書き出し前、テスト時に使う。 */
export function validateAsset(data: unknown): ValidationResult {
  return runValidator(validateAssetFn, data);
}

/** アニメーション 1 件を検証する。 */
export function validateAnimation(data: unknown): ValidationResult {
  return runValidator(validateAnimationFn, data);
}

/** project.json を検証する。 */
export function validateProject(data: unknown): ValidationResult {
  return runValidator(validateProjectFn, data);
}

/** settings/export-presets.json を検証する。 */
export function validateExportPresets(data: unknown): ValidationResult {
  return runValidator(validateExportPresetsFn, data);
}
