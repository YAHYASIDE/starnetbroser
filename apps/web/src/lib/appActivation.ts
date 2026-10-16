/**
 * 🔐 «تفعيل التطبيق» (his Oct 16 2026 ask: «أي نسخة تنزل من التطبيق تكون محمية بكود… عندما يأخذ أحد نسخة من
 * التطبيق لا يمكنه تشغيله»; his choices: asked once after installing, and on a rep's phone he types it himself).
 *
 * The code itself is never in the app: only a random salt and SHA-256(PBKDF2(code, salt)). Typing the right
 * code derives the PBKDF2 «proof» and keeps it on the phone (`starnet.` key - not in the backup, so a restored or
 * copied phone asks again). Opening the app re-checks the kept proof against the check, so the flag can't be
 * faked with a "true" - it takes the code. A wrong guess costs a full PBKDF2 run, and 5 in a row start a wait.
 * Honest limit: an app on the phone can be taken apart by an expert; this stops anyone who just installs a copy.
 */

export interface ActivationConfig {
  /** hex */
  salt: string;
  iterations: number;
  /** hex SHA-256 of the 32-byte PBKDF2 proof */
  check: string;
}

export const ACTIVATION: ActivationConfig = {
  salt: "cccc94df9b9a4b634fefefb642df2716",
  iterations: 210000,
  check: "94256e334590c843432a4eb8bca63f42e14c059c6984dbeba431fedf75d6383e",
};

const PROOF_KEY = "starnet.activation";
const FAILURES_KEY = "starnet.activationFailures";

const toHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array((hex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

/** PBKDF2-SHA256 of what he typed (spaces around it ignored) → the proof, hex. */
export async function deriveProof(code: string, config: ActivationConfig = ACTIVATION): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code.trim()), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(config.salt), iterations: config.iterations }, key, 256);
  return toHex(bits);
}

/** A kept proof is valid only if it hashes to the check (constant-time enough for a local check). */
export async function isValidProof(proof: string | null, config: ActivationConfig = ACTIVATION): Promise<boolean> {
  if (!proof || !/^[0-9a-f]{64}$/.test(proof)) return false;
  return (await sha256Hex(fromHex(proof))) === config.check;
}

/** The typed code → its proof when right, null when wrong. */
export async function checkActivationCode(code: string, config: ActivationConfig = ACTIVATION): Promise<string | null> {
  if (!code.trim()) return null;
  const proof = await deriveProof(code, config);
  return (await isValidProof(proof, config)) ? proof : null;
}

// ---- wrong guesses: 5 free, then 30 s, 1 m, 2 m … up to 30 m (survives closing the app) ----

export interface ActivationFailures {
  count: number;
  lockedUntil: number;
}

const FREE_ATTEMPTS = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 30 * 60_000;

export function registerActivationFailure(state: ActivationFailures, now: number): ActivationFailures {
  const count = state.count + 1;
  if (count < FREE_ATTEMPTS) return { count, lockedUntil: 0 };
  return { count, lockedUntil: now + Math.min(FIRST_WAIT_MS * 2 ** (count - FREE_ATTEMPTS), MAX_WAIT_MS) };
}

// ---- this phone ----

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // nothing to do - the gate asks again next time
  }
}

export async function isThisPhoneActivated(): Promise<boolean> {
  return isValidProof(read(PROOF_KEY));
}

export function keepActivationProof(proof: string): void {
  write(PROOF_KEY, proof);
  write(FAILURES_KEY, null);
}

export function loadActivationFailures(): ActivationFailures {
  try {
    const parsed = JSON.parse(read(FAILURES_KEY) ?? "null") as Partial<ActivationFailures> | null;
    const count = Number(parsed?.count);
    const lockedUntil = Number(parsed?.lockedUntil);
    return { count: Number.isFinite(count) && count > 0 ? count : 0, lockedUntil: Number.isFinite(lockedUntil) ? lockedUntil : 0 };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

export function saveActivationFailures(state: ActivationFailures): void {
  write(FAILURES_KEY, JSON.stringify(state));
}
