import { expect, it } from 'vitest';
import { startAssetIo } from './assetIoClient';
import {
  ASSET_IO_WORKER_FAILURE_CODE,
  ASSET_IO_WORKER_FAILURE_CODES as C,
} from '../../core3d/ports/assetIoPort';
import { assetIoReservedBytes } from '../../core3d/profile/assetIoProfile';
it('terminates on cancel, rejects late results, and releases ownership after first worker failure', async () => {
  let terminated = 0;
  const worker = {
    terminate: () => terminated++,
    postMessage: () => {},
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
  const req = {
    kind: 'import' as const,
    bytes: new Uint8Array([1]),
    projectId: 'p',
    allowLoss: false,
  };
  const job = startAssetIo(
    req,
    () => {},
    () => worker as unknown as Worker,
  );
  job.cancel();
  await expect(job.promise).rejects.toThrow('cancelled');
  expect(terminated).toBe(1);
  const failed = startAssetIo(
    req,
    () => {},
    () => {
      throw Error('first launch');
    },
  );
  await expect(failed.promise).rejects.toThrow('Asset worker failed; original project retained');
  const next = startAssetIo(
    req,
    () => {},
    () => worker as unknown as Worker,
  );
  next.cancel();
  await expect(next.promise).rejects.toThrow();
});

it('ignores a queued worker result after cancellation and releases its reservation once', async () => {
  let terminated = 0;
  const worker = {
    terminate: () => terminated++,
    postMessage: () => {},
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null,
    onmessageerror: null,
  };
  const before = assetIoReservedBytes();
  const job = startAssetIo(
    {
      kind: 'import',
      bytes: new Uint8Array([1]),
      projectId: 'p',
      allowLoss: false,
    },
    () => {},
    () => worker as unknown as Worker,
  );
  const deliverQueuedResult = worker.onmessage!;

  job.cancel();
  await expect(job.promise).rejects.toThrow('cancelled');
  expect(terminated).toBe(1);
  expect(assetIoReservedBytes()).toBe(before);

  deliverQueuedResult({ data: { kind: 'result', result: {} } } as MessageEvent);
  expect(terminated).toBe(1);
  expect(assetIoReservedBytes()).toBe(before);
});

it('ignores raw worker failure text and exposes only the fixed safe failure', async () => {
  let terminated = 0;
  const worker = {
    terminate: () => terminated++,
    postMessage: () => {},
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null,
    onmessageerror: null,
  };
  const job = startAssetIo(
    {
      kind: 'import',
      bytes: new Uint8Array([1]),
      projectId: 'p',
      allowLoss: false,
    },
    () => {},
    () => worker as unknown as Worker,
  );
  worker.onmessage?.({
    data: {
      kind: 'error',
      code: ASSET_IO_WORKER_FAILURE_CODE,
      message: 'file:///private/SECRET-FILENAME.glb?token=SECRET-TOKEN',
    },
  } as MessageEvent);
  let failure: unknown;
  try {
    await job.promise;
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe('Asset worker failed; original project retained');
  expect((failure as Error).message).not.toMatch(/SECRET|private|token/i);
  expect(terminated).toBe(1);
});

it('maps allowlisted worker failure codes to fixed messages without forwarding raw text', async () => {
  const cases = [
    { code: C.REQUIRED_EXTENSION, message: 'Unsupported required extension' },
    { code: C.EXTERNAL_REFERENCE, message: 'External URI or invalid buffer' },
    { code: C.SIDECAR, message: 'Sidecar does not match this GLB' },
    { code: C.IMAGE, message: 'Image validation failed' },
    { code: C.FORMAT, message: 'Malformed or invalid GLB' },
    { code: C.PROFILE_LIMIT, message: 'Asset I/O exceeds profile limit' },
    { code: 'ASSET_IO_UNTRUSTED' as const, message: 'Invalid asset worker response' },
  ];
  for (const sample of cases) {
    const worker = {
      terminate: () => {},
      postMessage: () => {},
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null,
      onmessageerror: null,
    };
    const job = startAssetIo(
      { kind: 'import', bytes: new Uint8Array([1]), projectId: 'p', allowLoss: false },
      () => {},
      () => worker as unknown as Worker,
    );
    worker.onmessage?.({
      data: {
        kind: 'error',
        code: sample.code,
        message: 'file:///private/SECRET-FILENAME.glb?token=SECRET-TOKEN',
      },
    } as MessageEvent);
    await expect(job.promise).rejects.toThrow(sample.message);
  }
});

it('sanitizes worker construction and postMessage exceptions', async () => {
  const secret = 'file:///private/SECRET-FILENAME.glb?token=SECRET-TOKEN';
  const failedFactory = startAssetIo(
    {
      kind: 'import',
      bytes: new Uint8Array([1]),
      projectId: 'p',
      allowLoss: false,
    },
    () => {},
    () => {
      throw new Error(secret);
    },
  );
  await expect(failedFactory.promise).rejects.toThrow(
    'Asset worker failed; original project retained',
  );
  const failedPost = startAssetIo(
    {
      kind: 'import',
      bytes: new Uint8Array([1]),
      projectId: 'p',
      allowLoss: false,
    },
    () => {},
    () =>
      ({
        terminate: () => {},
        postMessage: () => {
          throw new Error(secret);
        },
      }) as unknown as Worker,
  );
  await expect(failedPost.promise).rejects.toThrow(
    'Asset worker failed; original project retained',
  );
});

it('rejects oversized sidecar before constructing a worker', () => {
  let called = false;
  expect(() =>
    startAssetIo(
      {
        kind: 'import',
        bytes: new Uint8Array(1),
        sidecar: new Uint8Array(8 * 1024 * 1024 + 1),
        projectId: 'p',
        allowLoss: false,
      },
      () => {},
      () => {
        called = true;
        throw Error();
      },
    ),
  ).toThrow('Sidecar');
  expect(called).toBe(false);
});

it('inspection uses the same exclusive worker and releases its memory ticket on cancel', async () => {
  const { captureInspectionSnapshot } = await import('../../core3d/inspection/report');
  const { nativeBox } = await import('../../core3d/fixtures/nativeBox');
  const { assetIoReservedBytes } = await import('../../core3d/profile/assetIoProfile');
  const snapshot = captureInspectionSnapshot(nativeBox(), () => new Uint8Array());
  let terminated = 0;
  const worker = { postMessage: () => {}, terminate: () => terminated++ } as unknown as Worker;
  const job = startAssetIo(
    { kind: 'inspect', snapshot },
    () => {},
    () => worker,
  );
  expect(assetIoReservedBytes()).toBe(snapshot.estimatedBytes);
  expect(() =>
    startAssetIo(
      { kind: 'inspect', snapshot },
      () => {},
      () => worker,
    ),
  ).toThrow('Another');
  job.cancel();
  await expect(job.promise).rejects.toThrow('cancelled');
  expect(terminated).toBe(1);
  expect(assetIoReservedBytes()).toBe(0);
});
