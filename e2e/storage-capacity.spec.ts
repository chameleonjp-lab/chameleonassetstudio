import { expect, test } from '@playwright/test';

test('使用率80%の警告を表示し、永続保存はボタン操作まで要求しない', async ({ page }) => {
  await page.addInitScript(() => {
    const state = globalThis as unknown as { __capacityPersistCalls: number };
    state.__capacityPersistCalls = 0;
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 800, quota: 1000 }),
        persisted: async () => false,
        persist: async () => {
          state.__capacityPersistCalls += 1;
          return true;
        },
      },
    });
  });

  await page.goto('/');
  const storage = page.getByRole('region', { name: '保存容量' });
  await expect(storage.getByText('使用量: 800 B / 1000 B（80.0%）')).toBeVisible();
  await expect(storage.getByText('警告', { exact: true })).toBeVisible();
  await expect(storage).toContainText('保存容量の80%以上を使用しています');
  await expect(storage).toContainText('保存領域は保護されていません');
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { __capacityPersistCalls: number }).__capacityPersistCalls,
    ),
  ).toBe(0);

  await storage.getByRole('button', { name: '保存領域の保護を要求' }).click();
  await expect(storage).toContainText('保存領域の保護が有効になりました');
  expect(
    await page.evaluate(
      () => (globalThis as unknown as { __capacityPersistCalls: number }).__capacityPersistCalls,
    ),
  ).toBe(1);
});

test('storage API非対応時は空き容量を推測せずfallbackを表示する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', { configurable: true, value: {} });
  });

  await page.goto('/');
  const storage = page.getByRole('region', { name: '保存容量' });
  await expect(storage).toContainText('この環境は使用量の取得に対応していません');
  await expect(storage).toContainText('使用率を計算できません');
  await expect(storage).toContainText('保存領域の保護状態を確認または要求できません');
  await expect(storage).not.toContainText('%）');
});

test('容量不足で新規保存に失敗しても既存Projectを維持する', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('プロジェクト名').fill('容量不足前の正本');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: '容量不足前の正本' })).toBeVisible();
  await page.getByRole('button', { name: '← ホーム' }).click();

  await page.evaluate(() => {
    const state = globalThis as unknown as {
      __capacityOriginalPut: typeof IDBObjectStore.prototype.put;
    };
    state.__capacityOriginalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('injected quota failure', 'QuotaExceededError');
    };
  });

  await page.getByLabel('プロジェクト名').fill('保存されないProject');
  await page.getByRole('button', { name: '作成', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保存済みの正本は変更されていません');
  await expect(page.getByRole('alert')).toContainText('.casproj');
  await expect(page.getByRole('button', { name: '「容量不足前の正本」を開く' })).toBeVisible();
  await expect(page.getByRole('button', { name: '「保存されないProject」を開く' })).toHaveCount(0);

  await page.evaluate(() => {
    const state = globalThis as unknown as {
      __capacityOriginalPut: typeof IDBObjectStore.prototype.put;
    };
    IDBObjectStore.prototype.put = state.__capacityOriginalPut;
  });
  await page.getByRole('button', { name: '「容量不足前の正本」を開く' }).click();
  await expect(page.getByRole('heading', { name: '容量不足前の正本' })).toBeVisible();
});

test('375px幅でも容量案内による横スクロールが発生しない', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({ usage: 950, quota: 1000 }),
        persisted: async () => false,
        persist: async () => false,
      },
    });
  });

  await page.goto('/');
  await expect(page.getByRole('region', { name: '保存容量' })).toContainText('重要な警告');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
