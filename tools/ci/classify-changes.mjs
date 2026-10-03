import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function classifyChanges(files) {
  const result = { code: false, e2e: false, publish: false, h3: false };
  for (const file of files) {
    if (!file || file.endsWith('.md')) continue;
    result.code = true;
    if (
      /^(src\/|e2e\/|tools\/(game-check-e2e|3d-evaluation|h3|pages|ci|build)\/|public\/|(?:2d\/|3d\/)?index\.html$|package(-lock)?\.json$|playwright.*\.config\.|vite\.config\.|tsconfig.*\.json$|\.github\/workflows\/)/.test(
        file,
      )
    )
      result.e2e = true;
    if (
      /^(src\/|public\/|tools\/(h3|pages|ci|build)\/|(?:2d\/|3d\/)?index\.html$|package(-lock)?\.json$|vite\.config\.|tsconfig.*\.json$|\.github\/workflows\/h3-pages\.yml$)/.test(
        file,
      )
    )
      result.publish = true;
    // H3 runtime imports atlas and rig, including their transitive core/model dependencies.
    if (
      /^(src\/core\/|tools\/(h3|pages|ci|build)\/|package(-lock)?\.json$|vite\.config\.|tsconfig.*\.json$|\.github\/workflows\/)/.test(
        file,
      )
    )
      result.h3 = true;
  }
  return result;
}

export function changedScope(base, head) {
  try {
    if (!base || !head) throw new Error('Missing comparison ref');
    const files = execFileSync('git', ['diff', '--name-only', '-z', base, head], {
      encoding: 'utf8',
    }).split('\0');
    return classifyChanges(files);
  } catch {
    // Unknown comparison must never silently skip checks or publication.
    return { code: true, e2e: true, publish: true, h3: true };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = changedScope(process.env.BASE_SHA, process.env.GITHUB_SHA);
  const output = Object.entries(scope)
    .map(([key, value]) => `${key}=${value}\n`)
    .join('');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  else process.stdout.write(output);
}
