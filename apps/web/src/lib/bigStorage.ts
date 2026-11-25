/**
 * 🗄️ «تخزين أكبر» (his Nov 23-25 2026 «ذاكرة التطبيق ممتلئة - انقل التخزين إلى IndexedDB بخطة آمنة… لا يضيع شيء»).
 * The app's data outgrew the phone's localStorage (~5 million characters). Every key that starts with "starnet" now
 * lives in IndexedDB (hundreds of MB), read into memory before the app shows anything - so every store keeps its simple
 * synchronous `localStorage.getItem / setItem`: Storage.prototype is wrapped for window.localStorage only.
 *
 * Safety, in order:
 *  1. Before the move, one untouched copy of every starnet key goes into IndexedDB's «before» store (kept).
 *  2. The move copies every starnet key into IndexedDB and READS IT BACK; only when every value matches does IndexedDB
 *     take over and «starnet.bigStorage» is noted. If anything fails before that, nothing changed: the app runs on
 *     localStorage exactly as before and tries again next start.
 *  3. Only then the big keys' localStorage copies go (that frees the phone); small keys keep a copy there (a mirror).
 *  4. After the move IndexedDB is the truth: if it can't be opened, the app does NOT open on the (incomplete)
 *     localStorage - the gate shows «أعد المحاولة» instead.
 *  5. Each save is noted in a tiny journal («starnet.bigDirty») until IndexedDB confirms it: after a phone killed
 *     mid-save, the next start takes the newer localStorage copy (small keys).
 * Pure core (BigStore) over injected backends - tested in bigStorage.test.ts.
 */

export const MANAGED_PREFIX = "starnet";
export const DIRTY_KEY = "starnet.bigDirty";
export const INFO_KEY = "starnet.bigStorage";
/** A key this long or longer keeps no copy in localStorage (only IndexedDB). */
export const MIRROR_MAX_VALUE = 100_000;
/** localStorage keeps copies only while it stays under this many characters (its budget is ~5 million). */
export const MIRROR_LIMIT = 2_500_000;

export const isManaged = (key: string) => key.startsWith(MANAGED_PREFIX) && key !== DIRTY_KEY && key !== INFO_KEY;

export interface KvBackend {
  loadAll(): Promise<Map<string, string>>;
  put(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  /** Replaces everything with `entries` (the first move). */
  replaceAll(entries: Map<string, string>): Promise<void>;
  /** Keeps one untouched copy of what localStorage held before the move. */
  saveBefore(snapshot: Record<string, string>, at: string): Promise<void>;
  /** The move finished and was checked (kept inside IndexedDB, so a full localStorage can't lose the note). */
  markMoved(info: MigrationInfo): Promise<void>;
  isMoved(): Promise<boolean>;
}

/** localStorage's own (unwrapped) methods. */
export interface NativeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export interface MigrationInfo {
  movedAt: string;
  keys: number;
  chars: number;
}

/** What a start did: "moved" (the first time), "loaded", or "failed" (before the move: run on localStorage). */
export type StartResult = { kind: "moved"; info: MigrationInfo } | { kind: "loaded" } | { kind: "failed"; migrated: boolean };

/** m = the localStorage copy is the newest; d = removed; x = no copy (too big) - IndexedDB's stays. */
type JournalOp = "m" | "d" | "x";

export class BigStore {
  private mem = new Map<string, string>();
  private keyList: string[] | null = null;
  private nativeChars = 0;
  private pending = new Set<Promise<void>>();
  private journal = new Map<string, { n: number; op: JournalOp }>();

  constructor(
    private backend: KvBackend,
    private native: NativeStorage,
    private limits = { maxValue: MIRROR_MAX_VALUE, total: MIRROR_LIMIT },
  ) {}

  async init(now = new Date()): Promise<StartResult> {
    let migrated = this.native.get(INFO_KEY) !== null;
    try {
      migrated = migrated || (await this.backend.isMoved());
      if (!migrated) {
        const snapshot: Record<string, string> = {};
        for (const k of this.native.keys()) {
          if (!isManaged(k)) continue;
          const v = this.native.get(k);
          if (v !== null) snapshot[k] = v;
        }
        const entries = new Map(Object.entries(snapshot));
        await this.backend.saveBefore(snapshot, now.toISOString());
        await this.backend.replaceAll(entries);
        const back = await this.backend.loadAll();
        if (back.size !== entries.size) return { kind: "failed", migrated };
        for (const [k, v] of entries) if (back.get(k) !== v) return { kind: "failed", migrated };
        const info: MigrationInfo = { movedAt: now.toISOString(), keys: entries.size, chars: [...entries.values()].reduce((s, v) => s + v.length, 0) };
        await this.backend.markMoved(info);
        try {
          this.native.set(INFO_KEY, JSON.stringify(info));
        } catch {
          // a full localStorage: IndexedDB holds the note
        }
        this.mem = back;
        this.native.remove(DIRTY_KEY);
        this.trimNative();
        return { kind: "moved", info };
      }
      const fromDb = await this.backend.loadAll();
      // saves that never reached IndexedDB (the phone was killed mid-save)
      for (const [k, op] of Object.entries(this.readJournal())) {
        if (op === "d") {
          fromDb.delete(k);
          await this.backend.del(k);
        } else if (op === "m") {
          const v = this.native.get(k);
          if (v !== null) {
            fromDb.set(k, v);
            await this.backend.put(k, v);
          }
        }
      }
      // a starnet key written to localStorage outside the wrapper (e.g. before it was installed)
      for (const k of this.native.keys()) {
        if (!isManaged(k) || fromDb.has(k)) continue;
        const v = this.native.get(k);
        if (v === null) continue;
        fromDb.set(k, v);
        await this.backend.put(k, v);
      }
      this.mem = fromDb;
      this.native.remove(DIRTY_KEY);
      this.trimNative();
      return { kind: "loaded" };
    } catch {
      return { kind: "failed", migrated };
    }
  }

  /** The big keys' localStorage copies go (IndexedDB holds them, checked); the rest stay as a mirror. */
  private trimNative(): void {
    this.trimCopies();
    // the note «moved» also in localStorage (room was just made): without IndexedDB the app then refuses to open
    if (this.native.get(INFO_KEY) === null) {
      try {
        this.native.set(INFO_KEY, JSON.stringify({ movedAt: new Date().toISOString(), keys: this.mem.size, chars: this.bigUsage() }));
      } catch {
        // IndexedDB holds the note
      }
    }
  }

  private trimCopies(): void {
    const sizes = this.native.keys().map((k) => ({ k, len: k.length + (this.native.get(k)?.length ?? 0) }));
    this.nativeChars = sizes.reduce((s, x) => s + x.len, 0);
    for (const { k, len } of sizes.sort((a, b) => b.len - a.len)) {
      if (!isManaged(k) || !this.mem.has(k)) continue;
      if (len - k.length < this.limits.maxValue && this.nativeChars <= this.limits.total) continue;
      this.native.remove(k);
      this.nativeChars -= len;
    }
    this.keyList = null;
  }

  private readJournal(): Record<string, JournalOp> {
    try {
      const v = JSON.parse(this.native.get(DIRTY_KEY) ?? "{}") as unknown;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, JournalOp>) : {};
    } catch {
      return {};
    }
  }

  private writeJournal(): void {
    try {
      if (this.journal.size) this.native.set(DIRTY_KEY, JSON.stringify(Object.fromEntries([...this.journal].map(([k, j]) => [k, j.op]))));
      else this.native.remove(DIRTY_KEY);
    } catch {
      // the journal is a safety net only
    }
  }

  get(key: string): string | null {
    return this.mem.get(key) ?? null;
  }

  set(key: string, value: string): void {
    if (!this.mem.has(key)) this.keyList = null;
    this.mem.set(key, value);
    const mirrored = this.mirror(key, value);
    this.persist(key, mirrored ? "m" : "x", () => this.backend.put(key, value));
  }

  remove(key: string): void {
    if (!this.mem.has(key)) return;
    this.mem.delete(key);
    this.keyList = null;
    this.mirror(key, null);
    this.persist(key, "d", () => this.backend.del(key));
  }

  /** Every key: IndexedDB's and localStorage's own (settings outside "starnet"). */
  keys(): string[] {
    if (!this.keyList) {
      const all = new Set<string>(this.mem.keys());
      for (const k of this.native.keys()) if (!isManaged(k) && k !== DIRTY_KEY) all.add(k);
      this.keyList = [...all];
    }
    return this.keyList;
  }

  invalidateKeys(): void {
    this.keyList = null;
  }

  /** localStorage itself, unwrapped - what can still fill up (the banner / the settings page). */
  nativeView(): Pick<Storage, "length" | "key" | "getItem"> {
    const keys = this.native.keys();
    return { length: keys.length, key: (i) => keys[i] ?? null, getItem: (k) => this.native.get(k) };
  }

  /** IndexedDB's share in characters (the settings page). */
  bigUsage(): number {
    let s = 0;
    for (const [k, v] of this.mem) s += k.length + v.length;
    return s;
  }

  /** Waits for every write IndexedDB has not confirmed yet. */
  async flush(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  /** True when localStorage now holds this value too. */
  private mirror(key: string, value: string | null): boolean {
    const before = this.native.get(key);
    const oldLen = before === null ? 0 : key.length + before.length;
    if (value !== null && value.length < this.limits.maxValue && this.nativeChars - oldLen + key.length + value.length <= this.limits.total) {
      try {
        this.native.set(key, value);
        this.nativeChars += key.length + value.length - oldLen;
        return true;
      } catch {
        // full: drop the copy below
      }
    }
    if (before !== null) {
      this.native.remove(key);
      this.nativeChars -= oldLen;
    }
    return false;
  }

  private persist(key: string, op: JournalOp, write: () => Promise<void>): void {
    const j = this.journal.get(key);
    this.journal.set(key, { n: (j?.n ?? 0) + 1, op });
    this.writeJournal();
    const p: Promise<void> = write()
      .then(() => {
        const cur = this.journal.get(key);
        if (!cur) return;
        if (cur.n <= 1) this.journal.delete(key);
        else this.journal.set(key, { ...cur, n: cur.n - 1 });
        this.writeJournal();
      })
      .catch(() => {
        // stays in the journal: the next start takes the localStorage copy (when it fitted)
      })
      .finally(() => {
        this.pending.delete(p);
      });
    this.pending.add(p);
  }
}

// ---- the IndexedDB backend ----

const DB_NAME = "starnet-data";
const STORE = "kv";
const BEFORE = "before";
const MOVED_KEY = "moved";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(BEFORE)) db.createObjectStore(BEFORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function indexedDbBackend(db: IDBDatabase): KvBackend {
  const write = (fn: (s: IDBObjectStore) => void, store = STORE) => {
    const tx = db.transaction(store, "readwrite");
    fn(tx.objectStore(store));
    return txDone(tx);
  };
  return {
    loadAll: () =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const store = tx.objectStore(STORE);
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        tx.oncomplete = () => {
          const out = new Map<string, string>();
          const keys = keysReq.result;
          const vals = valsReq.result as unknown[];
          keys.forEach((k, i) => {
            const v = vals[i];
            if (typeof k === "string" && typeof v === "string") out.set(k, v);
          });
          resolve(out);
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
    put: (k, v) => write((s) => s.put(v, k)),
    del: (k) => write((s) => s.delete(k)),
    replaceAll: (entries) =>
      write((s) => {
        s.clear();
        for (const [k, v] of entries) s.put(v, k);
      }),
    saveBefore: (snapshot, at) => write((s) => s.put(JSON.stringify(snapshot), at), BEFORE),
    markMoved: (info) => write((s) => s.put(JSON.stringify(info), MOVED_KEY), BEFORE),
    isMoved: () =>
      new Promise((resolve, reject) => {
        const req = db.transaction(BEFORE, "readonly").objectStore(BEFORE).get(MOVED_KEY);
        req.onsuccess = () => resolve(typeof req.result === "string");
        req.onerror = () => reject(req.error);
      }),
  };
}

// ---- wrapping window.localStorage ----

let installed: BigStore | null = null;

/** The running store (null = the app runs on plain localStorage). */
export function bigStore(): BigStore | null {
  return installed;
}

/** For measuring how full the phone's localStorage itself is. */
export function nativeStorageView(): Pick<Storage, "length" | "key" | "getItem"> {
  return installed ? installed.nativeView() : window.localStorage;
}

/** Wraps Storage.prototype for `target` only: managed keys go to the store; sessionStorage is never touched. */
export function wrapStorage(store: BigStore, target: Storage, proto: Storage = Object.getPrototypeOf(target) as Storage): void {
  const get = proto.getItem;
  const set = proto.setItem;
  const remove = proto.removeItem;
  const key = proto.key;
  const clear = proto.clear;
  const lengthDesc = Object.getOwnPropertyDescriptor(proto, "length");
  proto.getItem = function (this: Storage, k: string) {
    return this === target && isManaged(String(k)) ? store.get(String(k)) : get.call(this, k);
  };
  proto.setItem = function (this: Storage, k: string, v: string) {
    if (this === target && isManaged(String(k))) return store.set(String(k), String(v));
    set.call(this, k, v);
    if (this === target) store.invalidateKeys();
  };
  proto.removeItem = function (this: Storage, k: string) {
    if (this === target && isManaged(String(k))) return store.remove(String(k));
    remove.call(this, k);
    if (this === target) store.invalidateKeys();
  };
  proto.key = function (this: Storage, i: number) {
    return this === target ? (store.keys()[i] ?? null) : key.call(this, i);
  };
  proto.clear = function (this: Storage) {
    if (this === target) for (const k of [...store.keys()]) if (isManaged(k)) store.remove(k);
    clear.call(this);
    if (this === target) store.invalidateKeys();
  };
  if (lengthDesc?.get) {
    const nativeLength = lengthDesc.get;
    Object.defineProperty(proto, "length", {
      configurable: true,
      enumerable: lengthDesc.enumerable,
      get(this: Storage) {
        return this === target ? store.keys().length : (nativeLength.call(this) as number);
      },
    });
  }
}

function nativeOf(ls: Storage): NativeStorage {
  const proto = Object.getPrototypeOf(ls) as Storage;
  const get = proto.getItem;
  const set = proto.setItem;
  const remove = proto.removeItem;
  const key = proto.key;
  const lengthGet = Object.getOwnPropertyDescriptor(proto, "length")?.get;
  return {
    get: (k) => get.call(ls, k),
    set: (k, v) => set.call(ls, k, v),
    remove: (k) => remove.call(ls, k),
    keys: () => {
      const n = lengthGet ? (lengthGet.call(ls) as number) : ls.length;
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        const k = key.call(ls, i);
        if (k !== null) out.push(k);
      }
      return out;
    },
  };
}

/**
 * Starts the big storage, once, before the app shows its data. Must run before anything else wraps setItem (the team
 * link's «send within a second» sits on top of it).
 */
export async function startBigStorage(): Promise<StartResult> {
  if (installed) return { kind: "loaded" };
  if (typeof window === "undefined" || typeof indexedDB === "undefined") return { kind: "failed", migrated: false };
  const ls = window.localStorage;
  const native = nativeOf(ls);
  const migrated = native.get(INFO_KEY) !== null;
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return { kind: "failed", migrated };
  }
  const store = new BigStore(indexedDbBackend(db), native);
  const result = await store.init();
  if (result.kind === "failed") return result;
  wrapStorage(store, ls);
  installed = store;
  // the app leaves the screen: push every save into IndexedDB now
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void store.flush();
  });
  return result;
}

/** When the data moved, how many keys and characters (the settings page). */
export function loadMigrationInfo(): MigrationInfo | null {
  try {
    return JSON.parse(window.localStorage.getItem(INFO_KEY) ?? "null") as MigrationInfo | null;
  } catch {
    return null;
  }
}
