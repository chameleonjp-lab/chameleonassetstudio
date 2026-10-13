import { ASSET_IO_PROFILE } from '../profile/assetIoProfile';

export const SOURCE_ONLY_LOSS_APPROVAL_PREFIX =
  'Source-only features require explicit loss approval: ';
const maxLosses = ASSET_IO_PROFILE.extensionDeclarations + 32;
export const MAX_SOURCE_ONLY_LOSS_REQUEST_LENGTH =
  SOURCE_ONLY_LOSS_APPROVAL_PREFIX.length +
  2 +
  maxLosses * (ASSET_IO_PROFILE.extensionNameChars * 6 + 3);

export function isValidSourceOnlyLossList(value: unknown): value is string[] {
  if (!Array.isArray(value) || !value.length || value.length > maxLosses) return false;
  const names: unknown[] = value;
  if (
    names.some(
      (name) =>
        typeof name !== 'string' ||
        !name.length ||
        name.length > ASSET_IO_PROFILE.extensionNameChars,
    )
  )
    return false;
  return new Set(names as string[]).size === names.length;
}

export function parseSourceOnlyLossRequest(text: string): string[] | null {
  if (
    !text.startsWith(SOURCE_ONLY_LOSS_APPROVAL_PREFIX) ||
    text.length > MAX_SOURCE_ONLY_LOSS_REQUEST_LENGTH
  )
    return null;
  let names: unknown;
  try {
    names = JSON.parse(text.slice(SOURCE_ONLY_LOSS_APPROVAL_PREFIX.length));
  } catch {
    return null;
  }
  return isValidSourceOnlyLossList(names) ? names : null;
}
