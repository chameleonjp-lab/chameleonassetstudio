import type { Animation } from './animation';
import type { Asset } from './asset';

/**
 * 素材検査で表示する重大度。
 * 表示上の分類だけであり、保存・autosave・.casproj・export の可否には使わない。
 */
export type InspectionSeverity = 'error' | 'warning' | 'info';

export type InspectionCategory =
  | 'asset'
  | 'reference'
  | 'collider'
  | 'anchor'
  | 'animation'
  | 'background'
  | 'tile'
  | 'gimmick'
  | 'effect';

export type InspectionPanelTarget =
  'asset-type' | 'game-data' | 'game-attributes' | 'timeline' | 'layers' | 'parts';

export interface InspectionTarget {
  /** Asset 内の確認位置。検査表示用の安定した位置表現であり、保存しない。 */
  path: string;
  /** ユーザーが画面上で探せる表示名。 */
  label: string;
  panel: InspectionPanelTarget;
}

export interface InspectionIssue {
  /** 1回の検査結果内で一意な識別子。 */
  id: string;
  /** テスト・文書・将来の案内処理で参照する安定したコード。 */
  code: string;
  severity: InspectionSeverity;
  category: InspectionCategory;
  message: string;
  reason: string;
  action: string;
  target: InspectionTarget;
}

const SEVERITY_RANK: Record<InspectionSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

type IssueInput = Omit<InspectionIssue, 'id'>;
type PushIssue = (issue: IssueInput) => void;

function createIssueCollector(): { issues: InspectionIssue[]; push: PushIssue } {
  const issues: InspectionIssue[] = [];
  const occurrences = new Map<string, number>();

  const push: PushIssue = (issue) => {
    const baseId = `${issue.code}:${issue.target.path}`;
    const occurrence = occurrences.get(baseId) ?? 0;
    occurrences.set(baseId, occurrence + 1);
    issues.push({
      ...issue,
      id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
    });
  };

  return { issues, push };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function duplicateValues<T>(items: readonly T[], valueOf: (item: T) => string): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = valueOf(item);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function inspectDuplicateIds(asset: Asset, push: PushIssue): void {
  const collections: Array<{
    name: string;
    path: string;
    values: ReadonlyArray<{ id: string }>;
    panel: InspectionPanelTarget;
  }> = [
    { name: 'テクスチャ', path: 'textures', values: asset.textures, panel: 'layers' },
    { name: 'レイヤー', path: 'layers', values: asset.layers, panel: 'layers' },
    { name: 'パーツ', path: 'parts', values: asset.parts, panel: 'parts' },
    { name: 'アンカー', path: 'anchors', values: asset.anchors, panel: 'game-data' },
    { name: '当たり判定', path: 'colliders', values: asset.colliders, panel: 'game-data' },
    { name: 'フレーム', path: 'frames', values: asset.frames ?? [], panel: 'timeline' },
    { name: 'アニメーション', path: 'animations', values: asset.animations, panel: 'timeline' },
    {
      name: 'リグアニメーション',
      path: 'rigAnimations',
      values: asset.rigAnimations ?? [],
      panel: 'parts',
    },
  ];

  for (const collection of collections) {
    for (const id of duplicateValues(collection.values, (value) => value.id)) {
      push({
        code: `reference.${collection.path}DuplicateId`,
        severity: 'error',
        category: 'reference',
        message: `${collection.name}のID「${id}」が重複しています。`,
        reason: '同じIDが複数あると、参照先を一意に決められません。',
        action: '重複している要素のどちらかを作り直し、異なるIDにしてください。',
        target: {
          path: `${collection.path}[id=${id}]`,
          label: collection.name,
          panel: collection.panel,
        },
      });
    }
  }
}

function inspectDuplicateNames(asset: Asset, push: PushIssue): void {
  for (const name of duplicateValues(asset.colliders, (collider) => collider.name)) {
    push({
      code: 'collider.duplicateName',
      severity: 'warning',
      category: 'collider',
      message: `当たり判定の名前「${name}」が重複しています。`,
      reason: '一覧で見分けにくくなり、ゲーム側で名前を使う場合に取り違える可能性があります。',
      action: '当たり判定パネルで用途が分かる別の名前に変更してください。',
      target: {
        path: `colliders[name=${name}]`,
        label: 'ゲーム情報 > 当たり判定',
        panel: 'game-data',
      },
    });
  }

  for (const name of duplicateValues(asset.frames ?? [], (frame) => frame.name)) {
    push({
      code: 'animation.frameDuplicateName',
      severity: 'warning',
      category: 'animation',
      message: `フレームの名前「${name}」が重複しています。`,
      reason: 'フレーム名を出力先のキーとして使う処理では、同名が衝突する可能性があります。',
      action: 'タイムラインで各フレームを区別できる名前に変更してください。',
      target: {
        path: `frames[name=${name}]`,
        label: 'タイムライン > フレーム',
        panel: 'timeline',
      },
    });
  }
}

function inspectReferences(asset: Asset, push: PushIssue): void {
  const textureIds = new Set(asset.textures.map((texture) => texture.id));
  const textureById = new Map(asset.textures.map((texture) => [texture.id, texture]));
  const layerIds = new Set(asset.layers.map((layer) => layer.id));
  const frameIds = new Set((asset.frames ?? []).map((frame) => frame.id));
  const partIds = new Set(asset.parts.map((part) => part.id));

  for (const layer of asset.layers) {
    if (layer.textureId && !textureIds.has(layer.textureId)) {
      push({
        code: 'reference.layerTextureMissing',
        severity: 'error',
        category: 'reference',
        message: `レイヤー「${layer.name}」の画像参照が見つかりません。`,
        reason: `textureId「${layer.textureId}」に対応するテクスチャがありません。`,
        action: 'レイヤーパネルで画像を選び直すか、不要な参照を削除してください。',
        target: {
          path: `layers[id=${layer.id}].textureId`,
          label: `レイヤー「${layer.name}」`,
          panel: 'layers',
        },
      });
    }
  }

  for (const [index, record] of (asset.provenance ?? []).entries()) {
    if (typeof record.textureId !== 'string') {
      continue;
    }
    const texture = textureById.get(record.textureId);
    if (!texture) {
      push({
        code: 'reference.provenanceTextureMissing',
        severity: 'error',
        category: 'reference',
        message: '取り込み元の画像参照が見つかりません。',
        reason: `textureId「${record.textureId}」に対応するテクスチャがありません。`,
        action: '元ファイルの来歴とテクスチャを確認し、参照切れを修復してください。',
        target: {
          path: `provenance[${index}].textureId`,
          label: '素材検査 > 取り込み元',
          panel: 'layers',
        },
      });
      continue;
    }
    if (typeof record.sourceFileName === 'string' && texture.kind !== 'source') {
      push({
        code: 'reference.provenanceTextureNotSource',
        severity: 'error',
        category: 'reference',
        message: '取り込み元の来歴がsource画像以外を参照しています。',
        reason: `textureId「${record.textureId}」の種別は「${texture.kind}」です。`,
        action: '対応するsourceテクスチャを参照するように来歴を修復してください。',
        target: {
          path: `provenance[${index}].textureId`,
          label: '素材検査 > 取り込み元',
          panel: 'layers',
        },
      });
    }
  }

  for (const frame of asset.frames ?? []) {
    const missing = unique(
      frame.layerStates.map((state) => state.layerId).filter((layerId) => !layerIds.has(layerId)),
    );
    if (missing.length > 0) {
      push({
        code: 'reference.frameLayerMissing',
        severity: 'error',
        category: 'reference',
        message: `フレーム「${frame.name}」が存在しないレイヤーを参照しています。`,
        reason: `見つからないレイヤーID: ${missing.join(', ')}`,
        action: 'フレームのレイヤー状態を作り直すか、参照を削除してください。',
        target: {
          path: `frames[id=${frame.id}].layerStates`,
          label: `タイムライン > フレーム「${frame.name}」`,
          panel: 'timeline',
        },
      });
    }
  }

  for (const animation of asset.animations) {
    const missing = unique(animation.frameIds.filter((frameId) => !frameIds.has(frameId)));
    if (missing.length > 0) {
      push({
        code: 'reference.animationFrameMissing',
        severity: 'error',
        category: 'reference',
        message: `アニメーション「${animation.name}」が存在しないフレームを参照しています。`,
        reason: `見つからないフレームID: ${missing.join(', ')}`,
        action: 'タイムラインでフレームを選び直すか、不要な参照を削除してください。',
        target: {
          path: `animations[id=${animation.id}].frameIds`,
          label: `タイムライン > アニメーション「${animation.name}」`,
          panel: 'timeline',
        },
      });
    }
  }

  for (const part of asset.parts) {
    const missingLayers = unique(part.layerIds.filter((layerId) => !layerIds.has(layerId)));
    if (missingLayers.length > 0) {
      push({
        code: 'reference.partLayerMissing',
        severity: 'error',
        category: 'reference',
        message: `パーツ「${part.name}」が存在しないレイヤーを参照しています。`,
        reason: `見つからないレイヤーID: ${missingLayers.join(', ')}`,
        action: 'パーツパネルで構成レイヤーを選び直してください。',
        target: {
          path: `parts[id=${part.id}].layerIds`,
          label: `パーツ「${part.name}」`,
          panel: 'parts',
        },
      });
    }

    if (part.parentId && !partIds.has(part.parentId)) {
      push({
        code: 'reference.partParentMissing',
        severity: 'error',
        category: 'reference',
        message: `パーツ「${part.name}」の親パーツが見つかりません。`,
        reason: `parentId「${part.parentId}」に対応するパーツがありません。`,
        action: 'リグまたはパーツパネルで親を選び直すか、親の設定を解除してください。',
        target: {
          path: `parts[id=${part.id}].parentId`,
          label: `パーツ「${part.name}」`,
          panel: 'parts',
        },
      });
    }
  }

  for (const rigAnimation of asset.rigAnimations ?? []) {
    for (const [keyframeIndex, keyframe] of rigAnimation.keyframes.entries()) {
      const missing = Object.keys(keyframe.poses).filter((partId) => !partIds.has(partId));
      if (missing.length > 0) {
        push({
          code: 'reference.rigPosePartMissing',
          severity: 'error',
          category: 'reference',
          message: `リグアニメーション「${rigAnimation.name}」が存在しないパーツを参照しています。`,
          reason: `見つからないパーツID: ${unique(missing).join(', ')}`,
          action: 'リグのキーフレームから不要なポーズを削除するか、パーツを選び直してください。',
          target: {
            path: `rigAnimations[id=${rigAnimation.id}].keyframes[${keyframeIndex}].poses`,
            label: `リグ「${rigAnimation.name}」`,
            panel: 'parts',
          },
        });
      }
    }
  }
}

function inspectPartCycles(asset: Asset, push: PushIssue): void {
  const partById = new Map(asset.parts.map((part) => [part.id, part]));
  const reported = new Set<string>();

  for (const start of asset.parts) {
    const path: string[] = [];
    const indexById = new Map<string, number>();
    let current = start;

    while (current.parentId) {
      indexById.set(current.id, path.length);
      path.push(current.id);
      const parent = partById.get(current.parentId);
      if (!parent) {
        break;
      }
      const cycleStart = indexById.get(parent.id);
      if (cycleStart !== undefined) {
        const cycleIds = [...path.slice(cycleStart), parent.id];
        const cycleKey = [...new Set(cycleIds)].sort().join('|');
        if (!reported.has(cycleKey)) {
          reported.add(cycleKey);
          push({
            code: 'reference.partParentCycle',
            severity: 'error',
            category: 'reference',
            message: 'パーツの親子関係が循環しています。',
            reason: `循環しているパーツID: ${cycleIds.join(' → ')}`,
            action: 'パーツまたはリグパネルで、循環を作っている親設定を1つ解除してください。',
            target: {
              path: `parts[id=${start.id}].parentId`,
              label: 'パーツ > 親子関係',
              panel: 'parts',
            },
          });
        }
        break;
      }
      current = parent;
    }
  }
}

function inspectAnimations(asset: Asset, push: PushIssue): void {
  for (const animation of asset.animations) {
    if (!Number.isFinite(animation.fps) || animation.fps <= 0) {
      push({
        code: 'animation.fpsInvalid',
        severity: 'error',
        category: 'animation',
        message: `アニメーション「${animation.name}」のFPSが正しくありません。`,
        reason: 'FPSは0より大きい有限の数である必要があります。',
        action: 'タイムラインでFPSを1以上に設定してください。',
        target: {
          path: `animations[id=${animation.id}].fps`,
          label: `タイムライン > アニメーション「${animation.name}」`,
          panel: 'timeline',
        },
      });
    }
    if (
      animation.durationMs !== undefined &&
      (!Number.isFinite(animation.durationMs) || animation.durationMs <= 0)
    ) {
      push({
        code: 'animation.durationInvalid',
        severity: 'error',
        category: 'animation',
        message: `アニメーション「${animation.name}」の再生時間が正しくありません。`,
        reason: '明示する再生時間は0ミリ秒より大きい有限の数である必要があります。',
        action: 'タイムラインで再生時間を正の値に直すか、自動計算を使ってください。',
        target: {
          path: `animations[id=${animation.id}].durationMs`,
          label: `タイムライン > アニメーション「${animation.name}」`,
          panel: 'timeline',
        },
      });
    }
    if (animation.frameIds.length === 0) {
      push({
        code: 'animation.framesEmpty',
        severity: 'warning',
        category: 'animation',
        message: `アニメーション「${animation.name}」にフレームがありません。`,
        reason: 'フレームがないアニメーションは再生しても表示が変わりません。',
        action: 'タイムラインでフレームを追加するか、不要なアニメーションを削除してください。',
        target: {
          path: `animations[id=${animation.id}].frameIds`,
          label: `タイムライン > アニメーション「${animation.name}」`,
          panel: 'timeline',
        },
      });
    }
  }
}

function inspectCommonProfile(asset: Asset, push: PushIssue): void {
  const { width, height } = asset.canvasSize;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    push({
      code: 'asset.canvasSizeInvalid',
      severity: 'error',
      category: 'asset',
      message: 'キャンバスサイズが正しくありません。',
      reason: '幅と高さは0より大きい有限の数である必要があります。',
      action: 'アセット設定で幅と高さを正の値に直してください。',
      target: {
        path: 'canvasSize',
        label: 'アセット > キャンバスサイズ',
        panel: 'asset-type',
      },
    });
  }

  if (
    asset.origin.x < 0 ||
    asset.origin.y < 0 ||
    asset.origin.x > width ||
    asset.origin.y > height
  ) {
    push({
      code: 'asset.originOutOfBounds',
      severity: 'warning',
      category: 'asset',
      message: '原点がキャンバスの外にあります。',
      reason: `現在の原点は(${asset.origin.x}, ${asset.origin.y})です。意図しない位置だとゲーム内配置がずれます。`,
      action: 'ゲーム情報の原点設定で、意図した基準位置か確認してください。',
      target: {
        path: 'origin',
        label: 'ゲーム情報 > 原点',
        panel: 'game-data',
      },
    });
  }
}

function inspectCharacterProfile(asset: Asset, push: PushIssue): void {
  if (!asset.colliders.some((collider) => collider.purpose === 'body')) {
    push({
      code: 'character.bodyColliderRecommended',
      severity: 'warning',
      category: 'collider',
      message: 'キャラクター用の本体判定がありません。',
      reason: '被弾、接地、押し戻しなどで本体範囲が必要になることが多いためです。',
      action:
        'ゲーム情報で用途「body」の当たり判定を追加してください。不要な用途なら、そのままでも保存できます。',
      target: {
        path: 'colliders[purpose=body]',
        label: 'ゲーム情報 > 当たり判定',
        panel: 'game-data',
      },
    });
  }
  if (asset.animations.length === 0) {
    push({
      code: 'character.animationRecommended',
      severity: 'warning',
      category: 'animation',
      message: 'キャラクターのアニメーションがありません。',
      reason: '待機、移動、攻撃などの動きをゲームへ渡せない状態です。',
      action:
        '必要な場合はタイムラインでフレームとアニメーションを追加してください。静止素材なら対応不要です。',
      target: { path: 'animations', label: 'タイムライン', panel: 'timeline' },
    });
  }
  if (asset.anchors.length === 0) {
    push({
      code: 'character.anchorRecommended',
      severity: 'warning',
      category: 'anchor',
      message: 'キャラクターのアンカーがありません。',
      reason: '武器、手、足、弾の発生位置などを他の素材と合わせる基準点がありません。',
      action: '位置合わせが必要な場合はゲーム情報でアンカーを追加してください。',
      target: { path: 'anchors', label: 'ゲーム情報 > アンカー', panel: 'game-data' },
    });
  }
}

function inspectItemProfile(asset: Asset, push: PushIssue): void {
  if (!asset.colliders.some((collider) => collider.purpose === 'pickup')) {
    push({
      code: 'item.pickupColliderRecommended',
      severity: 'warning',
      category: 'collider',
      message: 'アイテム用の取得判定がありません。',
      reason: 'プレイヤーが取得できる範囲をゲーム側へ渡せない可能性があります。',
      action: '必要な場合はゲーム情報で用途「pickup」の当たり判定を追加してください。',
      target: {
        path: 'colliders[purpose=pickup]',
        label: 'ゲーム情報 > 当たり判定',
        panel: 'game-data',
      },
    });
  }
  if (!asset.tags.includes('item') && Object.keys(asset.gameAttributes).length === 0) {
    push({
      code: 'item.gameMetadataRecommended',
      severity: 'warning',
      category: 'asset',
      message: 'アイテムの用途を示すタグやゲーム属性がありません。',
      reason: '得点、回復量、種類などをゲーム側で区別する情報がない状態です。',
      action: 'アセット種別設定のアイテムテンプレートを使うか、ゲーム属性を追加してください。',
      target: {
        path: 'tags|gameAttributes',
        label: 'アセット種別 / ゲーム属性',
        panel: 'game-attributes',
      },
    });
  }
}

function inspectBackgroundProfile(asset: Asset, push: PushIssue): void {
  const configured = asset.layers.filter((layer) => layer.background);
  if (configured.length === 0) {
    push({
      code: 'background.layerSettingsRecommended',
      severity: 'warning',
      category: 'background',
      message: '背景レイヤー設定がありません。',
      reason: '役割、視差速度、ループ方法をゲーム側へ渡せない状態です。',
      action:
        '対象レイヤーを選び、背景レイヤー設定を追加してください。静止画としてだけ使う場合は対応不要です。',
      target: {
        path: 'layers[].background',
        label: '選択中レイヤー > 背景レイヤー設定',
        panel: 'layers',
      },
    });
    return;
  }

  const allStatic = configured.every((layer) => {
    const background = layer.background;
    return (
      background !== undefined &&
      !background.loopX &&
      !background.loopY &&
      background.parallaxSpeed.x === 0 &&
      background.parallaxSpeed.y === 0
    );
  });
  if (allStatic) {
    push({
      code: 'background.staticSettingsReview',
      severity: 'warning',
      category: 'background',
      message: 'すべての背景レイヤーがループなし・視差なしです。',
      reason:
        '静止背景として正しい場合もありますが、スクロール背景では設定漏れの可能性があります。',
      action: '各背景レイヤーのループと視差速度が意図どおりか確認してください。',
      target: {
        path: 'layers[].background',
        label: '選択中レイヤー > 背景レイヤー設定',
        panel: 'layers',
      },
    });
  }
}

function inspectTileProfile(asset: Asset, push: PushIssue): void {
  const tile = asset.tile;
  if (!tile) {
    push({
      code: 'tile.settingsMissing',
      severity: 'error',
      category: 'tile',
      message: 'タイル設定がありません。',
      reason: 'タイル幅、高さ、当たり判定タイプを判定できません。',
      action: 'アセット種別設定で「タイル設定を追加」を押してください。',
      target: { path: 'tile', label: 'アセット種別 > タイル設定', panel: 'asset-type' },
    });
    return;
  }

  const { width, height } = tile.tileSize;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    push({
      code: 'tile.sizeInvalid',
      severity: 'error',
      category: 'tile',
      message: 'タイルサイズが正しくありません。',
      reason: 'タイル幅と高さは0より大きい有限の数である必要があります。',
      action: 'タイル設定で幅と高さを1以上に直してください。',
      target: {
        path: 'tile.tileSize',
        label: 'アセット種別 > タイル設定',
        panel: 'asset-type',
      },
    });
    return;
  }

  if (width > asset.canvasSize.width || height > asset.canvasSize.height) {
    push({
      code: 'tile.sizeExceedsCanvas',
      severity: 'error',
      category: 'tile',
      message: 'タイルサイズがキャンバスより大きくなっています。',
      reason: 'キャンバス内に1枚のタイルも収まりません。',
      action: 'タイルサイズを小さくするか、キャンバスサイズを見直してください。',
      target: {
        path: 'tile.tileSize',
        label: 'アセット種別 > タイル設定',
        panel: 'asset-type',
      },
    });
  } else if (asset.canvasSize.width % width !== 0 || asset.canvasSize.height % height !== 0) {
    push({
      code: 'tile.canvasNotDivisible',
      severity: 'warning',
      category: 'tile',
      message: 'キャンバスをタイルサイズで割り切れません。',
      reason: '端に半端なタイルが残り、分割時に欠ける可能性があります。',
      action: '意図した余白でなければ、キャンバスまたはタイルサイズを調整してください。',
      target: {
        path: 'canvasSize|tile.tileSize',
        label: 'アセット / タイル設定',
        panel: 'asset-type',
      },
    });
  }

  if (tile.collisionType === 'none' || tile.collisionType === 'custom') {
    push({
      code: 'tile.collisionTypeReview',
      severity: 'warning',
      category: 'tile',
      message: `タイルの当たり判定タイプが「${tile.collisionType}」です。`,
      reason:
        tile.collisionType === 'none'
          ? '通過可能なタイルとして意図した設定か確認が必要です。'
          : 'customの意味はゲーム側の実装と合わせる必要があります。',
      action: 'タイル設定とゲーム側の判定ルールが一致しているか確認してください。',
      target: {
        path: 'tile.collisionType',
        label: 'アセット種別 > タイル設定',
        panel: 'asset-type',
      },
    });
  }

  if (tile.visualType.trim() === '') {
    push({
      code: 'tile.visualTypeRecommended',
      severity: 'warning',
      category: 'tile',
      message: 'タイルの見た目タイプが空です。',
      reason: '床、壁、装飾などの用途を一覧やゲーム側で区別しにくくなります。',
      action: 'タイル設定に用途が分かる見た目タイプを入力してください。',
      target: {
        path: 'tile.visualType',
        label: 'アセット種別 > タイル設定',
        panel: 'asset-type',
      },
    });
  }
}

function inspectGimmickProfile(asset: Asset, push: PushIssue): void {
  const gimmick = asset.gimmick;
  if (!gimmick) {
    push({
      code: 'gimmick.settingsMissing',
      severity: 'error',
      category: 'gimmick',
      message: 'ギミック設定がありません。',
      reason: '移動方法など、ギミック固有の情報を判定できません。',
      action: 'アセット種別設定で「ギミック設定を追加」を押してください。',
      target: {
        path: 'gimmick',
        label: 'アセット種別 > ギミック設定',
        panel: 'asset-type',
      },
    });
  } else if (gimmick.movementPreset.trim() === '' || gimmick.movementPreset === 'none') {
    push({
      code: 'gimmick.movementPresetRecommended',
      severity: 'warning',
      category: 'gimmick',
      message: 'ギミックの移動プリセットが未指定です。',
      reason: '固定物として正しい場合もありますが、動く仕掛けでは設定漏れの可能性があります。',
      action: 'ギミック設定で移動方法を確認してください。固定物ならそのままで構いません。',
      target: {
        path: 'gimmick.movementPreset',
        label: 'アセット種別 > ギミック設定',
        panel: 'asset-type',
      },
    });
  }

  if (
    !asset.colliders.some(
      (collider) => collider.purpose === 'sensor' || collider.purpose === 'body',
    )
  ) {
    push({
      code: 'gimmick.colliderRecommended',
      severity: 'warning',
      category: 'collider',
      message: 'ギミックの本体判定またはセンサー判定がありません。',
      reason: '接触や作動条件をゲーム側へ渡せない可能性があります。',
      action: '必要な場合はゲーム情報で用途「body」または「sensor」の判定を追加してください。',
      target: {
        path: 'colliders[purpose=body|sensor]',
        label: 'ゲーム情報 > 当たり判定',
        panel: 'game-data',
      },
    });
  }
  if (asset.tags.length === 0) {
    push({
      code: 'gimmick.tagRecommended',
      severity: 'warning',
      category: 'gimmick',
      message: 'ギミックの用途タグがありません。',
      reason: 'hazard、platform、obstacleなどの用途をゲーム側で区別しにくくなります。',
      action: 'アセット種別設定で用途に近いタグを追加してください。',
      target: { path: 'tags', label: 'アセット種別 > ギミック設定', panel: 'asset-type' },
    });
  }
}

function animationDurationMs(animation: Animation): number | null {
  if (animation.durationMs !== undefined && Number.isFinite(animation.durationMs)) {
    return animation.durationMs;
  }
  if (animation.frameIds.length === 0 || !Number.isFinite(animation.fps) || animation.fps <= 0) {
    return null;
  }
  return (animation.frameIds.length / animation.fps) * 1000;
}

function inspectEffectProfile(asset: Asset, push: PushIssue): void {
  const effect = asset.effect;
  if (!effect) {
    push({
      code: 'effect.settingsMissing',
      severity: 'error',
      category: 'effect',
      message: 'エフェクト設定がありません。',
      reason: '種類、再生時間、ループ、合成方法を判定できません。',
      action: 'アセット種別設定で「エフェクト設定を追加」を押してください。',
      target: { path: 'effect', label: 'アセット種別 > エフェクト設定', panel: 'asset-type' },
    });
    return;
  }

  if (!Number.isFinite(effect.durationMs) || effect.durationMs <= 0) {
    push({
      code: 'effect.durationInvalid',
      severity: 'error',
      category: 'effect',
      message: 'エフェクトの再生時間が正しくありません。',
      reason: '再生時間は0ミリ秒より大きい有限の数である必要があります。',
      action: 'エフェクト設定で再生時間を正の値に直してください。',
      target: {
        path: 'effect.durationMs',
        label: 'アセット種別 > エフェクト設定',
        panel: 'asset-type',
      },
    });
  }

  if (asset.animations.length === 0) {
    push({
      code: 'effect.animationRecommended',
      severity: 'warning',
      category: 'effect',
      message: 'エフェクトのアニメーションがありません。',
      reason: '静止エフェクトとして正しい場合もありますが、時間変化する見た目を再生できません。',
      action: '必要な場合はタイムラインでフレームとアニメーションを追加してください。',
      target: { path: 'animations', label: 'タイムライン', panel: 'timeline' },
    });
  } else {
    if (asset.animations.some((animation) => animation.loop !== effect.loop)) {
      push({
        code: 'effect.loopMismatch',
        severity: 'warning',
        category: 'effect',
        message: 'エフェクト設定とアニメーションのループ指定が一致していません。',
        reason: 'ゲーム側とプレビューで、終了または繰り返しの動きが異なる可能性があります。',
        action: 'エフェクト設定とタイムラインのループ指定を同じ意図にそろえてください。',
        target: {
          path: 'effect.loop|animations[].loop',
          label: 'エフェクト設定 / タイムライン',
          panel: 'timeline',
        },
      });
    }

    const durations = asset.animations
      .map(animationDurationMs)
      .filter((duration): duration is number => duration !== null && duration > 0);
    if (durations.length > 0 && effect.durationMs > 0) {
      const longest = Math.max(...durations);
      const tolerance = Math.max(50, longest * 0.1);
      if (Math.abs(longest - effect.durationMs) > tolerance) {
        push({
          code: 'effect.durationMismatch',
          severity: 'warning',
          category: 'effect',
          message: 'エフェクト設定とアニメーションの長さが大きく異なります。',
          reason: `エフェクト設定は${Math.round(effect.durationMs)}ms、最長アニメーションは約${Math.round(longest)}msです。`,
          action: 'エフェクト設定の再生時間またはタイムラインのFPS・フレーム数を確認してください。',
          target: {
            path: 'effect.durationMs|animations[]',
            label: 'エフェクト設定 / タイムライン',
            panel: 'timeline',
          },
        });
      }
    }
  }

  if (asset.anchors.length === 0) {
    push({
      code: 'effect.anchorRecommended',
      severity: 'warning',
      category: 'anchor',
      message: 'エフェクトの発生位置アンカーがありません。',
      reason: '攻撃地点、接触地点、装備位置などへ合わせる基準点がありません。',
      action: '位置合わせが必要な場合はゲーム情報でアンカーを追加してください。',
      target: { path: 'anchors', label: 'ゲーム情報 > アンカー', panel: 'game-data' },
    });
  }
}

/**
 * 現行6種の Asset を A+B+X 契約で検査する純関数。
 * Asset、Project、Blob、History、保存状態を変更せず、結果も永続化しない。
 */
export function inspectAsset(asset: Asset): InspectionIssue[] {
  const { issues, push } = createIssueCollector();

  inspectCommonProfile(asset, push);
  inspectDuplicateIds(asset, push);
  inspectDuplicateNames(asset, push);
  inspectReferences(asset, push);
  inspectPartCycles(asset, push);
  inspectAnimations(asset, push);

  switch (asset.assetType) {
    case 'character':
      inspectCharacterProfile(asset, push);
      break;
    case 'item':
      inspectItemProfile(asset, push);
      break;
    case 'background':
      inspectBackgroundProfile(asset, push);
      break;
    case 'tile':
      inspectTileProfile(asset, push);
      break;
    case 'gimmick':
      inspectGimmickProfile(asset, push);
      break;
    case 'effect':
      inspectEffectProfile(asset, push);
      break;
  }

  return issues.sort((left, right) => {
    const severity = SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity];
    if (severity !== 0) {
      return severity;
    }
    const code = left.code.localeCompare(right.code);
    if (code !== 0) {
      return code;
    }
    return left.target.path.localeCompare(right.target.path);
  });
}
