/**
 * 画像デコードの共通フォールバック（Phase 15.5-B）。
 * createImageBitmap が使える環境ではそれを使い、非対応・失敗時は HTMLImageElement へフォールバックする。
 * 呼び出し側は使い終わったら必ず close() を呼ぶこと（ImageBitmap の解放 / ObjectURL の revoke）。
 */
export interface DecodedImageSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  close(): void;
}

/** Blob を CanvasImageSource としてデコードする（ブラウザ専用）。 */
export async function decodeImageSource(blob: Blob): Promise<DecodedImageSource> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // 非対応・失敗時は HTMLImageElement へフォールバックする
    }
  }

  const url = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => {
      // ObjectURL を漏らさない
      URL.revokeObjectURL(url);
      reject(new Error('画像をデコードできませんでした'));
    };
    el.src = url;
  });
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    close: () => URL.revokeObjectURL(url),
  };
}
