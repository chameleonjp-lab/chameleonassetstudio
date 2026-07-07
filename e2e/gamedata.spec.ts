import { expect, test, type Locator, type Page } from '@playwright/test';

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

async function setupProjectWithImage(page: Page, name: string): Promise<Locator> {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill(name);
  await page.getByRole('button', { name: '作成' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  const buffer = await makePngBuffer(page);
  await page
    .getByLabel('画像を選ぶ')
    .setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer });
  const canvas = page.getByLabel('アセットキャンバス');
  await expect(canvas).toBeVisible();
  return canvas;
}

interface StoredGameData {
  origin: { x: number; y: number };
  anchors: Array<{ name: string; role: string; position: { x: number; y: number } }>;
  colliders: Array<{
    purpose: string;
    shape: string;
    visible: boolean;
    rect?: { x: number; y: number; width: number; height: number };
    circle?: { x: number; y: number; radius: number };
  }>;
}

async function readStoredAsset(page: Page): Promise<StoredGameData> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const records = await new Promise<Array<{ data: unknown }>>((resolve, reject) => {
      const request = db.transaction('assets', 'readonly').objectStore('assets').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return records[0]?.data as never;
  });
}

test('原点をツールと数値入力で設定でき、下中央へ戻せる', async ({ page }) => {
  const canvas = await setupProjectWithImage(page, '原点テスト');

  // キャラクターの初期原点は下中央（64x64 なので 32, 64）
  await expect(page.getByLabel('原点 X')).toHaveValue('32');
  await expect(page.getByLabel('原点 Y')).toHaveValue('64');

  // 原点ツールでクリックすると移動する
  await page
    .getByRole('navigation', { name: 'ツール' })
    .getByRole('button', { name: '原点' })
    .click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(async () => (await readStoredAsset(page)).origin.y).not.toBe(64);

  // 数値入力でも設定できる
  const originX = page.getByLabel('原点 X');
  await originX.fill('10');
  await originX.blur();
  await expect.poll(async () => (await readStoredAsset(page)).origin.x).toBe(10);

  // 下中央へ戻す
  await page.getByRole('button', { name: '下中央へ戻す' }).click();
  await expect.poll(async () => (await readStoredAsset(page)).origin).toEqual({ x: 32, y: 64 });

  // Undo で戻る
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect.poll(async () => (await readStoredAsset(page)).origin.x).toBe(10);
});

test('アンカーを追加・移動・削除でき、用途を設定できる', async ({ page }) => {
  const canvas = await setupProjectWithImage(page, 'アンカーテスト');

  // 用途を選んでアンカーツールでクリック追加
  await page.getByLabel('追加するアンカーの用途').selectOption('hand_right');
  await page
    .getByRole('navigation', { name: 'ツール' })
    .getByRole('button', { name: 'アンカー' })
    .click();
  const box = (await canvas.boundingBox())!;
  const clickX = box.x + box.width / 2;
  const clickY = box.y + box.height / 2;
  await page.mouse.click(clickX, clickY);

  const anchorList = page.getByRole('list', { name: 'アンカー一覧' });
  await expect(anchorList.getByRole('listitem')).toHaveCount(1);
  await expect.poll(async () => (await readStoredAsset(page)).anchors[0]?.role).toBe('hand_right');
  const initialX = (await readStoredAsset(page)).anchors[0].position.x;

  // マーカーをドラッグして移動
  await page.mouse.move(clickX, clickY);
  await page.mouse.down();
  await page.mouse.move(clickX + 40, clickY, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await readStoredAsset(page)).anchors[0]?.position.x)
    .toBeGreaterThan(initialX);

  // 用途の変更
  await anchorList.getByLabel('用途').selectOption('weapon');
  await expect.poll(async () => (await readStoredAsset(page)).anchors[0]?.role).toBe('weapon');

  // 削除
  await anchorList.getByRole('button', { name: /を削除$/ }).click();
  await expect(anchorList).toBeHidden();
  await expect.poll(async () => (await readStoredAsset(page)).anchors.length).toBe(0);
});

test('矩形と円の当たり判定を追加・編集・表示切替でき、再読み込み後も残る', async ({ page }) => {
  await setupProjectWithImage(page, '判定テスト');

  await page.getByRole('button', { name: '矩形判定を追加' }).click();
  const rectSelect = page.getByRole('button', { name: '判定「body」を選択' });
  await rectSelect.click();
  await expect(rectSelect).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '判定「body」の表示を切り替え' })).toBeVisible();
  await page.getByRole('button', { name: '円判定を追加' }).click();

  const colliderList = page.getByRole('list', { name: '当たり判定一覧' });
  await expect(colliderList.getByRole('listitem')).toHaveCount(2);

  // 矩形の幅を編集
  const rectRow = colliderList.getByRole('listitem').first();
  const widthInput = rectRow.getByLabel('幅');
  await widthInput.fill('20');
  await widthInput.blur();
  await expect.poll(async () => (await readStoredAsset(page)).colliders[0]?.rect?.width).toBe(20);

  // 用途を attack へ
  await rectRow.getByLabel('用途').selectOption('attack');
  await expect.poll(async () => (await readStoredAsset(page)).colliders[0]?.purpose).toBe('attack');
  await expect(page.getByRole('button', { name: '判定「attack」を選択' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // 円も一覧から選択できる
  const circleSelect = page.getByRole('button', { name: '判定「body」を選択' });
  await circleSelect.click();
  await expect(circleSelect).toHaveAttribute('aria-pressed', 'true');

  // 円の半径を編集
  const circleRow = colliderList.getByRole('listitem').nth(1);
  const radiusInput = circleRow.getByLabel('半径');
  await radiusInput.fill('8');
  await radiusInput.blur();
  await expect.poll(async () => (await readStoredAsset(page)).colliders[1]?.circle?.radius).toBe(8);

  // 個別の表示切り替え
  await rectRow.getByRole('button', { name: /の表示を切り替え$/ }).click();
  await expect.poll(async () => (await readStoredAsset(page)).colliders[0]?.visible).toBe(false);

  // 一括表示トグルは UI 状態（保存データは変えない）
  const globalToggle = page.getByRole('button', { name: '判定を表示', exact: true });
  await globalToggle.click();
  await expect(globalToggle).toHaveAttribute('aria-pressed', 'false');

  // 再読み込み後も残る
  await page.reload();
  await page.getByRole('button', { name: '「判定テスト」を開く' }).click();
  await expect(
    page.getByRole('list', { name: '当たり判定一覧' }).getByRole('listitem'),
  ).toHaveCount(2);
  const stored = await readStoredAsset(page);
  expect(stored.colliders[0].purpose).toBe('attack');
  expect(stored.colliders[1].circle?.radius).toBe(8);
});

test('判定用途の色凡例が表示され、判定を追加すると行にカラースワッチが出る', async ({ page }) => {
  await setupProjectWithImage(page, '判定色凡例テスト');

  // 用途の色凡例（body / attack / pickup / sensor / custom）が常に表示される
  const legend = page.getByRole('list', { name: '判定用途の色凡例' });
  await expect(legend).toBeVisible();
  await expect(legend.getByRole('listitem')).toHaveCount(5);
  for (const purpose of ['body', 'attack', 'pickup', 'sensor', 'custom']) {
    await expect(legend.getByText(purpose)).toBeVisible();
  }

  // 判定を追加すると、その行に用途色のスワッチ（title="body の色"）が出る
  await page.getByRole('button', { name: '矩形判定を追加' }).click();
  await expect(page.getByTitle('body の色')).toBeVisible();

  const colliderList = page.getByRole('list', { name: '当たり判定一覧' });
  await colliderList.getByLabel('用途').selectOption('sensor');
  await expect(page.getByTitle('sensor の色')).toHaveClass(/sensor/);
});
