import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type NoticeFile = { path: string; sha256: string };
type DependencyNotice = { name: string; version: string; files: readonly NoticeFile[] };
export type NoticeReader = (relativePath: string) => Buffer;

const licensePackage = (name: string, version: string, sha256: string, path = 'LICENSE') => ({
  name,
  version,
  files: [{ path, sha256 }],
});

/** Reviewed installed-package bytes. Updating dependencies requires reviewing these pins. */
export const runtimeNoticePackages: readonly DependencyNotice[] = [
  licensePackage(
    'ajv',
    '8.20.0',
    'a05350a88e318e4f5f2c2a1ff1e2e88daa4dd38e6e78b71cccae422bdc762cc3',
  ),
  licensePackage(
    'ajv-formats',
    '3.0.1',
    '9df3bb69929a3b650ed73b3bfa1756725aaff0ac296461605753547004eafeaf',
  ),
  licensePackage(
    'fast-deep-equal',
    '3.1.3',
    '7bf9b2de73a6b356761c948d0e9eeb4be6c1270bd04c79cd489c1e400ffdfc1a',
  ),
  // BSD-3-Clause, including its complete additional copyright/attribution text.
  licensePackage(
    'fast-uri',
    '3.1.8',
    'b010b0dfdfdb23d7396e03b82cd4621fc9bb8f95d6b0aea70b9c24e12074c786',
  ),
  licensePackage(
    'fflate',
    '0.8.3',
    '0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551',
  ),
  licensePackage(
    'json-schema-traverse',
    '1.0.0',
    '7bf9b2de73a6b356761c948d0e9eeb4be6c1270bd04c79cd489c1e400ffdfc1a',
  ),
  licensePackage(
    'react',
    '19.2.7',
    'da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93',
  ),
  licensePackage(
    'react-dom',
    '19.2.7',
    'da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93',
  ),
  licensePackage(
    'require-from-string',
    '2.0.2',
    '6ee0feb1f6ef996ff5a68600f8cf98909cf412d39ef3cdceaefd87d636fa1b7f',
    'license',
  ),
  licensePackage(
    'scheduler',
    '0.27.0',
    'da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93',
  ),
  licensePackage(
    'three',
    '0.186.1',
    '8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc',
  ),
];

const babylonLicense: NoticeFile = {
  path: 'license.md',
  sha256: '9362ea9ea17cb221a20cbbd63f404710834cc273d2a9a7b60314fd68ab702cd6',
};
export const consumerNoticePackages: readonly DependencyNotice[] = [
  {
    name: '@babylonjs/core',
    version: '9.28.0',
    files: [
      babylonLicense,
      {
        path: 'NOTICE.md',
        sha256: '7f85d099ce3c6e1900a45ee8d5b8fa405e760c746af687b3ee2081416e48f183',
      },
    ],
  },
  { name: '@babylonjs/loaders', version: '9.28.0', files: [babylonLicense] },
  { name: 'babylonjs-gltf2interface', version: '9.28.0', files: [babylonLicense] },
];
export const sourceOnlyNoticePackages: readonly DependencyNotice[] = [
  {
    name: 'gltf-validator',
    version: '2.0.0-dev.3.10',
    files: [
      {
        path: 'LICENSE',
        sha256: '3ddf9be5c28fe27dad143a5dc76eea25222ad1dd68934a047064e56ed2fa40c5',
      },
      {
        path: 'NOTICES',
        sha256: '933f161ca1e7b3ead5a6cf93ebb3bf6cb67f0e79b38e08d2046f8cdc41cb78a3',
      },
    ],
  },
];

export const runtimeNoticePath = 'public/licenses/runtime-notices.txt';
export const consumerNoticePath = 'tools/3d-consumer/public/licenses/babylon-notices.txt';

const runtimePreamble =
  'Chameleon Asset Studio - production dependency notices\n' +
  'Complete license texts from the pinned production dependency inventory.\n' +
  'This inventory includes transitive dependencies such as require-from-string,\n' +
  'even when a dependency is not included in the browser bundle.\n' +
  'Package headers are added below; original license bytes are preserved.\n';
const consumerPreamble =
  'Chameleon Asset Studio - isolated Babylon consumer notices\n' +
  'These dependencies belong to the independent development/test consumer.\n' +
  'They are not part of the product runtime dependency inventory.\n' +
  'Complete original license and notice bytes are preserved below.\n';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const packagePath = (dependency: DependencyNotice) => `node_modules/${dependency.name}`;

function readRequired(read: NoticeReader, path: string): Buffer {
  try {
    return read(path);
  } catch (cause) {
    throw new Error(`Missing or unreadable notice input: ${path}`, { cause });
  }
}

function readJson(read: NoticeReader, path: string): unknown {
  try {
    return JSON.parse(readRequired(read, path).toString('utf8')) as unknown;
  } catch (cause) {
    throw new Error(`Invalid or unreadable JSON: ${path}`, { cause });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkInventory(read: NoticeReader): Map<string, Buffer> {
  const lock = readJson(read, 'package-lock.json');
  if (!isRecord(lock) || lock.lockfileVersion !== 3 || !isRecord(lock.packages))
    throw new Error('Expected package-lock.json lockfileVersion 3 with packages');
  const entries = Object.entries(lock.packages);
  for (const [path, entry] of entries)
    if (!isRecord(entry)) throw new Error(`Invalid lock package: ${path}`);
  const production = entries
    .filter(([path, entry]) => path !== '' && (entry as Record<string, unknown>).dev !== true)
    .map(([path]) => path)
    .sort();
  const expected = runtimeNoticePackages.map(packagePath).sort();
  const missing = expected.filter((path) => !production.includes(path));
  const unexpected = production.filter((path) => !expected.includes(path));
  if (missing.length || unexpected.length)
    throw new Error(
      `Production notice coverage mismatch; missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`,
    );

  const originals = new Map<string, Buffer>();
  for (const dependency of [
    ...runtimeNoticePackages,
    ...consumerNoticePackages,
    ...sourceOnlyNoticePackages,
  ]) {
    const path = packagePath(dependency);
    const entry = lock.packages[path];
    const installed = readJson(read, `${path}/package.json`);
    if (
      !isRecord(entry) ||
      entry.version !== dependency.version ||
      !isRecord(installed) ||
      installed.name !== dependency.name ||
      installed.version !== dependency.version
    )
      throw new Error(
        `Package identity/version mismatch: ${dependency.name}@${dependency.version}`,
      );
    const shouldBeDev = !runtimeNoticePackages.includes(dependency);
    if ((entry.dev === true) !== shouldBeDev)
      throw new Error(`Package dependency scope mismatch: ${dependency.name}`);
    for (const file of dependency.files) {
      const sourcePath = `${path}/${file.path}`;
      const bytes = readRequired(read, sourcePath);
      if (sha256(bytes) !== file.sha256)
        throw new Error(`Original notice SHA-256 mismatch: ${sourcePath}`);
      originals.set(sourcePath, bytes);
    }
  }
  return originals;
}

function assemble(
  preamble: string,
  dependencies: readonly DependencyNotice[],
  originals: ReadonlyMap<string, Buffer>,
): Buffer {
  const parts = [Buffer.from(preamble)];
  for (const dependency of dependencies) {
    parts.push(Buffer.from(`\n===== ${dependency.name}@${dependency.version} =====\n`));
    for (const file of dependency.files) {
      parts.push(Buffer.from(`\n--- ${file.path} ---\n`));
      // Do not trim, normalize line endings, or reformat upstream texts.
      parts.push(originals.get(`${packagePath(dependency)}/${file.path}`)!);
      parts.push(Buffer.from('\n'));
    }
  }
  return Buffer.concat(parts);
}

/** Pure, read-only assembly; callers must explicitly review any future snapshot update. */
export function renderThirdPartyNotices(read: NoticeReader): ReadonlyMap<string, Buffer> {
  const originals = checkInventory(read);
  return new Map([
    [runtimeNoticePath, assemble(runtimePreamble, runtimeNoticePackages, originals)],
    [consumerNoticePath, assemble(consumerPreamble, consumerNoticePackages, originals)],
  ]);
}

function assertEqual(read: NoticeReader, path: string, expected: Buffer) {
  if (!readRequired(read, path).equals(expected))
    throw new Error(`Notice bytes differ from complete original texts: ${path}`);
}

/** No network, directory traversal, vulnerability audit, or legal interpretation. */
export function inspectThirdPartyNotices(read: NoticeReader) {
  const documents = renderThirdPartyNotices(read);
  for (const [path, expected] of documents) assertEqual(read, path, expected);
  assertEqual(
    read,
    'public/licenses/three-MIT.txt',
    readRequired(read, 'node_modules/three/LICENSE'),
  );
  for (const file of sourceOnlyNoticePackages[0].files)
    assertEqual(
      read,
      `docs/licenses/gltf-validator-2.0.0-dev.3.10-${file.path}.txt`,
      readRequired(read, `node_modules/gltf-validator/${file.path}`),
    );
  const legacyBabylon = readRequired(read, 'docs/licenses/babylon-9.28.0.txt');
  for (const dependency of consumerNoticePackages)
    for (const file of dependency.files)
      if (!legacyBabylon.includes(readRequired(read, `${packagePath(dependency)}/${file.path}`)))
        throw new Error(
          `Legacy Babylon notice omits complete original text: ${dependency.name}/${file.path}`,
        );
  return {
    productionPackages: runtimeNoticePackages.length,
    consumerPackages: consumerNoticePackages.length,
    sourceOnlyPackages: sourceOnlyNoticePackages.length,
    documents: [...documents].map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: sha256(bytes),
    })),
  };
}

export function verifyThirdPartyNotices(root = process.cwd()) {
  return inspectThirdPartyNotices((path) => readFileSync(resolve(root, path)));
}

export type DistributionDirectories = { productDir?: string; consumerDir?: string };

/** Verify existing build output only. This function never creates or rebuilds output. */
export function inspectDistributedNotices(
  read: NoticeReader,
  directories: DistributionDirectories = {},
) {
  const source = inspectThirdPartyNotices(read);
  const { productDir = 'dist', consumerDir = 'dist-3d-consumer' } = directories;
  const pairs = [
    [runtimeNoticePath, `${productDir}/licenses/runtime-notices.txt`],
    ['public/licenses/three-MIT.txt', `${productDir}/licenses/three-MIT.txt`],
    [consumerNoticePath, `${consumerDir}/licenses/babylon-notices.txt`],
  ];
  const distributedFiles = pairs.map(([sourcePath, path]) => {
    const bytes = readRequired(read, sourcePath);
    assertEqual(read, path, bytes);
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  return { ...source, distributedFiles };
}

export function verifyDistributedNotices(
  root = process.cwd(),
  directories: DistributionDirectories = {},
) {
  return inspectDistributedNotices((path) => readFileSync(resolve(root, path)), directories);
}

// Optional read-only CLI: vite-node --script tools/build/thirdPartyNotices.ts [--dist]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--dist'))
      throw new Error('Usage: vite-node --script tools/build/thirdPartyNotices.ts [--dist]');
    console.log(
      JSON.stringify(
        args[0] === '--dist' ? verifyDistributedNotices() : verifyThirdPartyNotices(),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
