import type { ProjectRepository } from '../../core3d/storage/repository';
import type { ProjectSession } from './projectSession';
/** A fallible editor view does not own resident source bytes or the rescue session. */
export async function preserveSessionForRescue(session: ProjectSession): Promise<void> {
  session.edit.setBlocked('editor-subtree-unmounted', true);
  // save cancels transient pose/gesture work; success and failure both retain resident blobs.
  await session.save();
}
/** Only the surviving shell (or an explicit project switch) may release session resources. */
export async function releaseEditorResources(
  session: ProjectSession | null,
  repositories: Iterable<ProjectRepository>,
): Promise<void> {
  // On failed save/close, keep repositories and rescue bytes alive. Never force a discard.
  await session?.close();
  for (const repository of repositories) repository.close();
}

/** Adopt only while the initiating editor lifetime still owns the surviving rescue ref. */
export async function adoptEditorSession(
  ref: { current: ProjectSession | null },
  next: ProjectSession,
  isCurrentOwner: () => boolean,
): Promise<boolean> {
  const previous = ref.current;
  const valid = () => isCurrentOwner() && ref.current === previous;
  if (!valid()) {
    await next.close();
    return false;
  }
  try {
    if (previous) {
      // Ref transfer and resident-byte release share the same synchronous boundary.
      // A microtask between close() resolving and this continuation cannot strand rescue.
      const released = await previous.close(valid, () => {
        ref.current = next;
      });
      if (!released) {
        await next.close();
        return false;
      }
    } else {
      ref.current = next;
    }
  } catch (cause) {
    await next.close().catch(() => undefined);
    throw cause;
  }
  return true;
}
