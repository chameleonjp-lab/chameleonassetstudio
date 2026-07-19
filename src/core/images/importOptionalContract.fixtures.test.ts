/**
 * 2D-2-IMPORT-OPTIONAL: docs/adr/0016-import-optional-format-classification.md の契約 fixture テスト。
 * 現行の取り込み gate（宣言 MIME 検査と実体署名検査）が PNG / JPEG / WebP の 3 形式のみを
 * 受け付けることを固定し、Slice E での形式追加を意図的な変更にする。製品コードは変更しない。
 */
import { describe, expect, it } from 'vitest';
import { SUPPORTED_IMPORT_MIME_TYPES, checkImportFile } from './importImage';
import { detectImageMimeType } from './imageInputSafety';

describe('ADR-0016: 宣言 MIME 検査の現行 gate', () => {
  it('対応形式は PNG / JPEG / WebP の 3 形式のままである', () => {
    expect([...SUPPORTED_IMPORT_MIME_TYPES]).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });

  it.each([
    ['SVG', 'image/svg+xml'],
    ['GIF', 'image/gif'],
    ['APNG（明示宣言）', 'image/apng'],
    ['PSD', 'image/vnd.adobe.photoshop'],
    ['OpenRaster', 'image/openraster'],
    ['Krita', 'application/x-krita'],
    ['不明形式（Aseprite 等、MIME 未宣言）', ''],
  ])('%s（%s）を理由付きで拒否する', (_label, mimeType) => {
    const reason = checkImportFile({ name: 'input.bin', size: 1024, type: mimeType });
    expect(reason).toMatch(/対応していないファイル形式です/);
  });

  it.each([['image/png'], ['image/jpeg'], ['image/webp']])('%s は宣言 MIME 検査を通る', (type) => {
    expect(checkImportFile({ name: 'input.img', size: 1024, type })).toBeNull();
  });
});

describe('ADR-0016: 実体署名検査の現行 gate', () => {
  it('SVG のバイト列（XML テキスト）には null を返す（実体署名でも拒否される）', () => {
    const svgBytes = new TextEncoder().encode('<?xml version="1.0"?><svg xmlns="ht');
    expect(detectImageMimeType(svgBytes)).toBeNull();
  });

  it('GIF89a のバイト列には null を返す（実体署名でも拒否される）', () => {
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
    expect(detectImageMimeType(gifBytes)).toBeNull();
  });

  it('APNG は PNG と同一署名のため image/png として検出される（ADR-0016 現状の制限）', () => {
    const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(detectImageMimeType(pngSignature)).toBe('image/png');
  });
});
