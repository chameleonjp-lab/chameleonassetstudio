import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  consumerNoticePackages,
  consumerNoticePath,
  inspectDistributedNotices,
  inspectThirdPartyNotices,
  renderThirdPartyNotices,
  runtimeNoticePackages,
  runtimeNoticePath,
  sourceOnlyNoticePackages,
  verifyThirdPartyNotices,
  type NoticeReader,
} from './thirdPartyNotices';

const root = fileURLToPath(new URL('../../', import.meta.url));
const packages = [...runtimeNoticePackages, ...consumerNoticePackages, ...sourceOnlyNoticePackages];
const paths = [
  'package-lock.json',
  ...packages.flatMap((dependency) => [
    `node_modules/${dependency.name}/package.json`,
    ...dependency.files.map((file) => `node_modules/${dependency.name}/${file.path}`),
  ]),
  runtimeNoticePath,
  consumerNoticePath,
  'public/licenses/three-MIT.txt',
  'docs/licenses/babylon-9.28.0.txt',
  'docs/licenses/gltf-validator-2.0.0-dev.3.10-LICENSE.txt',
  'docs/licenses/gltf-validator-2.0.0-dev.3.10-NOTICES.txt',
];

function fixture() {
  // Explicit inputs only. Mutations below affect an in-memory copy, never installed files.
  const files = new Map(paths.map((path) => [path, readFileSync(resolve(root, path))]));
  const read: NoticeReader = (path) => {
    const bytes = files.get(path);
    if (!bytes) throw new Error(`No fixture input: ${path}`);
    return bytes;
  };
  const editJson = (path: string, edit: (json: Record<string, unknown>) => void) => {
    const json = JSON.parse(read(path).toString('utf8')) as Record<string, unknown>;
    edit(json);
    files.set(path, Buffer.from(JSON.stringify(json)));
  };
  const editLock = (edit: (entries: Record<string, Record<string, unknown>>) => void) =>
    editJson('package-lock.json', (lock) =>
      edit(lock.packages as Record<string, Record<string, unknown>>),
    );
  return { files, read, editJson, editLock };
}

describe('pinned distribution notices', () => {
  it('covers every production dependency and keeps consumer/source-only scope separate', () => {
    const { read } = fixture();
    const result = inspectThirdPartyNotices(read);
    expect(result).toMatchObject({
      productionPackages: 11,
      consumerPackages: 3,
      sourceOnlyPackages: 1,
    });
    expect(result.documents.map((file) => file.path)).toEqual([
      runtimeNoticePath,
      consumerNoticePath,
    ]);
    for (const [path, dependencies] of [
      [runtimeNoticePath, runtimeNoticePackages],
      [consumerNoticePath, consumerNoticePackages],
    ] as const) {
      const document = read(path);
      for (const dependency of dependencies) {
        expect(
          document.includes(Buffer.from(`===== ${dependency.name}@${dependency.version} =====`)),
        ).toBe(true);
        for (const file of dependency.files)
          expect(document.includes(read(`node_modules/${dependency.name}/${file.path}`))).toBe(
            true,
          );
      }
    }
    expect(read(runtimeNoticePath).includes(Buffer.from('require-from-string@2.0.2'))).toBe(true);
    expect(read(runtimeNoticePath).includes(Buffer.from('@babylonjs/'))).toBe(false);
    expect(read(consumerNoticePath).includes(Buffer.from('gltf-validator'))).toBe(false);
  });

  it.each([
    'node_modules/ajv/LICENSE',
    'node_modules/@babylonjs/core/NOTICE.md',
    runtimeNoticePath,
  ])('rejects a missing input: %s', (path) => {
    const { files, read } = fixture();
    files.delete(path);
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      `Missing or unreadable notice input: ${path}`,
    );
  });

  it.each(['lock', 'installed', 'both'])(
    'rejects a changed %s package version rather than silently relabeling notices',
    (target) => {
      const { read, editJson, editLock } = fixture();
      if (target !== 'installed')
        editLock((entries) => {
          entries['node_modules/ajv'].version = '8.20.1';
        });
      if (target !== 'lock')
        editJson('node_modules/ajv/package.json', (pkg) => {
          pkg.version = '8.20.1';
        });
      expect(() => inspectThirdPartyNotices(read)).toThrow(
        'Package identity/version mismatch: ajv@8.20.0',
      );
    },
  );

  it('rejects an installed package with a different identity', () => {
    const { read, editJson } = fixture();
    editJson('node_modules/three/package.json', (pkg) => {
      pkg.name = 'other-three';
    });
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      'Package identity/version mismatch: three@0.186.1',
    );
  });

  it('rejects an omitted production lock entry', () => {
    const { read, editLock } = fixture();
    editLock((entries) => {
      delete entries['node_modules/require-from-string'];
    });
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      'missing: node_modules/require-from-string',
    );
  });

  it.each(['node_modules/new-runtime', 'node_modules/ajv/node_modules/new-runtime'])(
    'rejects an uncovered production dependency, including nested lock entries: %s',
    (path) => {
      const { read, editLock } = fixture();
      editLock((entries) => {
        entries[path] = { version: '1.0.0', license: 'MIT' };
      });
      expect(() => inspectThirdPartyNotices(read)).toThrow(`unexpected: ${path}`);
    },
  );

  it('does not require distribution notices for unrelated development tools', () => {
    const { read, editLock } = fixture();
    editLock((entries) => {
      entries['node_modules/new-development-tool'] = { version: '1.0.0', dev: true };
    });
    expect(inspectThirdPartyNotices(read).productionPackages).toBe(11);
  });

  it('rejects invalid lock structure and malformed JSON', () => {
    const { read, files, editJson } = fixture();
    editJson('package-lock.json', (lock) => {
      lock.packages = [];
    });
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      'Expected package-lock.json lockfileVersion 3',
    );
    files.set('package-lock.json', Buffer.from('{'));
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      'Invalid or unreadable JSON: package-lock.json',
    );
  });

  it('rejects a source-only validator accidentally moved into production', () => {
    const { read, editLock } = fixture();
    editLock((entries) => {
      delete entries['node_modules/gltf-validator'].dev;
    });
    expect(() => inspectThirdPartyNotices(read)).toThrow('unexpected: node_modules/gltf-validator');
  });

  it.each(['node_modules/fast-uri/LICENSE', 'node_modules/@babylonjs/core/NOTICE.md'])(
    'rejects changed original text even when both original and snapshot are changed: %s',
    (path) => {
      const { read, files } = fixture();
      const old = read(path);
      const changed = Buffer.from(old.toString('utf8').replace(/Copyright/i, 'Copyleft!'));
      expect(changed.equals(old)).toBe(false);
      files.set(path, changed);
      for (const snapshot of [runtimeNoticePath, consumerNoticePath])
        files.set(
          snapshot,
          Buffer.from(
            read(snapshot).toString('utf8').replace(old.toString('utf8'), changed.toString('utf8')),
          ),
        );
      expect(() => inspectThirdPartyNotices(read)).toThrow(
        `Original notice SHA-256 mismatch: ${path}`,
      );
    },
  );

  it.each([runtimeNoticePath, consumerNoticePath])(
    'rejects truncated assembled notices: %s',
    (path) => {
      const { read, files } = fixture();
      files.set(path, read(path).subarray(0, -100));
      expect(() => inspectThirdPartyNotices(read)).toThrow(
        `Notice bytes differ from complete original texts: ${path}`,
      );
    },
  );

  it('rejects omitted package sections, even when their license text is duplicated elsewhere', () => {
    const { read, files } = fixture();
    const bytes = read(consumerNoticePath);
    files.set(
      consumerNoticePath,
      bytes.subarray(0, bytes.indexOf('\n===== babylonjs-gltf2interface@')),
    );
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      'Notice bytes differ from complete original texts',
    );
  });

  it('keeps original CRLF bytes instead of normalizing Apache license formatting', () => {
    const { read, files } = fixture();
    const bytes = read(consumerNoticePath);
    expect(bytes.includes(Buffer.from('\r\n'))).toBe(true);
    files.set(consumerNoticePath, Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')));
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      'Notice bytes differ from complete original texts',
    );
  });

  it.each([
    'public/licenses/three-MIT.txt',
    'docs/licenses/gltf-validator-2.0.0-dev.3.10-LICENSE.txt',
    'docs/licenses/gltf-validator-2.0.0-dev.3.10-NOTICES.txt',
  ])('retains byte-exact legacy source notice: %s', (path) => {
    const { read, files } = fixture();
    files.set(path, read(path).subarray(0, -1));
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      `Notice bytes differ from complete original texts: ${path}`,
    );
  });

  it('retains the complete Babylon NOTICE in the legacy source document', () => {
    const { read, files } = fixture();
    const path = 'docs/licenses/babylon-9.28.0.txt';
    const notice = read('node_modules/@babylonjs/core/NOTICE.md').toString('utf8');
    files.set(path, Buffer.from(read(path).toString('utf8').replace(notice, 'NOTICE removed')));
    expect(() => inspectThirdPartyNotices(read)).toThrow(
      'Legacy Babylon notice omits complete original text',
    );
  });

  it('assembly returns the complete existing files without modifying inputs', () => {
    const { read, files } = fixture();
    const before = new Map([...files].map(([path, bytes]) => [path, Buffer.from(bytes)]));
    const generated = renderThirdPartyNotices(read);
    for (const [path, bytes] of generated) expect(bytes.equals(read(path))).toBe(true);
    expect(files.size).toBe(before.size);
    for (const [path, bytes] of before) expect(files.get(path)?.equals(bytes), path).toBe(true);
  });

  it('checks the actual checkout without requiring a build or traversing node_modules', () => {
    expect(verifyThirdPartyNotices(root)).toMatchObject({
      productionPackages: 11,
      consumerPackages: 3,
      sourceOnlyPackages: 1,
    });
  });
});

describe('existing built notice verification', () => {
  function distributionFixture(productDir = 'dist', consumerDir = 'dist-3d-consumer') {
    const data = fixture();
    for (const [source, target] of [
      [runtimeNoticePath, `${productDir}/licenses/runtime-notices.txt`],
      ['public/licenses/three-MIT.txt', `${productDir}/licenses/three-MIT.txt`],
      [consumerNoticePath, `${consumerDir}/licenses/babylon-notices.txt`],
    ])
      data.files.set(target, data.read(source));
    return data;
  }

  it('checks all three distributed copies against the validated sources', () => {
    const { read } = distributionFixture();
    const result = inspectDistributedNotices(read);
    expect(result.distributedFiles).toHaveLength(3);
    expect(result.distributedFiles[0].sha256).toBe(result.documents[0].sha256);
    expect(result.distributedFiles[2].sha256).toBe(result.documents[1].sha256);
  });

  it('accepts explicit output directories without invoking a build', () => {
    const { read } = distributionFixture('product-output', 'consumer-output');
    const result = inspectDistributedNotices(read, {
      productDir: 'product-output',
      consumerDir: 'consumer-output',
    });
    expect(result.distributedFiles.map((file) => file.path)).toEqual([
      'product-output/licenses/runtime-notices.txt',
      'product-output/licenses/three-MIT.txt',
      'consumer-output/licenses/babylon-notices.txt',
    ]);
  });

  it.each([
    'dist/licenses/runtime-notices.txt',
    'dist/licenses/three-MIT.txt',
    'dist-3d-consumer/licenses/babylon-notices.txt',
  ])('rejects an absent or truncated distributed file: %s', (path) => {
    const { read, files } = distributionFixture();
    const bytes = read(path);
    files.delete(path);
    expect(() => inspectDistributedNotices(read)).toThrow(
      `Missing or unreadable notice input: ${path}`,
    );
    files.set(path, bytes.subarray(0, -1));
    expect(() => inspectDistributedNotices(read)).toThrow(
      `Notice bytes differ from complete original texts: ${path}`,
    );
  });
});
