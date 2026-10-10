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
  await page
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
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

test('edited textured mixed skin and two clips survive backup, re-edit and actual independent delivery', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const { readFile } = await import('node:fs/promises');
  const { importBackup } = await import('../src/core3d/backup/backup');
  const { assetIoPng } = await import('../src/core3d/fixtures/assetIo');
  const { createRequire } = await import('node:module');
  const validator = createRequire(import.meta.url)('gltf-validator') as {
    validateBytes: (
      bytes: Uint8Array,
      options: Record<string, unknown>,
    ) => Promise<{
      issues: { numErrors: number; truncated: boolean; messages: unknown[] };
    }>;
  };
  const download = async (target: Page, name: string) => {
    const event = target.waitForEvent('download');
    await target.getByRole('button', { name, exact: true }).click();
    return new Uint8Array(await readFile((await (await event).path())!));
  };
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Full native handoff');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  const author = page.getByRole('region', { name: '3D制作', exact: true });
  await author.getByText('頂点・辺・面を編集', { exact: true }).click();
  await author.getByRole('combobox', { name: '制作要素', exact: true }).selectOption({ index: 1 });
  await author.getByLabel('移動量 X（m）', { exact: true }).fill('0.1');
  await author.getByRole('button', { name: '選択要素を移動', exact: true }).click();
  await expect(author.getByRole('alert')).toHaveCount(0);
  const texture = page.getByRole('region', { name: '画像とUVを編集', exact: true });
  await texture.getByText('画像とUVを開く', { exact: true }).click();
  const png = await assetIoPng();
  await texture
    .getByLabel('baseColor画像', { exact: true })
    .setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await texture
    .getByLabel('画像の権利・出典', { exact: true })
    .fill('Original integration fixture CC0');
  await texture.getByRole('button', { name: '画像を取り込み適用', exact: true }).click();
  await expect(texture.getByRole('status')).toContainText('一回の操作');
  await page.getByText('骨と重みの編集を開く', { exact: true }).click();
  const rig = page.getByRole('region', { name: '3D骨と重み', exact: true });
  await rig.getByLabel('骨の名前', { exact: true }).fill('Root');
  await rig.getByRole('button', { name: '骨を追加', exact: true }).click();
  const root = await rig.getByRole('combobox', { name: '骨を選択', exact: true }).inputValue();
  await rig.getByRole('combobox', { name: '親の骨', exact: true }).selectOption(root);
  await rig.getByLabel('骨の名前', { exact: true }).fill('Tip');
  await rig.getByRole('button', { name: '骨を追加', exact: true }).click();
  const tip = await rig.getByRole('combobox', { name: '骨を選択', exact: true }).inputValue();
  await rig.getByRole('button', { name: '骨の現在値を読む', exact: true }).click();
  await rig.getByLabel('骨位置 Y', { exact: true }).fill('1');
  await rig.getByRole('button', { name: 'restを適用して再bind', exact: true }).click();
  await rig.getByRole('combobox', { name: '影響 1 の骨', exact: true }).selectOption(root);
  await rig.getByLabel('影響 1 の重み', { exact: true }).fill('0.25');
  await rig.getByRole('combobox', { name: '影響 2 の骨', exact: true }).selectOption(tip);
  await rig.getByLabel('影響 2 の重み', { exact: true }).fill('0.75');
  await rig.getByRole('button', { name: '全頂点へ明示weightをbind', exact: true }).click();
  await expect(rig.getByText(/bind済み/)).toBeVisible();
  await page.getByText('アニメーション編集を開く', { exact: true }).click();
  const animation = page.getByRole('region', { name: '3Dアニメーション', exact: true });
  const clipIds: string[] = [];
  for (const [name, end] of [
    ['Small', '1'],
    ['Large', '2'],
  ]) {
    await animation.getByLabel('clip名', { exact: true }).fill(name);
    await animation.getByLabel('clipの長さ（秒）', { exact: true }).fill('1');
    await animation.getByLabel('clipをloop再生する', { exact: true }).uncheck();
    await animation.getByRole('button', { name: '新しいclipを作成', exact: true }).click();
    clipIds.push(
      await animation.getByRole('combobox', { name: 'clipを選択', exact: true }).inputValue(),
    );
    await animation.getByRole('combobox', { name: 'キー対象', exact: true }).selectOption(tip);
    await animation.getByRole('button', { name: '表示中のTRSを読む', exact: true }).click();
    await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('0');
    await animation.getByLabel('キー値 X', { exact: true }).fill('0');
    await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
    await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('1');
    await animation.getByLabel('キー値 X', { exact: true }).fill(end);
    await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  }
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  const archive = await download(page, '現在の内容をバックアップ');
  const saved = await importBackup(archive);
  expect(saved.project.clips).toHaveLength(2);
  expect(saved.project.meshes[0].vertices[0].position[0]).toBeCloseTo(-0.4, 8);
  expect(saved.project.meshes[0].vertices[0].position.slice(1)).toEqual([-0.5, -0.5]);
  expect(
    saved.project.skins[0].weights.every(
      (entry) => entry.values[0] === 0.25 && entry.values[1] === 0.75,
    ),
  ).toBe(true);
  expect(saved.blobs.get(await sha256(png))).toEqual(png);
  const restoredContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const consumerContext = await browser.newContext();
  try {
    const restored = await restoredContext.newPage();
    await restored.goto('/3d/');
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'complete.cas3dproj',
      mimeType: 'application/zip',
      buffer: Buffer.from(archive),
    });
    await expect(
      restored.getByRole('heading', { name: 'Full native handoff', exact: true }),
    ).toBeVisible();
    await restored.getByText('アニメーション編集を開く', { exact: true }).click();
    const edited = restored.getByRole('region', { name: '3Dアニメーション', exact: true });
    await edited
      .getByRole('combobox', { name: 'clipを選択', exact: true })
      .selectOption(clipIds[1]);
    await edited.getByRole('combobox', { name: 'キー対象', exact: true }).selectOption(tip);
    await edited.getByRole('button', { name: 'キー 1秒: 2, 1, 0', exact: true }).click();
    await edited.getByLabel('キー値 X', { exact: true }).fill('2.5');
    await edited.getByRole('button', { name: '選択キーの時刻と値を適用', exact: true }).click();
    const revised = await importBackup(await download(restored, '現在の内容をバックアップ'));
    expect(revised.project.meshes).toEqual(saved.project.meshes);
    expect(revised.project.skins).toEqual(saved.project.skins);
    expect(revised.blobs.get(await sha256(png))).toEqual(png);
    expect(revised.project.clips[1].tracks[0].keys[1].value).toEqual([2.5, 1, 0]);
    await restored.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
    await restored
      .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
      .check();
    await restored.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
    await expect(restored.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
    const glb = await download(restored, 'GLBを保存'),
      sidecar = await download(restored, 'game.jsonを保存');
    const validation = await validator.validateBytes(glb, { maxIssues: 1000 });
    expect(validation.issues.numErrors, JSON.stringify(validation.issues)).toBe(0);
    expect(validation.issues.truncated).toBe(false);
    const consumer = await consumerContext.newPage();
    const external = await open(consumer);
    const rest = await consumer.evaluate(
      ({ glb, sidecar }) => window.__assetConsumer.load(glb, sidecar),
      { glb: Array.from(glb), sidecar: Array.from(sidecar) },
    );
    expect(rest.hash).toBe(await sha256(glb));
    const editedVertexReachedConsumer = rest.meshes.some((mesh) =>
      mesh.positions.some(
        (value, index, positions) =>
          index % 3 === 0 &&
          Math.abs(value + 0.4) < 1e-6 &&
          Math.abs(positions[index + 1] + 0.5) < 1e-6 &&
          Math.abs(positions[index + 2] + 0.5) < 1e-6,
      ),
    );
    expect(editedVertexReachedConsumer).toBe(true);
    expect(rest.resources.skeletons).toBe(1);
    expect(rest.resources.animations).toBe(2);
    expect(
      rest.materials.some((material) => material.loaded && material.textureSize !== null),
    ).toBe(true);
    for (const [clipId, x] of [
      [clipIds[0], 0.75],
      [clipIds[1], 1.875],
    ] as const) {
      const pose = await consumer.evaluate((id) => window.__assetConsumer.sample(id, 1), clipId);
      expect(pose.oracle.positionPass).toBe(true);
      expect(pose.oracle.nodePass).toBe(true);
      expect(pose.meshes.length).toBe(rest.meshes.length);
      pose.meshes.forEach((mesh, m) =>
        mesh.positions.forEach((value, i) => {
          expect(value).toBeCloseTo(rest.meshes[m].positions[i] + (i % 3 === 0 ? x : 0), 5);
        }),
      );
    }
    await consumer.evaluate((id) => window.__assetConsumer.play(id, 20), clipIds[1]);
    await expect
      .poll(() => consumer.evaluate(() => window.__assetConsumer.snapshot().playback.ends))
      .toBe(1);
    expect(external).toEqual([]);
    await test.info().attach('full-native-delivery-evidence', {
      body: Buffer.from(
        JSON.stringify(
          {
            kind: 'ui-authored-fixture',
            sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
            browser: test.info().project.name,
            modelHash: await sha256(glb),
            sidecarHash: await sha256(sidecar),
            backupHash: await sha256(archive),
            runtime: rest.engine,
            runtimeVersion: rest.version,
            validator: validation.issues,
            clipIds,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    await test.info().attach('native-visual-consumer-full-workflow', {
      body: await consumer.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await restoredContext.close();
    await consumerContext.close();
  }
});
