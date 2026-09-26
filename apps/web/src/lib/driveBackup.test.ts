// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DriveError,
  DriveRequest,
  DriveResponse,
  clearDriveLink,
  downloadDriveBackup,
  driveAccountEmail,
  driveBackupFileName,
  driveBackupLabel,
  driveFilesToPrune,
  ensureDriveFolder,
  getDriveEmail,
  getDriveLastUpload,
  isDriveLinked,
  isDriveUploadDue,
  listDriveBackups,
  recordDriveUpload,
  setDriveLinked,
  uploadAndPrune,
} from "./driveBackup";

/** A tiny in-memory Google Drive, answering only the calls driveBackup.ts makes. */
function fakeDrive(options: { failStatus?: number } = {}) {
  const files: Array<{ id: string; name: string; parent?: string; mimeType?: string; content?: string }> = [];
  const requests: DriveRequest[] = [];
  let nextId = 1;
  let pendingUpload: { name: string; parent: string } | null = null;
  const http = async (req: DriveRequest): Promise<DriveResponse> => {
    requests.push(req);
    if (options.failStatus) return { status: options.failStatus, data: { error: { message: "nope" } }, headers: {} };
    expect(req.headers.Authorization).toBe("Bearer tok");
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/files")) {
      const query = url.searchParams.get("q") ?? "";
      const folderMatch = /'([^']+)' in parents/.exec(query);
      const list = folderMatch
        ? files.filter((f) => f.parent === folderMatch[1])
        : files.filter((f) => f.mimeType === "application/vnd.google-apps.folder" && query.includes(`name = '${f.name}'`));
      return { status: 200, data: { files: list.map((f) => ({ id: f.id, name: f.name, size: "10" })) }, headers: {} };
    }
    if (req.method === "POST" && url.pathname === "/drive/v3/files") {
      const body = req.data as { name: string; mimeType: string };
      const file = { id: `f${nextId++}`, name: body.name, mimeType: body.mimeType };
      files.push(file);
      return { status: 200, data: { id: file.id }, headers: {} };
    }
    if (req.method === "POST" && url.pathname === "/upload/drive/v3/files") {
      const body = req.data as { name: string; parents: string[] };
      pendingUpload = { name: body.name, parent: body.parents[0] };
      return { status: 200, data: "", headers: { location: "https://www.googleapis.com/upload/session/1" } };
    }
    if (req.method === "PUT" && req.url === "https://www.googleapis.com/upload/session/1" && pendingUpload) {
      const file = { id: `f${nextId++}`, ...pendingUpload, content: req.data as string };
      files.push(file);
      pendingUpload = null;
      return { status: 200, data: { id: file.id, name: file.name }, headers: {} };
    }
    const single = /\/files\/([^/?]+)$/.exec(url.pathname);
    if (single && req.method === "GET" && url.searchParams.get("alt") === "media") {
      const file = files.find((f) => f.id === single[1]);
      return file ? { status: 200, data: file.content, headers: {} } : { status: 404, data: {}, headers: {} };
    }
    if (single && req.method === "DELETE") {
      const index = files.findIndex((f) => f.id === single[1]);
      files.splice(index, 1);
      return { status: 204, data: "", headers: {} };
    }
    if (url.pathname.endsWith("/about")) return { status: 200, data: { user: { emailAddress: "me@gmail.com" } }, headers: {} };
    throw new Error(`unexpected ${req.method} ${req.url}`);
  };
  return { http, files, requests };
}

describe("Drive backup file names", () => {
  it("names backups by date and time, and labels them for the restore list", () => {
    const name = driveBackupFileName(new Date(2026, 8, 26, 9, 5));
    expect(name).toBe("starnet-drive-2026-09-26-0905.starnetbackup");
    expect(driveBackupLabel(name)).toBe("2026-09-26 09:05");
    expect(driveBackupLabel("other.txt")).toBe("other.txt");
  });

  it("prunes only its own backups beyond the newest ones", () => {
    const files = ["starnet-drive-2026-09-01-0900.starnetbackup", "starnet-drive-2026-09-03-0900.starnetbackup", "notes.txt", "starnet-drive-2026-09-02-0900.starnetbackup"].map(
      (name, i) => ({ id: String(i), name }),
    );
    expect(driveFilesToPrune(files, 2).map((f) => f.name)).toEqual(["starnet-drive-2026-09-01-0900.starnetbackup"]);
    expect(driveFilesToPrune(files, 5)).toEqual([]);
  });
});

describe("Drive REST client", () => {
  it("creates the STARNET folder once and reuses it", async () => {
    const drive = fakeDrive();
    const first = await ensureDriveFolder(drive.http, "tok");
    const second = await ensureDriveFolder(drive.http, "tok");
    expect(first).toBe(second);
    expect(drive.files.filter((f) => f.name === "STARNET")).toHaveLength(1);
  });

  it("uploads, lists newest first, downloads the exact contents, and keeps only the newest 30", async () => {
    const drive = fakeDrive();
    for (let day = 1; day <= 31; day++) {
      await uploadAndPrune(drive.http, "tok", `{"backup":${day}}`, new Date(2026, 7, day, 8, 0));
    }
    const folderId = await ensureDriveFolder(drive.http, "tok");
    const backups = await listDriveBackups(drive.http, "tok", folderId);
    expect(backups).toHaveLength(30);
    expect(backups[0].name).toBe("starnet-drive-2026-08-31-0800.starnetbackup");
    expect(backups.at(-1)?.name).toBe("starnet-drive-2026-08-02-0800.starnetbackup");
    expect(await downloadDriveBackup(drive.http, "tok", backups[0].id)).toBe('{"backup":31}');
    expect(await driveAccountEmail(drive.http, "tok")).toBe("me@gmail.com");
  });

  it("turns HTTP failures into Arabic DriveErrors carrying the status", async () => {
    const drive = fakeDrive({ failStatus: 401 });
    const error = await ensureDriveFolder(drive.http, "tok").catch((e) => e);
    expect(error).toBeInstanceOf(DriveError);
    expect(error.status).toBe(401);
    expect(error.message).toContain("أعد ربط");
    const offline = await ensureDriveFolder(async () => {
      throw new Error("offline");
    }, "tok").catch((e) => e);
    expect(offline.status).toBe(0);
    expect(await driveAccountEmail(fakeDrive({ failStatus: 403 }).http, "tok")).toBeNull();
  });
});

describe("Drive link settings", () => {
  beforeEach(() => clearDriveLink());

  it("remembers the link, email and last upload, and forgets them on unlink", () => {
    expect(isDriveLinked()).toBe(false);
    setDriveLinked("me@gmail.com");
    recordDriveUpload({ at: "2026-09-26T09:00:00.000Z", ok: true, fileName: "x" });
    expect(isDriveLinked()).toBe(true);
    expect(getDriveEmail()).toBe("me@gmail.com");
    expect(getDriveLastUpload()).toMatchObject({ ok: true, fileName: "x" });
    clearDriveLink();
    expect(isDriveLinked()).toBe(false);
    expect(getDriveEmail()).toBeNull();
    expect(getDriveLastUpload()).toBeNull();
  });
});

describe("isDriveUploadDue", () => {
  const now = new Date(2026, 8, 26, 15, 0);
  it("is due until an upload succeeded today", () => {
    expect(isDriveUploadDue(null, now)).toBe(true);
    expect(isDriveUploadDue({ at: new Date(2026, 8, 26, 8, 0).toISOString(), ok: false }, now)).toBe(true);
    expect(isDriveUploadDue({ at: new Date(2026, 8, 25, 23, 0).toISOString(), ok: true }, now)).toBe(true);
    expect(isDriveUploadDue({ at: new Date(2026, 8, 26, 8, 0).toISOString(), ok: true }, now)).toBe(false);
    expect(isDriveUploadDue({ at: "garbage", ok: true }, now)).toBe(true);
  });
});
