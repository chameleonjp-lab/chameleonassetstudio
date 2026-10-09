import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { consumerFixture, type ConsumerFixtureId } from '../src/core3d/fixtures/consumer';
import { captureAssetSnapshot, sha256 } from '../src/core3d/export/snapshot';
import { exportGlb } from '../src/adapters3d/gltf/export';
import { buildAssetPackage } from '../src/core3d/export/mapping';
async function delivery(id: ConsumerFixtureId) {
  const { project, blobs } = await consumerFixture(id);
  const encoded = await exportGlb(captureAssetSnapshot(project, (key) => blobs.get(key)!));
  return buildAssetPackage(project, encoded.bytes, encoded.warnings, blobs);
}
async function open(page: Page) {
  const external: string[] = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (/^https?:/.test(url) && new URL(url).origin !== 'http://localhost:4177') {
      external.push(url);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('http://localhost:4177');
  await page.waitForFunction(() => !!window.__assetConsumer);
  return external;
}
async function load(page: Page, id: ConsumerFixtureId) {
  const pkg = await delivery(id);
  const report = await page.evaluate(
    async ({ glb, sidecar }) => window.__assetConsumer.load(glb, sidecar),
    { glb: Array.from(pkg.glb), sidecar: Array.from(pkg.sidecar) },
  );
  expect(report.hash).toBe(await sha256(pkg.glb));
  expect(report.engine).toBe('Babylon.js');
  expect(report.version).toBe('9.28.0');
  expect(report.rightHanded).toBe(true);
  expect(report.oracle.positionPass, JSON.stringify(report.oracle)).toBe(true);
  await test.info().attach(`consumer-${id}-evidence`, {
    body: Buffer.from(
      JSON.stringify(
        {
          scope: { kind: 'fixture', fixtureId: id },
          sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          browser: test.info().project.name,
          modelHash: report.hash,
          sidecarHash: await sha256(pkg.sidecar),
          runtime: report.engine,
          runtimeVersion: report.version,
          profile: 'cas3d-basic-gltf2-v1',
          sample: report.sample,
          oracle: report.oracle,
          resources: report.resources,
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });
  return report;
}
function bounds(values: number[]) {
  return [0, 1, 2].map((axis) => {
    const v = values.filter((_, i) => i % 3 === axis);
    return [Math.min(...v), Math.max(...v)];
  });
}
test('F01/F03 geometry and nonuniform hierarchy agree with fixed hand-computed bounds', async ({
  page,
}) => {
  const external = await open(page);
  let report = await load(page, 'F01');
  expect(report.materials[0].baseColor).toEqual([0.15, 0.7, 0.35, 1]);
  expect(report.materials[0].metallic).toBe(0);
  expect(report.materials[0].roughness).toBe(0.65);
  expect(bounds(report.meshes.flatMap((m) => m.positions))).toEqual([
    [1.5, 2.5],
    [-0.5, 0.5],
    [-0.5, 0.5],
  ]);
  report = await load(page, 'F03');
  expect(bounds(report.meshes.flatMap((m) => m.positions))).toEqual([
    [2, 4],
    [1.5, 2.5],
    [2.75, 3.25],
  ]);
  expect(external).toEqual([]);
  await test.info().attach('native-visual-consumer-hierarchy', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
test('F02/F05 skin, sparse holds, STEP, single keys, quaternion sign and exact loop boundaries', async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page);
  await load(page, 'F02');
  for (const [time, mode, minimumY] of [
    [0, 'scrub', -0.5],
    [0.5, 'scrub', -0.5],
    [1, 'scrub', 0.25],
    [2, 'scrub', 0.25],
    [2, 'playback', -0.5],
    [2.0001, 'playback', -0.5],
    [-0.0001, 'playback', 0.25],
  ] as const) {
    const r = await page.evaluate(
      ({ time, mode }) => window.__assetConsumer.sample('move', time, mode),
      { time, mode },
    );
    expect(r.oracle.positionPass, JSON.stringify(r.oracle)).toBe(true);
    expect(bounds(r.meshes.flatMap((m) => m.positions))[1][0]).toBeCloseTo(minimumY, 5);
  }
  await load(page, 'F05');
  for (const [clip, time, y] of [
    ['step', 0.9999, -0.5],
    ['step', 1, 1],
    ['single', 0, 0.25],
    ['single', 2, 0.25],
    ['sign', 1, -0.5],
    ['empty', 1, -0.5],
  ] as const) {
    const r = await page.evaluate(({ clip, time }) => window.__assetConsumer.sample(clip, time), {
      clip,
      time,
    });
    expect(r.oracle.positionPass, JSON.stringify(r.oracle)).toBe(true);
    expect(bounds(r.meshes.flatMap((m) => m.positions))[1][0]).toBeCloseTo(y, 5);
  }
  await test.info().attach('native-visual-consumer-skin', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
test('F04 actual PNG upload preserves corner colors and alpha in independent rendering', async ({
  page,
}) => {
  await open(page);
  const r = await load(page, 'F04');
  expect(r.materials[0].textureSize).toEqual([2, 2]);
  expect(r.materials[0].alphaMode).toBe(2);
  expect(r.materials[0].doubleSided).toBe(true);
  await page.evaluate(() =>
    window.__assetConsumer.camera({ position: [0, 0, 3], target: [0, 0, 0], span: 2 }),
  );
  const pixels = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas')!;
    return {
      width: canvas.width,
      height: canvas.height,
      data: await window.__assetConsumer.pixels(),
    };
  });
  const at = (x: number, y: number) =>
    pixels.data.slice(
      (Math.round(y) * pixels.width + Math.round(x)) * 4,
      (Math.round(y) * pixels.width + Math.round(x)) * 4 + 4,
    );
  // readPixels starts at the lower-left; sample inside each quadrant, away from edges.
  const red = at(pixels.width / 2 - pixels.height * 0.15, pixels.height * 0.65),
    green = at(pixels.width / 2 + pixels.height * 0.15, pixels.height * 0.65),
    blue = at(pixels.width / 2 - pixels.height * 0.15, pixels.height * 0.35);
  expect(red[0]).toBeGreaterThan(red[1] * 1.3);
  expect(red[0]).toBeGreaterThan(red[2] * 1.3);
  expect(green[1]).toBeGreaterThan(green[0] * 1.3);
  expect(blue[2]).toBeGreaterThan(blue[0] * 1.3);
  const translucent = at(pixels.width / 2 + pixels.height * 0.15, pixels.height * 0.35).slice(0, 3);
  expect(Math.max(...translucent) - Math.min(...translucent)).toBeLessThan(35);
  expect(Math.max(...translucent)).toBeLessThan(Math.max(red[0], green[1], blue[2]));
  await test.info().attach('native-visual-consumer-texture', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
test('F06 sidecar attachments follow bones and metadata conversion is not applied twice', async ({
  page,
}) => {
  await open(page);
  const r = await load(page, 'F06');
  expect(r.anchors[0].position).toEqual([0.5, 1, 0]);
  expect(r.colliders[0].position).toEqual([2, 0, 0]);
  const pose = await page.evaluate(() => window.__assetConsumer.sample('move', 1));
  expect(pose.anchors[0].position).toEqual([0.5, 2, 0]);
  expect(pose.colliders[0].position).toEqual([2, 0, 0]);
  expect(pose.colliders[0].shape).toBe('capsule');
  expect(pose.colliders[0].height + 2 * pose.colliders[0].radius).toBe(1.5);
});
test('mismatched sidecar is rejected and repeated load/dispose retains bounded scene counts', async ({
  page,
}) => {
  test.setTimeout(120000);
  const external = await open(page);
  const a = await delivery('F01'),
    b = await delivery('F03');
  const failed = await page.evaluate(
    async ({ glb, sidecar }) => {
      try {
        await window.__assetConsumer.load(glb, sidecar);
        return false;
      } catch {
        return true;
      }
    },
    { glb: Array.from(a.glb), sidecar: Array.from(b.sidecar) },
  );
  expect(failed).toBe(true);
  let baseline: unknown;
  for (let i = 0; i < 20; i++) {
    const r = await load(page, 'F02');
    if (i === 0) baseline = r.resources;
    else expect(r.resources).toEqual(baseline);
    expect(await page.evaluate(() => window.__assetConsumer.dispose())).toEqual({
      disposed: true,
      pending: 0,
    });
  }
  expect(external).toEqual([]);
});

test('F07 mixed skin under a nonuniform shared parent matches a hand-derived equation', async ({
  page,
}) => {
  await open(page);
  const rest = await load(page, 'F07');
  const a = bounds(rest.meshes.flatMap((m) => m.positions));
  for (const [i, pair] of [
    [2, 4],
    [0.5, 3.5],
    [1, 5],
  ].entries())
    for (let j = 0; j < 2; j++) expect(a[i][j]).toBeCloseTo(pair[j], 5);
  const moved = await page.evaluate(() => window.__assetConsumer.sample('move', 1));
  expect(moved.oracle.positionPass).toBe(true);
  const b = bounds(moved.meshes.flatMap((m) => m.positions));
  expect(b[1][0]).toBeCloseTo(2.75, 5);
  expect(b[1][1]).toBeCloseTo(5.75, 5);
});

test('actual consumer render loop emits animation loop and end events', async ({ page }) => {
  await open(page);
  await load(page, 'F05');
  await page.evaluate(() => window.__assetConsumer.play('move', 20));
  await expect
    .poll(async () => page.evaluate(() => window.__assetConsumer.snapshot().playback.loops))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__assetConsumer.snapshot().playback.source)).toBe(
    'animation-group',
  );
  await page.evaluate(() => window.__assetConsumer.stop());
  expect(await page.evaluate(() => window.__assetConsumer.snapshot().playback.playing)).toBe(false);
  await page.evaluate(() => window.__assetConsumer.play('step', 20));
  await expect
    .poll(async () => page.evaluate(() => window.__assetConsumer.snapshot().playback.ends))
    .toBe(1);
  const ended = await page.evaluate(() => window.__assetConsumer.snapshot());
  expect(ended.playback.playing).toBe(false);
  expect(ended.oracle.positionPass).toBe(true);
  await page.evaluate(() => window.__assetConsumer.play('empty', 20));
  await expect
    .poll(async () => page.evaluate(() => window.__assetConsumer.snapshot().playback.ends))
    .toBe(1);
  expect(await page.evaluate(() => window.__assetConsumer.snapshot().playback.source)).toBe(
    'empty-clip-clock',
  );
});

test('a project authored and exported in the product opens in a separate consumer context', async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.goto(
    new URL('/3d/', String(test.info().project.use.baseURL ?? 'http://localhost:5173')).href,
  );
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Consumer handoff');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  await page.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
  const read = async (name: string) => {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    const path = await (await event).path();
    return Array.from(await (await import('node:fs/promises')).readFile(path!));
  };
  const glb = await read('GLBを保存'),
    sidecar = await read('game.jsonを保存');
  const context = await browser.newContext();
  const consumer = await context.newPage();
  try {
    await open(consumer);
    const report = await consumer.evaluate(
      ({ glb, sidecar }) => window.__assetConsumer.load(glb, sidecar),
      { glb, sidecar },
    );
    expect(report.oracle.positionPass).toBe(true);
    expect(report.meshes.length).toBeGreaterThan(0);
    expect(report.hash).toBe(await sha256(new Uint8Array(glb)));
    await test.info().attach('native-visual-consumer-product-handoff', {
      body: await consumer.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await context.close();
  }
});
