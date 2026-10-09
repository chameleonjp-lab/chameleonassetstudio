import { zipSync } from 'fflate';
import { preflightGlb } from '../import/preflight';
import {
  validateProject,
  createProject,
  type Source3D,
  type Game3D,
  type Project3D,
} from '../model/project';
import { ASSET_IO_PROFILE as P, assertIoBudget } from '../profile/assetIoProfile';
import { sha256 } from './snapshot';
export interface AssetSidecar {
  format: 'chameleon-game-3d';
  version: '1.0.0';
  modelHash: string;
  revision: number;
  coordinates: 'right-handed-meter-y-up-positive-z-forward';
  application: 'GLB is canonical meters; game metadata is descriptive. Apply origin, unit and forward only once in an explicitly configured consumer.';
  nodes: { id: string; index: number }[];
  meshes: { id: string; index: number }[];
  clips: { id: string; index: number | null; name: string; duration: number; loop: boolean }[];
  game: Game3D;
  provenance: {
    claims: 'user-declared-not-verified';
    sources: Source3D[];
    ancestors: { hash: string; sources: Source3D[] }[];
  };
}
function mapped(values: { extras?: Record<string, unknown> }[]) {
  const seen = new Set<string>();
  return values.map((x, index) => {
    const id = x.extras?.casId;
    if (typeof id !== 'string' || seen.has(id))
      throw new Error('Final GLB stable mapping is missing or duplicated');
    seen.add(id);
    return { id, index };
  });
}
export async function buildAssetPackage(
  project: Project3D,
  glb: Uint8Array,
  warnings: string[],
  blobs?: ReadonlyMap<string, Uint8Array>,
) {
  validateProject(project);
  const f = preflightGlb(glb),
    modelHash = await sha256(glb);
  const nodes = mapped(f.json.nodes ?? []),
    meshes = mapped(f.json.meshes ?? []),
    animations = mapped(f.json.animations ?? []);
  if (
    nodes.some(
      (n) =>
        !project.nodes.some((p) => p.id === n.id) &&
        f.json.nodes![n.index].extras?.casSyntheticRoot !== true,
    ) ||
    project.nodes.some((p) => !nodes.some((n) => n.id === p.id))
  )
    throw new Error('Final node mapping changed');
  if (
    meshes.length !== project.meshes.length ||
    meshes.some((m) => !project.meshes.some((p) => p.id === m.id))
  )
    throw new Error('Final mesh mapping changed');
  const nonempty = project.clips.filter((c) => c.tracks.some((t) => t.keys.length));
  if (
    animations.length !== nonempty.length ||
    animations.some((a) => !nonempty.some((c) => c.id === a.id))
  )
    throw new Error('Final animation mapping changed');
  for (const clip of nonempty) {
    const actual = f.json.animations![animations.find((a) => a.id === clip.id)!.index];
    const expected = clip.tracks.filter((t) => t.keys.length);
    if (actual.channels.length !== expected.length)
      throw new Error('Final channel mapping changed');
    for (const track of expected) {
      const node = nodes.find((n) => n.id === track.nodeId)!;
      const channel = actual.channels.find(
        (c) => c.target.node === node.index && c.target.path === track.property,
      );
      if (
        !channel ||
        (actual.samplers[channel.sampler].interpolation ?? 'LINEAR') !== track.interpolation
      )
        throw new Error('Final channel mapping changed');
    }
  }
  const ancestors = new Map<string, Source3D[]>();
  for (const source of project.sources.filter(
    (s) => s.mimeType === 'application/json' && s.derivedFrom?.operation === 'paired-sidecar',
  )) {
    const bytes = blobs?.get(source.blobId);
    if (!bytes) throw new Error('Original sidecar required to retain provenance');
    if ((await sha256(bytes)) !== source.blobId) throw new Error('Sidecar source hash mismatch');
    const prior = JSON.parse(new TextDecoder().decode(bytes)) as AssetSidecar;
    if (
      prior.format !== 'chameleon-game-3d' ||
      prior.version !== '1.0.0' ||
      prior.modelHash !== source.derivedFrom?.hash ||
      prior.provenance?.claims !== 'user-declared-not-verified'
    )
      throw new Error('Unsupported prior provenance');
    ancestors.set(source.blobId, prior.provenance.sources);
    for (const record of prior.provenance.ancestors ?? [])
      ancestors.set(record.hash, record.sources);
  }
  if (ancestors.size > 64)
    throw new Error('Provenance ancestry exceeds profile; retain original backup');
  for (const sources of ancestors.values())
    validateProject({
      ...createProject('provenance-check'),
      sources,
      blobIds: [...new Set(sources.map((s) => s.blobId))],
    });
  const sidecar: AssetSidecar = {
    format: 'chameleon-game-3d',
    version: '1.0.0',
    modelHash,
    revision: project.revision,
    coordinates: project.coordinates,
    application:
      'GLB is canonical meters; game metadata is descriptive. Apply origin, unit and forward only once in an explicitly configured consumer.',
    nodes,
    meshes,
    clips: project.clips.map((c) => ({
      id: c.id,
      index: animations.find((x) => x.id === c.id)?.index ?? null,
      name: c.name,
      duration: c.duration,
      loop: c.loop,
    })),
    game: structuredClone(project.game),
    provenance: {
      claims: 'user-declared-not-verified',
      sources: structuredClone(project.sources),
      ancestors: [...ancestors].map(([hash, sources]) => ({ hash, sources })),
    },
  };
  const sidecarBytes = new TextEncoder().encode(JSON.stringify(sidecar));
  assertIoBudget(sidecarBytes.length, P.jsonBytes, 'Sidecar');
  const records = [
    { path: 'model.glb', sha256: modelHash, bytes: glb.length },
    { path: 'game.json', sha256: await sha256(sidecarBytes), bytes: sidecarBytes.length },
  ];
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      format: 'chameleon-asset-package-3d',
      version: '1.0.0',
      revision: project.revision,
      profile: P.id,
      files: records,
      warnings,
    }),
  );
  const zip = zipSync(
    { 'model.glb': glb, 'game.json': sidecarBytes, 'manifest.json': manifest },
    { level: 0, mtime: new Date(1980, 0, 1) },
  );
  assertIoBudget(zip.length, P.outputBytes, 'Asset ZIP');
  return { glb, sidecar: sidecarBytes, manifest, zip, revision: project.revision, warnings };
}
export async function applySidecar(project: Project3D, glb: Uint8Array, input: Uint8Array) {
  assertIoBudget(input.length, P.jsonBytes, 'Sidecar');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input)) as AssetSidecar;
  const f = preflightGlb(glb);
  if (
    value.format !== 'chameleon-game-3d' ||
    value.version !== '1.0.0' ||
    value.modelHash !== (await sha256(glb)) ||
    value.coordinates !== project.coordinates ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  )
    throw new Error('Sidecar does not match this GLB');
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (
    !same(value.nodes, mapped(f.json.nodes ?? [])) ||
    !same(value.meshes, mapped(f.json.meshes ?? []))
  )
    throw new Error('Stale sidecar mapping');
  if (!Array.isArray(value.clips)) throw new Error('Invalid sidecar clips');
  if (
    value.provenance?.claims !== 'user-declared-not-verified' ||
    !Array.isArray(value.provenance.sources) ||
    !Array.isArray(value.provenance.ancestors) ||
    value.provenance.ancestors.length > 64
  )
    throw new Error('Invalid provenance');
  validateProject({
    ...createProject('provenance-check'),
    sources: value.provenance.sources,
    blobIds: [...new Set(value.provenance.sources.map((s) => s.blobId))],
  });
  for (const record of value.provenance.ancestors) {
    if (!/^[a-f0-9]{64}$/.test(record.hash)) throw new Error('Invalid ancestry hash');
    validateProject({
      ...createProject('provenance-check'),
      sources: record.sources,
      blobIds: [...new Set(record.sources.map((s) => s.blobId))],
    });
  }
  const draft = structuredClone(project),
    seen = new Set<string>();
  for (const c of value.clips) {
    if (
      seen.has(c.id) ||
      !Number.isFinite(c.duration) ||
      c.duration < 0 ||
      typeof c.loop !== 'boolean'
    )
      throw new Error('Invalid sidecar clip');
    seen.add(c.id);
    if (c.index === null) {
      if (draft.clips.some((x) => x.id === c.id)) throw new Error('Duplicate empty clip');
      draft.clips.push({ id: c.id, name: c.name, duration: c.duration, loop: c.loop, tracks: [] });
    } else {
      if (
        !Number.isSafeInteger(c.index) ||
        c.index < 0 ||
        c.index >= draft.clips.length ||
        f.json.animations?.[c.index]?.extras?.casId !== c.id
      )
        throw new Error('Stale animation mapping');
      const clip = draft.clips[c.index];
      if (Math.abs(clip.duration - c.duration) > Math.max(1e-6, c.duration * 1e-6))
        throw new Error('Sidecar duration mismatch');
      // Native double duration can differ by the allowed Float32 quantization. Never truncate keys.
      for (const track of clip.tracks)
        for (const key of track.keys)
          if (key.time > c.duration) {
            if (Math.abs(key.time - c.duration) > Math.max(1e-6, c.duration * 1e-6))
              throw new Error('Key outside sidecar duration');
            key.time = c.duration;
          }
      clip.duration = c.duration;
      clip.loop = c.loop;
      clip.name = c.name;
    }
  }
  if (draft.clips.some((c) => !seen.has(c.id))) throw new Error('Missing sidecar clip');
  draft.clips = value.clips.map((c) => draft.clips.find((x) => x.id === c.id)!);
  draft.game = structuredClone(value.game);
  validateProject(draft);
  Object.assign(project, draft);
}
