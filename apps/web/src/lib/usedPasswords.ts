/**
 * «كلمات المرور المستعملة»: every password typed on the devices (Starlink, Wi-Fi code, email
 * codes), most used first, then the newest - derived from the devices themselves, never a second
 * stored list (a password removed from every device leaves it). Shown as-is, as the operator chose;
 * stays on the phone like the devices' own fields.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";

export interface UsedPassword {
  value: string;
  /** How many devices use it (any of their fields). */
  count: number;
  /** Those devices' names, for the settings list. */
  devices: string[];
}

type PasswordFields = Pick<StarlinkAccountSummary, "name" | "starlinkPassword" | "wifiPassword" | "expectedEmailPassword" | "extraEmails" | "deletedAt">;

function passwordsOf(account: PasswordFields): string[] {
  const values = [account.starlinkPassword, account.wifiPassword, account.expectedEmailPassword, ...(account.extraEmails ?? []).map((e) => e.password)];
  return [...new Set(values.map((v) => v?.trim() ?? "").filter((v) => v.length > 0))];
}

/** `accounts` newest first (the home list's own order): a tie in count goes to the newest. */
export function usedPasswords(accounts: PasswordFields[]): UsedPassword[] {
  const byValue = new Map<string, UsedPassword & { firstSeen: number }>();
  accounts.forEach((account, index) => {
    if (account.deletedAt) return;
    for (const value of passwordsOf(account)) {
      const row = byValue.get(value) ?? { value, count: 0, devices: [], firstSeen: index };
      row.count += 1;
      row.devices.push(account.name);
      byValue.set(value, row);
    }
  });
  return [...byValue.values()]
    .sort((a, b) => b.count - a.count || a.firstSeen - b.firstSeen)
    .map(({ value, count, devices }) => ({ value, count, devices }));
}
