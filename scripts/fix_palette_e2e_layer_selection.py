from pathlib import Path

path = Path('e2e/layer-repair-palette-workflow.spec.ts')
text = path.read_text()
old = """  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
}"""
new = """  await properties.getByRole('button', { name: '新規アセットを作成', exact: true }).click();
  await expect(page.getByLabel('アセットキャンバス')).toBeVisible();
  await properties.getByRole('button', { name: 'main', exact: true }).click();
  await expect(page.getByLabel('描画色')).toBeVisible();
}"""
if text.count(old) != 1:
    raise SystemExit(f'expected one createBlankAsset match, got {text.count(old)}')
path.write_text(text.replace(old, new, 1))
