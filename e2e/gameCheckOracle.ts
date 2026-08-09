import { readFile } from 'node:fs/promises';
import { expect, type Locator, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

export async function readStorageSnapshot(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const requestResult = <T>(request: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const normalize = async (value: unknown): Promise<unknown> => {
      if (value instanceof ArrayBuffer) {
        return { __type: 'ArrayBuffer', bytes: [...new Uint8Array(value)] };
      }
      if (ArrayBuffer.isView(value)) {
        const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        return { __type: value.constructor.name, bytes: [...view] };
      }
      if (value instanceof Blob) {
        return {
          __type: 'Blob',
          type: value.type,
          bytes: [...new Uint8Array(await value.arrayBuffer())],
        };
      }
      if (Array.isArray(value)) {
        return Promise.all(value.map((entry) => normalize(entry)));
      }
      if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
          result[key] = await normalize((value as Record<string, unknown>)[key]);
        }
        return result;
      }
      return value;
    };

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chameleon-asset-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const snapshot: Record<string, unknown> = {};
    for (const storeName of Array.from(db.objectStoreNames).sort()) {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const [keys, values] = await Promise.all([
        requestResult(store.getAllKeys()),
        requestResult(store.getAll()),
      ]);
      const records = await Promise.all(
        keys.map(async (key, index) => ({
          key: await normalize(key),
          value: await normalize(values[index]),
        })),
      );
      records.sort((left, right) =>
        JSON.stringify(left.key).localeCompare(JSON.stringify(right.key)),
      );
      snapshot[storeName] = records;
    }
    db.close();
    return JSON.stringify(snapshot);
  });
}

export async function expectTargetAtLeast44(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, '操作対象のbounding box').not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

export async function readZipOutputSnapshot(
  page: Page,
  buttonName: string,
): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ]);
  const path = await download.path();
  expect(path, `${buttonName}のdownload path`).not.toBeNull();
  const entries = unzipSync(new Uint8Array(await readFile(path!)));
  const normalized = Object.fromEntries(
    Object.entries(entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([entryPath, bytes]) => [entryPath, Buffer.from(bytes).toString('base64')]),
  );
  return JSON.stringify(normalized);
}
