import { useEffect, useMemo, useState } from 'react';
import type {
  Asset,
  AssetFamily,
  AssetFamilyVariant,
  FamilyVariantWriteSet,
  LinkedVariantInspection,
  LinkedVariantRefreshArtifact,
  Project,
} from '../../core/model';

export interface VariantInspectionView {
  state: 'checking' | 'ready' | 'error';
  inspection?: LinkedVariantInspection;
  error?: string;
}

interface VariantPanelProps {
  project: Project;
  assets: Asset[];
  selectedAsset: Asset | null;
  busy: boolean;
  inspections: Record<string, VariantInspectionView>;
  preview: { assetId: string; artifact: LinkedVariantRefreshArtifact } | null;
  onSelectAsset: (assetId: string) => void;
  onCreateFamily: (name: string, baseAssetId: string) => void;
  onAddManualVariant: (familyId: string, assetId: string) => void;
  onCreateMirrorVariant: (familyId: string) => void;
  onCreatePaletteVariant: (options: {
    familyId: string;
    baseLayerId: string;
    from: string;
    to: string;
    tolerance: number;
  }) => void;
  onDetachVariant: (familyId: string, assetId: string) => void;
  onRemoveFamily: (familyId: string) => void;
  onPreviewRefresh: (familyId: string, assetId: string) => void;
  onRefreshVariant: (
    familyId: string,
    assetId: string,
    artifact: LinkedVariantRefreshArtifact,
  ) => void;
  onDeleteVariantAsset: (familyId: string, assetId: string) => void;
}

function membershipFor(project: Project, assetId: string | null) {
  if (!assetId) {
    return null;
  }
  for (const family of project.families ?? []) {
    if (family.baseAssetId === assetId) {
      return { family, role: 'base' as const, variant: null };
    }
    const variant = family.variants.find((candidate) => candidate.assetId === assetId);
    if (variant) {
      return { family, role: 'variant' as const, variant };
    }
  }
  return null;
}

function variantKindLabel(variant: AssetFamilyVariant): string {
  switch (variant.kind) {
    case 'linked-mirror':
      return 'linked左右反転';
    case 'linked-palette':
      return 'linked palette';
    case 'manual':
      return 'manual（自動更新なし）';
  }
}

function inspectionLabel(view: VariantInspectionView | undefined): string {
  if (!view || view.state === 'checking') {
    return '状態を確認中';
  }
  if (view.state === 'error' || !view.inspection) {
    return '状態を確認できません';
  }
  switch (view.inspection.status) {
    case 'up-to-date':
      return '同期済み';
    case 'ready':
      return '更新候補（stale）';
    case 'manual-adjusted':
      return view.inspection.stale ? '手動調整あり（baseにも更新候補）' : '手動調整あり';
    case 'ineligible':
      return '更新不可';
  }
}

function BlobComparison({ before, after }: { before: Blob; after: Blob }) {
  const [urls, setUrls] = useState<{ before: string; after: string } | null>(null);
  useEffect(() => {
    const beforeUrl = URL.createObjectURL(before);
    const afterUrl = URL.createObjectURL(after);
    setUrls({ before: beforeUrl, after: afterUrl });
    return () => {
      URL.revokeObjectURL(beforeUrl);
      URL.revokeObjectURL(afterUrl);
    };
  }, [after, before]);
  if (!urls) {
    return null;
  }
  return (
    <div className="variant-image-comparison" aria-label="linked refresh画像preview">
      <figure>
        <figcaption>before</figcaption>
        <img src={urls.before} alt="refresh前のvariant画像" />
      </figure>
      <figure>
        <figcaption>after</figcaption>
        <img src={urls.after} alt="refresh後のvariant画像" />
      </figure>
    </div>
  );
}

function layerTransformText(layer: Asset['layers'][number]): string {
  const { position, scale, rotation } = layer.transform;
  return `位置(${position.x}, ${position.y}) / 拡大(${scale.x}, ${scale.y}) / 回転${rotation}° / 不透明度${layer.opacity}`;
}

function layerDetailText(layer: Asset['layers'][number]): string {
  return `name=${JSON.stringify(layer.name)} / type=${layer.layerType} / texture=${layer.textureId ?? 'なし'} / visible=${String(layer.visible)} / locked=${String(layer.locked)} / ${layerTransformText(layer)}`;
}

function AssetStructureSnapshot({ asset, label }: { asset: Asset; label: string }) {
  return (
    <div className="variant-asset-snapshot">
      <strong>{label}</strong>
      <dl>
        <div>
          <dt>canvas</dt>
          <dd>
            {asset.canvasSize.width} × {asset.canvasSize.height}
          </dd>
        </div>
        <div>
          <dt>origin</dt>
          <dd>
            ({asset.origin.x}, {asset.origin.y})
          </dd>
        </div>
        <div>
          <dt>要素数</dt>
          <dd>
            layer {asset.layers.length} / part {asset.parts.length} / frame{' '}
            {asset.frames?.length ?? 0}
          </dd>
        </div>
      </dl>
      <ul aria-label={`${label}のlayer transform`}>
        {asset.layers.map((layer) => (
          <li key={layer.id}>
            {layer.name}: {layerTransformText(layer)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LayerChangeDetails({ before, after }: { before: Asset; after: Asset }) {
  const beforeById = new Map(before.layers.map((layer) => [layer.id, layer]));
  const afterById = new Map(after.layers.map((layer) => [layer.id, layer]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])];
  const changes = ids.flatMap((id) => {
    const previous = beforeById.get(id);
    const next = afterById.get(id);
    if (!previous) {
      return [`${next!.name}: 追加 → ${layerDetailText(next!)}`];
    }
    if (!next) {
      return [`${previous.name}: ${layerDetailText(previous)} → 削除`];
    }
    const previousText = layerDetailText(previous);
    const nextText = layerDetailText(next);
    return previousText === nextText ? [] : [`${previous.name}: ${previousText} → ${nextText}`];
  });
  return changes.length > 0 ? (
    <>
      <h5>layerの具体的な差分</h5>
      <ul className="variant-layer-diff">
        {changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </>
  ) : null;
}

const STRUCTURED_COLLECTION_KEYS = [
  'textures',
  'layers',
  'parts',
  'anchors',
  'colliders',
  'frames',
  'animations',
] as const satisfies ReadonlyArray<Exclude<keyof FamilyVariantWriteSet, 'blobPaths'>>;

const STRUCTURED_COLLECTION_LABELS: Record<(typeof STRUCTURED_COLLECTION_KEYS)[number], string> = {
  textures: 'TextureRef',
  layers: 'Layer',
  parts: 'Part',
  anchors: 'Anchor',
  colliders: 'Collider',
  frames: 'Frame',
  animations: 'Animation',
};

type StructuredCollectionKey = (typeof STRUCTURED_COLLECTION_KEYS)[number];
type StructuredElement = { id: string } & Record<string, unknown>;

interface StructuredFieldChange {
  itemId: string;
  field: string;
  before: unknown;
  after: unknown;
}

function structuredCollection(asset: Asset, key: StructuredCollectionKey): StructuredElement[] {
  const values = key === 'frames' ? (asset.frames ?? []) : asset[key];
  return values as unknown as StructuredElement[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ownRecordValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function samePreviewValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => samePreviewValue(value, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return keys.every((key) =>
      samePreviewValue(ownRecordValue(left, key), ownRecordValue(right, key)),
    );
  }
  return false;
}

function collectFieldChanges(
  itemId: string,
  before: unknown,
  after: unknown,
  field: string,
  result: StructuredFieldChange[],
): void {
  if (samePreviewValue(before, after)) {
    return;
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      collectFieldChanges(
        itemId,
        ownRecordValue(before, key),
        ownRecordValue(after, key),
        field ? `${field}.${key}` : key,
        result,
      );
    }
    return;
  }
  result.push({ itemId, field: field || '要素全体', before, after });
}

function structuredWriteSetChanges(
  beforeAsset: Asset,
  afterAsset: Asset,
  beforeWriteSet: FamilyVariantWriteSet,
  afterWriteSet: FamilyVariantWriteSet,
) {
  return STRUCTURED_COLLECTION_KEYS.flatMap((key) => {
    const beforeTargetIds = new Set(beforeWriteSet[key]);
    const afterTargetIds = new Set(afterWriteSet[key]);
    const beforeItems = structuredCollection(beforeAsset, key).filter(({ id }) =>
      beforeTargetIds.has(id),
    );
    const afterItems = structuredCollection(afterAsset, key).filter(({ id }) =>
      afterTargetIds.has(id),
    );
    const changes: StructuredFieldChange[] = [];
    const beforeOrder = beforeItems.map(({ id }) => id);
    const afterOrder = afterItems.map(({ id }) => id);
    if (!samePreviewValue(beforeOrder, afterOrder)) {
      changes.push({
        itemId: 'collection',
        field: '並び順',
        before: beforeOrder,
        after: afterOrder,
      });
    }
    const beforeById = new Map(beforeItems.map((item) => [item.id, item]));
    const afterById = new Map(afterItems.map((item) => [item.id, item]));
    const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])];
    for (const id of ids) {
      collectFieldChanges(id, beforeById.get(id), afterById.get(id), '', changes);
    }
    return changes.length > 0 ? [{ key, changes }] : [];
  });
}

function previewValueText(value: unknown): string {
  if (value === undefined) {
    return '（なし）';
  }
  return JSON.stringify(value, null, 2) ?? '（表示できません）';
}

function WriteSetStructuredDiff({
  before,
  after,
  beforeWriteSet,
  afterWriteSet,
}: {
  before: Asset;
  after: Asset;
  beforeWriteSet: FamilyVariantWriteSet;
  afterWriteSet: FamilyVariantWriteSet;
}) {
  const groups = structuredWriteSetChanges(before, after, beforeWriteSet, afterWriteSet);
  if (groups.length === 0) {
    return null;
  }
  return (
    <section className="variant-structured-diff" aria-label="write-setの具体的な差分">
      <h5>write-setの具体的な差分</h5>
      {groups.map(({ key, changes }) => (
        <section key={key}>
          <h6>{STRUCTURED_COLLECTION_LABELS[key]}</h6>
          <dl>
            {changes.map((change, index) => (
              <div key={`${change.itemId}:${change.field}:${index}`}>
                <dt>
                  {change.itemId} · {change.field}
                </dt>
                <dd>
                  <span>before</span>
                  <code>{previewValueText(change.before)}</code>
                  <span>after</span>
                  <code>{previewValueText(change.after)}</code>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </section>
  );
}

function FamilyVariantList({
  family,
  assets,
  inspections,
  onSelectAsset,
}: {
  family: AssetFamily;
  assets: Asset[];
  inspections: Record<string, VariantInspectionView>;
  onSelectAsset: (assetId: string) => void;
}) {
  if (family.variants.length === 0) {
    return <p className="editor-note">variantはまだありません。</p>;
  }
  return (
    <ul className="variant-member-list" aria-label={`Family「${family.name}」のvariant一覧`}>
      {family.variants.map((variant) => {
        const asset = assets.find((candidate) => candidate.id === variant.assetId);
        return (
          <li key={variant.assetId}>
            <span className="variant-member-name">{asset?.displayName ?? variant.assetId}</span>
            <span className="variant-badge">{variantKindLabel(variant)}</span>
            {variant.kind !== 'manual' && (
              <span className="variant-state-text">
                {inspectionLabel(inspections[variant.assetId])}
              </span>
            )}
            <button
              type="button"
              aria-label={`このvariant「${asset?.displayName ?? variant.assetId}」を選択`}
              onClick={() => onSelectAsset(variant.assetId)}
            >
              このvariantを選択
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function VariantPanel({
  project,
  assets,
  selectedAsset,
  busy,
  inspections,
  preview,
  onSelectAsset,
  onCreateFamily,
  onAddManualVariant,
  onCreateMirrorVariant,
  onCreatePaletteVariant,
  onDetachVariant,
  onRemoveFamily,
  onPreviewRefresh,
  onRefreshVariant,
  onDeleteVariantAsset,
}: VariantPanelProps) {
  const membership = membershipFor(project, selectedAsset?.id ?? null);
  const membershipByAsset = useMemo(
    () => new Map(assets.map((asset) => [asset.id, membershipFor(project, asset.id)])),
    [assets, project],
  );
  const standaloneAssets = useMemo(
    () => assets.filter((asset) => !membershipByAsset.get(asset.id)),
    [assets, membershipByAsset],
  );
  const [familyName, setFamilyName] = useState('新しいFamily');
  const [familyBaseAssetId, setFamilyBaseAssetId] = useState('');
  const [manualAssetId, setManualAssetId] = useState('');
  const [paletteLayerId, setPaletteLayerId] = useState('');
  const [paletteFrom, setPaletteFrom] = useState('#ff0000');
  const [paletteTo, setPaletteTo] = useState('#00ff00');
  const [paletteTolerance, setPaletteTolerance] = useState(20);
  const [manualOverwriteConfirmed, setManualOverwriteConfirmed] = useState(false);

  useEffect(() => {
    const preferred =
      selectedAsset && !membershipByAsset.get(selectedAsset.id)
        ? selectedAsset.id
        : standaloneAssets[0]?.id;
    setFamilyBaseAssetId((current) =>
      standaloneAssets.some((asset) => asset.id === current) ? current : (preferred ?? ''),
    );
  }, [membershipByAsset, selectedAsset, standaloneAssets]);

  useEffect(() => {
    setManualAssetId((current) =>
      standaloneAssets.some((asset) => asset.id === current)
        ? current
        : (standaloneAssets[0]?.id ?? ''),
    );
  }, [standaloneAssets]);

  const baseAsset = membership
    ? (assets.find((asset) => asset.id === membership.family.baseAssetId) ?? null)
    : null;
  const paletteLayers = useMemo(
    () =>
      (baseAsset?.layers ?? []).filter((layer) => {
        if (layer.layerType !== 'image' || !layer.textureId) {
          return false;
        }
        return baseAsset?.textures.some(
          (texture) => texture.id === layer.textureId && texture.kind === 'edit',
        );
      }),
    [baseAsset],
  );
  useEffect(() => {
    setPaletteLayerId((current) =>
      paletteLayers.some((layer) => layer.id === current) ? current : (paletteLayers[0]?.id ?? ''),
    );
  }, [paletteLayers]);

  useEffect(() => {
    setManualOverwriteConfirmed(false);
  }, [preview?.artifact, selectedAsset?.id]);

  const selectedInspection = selectedAsset ? inspections[selectedAsset.id] : undefined;
  const selectedPreview =
    selectedAsset && preview?.assetId === selectedAsset.id ? preview.artifact : null;
  const selectedLinkedVariant =
    membership?.role === 'variant' && membership.variant?.kind !== 'manual'
      ? membership.variant
      : null;
  const refreshPreviewEligible =
    selectedInspection?.state === 'ready' &&
    (selectedInspection.inspection?.status === 'ready' ||
      selectedInspection.inspection?.status === 'manual-adjusted');

  return (
    <section className="variant-panel" aria-labelledby="variant-panel-heading">
      <h3 id="variant-panel-heading" className="editor-subheading">
        Family / Variant
      </h3>
      <p className="editor-note">
        linked variantはbase保存だけでは変わりません。状態を確認し、preview後に明示refreshします。
      </p>

      <fieldset className="editor-fieldset variant-create-family">
        <legend>Familyを作成</legend>
        <label className="editor-field">
          Family名
          <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
        </label>
        <label className="editor-field">
          standalone base Asset
          <select
            value={familyBaseAssetId}
            onChange={(event) => setFamilyBaseAssetId(event.target.value)}
          >
            {standaloneAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.displayName}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !familyBaseAssetId || !familyName.trim()}
          onClick={() => onCreateFamily(familyName.trim(), familyBaseAssetId)}
        >
          Familyを作成
        </button>
        {standaloneAssets.length === 0 && (
          <p className="editor-note">Familyへ未所属のAssetがありません。</p>
        )}
      </fieldset>

      {!selectedAsset ? (
        <p className="editor-note">Assetを選ぶとFamily状態を表示します。</p>
      ) : !membership ? (
        <div className="variant-current-status">
          <span className="variant-badge">standalone / 独立</span>
          <p>このAssetはFamilyに所属せず、自動更新されません。</p>
        </div>
      ) : membership.role === 'base' ? (
        <div className="variant-family-management">
          <div className="variant-current-status">
            <span className="variant-badge">Family base</span>
            <strong>{membership.family.name}</strong>
            <p>base Assetを削除するには、先にFamilyを解除してください。</p>
          </div>

          <fieldset className="editor-fieldset">
            <legend>manual variantを登録</legend>
            <label className="editor-field">
              standalone member
              <select
                value={manualAssetId}
                onChange={(event) => setManualAssetId(event.target.value)}
              >
                {standaloneAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !manualAssetId}
              onClick={() => onAddManualVariant(membership.family.id, manualAssetId)}
            >
              manual variantとして登録
            </button>
            <p className="editor-note">装備差分・手修正解像度など。自動refreshは行いません。</p>
          </fieldset>

          <fieldset className="editor-fieldset">
            <legend>linked左右反転variant</legend>
            <button
              type="button"
              disabled={busy}
              onClick={() => onCreateMirrorVariant(membership.family.id)}
            >
              linked左右反転を作成
            </button>
            <p className="editor-note">
              rig、欠落Blob、複数edit textureを含むbaseは理由付きで拒否します。
            </p>
          </fieldset>

          <fieldset className="editor-fieldset">
            <legend>linked palette variant</legend>
            <label className="editor-field">
              palette対象layer（1件）
              <select
                value={paletteLayerId}
                onChange={(event) => setPaletteLayerId(event.target.value)}
              >
                {paletteLayers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="variant-palette-colors">
              <label className="editor-field">
                置換元色
                <input
                  type="color"
                  value={paletteFrom}
                  onChange={(event) => setPaletteFrom(event.target.value)}
                />
              </label>
              <label className="editor-field">
                置換先色
                <input
                  type="color"
                  value={paletteTo}
                  onChange={(event) => setPaletteTo(event.target.value)}
                />
              </label>
            </div>
            <label className="editor-field">
              palette tolerance（0-255）
              <input
                type="number"
                min={0}
                max={255}
                inputMode="numeric"
                value={paletteTolerance}
                onChange={(event) => setPaletteTolerance(Number(event.target.value))}
              />
            </label>
            <button
              type="button"
              disabled={busy || !paletteLayerId}
              onClick={() =>
                onCreatePaletteVariant({
                  familyId: membership.family.id,
                  baseLayerId: paletteLayerId,
                  from: paletteFrom,
                  to: paletteTo,
                  tolerance: paletteTolerance,
                })
              }
            >
              linked paletteを作成
            </button>
          </fieldset>

          <FamilyVariantList
            family={membership.family}
            assets={assets}
            inspections={inspections}
            onSelectAsset={onSelectAsset}
          />
          <button
            type="button"
            className="variant-danger-button"
            disabled={busy}
            onClick={() => onRemoveFamily(membership.family.id)}
          >
            Familyを解除（Assetは残す）
          </button>
        </div>
      ) : (
        <div className="variant-detail">
          <div className="variant-current-status">
            <span className="variant-badge">{variantKindLabel(membership.variant!)}</span>
            <strong>{membership.family.name}</strong>
            <span>base: {baseAsset?.displayName ?? membership.family.baseAssetId}</span>
          </div>
          {membership.variant?.kind === 'manual' ? (
            <p className="editor-note">manual variantは追跡だけを行い、自動refreshしません。</p>
          ) : (
            <div className="variant-linked-refresh" aria-live="polite">
              <p className="variant-state-text" role="status" aria-live="polite">
                状態: {inspectionLabel(selectedInspection)}
              </p>
              {selectedInspection?.state === 'error' && (
                <p className="editor-note">{selectedInspection.error}</p>
              )}
              {selectedInspection?.inspection?.reasons.map((reason) => (
                <p key={reason} className="variant-warning">
                  {reason}
                </p>
              ))}
              <p className="editor-note">
                最終同期:{' '}
                {new Date(membership.variant!.fingerprint.syncedAt).toLocaleString('ja-JP')}
              </p>
              <button
                type="button"
                disabled={busy || !refreshPreviewEligible}
                onClick={() => onPreviewRefresh(membership.family.id, membership.variant!.assetId)}
              >
                refresh前後をpreview
              </button>

              {selectedPreview && (
                <section className="variant-refresh-preview" aria-label="linked refresh preview">
                  <h4>refresh preview（まだ保存していません）</h4>
                  <div className="variant-preview-columns">
                    <AssetStructureSnapshot asset={selectedAsset} label="before" />
                    <AssetStructureSnapshot asset={selectedPreview.afterAsset} label="after" />
                  </div>
                  <LayerChangeDetails before={selectedAsset} after={selectedPreview.afterAsset} />
                  <WriteSetStructuredDiff
                    before={selectedAsset}
                    after={selectedPreview.afterAsset}
                    beforeWriteSet={selectedLinkedVariant!.recipe.writeSet}
                    afterWriteSet={selectedPreview.nextVariant.recipe.writeSet}
                  />
                  <h5>変更対象</h5>
                  <ul>
                    {selectedPreview.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                  <h5>維持するもの</h5>
                  <ul>
                    {selectedPreview.preserved.map((value) => (
                      <li key={value}>{value}</li>
                    ))}
                  </ul>
                  {selectedPreview.blobChanges.map((change) => (
                    <div key={change.targetPath} className="variant-blob-preview">
                      <p>Blob: {change.targetPath}</p>
                      <BlobComparison before={change.before} after={change.after} />
                    </div>
                  ))}
                  {selectedPreview.inspection.manualAdjusted && (
                    <label className="variant-confirm-overwrite">
                      <input
                        type="checkbox"
                        checked={manualOverwriteConfirmed}
                        onChange={(event) => setManualOverwriteConfirmed(event.target.checked)}
                      />
                      write-set内の手動調整を上書きすることを確認しました
                    </label>
                  )}
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (selectedPreview.inspection.manualAdjusted && !manualOverwriteConfirmed)
                    }
                    onClick={() =>
                      onRefreshVariant(
                        membership.family.id,
                        membership.variant!.assetId,
                        selectedPreview,
                      )
                    }
                  >
                    このvariantを明示refresh
                  </button>
                </section>
              )}
            </div>
          )}
          <div className="variant-member-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDetachVariant(membership.family.id, membership.variant!.assetId)}
            >
              Familyから外す（Assetは残す）
            </button>
            <button
              type="button"
              className="variant-danger-button"
              disabled={busy}
              onClick={() =>
                onDeleteVariantAsset(membership.family.id, membership.variant!.assetId)
              }
            >
              variantアセットを削除
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
