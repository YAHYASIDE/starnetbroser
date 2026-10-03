/**
 * Sequences deleting an account's local browser session against deleting
 * the account itself. Framework-free (no React, no window.confirm/alert
 * calls) so the ordering can be unit tested directly: callers pass in
 * confirmSessionDelete/deleteSession, this function never reaches for a
 * global.
 *
 * The one rule this exists to enforce: the account card must never
 * disappear from STAR NET while its local session deletion might have
 * failed. So the session delete always runs - and must succeed - before
 * this ever reports the account itself as safe to remove.
 */

export type DeleteAccountOutcome =
  | { action: "deleteAccount"; sessionDeleted: false }
  | { action: "deleteAccount"; sessionDeleted: true }
  | { action: "keepAccount"; reason: "session-delete-failed" };

export interface ResolveAccountDeletionOptions {
  /** Asks the user whether to also delete the local session. Not called for anything else. */
  confirmSessionDelete: () => boolean;
  /** Attempts the actual native deletion; must resolve true only on confirmed success. */
  deleteSession: () => Promise<boolean>;
}

export async function resolveAccountDeletion(
  options: ResolveAccountDeletionOptions,
): Promise<DeleteAccountOutcome> {
  const { confirmSessionDelete, deleteSession } = options;

  if (!confirmSessionDelete()) {
    return { action: "deleteAccount", sessionDeleted: false };
  }

  const deleted = await deleteSession();
  if (!deleted) {
    // Never claim success without real confirmation - and never remove the account card for a
    // session that might still be sitting there logged in.
    return { action: "keepAccount", reason: "session-delete-failed" };
  }

  return { action: "deleteAccount", sessionDeleted: true };
}
