import { describe, expect, it } from "vitest";
import { collectAppData, restoreAppData } from "./accountBackup";
import { applyRestoredRepMode, backupRepName, REP_MODE_BACKUP_KEY, withRepMode } from "./repBackup";

function memory(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

const MODE = JSON.stringify({ code: "ABCD-1234", name: "مندوب تجريبي" });
const BASE = JSON.stringify({ starnet_clients_v1: [] });

describe("💾 a rep's backup keeps him a rep (his Nov 14 2026 ask)", () => {
  it("the owner's backup is unchanged", () => {
    const owner = memory({ starnet_clients_v1: "[]" });
    const data = collectAppData(owner);
    expect(withRepMode(data, owner)).toBe(data);
    expect(backupRepName(data)).toBeNull();
  });

  it("a rep's backup restored on a new phone opens as that rep again", () => {
    const rep = memory({ "starnet.repMode": MODE, "starnet.repBase": BASE, starnet_clients_v1: "[1]" });
    const data = withRepMode(collectAppData(rep), rep);
    expect(backupRepName(data)).toBe("مندوب تجريبي");

    const fresh = memory({ starnet_old_v1: "x" });
    restoreAppData(fresh, data);
    expect(applyRestoredRepMode(fresh)).toBe(true);
    expect(fresh.getItem("starnet.repMode")).toBe(MODE);
    expect(fresh.getItem("starnet.repBase")).toBe(BASE);
    expect(fresh.getItem(REP_MODE_BACKUP_KEY)).toBeNull();
    expect(fresh.getItem("starnet_clients_v1")).toBe("[1]");
    expect(fresh.getItem("starnet_old_v1")).toBeNull();
  });

  it("an owner's backup leaves the phone's mode alone", () => {
    const phone = memory({ "starnet.repMode": MODE, "starnet.repBase": BASE });
    restoreAppData(phone, { starnet_clients_v1: "[]" });
    expect(applyRestoredRepMode(phone)).toBe(false);
    expect(phone.getItem("starnet.repMode")).toBe(MODE);
  });

  it("a damaged carrier is dropped, never applied", () => {
    const phone = memory({ [REP_MODE_BACKUP_KEY]: "{bad" });
    expect(applyRestoredRepMode(phone)).toBe(false);
    expect(phone.map.size).toBe(0);
  });
});
