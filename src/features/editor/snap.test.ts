import { describe, expect, test } from 'vitest';
import { applyEditSnap, keepExistingCoordinate } from './snap';

describe('editor snap helpers', () => {
  test('snap ON では grid size に丸め、snap OFF では自由座標を維持する', () => {
    expect(applyEditSnap(23, true, 16)).toBe(16);
    expect(applyEditSnap(23, false, 16)).toBe(23);
  });

  test('既存座標はスナップ ON だけでは勝手に変更しない', () => {
    const coordinate = { x: 13, y: 29 };
    expect(keepExistingCoordinate(coordinate)).toBe(coordinate);
    expect(keepExistingCoordinate(coordinate)).toEqual({ x: 13, y: 29 });
  });
});
