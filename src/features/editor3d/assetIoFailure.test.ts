import { nativeBox } from '../../core3d/fixtures/nativeBox';
import { captureAssetSnapshot } from '../../core3d/export/snapshot';
import { exportGlb, encodeGlb } from '../../adapters3d/gltf/export';
import { importGlb } from '../../adapters3d/gltf/import';
import { preflightGlb } from '../../core3d/import/preflight';
import { describe, expect, it, vi } from 'vitest';
import { ASSET_IO_PROFILE as P } from '../../core3d/profile/assetIoProfile';
import {
  describeAssetIoFailure,
  formatAssetIoFailure,
  readAssetIoLossRequest,
} from './assetIoFailure';

const cases = [
  ['Unsupported required extension', 'IO_REQUIRED_EXTENSION'],
  ['External URI or invalid buffer', 'IO_EXTERNAL_REFERENCE'],
  ['Sidecar does not match this GLB', 'IO_SIDECAR'],
  ['Provenance ancestry exceeds profile; retain original backup', 'IO_PROFILE_LIMIT'],
  ['Worker peak estimate exceeds cas3d-basic-gltf2-v1', 'IO_PROFILE_LIMIT'],
  ['extensionsUsed name exceeds cas3d-basic-gltf2-v1', 'IO_PROFILE_LIMIT'],
  ['Invalid extensionsRequired declarations', 'IO_FORMAT'],
  ['Another asset I/O job is active', 'IO_BUSY'],
  ['Key time exceeds Float32 seconds error budget', 'IO_ANIMATION'],
  ['Key times collapse in Float32', 'IO_ANIMATION'],
  ['Float32 overflow', 'IO_NUMERIC'],
  ['Skin joint is outside selected scene', 'IO_RIG'],
  ['Textured face requires explicit UV', 'IO_GEOMETRY'],
  ['Image MIME mismatch', 'IO_IMAGE'],
  ['Missing source blob', 'IO_SOURCE'],
  ['Source hash mismatch', 'IO_SOURCE'],
  ['出力結果のrevisionが一致しません。', 'IO_CHANGED_TARGET'],
  ['Asset worker failed; original project retained', 'IO_WORKER'],
  ['Failed to fetch dynamically imported module: https://private.invalid/token', 'IO_WORKER'],
  ['Sparse accessor is source-only', 'IO_GEOMETRY'],
  ['Shear/projective matrix is source-only', 'IO_UNSUPPORTED'],
  ['Truncated GLB', 'IO_FORMAT'],
  ['completely unexpected failure', 'IO_UNKNOWN'],
] as const;
describe('fixed asset I/O failure guidance', () => {
  it.each(cases)('classifies %s without forwarding raw exception content', (message, code) => {
    const secret = 'file:///private/SECRET-FILENAME.glb?token=SECRET-TOKEN';
    for (const cause of [message + ' ' + secret, new Error(message + ' ' + secret)]) {
      const result = describeAssetIoFailure(cause, 'import');
      expect(result.code).toBe(code);
      expect(result.target).toBe('GLBの取込');
      expect(result.reason).toMatch(/[ぁ-んァ-ヶ一-龠]/);
      expect(result.action).toMatch(/[ぁ-んァ-ヶ一-龠]/);
      expect(JSON.stringify(result)).not.toMatch(/SECRET|private\.invalid|file:\/\//);
      expect(Object.isFrozen(result)).toBe(true);
      expect(formatAssetIoFailure(cause, 'import')).toContain(`[${code}]`);
    }
  });
  it.each([
    ['AbortError', 'IO_CANCELLED'],
    ['QuotaExceededError', 'IO_STORAGE'],
    ['NotReadableError', 'IO_FILE_READ'],
  ])('uses a native %s name without disclosing its message', (name, code) => {
    const result = describeAssetIoFailure(new DOMException('PRIVATE', name), 'download');
    expect(result.code).toBe(code);
    expect(result.target).toBe('生成ファイルの保存');
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('does not call unknown toString, message or stack getters', () => {
    const called = vi.fn(() => {
      throw new Error('must not be called');
    });
    const unknown = {
      get message() {
        return called();
      },
      toString: called,
    };
    expect(describeAssetIoFailure(unknown, 'export').code).toBe('IO_UNKNOWN');
    const error = new Error();
    Object.defineProperty(error, 'message', { get: called });
    Object.defineProperty(error, 'stack', { get: called });
    expect(describeAssetIoFailure(error, 'export').code).toBe('IO_UNKNOWN');
    expect(called).not.toHaveBeenCalled();
  });
  it.each([null, undefined, 42, Symbol('private'), {}, ['private']])(
    'bounds unknown values',
    (cause) => {
      const result = formatAssetIoFailure(cause, 'export');
      expect(result).toContain('ゲーム用ファイルの作成');
      expect(result).toContain('IO_UNKNOWN');
      expect(result.length).toBeLessThan(600);
    },
  );
  it('does not match a secret tail beyond the bounded recognition window', () => {
    expect(describeAssetIoFailure('x'.repeat(5000) + ' QuotaExceededError', 'import').code).toBe(
      'IO_UNKNOWN',
    );
  });
  it('distinguishes preservation, waiting and correction without automatically retrying', () => {
    expect(describeAssetIoFailure(new DOMException('', 'QuotaExceededError'), 'import').retry).toBe(
      'after-preservation',
    );
    expect(describeAssetIoFailure('Another job active', 'import').retry).toBe('after-wait');
    expect(describeAssetIoFailure('Unsupported required extension', 'import').retry).toBe(
      'after-fix',
    );
  });
});

describe('bounded explicit loss request', () => {
  const prefix = 'Source-only features require explicit loss approval: ';
  it('preserves ordinary optional-loss names without granting approval', () => {
    const expected = ['KHR_materials_unlit', 'cameras'];
    expect(readAssetIoLossRequest(new Error(prefix + JSON.stringify(expected)))).toEqual(expected);
    expect(readAssetIoLossRequest(prefix + JSON.stringify(['日本語 extension']))).toEqual([
      '日本語 extension',
    ]);
  });
  it('allows the admitted declaration boundary plus bounded built-in notices', () => {
    const losses = Array.from({ length: P.extensionDeclarations + 32 }, (_, index) =>
      String(index).padEnd(P.extensionNameChars, 'x'),
    );
    expect(readAssetIoLossRequest(prefix + JSON.stringify(losses))).toEqual(losses);
  });
  it.each(['', 'Source-only features require explicit loss approval:', 'Other failure'])(
    'ignores non-requests %s',
    (text) => {
      expect(readAssetIoLossRequest(text)).toBeNull();
    },
  );
  it('rejects empty, oversized or too numerous labels rather than silently truncating approval', () => {
    expect(readAssetIoLossRequest(prefix)).toBeNull();
    expect(
      readAssetIoLossRequest(prefix + JSON.stringify(['x'.repeat(P.extensionNameChars + 1)])),
    ).toBeNull();
    expect(
      readAssetIoLossRequest(
        prefix +
          JSON.stringify(Array.from({ length: P.extensionDeclarations + 33 }, (_, i) => String(i))),
      ),
    ).toBeNull();
    expect(readAssetIoLossRequest(prefix + 'x, , y')).toBeNull();
  });
  it.each([[], [42], {}, ['x', 'x'], [''], null])(
    'rejects malformed or repeated labels %j',
    (value) => {
      expect(readAssetIoLossRequest(prefix + JSON.stringify(value))).toBeNull();
    },
  );
  it('reads the real adapter loss request without splitting extension names', async () => {
    const fixture = await exportGlb(captureAssetSnapshot(nativeBox(), () => new Uint8Array()));
    const decoded = preflightGlb(fixture.bytes);
    const names = ['VENDOR_foo, ', 'VENDOR_foo, bar', ' 拡張_🦎\n'];
    decoded.json.extensionsUsed = names;
    const bytes = encodeGlb(decoded.json, decoded.binary);
    const original = bytes.slice();
    let failure: unknown;
    try {
      await importGlb(bytes, 'loss-contract');
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    expect(readAssetIoLossRequest(failure)).toEqual(names);
    expect(bytes).toEqual(original);
  });
  it('round trips punctuation, escaped controls and surrogate names exactly', () => {
    const values = ['VENDOR_foo, ', 'VENDOR_foo, bar', '"\\\n', '\u0000'.repeat(128), '\ud800'];
    expect(readAssetIoLossRequest(prefix + JSON.stringify(values))).toEqual(values);
  });
  it('does not stringify unknown exception objects for loss approval', () => {
    const string = vi.fn(() => prefix + 'unknown');
    expect(readAssetIoLossRequest({ toString: string })).toBeNull();
    expect(string).not.toHaveBeenCalled();
  });
});
