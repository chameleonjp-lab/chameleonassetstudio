import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const oldCommit = '910ed2d0d667c6fa5f30e68c74ecc0f52307ce21';
const temporaryRoot = await mkdtemp(join(tmpdir(), 'cas3d-versioned-rollback-'));
const oldSource = join(temporaryRoot, 'old-source');
const oldDist = join(temporaryRoot, 'old-dist');
const currentDist = join(temporaryRoot, 'current-dist');
const evidencePath = join(repository, 'test-results/versioned-rollback-rehearsal/evidence.json');
let keepTemporaryFiles = true;

function command(name, args, options = {}) {
  const result = spawnSync(name, args, {
    cwd: repository,
    env: process.env,
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${name} ${args.join(' ')} exited with ${result.status}`);
  return result.stdout?.toString().trim() ?? '';
}
function git(...args) {
  return command('git', args, {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}
async function archiveCommit(commit, destination) {
  const gitArchive = spawn('git', ['archive', commit], {
    cwd: repository,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const tar = spawn('tar', ['-x', '-C', destination], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  const archiveExit = once(gitArchive, 'exit');
  const tarExit = once(tar, 'exit');
  await pipeline(gitArchive.stdout, tar.stdin);
  const [archiveCode] = await archiveExit;
  const [tarCode] = await tarExit;
  if (archiveCode !== 0 || tarCode !== 0)
    throw new Error(
      `Could not materialize historical source (git=${archiveCode}, tar=${tarCode}).`,
    );
}
function readPackageVersion(path) {
  return readFile(path, 'utf8').then((text) => JSON.parse(text).version);
}

try {
  command('git', ['cat-file', '-e', `${oldCommit}^{commit}`]);
  const currentCommit = git('rev-parse', 'HEAD');
  const historicalTree = git('rev-parse', `${oldCommit}^{tree}`);
  const currentPackage = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));

  await mkdir(oldSource, { recursive: true });
  await archiveCommit(oldCommit, oldSource);
  command('git', ['init', '--quiet'], { cwd: oldSource });
  command('git', ['add', '-A'], { cwd: oldSource });
  const archivedTree = command('git', ['write-tree'], {
    cwd: oldSource,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (archivedTree !== historicalTree)
    throw new Error(`Historical source tree mismatch: ${archivedTree} !== ${historicalTree}`);
  command(
    'git',
    [
      '-c',
      'user.name=Versioned Rehearsal',
      '-c',
      'user.email=versioned-rehearsal@invalid',
      'commit',
      '--quiet',
      '-m',
      'temporary historical source snapshot',
    ],
    { cwd: oldSource },
  );

  const oldPackage = JSON.parse(await readFile(join(oldSource, 'package.json'), 'utf8'));
  console.log(`Building historical app ${oldCommit} (schema 0.2.0)...`);
  command('npm', ['ci', '--no-audit', '--no-fund'], { cwd: oldSource });
  command('npm', ['run', 'build:app', '--', '--outDir', oldDist], {
    cwd: oldSource,
    env: { ...process.env, APP_BASE_PATH: '/rollback-old/', APP_SOURCE_COMMIT: oldCommit },
  });

  console.log(`Building current app ${currentCommit} (schema 0.3.0)...`);
  command('npm', ['run', 'build:app', '--', '--outDir', currentDist], {
    cwd: repository,
    env: { ...process.env, APP_BASE_PATH: '/rollback-new/', APP_SOURCE_COMMIT: currentCommit },
  });

  await mkdir(dirname(evidencePath), { recursive: true });
  const result = spawnSync(
    'npx',
    [
      'playwright',
      'test',
      '--config',
      'tools/3d-evaluation/versionedRollbackRehearsal.config.ts',
      '--reporter=list',
    ],
    {
      cwd: repository,
      env: {
        ...process.env,
        ROLLBACK_OLD_DIST: oldDist,
        ROLLBACK_CURRENT_DIST: currentDist,
        ROLLBACK_OLD_COMMIT: oldCommit,
        ROLLBACK_CURRENT_COMMIT: currentCommit,
        ROLLBACK_OLD_APP_VERSION: oldPackage.version,
        ROLLBACK_CURRENT_APP_VERSION: currentPackage.version,
        ROLLBACK_EVIDENCE_PATH: evidencePath,
        ROLLBACK_SCREENSHOT_PATH: join(
          repository,
          'test-results/versioned-rollback-rehearsal/rollback-refusal.png',
        ),
      },
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Versioned rehearsal failed with status ${result.status}.`);
  keepTemporaryFiles = false;
  console.log(`Evidence: ${evidencePath}`);
} catch (error) {
  console.error(`Temporary build directories retained for diagnosis: ${temporaryRoot}`);
  throw error;
} finally {
  if (!keepTemporaryFiles) await rm(temporaryRoot, { recursive: true, force: true });
}
