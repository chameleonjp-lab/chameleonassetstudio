import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

import resultSchema from './result.schema.json';
import resultTemplate from './result.template.json';
import {
  H3_CASES,
  createH3Fixture,
  isL1Fixture,
  makeMeasuredResult,
  runH3CoreCase,
} from './matrix';

describe('H3 measurement matrix', () => {
  it('keeps every fixture non-empty and single-owner under L1', () => {
    for (const definition of H3_CASES) {
      const fixture = createH3Fixture(definition);
      expect(isL1Fixture(fixture.asset)).toBe(true);
      expect(fixture.asset.parts).toHaveLength(definition.partCount);
      expect(fixture.asset.layers).toHaveLength(definition.partCount);
      expect(fixture.rig.keyframes.map((keyframe) => keyframe.time)).toEqual([0, 0.5, 1]);
    }
  });

  it('uses explicit Node-only escalation cases after the 240-frame device matrix', () => {
    expect(
      H3_CASES.filter((definition) => definition.tier === 'node-escalation').map(
        (definition) => definition.frameCount,
      ),
    ).toEqual([480, 960]);
    expect(
      H3_CASES.filter((definition) => definition.tier === 'device-core').map(
        (definition) => definition.frameCount,
      ),
    ).toEqual([60, 120, 240, 240, 60, 240]);
  });

  it('measures the real bake and sheet-layout functions without numeric gates', async () => {
    const expectedSheetBytes = [
      1_048_576, 31_719_424, 3_932_160, 3_932_160, 67_108_864, 62_914_560, 7_929_856, 15_745_024,
    ];
    for (const [index, definition] of H3_CASES.entries()) {
      const core = await runH3CoreCase(definition, {
        warmupIterations: 0,
        recordedIterations: 1,
      });
      expect(core.l1Valid).toBe(true);
      expect(core.fixtureSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(core.counts.generatedFrames).toBe(definition.frameCount);
      expect(core.counts.generatedLayerStates).toBe(definition.frameCount * definition.partCount);
      expect(core.counts.sheet.estimatedRgbaBytes).toBe(expectedSheetBytes[index]);
    }
  });

  it('keeps the template and produced result compatible with the evidence schema', async () => {
    const validate = new Ajv2020({ allErrors: true }).compile(resultSchema);
    expect(
      validate(resultTemplate),
      validate.errors?.map((error) => error.message).join(', '),
    ).toBe(true);
    const falseMeasuredResult = structuredClone(resultTemplate);
    falseMeasuredResult.status = 'measured';
    expect(validate(falseMeasuredResult)).toBe(false);

    const definition = H3_CASES[0];
    const core = await runH3CoreCase(definition, {
      warmupIterations: 0,
      recordedIterations: 1,
    });
    const result = makeMeasuredResult({
      sourceCommit: '20871f7',
      definition,
      environment: {
        runtime: 'node',
        recordedAt: '2026-07-22T00:00:00.000Z',
        device: 'fixture',
        os: 'fixture',
        browser: null,
        userAgent: 'Node fixture',
        viewport: null,
        devicePixelRatio: null,
        orientation: null,
        lowPowerMode: null,
        thermalState: null,
        cpu: 'fixture',
        logicalCpuCount: 1,
        totalMemoryBytes: 1,
      },
      capabilities: { longTask: 'not-run', jsHeap: 'not-run', storageEstimate: 'not-run' },
      core,
      observations: {
        longTaskCount: null,
        longTaskTotalMs: null,
        jsHeapBeforeBytes: null,
        jsHeapAfterBytes: null,
        storageUsageBytes: null,
        storageQuotaBytes: null,
      },
    });
    result.run.warmupIterations = 0;
    result.run.recordedIterations = 1;
    expect(validate(result), validate.errors?.map((error) => error.message).join(', ')).toBe(true);
  });
});
