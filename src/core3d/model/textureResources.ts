import { reserveResourceBytes, resourceLedgerSnapshot } from '../profile/resourceLedger';
import { NATIVE_TEXTURE_PROFILE } from './textureProfile';

/** Per-realm texture ownership estimate; never measured free device memory. */
export function nativeTextureReservedBytes(): number {
  return resourceLedgerSnapshot().byCategory.texture;
}
/** Acquire before allocation; old tickets live until resources are actually released. */
export function reserveNativeTextureBytes(_label: string, bytes: number): () => void {
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    bytes > NATIVE_TEXTURE_PROFILE.maxOperationBytes - nativeTextureReservedBytes()
  )
    throw new Error(
      '画像処理と表示の合計メモリ見積りが上限を超えます。表示や画像操作を終了して再試行してください。',
    );
  return reserveResourceBytes('texture', bytes);
}
