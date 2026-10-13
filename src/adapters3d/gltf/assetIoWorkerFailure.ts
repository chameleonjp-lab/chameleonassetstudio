import {
  ASSET_IO_WORKER_FAILURE_CODES,
  type AssetIoWorkerFailureCode,
} from '../../core3d/ports/assetIoPort';

function safeErrorMessage(cause: unknown): string {
  if (!(cause instanceof Error)) return '';
  try {
    const value = Object.getOwnPropertyDescriptor(cause, 'message')?.value;
    return typeof value === 'string' ? value.slice(0, 4096) : '';
  } catch {
    return '';
  }
}

/** Return fixed protocol codes only; never serialize exception text from an input file. */
export function classifyAssetIoWorkerFailure(cause: unknown): AssetIoWorkerFailureCode {
  const message = safeErrorMessage(cause);
  if (/unsupported required extension/i.test(message))
    return ASSET_IO_WORKER_FAILURE_CODES.REQUIRED_EXTENSION;
  if (/external.*(?:uri|url)|data.*uri|remote.*(?:uri|url)/i.test(message))
    return ASSET_IO_WORKER_FAILURE_CODES.EXTERNAL_REFERENCE;
  if (/sidecar|game\.json|provenance|ancestry/i.test(message))
    return ASSET_IO_WORKER_FAILURE_CODES.SIDECAR;
  // Range/finiteness failures are structural validation errors, not worker startup failures.
  if (
    /(?:accessor outside buffer.?view|non[- ]finite accessor|index exceeds positions)/i.test(
      message,
    )
  )
    return ASSET_IO_WORKER_FAILURE_CODES.FORMAT;
  if (/exceeds|exceed|budget|profile|上限/i.test(message))
    return ASSET_IO_WORKER_FAILURE_CODES.PROFILE_LIMIT;
  if (/image|texture|png|jpeg|mime/i.test(message)) return ASSET_IO_WORKER_FAILURE_CODES.IMAGE;
  if (/invalid|malformed|truncated|duplicate|unsafe|不正|破損/i.test(message))
    return ASSET_IO_WORKER_FAILURE_CODES.FORMAT;
  return ASSET_IO_WORKER_FAILURE_CODES.WORKER;
}
