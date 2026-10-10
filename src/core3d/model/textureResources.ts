import { assetIoReservedBytes, ASSET_IO_PROFILE } from '../profile/assetIoProfile';
import { NATIVE_TEXTURE_PROFILE } from './textureProfile';

/** Per-realm texture ownership estimate; never a measurement of free device memory. */
const owners = new Map<symbol, { label: string; bytes: number }>();
export function nativeTextureReservedBytes(): number {
  return [...owners.values()].reduce((total, owner) => total + owner.bytes, 0);
}

/** Acquire before allocation; keep the old ticket until its resources are actually released. */
export function reserveNativeTextureBytes(label: string, bytes: number): () => void {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    bytes + nativeTextureReservedBytes() > NATIVE_TEXTURE_PROFILE.maxOperationBytes ||
    bytes + nativeTextureReservedBytes() + assetIoReservedBytes() >
      ASSET_IO_PROFILE.estimatedPeakBytes
  )
    throw new Error(
      '画像処理と表示の合計メモリ見積りが上限を超えます。表示や画像操作を終了して再試行してください。',
    );
  const ticket = Symbol(label);
  owners.set(ticket, { label, bytes });
  return () => {
    owners.delete(ticket);
  };
}
