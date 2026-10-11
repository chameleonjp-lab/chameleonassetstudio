import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project3D } from '../../core3d/model/project';
import { NativeReleaseNotes } from './NativeReleaseNotes';
import { NATIVE_RELEASE_NOTES, type NativeReleaseNotesBuild } from './releaseNotes';

const build: NativeReleaseNotesBuild = {
  appVersion: '0.1.0',
  sourceRevision: '0123456789abcdef'.repeat(2) + '01234567',
  sourceDirty: false,
};
const content = NATIVE_RELEASE_NOTES.sections.flatMap((section) => section.items).join('\n');
const render = (value: NativeReleaseNotesBuild = build) =>
  renderToStaticMarkup(createElement(NativeReleaseNotes, { build: value }));

afterEach(() => vi.unstubAllGlobals());

describe('bundled current-tab release notes', () => {
  it('keeps the note edition separate from the app and canonical project schema', () => {
    const schemaVersion: Project3D['schemaVersion'] = NATIVE_RELEASE_NOTES.nativeSchemaVersion;
    expect(NATIVE_RELEASE_NOTES.edition).toBe('2026-10-10');
    expect(schemaVersion).toBe('0.3.0');
    expect(NATIVE_RELEASE_NOTES.status).toBe('development-candidate');
    expect(NATIVE_RELEASE_NOTES.scope).toContain('このタブに同梱されたコード');
    expect(NATIVE_RELEASE_NOTES.scope).toContain('その配信版の説明には切り替わりません');
    expect(NATIVE_RELEASE_NOTES.qualification).toContain('正式公開・最新mainへの反映');
    expect(NATIVE_RELEASE_NOTES.qualification).toContain('示すものではありません');
  });

  it('includes exactly the five required sections with nonempty plain-text entries', () => {
    expect(NATIVE_RELEASE_NOTES.sections.map((section) => section.id)).toEqual([
      'changes',
      'save-output',
      'limits',
      'recovery',
      'deferred',
    ]);
    for (const section of NATIVE_RELEASE_NOTES.sections) {
      expect(section.title.trim()).not.toBe('');
      expect(section.items.length).toBeGreaterThan(0);
      expect(new Set(section.items).size).toBe(section.items.length);
      for (const item of section.items) {
        expect(item.trim()).not.toBe('');
        expect(item).not.toMatch(/<[^>]*>|https?:\/\/|javascript:|data:/i);
      }
    }
  });

  it('preserves migration, original retention, output loss and rescue boundaries', () => {
    for (const text of [
      '旧トップのブックマーク',
      '保存済み2D作品',
      '旧0.1.0／0.2.0の保存領域は読み取り専用で保持',
      'コピー移行',
      '旧アプリへの無損失のダウングレードは保証できません',
      '移行前の復元控え',
      '通常のバックアップには旧形式の控えは入りません',
      '作品と取り込んだ原本GLBを保持',
      '編集後の単体GLBへ再出力できることは別',
      '編集用バックアップの代わりにはなりません',
      '非表示部品もGLBに含まれ',
      'タブを閉じずに',
      '現在の未保存変更は含みません',
      '元の正常版と復旧候補を残します',
      'サイトデータを削除すると',
    ])
      expect(content).toContain(text);
  });

  it('does not turn automated evidence or deferred SHOULD features into acceptance', () => {
    const limits = NATIVE_RELEASE_NOTES.sections.find((section) => section.id === 'limits')!;
    const deferred = NATIVE_RELEASE_NOTES.sections.find((section) => section.id === 'deferred')!;
    for (const text of [
      'PC・iPad・iPhone・Android実機',
      '実機の日本語IME',
      'OS強制終了',
      '端末全体の実メモリや実GPU',
      'Babylon.js consumer',
      'Unity／Godot／Blender実アプリ',
      '合格を意味しません',
      'NullEngine・headless',
      '完全なオフライン起動は保証していません',
    ])
      expect(limits.items.join('\n')).toContain(text);
    for (const text of [
      '自動ウェイト',
      'IK',
      'weight brush',
      'motion template',
      'retarget',
      'CUBICSPLINE',
      'named snapshot',
      'engine round-tripも未検証・採否待ち',
      '未採用',
    ])
      expect(deferred.items.join('\n')).toContain(text);
  });

  it('renders a labelled section with all content and no competing disclosure or actions', () => {
    const html = render();
    expect(html).toContain('<section aria-label="このタブの更新内容">');
    expect(html).toContain('<h3>このタブの更新内容</h3>');
    expect(html.match(/<h4>/g)).toHaveLength(5);
    for (const section of NATIVE_RELEASE_NOTES.sections) {
      expect(html).toContain(`<h4>${section.title}</h4>`);
      for (const item of section.items) expect(html).toContain(item);
    }
    expect(html).not.toMatch(/<(?:details|summary|form|button|input|a|script|iframe)\b/i);
    expect(html).not.toMatch(/\s(?:href|src|action|on\w+)=/i);
  });

  it.each([false, true])(
    'shows full supplied identity and explicit dirty state %s',
    (sourceDirty) => {
      for (const sourceRevision of [build.sourceRevision, 'ABCDEF0123456789'.repeat(4)]) {
        const html = render({ ...build, sourceRevision, sourceDirty });
        expect(html).toContain(`アプリ ${build.appVersion}`);
        expect(html).toContain('説明更新: 2026-10-10');
        expect(html).toContain('3D保存形式 0.3.0');
        expect(html).toContain(`このタブのsource revision: ${sourceRevision}`);
        expect(html).toContain(sourceDirty ? '（ローカル変更あり）' : '（ローカル変更なし）');
      }
    },
  );

  it('escapes build strings and ignores extra deployment or project fields', () => {
    const html = render({
      ...build,
      appVersion: '<script>version & "quoted"</script>',
      sourceRevision: '<img src=x onerror="bad()">',
    });
    expect(html).toContain('&lt;script&gt;version &amp; &quot;quoted&quot;&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=&quot;bad()&quot;&gt;');
    expect(html).not.toMatch(/<(?:script|img)\b/i);

    const extra = {
      ...build,
      nativeSchemaVersion: 'untrusted-schema',
      deployed: { sourceRevision: 'another-deployed-revision' },
      projectName: 'private-project-name',
    };
    const htmlWithExtra = render(extra);
    expect(htmlWithExtra).not.toMatch(/untrusted-schema|another-deployed-revision|private-project/);
    expect(htmlWithExtra).toContain(build.sourceRevision);
  });

  it('can render with network and storage unavailable and makes no side-effect calls', () => {
    const forbidden = vi.fn(() => {
      throw new Error('Release notes must not access network or storage.');
    });
    vi.stubGlobal('fetch', forbidden);
    vi.stubGlobal('XMLHttpRequest', forbidden);
    vi.stubGlobal('WebSocket', forbidden);
    vi.stubGlobal('localStorage', {
      getItem: forbidden,
      setItem: forbidden,
      removeItem: forbidden,
    });
    vi.stubGlobal('indexedDB', { open: forbidden, deleteDatabase: forbidden });
    expect(render()).toContain('このタブの更新内容');
    expect(forbidden).not.toHaveBeenCalled();
  });

  it('keeps the bundled data and view renderer-free without remote text or HTML injection', () => {
    const dataSource = readFileSync(new URL('./releaseNotes.ts', import.meta.url), 'utf8');
    const viewSource = readFileSync(new URL('./NativeReleaseNotes.tsx', import.meta.url), 'utf8');
    expect(dataSource).not.toMatch(/\bimport\s/);
    expect(viewSource.match(/from\s+['"]([^'"]+)['"]/g)).toEqual(["from './releaseNotes'"]);
    for (const source of [dataSource, viewSource])
      expect(source).not.toMatch(
        /\bfetch\s*\(|\b(?:XMLHttpRequest|WebSocket|localStorage|indexedDB|innerHTML|dangerouslySetInnerHTML|useEffect)\b|https?:\/\//,
      );
  });
});
