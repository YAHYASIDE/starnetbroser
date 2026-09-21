import { StarlinkAccountSummary } from "@starnet/shared";
import { decryptBackup, encryptBackup, WrongPasswordError } from "./backupCrypto";

/** accountId -> (url -> raw combined cookie string) - same shape LocalBrowser.exportSessionCookies/
 * importSessionCookies use on the native side. */
export type SessionsByAccount = Record<string, Record<string, string>>;

export interface BackupEnvelope {
  version: 1;
  exportedAt: string;
  accounts: StarlinkAccountSummary[];
  sessions: SessionsByAccount;
}

/** True only for the exact shape buildBackupEnvelope produces - never throws, so callers can use
 * this directly as a type guard on whatever decryptBackup happened to hand back. */
export function isBackupEnvelope(value: unknown): value is BackupEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<BackupEnvelope>;
  return (
    candidate.version === 1 &&
    typeof candidate.exportedAt === "string" &&
    Array.isArray(candidate.accounts) &&
    typeof candidate.sessions === "object" &&
    candidate.sessions !== null
  );
}

export function buildBackupEnvelope(accounts: StarlinkAccountSummary[], sessions: SessionsByAccount): BackupEnvelope {
  return { version: 1, exportedAt: new Date().toISOString(), accounts, sessions };
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
): Promise<CreateBackupResult> {
  try {
    const envelope = buildBackupEnvelope(accounts, sessions);
    const encrypted = await encryptBackup(envelope, password);
    return { ok: true, fileContents: JSON.stringify(encrypted) };
  } catch {
    return { ok: false, message: "تعذر إنشاء النسخة الاحتياطية" };
  }
}

export type ReadBackupResult =
  | { ok: true; accounts: StarlinkAccountSummary[]; sessions: SessionsByAccount }
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
  return { ok: true, accounts: decrypted.accounts, sessions: decrypted.sessions };
}
