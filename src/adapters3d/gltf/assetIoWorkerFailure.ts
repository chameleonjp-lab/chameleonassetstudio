import {
  ASSET_IO_WORKER_FAILURE_CODES,
  type AssetIoWorkerFailure,
  type AssetIoWorkerFailureCode,
} from '../../core3d/ports/assetIoPort';
import {
  MAX_SOURCE_ONLY_LOSS_REQUEST_LENGTH,
  parseSourceOnlyLossRequest,
  SOURCE_ONLY_LOSS_APPROVAL_PREFIX,
} from '../../core3d/import/optionalLoss';

function safeErrorMessage(cause: unknown, limit = 4096): string {
  if (!(cause instanceof Error)) return '';
  try {
    const value = Object.getOwnPropertyDescriptor(cause, 'message')?.value;
    return typeof value === 'string' ? value.slice(0, limit) : '';
  } catch {
    return '';
  }
}

function sourceOnlyRequest(cause: unknown): { matched: boolean; losses: string[] | null } {
  const message = safeErrorMessage(cause, MAX_SOURCE_ONLY_LOSS_REQUEST_LENGTH + 1),
    matched = message.startsWith(SOURCE_ONLY_LOSS_APPROVAL_PREFIX);
  return { matched, losses: matched ? parseSourceOnlyLossRequest(message) : null };
}

/** Return fixed protocol codes only; never serialize exception text from an input file. */
export function classifyAssetIoWorkerFailure(cause: unknown): AssetIoWorkerFailureCode {
  const lossRequest = sourceOnlyRequest(cause);
  if (lossRequest.matched)
    return lossRequest.losses
      ? ASSET_IO_WORKER_FAILURE_CODES.LOSS_APPROVAL_REQUIRED
      : ASSET_IO_WORKER_FAILURE_CODES.WORKER;
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

export function createAssetIoWorkerFailure(cause: unknown): AssetIoWorkerFailure {
  const lossRequest = sourceOnlyRequest(cause);
  if (lossRequest.matched)
    return lossRequest.losses
      ? {
          kind: 'error',
          code: ASSET_IO_WORKER_FAILURE_CODES.LOSS_APPROVAL_REQUIRED,
          losses: lossRequest.losses,
        }
      : { kind: 'error', code: ASSET_IO_WORKER_FAILURE_CODES.WORKER };
  const code = classifyAssetIoWorkerFailure(cause);
  return code === ASSET_IO_WORKER_FAILURE_CODES.LOSS_APPROVAL_REQUIRED
    ? { kind: 'error', code: ASSET_IO_WORKER_FAILURE_CODES.WORKER }
    : { kind: 'error', code };
}
