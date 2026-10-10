import { ASSET_IO_PROFILE } from '../../core3d/profile/assetIoProfile';

export type AssetIoOperation = 'import' | 'export' | 'download';
export interface AssetIoFailure {
  readonly code: string;
  readonly target: string;
  readonly reason: string;
  readonly action: string;
  readonly retry: 'after-fix' | 'after-wait' | 'after-preservation' | 'cancelled' | 'unknown';
}
/** Bounded recognition only. Never stringify an unknown object or forward its path/stack/message. */
function description(cause: unknown, limit = 4096): { text: string; name: string } {
  if (typeof cause === 'string') return { text: cause.slice(0, limit), name: '' };
  try {
    if (typeof DOMException !== 'undefined' && cause instanceof DOMException) {
      const read = (key: 'message' | 'name') =>
        Object.getOwnPropertyDescriptor(DOMException.prototype, key)?.get?.call(cause);
      const text: unknown = read('message'),
        name: unknown = read('name');
      return {
        text: typeof text === 'string' ? text.slice(0, limit) : '',
        name: typeof name === 'string' ? name.slice(0, 128) : '',
      };
    }
    if (cause instanceof Error) {
      const message = Object.getOwnPropertyDescriptor(cause, 'message');
      const name = Object.getOwnPropertyDescriptor(cause, 'name');
      return {
        text: typeof message?.value === 'string' ? message.value.slice(0, limit) : '',
        name: typeof name?.value === 'string' ? name.value.slice(0, 128) : '',
      };
    }
  } catch {
    /* Unrecognized exception objects do not own the error UI. */
  }
  return { text: '', name: '' };
}
const targets = {
  import: 'GLBの取込',
  export: 'ゲーム用ファイルの作成',
  download: '生成ファイルの保存',
} as const;
export function describeAssetIoFailure(
  cause: unknown,
  operation: AssetIoOperation,
): AssetIoFailure {
  const { text, name } = description(cause);
  const result = (
    code: string,
    reason: string,
    action: string,
    retry: AssetIoFailure['retry'],
  ): AssetIoFailure => Object.freeze({ code, target: targets[operation], reason, action, retry });
  if (
    name === 'AbortError' ||
    /\babort(?:ed)?\b|\bcancel(?:led|ed)?\b|中止しました|取り消しました/i.test(text)
  )
    return result(
      'IO_CANCELLED',
      '処理を中止しました。',
      '対象と確認内容を見直してから、必要な場合だけもう一度実行してください。',
      'cancelled',
    );
  if (
    name === 'QuotaExceededError' ||
    /quota|storage.*(?:full|unavailable)|保存領域|容量不足/i.test(text)
  )
    return result(
      'IO_STORAGE',
      '保存先の容量または保存領域を利用できません。',
      'このタブを閉じず、編集用バックアップを別ファイルへ保存してください。原本や保持版を無断で整理せず、保存先を確認してから再試行してください。',
      'after-preservation',
    );
  if (/unsupported required extension/i.test(text))
    return result(
      'IO_REQUIRED_EXTENSION',
      '対応していない必須拡張があります。',
      '元ファイルは保持し、対応する制作ツールで必須拡張を使わないGLBへ明示的に書き出し直してください。同じファイルの再試行だけでは対応できません。',
      'after-fix',
    );
  if (/external.*(?:uri|url)|data.*uri|remote.*(?:uri|url)/i.test(text))
    return result(
      'IO_EXTERNAL_REFERENCE',
      '外部URI参照、または埋込みbufferの不整合があります。',
      '必要な情報を埋め込んだGLBを選び直してください。外部URLの取得や安全制限の解除は行いません。',
      'after-fix',
    );
  if (/key time.*Float32|key times collapse/i.test(text))
    return result(
      'IO_ANIMATION',
      'キーの時刻が出力精度の範囲に収まらないか、近すぎる時刻が同じ値になります。',
      '対象clipの時刻と間隔を確認し、編集用バックアップを残してから明示的に修正してください。自動でキーをまとめることはありません。',
      'after-fix',
    );
  if (/Float32 overflow/i.test(text))
    return result(
      'IO_NUMERIC',
      '位置・変換などの数値が出力できる精度の範囲外です。',
      '極端に大きい数値や倍率を確認し、原本を残して修正してください。自動で値を切り詰めません。',
      'after-fix',
    );
  if (/exceeds|exceed|budget|profile|上限/i.test(text))
    return result(
      'IO_PROFILE_LIMIT',
      'ファイル・数量・画像寸法、または同時処理の見積りがこの版の上限を超えています。',
      '上限と対象の大きさを確認してください。使っていない表示や出力を閉じるか、原本を残して小さい派生ファイルを用意してから再試行してください。上限内の成功や実メモリの安全を保証する値ではありません。',
      'after-fix',
    );
  if (/sidecar|game\.json|provenance|ancestry/i.test(text))
    return result(
      'IO_SIDECAR',
      'GLBと付属情報の組合せ、または来歴情報が一致していません。',
      '同じ出力から作成されたGLBとgame.jsonの組合せを選び直してください。付属情報を無言で捨てて進めることはありません。',
      'after-fix',
    );
  if (/another.*(?:job|active)|already.*(?:running|active)|実行中/i.test(text))
    return result(
      'IO_BUSY',
      '別の入出力処理が実行中です。',
      '実行中の処理が終わるまで待つか、明示的に中止してから再試行してください。',
      'after-wait',
    );
  if (/key times|key time|interpolation|animation|clip/i.test(text))
    return result(
      'IO_ANIMATION',
      'キーの時刻・値・補間が出力または読込の条件を満たしていません。',
      '対象clipのキー時刻、重複、近すぎる時刻、補間方法を確認してください。修正する前に編集用バックアップを残してください。',
      'after-fix',
    );
  if (/skin|joint|weights?|inverse.?bind/i.test(text))
    return result(
      'IO_RIG',
      '骨・skin・重みの対応を確認できません。',
      '対象meshとjointの参照、選択scene、重み、bind状態を確認してから再試行してください。自動で重みを切り詰めたり骨を削除したりしません。',
      'after-fix',
    );
  if (/triangle|normal|face|explicit uv|empty mesh|empty project|accessor/i.test(text))
    return result(
      'IO_GEOMETRY',
      '形状・UV・normal、またはgeometryの参照が対応条件を満たしていません。',
      '対象部品の三角形、UV、法線と参照を確認してください。空の作品には形を追加し、原本を残して明示的に修正してから再試行してください。',
      'after-fix',
    );
  if (/image|texture|png|jpeg|mime/i.test(text))
    return result(
      'IO_IMAGE',
      '画像の形式・寸法・内容を確認できません。',
      '対応するPNG/JPEGと画像寸法、欠けた素材がないことを確認してください。元画像を保持したまま選び直してください。',
      'after-fix',
    );
  if (/blob|source.*hash|hash.*mismatch|original.*missing|missing.*source/i.test(text))
    return result(
      'IO_SOURCE',
      '必要な原本素材または内容の一致を確認できません。',
      '現在のタブと原本を保持し、正常な編集用バックアップや元ファイルを確認してください。欠けた素材を無言で省いて成功扱いにはしません。',
      'after-preservation',
    );
  if (/stale|revision|session|read.only|現在.*変|対象.*変|読み取り専用/i.test(text))
    return result(
      'IO_CHANGED_TARGET',
      '処理中に作品・revision・編集権限が変わりました。',
      '現在の対象と編集権限を確認し、表示と損失の確認をやり直してから再実行してください。古い確認を自動的に再利用しません。',
      'after-fix',
    );
  if (/worker|chunk|dynamically imported|module.*load/i.test(text))
    return result(
      'IO_WORKER',
      '処理用の機能を準備できないか、応答を確認できませんでした。',
      '編集用バックアップを残し、通信と動作環境を確認してください。必要な場合だけ保存後に明示的に再読み込みして再試行してください。',
      'after-preservation',
    );
  if (name === 'NotReadableError' || /read.*file|file.*read|読み取れません/i.test(text))
    return result(
      'IO_FILE_READ',
      '選択したファイルを読み取れませんでした。',
      '元ファイルが端末に保存されていることを確認し、同じファイルを選び直してください。',
      'after-fix',
    );
  if (/unsupported|source.only|shear|projective/i.test(text))
    return result(
      'IO_UNSUPPORTED',
      'この版で編集・変換できない表現が含まれています。',
      '対応範囲を確認し、原本を保持した別の派生GLBを用意してください。同じファイルの再試行だけでは対応できません。',
      'after-fix',
    );
  if (/invalid|malformed|truncated|duplicate|unsafe|不正|破損/i.test(text))
    return result(
      'IO_FORMAT',
      'ファイルの構造・宣言・参照が不正、または破損しています。',
      '正しいGLBと付属情報を選び直すか、元の制作データから書き出し直してください。修正前の原本は保持してください。',
      'after-fix',
    );
  return result(
    'IO_UNKNOWN',
    '原因を特定できず、処理を完了できませんでした。',
    '現在の作品と原本を保持してください。編集用バックアップを残し、対象と手順を確認してから再試行してください。内部例外の本文やパスはこの案内に転記しません。',
    'unknown',
  );
}
export function formatAssetIoFailure(cause: unknown, operation: AssetIoOperation): string {
  const result = describeAssetIoFailure(cause, operation);
  return `${result.target}: ${result.reason} ${result.action} [${result.code}]`;
}

/** Keep the existing explicit-loss request bounded; never grant loss approval here. */
export function readAssetIoLossRequest(cause: unknown): string[] | null {
  const prefix = 'Source-only features require explicit loss approval: ';
  const maxLosses = ASSET_IO_PROFILE.extensionDeclarations + 32;
  const maxMessage = prefix.length + 2 + maxLosses * (ASSET_IO_PROFILE.extensionNameChars * 6 + 3);
  const { text } = description(cause, maxMessage + 1);
  if (!text.startsWith(prefix) || text.length > maxMessage) return null;
  let losses: unknown;
  try {
    losses = JSON.parse(text.slice(prefix.length));
  } catch {
    return null;
  }
  if (
    !Array.isArray(losses) ||
    !losses.length ||
    losses.length > maxLosses ||
    losses.some(
      (loss) =>
        typeof loss !== 'string' ||
        !loss.length ||
        loss.length > ASSET_IO_PROFILE.extensionNameChars,
    ) ||
    new Set(losses).size !== losses.length
  )
    return null;
  return losses;
}
