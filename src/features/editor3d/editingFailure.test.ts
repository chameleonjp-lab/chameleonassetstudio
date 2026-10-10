import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Matrix4 } from 'three';
import { IDBFactory } from 'fake-indexeddb';
import { checkNativeProfile, fitPerspectiveBounds } from '../../adapters3d/three/renderer';
import { exactTRS, selectionFrame } from '../../adapters3d/three/transformMath';
import { assertIoBudget, ASSET_IO_PROFILE } from '../../core3d/profile/assetIoProfile';
import { openStorageDatabase, LEGACY_PROJECT_3D_DB_NAME } from '../../core3d/storage/db';
import { StorageConflictError, StorageIntegrityError } from '../../core3d/storage/repository';
import {
  openThumbnailCache,
  ThumbnailCacheConflictError,
  ThumbnailCacheIntegrityError,
} from '../../core3d/storage/thumbnailCache';
import { UnsavedProjectError } from './projectSession';
import { createNativeThumbnail } from './thumbnailImage';
import { describe, expect, it, vi } from 'vitest';
import {
  addKey,
  createClip,
  editKey,
  setTrackInterpolation,
  updateClip,
} from '../../core3d/animation/authoring';
import { addMaterial } from '../../core3d/commands/materialEditing';
import { applyHierarchyClone, previewHierarchyClone } from '../../core3d/commands/hierarchyClone';
import { applyObjectDeletion, previewObjectDeletion } from '../../core3d/commands/objectDeletion';
import { rotationFromDegrees } from '../../core3d/commands/objectEditing';
import { deleteAttachment, putAttachment, updateGame } from '../../core3d/game/authoring';
import { HistoryBudgetError, ProjectHistory } from '../../core3d/commands/history';
import { addPrimitive, type PrimitiveKind } from '../../core3d/commands/primitives';
import { nativeBox } from '../../core3d/fixtures/nativeBox';
import { smallProject } from '../../core3d/fixtures/project';
import { assertNodeEditable } from '../../core3d/model/editability';
import { validateNativeImageDimensions } from '../../core3d/model/nativeImageMetadata';
import {
  cloneProject,
  createProject,
  identityTransform,
  materialDefaults,
  type Project3D,
  type GameAttachment3D,
  type Game3D,
} from '../../core3d/model/project';
import { NATIVE_TEXTURE_PROFILE } from '../../core3d/model/textureProfile';
import { estimateCanonicalBytes } from '../../core3d/profile/resourceEstimates';
import {
  RESOURCE_ESTIMATE_CAP_BYTES,
  reserveResourceBytes,
  resourceLedgerSnapshot,
} from '../../core3d/profile/resourceLedger';
import {
  addRigJoint,
  assignRigidPartToJoint,
  bindSkin,
  extendSkinJoints,
  fitRigJoint,
  rebindSkin,
  removeUnusedRigJoint,
  setSkinWeights,
} from '../../core3d/rig/authoring';
import { AnimationTransaction } from './animationTransaction';
import {
  describeNativeEditingFailure,
  formatNativeDisplayReason,
  formatNativeEditingFailure,
  formatNativeMotionStatusReason,
  type NativeEditingTarget,
} from './editingFailure';
import {
  findNativeEditingMessage,
  findNativeDisplayStatusMessage,
  NATIVE_DISPLAY_STATUS_MESSAGES,
  findNativeMotionStatusMessage,
  NATIVE_EDITING_FAILURE_MESSAGES,
  NATIVE_MOTION_STATUS_MESSAGES,
} from './editingFailureMessages';
import { deriveNativeImage } from './nativeImage';
import { RigPoseTransaction } from './rigPoseTransaction';
import { TransformTransaction } from './transformTransaction';

const targets: readonly NativeEditingTarget[] = [
  'authoring',
  'assembly',
  'texture',
  'rig',
  'animation',
  'clone',
  'deletion',
  'rigid',
  'game',
  'viewport',
  'inspection',
  'transform',
  'storage',
  'library',
  'thumbnail',
  'quality',
];
const targetLabels = [
  '形状・材質の編集',
  '部品の組立',
  '画像・色調の編集',
  '骨と重みの編集',
  'アニメーションの編集',
  '階層の複製',
  '部品の削除',
  'rigid部品の骨割当',
  'ゲーム向け情報の編集',
  '3D表示',
  'カメラ・表示の検査',
  '部品の変形',
  '作品の保存・復旧',
  '作品一覧・復旧候補',
  '派生サムネイル',
  '作品の品質検査',
];
const secret = 'file:///private/SECRET-SOURCE.png?token=SECRET-TOKEN';
function captureFailure(operation: () => unknown): Error {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error('Expected an Error from the core operation');
    return error;
  }
  throw new Error('Expected the fixture operation to fail');
}

const cases = [
  ['Invalid origin mode', 'EDIT_GAME_ORIGIN'],
  ['Invalid game coordinates', 'EDIT_GAME_COORDINATES'],
  ['Game attachment count exceeds profile', 'EDIT_GAME_LIMIT'],
  ['Attachment does not exist', 'EDIT_GAME_SELECTION'],
  ['Invalid attachment transform', 'EDIT_GAME_TRANSFORM'],
  ['Invalid collider shape', 'EDIT_GAME_COLLIDER'],
  ['Invalid collider dimensions', 'EDIT_GAME_COLLIDER'],
  ['Material factor out of range', 'EDIT_MATERIAL_RANGE'],
  ['Emissive factor out of range', 'EDIT_MATERIAL_RANGE'],
  ['Invalid alpha cutoff', 'EDIT_MATERIAL_RANGE'],
  ['Invalid alpha mode', 'EDIT_MATERIAL_INPUT'],
  ['Invalid double-sided flag', 'EDIT_MATERIAL_INPUT'],
  ['Combined resource ownership estimate exceeds the 256 MiB cap', 'EDIT_RESOURCE_LIMIT'],
  ['Canonical clone estimate exceeds the engineering profile', 'EDIT_RESOURCE_LIMIT'],
  ['Canonical estimate traversal limit', 'EDIT_RESOURCE_LIMIT'],
  ['Source and texture total exceeds asset profile', 'EDIT_RESOURCE_LIMIT'],
  ['JSON structural estimate exceeds profile', 'EDIT_RESOURCE_LIMIT'],
  ['JSON estimate depth exceeded', 'EDIT_RESOURCE_LIMIT'],
  ['Binary estimate overflow', 'EDIT_RESOURCE_LIMIT'],
  ['History operation is already in progress', 'EDIT_BUSY'],
  ['Another image operation is active', 'EDIT_BUSY'],
  ['Project is read-only', 'EDIT_READ_ONLY'],
  ['Project history is closed', 'EDIT_CLOSED'],
  ['Stale source lineage', 'EDIT_CHANGED_TARGET'],
  ['Revision mismatch', 'EDIT_CHANGED_TARGET'],
  ['Source bytes are immutable; create a derived source', 'EDIT_SOURCE'],
  ['Source hash mismatch', 'EDIT_SOURCE'],
  ['Missing source blob', 'EDIT_SOURCE'],
  ['Cyclic source lineage', 'EDIT_SOURCE'],
  ['Textured face requires explicit UV', 'EDIT_UV'],
  ['The source image could not be decoded', 'EDIT_IMAGE_DECODE'],
  ['Failed to decode image', 'EDIT_IMAGE_DECODE'],
  ['Image MIME mismatch', 'EDIT_IMAGE_FORMAT'],
  ['Finite number required', 'EDIT_INPUT'],
  ['Float32 overflow', 'EDIT_INPUT'],
  ['Invalid primitive ID', 'EDIT_SELECTION'],
  ['Primitive IDs already exist', 'EDIT_SELECTION'],
  ['Missing reference', 'EDIT_SELECTION'],
  ['Invalid face', 'EDIT_GEOMETRY'],
  ['Corner count mismatch', 'EDIT_GEOMETRY'],
  ['Cyclic hierarchy', 'EDIT_GEOMETRY'],
  ['Invalid canonical estimate input', 'EDIT_DATA'],
  ['Noncanonical estimate object', 'EDIT_DATA'],
  ['Command cannot change identity or revision', 'EDIT_DATA'],
  ['Revision exhausted', 'EDIT_DATA'],
  ['Invalid save acknowledgement', 'EDIT_DATA'],
  ['Joint name must be nonempty', 'EDIT_RIG_NAME'],
  ['Cannot normalize zero weights', 'EDIT_WEIGHT_ZERO'],
  ['Skin weights cannot all be zero', 'EDIT_WEIGHT_ZERO'],
  ['Weights must be finite and nonnegative', 'EDIT_WEIGHT_INPUT'],
  ['Skin weight must be finite', 'EDIT_WEIGHT_INPUT'],
  ['Skin weight cannot be negative', 'EDIT_WEIGHT_INPUT'],
  ['Invalid normalized weights', 'EDIT_WEIGHT_SUM'],
  ['Skin weights must sum to 1', 'EDIT_WEIGHT_SUM'],
  ['Joint/node does not exist', 'EDIT_RIG_SELECTION'],
  ['Skin does not exist', 'EDIT_RIG_SELECTION'],
  ['Select at least one vertex assignment', 'EDIT_RIG_SELECTION'],
  ['Duplicate vertex assignment', 'EDIT_RIG_SELECTION'],
  ['Unknown skin vertex', 'EDIT_RIG_SELECTION'],
  ['Select unique palette joints', 'EDIT_RIG_SELECTION'],
  ['Rest joint editing requires a joint-only node', 'EDIT_RIG_SELECTION'],
  ['Duplicate joint', 'EDIT_RIG_SELECTION'],
  ['Duplicate skin joint', 'EDIT_RIG_SELECTION'],
  ['Unknown skin joint', 'EDIT_RIG_SELECTION'],
  ['Skin joint reference is invalid', 'EDIT_RIG_SELECTION'],
  ['Skin weight vertex reference is invalid', 'EDIT_RIG_SELECTION'],
  ['Pose target must be a unique bound joint or rigid-part parent', 'EDIT_RIG_SELECTION'],
  ['Rig pose parent is missing', 'EDIT_RIG_SELECTION'],
  ['Mesh is already bound; use explicit rebind', 'EDIT_RIG_BIND'],
  ['A mesh must have exactly one skin assignment', 'EDIT_RIG_BIND'],
  ['Skin mesh must have a scene node', 'EDIT_RIG_BIND'],
  ['Invalid influences', 'EDIT_RIG_BIND'],
  ['Unassigned skin vertex', 'EDIT_RIG_BIND'],
  ['Duplicate vertex weight', 'EDIT_RIG_BIND'],
  ['At least one skin joint is required', 'EDIT_RIG_BIND'],
  ['Skin profile fields are invalid', 'EDIT_RIG_BIND'],
  ['Skin profile IDs are invalid', 'EDIT_RIG_BIND'],
  ['Skin profile mesh reference is invalid', 'EDIT_RIG_BIND'],
  ['Skin profile mesh vertices and nodes are required', 'EDIT_RIG_BIND'],
  ['Skin weights must be an array', 'EDIT_RIG_BIND'],
  ['Duplicate skin weight for vertex', 'EDIT_RIG_BIND'],
  ['Skin influences are invalid for vertex', 'EDIT_RIG_BIND'],
  ['Skin joint and weight counts differ for vertex', 'EDIT_RIG_BIND'],
  ['Every mesh vertex must have one skin weight entry', 'EDIT_RIG_BIND'],
  ['Influence count must be between 1 and 4', 'EDIT_RIG_BIND'],
  ['Animated rest changes require an explicit conversion', 'EDIT_RIG_DEPENDENCY'],
  [
    'Referenced joints cannot be removed. Keep the skin, clips and children intact.',
    'EDIT_RIG_DEPENDENCY',
  ],
  ['Clip name must be nonempty', 'EDIT_ANIMATION_NAME'],
  ['Invalid key time', 'EDIT_ANIMATION_TIME'],
  ['Time lies outside the clip', 'EDIT_ANIMATION_INPUT'],
  ['Invalid animation time', 'EDIT_ANIMATION_INPUT'],
  ['Change track interpolation explicitly before adding a key', 'EDIT_ANIMATION_INTERPOLATION'],
  ['Clip does not exist', 'EDIT_ANIMATION_SELECTION'],
  ['Key does not exist', 'EDIT_ANIMATION_SELECTION'],
  ['Track does not exist', 'EDIT_ANIMATION_SELECTION'],
  ['Duplicate animation track', 'EDIT_ANIMATION_SELECTION'],
  ['Animation target must be a unique node', 'EDIT_ANIMATION_SELECTION'],
  ['Invalid clip', 'EDIT_ANIMATION_INPUT'],
  ['Unsupported animation', 'EDIT_ANIMATION_INPUT'],
  ['Unnormalized key quaternion', 'EDIT_ANIMATION_INPUT'],
  ['Invalid quaternion', 'EDIT_ANIMATION_INPUT'],
  ['Invalid animation TRS', 'EDIT_ANIMATION_INPUT'],
  ['Animation preview is disposed', 'EDIT_PREVIEW_UNAVAILABLE'],
  ['Animation preview is unavailable during capture or after disposal', 'EDIT_PREVIEW_UNAVAILABLE'],
] as const;

describe('fixed native editing failure guidance', () => {
  it.each(cases)('classifies %s without echoing source details', (message, code) => {
    for (const cause of [message, new Error(`${message}: ${secret}`)]) {
      for (const [index, target] of targets.entries()) {
        const result = describeNativeEditingFailure(cause, target);
        expect(result.code).toBe(code);
        expect(result.target).toBe(targetLabels[index]);
        expect(result.reason).toMatch(/[ぁ-んァ-ヶ一-龠]/);
        expect(result.action).toContain('現在の編集結果を確認');
        expect(Object.isFrozen(result)).toBe(true);
        expect(JSON.stringify(result)).not.toMatch(/SECRET|file:\/\/|private/);
        const formatted = formatNativeEditingFailure(cause, target);
        expect(formatted).toBe(`${result.target}: ${result.reason} ${result.action} [${code}]`);
        expect(formatted.length).toBeLessThan(600);
      }
    }
  });

  it.each([
    ['AbortError', 'EDIT_CANCELLED', 'cancelled'],
    ['QuotaExceededError', 'EDIT_STORAGE', 'after-preservation'],
    ['NotReadableError', 'EDIT_FILE_READ', 'after-fix'],
    ['EncodingError', 'EDIT_IMAGE_DECODE', 'after-preservation'],
  ])('recognizes native %s without exposing the message', (name, code, retry) => {
    const cause = new DOMException(secret, name);
    const result = describeNativeEditingFailure(cause, 'texture');
    expect(result).toMatchObject({ code, retry });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('does not invoke unknown string conversions, error accessors, or stack/cause getters', () => {
    const getter = vi.fn(() => {
      throw new Error('must not be called');
    });
    const unknown = {
      get message() {
        return getter();
      },
      get name() {
        return getter();
      },
      get stack() {
        return getter();
      },
      get cause() {
        return getter();
      },
      toString: getter,
      [Symbol.toPrimitive]: getter,
    };
    const cause = new Error();
    for (const key of ['message', 'name', 'stack', 'cause'])
      Object.defineProperty(cause, key, { get: getter });
    const inherited = Object.create(cause);
    for (const value of [unknown, cause, inherited])
      for (const target of targets)
        expect(describeNativeEditingFailure(value, target).code).toBe('EDIT_UNKNOWN');
    expect(getter).not.toHaveBeenCalled();
  });

  it('uses native DOMException accessors instead of arbitrary instance getters', () => {
    const getter = vi.fn(() => secret);
    const cause = new DOMException(secret, 'AbortError');
    for (const key of ['message', 'name', 'stack', 'cause'])
      Object.defineProperty(cause, key, { get: getter });
    expect(describeNativeEditingFailure(cause, 'texture').code).toBe('EDIT_CANCELLED');
    expect(getter).not.toHaveBeenCalled();
  });

  it('survives revoked proxies and ignores arbitrary objects with error-like fields', () => {
    const proxy = Proxy.revocable(new Error(secret), {});
    proxy.revoke();
    for (const value of [
      proxy.proxy,
      { message: 'Material factor out of range', name: 'AbortError' },
    ])
      expect(describeNativeEditingFailure(value, 'assembly').code).toBe('EDIT_UNKNOWN');
  });

  it.each([
    secret,
    'https://private.invalid/SECRET-file.png?token=SECRET',
    '秘密のファイルが読み込めませんでした。顧客名: SECRET',
    '未知の日本語エラー: /Users/SECRET/private.png',
    'completely unexpected failure SECRET',
    'TypeError at SECRET (file:///private/component.ts:3)',
  ])('keeps unknown Japanese/English exception text private: %s', (message) => {
    for (const target of targets)
      for (const value of [message, new Error(message)]) {
        const result = describeNativeEditingFailure(value, target);
        expect(result.code).toBe('EDIT_UNKNOWN');
        expect(result.retry).toBe('unknown');
        expect(result.reason).toBe('原因を特定できず、操作の完了を確認できませんでした。');
        expect(result.action).toContain('現在の編集結果を確認');
        expect(JSON.stringify(result)).not.toMatch(/SECRET|秘密|顧客|Users|private|TypeError/);
        expect(result.reason + result.action).not.toMatch(
          /変更していません|適用していません|変更はありません/,
        );
      }
  });

  it.each([null, undefined, 42, true, 1n, Symbol('SECRET'), {}, ['SECRET'], () => 'SECRET'])(
    'bounds non-exception thrown values',
    (cause) => {
      const result = formatNativeEditingFailure(cause, 'authoring');
      expect(result).toContain('EDIT_UNKNOWN');
      expect(result).not.toContain('SECRET');
      expect(result.length).toBeLessThan(600);
    },
  );

  it('does not read beyond the bounded 4096-character recognition window', () => {
    for (const target of targets)
      for (const cause of [
        'x'.repeat(4096) + ' Material factor out of range',
        new Error('x'.repeat(4096) + ' Missing source blob'),
        'x'.repeat(4096) + 'Joint name must be nonempty',
        new Error('x'.repeat(4096) + 'Invalid key time'),
      ])
        expect(describeNativeEditingFailure(cause, target).code).toBe('EDIT_UNKNOWN');
    expect(describeNativeEditingFailure('x'.repeat(1_000_000), 'texture').code).toBe(
      'EDIT_UNKNOWN',
    );
  });

  it('distinguishes waiting, correction, preservation, cancellation and unknown retries', () => {
    expect(
      describeNativeEditingFailure('History operation is already in progress', 'authoring').retry,
    ).toBe('after-wait');
    expect(describeNativeEditingFailure('Material factor out of range', 'authoring').retry).toBe(
      'after-fix',
    );
    expect(describeNativeEditingFailure('Source hash mismatch', 'texture').retry).toBe(
      'after-preservation',
    );
    expect(describeNativeEditingFailure(new DOMException('', 'AbortError'), 'texture').retry).toBe(
      'cancelled',
    );
    expect(describeNativeEditingFailure(undefined, 'texture').retry).toBe('unknown');
  });
});

const authoredCases = Object.entries(NATIVE_EDITING_FAILURE_MESSAGES).flatMap(([code, messages]) =>
  messages.map((message) => ({ code, message })),
);
describe('reviewed exact-match Japanese catalog', () => {
  it.each(authoredCases)('retains the authored reason: $message', ({ code, message }) => {
    for (const target of targets) {
      const result = describeNativeEditingFailure(new Error(message), target);
      expect(result.code).toBe(code);
      expect(result.reason).toBe(message);
      expect(result.action).toContain('現在の編集結果を確認');
      expect(formatNativeEditingFailure(message, target).length).toBeLessThan(600);
    }
    for (const changed of [`${message} ${secret}`, `${secret} ${message}`, message + '\n']) {
      expect(findNativeEditingMessage(changed)).toBeUndefined();
      expect(describeNativeEditingFailure(changed, 'texture').reason).not.toBe(message);
      expect(formatNativeEditingFailure(changed, 'texture')).not.toContain('SECRET');
    }
  });

  it('keeps a frozen, bounded, duplicate-free catalog', () => {
    expect(Object.isFrozen(NATIVE_EDITING_FAILURE_MESSAGES)).toBe(true);
    for (const messages of Object.values(NATIVE_EDITING_FAILURE_MESSAGES)) {
      expect(Object.isFrozen(messages)).toBe(true);
      for (const message of messages) expect(message.length).toBeLessThan(4096);
    }
    expect(new Set(authoredCases.map(({ message }) => message)).size).toBe(authoredCases.length);
  });

  it('covers static Japanese error literals from the current native-editing producers', () => {
    const paths = [
      'src/features/editor3d/Editor3DShell.tsx',
      'src/features/editor3d/NativeViewportPanel.tsx',
      'src/features/editor3d/NativeImportPreview.tsx',
      'src/features/editor3d/NativeTransformControls.tsx',
      'src/features/editor3d/NativeInspectionControls.tsx',
      'src/features/editor3d/NativeThumbnailCachePanel.tsx',
      'src/features/editor3d/NativeProjectLibraryPanel.tsx',
      'src/features/editor3d/NativeQualityPanel.tsx',
      'src/features/editor3d/importPreview.ts',
      'src/features/editor3d/transformTransaction.ts',
      'src/features/editor3d/textureSnapshot.ts',
      'src/features/editor3d/thumbnailImage.ts',
      'src/features/editor3d/projectLibrary.ts',
      'src/core3d/storage/legacyMigration.ts',
      'src/adapters3d/three/renderer.ts',
      'src/features/editor3d/NativeAuthoringPanel.tsx',
      'src/features/editor3d/NativeAssemblyControls.tsx',
      'src/features/editor3d/NativeTexturePanel.tsx',
      'src/features/editor3d/NativeRigPanel.tsx',
      'src/features/editor3d/NativeAnimationPanel.tsx',
      'src/features/editor3d/NativeHierarchyClonePanel.tsx',
      'src/features/editor3d/NativeObjectDeletionPanel.tsx',
      'src/features/editor3d/NativeRigidAttachmentPanel.tsx',
      'src/features/editor3d/NativeGamePanel.tsx',
      'src/core3d/commands/hierarchyClone.ts',
      'src/core3d/game/authoring.ts',
      'src/features/editor3d/rigPoseTransaction.ts',
      'src/features/editor3d/animationTransaction.ts',
      'src/core3d/rig/authoring.ts',
      'src/core3d/rig/pose.ts',
      'src/core3d/rig/profile.ts',
      'src/core3d/rig/math.ts',
      'src/core3d/animation/authoring.ts',
      'src/core3d/animation/evaluation.ts',
      'src/core3d/model/project.ts',
      'src/core3d/commands/primitives.ts',
      'src/core3d/commands/objectEditing.ts',
      'src/core3d/commands/objectDeletion.ts',
      'src/core3d/commands/meshEditing.ts',
      'src/core3d/commands/materialEditing.ts',
      'src/core3d/commands/sceneAssembly.ts',
      'src/core3d/commands/textureEditing.ts',
      'src/core3d/model/nativeImageMetadata.ts',
      'src/core3d/model/textureProfile.ts',
      'src/core3d/model/editability.ts',
      'src/core3d/model/transformDecomposition.ts',
      'src/core3d/model/textureResources.ts',
      'src/features/editor3d/nativeImage.ts',
      'src/features/editor3d/projectSession.ts',
      'src/core3d/commands/history.ts',
    ];
    let reviewed = 0;
    for (const path of paths) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node): void => {
        if (
          (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
          /[ぁ-んァ-ヶ一-龠]/.test(node.text)
        ) {
          const parent = node.parent;
          if (
            (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
            /^(Error|DOMException|StorageIntegrityError|invalid|super|setFailure|setError|failure|assertPivotDisplayGeometry)$/.test(
              parent.expression.getText(source),
            )
          ) {
            const message =
              (parent.expression.getText(source) === 'invalid' ? '3D画像: ' : '') + node.text;
            expect(findNativeEditingMessage(message), `${path}: ${message}`).toBeDefined();
            reviewed++;
          }
          if (ts.isParameter(parent) && parent.name.getText(source) === 'message')
            expect(findNativeEditingMessage(node.text), `${path}: ${node.text}`).toBeDefined();
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(reviewed).toBeGreaterThan(175);
  });
});

describe('reviewed finite game field expansions', () => {
  it('covers every current numeric/vector caller without accepting arbitrary field labels', () => {
    const path = 'src/features/editor3d/NativeGamePanel.tsx';
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const errorTemplates: string[] = [];
    let reviewed = 0;
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node) && node.expression.getText(source) === 'Error') {
        const message = node.arguments?.[0];
        if (message && ts.isTemplateExpression(message))
          errorTemplates.push(message.getText(source));
      }
      if (
        ts.isCallExpression(node) &&
        ['numeric', 'vector'].includes(node.expression.getText(source))
      ) {
        const [value, label, minimum, exclusive] = node.arguments;
        // The one internal vector -> numeric call is reviewed separately; all public callers below
        // must supply a literal or exactly the fixed anchor/collider label expansion.
        if (
          ts.isTemplateExpression(label) &&
          label.getText(source) === '`${label} ${axes[index]}`'
        ) {
          expect(value.getText(source)).toBe('value');
          expect(minimum?.getText(source)).toBe('positive ? 0 : undefined');
          expect(exclusive?.getText(source)).toBe('positive');
        } else {
          let labels: string[];
          if (ts.isStringLiteral(label)) labels = [label.text];
          else {
            if (!ts.isTemplateExpression(label))
              throw new Error('Unreviewed game field expression');
            expect(label.head.text).toBe('');
            expect(label.templateSpans).toHaveLength(1);
            const span = label.templateSpans[0];
            expect(span.expression.getText(source)).toBe('label');
            expect(['位置', '回転', '倍率']).toContain(span.literal.text);
            labels = ['anchor', 'collider'].map((kind) => kind + span.literal.text);
          }
          const vector = node.expression.getText(source) === 'vector';
          if (vector)
            labels = labels.flatMap((label) => ['X', 'Y', 'Z'].map((axis) => `${label} ${axis}`));
          for (const text of labels) {
            expect(findNativeEditingMessage(`${text}は有限の数値で入力してください。`)?.code).toBe(
              'EDIT_GAME_INPUT',
            );
            if (minimum !== undefined) {
              expect(minimum.getText(source)).toBe(vector ? 'true' : '0');
              if (exclusive !== undefined) expect(exclusive.getText(source)).toBe('true');
              const comparison = vector || exclusive ? 'より大きい' : '以上の';
              expect(
                findNativeEditingMessage(`${text}は0${comparison}値で入力してください。`)?.code,
              ).toBe('EDIT_GAME_INPUT');
            }
            reviewed++;
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(reviewed).toBe(27);
    expect(errorTemplates.sort()).toEqual(
      [
        '`${label}は有限の数値で入力してください。`',
        "`${label}は${minimum}${exclusive ? 'より大きい' : '以上の'}値で入力してください。`",
        '`${label}がありません。対象を選び直してください。`',
        '`${label}名を入力してください。`',
      ].sort(),
    );
    // These definitions are also part of the finite expansion contract.
    expect(source.text).toContain("const axes = ['X', 'Y', 'Z'];");
    expect(source.text).toContain("const label = kind === 'anchors' ? 'anchor' : 'collider';");
  });

  it.each([
    `受渡し単位 ${secret}は有限の数値で入力してください。`,
    `anchor名 ${secret}を入力してください。`,
    '未知の欄は有限の数値で入力してください。',
    '受渡し単位は-1より大きい値で入力してください。',
    'anchor位置 Wは有限の数値で入力してください。',
    'collider円柱部の長さは0より大きい値で入力してください。',
  ])('rejects unreviewed labels/axes/ranges: %s', (message) => {
    expect(findNativeEditingMessage(message)).toBeUndefined();
    expect(describeNativeEditingFailure(message, 'game').code).toBe('EDIT_UNKNOWN');
    expect(formatNativeEditingFailure(message, 'game')).not.toContain(message);
  });

  it('offers distinct corrective actions without instructing automatic deletion or retries', () => {
    const clone = describeNativeEditingFailure(
      '複製確認後に内容が変わりました。対象と依存を確認し直してください。',
      'clone',
    );
    expect(clone.action).toContain('古い確認内容を再利用せず');
    expect(clone.action).toContain('複製を確定');
    const deletion = describeNativeEditingFailure(
      '子オブジェクトがあります。階層全体を削除する場合は明示的に含めてください。',
      'deletion',
    );
    expect(deletion.action).toContain('子階層を含めるか');
    expect(deletion.action).toContain('明示的に確定');
    const dependency = describeNativeEditingFailure(
      '残るskinが使用するjointは削除できません。元の作品を保持しています。',
      'deletion',
    );
    expect(dependency.action).toContain('骨は削除対象から外して');
    const rigid = describeNativeEditingFailure(
      'skinやjointとして使われている部品はrigid割当できません。',
      'rigid',
    );
    expect(rigid.action).toContain('smooth skinの部品はrigid割当できません');
    const game = describeNativeEditingFailure(
      '作品が変わりました。現在値を読み直してから編集してください。',
      'game',
    );
    expect(game.action).toContain('必要な入力を控えたうえで');
    expect(game.action).toContain('現在値を読む');
  });
});

describe('bounded native motion status reasons', () => {
  const motionTargets = ['rig', 'animation'] as const;
  const fallback = '表示状態が変わりました。現在の対象を確認してください。';

  it.each(NATIVE_MOTION_STATUS_MESSAGES)(
    'preserves normal status without failure framing: %s',
    (message) => {
      for (const target of motionTargets) {
        expect(formatNativeMotionStatusReason(message, target)).toBe(message);
        expect(formatNativeMotionStatusReason(new Error(message), target)).toBe(message);
        for (const changed of [`${message} ${secret}`, `${secret} ${message}`, message + '\n']) {
          expect(findNativeMotionStatusMessage(changed)).toBeUndefined();
          expect(formatNativeMotionStatusReason(changed, target)).toBe(fallback);
        }
      }
    },
  );

  it('translates a session boundary as a normal status and leaves absent reasons empty', () => {
    for (const target of motionTargets) {
      expect(formatNativeMotionStatusReason('session boundary', target)).toBe(
        '編集や保存の操作に合わせて、表示確認を解除しました。',
      );
      expect(formatNativeMotionStatusReason('', target)).toBe('');
      expect(formatNativeMotionStatusReason(undefined, target)).toBe('');
      expect(formatNativeMotionStatusReason(`session boundary ${secret}`, target)).toBe(fallback);
    }
  });

  it('translates recognized caught failures without raw exception text or the full error frame', () => {
    for (const target of motionTargets) {
      expect(formatNativeMotionStatusReason(`Clip does not exist: ${secret}`, target)).toBe(
        '操作するクリップ・キー・トラックが見つからないか、対象が一致していません。',
      );
      expect(formatNativeMotionStatusReason('Animation preview is disposed', target)).toBe(
        'ポーズやアニメーションの表示確認を開始・更新できない状態です。',
      );
      expect(formatNativeMotionStatusReason('Clipが変わりました。', target)).toBe(
        'Clipが変わりました。',
      );
    }
  });

  it('bounds unknown status values without stringifying them or invoking getters', () => {
    const getter = vi.fn(() => {
      throw new Error('must not be called');
    });
    const unknown = {
      get message() {
        return getter();
      },
      get name() {
        return getter();
      },
      toString: getter,
      [Symbol.toPrimitive]: getter,
    };
    const error = new Error();
    for (const key of ['message', 'name', 'stack', 'cause'])
      Object.defineProperty(error, key, { get: getter });
    const proxy = Proxy.revocable(new Error(secret), {});
    proxy.revoke();
    for (const target of motionTargets)
      for (const value of [
        null,
        42,
        Symbol('SECRET'),
        {},
        unknown,
        error,
        proxy.proxy,
        secret,
        new Error(secret),
        '未知の状態: SECRET',
        'x'.repeat(4096) + 'Clip does not exist',
        'x'.repeat(1_000_000),
      ]) {
        expect(formatNativeMotionStatusReason(value, target)).toBe(fallback);
      }
    expect(getter).not.toHaveBeenCalled();
  });

  it('keeps normal status literals frozen, bounded and duplicate-free', () => {
    expect(Object.isFrozen(NATIVE_MOTION_STATUS_MESSAGES)).toBe(true);
    expect(new Set(NATIVE_MOTION_STATUS_MESSAGES).size).toBe(NATIVE_MOTION_STATUS_MESSAGES.length);
    for (const message of NATIVE_MOTION_STATUS_MESSAGES) expect(message.length).toBeLessThan(4096);
  });

  it('covers static motion notices from transactions, session boundaries and UI callers', () => {
    const paths = [
      'src/features/editor3d/rigPoseTransaction.ts',
      'src/features/editor3d/animationTransaction.ts',
      'src/features/editor3d/projectSession.ts',
      'src/features/editor3d/NativeRigPanel.tsx',
      'src/features/editor3d/NativeAnimationPanel.tsx',
      'src/features/editor3d/NativeRigidAttachmentPanel.tsx',
      'src/features/editor3d/Editor3DShell.tsx',
      'src/adapters3d/three/renderer.ts',
    ];
    let reviewed = 0;
    for (const path of paths) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const transaction = /(?:rigPose|animation)Transaction\.ts$/.test(path);
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          const parent = node.parent;
          const assignment =
            transaction &&
            ts.isBinaryExpression(parent) &&
            parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            parent.left.getText(source) === 'this.reason';
          const defaultReason =
            transaction && ts.isParameter(parent) && parent.name.getText(source) === 'reason';
          const call =
            ts.isCallExpression(parent) &&
            (/(?:rigPose|animation|rig|poses|animations)\.(?:cancel|pause)$/.test(
              parent.expression.getText(source),
            ) ||
              (transaction && /^this\.(?:cancel|pause)$/.test(parent.expression.getText(source))));
          if ((assignment || defaultReason || call) && node.text) {
            expect(findNativeMotionStatusMessage(node.text), `${path}: ${node.text}`).toBeDefined();
            reviewed++;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(reviewed).toBeGreaterThan(25);
  });
});

describe('actual clone, deletion, rigid and game failures preserve canonical data', () => {
  const modes = ['keep-world', 'keep-local'] as const;
  function rigidProject(): Project3D {
    const project = nativeBox();
    addRigJoint(project, 'bone', 'Bone', null, identityTransform());
    return project;
  }
  function attachment(): GameAttachment3D {
    return {
      id: 'attachment',
      name: 'Anchor',
      purpose: 'Fixture',
      nodeId: null,
      transform: identityTransform(),
    };
  }
  function collider(): Game3D['colliders'][number] {
    return { ...attachment(), shape: 'capsule', size: [1, 1, 1], radius: 0.5, height: 1 };
  }
  function unchanged(
    project: Project3D,
    target: NativeEditingTarget,
    code: string,
    operation: () => unknown,
  ) {
    const before = cloneProject(project);
    const cause = captureFailure(operation);
    const result = describeNativeEditingFailure(cause, target);
    expect(result.code, cause.message).toBe(code);
    expect(result.action).toContain('現在の編集結果を確認');
    expect(formatNativeEditingFailure(cause, target)).not.toMatch(/SECRET|file:\/\/|private/);
    expect(project).toEqual(before);
    return cause;
  }

  it.each([
    { label: 'invalid prefix', root: 'box-node', prefix: secret, code: 'EDIT_CLONE_ID' },
    { label: 'missing root', root: secret, prefix: 'copy', code: 'EDIT_CLONE_SELECTION' },
    { label: 'duplicate prefix', root: 'box-node', prefix: 'copy', code: 'EDIT_CLONE_ID' },
  ])('explains clone $label without mutating the original', ({ root, prefix, code }) => {
    const project = nativeBox();
    project.nodes.push({
      id: 'copy-node-0',
      name: 'Existing',
      parentId: null,
      transform: identityTransform(),
    });
    const cause = unchanged(project, 'clone', code, () =>
      previewHierarchyClone(project, root, prefix),
    );
    expect(describeNativeEditingFailure(cause, 'clone').reason).toBe(cause.message);
  });

  it('explains incomplete skin scope without removing external joints or weights', () => {
    const project = smallProject();
    unchanged(project, 'clone', 'EDIT_CLONE_DEPENDENCY', () =>
      previewHierarchyClone(project, 'shape', 'copy'),
    );
  });

  it.each(['clone', 'deletion'] as const)(
    'rejects locked %s source without changing canonical data',
    (target) => {
      const project = nativeBox();
      project.nodes[0].locked = true;
      unchanged(project, target, 'EDIT_LOCKED', () =>
        target === 'clone'
          ? previewHierarchyClone(project, 'box-node', 'copy')
          : previewObjectDeletion(project, ['box-node']),
      );
    },
  );

  it.each(['revision', 'same-revision data', 'tampered impact'] as const)(
    'rejects stale clone confirmation: %s',
    (change) => {
      const project = nativeBox();
      const preview = previewHierarchyClone(project, 'box-node', 'copy');
      if (change === 'revision') project.revision++;
      else if (change === 'same-revision data') project.nodes[0].name = 'Changed';
      else preview.counts.nodes++;
      unchanged(project, 'clone', 'EDIT_CHANGED_TARGET', () =>
        applyHierarchyClone(project, preview),
      );
    },
  );

  it.each(['revision', 'same-revision data', 'tampered impact'] as const)(
    'rejects stale deletion confirmation: %s',
    (change) => {
      const project = nativeBox();
      const preview = previewObjectDeletion(project, ['box-node']);
      if (change === 'revision') project.revision++;
      else if (change === 'same-revision data') project.nodes[0].name = 'Changed';
      else preview.counts.nodes++;
      unchanged(project, 'deletion', 'EDIT_CHANGED_TARGET', () =>
        applyObjectDeletion(project, preview),
      );
    },
  );

  it.each([
    { label: 'empty selection', ids: [] },
    { label: 'duplicate selection', ids: ['box-node', 'box-node'] },
    { label: 'missing selection', ids: [secret] },
    { label: 'descendants not explicitly included', ids: ['box-node'] },
  ])('explains deletion $label without changing dependencies', ({ ids }) => {
    const project = nativeBox();
    project.nodes.push({
      id: 'child',
      name: 'Child',
      parentId: 'box-node',
      transform: identityTransform(),
    });
    unchanged(project, 'deletion', 'EDIT_SELECTION', () => previewObjectDeletion(project, ids));
  });

  it('keeps joints required by a remaining skin out of a deletion', () => {
    const project = smallProject();
    unchanged(project, 'deletion', 'EDIT_RIG', () => previewObjectDeletion(project, ['joint-b']));
  });

  it.each(modes)('explains rigid selection and dependency errors with %s', (mode) => {
    const project = rigidProject();
    unchanged(project, 'rigid', 'EDIT_RIG_SELECTION', () =>
      assignRigidPartToJoint(project, secret, 'bone', mode),
    );
    unchanged(project, 'rigid', 'EDIT_RIG_SELECTION', () =>
      assignRigidPartToJoint(project, 'box-node', secret, mode),
    );
    unchanged(project, 'rigid', 'EDIT_RIG_SELECTION', () =>
      assignRigidPartToJoint(project, 'bone', null, mode),
    );
    unchanged(project, 'rigid', 'EDIT_SELECTION', () =>
      assignRigidPartToJoint(project, 'box-node', 'box-node', mode),
    );
    unchanged(project, 'rigid', 'EDIT_RIG_SELECTION', () =>
      assignRigidPartToJoint(project, 'box-node', null, mode),
    );
    const skinned = smallProject();
    unchanged(skinned, 'rigid', 'EDIT_RIG_DEPENDENCY', () =>
      assignRigidPartToJoint(skinned, 'shape', 'joint-a', mode),
    );
    project.nodes.push({
      id: 'child',
      name: 'Child',
      parentId: 'box-node',
      transform: identityTransform(),
    });
    unchanged(project, 'rigid', 'EDIT_RIG_SELECTION', () =>
      assignRigidPartToJoint(project, 'box-node', 'bone', mode),
    );
  });

  it.each(modes)(
    'preserves existing rigid motion instead of retargeting implicitly with %s',
    (mode) => {
      const project = rigidProject();
      createClip(project, 'motion', 'Motion', 1);
      addKey(project, 'motion', 'box-node', 'translation', 'LINEAR', 0, [0, 0, 0]);
      unchanged(project, 'rigid', 'EDIT_RIG_DEPENDENCY', () =>
        assignRigidPartToJoint(project, 'box-node', 'bone', mode),
      );
    },
  );

  it.each(['source', 'target'] as const)(
    'explains rigid %s lock without modifying the part',
    (locked) => {
      const project = rigidProject();
      project.nodes[locked === 'source' ? 0 : 1].locked = true;
      unchanged(project, 'rigid', 'EDIT_LOCKED', () =>
        assignRigidPartToJoint(project, 'box-node', 'bone', 'keep-world'),
      );
    },
  );

  it.each(['shear', 'singular parent'] as const)(
    'explains rigid keep-world %s without weakening the validator',
    (invalid) => {
      const project = rigidProject();
      project.nodes[1].transform = {
        ...identityTransform(),
        rotation: rotationFromDegrees([0, 0, 35]),
        scale: invalid === 'shear' ? [2, 1, 3] : [0, 1, 1],
      };
      unchanged(project, 'rigid', 'EDIT_TRANSFORM', () =>
        assignRigidPartToJoint(project, 'box-node', 'bone', 'keep-world'),
      );
    },
  );

  it.each([
    { field: 'assetId', value: secret, code: 'EDIT_DATA' },
    { field: 'assetKind', value: 'x'.repeat(4097), code: 'EDIT_GAME_NAME' },
    { field: 'originMode', value: 'unrecognized', code: 'EDIT_GAME_ORIGIN' },
    { field: 'unitMeters', value: 0, code: 'EDIT_GAME_COORDINATES' },
    { field: 'unitMeters', value: -1, code: 'EDIT_GAME_COORDINATES' },
    { field: 'unitMeters', value: Infinity, code: 'EDIT_INPUT' },
    { field: 'forward', value: 'unrecognized', code: 'EDIT_GAME_COORDINATES' },
    { field: 'origin', value: [NaN, 0, 0], code: 'EDIT_INPUT' },
  ])('explains actual game setting $field = $value', ({ field, value, code }) => {
    const project = nativeBox();
    const { assetId, assetKind, originMode, unitMeters, forward, origin } = project.game;
    const settings = { assetId, assetKind, originMode, unitMeters, forward, origin };
    Reflect.set(settings, field, value);
    unchanged(project, 'game', code, () => updateGame(project, settings));
  });

  it.each([
    { field: 'shape', value: 'pyramid', code: 'EDIT_GAME_COLLIDER' },
    { field: 'size', value: [0, 1, 1], code: 'EDIT_GAME_COLLIDER' },
    { field: 'radius', value: 0, code: 'EDIT_GAME_COLLIDER' },
    { field: 'height', value: -1, code: 'EDIT_GAME_COLLIDER' },
    { field: 'radius', value: Infinity, code: 'EDIT_INPUT' },
    { field: 'name', value: 'x'.repeat(4097), code: 'EDIT_GAME_NAME' },
    { field: 'nodeId', value: secret, code: 'EDIT_SELECTION' },
  ])('explains actual collider $field = $value', ({ field, value, code }) => {
    const project = nativeBox();
    const input = collider();
    Reflect.set(input, field, value);
    unchanged(project, 'game', code, () => putAttachment(project, 'colliders', input));
  });

  it.each(['anchors', 'colliders'] as const)(
    'explains missing, locked and duplicate %s without changing the project',
    (kind) => {
      const project = nativeBox();
      unchanged(project, 'game', 'EDIT_GAME_SELECTION', () =>
        deleteAttachment(project, kind, secret),
      );
      const item = kind === 'anchors' ? attachment() : collider();
      item.nodeId = 'box-node';
      putAttachment(project, kind, item);
      project.nodes[0].locked = true;
      unchanged(project, 'game', 'EDIT_LOCKED', () => deleteAttachment(project, kind, item.id));
      unchanged(project, 'game', 'EDIT_LOCKED', () =>
        putAttachment(project, kind, { ...item, name: 'Changed' }),
      );
      project.nodes[0].locked = false;
      const other = kind === 'anchors' ? 'colliders' : 'anchors';
      unchanged(project, 'game', 'EDIT_DATA', () => putAttachment(project, other, collider()));
    },
  );

  it.each(['anchors', 'colliders'] as const)(
    'explains invalid %s transforms without publishing the candidate',
    (kind) => {
      const project = nativeBox();
      for (const transform of [
        { ...identityTransform(), scale: [1, 0, 1] },
        { ...identityTransform(), rotation: [0, 0, 0, 2] },
      ]) {
        const item = kind === 'anchors' ? attachment() : collider();
        Object.assign(item.transform, transform);
        unchanged(project, 'game', 'EDIT_GAME_TRANSFORM', () => putAttachment(project, kind, item));
      }
    },
  );

  it.each(['anchors', 'colliders'] as const)(
    'explains the real 256-item %s limit without deleting entries',
    (kind) => {
      const project = nativeBox();
      if (kind === 'anchors')
        project.game.anchors = Array.from({ length: 256 }, (_, index) => ({
          ...attachment(),
          id: `a-${index}`,
        }));
      else
        project.game.colliders = Array.from({ length: 256 }, (_, index) => ({
          ...collider(),
          id: `c-${index}`,
        }));
      const cause = unchanged(project, 'game', 'EDIT_GAME_LIMIT', () =>
        putAttachment(project, kind, kind === 'anchors' ? attachment() : collider()),
      );
      expect(describeNativeEditingFailure(cause, 'game').retry).toBe('after-preservation');
    },
  );

  it.each(['clone', 'deletion', 'rigid', 'game'] as const)(
    'keeps a successful %s operation undoable when the following UI callback throws',
    (target) => {
      const history = new ProjectHistory(rigidProject());
      const before = history.project;
      try {
        const cause = captureFailure(() => {
          history.execute((project) => {
            if (target === 'clone')
              applyHierarchyClone(project, previewHierarchyClone(project, 'box-node', 'copy'));
            else if (target === 'deletion')
              applyObjectDeletion(project, previewObjectDeletion(project, ['box-node']));
            else if (target === 'rigid')
              assignRigidPartToJoint(project, 'box-node', 'bone', 'keep-world');
            else putAttachment(project, 'anchors', attachment());
          });
          throw new Error(secret);
        });
        expect(history.revision).toBe(1);
        if (target === 'clone') expect(history.project.nodes).toHaveLength(before.nodes.length + 1);
        else if (target === 'deletion')
          expect(history.project.nodes).toHaveLength(before.nodes.length - 1);
        else if (target === 'rigid') expect(history.project.nodes[0].parentId).toBe('bone');
        else expect(history.project.game.anchors).toHaveLength(1);
        const result = describeNativeEditingFailure(cause, target);
        expect(result.code).toBe('EDIT_UNKNOWN');
        expect(result.action).toContain('現在の編集結果を確認');
        expect(result.reason + result.action).not.toMatch(
          /変更していません|適用していません|変更はありません|SECRET/,
        );
        history.undo();
        expect(history.project).toEqual({ ...before, revision: 2 });
      } finally {
        history.dispose();
      }
    },
  );

  it('does not broaden prior target classification for the generic Invalid text validator', () => {
    expect(describeNativeEditingFailure(`Invalid text: ${secret}`, 'game').code).toBe(
      'EDIT_GAME_NAME',
    );
    for (const target of ['authoring', 'assembly', 'texture', 'rig', 'animation'] as const)
      expect(describeNativeEditingFailure('Invalid text', target).code).toBe('EDIT_UNKNOWN');
  });
});

describe('actual core failures and state preservation', () => {
  const invalidNames = [
    { label: 'empty', name: '' },
    { label: 'whitespace', name: ' \t ' },
    { label: 'over 4096 UTF-16 units', name: 'x'.repeat(4097) },
    { label: 'over 4096 UTF-16 units using surrogate pairs', name: '🦴'.repeat(2049) },
  ];
  it.each(invalidNames)('explains actual $label joint names without mutation', ({ name }) => {
    const project = smallProject(),
      before = cloneProject(project);
    const cause = captureFailure(() =>
      addRigJoint(project, 'new-joint', name, null, identityTransform()),
    );
    expect(cause.message).toBe('Joint name must be nonempty');
    expect(describeNativeEditingFailure(cause, 'rig')).toMatchObject({
      code: 'EDIT_RIG_NAME',
      target: '骨と重みの編集',
      reason: '骨の名前が空欄・空白だけ、または長すぎます。',
      retry: 'after-fix',
    });
    expect(project).toEqual(before);
  });

  it.each(invalidNames)('explains actual $label clip names without mutation', ({ name }) => {
    const project = smallProject(),
      before = cloneProject(project);
    for (const operation of [
      () => createClip(project, 'new-clip', name),
      () => updateClip(project, 'clip', { name, duration: 1, loop: true }),
    ]) {
      const cause = captureFailure(operation);
      expect(cause.message).toBe('Clip name must be nonempty');
      expect(describeNativeEditingFailure(cause, 'animation')).toMatchObject({
        code: 'EDIT_ANIMATION_NAME',
        target: 'アニメーションの編集',
        reason: 'クリップの名前が空欄・空白だけ、または長すぎます。',
        retry: 'after-fix',
      });
      expect(project).toEqual(before);
    }
  });

  it.each([
    [[0, 0], true, 'Cannot normalize zero weights', 'EDIT_WEIGHT_ZERO'],
    [[-1, 2], true, 'Weights must be finite and nonnegative', 'EDIT_WEIGHT_INPUT'],
    [[NaN, 1], true, 'Weights must be finite and nonnegative', 'EDIT_WEIGHT_INPUT'],
    [[Infinity, 1], true, 'Weights must be finite and nonnegative', 'EDIT_WEIGHT_INPUT'],
    [[0, 0], false, 'Invalid normalized weights', 'EDIT_WEIGHT_SUM'],
    [[-1, 2], false, 'Invalid normalized weights', 'EDIT_WEIGHT_SUM'],
    [[0.2, 0.2], false, 'Invalid normalized weights', 'EDIT_WEIGHT_SUM'],
    [[NaN, 1], false, 'Finite number required', 'EDIT_INPUT'],
  ] as const)(
    'classifies actual weights %j with normalization %s',
    (values, normalize, message, code) => {
      const project = smallProject(),
        before = cloneProject(project);
      const cause = captureFailure(() =>
        setSkinWeights(
          project,
          'skin',
          [{ vertexId: 'v0', jointIds: ['joint-a', 'joint-b'], values: [...values] }],
          { normalize },
        ),
      );
      expect(cause.message).toBe(message);
      const result = describeNativeEditingFailure(cause, 'rig');
      expect(result).toMatchObject({ code, target: '骨と重みの編集', retry: 'after-fix' });
      if (code === 'EDIT_WEIGHT_ZERO') {
        expect(result.reason).toBe('重みが全て0のため、正規化できません。');
        expect(result.action).toContain('1つ以上の正の値');
      }
      expect(project).toEqual(before);
    },
  );

  it.each([
    {
      label: 'missing joint parent',
      code: 'EDIT_RIG_SELECTION',
      operation: (project: Project3D) =>
        addRigJoint(project, 'new-joint', 'Bone', secret, identityTransform()),
    },
    {
      label: 'missing skin',
      code: 'EDIT_RIG_SELECTION',
      operation: (project: Project3D) => rebindSkin(project, secret),
    },
    {
      label: 'missing vertex',
      code: 'EDIT_RIG_SELECTION',
      operation: (project: Project3D) =>
        setSkinWeights(project, 'skin', [{ vertexId: secret, jointIds: ['joint-a'], values: [1] }]),
    },
    {
      label: 'duplicate assignments',
      code: 'EDIT_RIG_SELECTION',
      operation: (project: Project3D) =>
        setSkinWeights(project, 'skin', [project.skins[0].weights[0], project.skins[0].weights[0]]),
    },
    {
      label: 'duplicate palette selection',
      code: 'EDIT_RIG_SELECTION',
      operation: (project: Project3D) => extendSkinJoints(project, 'skin', ['joint-a', 'joint-a']),
    },
    {
      label: 'already bound mesh',
      code: 'EDIT_RIG_BIND',
      operation: (project: Project3D) =>
        bindSkin(project, 'new-skin', 'mesh-one', ['joint-a', 'joint-b'], project.skins[0].weights),
    },
    {
      label: 'joint and weight count mismatch',
      code: 'EDIT_RIG_BIND',
      operation: (project: Project3D) =>
        setSkinWeights(project, 'skin', [
          { vertexId: 'v0', jointIds: ['joint-a'], values: [0.5, 0.5] },
        ]),
    },
    {
      label: 'referenced joint removal',
      code: 'EDIT_RIG_DEPENDENCY',
      operation: (project: Project3D) => removeUnusedRigJoint(project, 'joint-b'),
    },
    {
      label: 'animated rest edit',
      code: 'EDIT_RIG_DEPENDENCY',
      operation: (project: Project3D) => fitRigJoint(project, 'joint-b', identityTransform()),
    },
  ])(
    'explains actual $label without exposing references or changing the project',
    ({ code, operation }) => {
      const project = smallProject(),
        before = cloneProject(project);
      const cause = captureFailure(() => operation(project));
      expect(describeNativeEditingFailure(cause, 'rig').code).toBe(code);
      expect(formatNativeEditingFailure(cause, 'rig')).not.toMatch(/SECRET|file:\/\/|private/);
      expect(project).toEqual(before);
    },
  );

  it.each([
    { label: 'duplicate first key', time: 0 },
    { label: 'duplicate last key', time: 1 },
    { label: 'negative time', time: -1 },
    { label: 'after clip end', time: 2 },
  ])('explains actual $label without changing the project', ({ time }) => {
    const project = smallProject(),
      before = cloneProject(project);
    const cause = captureFailure(() =>
      addKey(project, 'clip', 'joint-b', 'translation', 'LINEAR', time, [0, 0, 0]),
    );
    expect(cause.message).toBe('Invalid key time');
    expect(describeNativeEditingFailure(cause, 'animation')).toMatchObject({
      code: 'EDIT_ANIMATION_TIME',
      target: 'アニメーションの編集',
      reason:
        'キー時刻は0秒〜クリップの長さの範囲内で、同じ対象・属性の他のキーと重複しない値にしてください。',
      retry: 'after-fix',
    });
    expect(project).toEqual(before);
  });

  it('explains a rejected shortening without discarding keys', () => {
    const project = smallProject(),
      before = cloneProject(project);
    const cause = captureFailure(() =>
      updateClip(project, 'clip', { name: 'Short', duration: 0.5, loop: false }),
    );
    expect(cause.message).toBe('Invalid key time');
    expect(describeNativeEditingFailure(cause, 'animation').code).toBe('EDIT_ANIMATION_TIME');
    expect(project).toEqual(before);
  });

  it.each([
    {
      label: 'implicit interpolation replacement',
      message: 'Change track interpolation explicitly before adding a key',
      code: 'EDIT_ANIMATION_INTERPOLATION',
      operation: (project: Project3D) =>
        addKey(project, 'clip', 'joint-b', 'translation', 'STEP', 0.5, [0, 0, 0]),
    },
    {
      label: 'missing clip',
      message: 'Clip does not exist',
      code: 'EDIT_ANIMATION_SELECTION',
      operation: (project: Project3D) =>
        addKey(project, secret, 'joint-b', 'translation', 'LINEAR', 0.5, [0, 0, 0]),
    },
    {
      label: 'missing key',
      message: 'Key does not exist',
      code: 'EDIT_ANIMATION_SELECTION',
      operation: (project: Project3D) =>
        editKey(project, 'clip', 'joint-b', 'translation', 0.5, 0.5, [0, 0, 0]),
    },
    {
      label: 'missing track',
      message: 'Track does not exist',
      code: 'EDIT_ANIMATION_SELECTION',
      operation: (project: Project3D) =>
        setTrackInterpolation(project, 'clip', 'joint-b', 'scale', 'STEP'),
    },
    {
      label: 'negative clip duration',
      message: 'Invalid clip',
      code: 'EDIT_ANIMATION_INPUT',
      operation: (project: Project3D) => createClip(project, 'new-clip', 'Short', -1),
    },
    {
      label: 'unnormalized rotation key',
      message: 'Unnormalized key quaternion',
      code: 'EDIT_ANIMATION_INPUT',
      operation: (project: Project3D) =>
        addKey(project, 'clip', 'joint-b', 'rotation', 'LINEAR', 0.5, [0, 0, 0, 2]),
    },
  ])('explains actual $label without changing the project', ({ message, code, operation }) => {
    const project = smallProject(),
      before = cloneProject(project);
    const cause = captureFailure(() => operation(project));
    expect(cause.message).toBe(message);
    expect(describeNativeEditingFailure(cause, 'animation').code).toBe(code);
    expect(project).toEqual(before);
  });

  it('explains actual unavailable, captured, stale and disposed previews without canonical edits', () => {
    const project = smallProject(),
      before = cloneProject(project);
    const commit = vi.fn();
    const editing = new TransformTransaction({
      getProject: () => cloneProject(project),
      getIdentity: () => ({ id: project.id, revision: project.revision }),
      isReadOnly: () => false,
      commit,
    });
    const rig = new RigPoseTransaction({
      getProject: () => cloneProject(project),
      isReadOnly: () => false,
      editing,
    });
    const animation = new AnimationTransaction({
      getProject: () => cloneProject(project),
      isReadOnly: () => false,
      editing,
      rig,
    });
    try {
      const token = rig.begin();
      rig.cancel();
      const stale = rig.preview(token, []);
      expect(stale.ok).toBe(false);
      if (stale.ok) throw new Error('Expected a rejected operation');
      expect(describeNativeEditingFailure(stale.reason, 'rig')).toMatchObject({
        code: 'EDIT_CHANGED_TARGET',
        reason: '古いpose操作です。現在の対象を確認してください。',
      });
      const rigCapture = rig.beginCapture();
      try {
        const cause = captureFailure(() => rig.begin());
        expect(describeNativeEditingFailure(cause, 'rig')).toMatchObject({
          code: 'EDIT_PREVIEW_UNAVAILABLE',
          reason: '現在poseを変更できません。',
        });
      } finally {
        rigCapture.release();
      }
      expect(animation.select('clip').ok).toBe(true);
      const unavailable = animation.play();
      expect(unavailable.ok).toBe(false);
      if (unavailable.ok) throw new Error('Expected a rejected operation');
      expect(describeNativeEditingFailure(unavailable.reason, 'animation')).toMatchObject({
        code: 'EDIT_PREVIEW_UNAVAILABLE',
        reason: '3D表示を再開してから再生してください。',
      });
      const outside = animation.seek(2);
      expect(outside.ok).toBe(false);
      if (outside.ok) throw new Error('Expected a rejected operation');
      expect(describeNativeEditingFailure(outside.reason, 'animation')).toMatchObject({
        code: 'EDIT_ANIMATION_INPUT',
        reason: '表示する時刻は0秒〜クリップの長さの範囲内の有限な数値にしてください。',
      });
      animation.cancel();
      const animationCapture = animation.beginCapture();
      try {
        const captured = animation.select('clip');
        expect(captured.ok).toBe(false);
        if (captured.ok) throw new Error('Expected a rejected operation');
        expect(describeNativeEditingFailure(captured.reason, 'animation').code).toBe(
          'EDIT_PREVIEW_UNAVAILABLE',
        );
      } finally {
        animationCapture.release();
      }
      animation.dispose();
      const disposed = animation.play();
      expect(disposed.ok).toBe(false);
      if (disposed.ok) throw new Error('Expected a rejected operation');
      expect(describeNativeEditingFailure(disposed.reason, 'animation').code).toBe(
        'EDIT_PREVIEW_UNAVAILABLE',
      );
      expect(project).toEqual(before);
      expect(commit).not.toHaveBeenCalled();
    } finally {
      animation.dispose();
      rig.dispose();
    }
  });

  it.each([
    [
      'baseColor',
      { baseColor: [2, 0, 0, 1] as [number, number, number, number] },
      '材質の色・不透明度・金属度・粗さは0〜1で入力してください。',
    ],
    [
      'emissiveColor',
      { emissiveColor: [0, 2, 0] as [number, number, number] },
      '発光色の数値は0〜1で入力してください。',
    ],
    ['alphaCutoff', { alphaCutoff: 2 }, 'アルファカットオフは0〜1で入力してください。'],
  ] as const)(
    'translates an actual %s material failure without changing the candidate',
    (_label, invalid, reason) => {
      const project = nativeBox(),
        before = structuredClone(project);
      const cause = captureFailure(() =>
        addMaterial(project, 'new-material', {
          ...materialDefaults(),
          baseColor: [0.2, 0.3, 0.4, 1],
          metallic: 0.5,
          roughness: 0.6,
          ...invalid,
        }),
      );
      expect(cause.message).toBe(
        {
          baseColor: 'Material factor out of range',
          emissiveColor: 'Emissive factor out of range',
          alphaCutoff: 'Invalid alpha cutoff',
        }[_label],
      );
      expect(describeNativeEditingFailure(cause, 'authoring')).toMatchObject({
        code: 'EDIT_MATERIAL_RANGE',
        reason,
        target: '形状・材質の編集',
        retry: 'after-fix',
      });
      expect(project).toEqual(before);
    },
  );

  it('classifies the actual shared 256 MiB ownership cap without allocating it', () => {
    const before = resourceLedgerSnapshot();
    const cause = captureFailure(() =>
      reserveResourceBytes('history', RESOURCE_ESTIMATE_CAP_BYTES + 1),
    );
    expect(cause.message).toBe('Combined resource ownership estimate exceeds the 256 MiB cap');
    expect(describeNativeEditingFailure(cause, 'authoring')).toMatchObject({
      code: 'EDIT_RESOURCE_LIMIT',
      retry: 'after-preservation',
    });
    expect(resourceLedgerSnapshot()).toEqual(before);
  });

  it('classifies an actual canonical traversal limit with a tiny deep fixture', () => {
    let value: unknown = null;
    for (let index = 0; index < 258; index++) value = [value];
    const cause = captureFailure(() => estimateCanonicalBytes(value));
    expect(cause.message).toBe('Canonical estimate traversal limit');
    expect(describeNativeEditingFailure(cause, 'assembly').code).toBe('EDIT_RESOURCE_LIMIT');
  });

  it('preserves the actual history-budget reason and old project/history', () => {
    const history = new ProjectHistory(nativeBox(), 1);
    const before = history.project,
      metadata = history.metadata;
    try {
      const cause = captureFailure(() =>
        history.execute((project) => {
          project.name = 'Too large';
        }),
      );
      expect(cause).toBeInstanceOf(HistoryBudgetError);
      const result = describeNativeEditingFailure(cause, 'authoring');
      expect(result).toMatchObject({
        code: 'EDIT_HISTORY_LIMIT',
        reason: cause.message,
        retry: 'after-preservation',
      });
      expect(result.action).toContain('バックアップにUndo/Redo履歴は含まれません');
      expect(history.project).toEqual(before);
      expect(history.metadata).toEqual(metadata);
    } finally {
      history.dispose();
    }
  });

  it.each(['box', 'plane', 'sphere', 'cylinder', 'cone'] as PrimitiveKind[])(
    'preserves actual %s primitive range messages',
    (kind) => {
      const project = createProject('primitive-failure');
      for (const options of [
        { kind, width: 0, height: 1, depth: 1, segments: 1 },
        { kind, width: 1, height: 1, depth: 1, segments: 1000 },
      ]) {
        const cause = captureFailure(() => addPrimitive(project, 'shape', options));
        expect(describeNativeEditingFailure(cause, 'authoring')).toMatchObject({
          code: 'EDIT_INPUT',
          reason: cause.message,
        });
      }
      expect(project.nodes).toHaveLength(0);
    },
  );

  it('preserves the actual image dimension and edit-lock messages', () => {
    const dimension = captureFailure(() =>
      validateNativeImageDimensions(NATIVE_TEXTURE_PROFILE.maxEdge + 1, 1),
    );
    expect(describeNativeEditingFailure(dimension, 'texture')).toMatchObject({
      code: 'EDIT_RESOURCE_LIMIT',
      reason: dimension.message,
    });
    const project = nativeBox();
    project.nodes[0].locked = true;
    const locked = captureFailure(() => assertNodeEditable(project, project.nodes[0].id));
    expect(describeNativeEditingFailure(locked, 'authoring')).toMatchObject({
      code: 'EDIT_LOCKED',
      reason: locked.message,
    });
  });

  it('preserves the actual prefixed tone-range reason before image decode begins', async () => {
    const bytes = new Uint8Array([1, 2, 3]),
      before = bytes.slice();
    let cause: unknown;
    try {
      await deriveNativeImage(bytes, { gain: [5, 1, 1], brightness: 0, saturation: 1 });
    } catch (error) {
      cause = error;
    }
    expect(cause).toBeInstanceOf(Error);
    expect(describeNativeEditingFailure(cause, 'texture')).toMatchObject({
      code: 'EDIT_INPUT',
      reason: '3D画像: 色調補正の設定範囲が不正です',
    });
    expect(bytes).toEqual(before);
  });

  it('redacts interpolated PNG chunk values rather than adding them to the literal catalog', () => {
    expect(
      describeNativeEditingFailure(
        '3D画像: PNGの必須チャンク ABCD には対応していません',
        'texture',
      ),
    ).toMatchObject({
      code: 'EDIT_IMAGE_FORMAT',
      reason: 'PNGに、この版で対応していない必須チャンクがあります。',
    });
    expect(
      formatNativeEditingFailure('3D画像: PNGの必須チャンク ABCD には対応していません', 'texture'),
    ).not.toContain('ABCD');
    expect(
      describeNativeEditingFailure(
        `3D画像: PNGの必須チャンク ${secret} には対応していません`,
        'texture',
      ).code,
    ).toBe('EDIT_UNKNOWN');
  });

  it('does not promise atomic failure when a UI callback throws after a successful commit', () => {
    const history = new ProjectHistory(nativeBox());
    try {
      const cause = captureFailure(() => {
        history.execute((project) => {
          project.name = 'Already committed';
        });
        throw new Error(secret);
      });
      expect(history.project.name).toBe('Already committed');
      expect(history.revision).toBe(1);
      for (const target of targets) {
        const result = describeNativeEditingFailure(cause, target);
        expect(result.code).toBe('EDIT_UNKNOWN');
        expect(result.action).toContain('現在の編集結果を確認');
        expect(result.reason + result.action).not.toMatch(
          /変更していません|適用していません|変更はありません/,
        );
      }
    } finally {
      history.dispose();
    }
  });
});

const stateFailureCases = [
  ['WebGL2 is unavailable.', 'EDIT_VIEWPORT_UNAVAILABLE', 'viewport'],
  ['WebGL2 initialization failed:', 'EDIT_VIEWPORT_UNAVAILABLE', 'viewport'],
  ['WebGL context lost;', 'EDIT_VIEWPORT_UNAVAILABLE', 'viewport'],
  ['Native source snapshot failed:', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['Native editing construction failed:', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['Native scene construction failed:', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['Native camera construction failed:', 'EDIT_VIEWPORT_RENDER', 'inspection'],
  ['Native controls construction failed:', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['Native rendering failed:', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['View construction failed:', 'EDIT_VIEWPORT_RENDER', 'inspection'],
  ['Render target allocation failed:', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['Viewport construction failed.', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['Camera construction failed.', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['Viewport restoration failed.', 'EDIT_VIEWPORT_RENDER', 'viewport'],
  ['Render target budget exceeded;', 'EDIT_RESOURCE_LIMIT', 'viewport'],
  ['Native compact-evaluation-0 node count exceeded.', 'EDIT_RESOURCE_LIMIT', 'viewport'],
  ['Native compact-evaluation-0 geometry count exceeded.', 'EDIT_RESOURCE_LIMIT', 'viewport'],
  ['Native compact-evaluation-0 hierarchy depth exceeded.', 'EDIT_RESOURCE_LIMIT', 'viewport'],
  [
    'Native compact-evaluation-0 rendered triangle count exceeded across instances.',
    'EDIT_RESOURCE_LIMIT',
    'viewport',
  ],
  ['Native unique texture pixel count exceeded.', 'EDIT_RESOURCE_LIMIT', 'viewport'],
  ['Skin joint count exceeds Uint16 indices.', 'EDIT_RESOURCE_LIMIT', 'viewport'],
  ['Invalid canonical project:', 'EDIT_DATA', 'viewport'],
  ['Invalid native skin:', 'EDIT_VIEWPORT_PROFILE', 'viewport'],
  [
    'This isolated native viewport does not support non-triangle faces.',
    'EDIT_VIEWPORT_PROFILE',
    'viewport',
  ],
  ['Multiple skins on one mesh are unsupported.', 'EDIT_VIEWPORT_PROFILE', 'viewport'],
  [
    'A joint with its own mesh needs an explicit joint-only conversion.',
    'EDIT_VIEWPORT_PROFILE',
    'viewport',
  ],
  [
    'Native texture dimensions are outside the prepared image profile.',
    'EDIT_VIEWPORT_PROFILE',
    'viewport',
  ],
  [
    'Geometry is outside the finite Float32 evaluation profile.',
    'EDIT_VIEWPORT_PROFILE',
    'viewport',
  ],
  [
    'Corner attributes are outside the finite Float32 evaluation profile.',
    'EDIT_VIEWPORT_PROFILE',
    'viewport',
  ],
  [
    'Node transforms are outside the finite Float32 evaluation profile.',
    'EDIT_VIEWPORT_PROFILE',
    'viewport',
  ],
  [
    'Transformed geometry is outside the finite Float32 evaluation profile.',
    'EDIT_VIEWPORT_PROFILE',
    'viewport',
  ],
  ['Native textures require a prepared RGBA8 source for ', 'EDIT_SOURCE', 'viewport'],
  ['Native textures require an exact RGBA8 byte count.', 'EDIT_SOURCE', 'viewport'],
  ['テクスチャの元画像が見つかりません: ', 'EDIT_SOURCE', 'viewport'],
  ['Native textured faces require complete finite corner UV0 attributes.', 'EDIT_UV', 'viewport'],
  ['Viewport is disposed.', 'EDIT_VIEWPORT_STATE', 'viewport'],
  ['Viewport disposed', 'EDIT_VIEWPORT_STATE', 'viewport'],
  ['Viewport is not suspended.', 'EDIT_VIEWPORT_STATE', 'viewport'],
  ['Camera edits require an active native viewport.', 'EDIT_VIEWPORT_STATE', 'inspection'],
  ['Camera actions require an active native viewport.', 'EDIT_VIEWPORT_STATE', 'inspection'],
  ['Camera presets require an active native viewport.', 'EDIT_VIEWPORT_STATE', 'inspection'],
  ['View options require an active native viewport.', 'EDIT_VIEWPORT_STATE', 'inspection'],
  ['Focus requires an active native viewport.', 'EDIT_VIEWPORT_STATE', 'inspection'],
  ['PNG capture requires an active native viewport.', 'EDIT_VIEWPORT_STATE', 'viewport'],
  ['A live canonical project is required.', 'EDIT_VIEWPORT_STATE', 'viewport'],
  [
    'GPU pause/resume requires the same persisted, current, and displayed revision.',
    'EDIT_VIEWPORT_REVISION',
    'viewport',
  ],
  [
    'GPU pause/resume requires the current canonical session revision.',
    'EDIT_VIEWPORT_REVISION',
    'viewport',
  ],
  [
    'The current project requires a matching saved revision and complete sources.',
    'EDIT_VIEWPORT_REVISION',
    'viewport',
  ],
  ['PNG capture requires the displayed canonical revision.', 'EDIT_VIEWPORT_REVISION', 'viewport'],
  ['PNG capture became stale during encoding.', 'EDIT_VIEWPORT_REVISION', 'viewport'],
  [
    'Complete reconstruction sources must be confirmed before GPU pause/resume.',
    'EDIT_SOURCE',
    'viewport',
  ],
  ['The native viewport could not render a PNG.', 'EDIT_PNG_CAPTURE', 'viewport'],
  ['Canvas PNG encoding failed.', 'EDIT_PNG_CAPTURE', 'viewport'],
  [
    'Finite ordered bounds and a valid perspective camera are required.',
    'EDIT_CAMERA_INPUT',
    'inspection',
  ],
  [
    'Finite position/target, 0 < field of view < 180, and a positive span are required.',
    'EDIT_CAMERA_INPUT',
    'inspection',
  ],
  [
    'The camera requires a finite position and a separate target.',
    'EDIT_CAMERA_INPUT',
    'inspection',
  ],
  ['The camera requires a finite zoom range.', 'EDIT_CAMERA_INPUT', 'inspection'],
  ['A finite screen-up vector is required.', 'EDIT_CAMERA_INPUT', 'inspection'],
  [
    'Screen-up must be nonzero and separate from the viewing direction.',
    'EDIT_CAMERA_INPUT',
    'inspection',
  ],
  [
    'Camera fit is outside the finite Float32 evaluation profile.',
    'EDIT_CAMERA_INPUT',
    'inspection',
  ],
  [
    'Camera clipping is outside the finite Float32 evaluation profile.',
    'EDIT_CAMERA_INPUT',
    'inspection',
  ],
  [
    'Camera projection is outside the finite Float32 evaluation profile.',
    'EDIT_CAMERA_INPUT',
    'inspection',
  ],
  [
    'The camera action is outside the finite Float32 evaluation profile.',
    'EDIT_CAMERA_INPUT',
    'inspection',
  ],
  ['Unknown native camera preset.', 'EDIT_CAMERA_INPUT', 'inspection'],
  ['Unknown native camera action.', 'EDIT_CAMERA_INPUT', 'inspection'],
  [
    'Valid native shading, background, lighting and helper options are required.',
    'EDIT_INPUT',
    'inspection',
  ],
  ['The selected node is hidden.', 'EDIT_SELECTION', 'inspection'],
  ['The selected canonical node is not present.', 'EDIT_SELECTION', 'inspection'],
  ['The selected node has no native geometry in its subtree.', 'EDIT_SELECTION', 'inspection'],
  ['Game preview exceeds Float32 range', 'EDIT_VIEWPORT_PROFILE', 'viewport'],
  ['Error: Game helper geometry exceeds Float32 range', 'EDIT_VIEWPORT_PROFILE', 'viewport'],
  ['Error: Collider exceeds Float32 range', 'EDIT_VIEWPORT_PROFILE', 'viewport'],
  [
    'Transform requires shear, which native TRS cannot represent',
    'EDIT_TRANSFORM_SHEAR',
    'transform',
  ],
  ['Singular or non-finite transform', 'EDIT_TRANSFORM_INPUT', 'transform'],
  ['Non-finite transform', 'EDIT_TRANSFORM_INPUT', 'transform'],
  ['Singular parent transform', 'EDIT_TRANSFORM_INPUT', 'transform'],
  ['A finite three-component delta is required', 'EDIT_TRANSFORM_INPUT', 'transform'],
  ['Parent and descendant selection is ambiguous', 'EDIT_TRANSFORM_HIERARCHY', 'transform'],
  [
    'A unique selection and selected active pivot are required',
    'EDIT_TRANSFORM_SELECTION',
    'transform',
  ],
  ['Missing selected node', 'EDIT_TRANSFORM_SELECTION', 'transform'],
  ['Hidden objects cannot start viewport transforms', 'EDIT_TRANSFORM_SELECTION', 'transform'],
  ['A selected node, ancestor or affected descendant is locked', 'EDIT_LOCKED', 'transform'],
  ['Invalid transform options', 'EDIT_INPUT', 'transform'],
  ['Translation delta is below coordinate precision', 'EDIT_TRANSFORM', 'transform'],
  ['Cyclic selection hierarchy', 'EDIT_GEOMETRY', 'transform'],
  ['Another tab is blocking 3D storage opening', 'EDIT_STORAGE_BLOCKED', 'storage'],
  ['Another tab is blocking thumbnail cache opening', 'EDIT_STORAGE_BLOCKED', 'thumbnail'],
  ['IndexedDB is unavailable', 'EDIT_STORAGE_UNAVAILABLE', 'storage'],
  ['IndexedDB is unavailable for thumbnails', 'EDIT_STORAGE_UNAVAILABLE', 'thumbnail'],
  ['IndexedDB request failed', 'EDIT_STORAGE_UNAVAILABLE', 'storage'],
  ['Could not open 3D storage', 'EDIT_STORAGE_UNAVAILABLE', 'storage'],
  ['Could not open thumbnail cache', 'EDIT_STORAGE_UNAVAILABLE', 'thumbnail'],
  ['3D storage conflict: revision.', 'EDIT_STORAGE_CONFLICT', 'storage'],
  [
    'Thumbnail cache changed (token); refresh before retrying.',
    'EDIT_THUMBNAIL_CONFLICT',
    'thumbnail',
  ],
  ['Thumbnail cache is unrecognized or damaged:', 'EDIT_THUMBNAIL_INTEGRITY', 'thumbnail'],
  ['Thumbnail cache transaction timed out', 'EDIT_THUMBNAIL_TIMEOUT', 'thumbnail'],
  ['Thumbnail cache opening timed out', 'EDIT_THUMBNAIL_TIMEOUT', 'thumbnail'],
  ['Thumbnail cache is full; existing entries were retained.', 'EDIT_THUMBNAIL_LIMIT', 'thumbnail'],
  ['Thumbnail cache is closed', 'EDIT_THUMBNAIL_CLOSED', 'thumbnail'],
  ['Expected a plain thumbnail record', 'EDIT_THUMBNAIL_INPUT', 'thumbnail'],
  ['Unexpected thumbnail record fields', 'EDIT_THUMBNAIL_INPUT', 'thumbnail'],
  ['Thumbnail fields must be enumerable data properties', 'EDIT_THUMBNAIL_INPUT', 'thumbnail'],
  ['Thumbnail bytes must be a Uint8Array', 'EDIT_THUMBNAIL_INPUT', 'thumbnail'],
  [
    'Thumbnail PNG exceeds the 256 KiB profile or is too short',
    'EDIT_THUMBNAIL_INPUT',
    'thumbnail',
  ],
  [
    'Invalid thumbnail project, revision or dimensions (maximum 256 × 256)',
    'EDIT_THUMBNAIL_INPUT',
    'thumbnail',
  ],
  [
    'Thumbnail must have a PNG signature and matching valid IHDR dimensions',
    'EDIT_THUMBNAIL_INPUT',
    'thumbnail',
  ],
  ['Invalid thumbnail metadata', 'EDIT_THUMBNAIL_INPUT', 'thumbnail'],
  [
    'Thumbnail put requires an expected token and latest revision',
    'EDIT_THUMBNAIL_INPUT',
    'thumbnail',
  ],
  ['Thumbnail canCommit must be a synchronous function', 'EDIT_THUMBNAIL_INPUT', 'thumbnail'],
  ['Invalid thumbnail cleanup generation', 'EDIT_THUMBNAIL_INPUT', 'thumbnail'],
  ['Thumbnail transaction completed before its operation', 'EDIT_THUMBNAIL_INPUT', 'thumbnail'],
  ['Another asset I/O job is active', 'EDIT_BUSY', 'quality'],
  ['Asset worker failed; original project retained', 'EDIT_QUALITY_WORKER', 'quality'],
  ['Invalid asset worker response', 'EDIT_QUALITY_WORKER', 'quality'],
  ['Invalid worker response', 'EDIT_QUALITY_WORKER', 'quality'],
  ['Inspection JSON exceeds cas3d-basic-gltf2-v1', 'EDIT_RESOURCE_LIMIT', 'quality'],
  ['Inspection blobs exceeds cas3d-basic-gltf2-v1', 'EDIT_RESOURCE_LIMIT', 'quality'],
  ['Inspection estimate exceeds cas3d-basic-gltf2-v1', 'EDIT_RESOURCE_LIMIT', 'quality'],
  ['Inspection report exceeds cas3d-basic-gltf2-v1', 'EDIT_RESOURCE_LIMIT', 'quality'],
  ['Worker peak estimate exceeds cas3d-basic-gltf2-v1', 'EDIT_RESOURCE_LIMIT', 'quality'],
  ['Asset I/O reservation exceeds cas3d-basic-gltf2-v1', 'EDIT_RESOURCE_LIMIT', 'quality'],
] as const;

describe('display, inspection, transform, storage and quality failure guidance', () => {
  it.each(stateFailureCases)('recognizes %s without suffix details', (message, code, target) => {
    for (const cause of [
      message,
      new Error(message),
      `${message} ${secret}`,
      new Error(`${message} ${secret}`),
    ]) {
      const failure = describeNativeEditingFailure(cause, target);
      expect(failure.code).toBe(code);
      expect(failure.reason).toMatch(/[ぁ-んァ-ヶ一-龠]/);
      expect(failure.action).toContain('現在の編集結果を確認');
      expect(JSON.stringify(failure)).not.toMatch(/SECRET|file:\/\/|private/);
      expect(formatNativeEditingFailure(cause, target).length).toBeLessThan(600);
      expect(formatNativeDisplayReason(cause, target)).toBe(failure.reason);
      expect(formatNativeDisplayReason(failure.reason, target)).toBe(failure.reason);
    }
  });

  it.each([
    'SecurityError',
    'NotAllowedError',
    'InvalidStateError',
    'VersionError',
    'UnknownError',
    'NotFoundError',
    'TransactionInactiveError',
  ])(
    'keeps %s storage advice preservation-first and does not broaden image classification',
    (name) => {
      const error = new DOMException(secret, name);
      const getter = vi.fn(() => secret);
      for (const key of ['name', 'message', 'stack', 'cause'])
        Object.defineProperty(error, key, { get: getter });
      for (const target of ['storage', 'library', 'thumbnail'] as const) {
        const failure = describeNativeEditingFailure(error, target);
        expect(failure).toMatchObject({
          code: 'EDIT_STORAGE_UNAVAILABLE',
          retry: 'after-preservation',
        });
        expect(failure.action).toContain('現在のタブを閉じず');
        expect(failure.action).toContain('バックアップ');
        expect(failure.action).toContain('データベースを削除せず');
        expect(JSON.stringify(failure)).not.toContain('SECRET');
      }
      expect(describeNativeEditingFailure(error, 'texture').code).toBe('EDIT_UNKNOWN');
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it('distinguishes backup-file reads from image reads', () => {
    const error = new DOMException(secret, 'NotReadableError');
    for (const target of ['storage', 'library'] as const) {
      const failure = describeNativeEditingFailure(error, target);
      expect(failure.code).toBe('EDIT_BACKUP_READ');
      expect(failure.action).toContain('.cas3dproj');
      expect(failure.action).toContain('現在のタブを保持');
      expect(JSON.stringify(failure)).not.toContain('SECRET');
    }
    expect(describeNativeEditingFailure(error, 'texture').code).toBe('EDIT_FILE_READ');
  });

  it('retains the camera reasons and prior transform-specific wording', () => {
    for (const message of [
      'カメラの各欄に有限の数値を入力してください。空欄は適用できません。',
      'カメラ位置と注視点を別の位置にしてください。',
    ])
      expect(describeNativeEditingFailure(new Error(message), 'inspection').reason).toBe(message);
    for (const [message, reason] of [
      [
        'Transform requires shear, which native TRS cannot represent',
        'この変形にはせん断が必要です。向きや倍率、world/localの設定を見直してください。',
      ],
      [
        'Singular parent transform',
        '有限の数値を入力してください。倍率0や極端に小さい値は適用できません。',
      ],
      [
        'Parent and descendant selection is ambiguous',
        '親とその子孫を同時に変形できません。選択を見直してください。',
      ],
      ['Missing selected node', '変形する部品とアクティブな部品を選択してください。'],
    ])
      expect(describeNativeEditingFailure(new Error(message), 'transform').reason).toBe(reason);
  });

  it('offers distinct preservation, waiting and explicit confirmation actions', () => {
    const blocked = describeNativeEditingFailure(
      'Another tab is blocking 3D storage opening',
      'storage',
    );
    expect(blocked.retry).toBe('after-wait');
    expect(blocked.action).toContain('未保存のタブを閉じず');
    expect(blocked.action).toContain('バックアップ');
    const conflict = describeNativeEditingFailure(new StorageConflictError('writer'), 'library');
    expect(conflict.retry).toBe('after-preservation');
    expect(conflict.action).toContain('別コピー');
    const cache = describeNativeEditingFailure(
      new ThumbnailCacheConflictError('generation'),
      'thumbnail',
    );
    expect(cache.retry).toBe('after-fix');
    expect(cache.action).toContain('古い確認を再利用せず');
    expect(cache.action).toContain('明示的に');
    const full = describeNativeEditingFailure(
      new DOMException(secret, 'QuotaExceededError'),
      'thumbnail',
    );
    expect(full.code).toBe('EDIT_THUMBNAIL_LIMIT');
    expect(full.action).toContain('元の作品の保存領域は削除しない');
    const timeout = describeNativeEditingFailure(
      new DOMException(secret, 'TimeoutError'),
      'thumbnail',
    );
    expect(timeout.retry).toBe('after-wait');
    expect(timeout.action).toContain('操作結果を読み直して');
    const cancelled = describeNativeEditingFailure(
      new DOMException(secret, 'AbortError'),
      'storage',
    );
    expect(cancelled.retry).toBe('cancelled');
    expect(cancelled.action).toContain('現在のタブを閉じず');
    expect(cancelled.action).toContain('未保存の変更');
    const unsaved = describeNativeEditingFailure(new UnsavedProjectError(), 'storage');
    expect(unsaved).toMatchObject({
      code: 'EDIT_UNSAVED',
      retry: 'after-preservation',
      reason: new UnsavedProjectError().message,
    });
    expect(unsaved.action).toContain('現在のタブを閉じず');
  });

  it('recognizes concrete storage error classes without reading arbitrary reason properties', () => {
    const getter = vi.fn(() => {
      throw new Error('do not read private reason');
    });
    const errors = [
      [new StorageIntegrityError(secret), 'EDIT_STORAGE_INTEGRITY'],
      [new ThumbnailCacheIntegrityError(secret), 'EDIT_THUMBNAIL_INTEGRITY'],
      ...(['writer', 'revision', 'exists', 'trashed'] as const).map(
        (reason) => [new StorageConflictError(reason), 'EDIT_STORAGE_CONFLICT'] as const,
      ),
      ...(['token', 'revision', 'generation'] as const).map(
        (reason) => [new ThumbnailCacheConflictError(reason), 'EDIT_THUMBNAIL_CONFLICT'] as const,
      ),
    ] as const;
    for (const [error, code] of errors) {
      Object.defineProperty(error, 'reason', { get: getter });
      const failure = describeNativeEditingFailure(error, 'storage');
      expect(failure.code).toBe(code);
      expect(JSON.stringify(failure)).not.toContain('SECRET');
    }
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('bounded display status reasons', () => {
  const fallback = '表示状態が変わりました。現在の対象を確認してください。';
  it.each(NATIVE_DISPLAY_STATUS_MESSAGES)(
    'retains the normal notice without failure framing: %s',
    (message) => {
      for (const target of targets) {
        expect(formatNativeDisplayReason(message, target)).toBe(message);
        expect(formatNativeDisplayReason(new Error(message), target)).toBe(message);
        for (const changed of [`${message} ${secret}`, `${secret} ${message}`, message + '\n']) {
          expect(findNativeDisplayStatusMessage(changed)).toBeUndefined();
          expect(formatNativeDisplayReason(changed, target)).toBe(fallback);
        }
      }
    },
  );

  it('keeps every possible reviewed reason stable when viewport status formats it again', () => {
    for (const { message } of authoredCases)
      for (const target of targets)
        expect(
          formatNativeDisplayReason(describeNativeEditingFailure(message, target).reason, target),
        ).toBe(message);
    // Check defaults straight from the guidance object so new codes cannot silently lose their reason.
    const path = 'src/features/editor3d/editingFailure.ts';
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const reasons: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isPropertyAssignment(node) &&
        /^EDIT_/.test(node.name.getText(source)) &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        const reason = node.initializer.elements[0];
        if (reason && ts.isStringLiteral(reason)) reasons.push(reason.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(reasons.length).toBeGreaterThan(70);
    for (const reason of reasons)
      for (const target of targets) {
        expect(formatNativeDisplayReason(reason, target)).toBe(reason);
        expect(formatNativeDisplayReason(new Error(reason), target)).toBe(reason);
        expect(formatNativeDisplayReason(`${reason} ${secret}`, target)).not.toBe(reason);
      }
    const unknown = describeNativeEditingFailure(secret, 'viewport');
    expect(formatNativeDisplayReason(unknown.reason, 'viewport')).toBe(unknown.reason);
    expect(formatNativeDisplayReason(secret, 'viewport')).toBe(fallback);
    expect(unknown.reason).not.toBe(fallback);
  });

  it('distinguishes cancellation and suspension from errors and leaves absent reasons empty', () => {
    expect(formatNativeDisplayReason('GPU pause', 'viewport')).toBe(
      'GPU表示を休止しました。再開は明示操作です。',
    );
    expect(
      formatNativeDisplayReason(
        new DOMException('Texture preparation was cancelled.', 'AbortError'),
        'viewport',
      ),
    ).toBe('表示の準備を中止しました。必要な場合だけ表示を再開してください。');
    expect(formatNativeDisplayReason(new DOMException(secret, 'AbortError'), 'viewport')).toBe(
      '処理を取り消しました。',
    );
    expect(formatNativeDisplayReason('', 'viewport')).toBe('');
    expect(formatNativeDisplayReason(undefined, 'viewport')).toBe('');
    expect(formatNativeDisplayReason('GPU pause ' + secret, 'viewport')).toBe(fallback);
  });

  it('never converts unknown status objects, invokes accessors, or echoes arbitrary Japanese', () => {
    const getter = vi.fn(() => {
      throw new Error('must not be called');
    });
    const plain = Object.create(null);
    const error = new Error();
    for (const key of [
      'message',
      'name',
      'reason',
      'stack',
      'cause',
      'toString',
      Symbol.toPrimitive,
    ]) {
      Object.defineProperty(plain, key, { get: getter });
      Object.defineProperty(error, key, { get: getter });
    }
    const proxy = Proxy.revocable(new Error(secret), {});
    proxy.revoke();
    for (const value of [
      null,
      true,
      42,
      1n,
      Symbol(secret),
      [secret],
      () => secret,
      plain,
      error,
      proxy.proxy,
      { reason: 'GPU pause' },
      '未知の日本語の表示状態: ' + secret,
      new Error(secret),
      secret,
      'x'.repeat(4096) + 'WebGL2 initialization failed:',
      new Error('x'.repeat(4096) + 'Thumbnail cache opening timed out'),
      'x'.repeat(1_000_000),
    ])
      for (const target of targets) expect(formatNativeDisplayReason(value, target)).toBe(fallback);
    expect(getter).not.toHaveBeenCalled();
  });

  it('keeps the reviewed status catalog frozen, bounded and duplicate-free', () => {
    expect(Object.isFrozen(NATIVE_DISPLAY_STATUS_MESSAGES)).toBe(true);
    expect(new Set(NATIVE_DISPLAY_STATUS_MESSAGES).size).toBe(
      NATIVE_DISPLAY_STATUS_MESSAGES.length,
    );
    for (const message of NATIVE_DISPLAY_STATUS_MESSAGES) expect(message.length).toBeLessThan(4096);
  });

  it('covers static and interpolated renderer errors and raw display reason producers', () => {
    const paths = [
      'src/adapters3d/three/renderer.ts',
      'src/features/editor3d/NativeViewportPanel.tsx',
      'src/features/editor3d/NativeImportPreview.tsx',
      'src/features/editor3d/importPreview.ts',
    ];
    let reviewed = 0;
    for (const path of paths) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateExpression(node)
        ) {
          const parent = node.parent;
          const constructor =
            (ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
            /^(?:Error|DOMException|failure)$/.test(parent.expression.getText(source)) &&
            parent.arguments?.[0] === node;
          const reason =
            ts.isPropertyAssignment(parent) && parent.name.getText(source) === 'reason';
          if (constructor || reason) {
            const text = ts.isTemplateExpression(node) ? node.head.text + secret : node.text;
            expect(formatNativeDisplayReason(text, 'viewport'), `${path}: ${text}`).not.toBe(
              fallback,
            );
            expect(formatNativeDisplayReason(text, 'viewport')).not.toContain('SECRET');
            reviewed++;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(reviewed).toBeGreaterThan(65);
  });
});

describe('actual state failures retain source data and storage ownership', () => {
  it('classifies real camera and renderer profile failures without starting WebGL', () => {
    const error = captureFailure(() => fitPerspectiveBounds({ min: [0, 0, 0], max: [1, 1, 1] }, 0));
    expect(describeNativeEditingFailure(error, 'inspection').code).toBe('EDIT_CAMERA_INPUT');
    const project = nativeBox();
    project.materials[0].textureBlobId = 'a'.repeat(64);
    project.blobIds = ['a'.repeat(64)];
    const before = cloneProject(project);
    const missing = checkNativeProfile(project);
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error('Expected missing prepared texture');
    const failure = describeNativeEditingFailure(missing.reason, 'viewport');
    expect(failure.code).toBe('EDIT_SOURCE');
    expect(JSON.stringify(failure)).not.toContain('a'.repeat(64));
    expect(project).toEqual(before);
    project.revision = -1;
    const invalid = checkNativeProfile(project);
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error('Expected invalid canonical revision');
    expect(describeNativeEditingFailure(invalid.reason, 'viewport').code).toBe('EDIT_DATA');
  });

  it('preserves the exact historical transform guidance for real matrix and selection failures', () => {
    const singular = captureFailure(() => exactTRS(new Matrix4().makeScale(0, 1, 1)));
    expect(describeNativeEditingFailure(singular, 'transform').code).toBe('EDIT_TRANSFORM_INPUT');
    const sheared = new Matrix4();
    sheared.elements[4] = 0.5;
    const shear = captureFailure(() => exactTRS(sheared));
    expect(describeNativeEditingFailure(shear, 'transform').code).toBe('EDIT_TRANSFORM_SHEAR');
    const project = nativeBox();
    const child = { ...structuredClone(project.nodes[0]), id: 'child', parentId: 'box-node' };
    project.nodes.push(child);
    const before = cloneProject(project);
    const context = {
      selection: ['box-node', 'child'],
      activeId: 'box-node',
      options: { mode: 'translate', space: 'world', snap: null },
      readOnly: false,
      lockedIds: [],
    } as const;
    const hierarchy = captureFailure(() =>
      selectionFrame(project, { ...context, selection: [...context.selection], lockedIds: [] }),
    );
    expect(describeNativeEditingFailure(hierarchy, 'transform').code).toBe(
      'EDIT_TRANSFORM_HIERARCHY',
    );
    const selection = captureFailure(() =>
      selectionFrame(project, { ...context, selection: [], lockedIds: [] }),
    );
    expect(describeNativeEditingFailure(selection, 'transform').code).toBe(
      'EDIT_TRANSFORM_SELECTION',
    );
    expect(project).toEqual(before);
  });

  it('reports an actual inspection admission limit without allocating the rejected payload', () => {
    const before = resourceLedgerSnapshot();
    const error = captureFailure(() =>
      assertIoBudget(
        ASSET_IO_PROFILE.jsonBytes + 1,
        ASSET_IO_PROFILE.jsonBytes,
        'Inspection report',
      ),
    );
    expect(describeNativeEditingFailure(error, 'quality').code).toBe('EDIT_RESOURCE_LIMIT');
    expect(resourceLedgerSnapshot()).toEqual(before);
  });

  it('explains an actual blocked database open and preserves the late connection cleanup', async () => {
    const request = {} as IDBOpenDBRequest;
    const opening = openStorageDatabase({
      indexedDB: { open: () => request } as unknown as globalThis.IDBFactory,
    });
    const captured = opening.catch((cause: unknown) =>
      describeNativeEditingFailure(cause, 'storage'),
    );
    request.onblocked!.call(request, new Event('blocked') as IDBVersionChangeEvent);
    expect(await captured).toMatchObject({ code: 'EDIT_STORAGE_BLOCKED', retry: 'after-wait' });
    const close = vi.fn();
    Object.defineProperty(request, 'result', { value: { close } });
    request.onsuccess!.call(request, new Event('success'));
    expect(close).toHaveBeenCalledOnce();
    await expect(openStorageDatabase({ name: LEGACY_PROJECT_3D_DB_NAME })).rejects.toSatisfy(
      (cause: unknown) => {
        const failure = describeNativeEditingFailure(cause, 'storage');
        return failure.code === 'EDIT_READ_ONLY' && failure.action.includes('別コピーとして移行');
      },
    );
  });

  it('recognizes a real stalled cache timeout without opening or clearing source storage', async () => {
    vi.useFakeTimers();
    try {
      const request = {} as IDBOpenDBRequest;
      const opening = openThumbnailCache({
        indexedDB: { open: () => request } as unknown as globalThis.IDBFactory,
      });
      const captured = opening.catch((cause: unknown) =>
        describeNativeEditingFailure(cause, 'thumbnail'),
      );
      await vi.advanceTimersByTimeAsync(5000);
      expect(await captured).toMatchObject({ code: 'EDIT_THUMBNAIL_TIMEOUT', retry: 'after-wait' });
      const abort = vi.fn();
      Object.defineProperty(request, 'transaction', { value: { abort } });
      request.onupgradeneeded!.call(request, { oldVersion: 0 } as IDBVersionChangeEvent);
      expect(abort).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains actual cache conflicts, invalid input and a closed connection without changing entries', async () => {
    const baseline = resourceLedgerSnapshot();
    const cache = await openThumbnailCache({ indexedDB: new IDBFactory() });
    const bytes = new Uint8Array(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6RWQAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    const input = { projectId: 'test-project', revision: 0, width: 1, height: 1, bytes };
    try {
      const entry = await cache.put(input, { expectedToken: null, latestRevision: 0 });
      const before = await cache.summary();
      await expect(cache.put(input, { expectedToken: null, latestRevision: 0 })).rejects.toSatisfy(
        (cause: unknown) =>
          describeNativeEditingFailure(cause, 'thumbnail').code === 'EDIT_THUMBNAIL_CONFLICT',
      );
      await expect(
        cache.put({ ...input, width: 0 }, { expectedToken: entry.token, latestRevision: 0 }),
      ).rejects.toSatisfy(
        (cause: unknown) =>
          describeNativeEditingFailure(cause, 'thumbnail').code === 'EDIT_THUMBNAIL_INPUT',
      );
      expect(await cache.summary()).toEqual(before);
      const read = await cache.read(input.projectId);
      expect(read?.bytes).toEqual(bytes);
      read?.release();
      cache.close();
      await expect(cache.summary()).rejects.toSatisfy(
        (cause: unknown) =>
          describeNativeEditingFailure(cause, 'thumbnail').code === 'EDIT_THUMBNAIL_CLOSED',
      );
    } finally {
      cache.close();
    }
    expect(resourceLedgerSnapshot()).toEqual(baseline);
  });

  it('keeps thumbnail cancellation separate from malformed source-image guidance', async () => {
    const before = resourceLedgerSnapshot();
    const controller = new AbortController();
    controller.abort();
    await expect(
      createNativeThumbnail(new Blob(), { signal: controller.signal }),
    ).rejects.toSatisfy(
      (cause: unknown) => describeNativeEditingFailure(cause, 'thumbnail').retry === 'cancelled',
    );
    await expect(createNativeThumbnail(new Blob())).rejects.toSatisfy(
      (cause: unknown) =>
        describeNativeEditingFailure(cause, 'thumbnail').code === 'EDIT_RESOURCE_LIMIT',
    );
    expect(resourceLedgerSnapshot()).toEqual(before);
  });
});
