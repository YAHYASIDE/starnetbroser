/**
 * 📮 «بريد على نطاقي» (his Oct 17 2026 choice, instead of making an Outlook mailbox per device): his own
 * domain forwards every address on it to his «بريد الرموز» Gmail, so a new device's email is just a name
 * on that domain - «ahmed.salem427@his-domain» works at once, with no signup at all - and its Starlink
 * codes are read from that Gmail by the device's own address (ForwardedMail.java). A phone setting
 * (`starnet.`), handed to the phone on every start.
 */

import { LocalBrowser } from "@starnet/local-browser-plugin";
import { isRunningInAndroidApp } from "./localBrowser";

const KEY = "starnet.mailDomain";

/** "his-domain.com" from what he typed («@His-Domain.com », «https://his-domain.com/»); "" when not a domain. */
export function normalizeMailDomain(raw: string): string {
  const d = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^@/, "").split("/")[0] ?? "";
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : "";
}

export function isOnMailDomain(email: string | undefined, domain: string): boolean {
  return Boolean(domain && email?.trim().toLowerCase().endsWith(`@${domain}`));
}

export function loadMailDomain(): string {
  try {
    return normalizeMailDomain(window.localStorage.getItem(KEY) ?? "");
  } catch {
    return "";
  }
}

/** Saves it (or clears it with "") and tells the phone; the saved domain back. */
export function saveMailDomain(raw: string): string {
  const domain = normalizeMailDomain(raw);
  try {
    if (domain) window.localStorage.setItem(KEY, domain);
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
  void pushMailDomain(domain);
  return domain;
}

export async function pushMailDomain(domain: string = loadMailDomain()): Promise<void> {
  if (!isRunningInAndroidApp()) return;
  try {
    await LocalBrowser.setMailDomain({ domain });
  } catch {
    // tried again on the next start
  }
}
