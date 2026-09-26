/**
 * النسخ الاحتياطي إلى Google Drive: the same encrypted backup file as the daily auto-backup
 * (autoBackup.ts), also uploaded to a "STARNET" folder in the operator's own Google Drive, so the
 * data survives losing or breaking the phone. Only the drive.file scope is used - the app sees the
 * files it created and nothing else in that Drive.
 *
 * This module is the Drive REST client and its bookkeeping, with the HTTP transport injected so
 * it runs (and is tested) without a phone; driveBackupRunner.ts wires it to Google sign-in and
 * Capacitor's native HTTP. Only "linked / email / last upload" live on the phone (`starnet.`
 * settings keys, never inside a backup); the access token is never stored.
 */

export const DRIVE_FOLDER_NAME = "STARNET";
export const DRIVE_KEEP = 30;
const FILE_PREFIX = "starnet-drive-";
const FILE_SUFFIX = ".starnetbackup";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export interface DriveRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  headers: Record<string, string>;
  data?: unknown;
  /** "text" for a file download, whose body must come back exactly as stored. */
  responseType?: "json" | "text";
}

export interface DriveResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export type DriveHttp = (request: DriveRequest) => Promise<DriveResponse>;

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

export interface DriveFile {
  id: string;
  name: string;
  size?: number;
  createdTime?: string;
}

/** starnet-drive-2026-09-26-0930.starnetbackup - sortable, and a manual upload on the same day
 * never collides with the automatic one. */
export function driveBackupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${FILE_PREFIX}${date}-${pad(now.getHours())}${pad(now.getMinutes())}${FILE_SUFFIX}`;
}

export function isDriveBackupName(name: string): boolean {
  return name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX);
}

/** "2026-09-26 09:30" from a backup's file name, for the restore list. */
export function driveBackupLabel(name: string): string {
  const m = /^starnet-drive-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})\.starnetbackup$/.exec(name);
  return m ? `${m[1]} ${m[2]}:${m[3]}` : name;
}

/** Backups beyond the newest `keep` (by name = by time) - what to delete after an upload. Files
 * the app didn't name itself are never touched. */
export function driveFilesToPrune(files: DriveFile[], keep = DRIVE_KEEP): DriveFile[] {
  const ours = files.filter((f) => isDriveBackupName(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  return ours.slice(0, Math.max(0, ours.length - keep));
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function asObject(data: unknown): Record<string, unknown> {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function driveErrorMessage(response: DriveResponse): string {
  const error = asObject(response.data).error as { message?: string } | undefined;
  if (response.status === 401) return "انتهت صلاحية الدخول إلى Google - أعد ربط Google Drive";
  if (response.status === 403) return `رفض Google الطلب: ${error?.message ?? "تحقق من تفعيل Google Drive API"}`;
  if (response.status === 404) return "الملف غير موجود في Google Drive";
  return error?.message ? `خطأ من Google Drive: ${error.message}` : `خطأ من Google Drive (${response.status})`;
}

async function call(http: DriveHttp, token: string, request: Omit<DriveRequest, "headers"> & { headers?: Record<string, string> }): Promise<DriveResponse> {
  let response: DriveResponse;
  try {
    response = await http({ ...request, headers: { Authorization: `Bearer ${token}`, ...(request.headers ?? {}) } });
  } catch (err) {
    throw new DriveError(err instanceof Error ? `تعذر الاتصال بـ Google Drive: ${err.message}` : "تعذر الاتصال بـ Google Drive", 0);
  }
  if (response.status < 200 || response.status >= 300) throw new DriveError(driveErrorMessage(response), response.status);
  return response;
}

function q(query: string): string {
  return encodeURIComponent(query);
}

/** The app's STARNET folder, created the first time. */
export async function ensureDriveFolder(http: DriveHttp, token: string): Promise<string> {
  const query = `name = '${DRIVE_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const found = await call(http, token, { method: "GET", url: `${API}/files?q=${q(query)}&spaces=drive&fields=files(id,name)` });
  const files = (asObject(found.data).files as DriveFile[] | undefined) ?? [];
  if (files[0]?.id) return files[0].id;
  const created = await call(http, token, {
    method: "POST",
    url: `${API}/files?fields=id`,
    headers: { "Content-Type": "application/json" },
    data: { name: DRIVE_FOLDER_NAME, mimeType: FOLDER_MIME },
  });
  const id = asObject(created.data).id;
  if (typeof id !== "string") throw new DriveError("تعذر إنشاء مجلد STARNET في Google Drive", created.status);
  return id;
}

export async function listDriveBackups(http: DriveHttp, token: string, folderId: string): Promise<DriveFile[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const response = await call(http, token, {
    method: "GET",
    url: `${API}/files?q=${q(query)}&spaces=drive&orderBy=name%20desc&pageSize=200&fields=files(id,name,size,createdTime)`,
  });
  const files = (asObject(response.data).files as Array<DriveFile & { size?: string | number }> | undefined) ?? [];
  return files
    .filter((f) => typeof f.id === "string" && typeof f.name === "string" && isDriveBackupName(f.name))
    .map((f) => ({ id: f.id, name: f.name, size: f.size === undefined ? undefined : Number(f.size), createdTime: f.createdTime }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Resumable upload (no 5 MB cap): the metadata first, then the file itself to the session URL. */
export async function uploadDriveBackup(http: DriveHttp, token: string, folderId: string, name: string, contents: string): Promise<DriveFile> {
  const session = await call(http, token, {
    method: "POST",
    url: `${UPLOAD_API}/files?uploadType=resumable&fields=id,name`,
    headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/octet-stream" },
    data: { name, parents: [folderId], mimeType: "application/octet-stream" },
  });
  const location = headerValue(session.headers, "Location");
  if (!location) throw new DriveError("لم يُرجع Google Drive رابط الرفع", session.status);
  const uploaded = await call(http, token, {
    method: "PUT",
    url: location,
    headers: { "Content-Type": "application/octet-stream" },
    data: contents,
  });
  const file = asObject(uploaded.data);
  return { id: typeof file.id === "string" ? file.id : "", name };
}

export async function downloadDriveBackup(http: DriveHttp, token: string, fileId: string): Promise<string> {
  const response = await call(http, token, { method: "GET", url: `${API}/files/${encodeURIComponent(fileId)}?alt=media`, responseType: "text" });
  return typeof response.data === "string" ? response.data : JSON.stringify(response.data);
}

export async function deleteDriveFile(http: DriveHttp, token: string, fileId: string): Promise<void> {
  await call(http, token, { method: "DELETE", url: `${API}/files/${encodeURIComponent(fileId)}` });
}

/** The linked Google account's address, shown in Settings - null if Drive won't say. */
export async function driveAccountEmail(http: DriveHttp, token: string): Promise<string | null> {
  try {
    const response = await call(http, token, { method: "GET", url: `${API}/about?fields=user(emailAddress)` });
    const user = asObject(response.data).user as { emailAddress?: string } | undefined;
    return user?.emailAddress ?? null;
  } catch {
    return null;
  }
}

/** Uploads one backup and prunes the folder to the newest DRIVE_KEEP. Pruning is best-effort. */
export async function uploadAndPrune(http: DriveHttp, token: string, contents: string, now: Date = new Date()): Promise<DriveFile> {
  const folderId = await ensureDriveFolder(http, token);
  const file = await uploadDriveBackup(http, token, folderId, driveBackupFileName(now), contents);
  try {
    const existing = await listDriveBackups(http, token, folderId);
    for (const old of driveFilesToPrune(existing)) await deleteDriveFile(http, token, old.id);
  } catch {
    // An extra old backup in Drive is harmless.
  }
  return file;
}

// ---- What the phone remembers about Drive (settings, not backed up) ----

const LINKED_KEY = "starnet.driveLinked";
const EMAIL_KEY = "starnet.driveEmail";
const LAST_UPLOAD_KEY = "starnet.driveLastUpload";

export interface DriveUploadStatus {
  at: string;
  ok: boolean;
  message?: string;
  fileName?: string;
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
    // Storage unavailable - Drive simply shows as not linked.
  }
}

export function isDriveLinked(): boolean {
  return safeGet(LINKED_KEY) === "1";
}

export function getDriveEmail(): string | null {
  return safeGet(EMAIL_KEY);
}

export function setDriveLinked(email: string | null): void {
  safeSet(LINKED_KEY, "1");
  safeSet(EMAIL_KEY, email);
}

export function clearDriveLink(): void {
  safeSet(LINKED_KEY, null);
  safeSet(EMAIL_KEY, null);
  safeSet(LAST_UPLOAD_KEY, null);
}

export function getDriveLastUpload(): DriveUploadStatus | null {
  const raw = safeGet(LAST_UPLOAD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DriveUploadStatus;
    return typeof parsed.at === "string" && typeof parsed.ok === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Once a day: due until an upload has succeeded today (a failed try - offline - retries on the
 * next app open instead of waiting for tomorrow). */
export function isDriveUploadDue(last: DriveUploadStatus | null, now: Date = new Date()): boolean {
  if (!last || !last.ok) return true;
  const at = new Date(last.at);
  return Number.isNaN(at.getTime()) || localDate(at) !== localDate(now);
}

export function recordDriveUpload(status: DriveUploadStatus): void {
  safeSet(LAST_UPLOAD_KEY, JSON.stringify(status));
}
