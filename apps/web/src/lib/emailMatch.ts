/**
 * Compares the operator's manually-entered `expectedEmail` against the email Starlink sync
 * actually found (`starlinkAccountEmail`). Deliberately conservative: only reports a mismatch
 * when BOTH are present and non-empty - never flags a warning just because one side hasn't been
 * filled in yet (a brand-new account, or one that hasn't synced its Settings page yet).
 */
export function emailsMismatch(expected: string | undefined, actual: string | undefined): boolean {
  const expectedTrimmed = expected?.trim();
  const actualTrimmed = actual?.trim();
  if (!expectedTrimmed || !actualTrimmed) return false;
  return expectedTrimmed.toLowerCase() !== actualTrimmed.toLowerCase();
}
