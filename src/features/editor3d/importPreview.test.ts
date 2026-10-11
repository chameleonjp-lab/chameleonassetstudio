import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeBox } from '../../core3d/fixtures/nativeBox';
import type { AssetImport } from '../../core3d/ports/assetIoPort';
import type {
  NativeTextureSnapshot,
  NativeViewportFactory,
  NativeViewportPort,
  NativeViewportResult,
  NativeViewportStatus,
} from '../../core3d/ports/renderPort';
import { resourceLedgerSnapshot } from '../../core3d/profile/resourceLedger';
import { createNativeImportReview, type NativeImportReview } from './importReview';
import {
  mountNativeImportPreview,
  type NativeImportPreviewController,
  type NativeImportPreviewDependencies,
} from './importPreview';
import { NativeTexturePreparer } from './textureSnapshot';

const hash = 'a'.repeat(64);
const textureHash = 'b'.repeat(64);
const host = {} as HTMLElement;
const reviews: NativeImportReview[] = [];
const controllers: NativeImportPreviewController[] = [];
function fixture(textured = false): AssetImport {
  const project = nativeBox('candidate');
  project.blobIds = [hash];
  project.sources = [
    {
      id: 'original-glb',
      blobId: hash,
      mimeType: 'model/gltf-binary',
      rights: { declared: '', embedded: '' },
    },
  ];
  const blobs = new Map([[hash, new Uint8Array([11, 12, 13])]]);
  if (textured) {
    project.blobIds.push(textureHash);
    blobs.set(textureHash, new Uint8Array([2, 1]));
    project.sources.push({
      id: 'texture',
      blobId: textureHash,
      mimeType: 'image/png',
      rights: { declared: '', embedded: '' },
    });
    project.materials[0].textureBlobId = textureHash;
    for (const face of project.meshes[0].faces)
      face.uv = [
        [0, 0],
        [1, 0],
        [0, 1],
      ];
  }
  return { project, blobs, losses: [], sourceHash: hash };
}
function own(input = fixture()) {
  const review = createNativeImportReview(input, {
    session: {},
    projectId: 'original',
    revision: 3,
  });
  reviews.push(review);
  return review;
}
function mount(review: NativeImportReview, dependencies: NativeImportPreviewDependencies) {
  const onState = vi.fn();
  const controller = mountNativeImportPreview(host, review, onState, dependencies);
  controllers.push(controller);
  return { controller, onState };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fakePort() {
  let status: NativeViewportStatus = { state: 'empty' };
  let onStatus: (status: NativeViewportStatus) => void = () => {};
  const update = (next: NativeViewportStatus) => {
    status = next;
    onStatus(next);
  };
  const port = {
    get status() {
      return status;
    },
    setProject: vi.fn((): NativeViewportResult => {
      update({ state: 'active' });
      return { ok: true as const };
    }),
    fitCamera: vi.fn(),
    renderInspectionFrame: vi.fn((): NativeViewportResult => ({ ok: true })),
    cameraAction: vi.fn(() => ({ ok: true as const })),
    dispose: vi.fn(() => update({ state: 'disposed' })),
    bindEditing: vi.fn(),
    bindRigPose: vi.fn(),
    bindAnimation: vi.fn(),
    suspend: vi.fn(),
    resume: vi.fn(),
  };
  const factory: NativeViewportFactory = vi.fn(async (_host, listener) => {
    onStatus = listener;
    listener(status);
    return port as unknown as NativeViewportPort;
  });
  return {
    port,
    factory,
    update,
    connect: (listener: typeof onStatus) => {
      onStatus = listener;
    },
  };
}
function simplePreparer() {
  return { prepare: vi.fn(async () => new Map() as NativeTextureSnapshot), cancel: vi.fn() };
}
afterEach(async () => {
  for (const controller of controllers.splice(0)) {
    controller.dispose();
    await controller.settled;
  }
  for (const review of reviews.splice(0)) review.dispose();
  expect(resourceLedgerSnapshot().totalBytes).toBe(0);
});

describe('view-only native import preview controller', () => {
  it('publishes ready only after accepted geometry, decoded textures, fitted active renderer and successful inspection draw', async () => {
    const input = fixture();
    const before = structuredClone(input);
    const review = own(input);
    const f = fakePort();
    const gate = deferred<NativeTextureSnapshot>();
    const preparer = simplePreparer();
    preparer.prepare.mockReturnValue(gate.promise);
    const { controller, onState } = mount(review, {
      factory: f.factory,
      createTexturePreparer: () => preparer,
    });
    await vi.waitFor(() => expect(preparer.prepare).toHaveBeenCalledOnce());
    f.update({ state: 'active' });
    expect(onState.mock.calls.some(([state]) => state.ready)).toBe(false);
    expect(controller.fit().ok).toBe(false);
    expect(controller.cameraAction('orbit-left').ok).toBe(false);
    gate.resolve(new Map());
    await controller.settled;
    expect(controller.state).toEqual({ state: 'active', ready: true });
    expect(f.port.setProject).toHaveBeenCalledWith(input.project, new Map());
    expect(f.port.fitCamera).toHaveBeenCalledOnce();
    expect(f.port.renderInspectionFrame).toHaveBeenCalledOnce();
    expect(f.port.renderInspectionFrame.mock.invocationCallOrder[0]).toBeGreaterThan(
      f.port.fitCamera.mock.invocationCallOrder[0],
    );
    const firstReady = onState.mock.calls.findIndex(([state]) => state.ready);
    expect(firstReady).toBe(onState.mock.calls.length - 1);
    expect(f.port.bindEditing).not.toHaveBeenCalled();
    expect(f.port.bindRigPose).not.toHaveBeenCalled();
    expect(f.port.bindAnimation).not.toHaveBeenCalled();
    expect(f.port.suspend).not.toHaveBeenCalled();
    expect(f.port.resume).not.toHaveBeenCalled();
    expect(controller.cameraAction('orbit-right')).toEqual({ ok: true });
    expect(controller.fit()).toEqual({ ok: true });
    expect(input).toEqual(before);
  });

  it.each([
    'empty',
    'hidden',
    'frozen',
    'suspended',
    'context-lost',
    'unavailable',
    'unsupported',
    'error',
    'disposed',
  ] as const)('disables confirmation and camera actions immediately on %s', async (state) => {
    const f = fakePort();
    const { controller, onState } = mount(own(), {
      factory: f.factory,
      createTexturePreparer: simplePreparer,
    });
    await controller.settled;
    expect(controller.state.ready).toBe(true);
    f.update({ state, reason: 'test status' });
    expect(controller.state).toEqual({ state, ready: false, reason: 'test status' });
    expect(onState).toHaveBeenLastCalledWith(controller.state);
    expect(controller.cameraAction('zoom-in').ok).toBe(false);
    expect(controller.fit().ok).toBe(false);
    expect(f.port.cameraAction).not.toHaveBeenCalled();
    expect(f.port.fitCamera).toHaveBeenCalledOnce();
    f.update({ state: 'active' });
    expect(controller.state.ready).toBe(false);
    expect(controller.state.reason).toContain('もう一度取り込んで');
    expect(controller.fit().ok).toBe(false);
  });

  it('releases a late factory without decoding, announcing ready or touching the candidate', async () => {
    const review = own();
    const gate = deferred<NativeViewportPort>();
    const f = fakePort();
    const preparer = simplePreparer();
    const factory = vi.fn(
      (_host: HTMLElement, listener: (status: NativeViewportStatus) => void) => {
        f.connect(listener);
        return gate.promise;
      },
    );
    const { controller, onState } = mount(review, {
      factory,
      createTexturePreparer: () => preparer,
    });
    await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
    controller.dispose();
    controller.dispose();
    review.dispose();
    const calls = onState.mock.calls.length;
    expect(resourceLedgerSnapshot().totalBytes).toBe(review.summary.estimatedBytes);
    f.update({ state: 'active' });
    gate.resolve(f.port as unknown as NativeViewportPort);
    await controller.settled;
    expect(f.port.dispose).toHaveBeenCalledOnce();
    expect(f.port.setProject).not.toHaveBeenCalled();
    expect(preparer.prepare).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledTimes(calls);
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('holds source ownership until a non-interruptible decoder actually finishes on cancellation', async () => {
    const input = fixture(true);
    const original = input.blobs.get(textureHash)!.slice();
    const review = own(input);
    const f = fakePort();
    const gate = deferred<{
      width: number;
      height: number;
      mimeType: 'image/png';
      pixels: Uint8Array;
    }>();
    let signal: AbortSignal | undefined;
    const decode = vi.fn((_bytes: Uint8Array, nextSignal?: AbortSignal) => {
      signal = nextSignal;
      return gate.promise;
    });
    const preparer = new NativeTexturePreparer({
      inspect: () => ({ width: 2, height: 1, mimeType: 'image/png' }),
      decode,
    });
    const { controller, onState } = mount(review, {
      factory: f.factory,
      createTexturePreparer: () => preparer,
    });
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    controller.dispose();
    review.dispose();
    expect(signal?.aborted).toBe(true);
    expect(resourceLedgerSnapshot().byCategory['asset-io']).toBe(review.summary.estimatedBytes);
    expect(resourceLedgerSnapshot().byCategory.texture).toBeGreaterThan(0);
    const calls = onState.mock.calls.length;
    gate.resolve({ width: 2, height: 1, mimeType: 'image/png', pixels: new Uint8Array(8) });
    await controller.settled;
    await Promise.resolve();
    expect(f.port.setProject).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledTimes(calls);
    expect(input.blobs.get(textureHash)).toEqual(original);
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('holds an independent save borrow after preview and review close', async () => {
    const review = own();
    const save = review.borrow();
    const f = fakePort();
    const { controller } = mount(review, {
      factory: f.factory,
      createTexturePreparer: simplePreparer,
    });
    await controller.settled;
    review.dispose();
    controller.dispose();
    expect(save.result.blobs.get(hash)).toEqual(new Uint8Array([11, 12, 13]));
    expect(resourceLedgerSnapshot().totalBytes).toBe(review.summary.estimatedBytes);
    save.release();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('prepares real detached texture input and releases both cache and source owners after viewing', async () => {
    const input = fixture(true);
    const before = structuredClone(input);
    const review = own(input);
    const f = fakePort();
    const preparer = new NativeTexturePreparer({
      inspect: () => ({ width: 2, height: 1, mimeType: 'image/png' }),
      decode: async (bytes) => {
        bytes.fill(99);
        return { width: 2, height: 1, mimeType: 'image/png', pixels: new Uint8Array(8) };
      },
    });
    const { controller } = mount(review, {
      factory: f.factory,
      createTexturePreparer: () => preparer,
    });
    await controller.settled;
    expect(controller.state.ready).toBe(true);
    expect(input).toEqual(before);
    expect(resourceLedgerSnapshot().byCategory.texture).toBe(8);
    review.dispose();
    controller.dispose();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('treats a false setProject acceptance as failure even after an active callback', async () => {
    const review = own();
    const f = fakePort();
    f.port.setProject.mockImplementation(() => {
      f.update({ state: 'active' });
      return { ok: false, reason: 'Unsupported imported geometry' };
    });
    const { controller, onState } = mount(review, {
      factory: f.factory,
      createTexturePreparer: simplePreparer,
    });
    await controller.settled;
    expect(controller.state).toEqual({
      state: 'error',
      ready: false,
      reason: 'Unsupported imported geometry',
    });
    expect(onState.mock.calls.some(([state]) => state.ready)).toBe(false);
    expect(f.port.fitCamera).not.toHaveBeenCalled();
    expect(f.port.dispose).toHaveBeenCalledOnce();
  });

  it('does not finish initialization after a synchronous observer retires the candidate', async () => {
    const review = own();
    const f = fakePort();
    const onState = vi.fn((state: { state: string }) => {
      if (state.state === 'active') review.dispose();
    });
    const controller = mountNativeImportPreview(host, review, onState, {
      factory: f.factory,
      createTexturePreparer: simplePreparer,
    });
    controllers.push(controller);
    await controller.settled;
    expect(controller.state).toEqual({ state: 'disposed', ready: false });
    expect(f.port.fitCamera).not.toHaveBeenCalled();
    expect(f.port.dispose).toHaveBeenCalledOnce();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it.each(['factory', 'preparer', 'setProject', 'fitCamera', 'renderInspectionFrame'] as const)(
    'handles %s failure without a ready state or resource leak',
    async (phase) => {
      const review = own();
      const f = fakePort();
      const preparer = simplePreparer();
      if (phase === 'preparer') preparer.prepare.mockRejectedValue(new Error('decode failed'));
      if (phase === 'setProject')
        f.port.setProject.mockImplementation(() => {
          throw new Error('project failed');
        });
      if (phase === 'fitCamera')
        f.port.fitCamera.mockImplementation(() => {
          throw new Error('camera failed');
        });
      if (phase === 'renderInspectionFrame')
        f.port.renderInspectionFrame.mockImplementation(() => {
          throw new Error('draw failed');
        });
      const { controller, onState } = mount(review, {
        factory:
          phase === 'factory'
            ? async () => {
                throw new Error('factory failed');
              }
            : f.factory,
        createTexturePreparer: () => preparer,
      });
      await controller.settled;
      expect(controller.state).toMatchObject({ state: 'error', ready: false });
      expect(onState.mock.calls.some(([state]) => state.ready)).toBe(false);
      review.dispose();
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    },
  );

  it('does not let exceptions in observers or cleanup strand independent ownership', async () => {
    const review = own();
    const f = fakePort();
    f.port.dispose.mockImplementation(() => {
      throw new Error('cleanup');
    });
    const preparer = simplePreparer();
    preparer.cancel.mockImplementation(() => {
      throw new Error('cancel');
    });
    const controller = mountNativeImportPreview(
      host,
      review,
      () => {
        throw new Error('observer');
      },
      { factory: f.factory, createTexturePreparer: () => preparer },
    );
    controllers.push(controller);
    await controller.settled;
    expect(controller.state.ready).toBe(true);
    expect(() => controller.dispose()).not.toThrow();
    review.dispose();
    expect(resourceLedgerSnapshot().totalBytes).toBe(0);
  });

  it('cancels before the first factory and prevents use of an already retired review', async () => {
    const review = own();
    const f = fakePort();
    const { controller, onState } = mount(review, { factory: f.factory });
    controller.dispose();
    review.dispose();
    await controller.settled;
    expect(f.factory).not.toHaveBeenCalled();
    expect(onState).not.toHaveBeenCalled();
    expect(() => mountNativeImportPreview(host, review, vi.fn(), { factory: f.factory })).toThrow(
      '終了',
    );
  });

  it('keeps repeated late preparations isolated and returns to baseline after 20 cancellations', async () => {
    for (let cycle = 0; cycle < 20; cycle++) {
      const review = own();
      const f = fakePort();
      const gate = deferred<NativeTextureSnapshot>();
      const preparer = simplePreparer();
      preparer.prepare.mockReturnValue(gate.promise);
      const { controller, onState } = mount(review, {
        factory: f.factory,
        createTexturePreparer: () => preparer,
      });
      await vi.waitFor(() => expect(preparer.prepare).toHaveBeenCalledOnce());
      controller.dispose();
      review.dispose();
      const calls = onState.mock.calls.length;
      gate.resolve(new Map());
      await controller.settled;
      f.update({ state: 'active' });
      expect(onState).toHaveBeenCalledTimes(calls);
      expect(f.port.setProject).not.toHaveBeenCalled();
      expect(f.port.dispose).toHaveBeenCalledOnce();
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    }
  });
});

describe('import inspection draw confirmation', () => {
  it.each(['missing', 'rejected', 'context-loss', 'retired'] as const)(
    'does not authorize %s first draw',
    async (mode) => {
      const review = own();
      const f = fakePort();
      if (mode === 'missing')
        Object.defineProperty(f.port, 'renderInspectionFrame', { value: undefined });
      if (mode === 'rejected')
        f.port.renderInspectionFrame.mockReturnValue({ ok: false, reason: 'draw refused' });
      if (mode === 'context-loss')
        f.port.renderInspectionFrame.mockImplementation(() => {
          f.update({ state: 'context-lost' });
          return { ok: true };
        });
      if (mode === 'retired')
        f.port.renderInspectionFrame.mockImplementation(() => {
          review.dispose();
          return { ok: true };
        });
      const { controller, onState } = mount(review, {
        factory: f.factory,
        createTexturePreparer: simplePreparer,
      });
      await controller.settled;
      expect(controller.state.ready).toBe(false);
      expect(onState.mock.calls.some(([status]) => status.ready)).toBe(false);
      controller.dispose();
      review.dispose();
      expect(resourceLedgerSnapshot().totalBytes).toBe(0);
    },
  );
});
