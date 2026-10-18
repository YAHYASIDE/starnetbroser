/**
 * 🟩 The live line of a sync run (his Oct 18 2026 ask, instead of one bubble per device): a green
 * line on the right of the screen that fills as the run's devices finish, the device being read on
 * it, and - tapped - the run's details: done, not finished, failed (and why), with a retry. One run
 * at a time, visible (each device's browser) or 🌙 background; kept on the phone (`starnet.`) so it
 * survives the app going to the browser and back. Pure, except load/save.
 */

import { outcomeLabel, type OutcomeRecord, type SyncOutcome } from "./syncReport";

export interface SyncRun {
  label: string;
  mode: "visible" | "background";
  ids: string[];
  names: Record<string, string>;
  startedAt: number;
  /** Each device's last outcome. */
  results: Record<string, SyncOutcome>;
  /** Fields a read changed, per device (from the applied sync). */
  changes: Record<string, number>;
  /** The device being read now (visible runs). */
  current?: string;
  /** The last time anything happened - a background run stopped by hand just goes quiet. */
  lastActivityAt: number;
  endedAt?: number;
}

export type RunRowState = "ok" | "nothing" | "failed" | "current" | "pending";

export interface RunRow {
  id: string;
  name: string;
  state: RunRowState;
  /** «✅ تمت · 3 حقول» / «🔒 غير مسجّل في Starlink» / «⏳ لم يُحدَّث بعد». */
  status: string;
  /** What went wrong, in plain words - failed rows only. */
  problem?: string;
}

/** A background run with no news for this long is over (stopped from its notification). */
export const RUN_QUIET_MS = 10 * 60_000;

const PROBLEMS: Partial<Record<SyncOutcome, string>> = {
  nothing: "فُتحت صفحة Starlink لكن لم تُقرأ منها بيانات - غالبًا لم تكتمل الصفحة. أعد المحاولة.",
  saveFailed: "قُرئت البيانات لكن تعذّر حفظها على الهاتف - أعد المحاولة.",
  signedOut: "الجهاز غير مسجّل الدخول في Starlink - افتح الحساب وسجّل الدخول ثم أعد المحاولة.",
  stuck: "الصفحة لم تستجب دقيقتين فتُخطّي الجهاز - أعد المحاولة.",
  closed: "أُغلقت صفحة الجهاز باليد قبل أن تنتهي.",
  rateLimited: "ستارلينك طلبت التمهّل (429) - أعد المحاولة بعد 20 دقيقة.",
};

const FAILED: SyncOutcome[] = ["saveFailed", "signedOut", "stuck", "closed", "rateLimited"];

export function startRun(devices: { id: string; name: string }[], label: string, mode: SyncRun["mode"], now = Date.now()): SyncRun {
  return {
    label,
    mode,
    ids: devices.map((d) => d.id),
    names: Object.fromEntries(devices.map((d) => [d.id, d.name])),
    startedAt: now,
    results: {},
    changes: {},
    lastActivityAt: now,
  };
}

/** The run's own devices' outcomes (others are ignored); it ends by itself once every device has one. */
export function withOutcomes(run: SyncRun, records: OutcomeRecord[], now = Date.now()): SyncRun {
  const mine = records.filter((r) => run.ids.includes(r.accountId));
  if (mine.length === 0) return run;
  const results = { ...run.results };
  for (const r of mine) results[r.accountId] = r.outcome;
  const next: SyncRun = { ...run, results, lastActivityAt: now };
  if (next.current && results[next.current]) delete next.current;
  return run.ids.every((id) => results[id]) ? { ...next, endedAt: run.endedAt ?? now } : next;
}

/** The fields an applied sync changed; true when every message was this run's (its bubble is then not needed). */
export function withChanges(run: SyncRun, messages: { accountId: string; updatedCount: number }[], now = Date.now()): { run: SyncRun; absorbed: boolean } {
  if (messages.length === 0 || !messages.every((m) => run.ids.includes(m.accountId))) return { run, absorbed: false };
  const changes = { ...run.changes };
  for (const m of messages) changes[m.accountId] = Math.max(changes[m.accountId] ?? 0, m.updatedCount);
  return { run: { ...run, changes, lastActivityAt: now }, absorbed: true };
}

export function withCurrent(run: SyncRun, id: string, now = Date.now()): SyncRun {
  return { ...run, current: id, lastActivityAt: now };
}

/** Ended early (stopped, 429) or on its last device. */
export function endRun(run: SyncRun, now = Date.now()): SyncRun {
  if (run.endedAt) return run;
  const next = { ...run, endedAt: now };
  delete next.current;
  return next;
}

export function isRunOver(run: SyncRun, now = Date.now()): boolean {
  return Boolean(run.endedAt) || (run.mode === "background" && now - run.lastActivityAt > RUN_QUIET_MS);
}

export function runCounts(run: SyncRun) {
  const states = runRows(run).map((r) => r.state);
  const count = (s: RunRowState) => states.filter((x) => x === s).length;
  const ok = count("ok");
  const nothing = count("nothing");
  const failed = count("failed");
  return { total: run.ids.length, done: ok + nothing + failed, ok, nothing, failed, pending: count("pending") + count("current") };
}

/** 0..1 - how full the line is. */
export function runFill(run: SyncRun, now = Date.now()): number {
  if (run.ids.length === 0) return 1;
  if (isRunOver(run, now)) return 1;
  return runCounts(run).done / run.ids.length;
}

function stateOf(run: SyncRun, id: string): RunRowState {
  const outcome = run.results[id];
  if (outcome === "ok") return "ok";
  if (outcome === "nothing") return "nothing";
  if (outcome && FAILED.includes(outcome)) return "failed";
  return run.current === id ? "current" : "pending";
}

/** Every device of the run: failed first, then not finished, then «بلا بيانات», then done. */
export function runRows(run: SyncRun): RunRow[] {
  const order: Record<RunRowState, number> = { failed: 0, current: 1, pending: 2, nothing: 3, ok: 4 };
  return run.ids
    .map((id): RunRow => {
      const state = stateOf(run, id);
      const outcome = run.results[id];
      const changed = run.changes[id] ?? 0;
      const status =
        state === "ok" ? `✅ تمت${changed > 0 ? ` · ${changed} ${changed === 1 ? "حقل" : "حقول"}` : " · لا تغييرات"}`
          : state === "current" ? "🔄 يُقرأ الآن"
          : state === "pending" ? (run.endedAt ? "⏹ لم يُحدَّث" : "⏳ في الانتظار")
          : outcomeLabel(outcome);
      const problem = state === "failed" || state === "nothing" ? PROBLEMS[outcome!] : state === "pending" && run.endedAt ? "توقّفت المزامنة قبل أن يصل دوره." : undefined;
      return { id, name: run.names[id] ?? "جهاز", state, status, ...(problem ? { problem } : {}) };
    })
    .sort((a, b) => order[a.state] - order[b.state]);
}

/** What the line says: the device being read (or the last one done), or the run's end. */
export function runCaption(run: SyncRun, now = Date.now()): string {
  const c = runCounts(run);
  if (isRunOver(run, now)) return `✓ انتهت ${c.done}/${c.total}${c.failed ? ` · ❌ ${c.failed}` : ""}`;
  if (run.current) return `${run.names[run.current] ?? ""} · ${c.done + 1}/${c.total}`;
  return `${c.done}/${c.total}`;
}

/** The devices to try again: failed, «بلا بيانات», and those never reached. */
export function retryIds(run: SyncRun): string[] {
  return runRows(run).filter((r) => r.state !== "ok").map((r) => r.id);
}

const KEY = "starnet.syncRun";

export function loadSyncRun(): SyncRun | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as SyncRun | null;
    return parsed && Array.isArray(parsed.ids) && typeof parsed.startedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSyncRun(run: SyncRun | null): void {
  try {
    if (run) window.localStorage.setItem(KEY, JSON.stringify(run));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}
