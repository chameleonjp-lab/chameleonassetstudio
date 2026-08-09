import { expect, test } from '@playwright/test';
import type { AssetType } from '../src/core/model';
import {
  expectTargetAtLeast44,
  readStorageSnapshot,
  readZipOutputSnapshot,
} from './gameCheckOracle';
import {
  closeGameCheck,
  openGameCheck,
  reopenProject,
  seedGameCheckAsset,
  setupProjectWithImage,
  type GameCheckScenario,
} from './gameCheckSeed';

test.describe('Group 14 Game Check Mode', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });

  test('6素材種別の正常fixtureを説明表示し、tileは実画像9セルを使う', async ({ page }) => {
    const projectName = 'G14-6-types';
    await setupProjectWithImage(page, projectName);

    const cases: Array<{ type: AssetType; expected: RegExp }> = [
      { type: 'character', expected: /originのYを接地線/ },
      { type: 'item', expected: /自動の接地物理は加えず/ },
      { type: 'background', expected: /parallax設定を読み取り/ },
      { type: 'tile', expected: /実画像3×3反復/ },
      { type: 'gimmick', expected: /movementPreset「horizontal」/ },
      { type: 'effect', expected: /duration 500ms.*blend add/ },
    ];

    for (const fixture of cases) {
      await seedGameCheckAsset(page, fixture.type);
      await reopenProject(page, projectName);
      await openGameCheck(page);
      await expect(page.getByRole('main', { name: 'ゲーム確認' })).toContainText(fixture.expected);
      await expect(page.getByText('対象：source / edit関係')).toBeVisible();
      await expect(page.getByText('未確認：', { exact: false }).first()).toBeVisible();
      await expect(page.getByText('再確認：', { exact: false }).first()).toBeVisible();

      if (fixture.type === 'background') {
        await expect(page.getByLabel('parallax位置')).toBeVisible();
        await expect(page.getByText(/loopX.*no loopY/)).toBeVisible();
      }
      if (fixture.type === 'tile') {
        await expect(page.getByLabel('ゲーム風プレビューキャンバス')).toHaveAttribute(
          'data-preview-tile-cells',
          '9',
        );
      }
      if (fixture.type === 'effect') {
        await expect(page.getByRole('button', { name: '再生', exact: true })).toBeEnabled();
      }
      await closeGameCheck(page);
    }
  });

  test('Frame overrideの実効値とunset理由を読み取り専用で表示する', async ({ page }) => {
    const projectName = 'G14-frame-and-unset';
    await setupProjectWithImage(page, projectName);

    await seedGameCheckAsset(page, 'character', 'frame-override');
    await reopenProject(page, projectName);
    await openGameCheck(page);
    await expect(page.getByText(/実効collider：1件 \/ Frame override：1件/)).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Frame：g14_frame_0');
    await closeGameCheck(page);

    await seedGameCheckAsset(page, 'character', 'unset');
    await reopenProject(page, projectName);
    await openGameCheck(page);
    await expect(page.getByLabel('不足・不正・表示不能の理由')).toContainText(
      /textureIdが未設定|実効colliderが未設定/,
    );
    await closeGameCheck(page);
  });

  test('invalid・dangling・decode failure・missing Blobを非破壊の理由表示へ変換する', async ({
    page,
  }) => {
    const projectName = 'G14-invalid-states';
    await setupProjectWithImage(page, projectName);

    const cases: Array<{ scenario: GameCheckScenario; expected: RegExp }> = [
      { scenario: 'invalid-collider', expected: /missing-collider|colliderOverrides/ },
      { scenario: 'dangling-reference', expected: /画像参照が見つかりません/ },
      { scenario: 'decode-failure', expected: /デコードできませんでした/ },
      { scenario: 'missing-blob', expected: /Blobが見つかりません/ },
    ];

    for (const fixture of cases) {
      await seedGameCheckAsset(page, 'character', fixture.scenario);
      await reopenProject(page, projectName);
      await openGameCheck(page);
      await expect(page.getByLabel('不足・不正・表示不能の理由')).toContainText(
        fixture.expected,
      );
      await closeGameCheck(page);
    }
  });

  test('UI-only操作・keyboard・44px・scrollの前後で全storeとBlob bytesを変えない', async ({
    page,
  }) => {
    const projectName = 'G14-no-save-oracle';
    await setupProjectWithImage(page, projectName);
    await seedGameCheckAsset(page, 'background', 'export-compatible');
    await reopenProject(page, projectName);

    const casprojBefore = await readZipOutputSnapshot(page, '.casproj をダウンロード');
    await page.getByRole('button', { name: '書き出し', exact: true }).click();
    const exportBefore = await readZipOutputSnapshot(page, 'ZIP をダウンロード');
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const before = await readStorageSnapshot(page);
    const undo = page.getByRole('button', { name: '元に戻す', exact: true });
    const redo = page.getByRole('button', { name: 'やり直す', exact: true });
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    await expect(page.locator('.editor-save-status')).toHaveText('保存済み');

    let downloadCount = 0;
    const countDownload = () => {
      downloadCount += 1;
    };
    page.on('download', countDownload);
    await openGameCheck(page);

    const main = page.getByRole('main', { name: 'ゲーム確認' });
    await expect(main).toBeFocused();
    const play = page.getByRole('button', { name: '再生', exact: true });
    await play.click();
    await expect(page.getByRole('status')).toContainText('再生中');
    await page.getByRole('button', { name: '停止', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('停止中');

    const frameSelect = page.getByLabel('Preview Frame');
    await frameSelect.focus();
    await frameSelect.press('ArrowDown');
    await expect(frameSelect).toHaveValue('g14_frame_1');
    await page.getByLabel('Animation scrub').fill('0');
    await expect(frameSelect).toHaveValue('g14_frame_0');

    const colliderCheckbox = page.getByRole('checkbox', { name: '実効collider' });
    await colliderCheckbox.uncheck();
    await page.getByRole('checkbox', { name: 'anchor' }).uncheck();
    await page.getByLabel('parallax位置').fill('250');

    const impactToggle = page.getByRole('button', { name: /変更影響（Impact）/ });
    await impactToggle.focus();
    await impactToggle.press('Space');
    await expect(impactToggle).toHaveAttribute('aria-expanded', 'false');
    await impactToggle.press('Enter');
    await expect(impactToggle).toHaveAttribute('aria-expanded', 'true');

    await expectTargetAtLeast44(colliderCheckbox.locator('..'));
    await expectTargetAtLeast44(frameSelect);
    await expectTargetAtLeast44(play);
    const outline = await impactToggle.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);

    const layout = await page.evaluate(() => ({
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.documentScrollHeight).toBeGreaterThan(layout.viewportHeight);
    const footerBack = page.getByRole('button', { name: 'Editorへ戻る', exact: true }).last();
    await footerBack.scrollIntoViewIfNeeded();
    await expect(footerBack).toBeVisible();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    await expect(page.locator('.editor-save-status')).toHaveText('保存済み');
    page.off('download', countDownload);
    expect(downloadCount).toBe(0);

    const after = await readStorageSnapshot(page);
    expect(after).toBe(before);
    const casprojAfter = await readZipOutputSnapshot(page, '.casproj をダウンロード');
    expect(casprojAfter).toBe(casprojBefore);
    await page.getByRole('button', { name: '書き出し', exact: true }).click();
    const exportAfter = await readZipOutputSnapshot(page, 'ZIP をダウンロード');
    expect(exportAfter).toBe(exportBefore);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    expect(await readStorageSnapshot(page)).toBe(before);
    await reopenProject(page, projectName);
    expect(await readStorageSnapshot(page)).toBe(before);
    await expect(page.getByRole('button', { name: 'ゲーム確認', exact: true })).toBeVisible();
    await expect(page.getByRole('main', { name: 'ゲーム確認' })).toHaveCount(0);
  });

  test('reduced-motionではAnimationを自動再生せず、情報表示を残す', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const projectName = 'G14-reduced-motion';
    await setupProjectWithImage(page, projectName);
    await seedGameCheckAsset(page, 'effect');
    await reopenProject(page, projectName);
    await openGameCheck(page);

    await expect(page.getByText(/reduced-motion設定のため自動再生を停止/)).toBeVisible();
    await expect(page.getByRole('button', { name: '再生', exact: true })).toBeDisabled();
    await expect(page.getByText(/duration 500ms/)).toBeVisible();
  });
});
