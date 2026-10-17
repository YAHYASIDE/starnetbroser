/**
 * 🔵 The home page's extra circles (his Oct 17 2026 ask «أضف أيقونات: غير ملغي، ملغي، تم تجديد، SIS،
 * ROM، 100G، والمندوب كل مندوب أيقونة خاصة به … ومكان لإزالة المكرر»): which devices each one holds,
 * and the 🔍 «فحص» of a circle (long press): after its devices were synced, what that circle's own
 * question turned out to be - e.g. «ملغي»: which are really cancelled, which no longer are. Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { isRenewalEntry } from "./renewals";
import type { LedgerByAccount } from "./ledgerStore";
import { effectiveServiceStatus, planBadgeLabel } from "./status";
import { cancellationState } from "./subscriptionCancel";

/** Cancelled on Starlink: an end date is set («scheduled to end»), or the service already ended. */
export function isCanceledDevice(account: StarlinkAccountSummary): boolean {
  return cancellationState(account).cancelled || effectiveServiceStatus(account) === "canceled";
}

/** «SIS» / «ROM» / «100G» - the plan pill the card shows. */
export function planRing(account: StarlinkAccountSummary): "SIS" | "ROM" | "100G" | undefined {
  const label = planBadgeLabel(account.planName);
  return label === "SIS" || label === "ROM" || label === "100G" ? label : undefined;
}

/** 🔄 «تم تجديد»: devices with a renewal recorded today (lib/renewals.ts decides what a renewal is). */
export function renewedOn(ledger: LedgerByAccount, day: string): Set<string> {
  const ids = new Set<string>();
  for (const [accountId, entries] of Object.entries(ledger)) {
    if (entries.some((e) => e.date === day && isRenewalEntry(e, entries))) ids.add(accountId);
  }
  return ids;
}

// ---- 🔗 «مكرر»: remove every duplicate at once ----

export interface DuplicatePair {
  keep: StarlinkAccountSummary;
  drop: StarlinkAccountSummary;
}

/**
 * Each twin pair once (same email or KIT - lib/deviceMerge.ts `deviceTwins`), with the device kept:
 * the operator's own over one a rep added, then the one with more operations, then the one added
 * first. The other is merged into it.
 */
export function duplicatePairs(
  twins: Map<string, StarlinkAccountSummary>,
  accounts: StarlinkAccountSummary[],
  ledger: LedgerByAccount,
): DuplicatePair[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const pairs: DuplicatePair[] = [];
  const score = (a: StarlinkAccountSummary) => (ledger[a.id] ?? []).length;
  const addedAt = (a: StarlinkAccountSummary) => a.addedAt || a.addedByRepAt || "";
  for (const [id, twin] of twins) {
    const self = byId.get(id);
    if (!self || seen.has(self.id) || seen.has(twin.id)) continue;
    seen.add(self.id);
    seen.add(twin.id);
    const [keep, drop] = [self, twin].sort((a, b) => {
      const rep = Number(Boolean(a.addedByRepId)) - Number(Boolean(b.addedByRepId));
      if (rep !== 0) return rep;
      const ops = score(b) - score(a);
      if (ops !== 0) return ops;
      const day = addedAt(a).localeCompare(addedAt(b));
      return day !== 0 ? day : a.id.localeCompare(b.id);
    });
    pairs.push({ keep, drop });
  }
  return pairs;
}

// ---- 🔍 a circle's check ----

/** What a circle's check is about, in his words. */
export interface RingQuestion {
  /** «ملغي» - the circle's label. */
  label: string;
  /** Whether a device answers the circle's question with yes. */
  test: (account: StarlinkAccountSummary) => boolean;
  /** «ملغي فعلًا» / «لم يعد ملغيًا». */
  yes: string;
  no: string;
}

export type RingOutcome = "ok" | "nothing" | "saveFailed" | "signedOut" | "stuck" | "closed" | "rateLimited";

export interface RingCheckReport {
  text: string;
  yes: string[];
  changed: string[];
  unchecked: string[];
}

/**
 * The report of a circle's check: the devices that answered yes now, the ones whose answer changed
 * since the check started (`before`), and the ones that couldn't be read (not «ok»).
 */
export function ringCheckReport(
  question: RingQuestion,
  ids: string[],
  before: Record<string, boolean>,
  accounts: StarlinkAccountSummary[],
  results: Record<string, RingOutcome | undefined>,
): RingCheckReport {
  const yes: string[] = [];
  const no: string[] = [];
  const changed: string[] = [];
  const unchecked: string[] = [];
  for (const id of ids) {
    const account = accounts.find((a) => a.id === id);
    if (!account) continue;
    const name = account.name || "جهاز";
    if (results[id] !== "ok") {
      unchecked.push(name);
      continue;
    }
    const now = question.test(account);
    (now ? yes : no).push(name);
    if (before[id] !== undefined && before[id] !== now) changed.push(`${name}: ${now ? question.yes : question.no}`);
  }
  const lines = [`🔍 فحص «${question.label}» - ${ids.length} جهاز`];
  lines.push(`✓ ${question.yes}: ${yes.length}${yes.length ? ` (${yes.slice(0, 20).join("، ")}${yes.length > 20 ? "…" : ""})` : ""}`);
  lines.push(`• ${question.no}: ${no.length}`);
  if (changed.length) lines.push(`🔄 تغيّر بعد الفحص (${changed.length}): ${changed.slice(0, 20).join("، ")}`);
  if (unchecked.length) lines.push(`⚠️ لم يُفحص (${unchecked.length}): ${unchecked.slice(0, 20).join("، ")}`);
  return { text: lines.join("\n"), yes, changed, unchecked };
}

// ---- the run in progress (survives the app going to the background) ----

export interface RingCheckRun {
  kind: string;
  label: string;
  ids: string[];
  before: Record<string, boolean>;
  results: Record<string, RingOutcome>;
  startedAt: number;
}

/** A run left unfinished (stopped by hand) is forgotten after 3 hours. */
export const RING_CHECK_MAX_MS = 3 * 3_600_000;

/** Adds the outcomes that belong to this run; `finished` once every device has one. */
export function absorbRingResults(
  run: RingCheckRun,
  records: { accountId: string; outcome: RingOutcome }[],
  now: number,
): { run: RingCheckRun | null; finished: RingCheckRun | null } {
  const results = { ...run.results };
  for (const record of records) if (run.ids.includes(record.accountId)) results[record.accountId] = record.outcome;
  const next = { ...run, results };
  if (run.ids.every((id) => results[id])) return { run: null, finished: next };
  if (now - run.startedAt > RING_CHECK_MAX_MS) return { run: null, finished: Object.keys(results).length ? next : null };
  return { run: next, finished: null };
}

const KEY = "starnet.ringCheck";

export function loadRingCheck(): RingCheckRun | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as RingCheckRun | null;
    return parsed && Array.isArray(parsed.ids) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRingCheck(run: RingCheckRun | null): void {
  try {
    if (run) window.localStorage.setItem(KEY, JSON.stringify(run));
    else window.localStorage.removeItem(KEY);
  } catch {
    // the report is lost, the sync itself isn't
  }
}
