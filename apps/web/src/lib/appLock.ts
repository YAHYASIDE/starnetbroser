/**
 * Optional app-open PIN lock (الإعدادات → "قفل التطبيق"): when set, AppLockGate.tsx requires this
 * PIN before showing any page content. The PIN itself is never stored in plain text - only a
 * salted PBKDF2-SHA256 hash, the exact same primitive (and iteration count) backupCrypto.ts
 * already uses for the protected-backup password, reused here for consistency even though a
 * short numeric PIN's own entropy is what actually limits how much this protects against (this
 * guards a glance-over-the-shoulder/borrowed-phone scenario, never a determined attacker with
 * access to the device's own storage).
 */

const PIN_KEY = "starnet.appPinHash";
const PBKDF2_ITERATIONS = 210_000;
const SALT_LENGTH_BYTES = 16;

interface StoredPin {
  salt: string;
  hash: string;
}

function safeGet(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null) {
  try {
    if (typeof window === "undefined") return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private-browsing / storage-blocked - the app still works, it just won't remember the PIN.
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derivePinHash(pin: string, salt: Uint8Array): Promise<string> {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

/** True once a PIN has actually been set - AppLockGate only ever shows the lock screen when this
 * is true, so an operator who never opts in never sees it at all. */
export function hasAppPin(): boolean {
  return safeGet(PIN_KEY) !== null;
}

/** Hashes and stores `pin`, replacing whatever was there before (used for both the initial set
 * and a later change - callers that want to require the OLD pin first do so themselves via
 * verifyAppPin before calling this). */
export async function setAppPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const hash = await derivePinHash(pin, salt);
  const stored: StoredPin = { salt: toBase64(salt), hash };
  safeSet(PIN_KEY, JSON.stringify(stored));
}

export function clearAppPin(): void {
  safeSet(PIN_KEY, null);
}

/** False (never throws) for a missing/corrupted stored PIN, exactly like a wrong guess - a
 * broken record must never accidentally unlock the app. */
export async function verifyAppPin(pin: string): Promise<boolean> {
  const raw = safeGet(PIN_KEY);
  if (!raw) return false;
  let stored: StoredPin;
  try {
    stored = JSON.parse(raw) as StoredPin;
  } catch {
    return false;
  }
  if (!stored.salt || !stored.hash) return false;
  const candidate = await derivePinHash(pin, fromBase64(stored.salt));
  return candidate === stored.hash;
}

/** Leaving the app for longer than this (home button, another app) locks it again on return. */
export const RELOCK_AFTER_MS = 60_000;
/** Opening a device's Starlink browser also sends STAR NET to the background (it's a separate
 * Android Activity) - that's the app's own flow, so a hide starting this soon after it never
 * re-locks. */
const INTERNAL_LEAVE_GRACE_MS = 5_000;

let lastInternalLeaveAt = 0;

/** Called right before the app itself opens something that hides it (the device browser). */
export function markInternalLeave(now: number = Date.now()): void {
  lastInternalLeaveAt = now;
}

export function isInternalLeave(hiddenAt: number): boolean {
  return lastInternalLeaveAt > 0 && hiddenAt - lastInternalLeaveAt >= 0 && hiddenAt - lastInternalLeaveAt <= INTERNAL_LEAVE_GRACE_MS;
}

/** Whether coming back to the app after it was hidden at `hiddenAt` requires the PIN again. */
export function shouldRelock(hiddenAt: number | null, now: number, internal: boolean): boolean {
  if (hiddenAt === null || internal) return false;
  return now - hiddenAt >= RELOCK_AFTER_MS;
}

const FAILURES_KEY = "starnet.pinFailures";
/** Wrong PINs allowed before the lock screen starts making the operator wait. */
export const FREE_PIN_ATTEMPTS = 5;
const FIRST_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 15 * 60_000;

export interface PinFailures {
  count: number;
  lockedUntil: number;
}

const NO_FAILURES: PinFailures = { count: 0, lockedUntil: 0 };

/** Pure: the state after one more wrong PIN - 5 free tries, then 30s, 60s, 2m, ... up to 15m
 * after each further miss. */
export function registerPinFailure(state: PinFailures, now: number): PinFailures {
  const count = state.count + 1;
  if (count < FREE_PIN_ATTEMPTS) return { count, lockedUntil: 0 };
  const wait = Math.min(FIRST_LOCKOUT_MS * 2 ** (count - FREE_PIN_ATTEMPTS), MAX_LOCKOUT_MS);
  return { count, lockedUntil: now + wait };
}

export function lockoutRemainingMs(state: PinFailures, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

/** Survives closing/reopening the app, so killing it doesn't reset the wait. */
export function loadPinFailures(): PinFailures {
  const raw = safeGet(FAILURES_KEY);
  if (!raw) return NO_FAILURES;
  try {
    const parsed = JSON.parse(raw) as Partial<PinFailures>;
    const count = Number(parsed.count);
    const lockedUntil = Number(parsed.lockedUntil);
    return {
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
      lockedUntil: Number.isFinite(lockedUntil) && lockedUntil > 0 ? lockedUntil : 0,
    };
  } catch {
    return NO_FAILURES;
  }
}

export function savePinFailures(state: PinFailures): void {
  safeSet(FAILURES_KEY, state.count > 0 ? JSON.stringify(state) : null);
}

/** "دقيقتان"-style wait text for the lock screen. */
export function formatLockoutWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} ثانية`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} دقيقة`;
}
