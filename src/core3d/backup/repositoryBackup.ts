import type { CommitResult, ProjectRepository } from '../storage/repository';
import { exportBackup, importBackup } from './backup';
/** A detached, verified readonly capture keeps rescue available even when all writes fail. */
export async function exportStoredBackup(
  repository: ProjectRepository,
  projectId: string,
): Promise<Uint8Array> {
  const snapshot = await repository.captureBackupSnapshot(projectId);
  return exportBackup(snapshot.project, snapshot.blobs);
}
/** Validate all bytes first, then create a separate identity. Never overwrite an open project. */
export async function restoreBackupCopy(
  repository: ProjectRepository,
  bytes: Uint8Array,
  newProjectId: string,
  ownerId: string,
): Promise<CommitResult> {
  const restored = await importBackup(bytes);
  return repository.restoreCopy(restored.project, restored.blobs, newProjectId, ownerId, {
    legacyBackup: restored.legacyBackup,
  });
}
