import type { ColliderPurpose } from '../../core/model';

/** 判定用途ごとの表示色。色だけに頼らないよう用途名・線種・凡例も併用する。 */
export const COLLIDER_PURPOSE_COLORS: Record<ColliderPurpose, string> = {
  body: '#e63946',
  attack: '#ff9f1c',
  pickup: '#2ec4b6',
  sensor: '#8338ec',
  custom: '#6c757d',
};

export function colliderPurposeColor(purpose: ColliderPurpose): string {
  return COLLIDER_PURPOSE_COLORS[purpose] ?? COLLIDER_PURPOSE_COLORS.custom;
}

/** sensor は色だけでなく破線で区別する。 */
export function colliderLineDash(purpose: ColliderPurpose): number[] {
  return purpose === 'sensor' ? [6, 4] : [];
}

export function isSelectedCollider(colliderId: string, selectedColliderId: string | null): boolean {
  return colliderId === selectedColliderId;
}
