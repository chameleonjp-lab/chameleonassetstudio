import type { Asset } from '../model';
import {
  canonicalJson,
  type DistributionManifest,
  type DistributionScale,
} from './atlas';

export const PACKAGE_FORMAT = 'chameleon-package' as const;
export const CURRENT_PACKAGE_VERSION = '0.1.0' as const;
export const GENERIC_WEB_PROFILE = 'generic-web-v1' as const;
export const GENERIC_WEB_FIXTURE_HASH = 'fixture:generic-web-v1' as const;

export interface PackageManifestFiles {
  distributionManifest: 'manifest.json';
  assetJson: 'asset.json';
  atlasJson: 'atlas/atlas.json';
  pages: string[];
  mainPng: 'textures/main.png';
  mainWebp: 'textures/main.webp' | null;
  target: 'targets/generic-web.json';
  example: 'examples/example-generic-web.html';
  helper: 'helpers/chameleon-generic-web.js';
  importNotes: 'import-notes/generic-web.md';
  verification: 'verification/record.json';
  readme: 'README.md';
}

export interface GenericWebPackageManifest {
  format: typeof PACKAGE_FORMAT;
  version: typeof CURRENT_PACKAGE_VERSION;
  profile: typeof GENERIC_WEB_PROFILE;
  status: 'candidate';
  source: { assetJson: 'asset.json'; canonical: true };
  coordinateSystem: {
    origin: 'top-left';
    xAxis: 'right';
    yAxis: 'down';
    unit: 'px';
  };
  scale: DistributionScale;
  files: PackageManifestFiles;
}

export interface GenericWebSidecar {
  format: 'chameleon-generic-web-sidecar';
  version: typeof CURRENT_PACKAGE_VERSION;
  profile: typeof GENERIC_WEB_PROFILE;
  assetType: Asset['assetType'];
  coordinateSystem: GenericWebPackageManifest['coordinateSystem'];
  canvasSize: Asset['canvasSize'];
  origin: Asset['origin'];
  anchors: Array<{ name: string; role: string; position: Asset['origin'] }>;
  colliders: Array<{
    name: string;
    shape: 'rect' | 'circle';
    rect?: { x: number; y: number; width: number; height: number };
    circle?: { x: number; y: number; radius: number };
  }>;
  animations: Array<{ name: string; frameNames: string[] }>;
  limitations: string[];
}

export interface VerificationRecord {
  format: 'chameleon-verification-record';
  version: typeof CURRENT_PACKAGE_VERSION;
  profile: typeof GENERIC_WEB_PROFILE;
  status: 'candidate';
  sourceCommit: string;
  fixtureHash: string;
  manifestHash: string;
  expected: string[];
  artifactRef: string;
}

export interface PackageManifestBuildOptions {
  sourceCommit?: string;
  artifactRef?: string;
  fixtureHash?: string;
}

export function buildPackageManifest(
  distributionManifest: DistributionManifest,
): GenericWebPackageManifest {
  return {
    format: PACKAGE_FORMAT,
    version: CURRENT_PACKAGE_VERSION,
    profile: GENERIC_WEB_PROFILE,
    status: 'candidate',
    source: { assetJson: 'asset.json', canonical: true },
    coordinateSystem: {
      origin: 'top-left',
      xAxis: 'right',
      yAxis: 'down',
      unit: 'px',
    },
    scale: distributionManifest.scale,
    files: {
      distributionManifest: 'manifest.json',
      assetJson: 'asset.json',
      atlasJson: 'atlas/atlas.json',
      pages: distributionManifest.pages.map((page) => page.path),
      mainPng: 'textures/main.png',
      mainWebp: distributionManifest.files.mainWebp,
      target: 'targets/generic-web.json',
      example: 'examples/example-generic-web.html',
      helper: 'helpers/chameleon-generic-web.js',
      importNotes: 'import-notes/generic-web.md',
      verification: 'verification/record.json',
      readme: 'README.md',
    },
  };
}

export function buildGenericWebSidecar(asset: Asset): GenericWebSidecar {
  return {
    format: 'chameleon-generic-web-sidecar',
    version: CURRENT_PACKAGE_VERSION,
    profile: GENERIC_WEB_PROFILE,
    assetType: asset.assetType,
    coordinateSystem: {
      origin: 'top-left',
      xAxis: 'right',
      yAxis: 'down',
      unit: 'px',
    },
    canvasSize: asset.canvasSize,
    origin: asset.origin,
    anchors: asset.anchors.map((anchor) => ({
      name: anchor.name,
      role: anchor.role,
      position: anchor.position,
    })),
    colliders: asset.colliders.map((collider) =>
      collider.shape === 'rect'
        ? { name: collider.name, shape: 'rect', rect: collider.rect }
        : { name: collider.name, shape: 'circle', circle: collider.circle },
    ),
    animations: asset.animations.map((animation) => ({
      name: animation.name,
      frameNames: animation.frameIds.map(
        (frameId) => asset.frames?.find((frame) => frame.id === frameId)?.name ?? frameId,
      ),
    })),
    limitations: [
      'このfixtureはGeneric Web / Canvas 2Dだけを確認します。',
      'PixiJS、Phaser、Unity、Godot、RPG Maker MZの互換性は含みません。',
      '物理iPhone Safariの合格証拠はこのpackageに含めません。',
    ],
  };
}

export function buildVerificationRecord(
  distributionManifest: DistributionManifest,
  options: PackageManifestBuildOptions = {},
): VerificationRecord {
  return {
    format: 'chameleon-verification-record',
    version: CURRENT_PACKAGE_VERSION,
    profile: GENERIC_WEB_PROFILE,
    status: 'candidate',
    sourceCommit: options.sourceCommit ?? 'unrecorded',
    fixtureHash: options.fixtureHash ?? GENERIC_WEB_FIXTURE_HASH,
    manifestHash: distributionManifest.integrity?.manifestHash ?? 'unrecorded',
    expected: [
      'package-manifest',
      'manifest',
      'sidecar',
      'multi-page-images',
      'frame-trim-scale-origin-anchor-collider-animation',
      'viewport-1280x720',
      'viewport-375x667',
    ],
    artifactRef: options.artifactRef ?? 'ci://group16/generic-web',
  };
}

export function buildGenericWebImportNotes(): string {
  return [
    '# Generic Web import notes',
    '',
    '- HTTP経由で`package-manifest.json`を読み込み、そこから`manifest.json`と対象ファイルをたどります。',
    '- 座標は左上原点、xは右方向、yは下方向、単位はpxです。',
    '- `generic-web-v1`はCanvas 2Dの確認範囲です。特定engineの互換を意味しません。',
    '- `verification/record.json`は安定した対象範囲を示し、実行日時・browser version・console errorはCI artifactで確認します。',
    '- `file://`ではなくHTTP経由で開いてください。',
  ].join('\n');
}

export function buildGenericWebHelper(): string {
  return `/**
 * Chameleon Asset Studio Generic Web helper.
 * HTTP経由でpackage-manifest.jsonを読み込み、Canvas 2Dへ描画します。
 */
export async function loadGenericWebPackage(url = './package-manifest.json') {
  const packageManifest = await (await fetch(url)).json();
  if (
    packageManifest.format !== 'chameleon-package' ||
    packageManifest.version !== '0.1.0' ||
    packageManifest.profile !== 'generic-web-v1'
  ) {
    throw new Error('対応していないGeneric Web packageです。');
  }
  const baseUrl = new URL(url, window.location.href);
  const manifest = await (
    await fetch(new URL(packageManifest.files.distributionManifest, baseUrl))
  ).json();
  const sidecar = await (
    await fetch(new URL(packageManifest.files.target, baseUrl))
  ).json();
  const images = await Promise.all(
    manifest.pages.map(async (page) => {
      const image = new Image();
      image.src = new URL(page.path, baseUrl).href;
      if (typeof image.decode === 'function') await image.decode();
      else await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      return image;
    }),
  );
  return { packageManifest, manifest, sidecar, images };
}

export function drawGenericWebFrame(context, loaded, frameName, x = 0, y = 0) {
  const frame = loaded.manifest.frames.find((candidate) => candidate.name === frameName);
  if (!frame) throw new Error('指定したFrameが見つかりません。');
  const image = loaded.images[frame.page];
  context.drawImage(
    image,
    frame.rect.x,
    frame.rect.y,
    frame.rect.width,
    frame.rect.height,
    x + frame.contentOffset.x,
    y + frame.contentOffset.y,
    frame.contentRect.width,
    frame.contentRect.height,
  );
  return frame;
}
`;
}

export function buildGenericWebExample(): string {
  return `<!doctype html>
<html lang="ja">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Generic Web preview</title>
  <style>
    body { margin: 0; font-family: sans-serif; }
    main { max-width: 720px; margin: 0 auto; padding: 16px; }
    canvas { display: block; max-width: 100%; height: auto; border: 1px solid #888; }
    #status { white-space: pre-wrap; }
  </style>
  <main>
    <h1>Generic Web preview</h1>
    <p id="status">読み込み中…</p>
    <canvas id="preview" width="320" height="240"></canvas>
  </main>
  <script type="module">
    import { loadGenericWebPackage, drawGenericWebFrame } from '../helpers/chameleon-generic-web.js';
    const status = document.querySelector('#status');
    const canvas = document.querySelector('#preview');
    const context = canvas.getContext('2d');
    try {
      const loaded = await loadGenericWebPackage('../package-manifest.json');
      const frame = loaded.manifest.frames[0];
      drawGenericWebFrame(context, loaded, frame.name, 8, 8);
      status.textContent = \`読み込み成功: \${frame.name} / \${loaded.packageManifest.profile}\`;
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      throw error;
    }
  </script>
</html>
`;
}

export function buildGenericWebTarget(asset: Asset): string {
  return `${canonicalJson(buildGenericWebSidecar(asset))}\n`;
}

function referencedPackagePaths(
  manifest: GenericWebPackageManifest,
  distributionManifest: DistributionManifest,
): string[] {
  return [
    'package-manifest.json',
    manifest.files.distributionManifest,
    manifest.files.assetJson,
    manifest.files.atlasJson,
    ...manifest.files.pages,
    manifest.files.mainPng,
    ...(manifest.files.mainWebp ? [manifest.files.mainWebp] : []),
    manifest.files.target,
    manifest.files.example,
    manifest.files.helper,
    manifest.files.importNotes,
    manifest.files.verification,
    manifest.files.readme,
    ...distributionManifest.files.examples,
    ...distributionManifest.files.helpers,
    ...distributionManifest.files.engines,
  ];
}

export function assertPackageClosure(
  entries: Record<string, Uint8Array>,
  manifest: GenericWebPackageManifest,
  distributionManifest: DistributionManifest,
): void {
  const paths = [...new Set(referencedPackagePaths(manifest, distributionManifest))].sort();
  const missing = paths.filter((path) => !entries[path] || entries[path].byteLength === 0);
  if (missing.length > 0) {
    throw new Error(`Generic Web packageの参照先がありません: ${missing.join(', ')}`);
  }
  for (const path of [
    'package-manifest.json',
    manifest.files.distributionManifest,
    manifest.files.assetJson,
    manifest.files.target,
    manifest.files.verification,
  ]) {
    try {
      JSON.parse(new TextDecoder().decode(entries[path]));
    } catch (error) {
      throw new Error(`Generic Web packageのJSONが不正です: ${path}`, { cause: error });
    }
  }
}
