import { DeviceStatus, StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import {
  buildBackupEnvelope,
  collectAppData,
  restoreAppData,
  createEncryptedBackupFile,
  isBackupEnvelope,
  mergeImportedAccounts,
  readEncryptedBackupFile,
} from "./accountBackup";

function baseAccount(overrides: Partial<StarlinkAccountSummary> = {}): StarlinkAccountSummary {
  return {
    id: "acc-1",
    customerId: "cust-1",
    name: "mounay",
    deviceName: "Dish 1",
    kitNumber: "KIT-000111",
    serialNumber: "SN123456789",
    standbyDate: "",
    rechargeDate: "2026/09/28",
    balanceDue: "0.00",
    currency: "USD",
    dishStatus: DeviceStatus.GREEN,
    wifiStatus: DeviceStatus.GREEN,
    alertReason: "",
    lastUpdated: "قبل يوم",
    lastSuccessfulScanAt: null,
    planName: "التجوال - غير محدود",
    ...overrides,
  };
}

describe("isBackupEnvelope", () => {
  it("accepts exactly what buildBackupEnvelope produces", () => {
    const envelope = buildBackupEnvelope([baseAccount()], { "acc-1": { "https://starlink.com": "session=1" } });
    expect(isBackupEnvelope(envelope)).toBe(true);
  });

  it("rejects an unrelated object rather than crashing", () => {
    expect(isBackupEnvelope({ hello: "world" })).toBe(false);
    expect(isBackupEnvelope(null)).toBe(false);
    expect(isBackupEnvelope("a string")).toBe(false);
    expect(isBackupEnvelope(42)).toBe(false);
  });

  it("rejects a future/incompatible version number", () => {
    const envelope = buildBackupEnvelope([baseAccount()], {});
    expect(isBackupEnvelope({ ...envelope, version: 3 })).toBe(false);
  });

  it("still accepts an older version-1 (accounts-only) backup", () => {
    const { data: _data, ...rest } = buildBackupEnvelope([baseAccount()], {});
    expect(isBackupEnvelope({ ...rest, version: 1 })).toBe(true);
  });
});

describe("mergeImportedAccounts", () => {
  it("appends an account whose id doesn't exist yet", () => {
    const result = mergeImportedAccounts([baseAccount({ id: "acc-1" })], [baseAccount({ id: "acc-2", name: "other" })]);
    expect(result.map((a) => a.id)).toEqual(["acc-1", "acc-2"]);
  });

  it("fully replaces an existing account with the same id, keeping its original position", () => {
    const existing = [
      baseAccount({ id: "acc-1", name: "old name" }),
      baseAccount({ id: "acc-2", name: "unrelated" }),
    ];
    const imported = [baseAccount({ id: "acc-1", name: "restored name", balanceDue: "12.50" })];

    const result = mergeImportedAccounts(existing, imported);

    expect(result.map((a) => a.id)).toEqual(["acc-1", "acc-2"]);
    expect(result[0].name).toBe("restored name");
    expect(result[0].balanceDue).toBe("12.50");
  });

  it("never mutates the input arrays", () => {
    const existing = [baseAccount({ id: "acc-1" })];
    const imported = [baseAccount({ id: "acc-1", name: "changed" })];
    mergeImportedAccounts(existing, imported);
    expect(existing[0].name).toBe("mounay");
  });
});

describe("createEncryptedBackupFile / readEncryptedBackupFile", () => {
  it("round-trips accounts and sessions through encryption with the correct password", async () => {
    const accounts = [baseAccount({ id: "acc-1" }), baseAccount({ id: "acc-2", name: "second" })];
    const sessions = { "acc-1": { "https://starlink.com": "session=abc123" } };

    const created = await createEncryptedBackupFile(accounts, sessions, "my-strong-password");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const read = await readEncryptedBackupFile(created.fileContents, "my-strong-password");
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.accounts).toEqual(accounts);
    expect(read.sessions).toEqual(sessions);
  });

  it("fails with a clear message on the wrong password, without leaking any account data", async () => {
    const created = await createEncryptedBackupFile([baseAccount()], {}, "right-password");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const read = await readEncryptedBackupFile(created.fileContents, "wrong-password");
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.message).toContain("كلمة المرور");
  });

  it("fails with a clear message on a file that isn't a backup at all", async () => {
    const read = await readEncryptedBackupFile("not even json", "any-password");
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.message).toContain("ليس ملف نسخة احتياطية");
  });

  it("fails with a clear message on well-formed-but-unrelated JSON", async () => {
    const read = await readEncryptedBackupFile(JSON.stringify({ hello: "world" }), "any-password");
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.message).toContain("ليس ملف نسخة احتياطية");
  });
});

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("full app-data backup", () => {
  it("collects every starnet_ data key and nothing else", () => {
    const storage = memoryStorage({
      starnet_clients_v1: "{\"c1\":1}",
      starnet_store_invoices_v1: "[]",
      "starnet.accessToken": "secret-token",
      "starnet.appPinHash": "hash",
      other: "x",
    });
    expect(collectAppData(storage)).toEqual({ starnet_clients_v1: "{\"c1\":1}", starnet_store_invoices_v1: "[]" });
  });

  it("restore replaces data keys exactly and leaves settings/tokens alone", () => {
    const storage = memoryStorage({
      starnet_clients_v1: "old",
      starnet_cash_entries_v1: "stale",
      "starnet.accessToken": "keep-me",
    });
    const written = restoreAppData(storage, { starnet_clients_v1: "new", starnet_suppliers_v1: "[]", "starnet.theme": "dark" });
    expect(written).toBe(2);
    expect(storage.dump()).toEqual({ "starnet.accessToken": "keep-me", starnet_clients_v1: "new", starnet_suppliers_v1: "[]" });
  });

  it("rolls back to the original data when the phone runs out of space mid-restore", () => {
    const storage = memoryStorage({
      starnet_clients_v1: "old-clients",
      starnet_cash_entries_v1: "old-cash",
      "starnet.accessToken": "keep-me",
    });
    const realSet = storage.setItem;
    let calls = 0;
    storage.setItem = (k: string, v: string) => {
      calls++;
      if (calls === 2) throw new DOMException("full", "QuotaExceededError");
      realSet(k, v);
    };
    expect(() => restoreAppData(storage, { starnet_clients_v1: "new", starnet_suppliers_v1: "huge" })).toThrow();
    expect(storage.dump()).toEqual({
      "starnet.accessToken": "keep-me",
      starnet_clients_v1: "old-clients",
      starnet_cash_entries_v1: "old-cash",
    });
  });

  it("round-trips the data snapshot through an encrypted file", async () => {
    const data = { starnet_clients_v1: "{}", starnet_customer_ledger_v1: "{\"d1\":[]}" };
    const created = await createEncryptedBackupFile([baseAccount()], {}, "my-strong-password", data);
    if (!created.ok) throw new Error("create failed");
    const read = await readEncryptedBackupFile(created.fileContents, "my-strong-password");
    if (!read.ok) throw new Error("read failed");
    expect(read.data).toEqual(data);
  });
});
