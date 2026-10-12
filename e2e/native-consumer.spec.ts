import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { consumerFixture, type ConsumerFixtureId } from '../src/core3d/fixtures/consumer';
import { captureAssetSnapshot, sha256 } from '../src/core3d/export/snapshot';
import { exportGlb } from '../src/adapters3d/gltf/export';
import { buildAssetPackage } from '../src/core3d/export/mapping';
import { parseConsumerGlb } from '../tools/3d-consumer/sidecar';
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
test('product-authored quaternion sign, midpoint and Float32 times match an independent consumer', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('ANIM-03 quaternion handoff');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  await page.getByText('アニメーション編集を開く', { exact: true }).click();
  const animation = page.getByRole('region', { name: '3Dアニメーション', exact: true });
  const duration = '0.30000001192092896';
  await animation.getByLabel('clip名', { exact: true }).fill('Quaternion sign');
  await animation.getByLabel('clipの長さ（秒）', { exact: true }).fill(duration);
  await animation.getByLabel('clipをloop再生する', { exact: true }).uncheck();
  await animation.getByRole('button', { name: '新しいclipを作成', exact: true }).click();
  const clipId = await animation
    .getByRole('combobox', { name: 'clipを選択', exact: true })
    .inputValue();
  const target = animation.getByRole('combobox', { name: 'キー対象', exact: true });
  const nodeId = await target.locator('option').nth(1).getAttribute('value');
  expect(nodeId).toBeTruthy();
  await target.selectOption(nodeId!);
  await animation.getByRole('combobox', { name: 'キー属性', exact: true }).selectOption('rotation');
  await animation.getByRole('combobox', { name: 'キー補間', exact: true }).selectOption('LINEAR');
  const addRotationKey = async (time: string, values: [string, string, string, string]) => {
    await animation.getByLabel('キー時刻（秒）', { exact: true }).fill(time);
    for (const [index, axis] of ['X', 'Y', 'Z', 'W'].entries())
      await animation.getByLabel(`キー値 ${axis}`, { exact: true }).fill(values[index]);
    await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  };
  await addRotationKey('0.1', ['0', '0.3826834323650898', '0', '0.9238795325112867']);
  await addRotationKey(duration, ['0', '-0.9238795325112867', '0', '-0.3826834323650898']);

  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  await page
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
  await page.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
  const download = async (name: string) => {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name, exact: true }).click();
    return new Uint8Array(await readFile((await (await event).path())!));
  };
  const glb = await download('GLBを保存');
  const sidecar = await download('game.jsonを保存');
  const parsed = parseConsumerGlb(glb);
  const exportedClip = parsed.gltf.animations?.find((clip) => clip.extras?.casId === clipId);
  expect(exportedClip).toBeDefined();
  const rotationChannel = exportedClip!.channels.find(
    (channel) => channel.target.path === 'rotation',
  );
  expect(rotationChannel).toBeDefined();
  const sampler = exportedClip!.samplers[rotationChannel!.sampler];
  expect(sampler.interpolation).toBe('LINEAR');
  const times = parsed.read(sampler.input);
  expect(times).toEqual([0, Math.fround(0.1), Math.fround(0.3)]);
  const rotations = parsed.read(sampler.output);
  expect(rotations).toHaveLength(12);
  const qStart = rotations.slice(4, 8);
  const qEnd = rotations.slice(8, 12);
  const signIndependentDot = Math.abs(
    qStart.reduce((sum, value, index) => sum + value * qEnd[index], 0),
  );
  expect(signIndependentDot).toBeCloseTo(Math.SQRT1_2, 5);

  const consumerContext = await browser.newContext();
  try {
    const consumer = await consumerContext.newPage();
    const external = await open(consumer);
    const report = await consumer.evaluate(
      ({ glb, sidecar }) => window.__assetConsumer.load(glb, sidecar),
      { glb: Array.from(glb), sidecar: Array.from(sidecar) },
    );
    expect(report.hash).toBe(await sha256(glb));
    const midpoint = (times[1] + times[2]) / 2;
    const sample = async (time: number) => {
      const pose = await consumer.evaluate(
        ({ clipId, time }) => window.__assetConsumer.sample(clipId, time),
        { clipId, time },
      );
      expect(pose.oracle.positionPass).toBe(true);
      expect(pose.oracle.nodePass).toBe(true);
      const node = pose.nodes.find((item) => item.id === nodeId);
      expect(node).toBeDefined();
      return node!.world as number[];
    };
    const cases = [
      [times[0], 45],
      [times[1], 45],
      [midpoint, 90],
      [times[2], 135],
    ] as const;
    const matrices: number[][] = [];
    for (const [time, degrees] of cases) {
      const world = await sample(time);
      matrices.push(world);
      const radians = (degrees * Math.PI) / 180;
      expect(world[0]).toBeCloseTo(Math.cos(radians), 4);
      expect(world[2]).toBeCloseTo(-Math.sin(radians), 4);
      expect(world[8]).toBeCloseTo(Math.sin(radians), 4);
      expect(world[10]).toBeCloseTo(Math.cos(radians), 4);
    }
    expect(external).toEqual([]);
    await test.info().attach('anim03-quaternion-f32-evidence', {
      body: Buffer.from(
        JSON.stringify(
          {
            sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
            browser: test.info().project.name,
            clipId,
            nodeId,
            encodedTimes: times,
            requestedTimes: cases.map(([time]) => time),
            degrees: cases.map(([, degrees]) => degrees),
            modelHash: await sha256(glb),
            sidecarHash: await sha256(sidecar),
            matrices,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    await test.info().attach('native-visual-consumer-anime03-quaternion', {
      body: await consumer.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await consumerContext.close();
  }
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

test('AC-02 product-authored face extrusion survives backup restore and matches the same GLB in Babylon', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const { importBackup } = await import('../src/core3d/backup/backup');
  const { createRequire } = await import('node:module');
  const validator = createRequire(import.meta.url)('gltf-validator') as {
    validateBytes(
      bytes: Uint8Array,
      options: Record<string, unknown>,
    ): Promise<{ issues: { numErrors: number; truncated: boolean; messages: unknown[] } }>;
  };
  const download = async (target: Page, name: string) => {
    const event = target.waitForEvent('download');
    await target.getByRole('button', { name, exact: true }).click();
    return new Uint8Array(await readFile((await (await event).path())!));
  };
  const backup = async (target: Page) =>
    importBackup(await download(target, '現在の内容をバックアップ'));
  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('AC-02 extrusion handoff');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();
  const author = page.getByRole('region', { name: '3D制作', exact: true });
  const boxId = await author
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .inputValue();
  await author.getByText('基本形を作成', { exact: true }).click();
  await author.getByRole('combobox', { name: '基本形', exact: true }).selectOption('sphere');
  await author.getByLabel('分割数', { exact: true }).fill('4');
  await author.getByRole('button', { name: '基本形を追加', exact: true }).click();
  const sphereId = await author
    .getByRole('combobox', { name: '制作オブジェクト', exact: true })
    .inputValue();
  expect(sphereId).not.toBe(boxId);
  await author.getByRole('combobox', { name: '制作オブジェクト', exact: true }).selectOption(boxId);
  const baseline = await backup(page),
    boxMeshId = baseline.project.nodes.find((node) => node.id === boxId)!.meshId!,
    baselineMesh = baseline.project.meshes.find((mesh) => mesh.id === boxMeshId)!;
  await author.getByText('頂点・辺・面を編集', { exact: true }).click();
  await author.getByRole('combobox', { name: '編集要素', exact: true }).selectOption('face');
  await author.getByRole('combobox', { name: '制作要素', exact: true }).selectOption({ index: 1 });
  await author.getByLabel('押出し距離（m）', { exact: true }).fill('0.2');
  await author.getByRole('button', { name: '選択面を押し出す', exact: true }).click();
  await expect(author.getByRole('alert')).toHaveCount(0);
  const extruded = await backup(page),
    extrudedMesh = extruded.project.meshes.find((mesh) => mesh.id === boxMeshId)!;
  expect(extrudedMesh.vertices).toHaveLength(baselineMesh.vertices.length + 3);
  expect(extrudedMesh.faces).toHaveLength(baselineMesh.faces.length + 6);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect((await backup(page)).project.meshes.find((mesh) => mesh.id === boxMeshId)).toEqual(
    baselineMesh,
  );
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  expect((await backup(page)).project.meshes.find((mesh) => mesh.id === boxMeshId)).toEqual(
    extrudedMesh,
  );
  await author.getByText('材質の色・金属・粗さ', { exact: true }).click();
  await author.getByRole('combobox', { name: '制作材質', exact: true }).selectOption({ index: 1 });
  await author.getByRole('button', { name: '材質の現在値を読む', exact: true }).click();
  await author.getByLabel('赤 R', { exact: true }).fill('0.85');
  await author.getByRole('button', { name: '材質を適用', exact: true }).click();
  await expect(author.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  const archive = await download(page, '現在の内容をバックアップ'),
    saved = await importBackup(archive),
    savedMesh = saved.project.meshes.find((mesh) => mesh.id === boxMeshId)!;
  expect(saved.project.nodes).toHaveLength(2);
  expect(savedMesh).toEqual(extrudedMesh);
  expect(saved.project.materials.some((material) => material.baseColor[0] === 0.85)).toBe(true);

  const restoredContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const consumerContext = await browser.newContext();
  try {
    const restored = await restoredContext.newPage();
    await restored.goto('/3d/');
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'ac02-extrusion.cas3dproj',
      mimeType: 'application/zip',
      buffer: Buffer.from(archive),
    });
    await expect(
      restored.getByRole('heading', { name: 'AC-02 extrusion handoff', exact: true }),
    ).toBeVisible();
    const restoredProject = await backup(restored);
    expect(restoredProject.project.meshes.find((mesh) => mesh.id === boxMeshId)).toEqual(savedMesh);
    await restored.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
    await restored
      .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
      .check();
    await restored.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
    await expect(restored.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
    const glb = await download(restored, 'GLBを保存'),
      sidecar = await download(restored, 'game.jsonを保存'),
      sidecarData = JSON.parse(new TextDecoder().decode(sidecar)) as { modelHash: string };
    const modelHash = await sha256(glb);
    expect(sidecarData.modelHash).toBe(modelHash);
    const validation = await validator.validateBytes(glb, { format: 'glb', maxIssues: 1000 });
    expect(validation.issues.numErrors, JSON.stringify(validation.issues)).toBe(0);
    expect(validation.issues.truncated).toBe(false);

    const consumer = await consumerContext.newPage();
    const external = await open(consumer);
    const report = await consumer.evaluate(
      ({ glb, sidecar }) => window.__assetConsumer.load(glb, sidecar),
      { glb: Array.from(glb), sidecar: Array.from(sidecar) },
    );
    expect(report.engine).toBe('Babylon.js');
    expect(report.version).toBe('9.28.0');
    expect(report.hash).toBe(modelHash);
    expect(report.oracle.positionPass).toBe(true);
    expect(report.oracle.nodePass).toBe(true);
    const boxMeshes = report.meshes.filter((mesh) => mesh.nodeId === boxId),
      sphereMeshes = report.meshes.filter((mesh) => mesh.nodeId === sphereId);
    expect(boxMeshes.length).toBeGreaterThan(0);
    expect(sphereMeshes.length).toBeGreaterThan(0);
    const consumerTriangleCount = boxMeshes.reduce(
      (count, mesh) =>
        count + (mesh.indices.length ? mesh.indices.length / 3 : mesh.positions.length / 9),
      0,
    );
    expect(consumerTriangleCount).toBe(savedMesh.faces.length);
    const actualBoxPositions = boxMeshes.flatMap((mesh) => mesh.positions);
    for (const vertex of savedMesh.vertices) {
      const [x, y, z] = vertex.position;
      expect(
        Array.from({ length: actualBoxPositions.length / 3 }, (_, index) => index * 3).some(
          (index) =>
            Math.abs(actualBoxPositions[index] - x) < 1e-5 &&
            Math.abs(actualBoxPositions[index + 1] - y) < 1e-5 &&
            Math.abs(actualBoxPositions[index + 2] - z) < 1e-5,
        ),
      ).toBe(true);
    }
    expect(report.materials.some((material) => (material.baseColor?.[0] ?? 0) > 0.8)).toBe(true);
    expect(external).toEqual([]);
    await test.info().attach('ac02-extrusion-independent-consumer-evidence', {
      body: Buffer.from(
        JSON.stringify(
          {
            kind: 'product-authored-extrusion',
            sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
            browser: test.info().project.name,
            modelHash,
            runtime: report.engine,
            runtimeVersion: report.version,
            validator: validation.issues,
            nodeIds: { boxId, sphereId },
            geometry: {
              authoredVertices: savedMesh.vertices.length,
              authoredFaces: savedMesh.faces.length,
            },
            consumerTriangles: consumerTriangleCount,
            materialRed: report.materials.find((material) => (material.baseColor?.[0] ?? 0) > 0.8)
              ?.baseColor,
            positionPass: report.oracle.positionPass,
            externalRequests: external,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    await test.info().attach('ac02-extrusion-babylon-render', {
      body: await consumer.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await restoredContext.close();
    await consumerContext.close();
  }
});

test('edited textured mixed skin and two clips survive backup, re-edit and actual independent delivery with verified sidecar metadata', async ({
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
  for (const [name, end, loop] of [
    ['Small', '1', true],
    ['Large', '2', false],
  ] as const) {
    await animation.getByLabel('clip名', { exact: true }).fill(name);
    await animation.getByLabel('clipの長さ（秒）', { exact: true }).fill('1');
    const loopControl = animation.getByLabel('clipをloop再生する', { exact: true });
    if (loop) await loopControl.check();
    else await loopControl.uncheck();
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
    const gameSidecar = JSON.parse(new TextDecoder().decode(sidecar)) as {
      modelHash: string;
      clips: { id: string; name: string; duration: number; loop: boolean }[];
    };
    expect(gameSidecar.modelHash).toBe(await sha256(glb));
    expect(gameSidecar.clips).toHaveLength(2);
    expect(gameSidecar.clips).toMatchObject([
      { id: clipIds[0], name: 'Small', duration: 1, loop: true },
      { id: clipIds[1], name: 'Large', duration: 1, loop: false },
    ]);
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
    for (const [clipId, time, x] of [
      [clipIds[0], 0.5, 0.375],
      [clipIds[1], 1, 1.875],
    ] as const) {
      const pose = await consumer.evaluate(
        ({ id, time }) => window.__assetConsumer.sample(id, time),
        { id: clipId, time },
      );
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
    // Playback moves this weighted mesh beyond its rest-pose framing; restore the readable rest pose for visual evidence.
    await consumer.evaluate((id) => window.__assetConsumer.sample(id, 0), clipIds[1]);
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
            clips: gameSidecar.clips,
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

test('product-authored rigid attachment and mixed skin follow their joint in an independent consumer', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const { readFile } = await import('node:fs/promises');
  const { importBackup } = await import('../src/core3d/backup/backup');
  const download = async (target: Page, name: string) => {
    const event = target.waitForEvent('download');
    await target.getByRole('button', { name, exact: true }).click();
    return new Uint8Array(await readFile((await (await event).path())!));
  };

  await page.goto('/3d/');
  await page.getByLabel('新しいプロジェクト名', { exact: true }).fill('Rigid consumer bridge');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
  await expect(page.getByText('3D表示中', { exact: true })).toBeVisible();

  const initial = await importBackup(await download(page, '現在の内容をバックアップ'));
  const parts = initial.project.nodes.filter((node) => node.meshId !== undefined);
  expect(parts).toHaveLength(2);
  const skinPartId = parts[0].id;
  const rigidPartId = parts[1].id;

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

  await rig.getByRole('combobox', { name: '重み対象の部品', exact: true }).selectOption(skinPartId);
  await rig.getByRole('combobox', { name: '影響 1 の骨', exact: true }).selectOption(root);
  await rig.getByLabel('影響 1 の重み', { exact: true }).fill('0.25');
  await rig.getByRole('combobox', { name: '影響 2 の骨', exact: true }).selectOption(tip);
  await rig.getByLabel('影響 2 の重み', { exact: true }).fill('0.75');
  await rig.getByRole('button', { name: '全頂点へ明示weightをbind', exact: true }).click();
  await expect(rig.getByText(/bind済み/)).toBeVisible();

  const rigid = rig.getByRole('region', { name: 'rigid部品の骨割当', exact: true });
  await rigid
    .getByRole('combobox', { name: 'rigid割当の部品', exact: true })
    .selectOption(rigidPartId);
  await rigid.getByRole('combobox', { name: 'rigid割当先の骨', exact: true }).selectOption(tip);
  await rigid.getByRole('button', { name: 'rigid割当の内容を確認', exact: true }).click();
  await expect(rigid.getByRole('region', { name: 'rigid割当の確認', exact: true })).toContainText(
    'restのworld配置を保持',
  );
  await rigid.getByRole('button', { name: '確認したrigid割当を適用', exact: true }).click();
  await expect(rigid.getByRole('status')).toContainText('このrevisionでrigid割当を適用しました');

  await page.getByText('アニメーション編集を開く', { exact: true }).click();
  const animation = page.getByRole('region', { name: '3Dアニメーション', exact: true });
  await animation.getByLabel('clip名', { exact: true }).fill('Joint motion');
  await animation.getByLabel('clipの長さ（秒）', { exact: true }).fill('1');
  await animation.getByLabel('clipをloop再生する', { exact: true }).uncheck();
  await animation.getByRole('button', { name: '新しいclipを作成', exact: true }).click();
  const clipId = await animation
    .getByRole('combobox', { name: 'clipを選択', exact: true })
    .inputValue();
  await animation.getByRole('combobox', { name: 'キー対象', exact: true }).selectOption(tip);
  await animation.getByRole('button', { name: '表示中のTRSを読む', exact: true }).click();
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('0');
  await animation.getByLabel('キー値 X', { exact: true }).fill('0');
  await animation.getByLabel('キー値 Y', { exact: true }).fill('1');
  await animation.getByLabel('キー値 Z', { exact: true }).fill('0');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('1');
  await animation.getByLabel('キー値 X', { exact: true }).fill('1');
  await animation.getByLabel('キー値 Y', { exact: true }).fill('1');
  await animation.getByLabel('キー値 Z', { exact: true }).fill('0');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();

  await page.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
  await page
    .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
    .check();
  await page.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
  await expect(page.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
  const glb = await download(page, 'GLBを保存');
  const sidecar = await download(page, 'game.jsonを保存');

  const consumerContext = await browser.newContext();
  try {
    const consumer = await consumerContext.newPage();
    const external = await open(consumer);
    const rest = await consumer.evaluate(
      ({ glb, sidecar }) => window.__assetConsumer.load(glb, sidecar),
      { glb: Array.from(glb), sidecar: Array.from(sidecar) },
    );
    expect(rest.hash).toBe(await sha256(glb));
    expect(rest.oracle.positionPass).toBe(true);
    expect(rest.oracle.nodePass).toBe(true);
    expect(rest.resources.skeletons).toBe(1);
    expect(rest.resources.animations).toBe(1);
    const restSkin = rest.meshes.find((mesh) => mesh.nodeId === skinPartId)!;
    const restRigid = rest.meshes.find((mesh) => mesh.nodeId === rigidPartId)!;
    expect(restSkin.positions.length).toBeGreaterThan(0);
    expect(restRigid.positions.length).toBeGreaterThan(0);

    const pose = await consumer.evaluate((id) => window.__assetConsumer.sample(id, 1), clipId);
    expect(pose.oracle.positionPass).toBe(true);
    expect(pose.oracle.nodePass).toBe(true);
    const posedSkin = pose.meshes.find((mesh) => mesh.nodeId === skinPartId)!;
    const posedRigid = pose.meshes.find((mesh) => mesh.nodeId === rigidPartId)!;
    for (const [before, after, deltaX] of [
      [restSkin, posedSkin, 0.75],
      [restRigid, posedRigid, 1],
    ] as const) {
      expect(after.positions).toHaveLength(before.positions.length);
      before.positions.forEach((value, index) => {
        expect(after.positions[index]).toBeCloseTo(value + (index % 3 === 0 ? deltaX : 0), 4);
      });
    }
    expect(external).toEqual([]);
    await consumer.evaluate((id) => window.__assetConsumer.sample(id, 0), clipId);
    await test.info().attach('rigid-attachment-consumer-evidence', {
      body: Buffer.from(
        JSON.stringify(
          {
            kind: 'product-ui-rigid-and-skin-handoff',
            sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
            browser: test.info().project.name,
            glbHash: await sha256(glb),
            sidecarHash: await sha256(sidecar),
            skinPartId,
            rigidPartId,
            root,
            tip,
            clipId,
            expectedPoseDeltaX: { mixedSkin: 0.75, rigidAttachment: 1 },
            consumerOracle: pose.oracle,
            runtime: pose.engine,
            runtimeVersion: pose.version,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    await test.info().attach('native-visual-consumer-rigid-attachment', {
      body: await consumer.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await consumerContext.close();
  }
});

test('a saved manual vertex-weight correction reaches animated geometry in an independent consumer', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const { readFile } = await import('node:fs/promises');
  const { importBackup } = await import('../src/core3d/backup/backup');
  const download = async (target: Page, name: string) => {
    const event = target.waitForEvent('download');
    await target.getByRole('button', { name, exact: true }).click();
    return new Uint8Array(await readFile((await (await event).path())!));
  };

  await page.goto('/3d/');
  await page
    .getByLabel('新しいプロジェクト名', { exact: true })
    .fill('Manual weight consumer bridge');
  await page.getByRole('button', { name: '新しい3Dプロジェクトを作成', exact: true }).click();
  await page.getByRole('button', { name: '箱を追加', exact: true }).click();
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

  const partId = await rig
    .getByRole('combobox', { name: '重み対象の部品', exact: true })
    .inputValue();
  await rig.getByRole('combobox', { name: '影響 1 の骨', exact: true }).selectOption(root);
  await rig.getByLabel('影響 1 の重み', { exact: true }).fill('0.25');
  await rig.getByRole('combobox', { name: '影響 2 の骨', exact: true }).selectOption(tip);
  await rig.getByLabel('影響 2 の重み', { exact: true }).fill('0.75');
  await rig.getByRole('button', { name: '全頂点へ明示weightをbind', exact: true }).click();
  await expect(rig.getByText(/bind済み/)).toBeVisible();

  const bound = await importBackup(await download(page, '現在の内容をバックアップ'));
  const mesh = bound.project.meshes[0];
  const editedVertexId = mesh.vertices[0].id;
  const editedVertexPosition = mesh.vertices[0].position;
  await rig.getByRole('combobox', { name: '重み対象の部品', exact: true }).selectOption(partId);
  await rig
    .getByRole('combobox', { name: '編集する頂点', exact: true })
    .selectOption(editedVertexId);
  await rig.getByRole('button', { name: '頂点の現在weightを読む', exact: true }).click();
  await rig.getByLabel('影響 1 の重み', { exact: true }).fill('0.5');
  await rig.getByLabel('影響 2 の重み', { exact: true }).fill('0.5');
  await rig.getByRole('button', { name: '選択頂点のweightを適用', exact: true }).click();
  await expect(
    rig.getByRole('status').filter({ hasText: '適用しました。元に戻す操作' }),
  ).toBeVisible();

  await page.getByText('アニメーション編集を開く', { exact: true }).click();
  const animation = page.getByRole('region', { name: '3Dアニメーション', exact: true });
  await animation.getByLabel('clip名', { exact: true }).fill('Manual weight motion');
  await animation.getByLabel('clipの長さ（秒）', { exact: true }).fill('1');
  await animation.getByLabel('clipをloop再生する', { exact: true }).uncheck();
  await animation.getByRole('button', { name: '新しいclipを作成', exact: true }).click();
  const clipId = await animation
    .getByRole('combobox', { name: 'clipを選択', exact: true })
    .inputValue();
  await animation.getByRole('combobox', { name: 'キー対象', exact: true }).selectOption(tip);
  await animation.getByRole('button', { name: '表示中のTRSを読む', exact: true }).click();
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('0');
  await animation.getByLabel('キー値 X', { exact: true }).fill('0');
  await animation.getByLabel('キー値 Y', { exact: true }).fill('1');
  await animation.getByLabel('キー値 Z', { exact: true }).fill('0');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();
  await animation.getByLabel('キー時刻（秒）', { exact: true }).fill('1');
  await animation.getByLabel('キー値 X', { exact: true }).fill('1');
  await animation.getByLabel('キー値 Y', { exact: true }).fill('1');
  await animation.getByLabel('キー値 Z', { exact: true }).fill('0');
  await animation.getByRole('button', { name: 'キーを追加', exact: true }).click();

  await page.getByRole('button', { name: '今すぐ保存', exact: true }).click();
  const archive = await download(page, '現在の内容をバックアップ');
  const saved = await importBackup(archive);
  const savedSkin = saved.project.skins[0];
  const corrected = savedSkin.weights.find((weight) => weight.vertexId === editedVertexId)!;
  expect(corrected.values).toEqual([0.5, 0.5]);
  savedSkin.weights
    .filter((weight) => weight.vertexId !== editedVertexId)
    .forEach((weight) => expect(weight.values).toEqual([0.25, 0.75]));

  const restoredContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const consumerContext = await browser.newContext();
  try {
    const restored = await restoredContext.newPage();
    await restored.goto('/3d/');
    await restored.getByLabel('.cas3dproj を選んでコピー復元', { exact: true }).setInputFiles({
      name: 'manual-weight.cas3dproj',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(archive),
    });
    await expect(
      restored.getByRole('heading', { name: 'Manual weight consumer bridge', exact: true }),
    ).toBeVisible();
    await restored.getByText('GLB読込・配布ファイル出力', { exact: true }).click();
    await restored
      .getByLabel('固定revisionの出力範囲と変換・損失の注意を確認しました', { exact: true })
      .check();
    await restored.getByRole('button', { name: 'GLB・付属情報・ZIPを作成', exact: true }).click();
    await expect(restored.getByRole('button', { name: 'GLBを保存', exact: true })).toBeVisible();
    const glb = await download(restored, 'GLBを保存');
    const sidecar = await download(restored, 'game.jsonを保存');

    const consumer = await consumerContext.newPage();
    const external = await open(consumer);
    const rest = await consumer.evaluate(
      ({ glb, sidecar }) => window.__assetConsumer.load(glb, sidecar),
      { glb: Array.from(glb), sidecar: Array.from(sidecar) },
    );
    expect(rest.hash).toBe(await sha256(glb));
    expect(rest.oracle.positionPass).toBe(true);
    expect(rest.oracle.nodePass).toBe(true);
    const restMesh = rest.meshes.find((value) => value.nodeId === partId)!;
    const pose = await consumer.evaluate((id) => window.__assetConsumer.sample(id, 1), clipId);
    expect(pose.oracle.positionPass).toBe(true);
    expect(pose.oracle.nodePass).toBe(true);
    const posedMesh = pose.meshes.find((value) => value.nodeId === partId)!;
    let correctedVertexOccurrences = 0;
    for (let index = 0; index < restMesh.positions.length; index += 3) {
      const isCorrectedVertex = editedVertexPosition.every(
        (coordinate, axis) => Math.abs(restMesh.positions[index + axis] - coordinate) < 1e-5,
      );
      if (isCorrectedVertex) correctedVertexOccurrences++;
      const expectedDeltaX = isCorrectedVertex ? 0.5 : 0.75;
      expect(posedMesh.positions[index] - restMesh.positions[index]).toBeCloseTo(expectedDeltaX, 4);
      expect(posedMesh.positions[index + 1] - restMesh.positions[index + 1]).toBeCloseTo(0, 4);
      expect(posedMesh.positions[index + 2] - restMesh.positions[index + 2]).toBeCloseTo(0, 4);
    }
    expect(correctedVertexOccurrences).toBeGreaterThan(0);
    expect(external).toEqual([]);
    await consumer.evaluate((id) => window.__assetConsumer.sample(id, 0), clipId);
    await test.info().attach('manual-weight-consumer-evidence', {
      body: Buffer.from(
        JSON.stringify(
          {
            kind: 'product-ui-manual-weight-save-restore-consumer',
            sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
            browser: test.info().project.name,
            backupHash: await sha256(archive),
            glbHash: await sha256(glb),
            sidecarHash: await sha256(sidecar),
            meshNodeId: partId,
            editedVertexId,
            editedVertexPosition,
            clipId,
            expectedDeltaX: { editedVertex: 0.5, otherVertices: 0.75 },
            consumerOracle: pose.oracle,
            runtime: pose.engine,
            runtimeVersion: pose.version,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });
    await test.info().attach('native-visual-consumer-manual-weight', {
      body: await consumer.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    await restoredContext.close();
    await consumerContext.close();
  }
});
