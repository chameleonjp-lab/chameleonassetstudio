import { useMemo } from 'react';
import type { Asset } from '../../core/model/asset';
import { inspectAsset, type InspectionSeverity } from '../../core/model/assetInspection';

const SEVERITY_LABELS: Record<InspectionSeverity, string> = {
  error: '必須確認',
  warning: '推奨確認',
  info: '情報',
};

interface InspectionPanelProps {
  asset: Asset;
  /** Game Checkのruntime-invalid fixtureでは、canonical値を推測せず検査不能として表示する。 */
  tolerateInvalidRuntime?: boolean;
}

/** A+B+X 契約の読み取り専用検査結果を表示する。修正や保存制御は行わない。 */
export function InspectionPanel({ asset, tolerateInvalidRuntime = false }: InspectionPanelProps) {
  const inspection = useMemo(() => {
    try {
      return { issues: inspectAsset(asset), unavailable: false };
    } catch (error) {
      if (!tolerateInvalidRuntime) {
        throw error;
      }
      return { issues: [], unavailable: true };
    }
  }, [asset, tolerateInvalidRuntime]);
  const { issues } = inspection;
  const counts = issues.reduce<Record<InspectionSeverity, number>>(
    (result, issue) => {
      result[issue.severity] += 1;
      return result;
    },
    { error: 0, warning: 0, info: 0 },
  );

  return (
    <section aria-label="素材検査">
      <h4 className="gamedata-heading">素材検査（読み取り専用）</h4>
      <p className="editor-note">
        現在の素材を確認して不足・矛盾・推奨項目を表示します。検査結果は保存されず、保存・autosave・.casproj・exportも止めません。
      </p>
      {inspection.unavailable && (
        <p className="import-error" role="alert">
          保存形式として不正なruntime値があるため、素材検査は値を推測せず実行しません。上の理由一覧で対象pathを確認してください。
        </p>
      )}
      <p className="editor-note" aria-live="polite">
        必須確認 {counts.error}件 / 推奨確認 {counts.warning}件 / 情報 {counts.info}件
      </p>

      {!inspection.unavailable && issues.length === 0 ? (
        <p className="editor-note">問題は見つかりませんでした。</p>
      ) : !inspection.unavailable ? (
        <ul className="gamedata-list" aria-label="素材検査の結果">
          {issues.map((issue) => (
            <li key={issue.id} className="gamedata-row">
              <div className="gamedata-row-header">
                <strong>
                  {SEVERITY_LABELS[issue.severity]}: {issue.message}
                </strong>
                <code>{issue.code}</code>
              </div>
              <p className="editor-note">理由: {issue.reason}</p>
              <p className="editor-note">直し方・確認方法: {issue.action}</p>
              <p className="editor-note">
                確認場所: {issue.target.label}（{issue.target.path}）
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
