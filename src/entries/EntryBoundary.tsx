import { Component, type ReactNode } from 'react';

export class EntryBoundary extends Component<
  { children: ReactNode; domain: string; recovery?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert">
        <h1>{this.props.domain}を表示できませんでした</h1>
        <p>
          保存済みデータは削除していません。未保存の作業がある場合は、このタブを閉じずに状態を確認してください。
        </p>
        <a href={import.meta.env.BASE_URL} target="_blank" rel="noopener noreferrer">
          トップを別タブで開く
        </a>
        {this.props.recovery}
      </main>
    );
  }
}
