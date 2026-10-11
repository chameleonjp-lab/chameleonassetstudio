import { afterEach, expect, it, vi } from 'vitest';
import { readDeployedBuild, BUILD_INFORMATION_MAX_BYTES } from './updateInformation';
const build = {
  format: 'chameleon-build-info-1',
  appVersion: '0.1.0',
  sourceRevision: 'a'.repeat(40),
  sourceDirty: false,
  nativeSchemaVersion: '0.3.0',
};
afterEach(() => vi.unstubAllGlobals());
it('requests only fixed same-origin metadata with no project payload and no redirects', async () => {
  vi.stubGlobal('location', { origin: 'https://studio.example' });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(build));
  expect(
    await readDeployedBuild('https://studio.example/base/', new AbortController().signal, fetcher),
  ).toEqual(build);
  expect(String(fetcher.mock.calls[0][0])).toBe(
    'https://studio.example/base/native-build-info.json',
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: 'error',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body');
  await expect(
    readDeployedBuild('https://other.example/', new AbortController().signal, fetcher),
  ).rejects.toThrow('同じサイト');
  await expect(
    readDeployedBuild(
      'https://secret:token@studio.example/',
      new AbortController().signal,
      fetcher,
    ),
  ).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('bounds streamed metadata without trusting a missing or dishonest content length', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(BUILD_INFORMATION_MAX_BYTES + 1));
    },
    cancel,
  });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
  await expect(
    readDeployedBuild('https://studio.example/', new AbortController().signal, fetcher),
  ).rejects.toThrow('上限');
  expect(cancel).toHaveBeenCalledOnce();
});
it('rejects offline, malformed and aborted responses without treating them as an update', async () => {
  for (const response of [
    new Response('not JSON'),
    Response.json({ ...build, url: 'https://secret' }),
    new Response('oops', { status: 404 }),
  ]) {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(
      readDeployedBuild('https://studio.example/', new AbortController().signal, fetcher),
    ).rejects.toThrow();
  }
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(build));
  await expect(
    readDeployedBuild('https://studio.example/', controller.signal, fetcher),
  ).rejects.toThrow();
});
