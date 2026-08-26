import { useEffect, useState } from 'react';
import {
  formatBytes,
  formatMilliseconds,
  observeLongTasks,
  readRuntimePerformanceSnapshot,
  type MetricAvailability,
  type RuntimePerformanceSnapshot,
} from '../core/performance/performanceBudget';

function availabilityLabel(availability: MetricAvailability): string {
  return availability === 'available' ? '対応' : '未対応';
}

function measuredValue(value: number | null, formatter: (value: number | null) => string): string {
  return value === null ? '未計測（ブラウザAPI非対応または非公開）' : formatter(value);
}

export function QualityStatus() {
  const [snapshot, setSnapshot] = useState<RuntimePerformanceSnapshot>(
    readRuntimePerformanceSnapshot,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!detailsOpen) {
      return;
    }

    const observation = observeLongTasks((update) => {
      setSnapshot((current) => ({
        ...current,
        longTaskCount: update.longTaskCount,
        longTaskDurationMs: update.longTaskDurationMs,
      }));
    });
    setSnapshot((current) => ({ ...current, longTaskSupport: observation.availability }));
    return observation.disconnect;
  }, [detailsOpen]);

  return (
    <section className="quality-status" aria-label="品質情報">
      <details onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
        <summary>品質情報</summary>
        <p className="quality-status-note" role="status">
          この画面で取得できない指標は未計測として表示します。表示値はブラウザAPIの参考値で、合格判定ではありません。
        </p>
        <dl className="quality-status-metrics">
          <div>
            <dt>長時間タスク監視</dt>
            <dd data-quality-metric="long-task-support">
              {availabilityLabel(snapshot.longTaskSupport)}
            </dd>
          </div>
          <div>
            <dt>長時間タスク件数</dt>
            <dd data-quality-metric="long-task-count">
              {snapshot.longTaskSupport === 'unsupported'
                ? '未計測（ブラウザAPI非対応）'
                : snapshot.longTaskCount === null
                  ? '未計測（画面表示後の累積値）'
                  : String(snapshot.longTaskCount)}
            </dd>
          </div>
          <div>
            <dt>長時間タスク合計</dt>
            <dd data-quality-metric="long-task-duration">
              {snapshot.longTaskSupport === 'unsupported'
                ? '未計測（ブラウザAPI非対応）'
                : formatMilliseconds(snapshot.longTaskDurationMs)}
            </dd>
          </div>
          <div>
            <dt>JSヒープ使用量</dt>
            <dd data-quality-metric="js-heap-used">
              {measuredValue(snapshot.jsHeapUsedBytes, formatBytes)}
            </dd>
          </div>
          <div>
            <dt>JSヒープ上限</dt>
            <dd data-quality-metric="js-heap-limit">
              {measuredValue(snapshot.jsHeapLimitBytes, formatBytes)}
            </dd>
          </div>
          <div>
            <dt>端末メモリ目安</dt>
            <dd data-quality-metric="device-memory">
              {snapshot.deviceMemoryGb === null
                ? '未計測（ブラウザAPI非対応または非公開）'
                : snapshot.deviceMemoryGb + ' GB（参考値）'}
            </dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
