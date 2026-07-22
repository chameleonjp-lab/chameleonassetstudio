import { computeSheetLayout } from '../../src/core/export/atlas';
import type { Asset } from '../../src/core/model';
import type { RigAnimation } from '../../src/core/model/rig';
import { bakeRigAnimation } from '../../src/core/rig/rig';

export const H3_SCHEMA_VERSION = 'h3-measurement-1' as const;
export const H3_REPOSITORY = 'chameleonjp-lab/chameleonassetstudio' as const;
export const H3_WARMUP_ITERATIONS = 3;
export const H3_RECORDED_ITERATIONS = 10;

export type H3Hierarchy = 'chain' | 'flat';
export type H3Tier = 'device-core' | 'node-escalation';

export interface H3Case {
  id: string;
  label: string;
  frameCount: number;
  partCount: number;
  textureSize: number;
  fps: number;
  hierarchy: H3Hierarchy;
  tier: H3Tier;
  note: string;
}

export const H3_CASES: readonly H3Case[] = [
  {
    id: 'baseline-60x4x64',
    label: 'Baseline: 60 frames / 4 parts / 64 px',
    frameCount: 60,
    partCount: 4,
    textureSize: 64,
    fps: 30,
    hierarchy: 'chain',
    tier: 'device-core',
    note: '全端末で最初に実行する基準ケース。',
  },
  {
    id: 'candidate-120x8x256',
    label: 'Candidate 120: 120 frames / 8 parts / 256 px',
    frameCount: 120,
    partCount: 8,
    textureSize: 256,
    fps: 30,
    hierarchy: 'chain',
    tier: 'device-core',
    note: '旧120 warning案を測るケース。warning採用を意味しない。',
  },
  {
    id: 'state-240x16x64',
    label: 'State pressure: 240 frames / 16 parts / 64 px',
    frameCount: 240,
    partCount: 16,
    textureSize: 64,
    fps: 30,
    hierarchy: 'chain',
    tier: 'device-core',
    note: 'LayerStateとserialized bytesを増やす。240 hard cap採用を意味しない。',
  },
  {
    id: 'state-240x16x64-flat',
    label: 'Flat comparison: 240 frames / 16 parts / 64 px',
    frameCount: 240,
    partCount: 16,
    textureSize: 64,
    fps: 30,
    hierarchy: 'flat',
    tier: 'device-core',
    note: '同じ状態量で親子chainの影響を比較する。',
  },
  {
    id: 'pixel-60x4x512',
    label: 'Pixel pressure: 60 frames / 4 parts / 512 px',
    frameCount: 60,
    partCount: 4,
    textureSize: 512,
    fps: 30,
    hierarchy: 'chain',
    tier: 'device-core',
    note: 'Frame数が少なくてもsheet pixelが大きい場合を分離する。',
  },
  {
    id: 'combined-240x16x256',
    label: 'Combined: 240 frames / 16 parts / 256 px',
    frameCount: 240,
    partCount: 16,
    textureSize: 256,
    fps: 30,
    hierarchy: 'chain',
    tier: 'device-core',
    note: '状態量とsheet pixelを組み合わせる。自動連続実行は禁止。',
  },
  {
    id: 'node-escalation-480x16x64',
    label: 'Node escalation: 480 frames / 16 parts / 64 px',
    frameCount: 480,
    partCount: 16,
    textureSize: 64,
    fps: 30,
    hierarchy: 'chain',
    tier: 'node-escalation',
    note: '240ケース確認後にNodeで明示指定した場合だけ実行する。',
  },
  {
    id: 'node-escalation-960x16x64',
    label: 'Node escalation: 960 frames / 16 parts / 64 px',
    frameCount: 960,
    partCount: 16,
    textureSize: 64,
    fps: 30,
    hierarchy: 'chain',
    tier: 'node-escalation',
    note: '480ケース確認後にNodeで明示指定した場合だけ実行する。',
  },
] as const;

export interface H3Fixture {
  asset: Asset;
  rig: RigAnimation;
}

export interface H3Sample {
  bakeMs: number;
  serializeMs: number;
  totalMs: number;
}

export interface H3Counts {
  generatedFrames: number;
  finalFrames: number;
  generatedLayerStates: number;
  finalLayerStates: number;
  textures: number;
  compactAssetJsonBytes: number;
  prettyAssetJsonBytes: number;
  sheet: {
    columns: number;
    rows: number;
    width: number;
    height: number;
    pixels: number;
    estimatedRgbaBytes: number;
  };
  estimatedDecodedTextureRgbaBytes: number;
}

export interface H3SummaryMetric {
  median: number;
  p95: number;
}

export interface H3CoreRun {
  fixtureSha256: string;
  l1Valid: boolean;
  warmupIterations: number;
  recordedIterations: number;
  samples: H3Sample[];
  summary: {
    bakeMs: H3SummaryMetric;
    serializeMs: H3SummaryMetric;
    totalMs: H3SummaryMetric;
  };
  counts: H3Counts;
}

export interface H3Environment {
  runtime: 'node' | 'browser' | 'not-run';
  recordedAt: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  userAgent: string | null;
  viewport: { width: number; height: number } | null;
  devicePixelRatio: number | null;
  orientation: string | null;
  lowPowerMode: 'on' | 'off' | 'unknown' | null;
  thermalState: 'normal' | 'warm' | 'hot' | 'unknown' | null;
  cpu: string | null;
  logicalCpuCount: number | null;
  totalMemoryBytes: number | null;
}

export interface H3Capabilities {
  longTask: 'supported' | 'unsupported' | 'not-run';
  jsHeap: 'supported' | 'unsupported' | 'not-run';
  storageEstimate: 'supported' | 'unsupported' | 'not-run';
}

export interface H3Observations {
  longTaskCount: number | null;
  longTaskTotalMs: number | null;
  jsHeapBeforeBytes: number | null;
  jsHeapAfterBytes: number | null;
  storageUsageBytes: number | null;
  storageQuotaBytes: number | null;
}

export interface H3MeasurementResult {
  schemaVersion: typeof H3_SCHEMA_VERSION;
  status: 'measured' | 'measurement-not-run';
  source: {
    repository: typeof H3_REPOSITORY;
    commit: string | null;
    harnessPath: 'tools/h3';
  };
  case: H3Case;
  environment: H3Environment;
  capabilities: H3Capabilities;
  run: {
    warmupIterations: number;
    recordedIterations: number;
    freshFixtureEachIteration: true;
    sequential: true;
  };
  fixture: {
    sha256: string | null;
    l1Valid: boolean | null;
  };
  samples: H3Sample[];
  summary: H3CoreRun['summary'] | null;
  counts: H3Counts | null;
  observations: H3Observations;
  interruptedPreviousRun: { caseId: string; startedAt: string } | null;
  recordComplete: boolean;
  notes: string[];
}

const FIXED_TIME = '2026-07-22T00:00:00.000Z';

export function getH3Case(caseId: string): H3Case | undefined {
  return H3_CASES.find((candidate) => candidate.id === caseId);
}

export function createH3Fixture(definition: H3Case): H3Fixture {
  const textures = Array.from({ length: definition.partCount }, (_, index) => ({
    id: `texture-${index + 1}`,
    kind: 'edit' as const,
    name: `texture-${index + 1}`,
    mimeType: 'image/png' as const,
    size: { width: definition.textureSize, height: definition.textureSize },
    path: `textures/fixture-${index + 1}.png`,
  }));
  const layers = textures.map((texture, index) => ({
    id: `layer-${index + 1}`,
    name: `layer-${index + 1}`,
    layerType: 'image' as const,
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      position: { x: index * 2, y: index * 3 },
      scale: { x: 1, y: 1 },
      rotation: index % 2 === 0 ? 0 : 5,
    },
    textureId: texture.id,
  }));
  const parts = layers.map((layer, index) => ({
    id: `part-${index + 1}`,
    name: `part-${index + 1}`,
    partType: 'other' as const,
    layerIds: [layer.id],
    pivot: { x: definition.textureSize / 2, y: definition.textureSize / 2 },
    ...(definition.hierarchy === 'chain' && index > 0 ? { parentId: `part-${index}` } : {}),
  }));
  const poses = Object.fromEntries(
    parts.map((part, index) => [
      part.id,
      {
        localPosition: { x: index % 3, y: -(index % 2) },
        localRotation: (index % 5) * 2,
        localScale: { x: 1 + (index % 2) * 0.01, y: 1 },
      },
    ]),
  );
  const rig: RigAnimation = {
    id: `rig-${definition.id}`,
    name: definition.id,
    fps: definition.fps,
    loop: true,
    durationMs: (definition.frameCount / definition.fps) * 1000,
    keyframes: [
      { time: 0, poses: {} },
      { time: 0.5, poses },
      {
        time: 1,
        poses: Object.fromEntries(
          Object.entries(poses).map(([partId, pose]) => [
            partId,
            { ...pose, localRotation: -(pose.localRotation ?? 0) },
          ]),
        ),
      },
    ],
  };
  const asset: Asset = {
    format: 'chameleon-asset',
    version: '0.2.0',
    id: `asset-${definition.id}`,
    assetType: 'character',
    name: definition.id,
    displayName: definition.label,
    canvasSize: { width: definition.textureSize, height: definition.textureSize },
    origin: { x: definition.textureSize / 2, y: definition.textureSize },
    textures,
    layers,
    parts,
    anchors: [],
    colliders: [],
    frames: [],
    animations: [],
    tags: ['h3-measurement-fixture'],
    gameAttributes: {},
    rigAnimations: [rig],
    createdAt: FIXED_TIME,
    updatedAt: FIXED_TIME,
  };

  return { asset, rig };
}

export function isL1Fixture(asset: Asset): boolean {
  const layerIds = new Set(asset.layers.map((layer) => layer.id));
  const owners = new Set<string>();

  for (const part of asset.parts) {
    if (part.layerIds.length === 0) {
      return false;
    }
    for (const layerId of part.layerIds) {
      if (!layerIds.has(layerId) || owners.has(layerId)) {
        return false;
      }
      owners.add(layerId);
    }
  }
  return true;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function nearestRankP95(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function summarize(values: readonly number[]): H3SummaryMetric {
  return { median: median(values), p95: nearestRankP95(values) };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function measureOnce(definition: H3Case): { sample: H3Sample; counts: H3Counts } {
  const { asset, rig } = createH3Fixture(definition);
  const startedAt = performance.now();
  const baked = bakeRigAnimation(asset, rig);
  const bakedAt = performance.now();
  const compactJson = JSON.stringify(baked);
  const prettyJson = JSON.stringify(baked, null, 2);
  const serializedAt = performance.now();
  const generatedFrames = (baked.frames?.length ?? 0) - (asset.frames?.length ?? 0);
  const finalFrames = baked.frames?.length ?? 0;
  const generatedLayerStates = (baked.frames ?? [])
    .slice(asset.frames?.length ?? 0)
    .reduce((total, frame) => total + frame.layerStates.length, 0);
  const finalLayerStates = (baked.frames ?? []).reduce(
    (total, frame) => total + frame.layerStates.length,
    0,
  );
  const generatedAnimation = baked.animations[baked.animations.length - 1];
  const layout = computeSheetLayout(
    generatedAnimation?.frameIds ?? [],
    baked.canvasSize.width,
    baked.canvasSize.height,
  );
  const sheetPixels = layout.width * layout.height;
  const decodedTextureBytes = baked.textures.reduce(
    (total, texture) => total + texture.size.width * texture.size.height * 4,
    0,
  );

  return {
    sample: {
      bakeMs: bakedAt - startedAt,
      serializeMs: serializedAt - bakedAt,
      totalMs: serializedAt - startedAt,
    },
    counts: {
      generatedFrames,
      finalFrames,
      generatedLayerStates,
      finalLayerStates,
      textures: baked.textures.length,
      compactAssetJsonBytes: utf8Bytes(compactJson),
      prettyAssetJsonBytes: utf8Bytes(prettyJson),
      sheet: {
        columns: layout.columns,
        rows: layout.rows,
        width: layout.width,
        height: layout.height,
        pixels: sheetPixels,
        estimatedRgbaBytes: sheetPixels * 4,
      },
      estimatedDecodedTextureRgbaBytes: decodedTextureBytes,
    },
  };
}

export async function runH3CoreCase(
  definition: H3Case,
  options: {
    warmupIterations?: number;
    recordedIterations?: number;
    betweenIterations?: () => Promise<void>;
  } = {},
): Promise<H3CoreRun> {
  const warmupIterations = options.warmupIterations ?? H3_WARMUP_ITERATIONS;
  const recordedIterations = options.recordedIterations ?? H3_RECORDED_ITERATIONS;
  if (
    !Number.isInteger(warmupIterations) ||
    !Number.isInteger(recordedIterations) ||
    warmupIterations < 0 ||
    recordedIterations < 1
  ) {
    throw new Error(
      'warmupIterations must be an integer >= 0 and recordedIterations must be an integer >= 1',
    );
  }

  const fixture = createH3Fixture(definition);
  const fixtureJson = JSON.stringify({ definition, fixture });
  const fixtureSha256 = await sha256(fixtureJson);

  for (let index = 0; index < warmupIterations; index += 1) {
    measureOnce(definition);
    await options.betweenIterations?.();
  }

  const samples: H3Sample[] = [];
  let counts: H3Counts | null = null;
  for (let index = 0; index < recordedIterations; index += 1) {
    const measurement = measureOnce(definition);
    samples.push(measurement.sample);
    counts = measurement.counts;
    await options.betweenIterations?.();
  }

  if (!counts) {
    throw new Error('No recorded H3 measurement was produced');
  }

  return {
    fixtureSha256,
    l1Valid: isL1Fixture(fixture.asset),
    warmupIterations,
    recordedIterations,
    samples,
    summary: {
      bakeMs: summarize(samples.map((sample) => sample.bakeMs)),
      serializeMs: summarize(samples.map((sample) => sample.serializeMs)),
      totalMs: summarize(samples.map((sample) => sample.totalMs)),
    },
    counts,
  };
}

export function makeMeasuredResult(input: {
  sourceCommit: string;
  definition: H3Case;
  environment: H3Environment;
  capabilities: H3Capabilities;
  core: H3CoreRun;
  observations: H3Observations;
  interruptedPreviousRun?: { caseId: string; startedAt: string } | null;
  notes?: string[];
}): H3MeasurementResult {
  const recordComplete =
    input.core.l1Valid &&
    input.core.warmupIterations === H3_WARMUP_ITERATIONS &&
    input.core.recordedIterations === H3_RECORDED_ITERATIONS &&
    input.core.samples.length === input.core.recordedIterations;
  if (!recordComplete) {
    throw new Error(
      `Measured H3 evidence requires an L1-valid fixture, ${H3_WARMUP_ITERATIONS} warmups, and ${H3_RECORDED_ITERATIONS} recorded samples`,
    );
  }

  return {
    schemaVersion: H3_SCHEMA_VERSION,
    status: 'measured',
    source: {
      repository: H3_REPOSITORY,
      commit: input.sourceCommit,
      harnessPath: 'tools/h3',
    },
    case: input.definition,
    environment: input.environment,
    capabilities: input.capabilities,
    run: {
      warmupIterations: input.core.warmupIterations,
      recordedIterations: input.core.recordedIterations,
      freshFixtureEachIteration: true,
      sequential: true,
    },
    fixture: { sha256: input.core.fixtureSha256, l1Valid: input.core.l1Valid },
    samples: input.core.samples,
    summary: input.core.summary,
    counts: input.core.counts,
    observations: input.observations,
    interruptedPreviousRun: input.interruptedPreviousRun ?? null,
    recordComplete: true,
    notes: input.notes ?? [],
  };
}
