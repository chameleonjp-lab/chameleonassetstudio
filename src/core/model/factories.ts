import { CURRENT_PROJECT_VERSION, PROJECT_FORMAT, type Project } from './project';

/** 一意な ID を作る（例: project_5f3e...）。 */
export function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

/** 空の新規プロジェクトを作る。 */
export function createEmptyProject(name: string, now: Date = new Date()): Project {
  const iso = now.toISOString();
  return {
    format: PROJECT_FORMAT,
    version: CURRENT_PROJECT_VERSION,
    id: generateId('project'),
    name,
    assets: [],
    createdAt: iso,
    updatedAt: iso,
  };
}
