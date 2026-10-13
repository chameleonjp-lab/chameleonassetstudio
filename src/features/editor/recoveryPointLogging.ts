const RECOVERY_POINT_SAVE_FAILURE_MESSAGE = '復旧点の保存に失敗しました';

/** Storage exceptions may contain user-specific data; keep only a fixed diagnostic category. */
export function warnRecoveryPointSaveFailure(error: unknown): void {
  // Intentionally discard the value without reading message, stack, or custom properties.
  void error;
  console.warn(RECOVERY_POINT_SAVE_FAILURE_MESSAGE);
}
