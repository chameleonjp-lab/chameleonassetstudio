import { describe, expect, it } from 'vitest';
import {
  ArchivePreflight,
  INPUT_SAFETY_LIMITS,
  InputSafetyError,
  assertCasprojCompressedSize,
  assertImageBatchCount,
  parseBoundedJson,
} from './inputSafety';

const entry = {
  name: 'project.json',
  size: 100,
  originalSize: 200,
  compression: 8,
};

describe('INPUT-SAFETY profile B', () => {
  it('圧縮入力sizeと画像batch件数は境界を受理し、+1を拒否する', () => {
    expect(() =>
      assertCasprojCompressedSize(INPUT_SAFETY_LIMITS.maxCasprojCompressedBytes),
    ).not.toThrow();
    expect(() =>
      assertCasprojCompressedSize(INPUT_SAFETY_LIMITS.maxCasprojCompressedBytes + 1),
    ).toThrow(InputSafetyError);
    expect(() => assertImageBatchCount(INPUT_SAFETY_LIMITS.maxImageBatchFiles)).not.toThrow();
    expect(() => assertImageBatchCount(INPUT_SAFETY_LIMITS.maxImageBatchFiles + 1)).toThrow(
      /一度に選べる画像/,
    );
  });

  it('duplicate / unsafe / long pathとunknown compressionを拒否する', () => {
    const duplicate = new ArchivePreflight();
    duplicate.add(entry);
    expect(() => duplicate.add(entry)).toThrow(/同じpath/);

    for (const name of ['../evil', '/absolute', 'a\\b', 'a//b', 'a/./b']) {
      expect(() => new ArchivePreflight().add({ ...entry, name })).toThrow(/path/);
    }
    expect(() =>
      new ArchivePreflight().add({
        ...entry,
        name: 'a'.repeat(INPUT_SAFETY_LIMITS.maxArchivePathCodePoints + 1),
      }),
    ).toThrow(/長すぎ/);
    expect(() => new ArchivePreflight().add({ ...entry, compression: 99 })).toThrow(
      /compression method/,
    );
  });

  it('entry size、展開合計、file数、圧縮率の超過を拒否する', () => {
    expect(() =>
      new ArchivePreflight().add({
        ...entry,
        originalSize: INPUT_SAFETY_LIMITS.maxArchiveEntryBytes + 1,
      }),
    ).toThrow(/大きすぎ/);

    const total = new ArchivePreflight();
    for (let index = 0; index < 10; index += 1) {
      total.add({
        name: `assets/a/file-${index}.bin`,
        size: INPUT_SAFETY_LIMITS.maxArchiveEntryBytes,
        originalSize: INPUT_SAFETY_LIMITS.maxArchiveEntryBytes,
        compression: 0,
      });
    }
    const overflowSize =
      INPUT_SAFETY_LIMITS.maxArchiveExpandedBytes -
      INPUT_SAFETY_LIMITS.maxArchiveEntryBytes * 10 +
      1;
    expect(() =>
      total.add({
        name: 'assets/a/overflow.bin',
        size: overflowSize,
        originalSize: overflowSize,
        compression: 0,
      }),
    ).toThrow(/展開後合計/);

    const count = new ArchivePreflight();
    for (let index = 0; index < INPUT_SAFETY_LIMITS.maxArchiveEntries; index += 1) {
      count.add({ ...entry, name: `dir-${index}/` });
    }
    expect(() => count.add({ ...entry, name: 'overflow/' })).toThrow(/file数/);

    expect(() =>
      new ArchivePreflight().add({
        ...entry,
        name: 'assets/a/bomb.bin',
        size: 1,
        originalSize: INPUT_SAFETY_LIMITS.compressionRatioMinimumExpandedBytes,
      }),
    ).toThrow(/圧縮率/);
  });

  it('JSONはstrict UTF-8とdepth上限を検査してからparseする', () => {
    expect(parseBoundedJson('ok.json', new TextEncoder().encode('{"value":"[{}]"}'))).toEqual({
      value: '[{}]',
    });
    expect(() => parseBoundedJson('bad.json', new Uint8Array([0xff]))).toThrow(/UTF-8/);
    const atLimit = `${'['.repeat(INPUT_SAFETY_LIMITS.maxJsonDepth)}0${']'.repeat(
      INPUT_SAFETY_LIMITS.maxJsonDepth,
    )}`;
    expect(() => parseBoundedJson('limit.json', new TextEncoder().encode(atLimit))).not.toThrow();
    const tooDeep = `[${atLimit}]`;
    expect(() => parseBoundedJson('deep.json', new TextEncoder().encode(tooDeep))).toThrow(
      /nesting/,
    );

    const atByteLimit = new TextEncoder().encode(
      `0${' '.repeat(INPUT_SAFETY_LIMITS.maxJsonDocumentBytes - 1)}`,
    );
    expect(() => parseBoundedJson('size-limit.json', atByteLimit)).not.toThrow();
    expect(() =>
      parseBoundedJson(
        'size-overflow.json',
        new Uint8Array(INPUT_SAFETY_LIMITS.maxJsonDocumentBytes + 1),
      ),
    ).toThrow(/JSON文書が大きすぎ/);
  });
});
