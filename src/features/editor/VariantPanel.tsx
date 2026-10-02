import { useEffect, useMemo, useState } from 'react';
import type {
  Asset,
  AssetFamily,
  AssetFamilyVariant,
  FamilyVariantWriteSet,
  LinkedVariantRefreshArtifact,
  Project,
} from '../../core/model';
import { variantInspectionLabel, type VariantInspectionView } from './variantInspectionView';

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
      return '左右反転コピー';
    case 'linked-palette':
      return '色違いコピー';
    case 'manual':
      return '自由なコピー（自動更新なし）';
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
    <div className="variant-image-comparison" aria-label="更新する画像の比較">
      <figure>
        <figcaption>変更前</figcaption>
        <img src={urls.before} alt="変更前のコピー画像" />
      </figure>
      <figure>
        <figcaption>変更後</figcaption>
        <img src={urls.after} alt="変更後のコピー画像" />
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
          <dt>キャンバス</dt>
          <dd>
            {asset.canvasSize.width} × {asset.canvasSize.height}
          </dd>
        </div>
        <div>
          <dt>原点</dt>
          <dd>
            ({asset.origin.x}, {asset.origin.y})
          </dd>
        </div>
        <div>
          <dt>要素数</dt>
          <dd>
            レイヤー {asset.layers.length} / パーツ {asset.parts.length} / コマ{' '}
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
    return <p className="editor-note">コピーはまだありません。</p>;
  }
  return (
    <ul className="variant-member-list" aria-label={`グループ「${family.name}」のコピー一覧`}>
      {family.variants.map((variant) => {
        const asset = assets.find((candidate) => candidate.id === variant.assetId);
        return (
          <li key={variant.assetId}>
            <span className="variant-member-name">{asset?.displayName ?? variant.assetId}</span>
            <span className="variant-badge">{variantKindLabel(variant)}</span>
            {variant.kind !== 'manual' && (
              <span className="variant-state-text">
                {variantInspectionLabel(inspections[variant.assetId])}
              </span>
            )}
            <button
              type="button"
              aria-label={`このコピー「${asset?.displayName ?? variant.assetId}」を選択`}
              onClick={() => onSelectAsset(variant.assetId)}
            >
              このコピーを選択
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
  const [familyName, setFamilyName] = useState('新しいグループ');
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
        素材の関係
      </h3>
      <p className="editor-note">
        元の素材から左右反転や色違いを作れます。元を編集したら、差分を確認してからコピーを更新します。
      </p>

      <fieldset className="editor-fieldset variant-create-family">
        <legend>グループを作成</legend>
        <label className="editor-field">
          グループ名
          <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} />
        </label>
        <label className="editor-field">
          元にする独立素材
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
          グループを作成
        </button>
        {standaloneAssets.length === 0 && (
          <p className="editor-note">グループに属していない素材がありません。</p>
        )}
      </fieldset>

      {!selectedAsset ? (
        <p className="editor-note">素材を選ぶと、元の素材やコピーとの関係を表示します。</p>
      ) : !membership ? (
        <div className="variant-current-status">
          <span className="variant-badge">独立した素材</span>
          <p>この素材は独立して編集でき、ほかの素材の変更には追従しません。</p>
        </div>
      ) : membership.role === 'base' ? (
        <div className="variant-family-management">
          <div className="variant-current-status">
            <span className="variant-badge">元の素材</span>
            <strong>{membership.family.name}</strong>
            <p>元の素材を削除するには、先にグループを解除してください。</p>
          </div>

          <div
            className="variant-relationship"
            role="img"
            aria-label="元の素材から、左右反転と色違いのコピーを作り、確認後に更新する関係"
          >
            <span>元の素材</span>
            <span aria-hidden="true">→</span>
            <span>左右反転・色違い</span>
          </div>
          <details className="editor-note">
            <summary>保存形式の詳細</summary>
            <p>
              Family / Variantとして関連を保存します。コピーの更新は内容を確認してから行います。
            </p>
          </details>
          <fieldset className="editor-fieldset">
            <legend>自由なコピーを登録</legend>
            <label className="editor-field">
              登録する独立素材
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
              自由なコピーとして登録
            </button>
            <p className="editor-note">
              装備の違いや手描きの修正などを登録できます。元の素材の変更では書き換わりません。
            </p>
          </fieldset>

          <fieldset className="editor-fieldset">
            <legend>左右反転コピー</legend>
            <button
              type="button"
              disabled={busy}
              onClick={() => onCreateMirrorVariant(membership.family.id)}
            >
              左右反転コピーを作成
            </button>
            <p className="editor-note">
              リグの動きや画像の欠落がある素材は、理由を示して作成を止めます。複数レイヤー・複数コマの画像も保持します。
            </p>
          </fieldset>

          <fieldset className="editor-fieldset">
            <legend>色違いコピー</legend>
            <label className="editor-field">
              色を変えるレイヤー
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
              色の許容差（0-255）
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
              色違いコピーを作成
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
            グループを解除（素材は残す）
          </button>
        </div>
      ) : (
        <div className="variant-detail">
          <div className="variant-current-status">
            <span className="variant-badge">{variantKindLabel(membership.variant!)}</span>
            <strong>{membership.family.name}</strong>
            <span>元の素材: {baseAsset?.displayName ?? membership.family.baseAssetId}</span>
          </div>
          {membership.variant?.kind === 'manual' ? (
            <p className="editor-note">自由なコピーは、元の素材を更新しても変わりません。</p>
          ) : (
            <div className="variant-linked-refresh" aria-live="polite">
              <p className="variant-state-text" role="status" aria-live="polite">
                状態: {variantInspectionLabel(selectedInspection)}
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
                更新前後を比較
              </button>

              {selectedPreview && (
                <section className="variant-refresh-preview" aria-label="コピーの更新内容">
                  <h4>更新内容の確認（まだ保存していません）</h4>
                  <div className="variant-preview-columns">
                    <AssetStructureSnapshot asset={selectedAsset} label="before" />
                    <AssetStructureSnapshot asset={selectedPreview.afterAsset} label="after" />
                  </div>
                  <details className="variant-format-details">
                    <summary>保存データの差分を詳しく見る</summary>
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
                  </details>
                  {selectedPreview.blobChanges.map((change) => (
                    <div key={change.targetPath} className="variant-blob-preview">
                      <details>
                        <summary>変更する画像の保存先</summary>
                        <p>{change.targetPath}</p>
                      </details>
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
                      更新対象の手動調整を上書きすることを確認しました
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
                    このコピーを更新
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
              グループから外す（素材は残す）
            </button>
            <button
              type="button"
              className="variant-danger-button"
              disabled={busy}
              onClick={() =>
                onDeleteVariantAsset(membership.family.id, membership.variant!.assetId)
              }
            >
              コピーを削除
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
