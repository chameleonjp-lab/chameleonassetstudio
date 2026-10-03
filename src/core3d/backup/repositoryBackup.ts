import type { CommitResult, ProjectRepository } from '../storage/repository';
import { exportBackup, importBackup } from './backup';
/** Keep the database snapshot pinned until bytes have been encoded or encoding fails. */
export async function exportStoredBackup(
  repository: ProjectRepository,
  projectId: string,
): Promise<Uint8Array> {
  const snapshot = await repository.readSnapshot(projectId, { kind: 'backup' });
  try {
    return await exportBackup(snapshot.project, snapshot.blobs);
  } finally {
    await snapshot.release();
  }
}
/** Validate all bytes first, then create a separate identity. Never overwrite an open project. */
export async function restoreBackupCopy(
  repository: ProjectRepository,
  bytes: Uint8Array,
  newProjectId: string,
  ownerId: string,
): Promise<CommitResult> {
  const restored = await importBackup(bytes);
  return repository.restoreCopy(restored.project, restored.blobs, newProjectId, ownerId);
}
