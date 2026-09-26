import { StarlinkAccountSummary } from "@starnet/shared";
import { decryptBackup, encryptBackup, WrongPasswordError } from "./backupCrypto";

/** accountId -> (url -> raw combined cookie string) - same shape LocalBrowser.exportSessionCookies/
 * importSessionCookies use on the native side. */
export type SessionsByAccount = Record<string, Record<string, string>>;

/** Every app-data localStorage key (clients, suppliers, ledger, invoices, store, cash,
 * representatives, currencies, balances, ...) - all share this prefix, so a backup automatically
 * covers stores added later too. Settings/tokens/PIN use "starnet." and are never included. */
export const APP_DATA_KEY_PREFIX = "starnet_";

/** key -> raw stored JSON string, exactly as found in localStorage. */
export type AppDataSnapshot = Record<string, string>;

export interface BackupEnvelope {
  /** 1: accounts + sessions only. 2: also `data`, the full app-data snapshot. */
  version: 1 | 2;
  exportedAt: string;
  accounts: StarlinkAccountSummary[];
  sessions: SessionsByAccount;
  data?: AppDataSnapshot;
}

interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Reads every app-data key (APP_DATA_KEY_PREFIX) out of `storage`. */
export function collectAppData(storage: KeyValueStorage): AppDataSnapshot {
  const data: AppDataSnapshot = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(APP_DATA_KEY_PREFIX)) continue;
    const value = storage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return data;
}

/** Replaces every app-data key in `storage` with the snapshot's - keys not in the snapshot are
 * removed, so the restored state is exactly the backup's, never a mix of old and new. Keys outside
 * APP_DATA_KEY_PREFIX (settings, login tokens, app PIN) are never touched. Returns how many keys
 * were written. */
/** Replaces every app-data key with the backup's. All or nothing: if any write fails (typically
 * the phone's storage is full), whatever was already written is removed and the data that was
 * there before is put back exactly, then the error is rethrown - a failed restore never leaves
 * the phone half-restored or empty. */
export function restoreAppData(storage: KeyValueStorage, data: AppDataSnapshot): number {
  const before = collectAppData(storage);
  const clearAppKeys = () => {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(APP_DATA_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  };
  clearAppKeys();
  let written = 0;
  try {
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith(APP_DATA_KEY_PREFIX) || typeof value !== "string") continue;
      storage.setItem(key, value);
      written++;
    }
  } catch (err) {
    clearAppKeys();
    for (const [key, value] of Object.entries(before)) storage.setItem(key, value);
    throw err;
  }
  return written;
}

/** True only for the exact shape buildBackupEnvelope produces - never throws, so callers can use
 * this directly as a type guard on whatever decryptBackup happened to hand back. */
export function isBackupEnvelope(value: unknown): value is BackupEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<BackupEnvelope>;
  return (
    (candidate.version === 1 || candidate.version === 2) &&
    typeof candidate.exportedAt === "string" &&
    Array.isArray(candidate.accounts) &&
    typeof candidate.sessions === "object" &&
    candidate.sessions !== null &&
    (candidate.data === undefined || (typeof candidate.data === "object" && candidate.data !== null))
  );
}

export function buildBackupEnvelope(
  accounts: StarlinkAccountSummary[],
  sessions: SessionsByAccount,
  data: AppDataSnapshot = {},
): BackupEnvelope {
  return { version: 2, exportedAt: new Date().toISOString(), accounts, sessions, data };
}

/**
 * Merges an imported account list onto the existing one: an imported account with the same `id`
 * as an existing one fully REPLACES it (this is an explicit user-initiated restore, not a partial
 * field sync like mergeSyncedFields), keeping its original position in the list; an id not seen
 * before is appended at the end. Never mutates either input array.
 */
export function mergeImportedAccounts(
  existing: StarlinkAccountSummary[],
  imported: StarlinkAccountSummary[],
): StarlinkAccountSummary[] {
  const byId = new Map(existing.map((account) => [account.id, account]));
  for (const account of imported) {
    byId.set(account.id, account);
  }
  return Array.from(byId.values());
}

export type CreateBackupResult = { ok: true; fileContents: string } | { ok: false; message: string };

/** Builds the envelope and encrypts it - the returned string is the entire contents of the
 * `.starnetbackup` file, opaque without `password`. */
export async function createEncryptedBackupFile(
  accounts: StarlinkAccountSummary[],
  sessions: SessionsByAccount,
  password: string,
  data: AppDataSnapshot = {},
): Promise<CreateBackupResult> {
  try {
    const envelope = buildBackupEnvelope(accounts, sessions, data);
    const encrypted = await encryptBackup(envelope, password);
    return { ok: true, fileContents: JSON.stringify(encrypted) };
  } catch {
    return { ok: false, message: "تعذر إنشاء النسخة الاحتياطية" };
  }
}

export type ReadBackupResult =
  | {
      ok: true;
      accounts: StarlinkAccountSummary[];
      sessions: SessionsByAccount;
      /** Empty for a version-1 (accounts-only) backup. */
      data: AppDataSnapshot;
      exportedAt: string;
    }
  | { ok: false; message: string };

/** Parses `fileContents` as an EncryptedBackup envelope, decrypts it with `password`, and
 * validates the decrypted shape - a wrong password, a non-backup file, and a backup from a future
 * incompatible version all surface as a distinct, honest message rather than a generic failure or
 * (worse) a crash on malformed data. */
export async function readEncryptedBackupFile(fileContents: string, password: string): Promise<ReadBackupResult> {
  let outer: unknown;
  try {
    outer = JSON.parse(fileContents);
  } catch {
    return { ok: false, message: "هذا ليس ملف نسخة احتياطية صالح" };
  }
  if (
    typeof outer !== "object" ||
    outer === null ||
    !("v" in outer) ||
    !("salt" in outer) ||
    !("iv" in outer) ||
    !("ciphertext" in outer)
  ) {
    return { ok: false, message: "هذا ليس ملف نسخة احتياطية صالح" };
  }

  let decrypted: unknown;
  try {
    decrypted = await decryptBackup(outer as Parameters<typeof decryptBackup>[0], password);
  } catch (err) {
    return { ok: false, message: err instanceof WrongPasswordError ? err.message : "تعذر قراءة الملف" };
  }

  if (!isBackupEnvelope(decrypted)) {
    return { ok: false, message: "محتوى الملف غير متوافق مع هذا الإصدار من التطبيق" };
  }
  return {
    ok: true,
    accounts: decrypted.accounts,
    sessions: decrypted.sessions,
    data: decrypted.data ?? {},
    exportedAt: decrypted.exportedAt,
  };
}
