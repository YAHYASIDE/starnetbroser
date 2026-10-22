// 🖥️🔄 «تحديث من Starlink» on the laptop (his Oct 22 2026 choice) - the pure parts of the phone's sync
// (SettleTracker + StarlinkExtractorSupport): read a page until it has settled, what counts as "the same
// page", and the in-run rules that a later page never undoes. Tested in syncplan.test.js.

/** Same timings as the phone's AccountBrowserActivity. */
const T = {
  READ_POLL_MS: 500,
  AFTER_TAP_ADVANCE_MS: 300,
  CURRENT_PAGE_MAX_MS: 3000,
  AFTER_TAP_MIN_MS: 600,
  AFTER_TAP_MAX_MS: 6000,
  DEVICES_MAX_MS: 7000,
  BILLING_MAX_MS: 9000,
  HOME_MIN_MS: 3500,
  HOME_MAX_MS: 8000,
  SYNC_STEP_DELAY_MS: 1500,
  ENGLISH_RELOAD_DELAY_MS: 4500,
  HOME_SETTLE_DELAY_MS: 6000,
  MAX_ENGLISH_STEPS: 7,
};

/** Read until the same non-empty result came back `stableReads` times (and is `good`), never before
 * minMs, never after maxMs (then the last non-empty read is kept). */
class SettleTracker {
  constructor(minMs, maxMs, stableReads) {
    this.minMs = minMs;
    this.maxMs = Math.max(minMs, maxMs);
    this.stableReads = Math.max(1, stableReads);
    this.last = "";
    this.streak = 0;
  }

  offer(key, good, elapsedMs) {
    const value = key || "";
    if (!value) this.streak = 0;
    else this.streak = value === this.last ? this.streak + 1 : 1;
    this.last = value;
    if (elapsedMs >= this.maxMs) return true;
    return elapsedMs >= this.minMs && good && this.streak >= this.stableReads;
  }
}

/** A read's comparable form ("" = nothing found) - its dot trace left out. */
function settleKey(fields) {
  if (!fields || typeof fields !== "object") return "";
  const copy = { ...fields };
  delete copy.dotTrace;
  return Object.keys(copy).length ? JSON.stringify(copy) : "";
}

const coloredDot = (s) => s === "online" || s === "offline" || s === "warning";
const hasColoredDot = (f) => Boolean(f) && (coloredDot(f.dishStatus) || coloredDot(f.wifiStatus));
const hasRenewalDate = (f) => Boolean(f) && typeof f.renewalDate === "string" && f.renewalDate.trim() !== "";
const hasHomeRead = (f) => Boolean(f) && "travelRegistrationRequired" in f;

/** A "stopped" seen earlier in the run is never undone by a later page (removes the later
 * active/standby). Mutates `fields`; returns whether the run has seen it. */
function keepStoppedWithinRun(fields, runSawStopped) {
  const status = fields.serviceStatus || "";
  if (status === "suspended" || status === "canceled") return true;
  if (runSawStopped && (status === "active" || status === "standby")) delete fields.serviceStatus;
  return runSawStopped;
}

/** Home's "restricted" banner seen once in the run is never undone by a read without it. */
function keepRestrictedWithinRun(fields, runSawRestricted) {
  if (!("isRestricted" in fields)) return runSawRestricted;
  if (fields.isRestricted === true) return true;
  if (runSawRestricted) delete fields.isRestricted;
  return runSawRestricted;
}

/** The account's own pages (signed in), not the public site or the sign-in. */
function isAccountPage(url) {
  try {
    const u = new URL(url);
    return /(^|\.)starlink\.com$/i.test(u.hostname) && u.pathname.startsWith("/account");
  } catch {
    return false;
  }
}

module.exports = { T, SettleTracker, settleKey, hasColoredDot, hasRenewalDate, hasHomeRead, keepStoppedWithinRun, keepRestrictedWithinRun, isAccountPage };
