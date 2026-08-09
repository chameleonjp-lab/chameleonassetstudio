import type { GameCheckImpactItem } from './gameCheckContract';

interface GameCheckImpactPanelProps {
  open: boolean;
  items: readonly GameCheckImpactItem[];
  onToggle: () => void;
}

function confidenceClass(confidence: '確定' | '可能性' | '未評価'): string {
  return confidence === '確定'
    ? 'game-check-confidence-confirmed'
    : confidence === '可能性'
      ? 'game-check-confidence-possible'
      : 'game-check-confidence-unassessed';
}

export function GameCheckImpactPanel({ open, items, onToggle }: GameCheckImpactPanelProps) {
  return (
    <section className="game-check-card" aria-label="Impact">
      <button
        type="button"
        className="game-check-section-toggle"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>変更影響（Impact）</span>
        <span>{open ? '閉じる' : '開く'}</span>
      </button>
      {open && (
        <ul className="game-check-impact-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="game-check-impact-heading">
                <strong className={confidenceClass(item.confidence)}>{item.confidence}</strong>
                <span>対象：{item.targetLabel}</span>
                <code>{item.path}</code>
              </div>
              {item.relationStatus && <p>関係状態：{item.relationStatus}</p>}
              <p>{item.reason}</p>
              <div className="game-check-impact-meta">
                <small>確認：{item.checked}</small>
                <small>未確認：{item.unchecked}</small>
                <small>再確認：{item.recheck}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
