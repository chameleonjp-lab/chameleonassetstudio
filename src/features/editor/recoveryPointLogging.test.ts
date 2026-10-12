import { expect, it, vi } from 'vitest';
import { warnRecoveryPointSaveFailure } from './recoveryPointLogging';

it('logs only a fixed recovery-point failure category, never the storage exception', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const secret = 'SEC07-PRIVATE_TOKEN /Users/private/secret-project.glb';
  const error = Object.assign(new Error(secret), {
    localPath: '/Users/private/secret-project.glb',
    token: 'SEC07-PRIVATE_TOKEN',
  });

  try {
    warnRecoveryPointSaveFailure(error);

    expect(warning.mock.calls).toEqual([['復旧点の保存に失敗しました']]);
    expect(warning.mock.calls.flat().join(' ')).not.toContain(secret);
    expect(warning.mock.calls.flat().join(' ')).not.toContain('SEC07-PRIVATE_TOKEN');
    expect(warning.mock.calls.flat()).not.toContain(error);
  } finally {
    warning.mockRestore();
  }
});
