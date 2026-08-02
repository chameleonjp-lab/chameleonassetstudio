import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import animationSchema from './animation.schema.json';
import assetSchema from './asset.schema.json';
import exportSchema from './export.schema.json';
import projectSchema from './project.schema.json';
import type { Asset } from '../model/asset';
import { inspectFrameColliderOverrides } from '../model/frameColliderOverrides';

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

/** 構造検証後にO1の参照・shape・有限値を共通検査する保存境界用validator。 */
export function validateAssetForPersistence(data: unknown): ValidationResult {
  const structural = validateAsset(data);
  if (!structural.valid) return structural;
  const semantic = inspectFrameColliderOverrides(data as Asset);
  return {
    valid: semantic.valid,
    errors: semantic.issues.map((issue) => `${issue.path} [${issue.code}]: ${issue.message}`),
  };
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
