import { expect, it } from 'vitest';
import { ASSET_IO_WORKER_FAILURE_CODES as C } from '../../core3d/ports/assetIoPort';
import { classifyAssetIoWorkerFailure } from './assetIoWorkerFailure';

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

it('falls back to a generic code for unrecognized and non-Error failures', () => {
  expect(classifyAssetIoWorkerFailure(new Error('file:///private/SECRET.glb?token=secret'))).toBe(
    C.WORKER,
  );
  expect(classifyAssetIoWorkerFailure('Invalid file:///private/SECRET.glb?token=secret')).toBe(
    C.WORKER,
  );
});
