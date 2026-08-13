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
