import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  validateStoredProject,
  upgradeLegacyProject,
  type Project3D,
  type StoredProject3D,
} from '../model/project';

export const BACKUP_EXTENSION = '.cas3dproj';
/** Initial native-backup profile, not a mobile memory guarantee. */
export const BACKUP_LIMITS = {
  archiveBytes: 64 * 1024 * 1024,
  jsonBytes: 8 * 1024 * 1024,
  entries: 4096,
} as const;
export interface ProjectBackup {
  project: Project3D;
  blobs: Map<string, Uint8Array>;
  /** Exact old archive retained before conversion for a separate recovery path. */
  legacyBackup?: Uint8Array;
}
interface Manifest {
  format: 'chameleon-backup-3d';
  version: '0.1.0' | '0.2.0';
  projectHash: string;
  blobs: { hash: string; bytes: number }[];
}
async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, '0')).join('');
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
/** Resident, renderer/network-free rescue encoder; callers retain the original on every failure. */
export async function exportBackup(
  project: StoredProject3D,
  source: ReadonlyMap<string, Uint8Array>,
): Promise<Uint8Array> {
  validateStoredProject(project);
  const snapshot = structuredClone(project);
  // Copy all input bytes before the first await; callers may keep editing afterwards.
  const blobs = new Map(
    snapshot.blobIds.map((id) => {
      const value = source.get(id);
      assert(value, `Missing blob: ${id}`);
      return [id, value.slice()] as const;
    }),
  );
  const projectBytes = strToU8(JSON.stringify(snapshot));
  assert(projectBytes.length <= BACKUP_LIMITS.jsonBytes, 'Project JSON exceeds backup profile');
  assert(blobs.size + 2 <= BACKUP_LIMITS.entries, 'Too many backup entries');
  const payloadBytes = [...blobs.values()].reduce(
    (total, bytes) => total + bytes.length,
    projectBytes.length,
  );
  // Leave space for the manifest and ZIP directory; exact output is checked as well.
  assert(payloadBytes <= BACKUP_LIMITS.archiveBytes, 'Backup exceeds archive profile');
  const records: Manifest['blobs'] = [];
  for (const [hash, bytes] of blobs) {
    assert((await digest(bytes)) === hash, `Blob hash mismatch: ${hash}`);
    records.push({ hash, bytes: bytes.length });
  }
  const manifest: Manifest = {
    format: 'chameleon-backup-3d',
    version: snapshot.schemaVersion,
    projectHash: await digest(projectBytes),
    blobs: records,
  };
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'project.json': projectBytes,
  };
  for (const [hash, bytes] of blobs) files[`blobs/${hash}`] = bytes;
  // Stored ZIP entries avoid a decoder dependency and preserve original binary bytes.
  const output = zipSync(files, { level: 0, mtime: new Date('1980-01-01T00:00:00Z') });
  assert(output.length <= BACKUP_LIMITS.archiveBytes, 'Backup exceeds archive profile');
  return output;
}
/** Native stored-ZIP profile only. External GLB and legacy 2D formats are separate paths. */
export async function importBackup(input: Uint8Array): Promise<ProjectBackup> {
  assert(input.length <= BACKUP_LIMITS.archiveBytes, 'Backup exceeds archive profile');
  const bytes = input.slice();
  let entries = 0,
    expanded = 0;
  const names = new Set<string>();
  const files = unzipSync(bytes, {
    filter: (file) => {
      assert(++entries <= BACKUP_LIMITS.entries, 'Too many backup entries');
      assert(!names.has(file.name), 'Duplicate backup entry');
      names.add(file.name);
      assert(
        file.name === 'manifest.json' ||
          file.name === 'project.json' ||
          /^blobs\/[a-f0-9]{64}$/.test(file.name),
        'Unsupported backup path',
      );
      assert(file.compression === 0, 'This backup profile requires stored ZIP entries');
      assert(file.size === file.originalSize, 'Stored entry size mismatch');
      expanded += file.originalSize;
      assert(
        Number.isSafeInteger(expanded) && expanded <= BACKUP_LIMITS.archiveBytes,
        'Backup payload exceeds profile',
      );
      if (file.name.endsWith('.json'))
        assert(file.originalSize <= BACKUP_LIMITS.jsonBytes, 'Backup JSON exceeds profile');
      return true;
    },
  });
  assert(files['manifest.json'] && files['project.json'], 'Incomplete backup');
  const manifest = JSON.parse(strFromU8(files['manifest.json'])) as Manifest;
  assert(
    manifest &&
      typeof manifest === 'object' &&
      manifest.format === 'chameleon-backup-3d' &&
      (manifest.version === '0.1.0' || manifest.version === '0.2.0'),
    'Unsupported backup format/version',
  );
  assert(
    Object.keys(manifest).sort().join(',') === 'blobs,format,projectHash,version',
    'Unsupported manifest fields',
  );
  assert(Array.isArray(manifest.blobs), 'Invalid blob manifest');
  assert((await digest(files['project.json'])) === manifest.projectHash, 'Project hash mismatch');
  const project: unknown = JSON.parse(strFromU8(files['project.json']));
  validateStoredProject(project);
  assert(manifest.version === project.schemaVersion, 'Backup/project version mismatch');
  const blobs = new Map<string, Uint8Array>();
  for (const entry of manifest.blobs) {
    assert(
      entry && typeof entry === 'object' && Object.keys(entry).sort().join(',') === 'bytes,hash',
      'Invalid blob entry',
    );
    assert(
      typeof entry.hash === 'string' && /^[a-f0-9]{64}$/.test(entry.hash) && !blobs.has(entry.hash),
      'Invalid or duplicate blob hash',
    );
    const payload = files[`blobs/${entry.hash}`];
    assert(
      payload && Number.isSafeInteger(entry.bytes) && entry.bytes === payload.length,
      'Missing blob or byte count mismatch',
    );
    assert((await digest(payload)) === entry.hash, 'Blob hash mismatch');
    blobs.set(entry.hash, payload);
  }
  assert(
    project.blobIds.length === blobs.size && project.blobIds.every((id) => blobs.has(id)),
    'Backup reference mismatch',
  );
  assert(names.size === blobs.size + 2, 'Unreferenced backup entry');
  return project.schemaVersion === '0.1.0'
    ? { project: upgradeLegacyProject(project), blobs, legacyBackup: bytes }
    : { project, blobs };
}
