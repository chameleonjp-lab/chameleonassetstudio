import { describe, expect, it } from 'vitest';
import type { Asset } from '../model';
import characterAsset from '../samples/asset.character.json';
import { inspectDistributionPreflight, assertDistributionPreflight } from './preflight';

const baseAsset = characterAsset as unknown as Asset;

describe('distribution preflight', () => {
  it('unsafe pathをBlob読込前にblockし、値を修正しない', () => {
    const asset = structuredClone(baseAsset);
    asset.name = '../unsafe';
    const result = inspectDistributionPreflight(asset, { profile: 'fixed-grid', scale: 1 });

    expect(result.blocks.some((issue) => issue.code === 'PREFLIGHT-PATH')).toBe(true);
    expect(asset.name).toBe('../unsafe');
    expect(() => assertDistributionPreflight(asset)).toThrow(/PREFLIGHT-PATH/);
  });

  it('Frame名のASCII大小文字・Unicode NFC同値衝突を安定してblockする', () => {
    const asset = structuredClone(baseAsset);
    asset.frames = [
      { id: 'frame-a', name: 'Hero', durationMs: 100, colliderOverrides: [] },
      { id: 'frame-b', name: 'hero', durationMs: 100, colliderOverrides: [] },
      { id: 'frame-c', name: 'カ\u3099', durationMs: 100, colliderOverrides: [] },
      { id: 'frame-d', name: 'ガ', durationMs: 100, colliderOverrides: [] },
    ] as unknown as Asset['frames'];

    const first = inspectDistributionPreflight(asset);
    const second = inspectDistributionPreflight(asset);

    expect(first.issues).toEqual(second.issues);
    expect(first.blocks.filter((issue) => issue.code === 'PREFLIGHT-COLLISION')).toHaveLength(2);
  });

  it('Frame名のunsafe pathも出力前にblockする', () => {
    const asset = structuredClone(baseAsset);
    asset.frames = [
      { id: 'frame-a', name: '../frame', durationMs: 100, colliderOverrides: [] },
    ] as unknown as Asset['frames'];

    const result = inspectDistributionPreflight(asset);

    expect(result.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PREFLIGHT-PATH', path: '/frames/0/name' }),
      ]),
    );
  });

  it('texture pathの完全一致も重複としてblockする', () => {
    const asset = structuredClone(baseAsset);
    asset.textures = [
      { id: 'texture-a', path: 'textures/main.png', kind: 'edit' },
      { id: 'texture-b', path: 'textures/main.png', kind: 'edit' },
    ] as unknown as Asset['textures'];

    const result = inspectDistributionPreflight(asset);

    expect(result.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PREFLIGHT-COLLISION', path: '/textures/1/path' }),
      ]),
    );
  });

  it('schema不正な配列でも問題一覧を返し、loss検査でthrowしない', () => {
    const asset = structuredClone(baseAsset) as unknown as Record<string, unknown>;
    asset.frames = [null];
    asset.animations = [null];

    expect(() => inspectDistributionPreflight(asset)).not.toThrow();
    expect(inspectDistributionPreflight(asset).valid).toBe(false);
  });

  it('scale後のpage上限をBlob処理前にblockする', () => {
    const asset = structuredClone(baseAsset);
    asset.canvasSize = { width: 1024, height: 1024 };

    const result = inspectDistributionPreflight(asset, { scale: 3 });

    expect(result.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PREFLIGHT-PAGE', path: '/canvasSize' }),
      ]),
    );
  });

  it('scale省略時も既定値1のpage上限をblockする', () => {
    const asset = structuredClone(baseAsset);
    asset.canvasSize = { width: 2049, height: 1 };

    const result = inspectDistributionPreflight(asset);

    expect(result.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PREFLIGHT-PAGE', path: '/canvasSize' }),
      ]),
    );
  });

  it('secret-like keyと値をメッセージへ露出しない', () => {
    const asset = structuredClone(baseAsset);
    asset.gameAttributes = { apiKey: 'sk_test_secret_value_123456' };
    const result = inspectDistributionPreflight(asset);
    const secretIssues = result.blocks.filter((issue) => issue.code === 'PREFLIGHT-SECRET');

    expect(secretIssues.length).toBeGreaterThan(0);
    expect(result.issues.map((issue) => issue.message).join(' ')).not.toContain(
      'sk_test_secret_value',
    );
  });

  it('同一入力の問題順が再現する', () => {
    const asset = structuredClone(baseAsset);
    asset.name = 'https://unsafe.example';
    asset.gameAttributes = { password: 'secret' };

    const first = inspectDistributionPreflight(asset);
    const second = inspectDistributionPreflight(asset);
    expect(first.issues).toEqual(second.issues);
    expect(first.valid).toBe(false);
  });
});
