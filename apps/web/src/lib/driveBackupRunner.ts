"use client";

import { CapacitorHttp } from "@capacitor/core";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { LocalBrowser } from "@starnet/local-browser-plugin";
import { collectAppData, createEncryptedBackupFile } from "./accountBackup";
import { getAutoBackupPassword } from "./autoBackup";
import {
  DriveError,
  DriveFile,
  DriveHttp,
  clearDriveLink,
  downloadDriveBackup,
  driveAccountEmail,
  ensureDriveFolder,
  getDriveLastUpload,
  isDriveLinked,
  isDriveUploadDue,
  listDriveBackups,
  recordDriveUpload,
  setDriveLinked,
  uploadAndPrune,
} from "./driveBackup";
import { exportAccountSessions, isRunningInAndroidApp } from "./localBrowser";

/**
 * Wires driveBackup.ts to the phone: Google sign-in through the LocalBrowser plugin
 * (DriveAuthorizer.java) and Drive's REST API through Capacitor's native HTTP (no browser CORS in
 * the way, and the upload session's Location header is readable).
 */

export type DriveResult<T = undefined> = ({ ok: true } & (T extends undefined ? unknown : { value: T })) | { ok: false; message: string };

const nativeHttp: DriveHttp = async (request) => {
  const response = await CapacitorHttp.request({
    method: request.method,
    url: request.url,
    headers: request.headers,
    data: request.data,
    responseType: request.responseType === "text" ? "text" : "json",
  });
  return { status: response.status, data: response.data, headers: response.headers ?? {} };
};

function authMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (code === "DRIVE_CONSENT_REQUIRED") return "Google Drive غير مربوط - اربطه من الإعدادات";
  if (code === "DRIVE_CANCELLED") return "لم تتم الموافقة على الوصول إلى Google Drive";
  // ApiException 10 = DEVELOPER_ERROR: no Android OAuth client matches this app's package + SHA-1.
  if (/\b10:/.test(message)) return "التطبيق غير مسجّل في Google Cloud بعد - تحقق من Package name و SHA-1 في OAuth client";
  return message || "تعذر الاتصال بحساب Google";
}

async function accessToken(interactive: boolean): Promise<string> {
  const { accessToken } = await LocalBrowser.authorizeDrive({ interactive });
  return accessToken;
}

/** Runs `fn` with a Drive token; a token Drive rejects (401) is dropped and retried once. */
async function withDrive<T>(interactive: boolean, fn: (token: string) => Promise<T>): Promise<T> {
  let token: string;
  try {
    token = await accessToken(interactive);
  } catch (err) {
    throw new Error(authMessage(err));
  }
  try {
    return await fn(token);
  } catch (err) {
    if (!(err instanceof DriveError) || err.status !== 401) throw err;
    await LocalBrowser.clearDriveToken({ accessToken: token }).catch(() => undefined);
    return fn(await accessToken(interactive));
  }
}

function failure(err: unknown): { ok: false; message: string } {
  return { ok: false, message: err instanceof Error ? err.message : "تعذر الاتصال بـ Google Drive" };
}

/** "ربط Google Drive": Google's account/consent screen, then the STARNET folder is created. */
export async function linkGoogleDrive(): Promise<DriveResult<string | null>> {
  if (!isRunningInAndroidApp()) return { ok: false, message: "ربط Google Drive يعمل داخل تطبيق Android فقط" };
  try {
    const email = await withDrive(true, async (token) => {
      await ensureDriveFolder(nativeHttp, token);
      return driveAccountEmail(nativeHttp, token);
    });
    setDriveLinked(email);
    return { ok: true, value: email };
  } catch (err) {
    return failure(err);
  }
}

/** Forgets the link on this phone and asks Google to revoke the app's access. Backups already in
 * Drive stay there. */
export async function unlinkGoogleDrive(): Promise<void> {
  try {
    const token = await accessToken(false);
    await CapacitorHttp.request({ method: "POST", url: `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}` });
    await LocalBrowser.clearDriveToken({ accessToken: token });
  } catch {
    // Not linked anymore on Google's side, or offline - forgetting it here is what matters.
  }
  clearDriveLink();
}

/**
 * Encrypts a full backup (same file as the daily auto-backup, same password) and uploads it.
 * Automatic runs (`force` false) happen at most once a day and never show a Google screen.
 */
export async function runDriveBackup(
  accounts: StarlinkAccountSummary[],
  force = false,
): Promise<{ status: "skipped" } | { status: "uploaded"; fileName: string } | { status: "failed"; message: string }> {
  if (!isRunningInAndroidApp() || !isDriveLinked()) return { status: "skipped" };
  if (!force && !isDriveUploadDue(getDriveLastUpload())) return { status: "skipped" };
  const password = getAutoBackupPassword();
  if (!password) {
    const message = "فعّل النسخ الاحتياطي التلقائي (كلمة المرور) أولًا - تُشفَّر به نسخة Drive";
    if (force) return { status: "failed", message };
    return { status: "skipped" };
  }
  try {
    const sessions = await exportAccountSessions(accounts.map((a) => a.id));
    const created = await createEncryptedBackupFile(accounts, sessions, password, collectAppData(window.localStorage));
    if (!created.ok) throw new Error(created.message);
    const file = await withDrive(force, (token) => uploadAndPrune(nativeHttp, token, created.fileContents));
    recordDriveUpload({ at: new Date().toISOString(), ok: true, fileName: file.name });
    return { status: "uploaded", fileName: file.name };
  } catch (err) {
    const message = failure(err).message;
    recordDriveUpload({ at: new Date().toISOString(), ok: false, message });
    return { status: "failed", message };
  }
}

export async function listGoogleDriveBackups(): Promise<DriveResult<DriveFile[]>> {
  try {
    const files = await withDrive(true, async (token) => listDriveBackups(nativeHttp, token, await ensureDriveFolder(nativeHttp, token)));
    return { ok: true, value: files };
  } catch (err) {
    return failure(err);
  }
}

export async function downloadGoogleDriveBackup(fileId: string): Promise<DriveResult<string>> {
  try {
    return { ok: true, value: await withDrive(true, (token) => downloadDriveBackup(nativeHttp, token, fileId)) };
  } catch (err) {
    return failure(err);
  }
}
