import { describe, expect, it } from "vitest";
import { autoBackupFileName, filesToPrune, isAutoBackupDue } from "./autoBackup";

describe("autoBackup", () => {
  it("names one file per day", () => {
    expect(autoBackupFileName("2026-09-25")).toBe("starnet-auto-2026-09-25.starnetbackup");
  });

  it("keeps the newest 7 auto files and never touches other files", () => {
    const names = Array.from({ length: 9 }, (_, i) => autoBackupFileName(`2026-09-${String(i + 10)}`));
    expect(filesToPrune([...names, "my-manual.starnetbackup"])).toEqual([
      "starnet-auto-2026-09-10.starnetbackup",
      "starnet-auto-2026-09-11.starnetbackup",
    ]);
    expect(filesToPrune(names.slice(0, 3))).toEqual([]);
  });

  it("runs once per day", () => {
    expect(isAutoBackupDue(null, "2026-09-25")).toBe(true);
    expect(isAutoBackupDue("2026-09-24", "2026-09-25")).toBe(true);
    expect(isAutoBackupDue("2026-09-25", "2026-09-25")).toBe(false);
  });
});
