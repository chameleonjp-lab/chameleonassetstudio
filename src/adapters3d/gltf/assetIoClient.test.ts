import { expect, it } from 'vitest';
import { startAssetIo } from './assetIoClient';
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
  await expect(failed.promise).rejects.toThrow('first launch');
  const next = startAssetIo(
    req,
    () => {},
    () => worker as unknown as Worker,
  );
  next.cancel();
  await expect(next.promise).rejects.toThrow();
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
