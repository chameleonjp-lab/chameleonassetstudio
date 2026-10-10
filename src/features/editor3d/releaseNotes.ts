/** Bundled explanatory text, never a description fetched for a deployed revision. */
export interface NativeReleaseNotesBuild {
  readonly appVersion: string;
  readonly sourceRevision: string;
  readonly sourceDirty: boolean;
}

interface NativeReleaseNoteSection {
  readonly id: 'changes' | 'save-output' | 'limits' | 'recovery' | 'deferred';
  readonly title: string;
  readonly items: readonly string[];
}

export const NATIVE_RELEASE_NOTES = {
  edition: '2026-10-10',
  nativeSchemaVersion: '0.3.0',
  status: 'development-candidate',
  scope:
    'このタブに同梱されたコードの更新内容です。「配信版を確認」で別のsource revisionが見つかっても、その配信版の説明には切り替わりません。説明の日付はアプリ版や公開日とは別です。',
  qualification:
    '開発版候補です。正式公開・最新mainへの反映・3D製品の完成や、実機の合格を示すものではありません。',
  sections: [
    {
      id: 'changes',
      title: '追加・変更した機能',
      items: [
        '保存済みのrest表示から小さいサムネイルを作成できます。派生cacheは正本と別で、件数と再作成方法を確認して整理します。原本・保持版を自動で消す処理ではありません。',
        'トップは2D／3Dの入口です。旧トップのブックマークから2Dへ進めます。同じサイト・ブラウザーの保存済み2D作品は、入口の変更だけでは移動・削除しません。3Dは別タブで開きます。',
        '基本形・材質・画像の編集、依存情報を確認して行う階層の複製、表示用の地面を備えます。地面はY=0の目安で、編集データやGLBには入りません。',
        '骨と手動の重み編集（1頂点につき最大4影響）、rigid部品の骨割当、STEP／LINEARのclip編集を備えます。確認中のposeと保存するrestを分け、日本語IMEの変換中は誤操作を抑止します。',
        'GLB取り込みでは保存前の表示確認、出力では作成前の保持範囲・警告確認を追加しています。ゲーム向けの原点・単位・anchor・colliderなどを付属情報として扱います。',
        '保存履歴とごみ箱、保持版の別コピー復旧、資源上限の確認と背景停止、版情報と共有前に編集できる診断情報を備えます。診断情報は自動送信しません。',
      ],
    },
    {
      id: 'save-output',
      title: '保存・出力への影響',
      items: [
        '3D保存形式は0.3.0です。旧0.1.0／0.2.0の保存領域は読み取り専用で保持し、確認後に新しい領域へコピー移行します。元の作品を上書きせず、コピー分の容量が必要です。',
        'アプリを旧版へ戻しても保存形式は戻りません。旧アプリへの無損失のダウングレードは保証できません。移行前の復元控えを別に取得してください。通常のバックアップには旧形式の控えは入りません。',
        '編集用の.cas3dprojは作品と取り込んだ原本GLBを保持します。原本を保持することと、未対応の情報を編集後の単体GLBへ再出力できることは別です。Undo履歴や確認中のposeは保存しません。',
        'ゲーム用のmodel.glb・game.json・manifest.json／ZIPは編集用バックアップの代わりにはなりません。出力は作成開始時のrevisionです。後からの編集は出力し直し、付属情報も一緒に利用してください。',
        '未対応の情報や変換で失う情報は、取り込み・出力前の注意で確認してください。原本に残る情報が出力にすべて入るとは限りません。非表示部品もGLBに含まれ、利用先では見える場合があります。',
      ],
    },
    {
      id: 'limits',
      title: '既知の制約・未検証の範囲',
      items: [
        'PC・iPad・iPhone・Android実機の操作、実機の日本語IME、モバイルのタッチ操作と支援技術の最終受入は未完了です。自動テストや端末エミュレーションは実機合格の代わりにはなりません。',
        'OS強制終了・タブ破棄・実ストレージ不足の後の復旧は未検証です。破棄されたタブの未保存内容を必ず取り戻せるとは限りません。',
        '資源上限は同一JavaScript realm内の見積りです。端末全体の実メモリや実GPUの性能・残留資源を測定した値ではなく、実機の性能区分は未確定です。',
        'Khronos validatorや隔離したBabylon.js consumerの検査は、Unity／Godot／Blender実アプリでの動作・往復の合格を意味しません。NullEngine・headlessの結果も実GPUでの描画確認とは別です。',
        '外部URL参照、未対応の必須拡張や圧縮形式は取り込めません。保存前のGLB表示確認は変換後のrest形状・材質が対象で、アニメーションや未対応情報の再現確認ではありません。',
        '読込済み機能のローカル利用と、完全なオフライン起動は別です。未取得の機能を通信なしで開けることや、完全なオフライン起動は保証していません。',
      ],
    },
    {
      id: 'recovery',
      title: '更新・問題発生時の復旧策',
      items: [
        '更新前や保存失敗時は、タブを閉じずに「現在の内容をバックアップ」で.cas3dprojを取得してください。保存先にファイルがあることと、別コピーとして復元できることを確認します。',
        '「保存済みの版をバックアップ」は最後の保存版を取り出します。現在の未保存変更は含みません。「保存履歴とごみ箱を読む」からの復旧も別IDのコピーで、元の正常版と復旧候補を残します。',
        '自動保存とごみ箱は、このサイト・ブラウザーのプロフィール内にあります。別端末へ自動同期せず、サイトデータを削除すると原本・復旧候補も失う可能性があります。先に別ファイルの控えを残してください。',
        '上限時は3D表示や作成済み出力を閉じ、処理後に再試行します。「現在の内容を保存して再読み込み」は保存できた場合に進みます。保存や原本の読み取りに失敗した場合、救出を保証できません。',
      ],
    },
    {
      id: 'deferred',
      title: '未採用・保留中の推奨機能（SHOULD）',
      items: [
        '自動ウェイト、bone mirror、IK・関節制限・weight brushは未採用です。手動の重み指定やrigid割当は自動重み付けではありません。',
        'idle／walk／jumpなどのmotion template、retarget、curve editor・CUBICSPLINE・motion blend・root motion制作は未採用です。対応するGLB clipの読み込みだけで動きの移し替えにはなりません。',
        'named snapshot、出力したrevisionへの復帰・差分比較の一式は未採用です。保持版の復旧機能とは範囲が異なります。Unity／Godot／Blender固定版のengine round-tripも未検証・採否待ちです。',
        '検索・複数rename・整列・grid・孤立表示の推奨一式、2D輪郭の押出し・bevel・boolean・repeat配置、部品templateの保存・再利用は採用完了していません。既存の基本編集機能とは区別します。',
        '追加の材質map・UV編集、texture paint・mask・palette・material preset、turntable・比較表示・透明背景・品質設定の推奨一式、任意JSONのゲーム情報・用途別presetは採用完了していません。',
        'glTF bundle、Meshopt／Draco／KTX2、VRMの対応範囲拡張、LOD・圧縮variant・自動最適化は採否待ちです。原本保持や品質検査だけで編集・再出力対応を約束しません。',
        '初回tutorial・sample UIの一式と、公開版の入口・保存・出力までの稼働確認は採用完了していません。ガイドや明示的な版確認だけで公開版全体の合格とはしません。未完の推奨機能は今後の個別判断で扱います。',
      ],
    },
  ] satisfies readonly NativeReleaseNoteSection[],
} as const;
