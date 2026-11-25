import { describe, expect, it } from "vitest";
import { BigStore, DIRTY_KEY, INFO_KEY, isManaged, type KvBackend, type MigrationInfo, type NativeStorage } from "./bigStorage";

class MemNative implements NativeStorage {
  data = new Map<string, string>();
  quota = Infinity;
  used() {
    let s = 0;
    for (const [k, v] of this.data) s += k.length + v.length;
    return s;
  }
  get(k: string) {
    return this.data.get(k) ?? null;
  }
  set(k: string, v: string) {
    const old = this.data.get(k);
    const next = this.used() - (old === undefined ? 0 : k.length + old.length) + k.length + v.length;
    if (next > this.quota) throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    this.data.set(k, v);
  }
  remove(k: string) {
    this.data.delete(k);
  }
  keys() {
    return [...this.data.keys()];
  }
}

class MemBackend implements KvBackend {
  data = new Map<string, string>();
  before: Record<string, string> | null = null;
  moved: MigrationInfo | null = null;
  failPut = false;
  corrupt = false;
  /** Writes wait until release() (to test a phone killed mid-save). */
  hold = false;
  private waiting: (() => void)[] = [];
  release() {
    for (const w of this.waiting.splice(0)) w();
  }
  private async gate() {
    if (this.hold) await new Promise<void>((r) => this.waiting.push(r));
  }
  async loadAll() {
    const out = new Map(this.data);
    if (this.corrupt) for (const k of out.keys()) out.set(k, "x");
    return out;
  }
  async put(k: string, v: string) {
    await this.gate();
    if (this.failPut) throw new Error("put");
    this.data.set(k, v);
  }
  async del(k: string) {
    await this.gate();
    this.data.delete(k);
  }
  async replaceAll(e: Map<string, string>) {
    this.data = new Map(e);
  }
  async saveBefore(s: Record<string, string>) {
    this.before = { ...s };
  }
  async markMoved(info: MigrationInfo) {
    this.moved = info;
  }
  async isMoved() {
    return this.moved !== null;
  }
}

const big = (n: number) => "x".repeat(n);
const limits = { maxValue: 1000, total: 5000 };

function phone() {
  const native = new MemNative();
  native.set("starnet_customer_ledger_v1", JSON.stringify([{ id: "a", amount: 100 }]));
  native.set("starnet_clients_v1", big(3000));
  native.set("starnet.theme", "dark");
  native.set("starnet.lang", "ar");
  native.set("other_lib", "keep");
  return native;
}

describe("BigStore - the first move", () => {
  it("copies every starnet key, keeps a «before» copy, notes it, and frees the big keys from localStorage", async () => {
    const native = phone();
    const backend = new MemBackend();
    const store = new BigStore(backend, native, limits);
    const r = await store.init(new Date("2026-11-25T10:00:00Z"));
    expect(r.kind).toBe("moved");
    expect([...backend.data.keys()].sort()).toEqual(["starnet.lang", "starnet_clients_v1", "starnet_customer_ledger_v1"]);
    expect(backend.before?.["starnet_clients_v1"]).toBe(big(3000));
    expect(backend.moved?.keys).toBe(3);
    expect(native.get(INFO_KEY)).not.toBeNull();
    // the big one left localStorage, the small ones stay as a copy, a library's key is untouched
    expect(native.get("starnet_clients_v1")).toBeNull();
    expect(native.get("starnet.theme")).toBe("dark");
    expect(native.get("other_lib")).toBe("keep");
    expect(store.get("starnet_clients_v1")).toBe(big(3000));
  });

  it("changes nothing when IndexedDB doesn't read back what was written", async () => {
    const native = phone();
    const backend = new MemBackend();
    backend.corrupt = true;
    const r = await new BigStore(backend, native, limits).init();
    expect(r).toEqual({ kind: "failed", migrated: false });
    expect(native.get("starnet_clients_v1")).toBe(big(3000));
    expect(native.get(INFO_KEY)).toBeNull();
    expect(backend.moved).toBeNull();
  });

  it("moves even when localStorage is too full for the note (IndexedDB keeps it)", async () => {
    const native = phone();
    native.quota = native.used();
    const backend = new MemBackend();
    const r = await new BigStore(backend, native, limits).init();
    expect(r.kind).toBe("moved");
    expect(backend.moved).not.toBeNull();
    // the room made by the move takes the note too
    expect(native.get(INFO_KEY)).not.toBeNull();
  });
});

describe("BigStore - after the move", () => {
  async function moved() {
    const native = phone();
    const backend = new MemBackend();
    await new BigStore(backend, native, limits).init();
    return { native, backend };
  }

  it("loads from IndexedDB, never from the incomplete localStorage", async () => {
    const { native, backend } = await moved();
    const store = new BigStore(backend, native, limits);
    expect((await store.init()).kind).toBe("loaded");
    expect(store.get("starnet_clients_v1")).toBe(big(3000));
    expect(store.get("starnet_customer_ledger_v1")).toContain("100");
  });

  it("a write goes to memory, IndexedDB and (when small) localStorage; a big one has no localStorage copy", async () => {
    const { native, backend } = await moved();
    const store = new BigStore(backend, native, limits);
    await store.init();
    store.set("starnet_cash_entries_v1", "[1]");
    store.set("starnet_store_items_v1", big(2000));
    expect(store.get("starnet_cash_entries_v1")).toBe("[1]");
    await store.flush();
    expect(backend.data.get("starnet_cash_entries_v1")).toBe("[1]");
    expect(backend.data.get("starnet_store_items_v1")).toBe(big(2000));
    expect(native.get("starnet_cash_entries_v1")).toBe("[1]");
    expect(native.get("starnet_store_items_v1")).toBeNull();
    expect(native.get(DIRTY_KEY)).toBeNull();
  });

  it("never throws on a full localStorage", async () => {
    const { native, backend } = await moved();
    native.quota = native.used();
    const store = new BigStore(backend, native, limits);
    await store.init();
    expect(() => store.set("starnet_cash_entries_v1", "[1,2,3]")).not.toThrow();
    await store.flush();
    expect(backend.data.get("starnet_cash_entries_v1")).toBe("[1,2,3]");
  });

  it("a phone killed before IndexedDB confirmed: the next start takes the newer localStorage copy", async () => {
    const { native, backend } = await moved();
    const store = new BigStore(backend, native, limits);
    await store.init();
    backend.hold = true;
    store.set("starnet.lang", "light");
    store.remove("starnet_customer_ledger_v1");
    expect(JSON.parse(native.get(DIRTY_KEY) ?? "{}")).toEqual({ "starnet.lang": "m", starnet_customer_ledger_v1: "d" });
    // killed: the held writes never land
    const next = new BigStore(backend, native, limits);
    backend.hold = false;
    await next.init();
    expect(next.get("starnet.lang")).toBe("light");
    expect(next.get("starnet_customer_ledger_v1")).toBeNull();
    expect(backend.data.get("starnet.lang")).toBe("light");
    expect(native.get(DIRTY_KEY)).toBeNull();
  });

  it("a big key whose save was cut keeps IndexedDB's last value (no localStorage copy to trust)", async () => {
    const { native, backend } = await moved();
    const store = new BigStore(backend, native, limits);
    await store.init();
    backend.hold = true;
    store.set("starnet_clients_v1", big(4000));
    const next = new BigStore(backend, native, limits);
    backend.hold = false;
    await next.init();
    expect(next.get("starnet_clients_v1")).toBe(big(3000));
  });

  it("a failed IndexedDB write stays in the journal", async () => {
    const { native, backend } = await moved();
    const store = new BigStore(backend, native, limits);
    await store.init();
    backend.failPut = true;
    store.set("starnet.lang", "light");
    await store.flush();
    expect(JSON.parse(native.get(DIRTY_KEY) ?? "{}")).toEqual({ "starnet.lang": "m" });
  });

  it("lists IndexedDB's keys and localStorage's own ones (backup / team link iterate localStorage)", async () => {
    const { native, backend } = await moved();
    const store = new BigStore(backend, native, limits);
    await store.init();
    expect(store.keys().sort()).toEqual(["other_lib", "starnet.bigStorage", "starnet.lang", "starnet.theme", "starnet_clients_v1", "starnet_customer_ledger_v1"]);
    store.set("starnet_new_v1", "1");
    expect(store.keys()).toContain("starnet_new_v1");
    store.remove("starnet_new_v1");
    expect(store.keys()).not.toContain("starnet_new_v1");
  });

  it("the moved note in IndexedDB alone is enough (localStorage lost it): still no re-move from localStorage", async () => {
    const { native, backend } = await moved();
    native.remove(INFO_KEY);
    native.set("starnet_clients_v1", "stale");
    const store = new BigStore(backend, native, limits);
    expect((await store.init()).kind).toBe("loaded");
    expect(store.get("starnet_clients_v1")).toBe(big(3000));
  });

  it("measures localStorage itself (what can still fill up), not IndexedDB", async () => {
    const { native, backend } = await moved();
    const store = new BigStore(backend, native, limits);
    await store.init();
    const view = store.nativeView();
    const keys = Array.from({ length: view.length }, (_, i) => view.key(i));
    expect(keys).not.toContain("starnet_clients_v1");
    expect(store.bigUsage()).toBeGreaterThan(3000);
  });
});

describe("keys the pre-app scripts use", () => {
  it("stay in localStorage only (the safe mode's counter, the theme)", () => {
    expect(isManaged("starnet.safeMode")).toBe(false);
    expect(isManaged("starnet.boots")).toBe(false);
    expect(isManaged("starnet.theme")).toBe(false);
    expect(isManaged("starnet_clients_v1")).toBe(true);
    expect(isManaged("starnet.deviceLinkBase")).toBe(true);
  });
});
