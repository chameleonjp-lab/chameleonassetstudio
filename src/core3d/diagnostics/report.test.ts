import { describe, expect, it } from 'vitest';
import {
  buildDiagnosticReport,
  detectDiagnosticBrowser,
  DIAGNOSTIC_ERROR_IDS,
  DIAGNOSTIC_FEATURES,
  DIAGNOSTIC_LIMITS,
  serializeDiagnosticReport,
  type DiagnosticReport,
  type DiagnosticReportInput,
} from './report';

const input: DiagnosticReportInput = {
  appVersion: '0.1.0',
  sourceRevision: '0123456789abcdef0123456789abcdef01234567',
  sourceDirty: true,
  schemaVersion: '0.3.0',
  errorId: 'save-failed',
  feature: 'storage',
  browser: { family: 'Chrome', majorVersion: 140 },
};

describe('local allowlisted diagnostics', () => {
  it('records build metadata separately from the project schema and stable error category', () => {
    expect(buildDiagnosticReport(input)).toEqual({ reportVersion: 1, ...input });
    const text = serializeDiagnosticReport(buildDiagnosticReport(input));
    expect(text).toContain('アプリ版: 0.1.0');
    expect(text).toContain('3D保存形式の schema 版: 0.3.0');
    expect(text).toContain('ビルド時のローカル変更: あり');
    expect(text).toContain('エラー ID: save-failed');
  });

  it('does not collect arbitrary error objects, paths, URLs, project IDs, names or bytes', () => {
    const secret = 'PRIVATE_TOKEN /Users/private/secret.glb https://private.example/?token=SECRET';
    const malicious = {
      ...input,
      error: new Error(secret),
      message: secret,
      stack: secret,
      project: { id: secret, name: secret, materials: [secret], blobIds: [secret] },
      projectId: secret,
      filename: secret,
      url: secret,
      token: secret,
      reproductionSteps: secret,
      userAgent: secret,
      browser: { ...input.browser, fullUserAgent: secret, device: secret, platform: secret },
    };
    const report = buildDiagnosticReport(malicious);
    expect(report).toEqual(buildDiagnosticReport(input));
    expect(serializeDiagnosticReport(report, 'json')).not.toContain('PRIVATE_TOKEN');
    expect(serializeDiagnosticReport(report)).not.toContain('SECRET');
    expect(report).not.toHaveProperty('reproductionSteps');
  });

  it.each([
    'PRIVATE_TOKEN',
    'https://example.test/?token=PRIVATE_TOKEN',
    '/Users/private/file.glb',
    '0.1.0-PRIVATE_TOKEN',
    '0.1.0+PRIVATE_TOKEN',
    '0.1.0\nPRIVATE_TOKEN',
    '0.1.0\n',
    '01.1.0',
    '10000.0.0',
    '',
  ])('never echoes an invalid version or enumeration: %j', (value) => {
    const report = buildDiagnosticReport({
      appVersion: value,
      sourceRevision: value,
      sourceDirty: value,
      schemaVersion: value,
      errorId: value,
      feature: value,
      browser: { family: value, majorVersion: value },
    });
    expect(report).toEqual({
      reportVersion: 1,
      appVersion: 'unknown',
      sourceRevision: 'unknown',
      sourceDirty: 'unknown',
      schemaVersion: 'unknown',
      errorId: 'unknown',
      feature: 'unknown',
      browser: { family: 'unknown', majorVersion: null },
    });
  });

  it('validates full revision hex and never accepts branch names or newline-terminated hashes', () => {
    for (const invalid of [
      'abcdef0',
      'g'.repeat(40),
      'a'.repeat(41),
      'a'.repeat(63),
      `${'a'.repeat(40)}\n`,
      'refs/heads/private',
    ])
      expect(buildDiagnosticReport({ ...input, sourceRevision: invalid }).sourceRevision).toBe(
        'unknown',
      );
    for (const valid of ['A'.repeat(40), 'B'.repeat(64)])
      expect(buildDiagnosticReport({ ...input, sourceRevision: valid }).sourceRevision).toBe(
        valid.toLowerCase(),
      );
  });

  it('accepts each fixed error ID and feature but never arbitrary identifiers', () => {
    for (const errorId of DIAGNOSTIC_ERROR_IDS)
      expect(buildDiagnosticReport({ ...input, errorId }).errorId).toBe(errorId);
    for (const feature of DIAGNOSTIC_FEATURES)
      expect(buildDiagnosticReport({ ...input, feature }).feature).toBe(feature);
    expect(Math.max(...DIAGNOSTIC_ERROR_IDS.map((value) => value.length))).toBeLessThan(32);
    expect(
      buildDiagnosticReport({
        ...input,
        errorId: 'save-failed/PRIVATE_TOKEN',
        feature: 'editor PRIVATE_TOKEN',
      }),
    ).toMatchObject({ errorId: 'unknown', feature: 'unknown' });
  });

  it('accepts only actual booleans for build dirty status', () => {
    expect(buildDiagnosticReport({ ...input, sourceDirty: false }).sourceDirty).toBe(false);
    for (const sourceDirty of ['false', 'true', 0, 1, null, undefined, {}])
      expect(buildDiagnosticReport({ ...input, sourceDirty }).sourceDirty).toBe('unknown');
  });

  it('does not inspect prototypes, getters, toString or toJSON hooks', () => {
    const throwSecret = () => {
      throw new Error('PRIVATE_TOKEN');
    };
    const hostile = Object.create({
      appVersion: '0.1.0',
      errorId: 'save-failed',
      feature: 'storage',
    });
    for (const key of [
      'sourceRevision',
      'sourceDirty',
      'schemaVersion',
      'browser',
      'reproductionSteps',
    ])
      Object.defineProperty(hostile, key, { get: throwSecret });
    hostile.toString = throwSecret;
    hostile.toJSON = throwSecret;
    expect(buildDiagnosticReport(hostile)).toEqual(buildDiagnosticReport(null));
    expect(
      buildDiagnosticReport({
        ...input,
        appVersion: { toString: throwSecret },
        errorId: new Error('PRIVATE_TOKEN'),
      }),
    ).toMatchObject({ appVersion: 'unknown', errorId: 'unknown' });
    expect(buildDiagnosticReport(new Proxy({}, { getOwnPropertyDescriptor: throwSecret }))).toEqual(
      buildDiagnosticReport(null),
    );
  });

  it('handles missing or non-record inputs without exposing their contents', () => {
    for (const value of [
      undefined,
      null,
      'PRIVATE_TOKEN',
      9,
      false,
      new Error('PRIVATE_TOKEN'),
      [],
      Symbol('PRIVATE_TOKEN'),
    ])
      expect(buildDiagnosticReport(value)).toEqual(buildDiagnosticReport({}));
  });

  it('does not mutate frozen inputs, errors, browser data or user text', () => {
    const browser = Object.freeze({ family: 'Safari' as const, majorVersion: 26 });
    const original = Object.freeze({
      ...input,
      browser,
      error: Object.freeze(new Error('PRIVATE_TOKEN')),
    });
    const before = JSON.stringify(original);
    const steps = '  編集を開く\r\n保存を押す  ';
    const report = buildDiagnosticReport(original, steps);
    serializeDiagnosticReport(report, 'json');
    serializeDiagnosticReport(report);
    expect(JSON.stringify(original)).toBe(before);
    expect(report.browser).not.toBe(browser);
    expect(steps).toBe('  編集を開く\r\n保存を押す  ');
    expect(report.reproductionSteps).toBe('編集を開く\n保存を押す');
  });

  it('includes reproduction steps only through the separate explicit user-text argument', () => {
    const automatic = { ...input, reproductionSteps: 'PRIVATE_TOKEN' };
    expect(buildDiagnosticReport(automatic)).not.toHaveProperty('reproductionSteps');
    expect(buildDiagnosticReport(automatic, '箱を作る\n保存を押す').reproductionSteps).toBe(
      '箱を作る\n保存を押す',
    );
    expect(buildDiagnosticReport(input, { message: 'PRIVATE_TOKEN' })).not.toHaveProperty(
      'reproductionSteps',
    );
    expect(buildDiagnosticReport(input, ' \n\t ')).not.toHaveProperty('reproductionSteps');
  });

  it('removes control/bidi characters and does not split a surrogate pair at the bound', () => {
    expect(
      buildDiagnosticReport(
        input,
        'A\u0000B\u001bC\u007fD\u009fE\u202eF\u2066G\u200bH\ufeffI\ud800J\r\nK',
      ).reproductionSteps,
    ).toBe('ABCDEFGHIJ\nK');
    expect(
      buildDiagnosticReport(input, `${'a'.repeat(DIAGNOSTIC_LIMITS.reproductionCharacters - 1)}😀`)
        .reproductionSteps,
    ).toBe('a'.repeat(DIAGNOSTIC_LIMITS.reproductionCharacters - 1));
    expect(buildDiagnosticReport(input, '😀'.repeat(2000)).reproductionSteps?.length).toBe(
      DIAGNOSTIC_LIMITS.reproductionCharacters,
    );
  });

  it('bounds both serializers even for maximum-length escaped user writing', () => {
    for (const character of ['<', '>', '&', '"', '\\', '\u2028', '\u2029', 'あ', '😀']) {
      const report = buildDiagnosticReport(
        {
          ...input,
          appVersion: '9999.9999.9999',
          sourceRevision: 'a'.repeat(64),
          schemaVersion: '9999.9999.9999',
        },
        `x${character}x`.repeat(50_000),
      );
      expect(report.reproductionSteps!.length).toBeLessThanOrEqual(
        DIAGNOSTIC_LIMITS.reproductionCharacters,
      );
      for (const format of ['text', 'json'] as const)
        expect(serializeDiagnosticReport(report, format).length).toBeLessThanOrEqual(
          DIAGNOSTIC_LIMITS.reportCharacters,
        );
    }
  });

  it('creates valid escaped JSON and literal plaintext without treating writing as HTML', () => {
    const steps = '<script>alert("sample")</script> & \u2028next\nline';
    const report = buildDiagnosticReport(input, steps);
    const json = serializeDiagnosticReport(report, 'json');
    expect(JSON.parse(json)).toEqual(report);
    expect(json).not.toContain('<script>');
    expect(json).not.toContain('&');
    expect(json).not.toContain('\u2028');
    expect(serializeDiagnosticReport(report)).toContain(steps);
  });

  it('revalidates forged reports and ignores extra properties at serialization time', () => {
    const forged = {
      ...buildDiagnosticReport(input),
      sourceRevision: 'PRIVATE_TOKEN',
      errorId: 'PRIVATE_TOKEN',
      browser: { family: 'PRIVATE_TOKEN', majorVersion: 99999 },
      secret: 'PRIVATE_TOKEN',
      toJSON: () => ({ secret: 'PRIVATE_TOKEN' }),
    } as unknown as DiagnosticReport;
    for (const format of ['text', 'json'] as const)
      expect(serializeDiagnosticReport(forged, format)).not.toContain('PRIVATE_TOKEN');
  });
});

describe('coarse browser identification', () => {
  it.each([
    ['Chrome/140.0.7339.10 Safari/537.36', 'Chrome', 140],
    ['Chrome/140.0.0.0 Safari/537.36 Edg/140.0.1.4', 'Edge', 140],
    ['Chrome/140.0.0.0 EdgA/140.0.1.4', 'Edge', 140],
    ['Version/26.0 Mobile/PRIVATE_TOKEN Safari/604.1 EdgiOS/139.0', 'Edge', 139],
    ['Firefox/143.0', 'Firefox', 143],
    ['FxiOS/143.4 Mobile/PRIVATE_TOKEN Safari/605.1', 'Firefox', 143],
    ['CriOS/140.4 Mobile/PRIVATE_TOKEN Safari/605.1', 'Chrome', 140],
    ['Version/26.2 Mobile/PRIVATE_TOKEN Safari/605.1.15', 'Safari', 26],
    ['Chrome/139.0 Safari/537.36 OPR/121.0', 'Opera', 121],
    ['Version/26.0 OPiOS/4.4 Safari/604.1', 'Opera', 4],
    ['SamsungBrowser/28.0 Chrome/136.0 Safari/537.36', 'Samsung Internet', 28],
  ])('summarizes %s without retaining device or patch data', (ua, family, majorVersion) => {
    const browser = detectDiagnosticBrowser(
      `Mozilla/5.0 (PRIVATE_TOKEN /Users/private/device) ${ua}`,
    );
    expect(browser).toEqual({ family, majorVersion });
    expect(JSON.stringify(browser)).not.toContain('PRIVATE_TOKEN');
    expect(Object.keys(browser)).toEqual(['family', 'majorVersion']);
  });

  it.each([
    undefined,
    null,
    {},
    'PRIVATE_TOKEN',
    'Version/26.0 unknown',
    'Chrome/1000.0',
    'Chrome/140PRIVATE_TOKEN',
    'A'.repeat(DIAGNOSTIC_LIMITS.userAgentCharacters + 1),
  ])('uses unknown for unsupported, invalid or excessive UA input', (ua) => {
    expect(detectDiagnosticBrowser(ua)).toEqual({ family: 'unknown', majorVersion: null });
  });

  it('accepts only bounded integer browser versions and an allowlisted family', () => {
    for (const majorVersion of [
      null,
      '140',
      '140.1/PRIVATE_TOKEN',
      -1,
      0,
      1000,
      140.1,
      Infinity,
      NaN,
      {},
    ])
      expect(
        buildDiagnosticReport({ ...input, browser: { family: 'Chrome', majorVersion } }).browser,
      ).toEqual({ family: 'Chrome', majorVersion: null });
    expect(
      buildDiagnosticReport({ ...input, browser: { family: 'unknown', majorVersion: 140 } })
        .browser,
    ).toEqual({ family: 'unknown', majorVersion: null });
  });
});
