import {
  parseBuildInformation,
  type AppBuildInformation,
} from '../../core3d/diagnostics/buildInfo';
export const BUILD_INFORMATION_MAX_BYTES = 8192;
/** Explicit user-requested same-origin read; never follow a redirect or send project state. */
export async function readDeployedBuild(
  baseUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AppBuildInformation> {
  signal.throwIfAborted();
  const url = new URL('native-build-info.json', baseUrl);
  if (
    url.username ||
    url.password ||
    (typeof location !== 'undefined' && url.origin !== location.origin)
  )
    throw new Error('配信版は同じサイトだけを確認できます。');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('配信版のURLを確認できません。');
  const response = await fetcher(url, {
    signal,
    redirect: 'error',
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error('配信版を確認できません。通信を確認して再試行してください。');
  }
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > BUILD_INFORMATION_MAX_BYTES)) {
    await response.body.cancel();
    throw new Error('配信版の情報が上限を超えています。');
  }
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > BUILD_INFORMATION_MAX_BYTES)
        throw new Error('配信版の情報が上限を超えています。');
      chunks.push(value);
    }
    signal.throwIfAborted();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return parseBuildInformation(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
    );
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
