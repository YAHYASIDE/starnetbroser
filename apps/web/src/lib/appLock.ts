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
