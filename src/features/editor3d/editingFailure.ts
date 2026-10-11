import {
  findNativeDisplayStatusMessage,
  findNativeEditingMessage,
  findNativeMotionStatusMessage,
  type NativeEditingMessageCode,
} from './editingFailureMessages';

export type NativeEditingTarget =
  | 'authoring'
  | 'assembly'
  | 'texture'
  | 'rig'
  | 'animation'
  | 'clone'
  | 'deletion'
  | 'rigid'
  | 'game'
  | 'viewport'
  | 'inspection'
  | 'transform'
  | 'storage'
  | 'library'
  | 'thumbnail'
  | 'quality';
export type NativeEditingRetry =
  'after-fix' | 'after-wait' | 'after-preservation' | 'cancelled' | 'unknown';
export interface NativeEditingFailure {
  readonly code: string;
  readonly target: string;
  readonly reason: string;
  readonly action: string;
  readonly retry: NativeEditingRetry;
}

/** Bounded recognition only; do not stringify unknown values or invoke their getters. */
function description(cause: unknown): { text: string; name: string } {
  const limit = 4096;
  if (typeof cause === 'string') return { text: cause.slice(0, limit), name: '' };
  try {
    if (typeof DOMException !== 'undefined' && cause instanceof DOMException) {
      // Native accessors bypass an exception instance's arbitrary message/name getters.
      const read = (key: 'message' | 'name'): unknown =>
        Object.getOwnPropertyDescriptor(DOMException.prototype, key)?.get?.call(cause);
      const text = read('message'),
        name = read('name');
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
    // Proxies or foreign exception objects cannot take over the error UI.
  }
  return { text: '', name: '' };
}

const targets = {
  authoring: '形状・材質の編集',
  assembly: '部品の組立',
  texture: '画像・色調の編集',
  rig: '骨と重みの編集',
  animation: 'アニメーションの編集',
  clone: '階層の複製',
  deletion: '部品の削除',
  rigid: 'rigid部品の骨割当',
  game: 'ゲーム向け情報の編集',
  viewport: '3D表示',
  inspection: 'カメラ・表示の検査',
  transform: '部品の変形',
  storage: '作品の保存・復旧',
  library: '作品一覧・復旧候補',
  thumbnail: '派生サムネイル',
  quality: '作品の品質検査',
} as const;

type Guidance = readonly [reason: string, action: string, retry: NativeEditingRetry];
const guidance = {
  EDIT_CAMERA_INPUT: [
    'カメラの位置・注視点・投影設定を確認してください。',
    '位置と注視点には異なる有限の座標を指定し、画角は0度より大きく180度未満、平行投影の高さは0より大きくしてください。値を確認してから明示的に適用してください。',
    'after-fix',
  ],
  EDIT_VIEWPORT_UNAVAILABLE: [
    'GPUによる3D表示を利用できないか、表示が中断しています。',
    '現在のタブと作品を保持し、保存または編集用バックアップを先に確認してください。WebGL2の利用状況と表示状態を確認し、必要な場合だけ表示を再開してください。',
    'after-preservation',
  ],
  EDIT_VIEWPORT_RENDER: [
    '3D表示の準備・描画の完了を確認できませんでした。',
    '現在のタブと原本を保持し、保存または編集用バックアップを確認してください。表示状態を確認し、必要な場合だけ表示を再開してください。取り込み候補は描画を確認してから保存を判断してください。',
    'after-preservation',
  ],
  EDIT_VIEWPORT_PROFILE: [
    '形状・画像・骨の構成が、この3D表示の対応範囲を満たしていません。',
    '原本と編集用バックアップを保持し、品質検査で形状・画像・骨の対応範囲を確認してください。必要な修正は別コピーで行い、元の情報を自動で省略しないでください。',
    'after-preservation',
  ],
  EDIT_VIEWPORT_STATE: [
    'この操作に必要な3D表示または表示接続を利用できません。',
    '作品と実行中の操作を確認し、3D表示を明示的に再開してから操作してください。対応しない表示接続では保存・バックアップを先に確認してください。',
    'after-fix',
  ],
  EDIT_VIEWPORT_REVISION: [
    '保存済み・現在編集中・表示中の内容が一致していることを確認できません。',
    '現在のタブを閉じず、未保存の変更を保存するか編集用バックアップを別ファイルに保持してください。対象と保存結果を確認し、同じ版を表示してから休止・再開・画像取得を明示的に操作してください。',
    'after-preservation',
  ],
  EDIT_PNG_CAPTURE: [
    '表示画像をPNGとして取得できませんでした。',
    '現在の作品を保存するか編集用バックアップを残し、表示と画像取得の状態を確認してください。PNGは編集用バックアップではありません。必要な場合だけ取得を再操作してください。',
    'after-preservation',
  ],
  EDIT_TRANSFORM_SHEAR: [
    'この変形にはせん断が必要です。向きや倍率、world/localの設定を見直してください。',
    '原本を保持し、親と部品の回転・倍率、world/localの設定を確認してください。表現できる変形に修正し、プレビューを確認してから明示的に適用してください。',
    'after-fix',
  ],
  EDIT_TRANSFORM_INPUT: [
    '有限の数値を入力してください。倍率0や極端に小さい値は適用できません。',
    '各軸の値を確認し、有限の数値と0にならない倍率に修正してください。極端な座標や倍率を避け、プレビューを確認してから明示的に適用してください。',
    'after-fix',
  ],
  EDIT_TRANSFORM_HIERARCHY: [
    '親とその子孫を同時に変形できません。選択を見直してください。',
    '同じ階層の親と子孫を同時に選ばず、変形する先頭だけを選び直してください。対象とプレビューを確認してから明示的に適用してください。',
    'after-fix',
  ],
  EDIT_TRANSFORM_SELECTION: [
    '変形する部品とアクティブな部品を選択してください。',
    '重複しない部品を選び、その中から基準になるアクティブな部品を指定してください。表示・ロック状態を確認して変形を開始し直してください。',
    'after-fix',
  ],
  EDIT_STORAGE_UNAVAILABLE: [
    'ブラウザーの保存領域に接続できません。',
    '現在のタブを閉じず、未保存の変更を編集用バックアップとして別ファイルに保持してください。保存領域の利用設定と接続状態を確認し、原本のデータベースを削除せず、必要な場合だけ接続を再操作してください。',
    'after-preservation',
  ],
  EDIT_STORAGE_BLOCKED: [
    '別のタブの使用状況により、保存領域を開けません。',
    '未保存のタブを閉じず、各タブの編集内容を保存するか編集用バックアップを別ファイルに保持してください。他のタブの処理が終わるのを待ち、保存領域を確認してから明示的に接続を再操作してください。',
    'after-wait',
  ],
  EDIT_STORAGE_CONFLICT: [
    '保存先の版・編集権・作品の状態が変わり、操作を確定できません。',
    '未保存のタブと原本を保持し、現在の内容を編集用バックアップとして別ファイルに残してください。他のタブの編集権・最新の保存版・ゴミ箱の状態を確認し、必要なら別コピーとして復旧してください。',
    'after-preservation',
  ],
  EDIT_STORAGE_INTEGRITY: [
    '保存済みの作品・保持版・原本の整合を確認できません。',
    '現在のタブを閉じず、取り出せる編集用バックアップと既存の正常な控えを保持してください。元のデータベースや保持版を削除・上書きせず、確認できるバックアップから別コピーとして復旧してください。',
    'after-preservation',
  ],
  EDIT_BACKUP_READ: [
    '選択した編集用バックアップを読み取れませんでした。',
    '元ファイルと現在のタブを保持し、バックアップが端末に保存されていることを確認してください。現在の変更を別ファイルに保持したうえで、対応する.cas3dprojファイルを選び直してください。',
    'after-fix',
  ],
  EDIT_STORAGE_BACKUP: [
    '編集用バックアップの形式を確認してください。',
    '元ファイルと現在の作品を保持し、対応する.cas3dprojファイルを選び直してください。正常な控えを確認してから、別コピーとして復旧してください。',
    'after-fix',
  ],
  EDIT_LIBRARY_CURRENT: [
    '開いている作品は、この一覧操作の対象にできません。',
    '現在の内容を保存するか編集用バックアップを別ファイルに保持し、保存結果を確認してください。未保存のタブを閉じず、保存できた作品を閉じた後に一覧と操作対象を確認し直してください。',
    'after-preservation',
  ],
  EDIT_THUMBNAIL_CONFLICT: [
    '別の操作で派生サムネイルの版または一覧が変わりました。',
    '元の作品を保持し、派生サムネイルの一覧と現在の保存版を読み直してください。古い確認を再利用せず、作成や整理が必要な場合だけ対象を再確認して明示的に操作してください。',
    'after-fix',
  ],
  EDIT_THUMBNAIL_INTEGRITY: [
    '派生サムネイルの保存形式または画像の整合を確認できません。',
    '元の作品と保存領域を保持し、派生サムネイルの確認を止めて保存・バックアップを確認してください。元のデータベースや未確認のcacheを削除せず、正常な保存版と一覧を確認してください。',
    'after-preservation',
  ],
  EDIT_THUMBNAIL_TIMEOUT: [
    '派生サムネイルの保存領域の処理が時間内に完了しませんでした。',
    '現在のタブと元の作品を保持し、保存・バックアップを先に確認してください。他の処理の終了を待ち、一覧と操作結果を読み直してから、必要な場合だけ明示的に再操作してください。',
    'after-wait',
  ],
  EDIT_THUMBNAIL_LIMIT: [
    '派生サムネイルの件数または容量が上限に達しています。',
    '元の作品を保存するか編集用バックアップを別ファイルに保持し、派生サムネイル一覧を確認してください。整理が必要な場合だけ対象を確認して明示的に行い、元の作品の保存領域は削除しないでください。',
    'after-preservation',
  ],
  EDIT_THUMBNAIL_INPUT: [
    '派生サムネイルの画像・寸法・保存対象を確認できません。',
    '元の作品を保持し、保存済みの同じ版を表示してからサムネイルを作成し直してください。元の画像やcacheの記録を書き換えず、対応するPNGと寸法を確認してください。',
    'after-fix',
  ],
  EDIT_THUMBNAIL_IMAGE: [
    'この環境で派生サムネイルの画像を生成できませんでした。',
    '元の作品を保持し、ブラウザーの画像処理機能と表示状態を確認してください。必要に応じてPNG保存を利用し、編集用バックアップは別に保持してください。',
    'after-fix',
  ],
  EDIT_THUMBNAIL_CLOSED: [
    '派生サムネイルの接続または画像参照が終了しています。',
    '元の作品を保持し、サムネイル一覧を明示的に読み直してください。現在の保存版と対象を再確認してから、必要な場合だけ再操作してください。',
    'after-fix',
  ],
  EDIT_QUALITY_WORKER: [
    '品質検査の処理または応答を確認できませんでした。',
    '現在の作品と原本を保持し、保存・バックアップと検査対象の版を確認してください。他の処理が終わってから、必要な場合だけ現在の版を再検査してください。結果がない状態を検査合格として扱わないでください。',
    'after-fix',
  ],
  EDIT_CLONE_SELECTION: [
    '複製する階層の先頭を1つ選択してください。',
    '複製したい子階層を含む先頭を1つ選び、部品・依存情報・追加されるtrackの確認内容を読み直してから、必要な場合だけ複製を確定してください。',
    'after-fix',
  ],
  EDIT_CLONE_ID: [
    '複製に使うIDの形式または重複を確認できません。',
    '現在の複製確認を閉じ、新しい複製内容を確認し直してください。既存のIDを書き換えず、対象と依存情報を確認してから、必要な場合だけ複製を確定してください。',
    'after-fix',
  ],
  EDIT_CLONE_DEPENDENCY: [
    '複製するskinが使用する骨が、選択した階層の外にあります。',
    'skinが使う全ての骨と部品を含む先頭を選び直し、複製範囲と依存情報を再確認してください。元のskin・骨・アニメーションを保持し、確認できた範囲だけ複製を確定してください。',
    'after-fix',
  ],
  EDIT_GAME_ID: [
    'ゲーム用IDの文字または長さが対応する形式を満たしていません。',
    'asset IDは英数字で始まる1〜128文字の英数字・ハイフン・下線に修正してください。anchorとcolliderのIDは重複させず、対象を選び直してから再操作してください。',
    'after-fix',
  ],
  EDIT_GAME_NAME: [
    'ゲーム向け情報の名前・種類・用途の入力を確認してください。',
    'asset種類とanchor・collider名は空白だけにせず入力してください。名前・種類・用途は4096文字以内にしてから再操作してください。',
    'after-fix',
  ],
  EDIT_GAME_INPUT: [
    'ゲーム向け情報の数値が対応する形式や範囲を満たしていません。',
    '案内された数値欄を空欄にせず、有限の数値を入力してください。受渡し単位・倍率・寸法・半径は0より大きく、colliderの円柱部の長さは0以上にしてください。',
    'after-fix',
  ],
  EDIT_GAME_COORDINATES: [
    '受渡し単位または前方向が対応する設定を満たしていません。',
    '受渡し単位には0より大きい有限の数値を入力し、前方向は+Z・-Z・+X・-Xから選び直してください。これらは受渡し用の情報で、形状そのものは変換しません。',
    'after-fix',
  ],
  EDIT_GAME_ORIGIN: [
    '受渡し原点の決め方または計測対象を確認できません。',
    '原点の決め方をcustom・feet・centerから選び直してください。feetとcenterには計測できるmeshが必要です。数値指定する場合はcustomを選び、有限のX・Y・Zを入力してください。',
    'after-fix',
  ],
  EDIT_GAME_SELECTION: [
    '操作するanchor・colliderまたは追従先が見つかりません。',
    '現在のanchor・colliderと追従先の部品・骨を確認し、対象を選び直してください。作品が変わった場合は現在値を読み直してから再操作してください。',
    'after-fix',
  ],
  EDIT_GAME_TRANSFORM: [
    'anchor・colliderの位置・回転・倍率が対応する形式を満たしていません。',
    '位置と回転には有限の数値、各倍率には0より大きい有限の数値を入力してください。回転の単位クォータニオンと追従先に対するlocal値を確認してから再操作してください。',
    'after-fix',
  ],
  EDIT_GAME_COLLIDER: [
    'colliderの形状または寸法が対応する設定を満たしていません。',
    '形状をbox・sphere・capsuleから選び直してください。各寸法と半径には0より大きい有限の数値、円柱部の長さには0以上の有限の数値を入力してください。',
    'after-fix',
  ],
  EDIT_GAME_LIMIT: [
    'anchorまたはcolliderの件数が、この版の上限を超えています。',
    '現在の作品をバックアップし、anchorとcolliderがそれぞれ256件以内になるよう追加内容を見直してください。既存の情報を勝手に削除せず、必要な場合は別の作品で作業してください。',
    'after-preservation',
  ],
  EDIT_INPUT: [
    '入力値が編集できる範囲や形式を満たしていません。',
    '空欄、数値の範囲、名前と選択した設定を確認し、必要な値を修正してから再操作してください。',
    'after-fix',
  ],
  EDIT_MATERIAL_RANGE: [
    '材質の色・不透明度・金属度・粗さは0〜1で入力してください。',
    '材質の各数値を確認し、0〜1の範囲に修正してから再操作してください。',
    'after-fix',
  ],
  EDIT_MATERIAL_INPUT: [
    '材質の透明方式または両面表示の設定が不正です。',
    '画面で対応する透明方式と両面表示を選び直してから再操作してください。',
    'after-fix',
  ],
  EDIT_CHANGED_TARGET: [
    '処理中に作品・選択対象・編集状態が変わりました。',
    '現在の作品と選択対象を確認し直してから再操作してください。古い確認内容を自動的に再利用しません。',
    'after-fix',
  ],
  EDIT_COMPOSITION: [
    '日本語の変換を確定してから適用してください。',
    '入力中の変換を確定し、値と対象を確認してから再操作してください。',
    'after-fix',
  ],
  EDIT_RESOURCE_LIMIT: [
    '編集データ・画像・履歴、または同時処理の見積りがこの版の上限を超えています。',
    '現在の内容をバックアップし、不要な表示や実行中の画像処理を閉じるか待ってください。原本と履歴を保持したまま、対象の大きさや設定を見直してください。見積りは実メモリの安全を保証しません。',
    'after-preservation',
  ],
  EDIT_SELECTION: [
    '操作に必要な対象または選択の組合せが一致していません。',
    '現在の部品・面・材質と親子関係を確認し、案内に合う対象を選び直してから再操作してください。',
    'after-fix',
  ],
  EDIT_GEOMETRY: [
    '形状・面・法線・階層が、この編集の対応条件を満たしていません。',
    '対象の形状と階層を確認し、原本を保持した複製で必要な箇所を修正してから再操作してください。',
    'after-fix',
  ],
  EDIT_RIG: [
    'リグ・アニメーションとの対応により、この形状や階層の編集はできません。',
    '原本とリグ・アニメーションを保持し、対象と対応範囲を確認してください。制約を無視して再試行せず、必要に応じて別の複製で作業してください。',
    'after-fix',
  ],
  EDIT_RIG_NAME: [
    '骨の名前が空欄・空白だけ、または長すぎます。',
    '空白だけでない骨の名前を入力し、長すぎる場合は短くしてから再操作してください。',
    'after-fix',
  ],
  EDIT_WEIGHT_ZERO: [
    '重みが全て0のため、正規化できません。',
    '選択した頂点の重みに1つ以上の正の値を指定し、対象の骨を確認してから、必要な場合だけ正規化を選んで再操作してください。',
    'after-fix',
  ],
  EDIT_WEIGHT_INPUT: [
    '重みには0以上の有限な数値を入力してください。',
    '選択した頂点の各重みを確認し、空欄・負の数・大きすぎる数値を修正してから再操作してください。',
    'after-fix',
  ],
  EDIT_WEIGHT_SUM: [
    '重みは0以上で、頂点ごとの合計を1にする必要があります。',
    '各頂点の重みを確認して合計を1にしてください。正規化する場合は1つ以上の正の値を指定し、正規化を明示的に選んでください。',
    'after-fix',
  ],
  EDIT_RIG_SELECTION: [
    '選択した骨・部品・頂点・スキンの対応を確認できません。',
    '現在の対象を選び直し、骨・頂点の重複と、スキンに登録済みの骨・頂点との対応を確認してから再操作してください。',
    'after-fix',
  ],
  EDIT_RIG_BIND: [
    '骨・頂点・スキンの割当が、この操作の条件を満たしていません。',
    'メッシュとスキンの対応、全頂点への割当、頂点ごとの重複しない1〜4個の骨と同数の重みを確認してください。既存の割当を保持し、再バインドが必要な場合は明示的な再バインド操作を使ってください。',
    'after-fix',
  ],
  EDIT_RIG_DEPENDENCY: [
    '子・スキン・アニメーションとの依存関係により、この骨や部品の変更はできません。',
    '原本・子・スキン・アニメーションを保持し、参照関係と対応する編集範囲を確認してください。必要な変換が未対応の場合は、元の作品を保持した複製で作業してください。',
    'after-fix',
  ],
  EDIT_ANIMATION_NAME: [
    'クリップの名前が空欄・空白だけ、または長すぎます。',
    '空白だけでないクリップ名を入力し、長すぎる場合は短くしてから再操作してください。',
    'after-fix',
  ],
  EDIT_ANIMATION_TIME: [
    'キー時刻は0秒〜クリップの長さの範囲内で、同じ対象・属性の他のキーと重複しない値にしてください。',
    'クリップの長さと同じ対象・属性の既存キーを確認し、範囲内の重複しない時刻に修正してください。長さを短くする場合も、既存キーの時刻を確認してください。',
    'after-fix',
  ],
  EDIT_ANIMATION_INTERPOLATION: [
    '追加するキーの補間方式が、既存のトラックと一致していません。',
    '既存トラックと同じ補間方式を選んでください。方式を変える場合は、対象を確認して「trackの補間を適用」を明示的に操作してからキーを追加してください。',
    'after-fix',
  ],
  EDIT_ANIMATION_SELECTION: [
    '操作するクリップ・キー・トラックが見つからないか、対象が一致していません。',
    '現在のクリップ、キー対象、属性とキー一覧を確認し、対象を選び直してから再操作してください。',
    'after-fix',
  ],
  EDIT_ANIMATION_INPUT: [
    'クリップの長さ・再生設定・キーの値が、対応する形式や範囲を満たしていません。',
    '長さには0以上の有限な秒数を入力し、対応する属性と補間方式を選んでください。キー値の個数と範囲、回転の単位クォータニオンを確認してから再操作してください。',
    'after-fix',
  ],
  EDIT_PREVIEW_UNAVAILABLE: [
    'ポーズやアニメーションの表示確認を開始・更新できない状態です。',
    '画像取得などの処理が終わったことと、3D表示・編集権・選択対象を確認してください。閉じた作品は保存済みの作品やバックアップを確認して開き直し、表示確認を明示的に再開してください。',
    'after-fix',
  ],
  EDIT_UNAVAILABLE: [
    '現在の状態では編集できません。',
    '編集権、対象のロック、実行中の操作と表示確認を確認し、編集できる状態になってから対象を選び直してください。',
    'after-fix',
  ],
  EDIT_SHARED: [
    '選択した部品は他の部品とメッシュを共有しています。',
    '影響する部品を確認し、独立した複製を明示的に作成してから編集してください。',
    'after-fix',
  ],
  EDIT_UV: [
    '画像を使う面に、有効なUVが必要です。',
    '対象の全ての面のUVを確認し、UV付きの基本形や適切な複製を選んでから再操作してください。',
    'after-fix',
  ],
  EDIT_TRANSFORM: [
    '位置や形状を保ったまま、この変換を表現できません。',
    '親の回転・倍率と位置の保持方法を確認してください。原本を保持し、対応する設定へ変更してから再操作してください。',
    'after-fix',
  ],
  EDIT_IMAGE_FORMAT: [
    '画像の形式・寸法・構造が対応条件を満たしていません。',
    '元画像を保持し、向きと寸法を確認した静止PNG/JPEGを選び直してください。',
    'after-fix',
  ],
  EDIT_SOURCE: [
    '必要な画像原本・参照・来歴の対応を確認できません。',
    '現在のタブと原本を保持し、正常なバックアップと画像の来歴を確認してください。欠けた画像を省いたり原本を上書きしたりせず、対象を選び直してください。',
    'after-preservation',
  ],
  EDIT_LOCKED: [
    '編集ロック中の部品または共有資源に影響します。',
    '対象と共有先のロックを確認してください。編集する場合だけ、対象のロックを明示的に解除してから再操作してください。',
    'after-fix',
  ],
  EDIT_IMAGE_DECODE: [
    '画像の読み取り・画素処理・派生画像の生成を確認できませんでした。',
    '元画像と現在の作品を保持し、対応するPNG/JPEGとブラウザの画像処理機能を確認してください。必要な場合はバックアップ後に再操作してください。',
    'after-preservation',
  ],
  EDIT_UNSAVED: [
    '未保存の変更があります。',
    '現在のタブを閉じず、保存を再試行するか編集用バックアップを別ファイルに保持してください。',
    'after-preservation',
  ],
  EDIT_BUSY: [
    '別の編集または画像処理が実行中です。',
    '実行中の処理が終わるまで待つか、明示的に取り消してから再操作してください。',
    'after-wait',
  ],
  EDIT_READ_ONLY: [
    'このプロジェクトは読み取り専用です。',
    '現在のタブと内容を保持し、編集権限と他のタブの利用状況を確認してください。編集できる状態になってから対象を選び直してください。',
    'after-preservation',
  ],
  EDIT_CLOSED: [
    'このプロジェクトの編集セッションは閉じられています。',
    '保存済みの作品またはバックアップを確認して開き直し、現在の対象を選び直してください。',
    'after-fix',
  ],
  EDIT_HISTORY_LIMIT: [
    '履歴を含む編集データがUndo予算の上限を超えています。',
    '現在の内容をバックアップしてください。バックアップにUndo/Redo履歴は含まれません。履歴を勝手に整理せず、操作の大きさを見直してください。',
    'after-preservation',
  ],
  EDIT_CANCELLED: [
    '処理を取り消しました。',
    '確定済みの内容と対象を確認し、必要な場合だけ再操作してください。',
    'cancelled',
  ],
  EDIT_STORAGE: [
    '保存領域を利用できないか、容量が不足しています。',
    '現在のタブを閉じず、編集用バックアップを別ファイルに保持してください。原本や保持版を整理せず、保存先を確認してください。',
    'after-preservation',
  ],
  EDIT_FILE_READ: [
    '選択した画像ファイルを読み取れませんでした。',
    '元画像が端末に保存されていることを確認し、同じファイルを選び直してください。',
    'after-fix',
  ],
  EDIT_DATA: [
    '編集データの構造・参照・数値の整合を確認できません。',
    '現在の作品と原本を保持し、対象と入力値を確認してください。再び起きる場合はバックアップを残して操作手順を確認してください。',
    'after-preservation',
  ],
  EDIT_UNKNOWN: [
    '原因を特定できず、操作の完了を確認できませんでした。',
    '現在の作品と原本を保持し、編集用バックアップを残してください。対象と結果を確認したうえで、必要な場合だけ再操作してください。',
    'unknown',
  ],
} as const satisfies Record<NativeEditingMessageCode, Guidance> & Record<string, Guidance>;
type FailureCode = keyof typeof guidance;

/** Target-specific instructions do not change shared classifications or validation. */
function correctiveAction(target: NativeEditingTarget, code: FailureCode): string {
  if (target === 'clone' && code === 'EDIT_CHANGED_TARGET')
    return '現在の複製確認を閉じ、先頭・子階層・依存情報・追加されるtrackを確認し直してください。古い確認内容を再利用せず、必要な場合だけ複製を確定してください。';
  if (target === 'deletion') {
    if (code === 'EDIT_CHANGED_TARGET' || code === 'EDIT_SELECTION')
      return '削除する部品を選び直し、子階層を含めるか、関連するtrack・anchor・colliderと保持される資源を確認し直してください。古い確認内容を再利用せず、削除する範囲だけを明示的に確定してください。';
    if (code === 'EDIT_RIG')
      return '残すskinが使用する骨は削除対象から外してください。元のskin・骨・部品を保持し、削除範囲と依存情報を確認し直してから、必要な場合だけ削除を確定してください。';
  }
  if (target === 'rigid') {
    if (code === 'EDIT_RIG_SELECTION' || code === 'EDIT_SELECTION')
      return '子のないメッシュ部品と、メッシュを持たない割当先の骨を選び直してください。restのworld位置とlocal値のどちらを保持するか、現在の親と割当結果を確認してから明示的に適用してください。';
    if (code === 'EDIT_RIG_DEPENDENCY')
      return 'skinとして使う部品や骨、部品と元の親のアニメーションを保持してください。smooth skinの部品はrigid割当できません。既存の動きの変換が必要な場合は適用せず、直前の割当を取り消す場合だけ元に戻す操作を使ってください。';
  }
  if (['storage', 'library', 'thumbnail'].includes(target)) {
    if (code === 'EDIT_CANCELLED')
      return '現在のタブを閉じず、保存先と現在の編集結果を確認してください。未保存の変更は編集用バックアップを別ファイルに保持し、必要な場合だけ操作対象を確認して再操作してください。';
    if (code === 'EDIT_READ_ONLY')
      return '現在のタブを閉じず、未保存の内容を編集用バックアップとして別ファイルに保持してください。他のタブの編集権と保存版を確認し、旧形式は元の保存領域を上書きせず別コピーとして移行してください。';
    if (code === 'EDIT_CHANGED_TARGET')
      return '現在のタブと未保存の内容を保持し、保存または編集用バックアップを先に確認してください。作品一覧・復旧候補・現在の版を読み直し、対象を再確認してから必要な場合だけ操作してください。';
  }
  if (target === 'game' && code === 'EDIT_SELECTION') return guidance.EDIT_GAME_SELECTION[1];
  if (target === 'game' && code === 'EDIT_INPUT') return guidance.EDIT_GAME_INPUT[1];
  if (target === 'game' && code === 'EDIT_CHANGED_TARGET')
    return '入力内容と現在の作品を確認してください。必要な入力を控えたうえで、対象の「現在値を読む」から値を読み直し、修正内容を確認してから再操作してください。';
  return guidance[code][1];
}

export function describeNativeEditingFailure(
  cause: unknown,
  target: NativeEditingTarget,
): NativeEditingFailure {
  const { text, name } = description(cause);
  const result = (code: FailureCode, reason: string = guidance[code][0]): NativeEditingFailure =>
    Object.freeze({
      code,
      target: targets[target],
      reason,
      // A UI callback can throw after commit. Never promise all failures left the project unchanged.
      action: `現在の編集結果を確認してください。${correctiveAction(target, code)}`,
      retry: guidance[code][2],
    });
  const authored = findNativeEditingMessage(text);
  if (authored) return result(authored.code, authored.reason);
  if (
    name === 'AbortError' ||
    /^(?:Operation |Image operation )?(?:aborted|cancelled)$/i.test(text)
  )
    return result('EDIT_CANCELLED');
  if (name === 'QuotaExceededError')
    return result(target === 'thumbnail' ? 'EDIT_THUMBNAIL_LIMIT' : 'EDIT_STORAGE');
  if (name === 'NotReadableError')
    return result(
      target === 'storage' || target === 'library' ? 'EDIT_BACKUP_READ' : 'EDIT_FILE_READ',
    );
  if (name === 'HistoryBudgetError') return result('EDIT_HISTORY_LIMIT');

  if (name === 'UnsavedProjectError') return result('EDIT_UNSAVED');
  if (
    name === 'StorageConflictError' ||
    /^3D storage conflict: (?:writer|revision|exists|trashed)\b/.test(text)
  )
    return result('EDIT_STORAGE_CONFLICT');
  if (name === 'StorageIntegrityError') return result('EDIT_STORAGE_INTEGRITY');
  if (
    name === 'ThumbnailCacheConflictError' ||
    /^Thumbnail cache changed \((?:token|revision|generation)\)/.test(text)
  )
    return result('EDIT_THUMBNAIL_CONFLICT');
  if (
    name === 'ThumbnailCacheIntegrityError' ||
    /^Thumbnail cache is unrecognized or damaged:/.test(text)
  )
    return result('EDIT_THUMBNAIL_INTEGRITY');
  if (
    /^Thumbnail cache (?:transaction|opening) timed out\b/.test(text) ||
    (target === 'thumbnail' && name === 'TimeoutError')
  )
    return result('EDIT_THUMBNAIL_TIMEOUT');
  if (/^Another tab is blocking (?:3D storage|thumbnail cache) opening\b/.test(text))
    return result('EDIT_STORAGE_BLOCKED');
  if (
    /^(?:IndexedDB is unavailable|IndexedDB request failed|Could not open (?:3D storage|thumbnail cache))\b/.test(
      text,
    )
  )
    return result('EDIT_STORAGE_UNAVAILABLE');
  if (['storage', 'library', 'thumbnail'].includes(target)) {
    if (name === 'ConstraintError') return result('EDIT_STORAGE_CONFLICT');
    if (
      [
        'SecurityError',
        'NotAllowedError',
        'InvalidStateError',
        'VersionError',
        'UnknownError',
        'NotFoundError',
        'TransactionInactiveError',
      ].includes(name)
    )
      return result('EDIT_STORAGE_UNAVAILABLE');
  }
  if (/^Thumbnail cache is full;/.test(text)) return result('EDIT_THUMBNAIL_LIMIT');
  if (/^Thumbnail cache is closed\b/.test(text)) return result('EDIT_THUMBNAIL_CLOSED');
  if (
    /^(?:Expected a plain thumbnail record|Unexpected thumbnail record fields|Thumbnail fields must be enumerable data properties|Thumbnail bytes must be a Uint8Array|Thumbnail PNG exceeds|Invalid thumbnail (?:project|metadata|cleanup generation)|Thumbnail must have a PNG signature|Thumbnail put requires|Thumbnail canCommit must be a synchronous function|Thumbnail transaction completed before its operation)\b/.test(
      text,
    )
  )
    return result('EDIT_THUMBNAIL_INPUT');
  if (/^Another asset I\/O job is active\b/.test(text)) return result('EDIT_BUSY');
  if (/^(?:Asset worker failed;|Invalid (?:asset worker|worker) response\b)/.test(text))
    return result('EDIT_QUALITY_WORKER');
  if (
    /^(?:Inspection (?:JSON|blobs|estimate|report)|Worker peak estimate|Asset I\/O reservation) exceeds cas3d-basic-gltf2-v1\b/.test(
      text,
    )
  )
    return result('EDIT_RESOURCE_LIMIT');
  // These engine messages can carry caller IDs or exception suffixes. Return only fixed reasons.
  if (/^(?:WebGL2 (?:is unavailable\.|initialization failed:)|WebGL context lost;)/.test(text))
    return result('EDIT_VIEWPORT_UNAVAILABLE');
  if (
    /^(?:(?:Native (?:editing|scene|camera|controls) construction|Native source snapshot|Native rendering|View construction|Render target allocation) failed:|(?:Viewport|Camera) (?:construction|restoration) failed\.)/.test(
      text,
    )
  )
    return result('EDIT_VIEWPORT_RENDER');
  if (
    /^(?:Native compact-evaluation-0 (?:node count|geometry count|hierarchy depth|rendered triangle count) exceeded|Native unique texture pixel count exceeded|Render target budget exceeded|Skin joint count exceeds Uint16 indices)\b/.test(
      text,
    )
  )
    return result('EDIT_RESOURCE_LIMIT');
  if (/^Invalid canonical project:/.test(text)) return result('EDIT_DATA');
  if (
    /^(?:Invalid native skin:|This isolated native viewport does not support |Multiple skins on one mesh are unsupported\.|A joint with its own mesh needs an explicit joint-only conversion\.|Native texture dimensions are outside |(?:Geometry is|Corner attributes are|Node transforms are|Transformed geometry is) outside the finite Float32 evaluation profile\.)/.test(
      text,
    )
  )
    return result('EDIT_VIEWPORT_PROFILE');
  if (
    /^Native textures require (?:a prepared RGBA8 source for |an exact RGBA8 byte count\.)/.test(
      text,
    ) ||
    /^テクスチャの元画像が見つかりません: /.test(text)
  )
    return result('EDIT_SOURCE');
  if (/^Native textured faces require complete finite corner UV0 attributes\./.test(text))
    return result('EDIT_UV');
  if (
    /^(?:Viewport (?:is disposed\.|disposed\b|is not suspended\.)|(?:Camera (?:edits|presets|actions)|View options|Focus|PNG capture) require(?:s)? an active native viewport\.|A live canonical project is required\.)/.test(
      text,
    )
  )
    return result('EDIT_VIEWPORT_STATE');
  if (
    /^(?:GPU pause\/resume requires |The current project requires a matching saved revision and complete sources\.|PNG capture requires the displayed canonical revision\.|PNG capture became stale during encoding\.)/.test(
      text,
    )
  )
    return result('EDIT_VIEWPORT_REVISION');
  if (/^Complete reconstruction sources must be confirmed before GPU pause\/resume\./.test(text))
    return result('EDIT_SOURCE');
  if (/^(?:The native viewport could not render a PNG\.|Canvas PNG encoding failed\.)/.test(text))
    return result('EDIT_PNG_CAPTURE');
  if (
    /^(?:Finite ordered bounds and a valid perspective camera are required\.|Finite position\/target, 0 < field of view < 180, and a positive span are required\.|The camera requires a finite (?:position and a separate target|zoom range)\.|A finite screen-up vector is required\.|Screen-up must be nonzero and separate from the viewing direction\.|Camera (?:fit|clipping|projection) is outside the finite Float32 evaluation profile\.|The camera action is outside the finite Float32 evaluation profile\.|Unknown native camera (?:preset|action)\.)/.test(
      text,
    )
  )
    return result('EDIT_CAMERA_INPUT');
  if (/^Valid native shading, background, lighting and helper options are required\./.test(text))
    return result('EDIT_INPUT');
  if (
    /^The selected (?:node is hidden|canonical node is not present|node has no native geometry in its subtree)\./.test(
      text,
    )
  )
    return result('EDIT_SELECTION');
  if (
    /^(?:Error: )?(?:Game preview|Game helper geometry|Collider) exceeds Float32 range\b/.test(text)
  )
    return result('EDIT_VIEWPORT_PROFILE');
  if (target === 'transform') {
    if (/^Transform requires shear\b/i.test(text)) return result('EDIT_TRANSFORM_SHEAR');
    if (
      /^(?:Non-finite transform|Singular (?:or non-finite|parent) transform|A finite three-component delta is required)\b/i.test(
        text,
      )
    )
      return result('EDIT_TRANSFORM_INPUT');
    if (/^Parent and descendant selection is ambiguous\b/i.test(text))
      return result('EDIT_TRANSFORM_HIERARCHY');
    if (
      /^(?:A unique selection and selected active pivot are required|Missing selected node|Hidden objects cannot start viewport transforms)\b/i.test(
        text,
      )
    )
      return result('EDIT_TRANSFORM_SELECTION');
    if (/^A selected node, ancestor or affected descendant is locked\b/i.test(text))
      return result('EDIT_LOCKED');
    if (/^Invalid transform options\b/i.test(text)) return result('EDIT_INPUT');
    if (/^Translation delta is below coordinate precision\b/i.test(text))
      return result('EDIT_TRANSFORM');
    if (/^Cyclic selection hierarchy\b/i.test(text)) return result('EDIT_GEOMETRY');
  }

  // Game-specific validators have fixed wording. Never return their arguments.
  if (/^Invalid origin mode\b/i.test(text)) return result('EDIT_GAME_ORIGIN');
  if (/^Invalid game coordinates\b/i.test(text)) return result('EDIT_GAME_COORDINATES');
  if (/^Game attachment count exceeds profile\b/i.test(text)) return result('EDIT_GAME_LIMIT');
  if (/^Attachment does not exist\b/i.test(text)) return result('EDIT_GAME_SELECTION');
  if (/^Invalid attachment transform\b/i.test(text)) return result('EDIT_GAME_TRANSFORM');
  if (/^Invalid collider (?:shape|dimensions)\b/i.test(text)) return result('EDIT_GAME_COLLIDER');
  if (target === 'game' && /^Invalid text\b/i.test(text)) return result('EDIT_GAME_NAME');
  if (
    target === 'rigid' &&
    /^matrix (?:must (?:contain (?:16 values|only finite numbers)|be (?:affine|nonsingular))|values must fit in Float32|inverse is (?:numerically unstable(?: in Float32)?|not Float32-finite))\b/i.test(
      text,
    )
  )
    return result('EDIT_TRANSFORM');
  if (/\bEmissive factor out of range\b/i.test(text))
    return result('EDIT_MATERIAL_RANGE', '発光色の数値は0〜1で入力してください。');
  if (/\bInvalid alpha cutoff\b/i.test(text))
    return result('EDIT_MATERIAL_RANGE', 'アルファカットオフは0〜1で入力してください。');
  if (/\bMaterial factor out of range\b/i.test(text)) return result('EDIT_MATERIAL_RANGE');
  if (/\bInvalid (?:alpha mode|double-sided flag)\b/i.test(text))
    return result('EDIT_MATERIAL_INPUT');
  // These messages come from rig/animation commands and canonical validation.
  // Recognize only known wording; interpolated IDs are never returned to the UI.
  if (/^Joint name must be nonempty\b/i.test(text)) return result('EDIT_RIG_NAME');
  if (/^(?:Cannot normalize zero weights|Skin weights cannot all be zero)\b/i.test(text))
    return result('EDIT_WEIGHT_ZERO');
  if (
    /^(?:Weights must be finite and nonnegative|Skin weight must be finite|Skin weight cannot be negative)\b/i.test(
      text,
    )
  )
    return result('EDIT_WEIGHT_INPUT');
  if (/^(?:Invalid normalized weights|Skin weights must sum to 1)\b/i.test(text))
    return result('EDIT_WEIGHT_SUM');
  if (
    /^(?:Joint\/node does not exist|Skin does not exist|Select at least one vertex assignment|Duplicate vertex assignment|Unknown skin vertex|Select unique palette joints|Rest joint editing requires a joint-only node|Duplicate joint|Duplicate skin joint|Unknown skin joint|Skin joint reference is invalid|Skin weight vertex reference is invalid|Pose target must be a unique bound joint or rigid-part parent|Rig pose parent is missing)\b/i.test(
      text,
    )
  )
    return result('EDIT_RIG_SELECTION');
  if (
    /^(?:Mesh is already bound; use explicit rebind|A mesh must have exactly one skin assignment|Skin mesh must have a scene node|Invalid influences|Unassigned skin vertex|Duplicate vertex weight|At least one skin joint is required|Skin profile (?:fields are invalid|IDs are invalid|mesh reference is invalid|mesh vertices and nodes are required)|Skin weights must be an array|Duplicate skin weight for vertex|Skin influences are invalid for vertex|Skin joint and weight counts differ for vertex|Every mesh vertex must have one skin weight entry|Influence count must be between 1 and 4)\b/i.test(
      text,
    )
  )
    return result('EDIT_RIG_BIND');
  if (
    /^(?:Animated rest changes require an explicit conversion|Referenced joints cannot be removed\. Keep the skin, clips and children intact\.)/i.test(
      text,
    )
  )
    return result('EDIT_RIG_DEPENDENCY');
  if (/^Clip name must be nonempty\b/i.test(text)) return result('EDIT_ANIMATION_NAME');
  if (/^Invalid key time\b/i.test(text)) return result('EDIT_ANIMATION_TIME');
  if (/^(?:Time lies outside the clip|Invalid animation time)\b/i.test(text))
    return result(
      'EDIT_ANIMATION_INPUT',
      '表示する時刻は0秒〜クリップの長さの範囲内の有限な数値にしてください。',
    );
  if (/^Change track interpolation explicitly before adding a key\b/i.test(text))
    return result('EDIT_ANIMATION_INTERPOLATION');
  if (
    /^(?:(?:Clip|Key|Track) does not exist|Duplicate animation track|Animation target must be a unique node)\b/i.test(
      text,
    )
  )
    return result('EDIT_ANIMATION_SELECTION');
  if (
    /^(?:Invalid clip|Unsupported animation|Unnormalized key quaternion|Invalid quaternion|Invalid animation TRS)\b/i.test(
      text,
    )
  )
    return result('EDIT_ANIMATION_INPUT');
  if (
    /^Animation preview is (?:disposed|unavailable during capture or after disposal)\b/i.test(text)
  )
    return result('EDIT_PREVIEW_UNAVAILABLE');
  if (
    /\b(?:Combined resource ownership estimate exceeds|Canonical clone estimate exceeds|Canonical estimate traversal limit|Source and texture total exceeds|Binary estimate overflow|JSON structural estimate exceeds|JSON estimate depth exceeded)\b/i.test(
      text,
    )
  )
    return result('EDIT_RESOURCE_LIMIT');
  if (/\b(?:history|undo) budget\b/i.test(text)) return result('EDIT_HISTORY_LIMIT');
  if (
    /\b(?:history operation is already in progress|another (?:image |editing )?(?:job|operation) is active)\b/i.test(
      text,
    )
  )
    return result('EDIT_BUSY');
  if (/\b(?:read.only|readonly)\b/i.test(text)) return result('EDIT_READ_ONLY');
  if (/\b(?:project history|project session) is closed\b/i.test(text)) return result('EDIT_CLOSED');
  if (/\b(?:stale|revision mismatch|session changed|target changed)\b/i.test(text))
    return result('EDIT_CHANGED_TARGET');
  if (
    /\b(?:missing source|source (?:bytes are immutable|hash mismatch)|missing (?:image|texture) (?:source|blob)|cyclic source lineage)\b/i.test(
      text,
    )
  )
    return result('EDIT_SOURCE');
  if (/\b(?:explicit|finite|missing|invalid) UV\b|\bUV (?:required|missing|invalid)\b/i.test(text))
    return result('EDIT_UV');
  if (
    name === 'EncodingError' ||
    /\b(?:image (?:decode|decoding|encoding) (?:failed|error)|(?:failed|unable) to decode|source image could not be decoded)\b/i.test(
      text,
    )
  )
    return result('EDIT_IMAGE_DECODE');
  if (/^3D画像: PNGの必須チャンク [A-Za-z]{4} には対応していません$/.test(text))
    return result('EDIT_IMAGE_FORMAT', 'PNGに、この版で対応していない必須チャンクがあります。');
  if (
    /\b(?:image MIME mismatch|invalid (?:image dimensions|PNG|JPEG)|unsupported image format)\b/i.test(
      text,
    )
  )
    return result('EDIT_IMAGE_FORMAT');
  if (
    /\b(?:finite number required|invalid vector size|quaternion must be normalized|Float32 overflow)\b/i.test(
      text,
    )
  )
    return result('EDIT_INPUT');
  if (
    /\b(?:invalid primitive ID|primitive IDs already exist|unsupported primitive kind|missing reference)\b/i.test(
      text,
    )
  )
    return result('EDIT_SELECTION');
  if (/\b(?:invalid face|corner count mismatch|cyclic hierarchy)\b/i.test(text))
    return result('EDIT_GEOMETRY');
  if (
    /\b(?:invalid canonical estimate input|noncanonical estimate object|invalid stable ID|duplicate ID|invalid revision|command cannot change identity or revision|revision exhausted|invalid save acknowledgement|unsupported or missing project field)\b/i.test(
      text,
    )
  )
    return result('EDIT_DATA');
  return result('EDIT_UNKNOWN');
}

export function formatNativeEditingFailure(cause: unknown, target: NativeEditingTarget): string {
  const result = describeNativeEditingFailure(cause, target);
  return `${result.target}: ${result.reason} ${result.action} [${result.code}]`;
}

/** Preview state can carry a caught exception. Never display arbitrary status text. */
export function formatNativeMotionStatusReason(
  cause: unknown,
  target: 'rig' | 'animation',
): string {
  if (cause === undefined || cause === '') return '';
  const { text } = description(cause);
  const status = findNativeMotionStatusMessage(text);
  if (status !== undefined) return status;
  const failure = describeNativeEditingFailure(cause, target);
  return failure.code === 'EDIT_UNKNOWN'
    ? '表示状態が変わりました。現在の対象を確認してください。'
    : failure.reason;
}

/** Display statuses may contain a caught failure's already-sanitized reason. */
export function formatNativeDisplayReason(cause: unknown, target: NativeEditingTarget): string {
  if (cause === undefined || cause === '') return '';
  const { text } = description(cause);
  const status = findNativeDisplayStatusMessage(text);
  if (status !== undefined) return status;
  const authored = findNativeEditingMessage(text);
  if (authored) return authored.reason;
  // Exact reviewed outputs only. In particular, EDIT_UNKNOWN's reason must survive a second pass.
  const knownReason = Object.values(guidance).find(([reason]) => reason === text);
  if (knownReason) return knownReason[0];
  const failure = describeNativeEditingFailure(cause, target);
  return failure.code === 'EDIT_UNKNOWN'
    ? '表示状態が変わりました。現在の対象を確認してください。'
    : failure.reason;
}
