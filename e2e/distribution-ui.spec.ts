import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';

for (const profile of ['fixed-grid', 'packed']) {
  for (const scale of [1, 2, 3]) {
    test(`配布画面から${profile}・${scale}倍のZIPと一致する座標情報を取得する`, async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByRole('button', { name: '作成', exact: true }).click();
      await page.getByLabel('見本の絵を入れて始める').check();
      await page.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
      const panel = page.getByRole('region', { name: '配布用ZIP' });
      await panel.getByLabel('配布画像の配置').selectOption(profile);
      await panel.getByLabel('配布画像の倍率').selectOption(String(scale));
      await panel.getByLabel('配布画像間の余白').fill('3');
      const download = page.waitForEvent('download');
      await panel.getByRole('button', { name: '配布用ZIPをダウンロード' }).click();
      const file = await download;
      expect(file.suggestedFilename()).toContain(`-${scale}x.zip`);
      const entries = unzipSync(await readFile((await file.path())!));
      const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
      expect(manifest).toMatchObject({ scale, profile });
      expect(entries['helpers/chameleon-generic-web.js']).toBeTruthy();
      expect(entries['asset.json']).toBeTruthy();
      for (const path of manifest.pages.map((item: { path: string }) => item.path)) {
        expect(entries[path]).toBeTruthy();
      }
      await expect(panel.getByRole('status').last()).toContainText('ダウンロードを開始しました');
    });
  }
}
