import { useMemo } from 'react';
import {
  inspectAsset,
  type Asset,
  type InspectionFinding,
  type InspectionSeverity,
} from '../../core/model';

interface InspectionPanelProps {
  asset: Asset;
  onSelectCollider: (id: string | null) => void;
  onSelectAnimation: (id: string | null) => void;
}

const SEVERITY_LABELS: Record<InspectionSeverity, string> = {
  error: 'エラー',
  warning: '警告',
  info: '情報',
};

const CATEGORY_LABELS: Record<InspectionFinding['category'], string> = {
  reference: '参照',
  collider: '当たり判定',
  anchor: 'アンカー',
  animation: 'アニメーション',
  frame: 'フレーム',
  origin: '原点',
};

function summaryText(findings: InspectionFinding[]): string {
  if (findings.length === 0) {
    return '問題は見つかりませんでした。';
  }
  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;
  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`エラー ${errorCount}`);
  }
  if (warningCount > 0) {
    parts.push(`警告 ${warningCount}`);
  }
  if (infoCount > 0) {
    parts.push(`情報 ${infoCount}`);
  }
  return parts.join('・');
}

/**
 * ゲームデータ検査パネル（2D-3-GAMEDATA-01）。
 * 参照整合・当たり判定・アンカー・アニメーション・原点の意味検査結果を表示する。
 * 検査は advisory のみで、自動修正は行わない。対象がある所見はジャンプできる。
 */
export function InspectionPanel({
  asset,
  onSelectCollider,
  onSelectAnimation,
}: InspectionPanelProps) {
  const findings = useMemo(() => inspectAsset(asset), [asset]);

  return (
    <section aria-label="ゲームデータ検査" className="inspection-panel">
      <p className="inspection-summary">{summaryText(findings)}</p>
      {findings.length > 0 && (
        <ul className="inspection-list" role="list" aria-label="検査結果">
          {findings.map((finding) => (
            <li key={finding.id} className={`inspection-row inspection-row-${finding.severity}`}>
              <div className="inspection-row-header">
                <span className={`inspection-badge inspection-badge-${finding.severity}`}>
                  {SEVERITY_LABELS[finding.severity]}
                </span>
                <span className="inspection-category">{CATEGORY_LABELS[finding.category]}</span>
              </div>
              <p className="inspection-message">{finding.message}</p>
              {finding.target &&
                (finding.target.kind === 'collider' || finding.target.kind === 'animation') && (
                  <button
                    type="button"
                    className="inspection-jump-button"
                    aria-label={`検査項目「${finding.code}:${finding.target.id}」の対象を選択`}
                    onClick={() => {
                      if (finding.target?.kind === 'collider') {
                        onSelectCollider(finding.target.id);
                      } else if (finding.target?.kind === 'animation') {
                        onSelectAnimation(finding.target.id);
                      }
                    }}
                  >
                    対象を選択
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
