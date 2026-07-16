import { useMemo } from 'react';
import type { Asset } from '../../core/model/asset';
import {
  inspectAsset,
  type InspectionSeverity,
} from '../../core/model/assetInspection';

const SEVERITY_LABELS: Record<InspectionSeverity, string> = {
  error: '必須確認',
  warning: '推奨確認',
  info: '情報',
};

interface InspectionPanelProps {
  asset: Asset;
}

/** A+B+X 契約の読み取り専用検査結果を表示する。修正や保存制御は行わない。 */
export function InspectionPanel({ asset }: InspectionPanelProps) {
  const issues = useMemo(() => inspectAsset(asset), [asset]);
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
      <p className="editor-note" aria-live="polite">
        必須確認 {counts.error}件 / 推奨確認 {counts.warning}件 / 情報 {counts.info}件
      </p>

      {issues.length === 0 ? (
        <p className="editor-note">問題は見つかりませんでした。</p>
      ) : (
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
      )}
    </section>
  );
}
