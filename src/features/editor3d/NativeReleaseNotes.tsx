import { NATIVE_RELEASE_NOTES, type NativeReleaseNotesBuild } from './releaseNotes';

export interface NativeReleaseNotesProps {
  readonly build: NativeReleaseNotesBuild;
}

/** Read-only content inside NativeBuildStatus's accessible, collapsible details. */
export function NativeReleaseNotes({ build }: NativeReleaseNotesProps) {
  return (
    <section aria-label="このタブの更新内容">
      <h3>このタブの更新内容</h3>
      <p>
        説明更新: {NATIVE_RELEASE_NOTES.edition} · アプリ {build.appVersion} · 3D保存形式{' '}
        {NATIVE_RELEASE_NOTES.nativeSchemaVersion}
      </p>
      <p>
        このタブのsource revision: {build.sourceRevision}
        {build.sourceDirty ? '（ローカル変更あり）' : '（ローカル変更なし）'}
      </p>
      <p>{NATIVE_RELEASE_NOTES.scope}</p>
      <p>{NATIVE_RELEASE_NOTES.qualification}</p>
      {NATIVE_RELEASE_NOTES.sections.map((section) => (
        <div key={section.id}>
          <h4>{section.title}</h4>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
