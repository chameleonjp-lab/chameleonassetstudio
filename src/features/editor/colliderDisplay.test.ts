import { describe, expect, it } from 'vitest';
import { colliderLineDash, colliderPurposeColor, isSelectedCollider } from './colliderDisplay';

describe('colliderDisplay', () => {
  it('用途ごとの表示色を返す', () => {
    expect(colliderPurposeColor('body')).toBe('#e63946');
    expect(colliderPurposeColor('sensor')).toBe('#8338ec');
  });

  it('sensor だけ破線を返す', () => {
    expect(colliderLineDash('sensor')).toEqual([6, 4]);
    expect(colliderLineDash('body')).toEqual([]);
  });

  it('選択中判定かどうかを返す', () => {
    expect(isSelectedCollider('a', 'a')).toBe(true);
    expect(isSelectedCollider('a', 'b')).toBe(false);
    expect(isSelectedCollider('a', null)).toBe(false);
  });
});
