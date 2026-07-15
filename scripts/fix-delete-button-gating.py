from pathlib import Path

path = Path('src/features/editor/EditorScreen.tsx')
text = path.read_text()
old = 'disabled={deletingAsset || persistentMutationBlocked}'
new = 'disabled={deletingAsset || mutationBusy}'
if old not in text:
    raise SystemExit('asset delete button gating block not found')
path.write_text(text.replace(old, new, 1))
