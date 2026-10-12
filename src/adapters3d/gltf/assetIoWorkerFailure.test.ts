import { expect, it } from 'vitest';
import { ASSET_IO_WORKER_FAILURE_CODES as C } from '../../core3d/ports/assetIoPort';
import { SOURCE_ONLY_LOSS_APPROVAL_PREFIX } from '../../core3d/import/optionalLoss';
import { classifyAssetIoWorkerFailure, createAssetIoWorkerFailure } from './assetIoWorkerFailure';

it('maps known GLB validation failures to fixed safe codes', () => {
  expect(classifyAssetIoWorkerFailure(new Error('Unsupported required extension'))).toBe(
    C.REQUIRED_EXTENSION,
  );
  expect(
    classifyAssetIoWorkerFailure(
      new Error(
        'External URI or invalid buffer: https://external.invalid/private.glb?token=secret',
      ),
    ),
  ).toBe(C.EXTERNAL_REFERENCE);
  expect(
    classifyAssetIoWorkerFailure(new Error('extensionsUsed declarations exceeds profile limit')),
  ).toBe(C.PROFILE_LIMIT);
  expect(classifyAssetIoWorkerFailure(new Error('Sidecar does not match this GLB'))).toBe(
    C.SIDECAR,
  );
  expect(classifyAssetIoWorkerFailure(new Error('Image must be embedded PNG/JPEG'))).toBe(C.IMAGE);
  expect(classifyAssetIoWorkerFailure(new Error('Invalid extensionsUsed declarations'))).toBe(
    C.FORMAT,
  );
});

it('maps accessor and index range validation failures to the fixed GLB format code', () => {
  for (const message of [
    'Accessor outside bufferView',
    'Non-finite accessor',
    'Index exceeds positions',
  ])
    expect(classifyAssetIoWorkerFailure(new Error(message))).toBe(C.FORMAT);
});

it('transports only bounded optional-loss names in a dedicated fixed worker response', () => {
  const names = ['VENDOR_optional', '拡張_🦎\n'],
    request = new Error(SOURCE_ONLY_LOSS_APPROVAL_PREFIX + JSON.stringify(names));
  expect(classifyAssetIoWorkerFailure(request)).toBe(C.LOSS_APPROVAL_REQUIRED);
  expect(createAssetIoWorkerFailure(request)).toEqual({
    kind: 'error',
    code: C.LOSS_APPROVAL_REQUIRED,
    losses: names,
  });

  for (const invalid of [['duplicate', 'duplicate'], ['x'.repeat(129)]]) {
    const failure = createAssetIoWorkerFailure(
      new Error(SOURCE_ONLY_LOSS_APPROVAL_PREFIX + JSON.stringify(invalid)),
    );
    expect(failure).toEqual({ kind: 'error', code: C.WORKER });
  }
});

it('falls back to a generic code for unrecognized and non-Error failures', () => {
  expect(classifyAssetIoWorkerFailure(new Error('file:///private/SECRET.glb?token=secret'))).toBe(
    C.WORKER,
  );
  expect(classifyAssetIoWorkerFailure('Invalid file:///private/SECRET.glb?token=secret')).toBe(
    C.WORKER,
  );
});
