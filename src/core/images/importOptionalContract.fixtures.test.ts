/**
 * 2D-2-IMPORT-OPTIONAL: docs/adr/0016-import-optional-format-classification.md の契約 fixture テスト。
 * ユーザー向け取り込み gate は PNG / JPEG / WebP の 3 形式に留めつつ、Slice E の前提として
 * source 保存層の実体署名検査が SVG / GIF / APNG コンテナを識別できることを固定する。
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

describe('ADR-0016: source 保存層の実体署名検査', () => {
  it('SVG の root 要素を image/svg+xml として検出する', () => {
    const svgBytes = new TextEncoder().encode(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    expect(detectImageMimeType(svgBytes)).toBe('image/svg+xml');
  });

  it('GIF89a のバイト列を image/gif として検出する', () => {
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
    expect(detectImageMimeType(gifBytes)).toBe('image/gif');
  });

  it('APNG は PNG コンテナのため image/png として検出する', () => {
    const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(detectImageMimeType(pngSignature)).toBe('image/png');
  });
});
