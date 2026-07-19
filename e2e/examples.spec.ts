import http from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { confirmImageImport } from './importTestHelpers';

async function makePngBuffer(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#c0392b';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function setupProjectWithImage(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer });
  await confirmImageImport(page);
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
};

/** 展開済みディレクトリを配信する静的ファイルサーバーを起動する（ポート 0 で空きポートを取得）。 */
function startStaticServer(rootDir: string): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      void (async () => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost');
          const filePath = join(rootDir, decodeURIComponent(url.pathname));
          const content = await readFile(filePath);
          const contentType = CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('not found');
        }
      })();
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('サーバーのアドレス取得に失敗しました'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

test('Canvas 2D サンプルでアセットが表示される', async ({ page }) => {
  await setupProjectWithImage(page, 'サンプル表示テスト');

  // タイムラインでフレームを 1 枚追加する（アニメーション未作成でも先頭フレームが表示できることを確認する）
  await page.getByRole('button', { name: 'フレーム追加' }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'ZIP をダウンロード' }).click(),
  ]);
  const zipPath = await download.path();
  expect(zipPath).not.toBeNull();
  const zipBytes = await readFile(zipPath!);
  const entries = unzipSync(new Uint8Array(zipBytes));

  const extractDir = await mkdtemp(join(tmpdir(), 'cas-examples-'));
  for (const [path, data] of Object.entries(entries)) {
    const targetPath = join(extractDir, path);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, data);
  }

  const server = await startStaticServer(extractDir);
  try {
    await page.goto(`${server.url}/examples/example-canvas.html`);
    const canvas = page.locator('#stage');
    await expect(canvas).toBeVisible();

    await page.waitForFunction(() => {
      const el = document.getElementById('stage') as HTMLCanvasElement | null;
      if (!el) {
        return false;
      }
      const ctx = el.getContext('2d')!;
      const data = ctx.getImageData(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1).data;
      return data[3] > 0;
    });

    const pixel = await page.evaluate(() => {
      const el = document.getElementById('stage') as HTMLCanvasElement;
      const ctx = el.getContext('2d')!;
      const data = ctx.getImageData(Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1).data;
      return Array.from(data);
    });

    expect(pixel[0]).toBeGreaterThan(150);
    expect(pixel[3]).toBeGreaterThan(0);
  } finally {
    await server.close();
  }
});
