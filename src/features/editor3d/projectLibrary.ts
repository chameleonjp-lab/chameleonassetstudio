import {
  hashProject,
  type ProjectRepository,
  type RecoverySnapshotSummary,
} from '../../core3d/storage/repository';
import { ProjectSession } from './projectSession';

/** Recover into a separately persisted identity. Never replace the selected project's root. */
export async function openRecoveryCopy(
  repository: ProjectRepository,
  ownerId: string,
  projectId: string,
  selected: Pick<RecoverySnapshotSummary, 'snapshotId' | 'revision' | 'contentHash' | 'available'>,
) {
  const token = { ...selected };
  if (!token.available || token.revision === null || !token.contentHash)
    throw new Error('復旧候補を読み直してください。');
  const snapshot = await repository.captureBackupSnapshot(projectId, {
    snapshotId: token.snapshotId,
    includeTrashed: true,
  });
  if (
    snapshot.revision !== token.revision ||
    (await hashProject(snapshot.project)) !== token.contentHash
  )
    throw new Error('復旧候補が変わりました。内容を読み直してください。');
  const newId = crypto.randomUUID();
  const committed = await repository.restoreCopy(snapshot.project, snapshot.blobs, newId, ownerId);
  try {
    return await ProjectSession.open(repository, ownerId, newId);
  } catch (error) {
    // Release only the exact newly-created writer token. Durable copy bytes remain.
    await repository.releaseWriter(committed.writerLease).catch(() => undefined);
    throw error;
  }
}
