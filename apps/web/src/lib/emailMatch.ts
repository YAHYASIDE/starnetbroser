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

/** The local part of an email/emailish token, lowercased ("Dede868@Out.com" -> "dede868"). */
export function emailLocalPart(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().split("@")[0] ?? "";
}

/**
 * True when one of this account's own login emails appears with an account Admin role in the
 * Starlink Settings → Users table (`adminEmails`). The operator confirmed that the Admin-role email
 * on that table is the account's "primary" email - a far more reliable signal than the icon-rail
 * billing heuristic, which can wrongly flag an admin email as "غير رئيسي" when billing didn't load.
 * The Users cell is often truncated to just the local part ("dede868@…"), so the match is on the
 * local part only; matching a DIFFERENT admin email (a real limited user on someone else's account)
 * is correctly NOT a match, so a genuinely limited email stays flagged.
 */
export function loginEmailIsAdmin(
  adminEmails: string[] | undefined,
  ...candidateLoginEmails: (string | undefined)[]
): boolean {
  if (!adminEmails || adminEmails.length === 0) return false;
  const adminLocals = new Set(adminEmails.map(emailLocalPart).filter((l) => l.length > 0));
  if (adminLocals.size === 0) return false;
  return candidateLoginEmails.some((email) => {
    const local = emailLocalPart(email);
    return local.length > 0 && adminLocals.has(local);
  });
}
