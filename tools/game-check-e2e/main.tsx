import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import characterAssetJson from '../../src/core/samples/asset.character.json';
import { blobKeyFor } from '../../src/core/images/importImage';
import type { Asset, AssetType, Project } from '../../src/core/model';
import { saveBlob } from '../../src/core/storage/projectStore';
import { GameCheckMode } from '../../src/features/editor/GameCheckMode';
import '../../src/styles.css';

const PROJECT_ID = 'G14-E2E-negative-project';
const FIXTURE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAgUlEQVR42u3YsRUAEBBEwWtOIepQi0SNcjog5iYQXmCi/zbmqOv0SuvH9/p9AAAAAAAAAIkBfv/g7R4AAAAAAADIDKAEAQAAAAAAAHuAEgQAAAAAAADsAUoQAAAAAAAAsAcoQQAAAAAAAMAeoAQBAAAAAAAAe4ASBAAAAAAAAL4D2KI3kneXV+y9AAAAAElFTkSuQmCC';
const ASSET_TYPES = ['character', 'item', 'background', 'tile', 'gimmick', 'effect'] as const;
const MATRIX_STATES = [
  'unset',
  'frame-override',
  'dangling-invalid',
  'missing-or-decode',
  'atlas-reject',
] as const;
type MatrixState = (typeof MATRIX_STATES)[number];

type NegativeFixture =
  | 'G14-P1-invalid-collider'
  | 'G14-P1-dangling-reference'
  | 'G14-P1-missing-blob'
  | 'G14-P1-decode-failure'
  | 'G14-P1-character-unset'
  | 'G14-P1-background-invalid';

const NEGATIVE_FIXTURES = new Set<NegativeFixture>([
  'G14-P1-invalid-collider',
  'G14-P1-dangling-reference',
  'G14-P1-missing-blob',
  'G14-P1-decode-failure',
  'G14-P1-character-unset',
  'G14-P1-background-invalid',
]);

interface FixtureSelection {
  id: string;
  assetType: AssetType;
  legacy?: NegativeFixture;
  matrixState?: MatrixState;
}

function selectedFixture(): FixtureSelection {
  const params = new URLSearchParams(window.location.search);
  const assetType = params.get('assetType');
  const matrixState = params.get('state');
  if (
    ASSET_TYPES.includes(assetType as (typeof ASSET_TYPES)[number]) &&
    MATRIX_STATES.includes(matrixState as MatrixState)
  ) {
    return {
      id: `G14-P1-${assetType}-${matrixState}`,
      assetType: assetType as AssetType,
      matrixState: matrixState as MatrixState,
    };
  }
  const value = new URLSearchParams(window.location.search).get('fixture');
  const legacy = NEGATIVE_FIXTURES.has(value as NegativeFixture)
    ? (value as NegativeFixture)
    : 'G14-P1-invalid-collider';
  return {
    id: legacy,
    assetType: legacy === 'G14-P1-background-invalid' ? 'background' : 'character',
    legacy,
  };
}

function baseFixture(id: string, assetType: AssetType): Asset {
  const asset = structuredClone(characterAssetJson) as unknown as Asset;
  asset.id = id;
  asset.name = id;
  asset.displayName = id;
  asset.assetType = assetType;
  asset.canvasSize = { width: 64, height: 64 };
  asset.origin = { x: 32, y: 56 };
  asset.textures = asset.textures.map((texture) => ({
    ...texture,
    size: { width: 64, height: 64 },
  }));
  asset.anchors = asset.anchors.map((anchor, index) => ({
    ...anchor,
    position: { x: 24 + index * 16, y: 48 },
  }));
  asset.colliders = [
    {
      id: 'col_body',
      name: 'body',
      purpose: 'body',
      shape: 'rect',
      visible: true,
      rect: { x: 16, y: 12, width: 32, height: 44 },
    },
  ];
  delete asset.tile;
  delete asset.gimmick;
  delete asset.effect;
  if (assetType === 'background') {
    asset.layers[0].background = {
      role: 'mid',
      parallaxSpeed: { x: 0.5, y: 0 },
      loopX: true,
      loopY: false,
    };
  } else if (assetType === 'tile') {
    asset.tile = {
      tileSize: { width: 64, height: 64 },
      collisionType: 'solid',
      visualType: 'floor',
    };
  } else if (assetType === 'gimmick') {
    asset.gimmick = { movementPreset: 'horizontal' };
  } else if (assetType === 'effect') {
    asset.effect = {
      effectType: 'spark',
      durationMs: 500,
      loop: true,
      blendMode: 'add',
    };
  }
  return asset;
}

function applyValidFrameOverride(asset: Asset): void {
  asset.frames![0].colliderOverrides = [
    {
      colliderId: 'col_body',
      rect: { x: 18, y: 14, width: 28, height: 40 },
      visible: false,
    },
  ];
}

function applyTypeSpecificInvalid(asset: Asset): void {
  if (asset.assetType === 'background') {
    asset.layers[0].background = {
      role: 'far',
      parallaxSpeed: null,
      loopX: true,
      loopY: false,
    } as unknown as NonNullable<(typeof asset.layers)[number]['background']>;
  } else if (asset.assetType === 'tile') {
    asset.tile = {
      tileSize: { width: 0, height: 64 },
      collisionType: 'solid',
      visualType: 'floor',
    };
  } else if (asset.assetType === 'gimmick') {
    asset.gimmick = { movementPreset: 'G14-unknown-preset' };
  } else if (asset.assetType === 'effect') {
    asset.effect = {
      effectType: 'spark',
      durationMs: 0,
      loop: true,
      blendMode: 'add',
    };
  } else {
    asset.frames![0].colliderOverrides = [
      { colliderId: 'col_body', circle: { x: 32, y: 32, radius: 12 } },
    ];
  }
}

function applyUnset(asset: Asset): void {
  delete (asset as Partial<Asset>).origin;
  asset.anchors = [];
  asset.colliders = [];
  if (asset.assetType === 'background') {
    delete asset.layers[0].background;
  } else if (asset.assetType === 'tile') {
    delete asset.tile;
  } else if (asset.assetType === 'gimmick') {
    delete asset.gimmick;
  } else if (asset.assetType === 'effect') {
    delete asset.effect;
  }
}

function makeFixture(selection: FixtureSelection): Asset {
  const asset = baseFixture(selection.id, selection.assetType);
  switch (selection.legacy) {
    case 'G14-P1-invalid-collider':
      applyTypeSpecificInvalid(asset);
      break;
    case 'G14-P1-dangling-reference':
      asset.animations[0].frameIds = ['G14-P1-missing-frame'];
      asset.layers[0].textureId = 'G14-P1-missing-texture';
      break;
    case 'G14-P1-missing-blob':
      break;
    case 'G14-P1-decode-failure':
      break;
    case 'G14-P1-character-unset':
      delete (asset as Partial<Asset>).origin;
      asset.frames = [];
      asset.animations = [];
      asset.anchors = [];
      asset.colliders = [];
      break;
    case 'G14-P1-background-invalid': {
      const validLayer = asset.layers[0];
      asset.layers = [
        validLayer,
        {
          ...structuredClone(validLayer),
          id: 'layer_invalid_parallax',
          name: 'invalid parallax',
          background: {
            role: 'far',
            parallaxSpeed: null,
            loopX: true,
            loopY: false,
          } as unknown as NonNullable<(typeof validLayer)['background']>,
        },
      ];
      break;
    }
  }

  switch (selection.matrixState) {
    case 'unset':
      applyUnset(asset);
      break;
    case 'frame-override':
    case 'atlas-reject':
      applyValidFrameOverride(asset);
      break;
    case 'dangling-invalid':
      asset.animations[0].frameIds = [`${selection.id}-missing-frame`];
      asset.layers[0].textureId = `${selection.id}-missing-texture`;
      applyTypeSpecificInvalid(asset);
      break;
    case 'missing-or-decode':
    case undefined:
      break;
  }
  return asset;
}

function blobModeFor(selection: FixtureSelection): 'valid' | 'missing' | 'decode' {
  if (selection.legacy === 'G14-P1-missing-blob') {
    return 'missing';
  }
  if (selection.legacy === 'G14-P1-decode-failure') {
    return 'decode';
  }
  if (selection.matrixState === 'missing-or-decode') {
    return ['background', 'gimmick', 'effect'].includes(selection.assetType) ? 'decode' : 'missing';
  }
  return 'valid';
}

function fixturePngBlob(): Blob {
  const binary = atob(FIXTURE_PNG_BASE64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

function projectFor(asset: Asset): Project {
  return {
    format: 'chameleon-project',
    version: '0.1.0',
    id: PROJECT_ID,
    name: 'Group 14 negative browser fixtures',
    assets: [
      {
        id: asset.id,
        name: asset.name,
        displayName: asset.displayName,
        assetType: asset.assetType,
      },
    ],
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
  };
}

export function Harness() {
  const selection = useMemo(selectedFixture, []);
  const asset = useMemo(() => makeFixture(selection), [selection]);
  const project = useMemo(() => projectFor(asset), [asset]);
  const blobMode = blobModeFor(selection);
  const [ready, setReady] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (blobMode === 'missing') {
      setReady(true);
      return;
    }
    const editTexture = asset.textures.find((texture) => texture.kind === 'edit');
    if (!editTexture) {
      throw new Error('browser fixtureにedit textureがありません');
    }
    const blob =
      blobMode === 'decode'
        ? new Blob([`${selection.id}-not-an-image`], { type: 'image/png' })
        : fixturePngBlob();
    void saveBlob(PROJECT_ID, blobKeyFor(asset.id, editTexture.path), blob)
      .then(() => setReady(true))
      .catch((error: unknown) => {
        setSetupError(error instanceof Error ? error.message : String(error));
      });
  }, [asset, blobMode, selection.id]);

  if (setupError) {
    return <p role="alert">negative fixtureの準備に失敗しました：{setupError}</p>;
  }
  if (!ready) {
    return <p role="status">negative fixtureを準備中…</p>;
  }
  if (closed) {
    return <p role="status">Game Check Modeを閉じました：{selection.id}</p>;
  }
  return (
    <GameCheckMode
      asset={asset}
      project={project}
      projectAssets={[asset]}
      onClose={() => setClosed(true)}
    />
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('root要素が見つかりません');
}
createRoot(rootElement).render(<Harness />);
