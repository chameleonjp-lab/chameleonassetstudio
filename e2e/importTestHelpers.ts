import type { Page } from '@playwright/test';

/** L1の共通previewを明示確定し、dialogが閉じるまで待つ。warningなしのsetup用。 */
export async function confirmImageImport(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: '取り込み確定前preview' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: '取り込みを確定' }).click();
  await dialog.waitFor({ state: 'hidden' });
}
