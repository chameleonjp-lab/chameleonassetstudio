from pathlib import Path

path = Path('src/features/editor/EditorScreen.tsx')
text = path.read_text()
old = """    if (!ok) {
      return;
    }
    if (!beginEditorPersistentMutation()) {
      return;
    }
"""
new = """    if (!ok) {
      return;
    }
    await history.waitForPending();
    if (!beginEditorPersistentMutation()) {
      return;
    }
"""
if old not in text:
    raise SystemExit('EditorScreen delete sequencing block not found')
path.write_text(text.replace(old, new, 1))
