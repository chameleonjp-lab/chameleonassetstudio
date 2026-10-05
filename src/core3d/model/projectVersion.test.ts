import { describe, expect, it } from 'vitest';
import { nativeBox } from '../fixtures/nativeBox';
import {
  upgradeLegacyProject,
  validateLegacyProject,
  validateProject,
  type LegacyProject3D,
} from './project';

export function legacyFixture(): LegacyProject3D {
  return { ...nativeBox('old-project'), schemaVersion: '0.1.0' };
}
describe('versioned native material and node contract', () => {
  it('upgrades a detached copy with explicit compatibility defaults, preserving original values', () => {
    const old = legacyFixture();
    old.materials[0].baseColor[3] = 0.4;
    const before = structuredClone(old);
    const next = upgradeLegacyProject(old);
    expect(next.schemaVersion).toBe('0.2.0');
    expect(next.materials[0]).toMatchObject({
      emissiveColor: [0, 0, 0],
      alphaMode: 'LEGACY_AUTO',
      alphaCutoff: 0.5,
      doubleSided: false,
    });
    expect(next.nodes[0]).toMatchObject({ visible: true, locked: false });
    expect(next.materials[0].baseColor[3]).toBe(0.4);
    next.meshes[0].vertices[0].position[0] = 99;
    expect(old).toEqual(before);
  });
  it.each([
    ['node', 'visible', true],
    ['node', 'locked', false],
    ['material', 'emissiveColor', [0, 0, 0]],
    ['material', 'alphaMode', 'OPAQUE'],
    ['material', 'alphaCutoff', 0.5],
    ['material', 'doubleSided', false],
  ])('0.1.0 rejects the new %s %s field without stripping it', (kind, key, value) => {
    const old = legacyFixture();
    Object.assign(kind === 'node' ? old.nodes[0] : old.materials[0], { [String(key)]: value });
    const before = structuredClone(old);
    expect(() => validateLegacyProject(old)).toThrow('field');
    expect(() => upgradeLegacyProject(old)).toThrow('field');
    expect(old).toEqual(before);
  });
  it.each(['0.0.1', '0.3.0', '1.0.0'])(
    'rejects unsupported %s before migration',
    (schemaVersion) => {
      expect(() => validateProject({ ...nativeBox(), schemaVersion })).toThrow('version');
      expect(() => validateLegacyProject({ ...legacyFixture(), schemaVersion })).toThrow('version');
    },
  );
  it.each([
    ['emissiveColor', [-0.1, 0, 0]],
    ['emissiveColor', [1.1, 0, 0]],
    ['emissiveColor', [0, NaN, 0]],
    ['emissiveColor', [0, 0]],
    ['alphaMode', 'AUTO'],
    ['alphaMode', 1],
    ['alphaCutoff', -0.1],
    ['alphaCutoff', 1.1],
    ['alphaCutoff', Infinity],
    ['doubleSided', 'true'],
  ])('rejects invalid material %s %j', (key, value) => {
    const p = nativeBox();
    Object.assign(p.materials[0], { [String(key)]: value });
    expect(() => validateProject(p)).toThrow();
  });
  it('validates all finite boundaries and rejects invalid flags and unknown fields', () => {
    const p = nativeBox();
    Object.assign(p.materials[0], {
      emissiveColor: [0, 1, 0.5],
      alphaMode: 'MASK',
      alphaCutoff: 0,
      doubleSided: true,
    });
    Object.assign(p.nodes[0], { visible: false, locked: true });
    expect(() => validateProject(p)).not.toThrow();
    p.materials[0].alphaCutoff = 1;
    expect(() => validateProject(p)).not.toThrow();
    for (const flag of ['visible', 'locked']) {
      const invalid = structuredClone(p);
      Object.assign(invalid.nodes[0], { [flag]: 1 });
      expect(() => validateProject(invalid)).toThrow('flag');
    }
    expect(() => validateProject({ ...p, privateUnknown: true })).toThrow('field');
    expect(() => validateProject(legacyFixture())).toThrow('version');
  });
});
