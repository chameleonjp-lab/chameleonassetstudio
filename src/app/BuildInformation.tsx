export function BuildInformation() {
  return (
    <details className="quality-status" aria-label="公開情報">
      <summary>
        開発版・{__APP_REVISION__.slice(0, 8)}
        {__APP_DIRTY__ ? '（ローカル変更あり）' : ''}
      </summary>
      <p>2D素材の制作機能を検証中です。iPhone Safari実機と新版のゲーム向け配布は未確認です。</p>
      <p>作品の権利は制作者に帰属します。取り込む素材の利用条件は個別に確認してください。</p>
      <a href="https://github.com/chameleonjp-lab/chameleonassetstudio/issues">
        不具合の報告・問い合わせ
      </a>
    </details>
  );
}
