import { afterEach, expect, it } from 'vitest';
import {
  RESOURCE_ESTIMATE_CAP_BYTES,
  createResourceOwner,
  reserveResourceBytes,
  resourceLedgerSnapshot,
  type ResourceCategory,
} from './resourceLedger';

const releases: (() => void)[] = [];
function reserve(category: ResourceCategory, bytes: number): () => void {
  const release = reserveResourceBytes(category, bytes);
  releases.push(release);
  return release;
}

afterEach(() => {
  for (const release of releases.splice(0)) release();
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  expect(Object.values(resourceLedgerSnapshot().byCategory)).toEqual([0, 0, 0, 0, 0, 0]);
});

it('reports per-realm ownership estimates separately for all six categories', () => {
  const baseline = resourceLedgerSnapshot();
  expect(baseline).toEqual({
    kind: 'ownership-estimate',
    scope: 'realm',
    limitBytes: 256 * 1024 * 1024,
    totalBytes: 0,
    byCategory: {
      texture: 0,
      'asset-io': 0,
      geometry: 0,
      history: 0,
      storage: 0,
      framebuffer: 0,
    },
  });
  reserve('texture', 1);
  reserve('asset-io', 2);
  reserve('geometry', 3);
  reserve('history', 4);
  reserve('storage', 5);
  reserve('framebuffer', 6);
  expect(resourceLedgerSnapshot()).toEqual({
    ...baseline,
    totalBytes: 21,
    byCategory: {
      texture: 1,
      'asset-io': 2,
      geometry: 3,
      history: 4,
      storage: 5,
      framebuffer: 6,
    },
  });
  expect(baseline.totalBytes).toBe(0);
  expect(baseline.byCategory.framebuffer).toBe(0);
});

it('returns frozen detached snapshots that cannot alter admission or release', () => {
  const release = reserve('history', 123);
  const snapshot = resourceLedgerSnapshot();
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.byCategory)).toBe(true);
  expect(Reflect.set(snapshot, 'totalBytes', 0)).toBe(false);
  expect(Reflect.set(snapshot.byCategory, 'history', 0)).toBe(false);
  expect(resourceLedgerSnapshot().totalBytes).toBe(123);
  release();
  expect(snapshot.totalBytes).toBe(123);
  expect(snapshot.byCategory.history).toBe(123);
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
});

it('returns every category to baseline over 20 acquire/release cycles', () => {
  const baseline = resourceLedgerSnapshot();
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const tickets = (Object.keys(baseline.byCategory) as ResourceCategory[]).map(
      (category, index) => reserve(category, (cycle + 1) * (index + 1)),
    );
    expect(resourceLedgerSnapshot().totalBytes).toBe((cycle + 1) * 21);
    for (const release of tickets.reverse()) {
      release();
      release();
    }
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  }
});

it('admits the byte before and exactly at the cap, then rejects before allocation', () => {
  reserve('geometry', RESOURCE_ESTIMATE_CAP_BYTES - 1);
  const lastByte = reserve('framebuffer', 1);
  const full = resourceLedgerSnapshot();
  expect(full.totalBytes).toBe(RESOURCE_ESTIMATE_CAP_BYTES);
  let allocated = false;
  expect(() => {
    reserve('storage', 1);
    allocated = true;
  }).toThrow('cap');
  expect(allocated).toBe(false);
  expect(resourceLedgerSnapshot()).toEqual(full);
  const zero = reserve('texture', 0);
  zero();
  zero();
  expect(resourceLedgerSnapshot()).toEqual(full);
  lastByte();
  expect(resourceLedgerSnapshot().totalBytes).toBe(RESOURCE_ESTIMATE_CAP_BYTES - 1);
});

it('rejects overlapping category reservations atomically in either order', () => {
  for (const categories of [
    ['texture', 'asset-io'],
    ['asset-io', 'texture'],
    ['geometry', 'history'],
    ['storage', 'framebuffer'],
  ] as const) {
    const first = reserve(categories[0], RESOURCE_ESTIMATE_CAP_BYTES - 10);
    const before = resourceLedgerSnapshot();
    expect(() => reserve(categories[1], 11)).toThrow('cap');
    expect(resourceLedgerSnapshot()).toEqual(before);
    const second = reserve(categories[1], 10);
    first();
    first();
    expect(resourceLedgerSnapshot().totalBytes).toBe(10);
    second();
  }
});

it('serializes same-turn competing requests without oversubscribing the cap', async () => {
  const results = await Promise.allSettled([
    Promise.resolve().then(() => reserve('asset-io', RESOURCE_ESTIMATE_CAP_BYTES / 2 + 1)),
    Promise.resolve().then(() => reserve('geometry', RESOURCE_ESTIMATE_CAP_BYTES / 2 + 1)),
  ]);
  expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
  expect(resourceLedgerSnapshot().totalBytes).toBe(RESOURCE_ESTIMATE_CAP_BYTES / 2 + 1);
  expect(resourceLedgerSnapshot().byCategory.geometry).toBe(0);
});

it('preserves old tickets on failed replacement and counts the successful overlap', () => {
  const old = reserve('history', RESOURCE_ESTIMATE_CAP_BYTES - 8);
  const before = resourceLedgerSnapshot();
  expect(() => reserve('history', 9)).toThrow('cap');
  expect(resourceLedgerSnapshot()).toEqual(before);
  const replacement = reserve('history', 8);
  expect(resourceLedgerSnapshot().byCategory.history).toBe(RESOURCE_ESTIMATE_CAP_BYTES);
  replacement();
  expect(resourceLedgerSnapshot()).toEqual(before);
  const next = reserve('history', 8);
  old();
  old();
  expect(resourceLedgerSnapshot().byCategory.history).toBe(8);
  next();
});

it('does not merge independent owners with equal sizes or reuse released tickets', () => {
  const first = reserve('texture', 16);
  const second = reserve('texture', 16);
  first();
  const third = reserve('texture', 16);
  first();
  expect(resourceLedgerSnapshot().byCategory.texture).toBe(32);
  second();
  third();
});

it('rejects unsafe integers, overflow, and over-cap inputs without changing existing owners', () => {
  reserve('storage', 5);
  const before = resourceLedgerSnapshot();
  for (const bytes of [
    -1,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_VALUE,
    RESOURCE_ESTIMATE_CAP_BYTES + 1,
  ]) {
    expect(() => reserve('geometry', bytes)).toThrow();
    expect(resourceLedgerSnapshot()).toEqual(before);
  }
});

it('rejects invalid runtime categories and non-number bytes without prototype effects', () => {
  reserve('texture', 7);
  const before = resourceLedgerSnapshot();
  const disguisedCategory = {
    toString: () => {
      throw new Error('Must not coerce category objects');
    },
  };
  for (const category of [
    'other',
    '__proto__',
    'constructor',
    'toString',
    undefined,
    null,
    disguisedCategory,
  ]) {
    expect(() => reserve(category as ResourceCategory, 1)).toThrow('category');
    expect(resourceLedgerSnapshot()).toEqual(before);
  }
  for (const bytes of ['1', null, undefined, true, 1n]) {
    expect(() => reserve('geometry', bytes as unknown as number)).toThrow('safe integer');
    expect(resourceLedgerSnapshot()).toEqual(before);
  }
});

it('resizes one owner by atomic deltas below, at and over the combined cap', () => {
  const owner = createResourceOwner('history', 11);
  releases.push(owner.release);
  const alias = owner;
  reserve('geometry', RESOURCE_ESTIMATE_CAP_BYTES - 21);
  alias.resize(20);
  expect(owner.bytes).toBe(20);
  expect(resourceLedgerSnapshot().totalBytes).toBe(RESOURCE_ESTIMATE_CAP_BYTES - 1);
  owner.resize(21);
  const full = resourceLedgerSnapshot();
  expect(full.totalBytes).toBe(RESOURCE_ESTIMATE_CAP_BYTES);
  expect(() => alias.resize(22)).toThrow('cap');
  expect(owner.bytes).toBe(21);
  expect(resourceLedgerSnapshot()).toEqual(full);
  alias.resize(5);
  expect(resourceLedgerSnapshot().byCategory.history).toBe(5);
  expect(resourceLedgerSnapshot().totalBytes).toBe(RESOURCE_ESTIMATE_CAP_BYTES - 16);
  owner.release();
  alias.release();
  expect(owner.bytes).toBe(0);
  expect(() => owner.resize(0)).toThrow('released');
});

it('keeps resizable ownership immutable and rejects invalid sizes without changing tickets', () => {
  const owner = createResourceOwner('history', 17);
  releases.push(owner.release);
  const before = resourceLedgerSnapshot();
  expect(Object.isFrozen(owner)).toBe(true);
  expect(Reflect.set(owner, 'bytes', 0)).toBe(false);
  for (const bytes of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => owner.resize(bytes)).toThrow('safe integer');
    expect(resourceLedgerSnapshot()).toEqual(before);
    expect(owner.bytes).toBe(17);
  }
  owner.resize(17);
  expect(resourceLedgerSnapshot()).toEqual(before);
  owner.resize(0);
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  owner.resize(19);
  expect(resourceLedgerSnapshot().totalBytes).toBe(19);
});
