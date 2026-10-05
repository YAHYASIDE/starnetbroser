/**
 * ☁️ The live link between the operator's app and each rep's app (his Oct 2026 request): every
 * few seconds while the app is open, each phone publishes its side of a rep's customers to his
 * Firebase and takes the other side's news (lib/liveSyncData.ts). Everything is encrypted with
 * that rep's code + phone key (the same key as his copy), so only those two phones can read it.
 *
 * - On the rep's phone: his customers and his devices' links, as in his app.
 * - On the operator's phone (local mode): per bound rep, that rep's customers (currentRepOfClient)
 *   and his devices' links. A customer the rep adds arrives as HIS customer (rep segment), so the
 *   total is counted on the rep (the rep-owes-all model) - his choice.
 * Firestore: starnet/{spaceId}/reps/{repId}/sides/{rep|owner} → { data, at }.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import { decryptBackup, encryptBackup, type EncryptedBackup } from "./backupCrypto";
import type { Client, ClientStore } from "./clientStore";
import { readDocument, writeDocument, type FetchFn } from "./firestoreRest";
import { buildSide, EMPTY_TRACK, mergeIncoming, sameSide, trackLocal, type LocalView, type MergeResult, type SidePayload, type TrackState } from "./liveSyncData";
import { loadLiveSyncConfig, type LiveSyncConfig } from "./liveSyncConfig";
import { currentRepOfClient, moveClientToOwner } from "./repClients";
import { loadRepCopy } from "./repCopy";
import { boundCopyKey, ensureRepPhoneKey, loadRepDeviceCodes, loadRepMode, repPhoneKey } from "./repDeviceTransfer";
import { isRepWorkspace } from "./repMode";
import { ACCOUNTS_KEY, applyOperatorLiveChange, CLIENTS_KEY } from "./repWorkspace";

// ---- what each phone shares (pure) ----

const live = (a: StarlinkAccountSummary) => !a.deletedAt && !a.archivedAt;

/** The rep's phone: all his customers and all his devices' links. */
export function repView(clients: ClientStore, accounts: StarlinkAccountSummary[]): LocalView {
  return {
    clients: Object.fromEntries(Object.values(clients).map((c) => [c.id, { name: c.name, ...(c.phone ? { phone: c.phone } : {}) }])),
    links: Object.fromEntries(accounts.filter(live).map((a) => [a.id, a.clientId ?? null])),
  };
}

/** The operator's phone, for one rep: that rep's customers (and any linked to his devices) and his
 * devices' links. */
export function ownerViewForRep(clients: ClientStore, accounts: StarlinkAccountSummary[], repId: string): LocalView {
  const devices = accounts.filter((a) => live(a) && a.representativeId === repId);
  const ids = new Set(Object.values(clients).filter((c) => currentRepOfClient(c) === repId).map((c) => c.id));
  for (const d of devices) if (d.clientId) ids.add(d.clientId);
  return {
    clients: Object.fromEntries([...ids].filter((id) => clients[id]).map((id) => [id, { name: clients[id]!.name, ...(clients[id]!.phone ? { phone: clients[id]!.phone } : {}) }])),
    links: Object.fromEntries(devices.map((a) => [a.id, a.clientId ?? null])),
  };
}

/** Writes the news into a phone's customers and devices. `repId` set = the operator's phone: a
 * customer created here from the rep's side becomes that rep's customer. */
export function applyMerge(
  clients: ClientStore,
  accounts: StarlinkAccountSummary[],
  merge: Pick<MergeResult, "clients" | "links">,
  nowIso: string,
  repId?: string,
): { clients: ClientStore; accounts: StarlinkAccountSummary[] } {
  const nextClients: ClientStore = { ...clients };
  for (const [id, value] of Object.entries(merge.clients)) {
    const existing = nextClients[id];
    if (existing) {
      nextClients[id] = { ...existing, name: value.name, phone: value.phone, updatedAt: nowIso };
    } else {
      let created: Client = { id, name: value.name, ...(value.phone ? { phone: value.phone } : {}), createdAt: nowIso, updatedAt: nowIso };
      if (repId) created = moveClientToOwner(created, repId, true, nowIso);
      nextClients[id] = created;
    }
  }
  const nextAccounts = accounts.map((a) => {
    if (!(a.id in merge.links)) return a;
    const clientId = merge.links[a.id];
    if (clientId) return { ...a, clientId };
    const { clientId: _gone, ...rest } = a;
    return rest as StarlinkAccountSummary;
  });
  return { clients: nextClients, accounts: nextAccounts };
}

// ---- per-phone memory (settings, not backed up) ----

interface ScopeMeta {
  state: TrackState;
  lastPushed?: SidePayload;
  lastPulledAt?: string;
}

const META_KEY = "starnet.liveSyncMeta";
const STATUS_KEY = "starnet.liveSyncStatus";

export interface LiveSyncStatus {
  at: string;
  ok: boolean;
  message: string;
}

function loadMeta(): Record<string, ScopeMeta> {
  try {
    return JSON.parse(window.localStorage.getItem(META_KEY) ?? "{}") as Record<string, ScopeMeta>;
  } catch {
    return {};
  }
}

function saveMeta(meta: Record<string, ScopeMeta>): void {
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // starts over next time
  }
}

export function loadLiveSyncStatus(): LiveSyncStatus | null {
  try {
    const raw = window.localStorage.getItem(STATUS_KEY);
    return raw ? (JSON.parse(raw) as LiveSyncStatus) : null;
  } catch {
    return null;
  }
}

function saveStatus(status: LiveSyncStatus): void {
  try {
    window.localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    // shown next time
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Fired after news was written into this phone's stores (pages may reload their data). */
export const LIVE_SYNC_EVENT = "starnet:live-sync";

// ---- one exchange for one rep ----

interface Exchange {
  config: LiveSyncConfig;
  scope: string;
  repId: string;
  key: string;
  mine: "rep" | "owner";
  view: () => LocalView;
  apply: (merge: MergeResult, nowIso: string) => void;
  fetchFn: FetchFn;
}

async function exchange(x: Exchange, meta: Record<string, ScopeMeta>): Promise<{ ok: true; changed: boolean } | { ok: false; message: string }> {
  const nowIso = new Date().toISOString();
  const theirs = x.mine === "rep" ? "owner" : "rep";
  const base = `starnet/${x.config.spaceId}/reps/${x.repId}/sides`;
  const scope = meta[x.scope] ?? { state: EMPTY_TRACK };
  let state = trackLocal(scope.state, x.view(), nowIso);
  let changed = false;

  const pulled = await readDocument(x.config, `${base}/${theirs}`, x.fetchFn);
  if (!pulled.ok) return pulled;
  if (pulled.value?.data && pulled.value.at !== scope.lastPulledAt) {
    try {
      const incoming = (await decryptBackup(JSON.parse(pulled.value.data) as EncryptedBackup, x.key)) as SidePayload;
      const merge = mergeIncoming(state, x.view(), incoming, x.mine === "owner");
      if (Object.keys(merge.clients).length || Object.keys(merge.links).length) {
        x.apply(merge, nowIso);
        changed = true;
      }
      state = merge.state;
      scope.lastPulledAt = pulled.value.at;
    } catch {
      return { ok: false, message: "تعذّر فتح بيانات الطرف الآخر - أرسل للمندوب نسخة جديدة (الرمز تغيّر)" };
    }
  }

  const side = buildSide(state, x.view(), nowIso);
  if (!sameSide(scope.lastPushed, side)) {
    const enc = await encryptBackup(side, x.key);
    const written = await writeDocument(x.config, `${base}/${x.mine}`, { data: JSON.stringify(enc), at: nowIso }, x.fetchFn);
    if (!written.ok) return written;
    scope.lastPushed = side;
  }
  meta[x.scope] = { ...scope, state };
  return { ok: true, changed };
}

// ---- the run ----

export type LiveSyncRun = { ok: true; changed: boolean; reps: number } | { ok: false; message: string } | { ok: true; skipped: true };

let running = false;

/** One round: the rep's phone exchanges its side; the operator's phone, one side per bound rep. */
export async function runLiveSyncOnce(fetchFn: FetchFn = fetch, reps: { id: string; name: string }[] = []): Promise<LiveSyncRun> {
  if (running || typeof window === "undefined") return { ok: true, skipped: true };
  const config = loadLiveSyncConfig();
  if (!config || !config.enabled) return { ok: true, skipped: true };
  running = true;
  const meta = loadMeta();
  try {
    let changed = false;
    let count = 0;
    if (isRepWorkspace()) {
      const mode = loadRepMode();
      const copy = loadRepCopy();
      if (!mode || !copy) return { ok: true, skipped: true };
      const r = await exchange(
        {
          config,
          scope: "rep",
          repId: copy.repId,
          key: boundCopyKey(mode.code, ensureRepPhoneKey()),
          mine: "rep",
          view: () => repView(readJson<ClientStore>(CLIENTS_KEY, {}), readJson<StarlinkAccountSummary[]>(ACCOUNTS_KEY, [])),
          apply: (merge, nowIso) =>
            applyOperatorLiveChange((stores) => {
              const next = applyMerge((stores[CLIENTS_KEY] as ClientStore) ?? {}, (stores[ACCOUNTS_KEY] as StarlinkAccountSummary[]) ?? [], merge, nowIso);
              return { [CLIENTS_KEY]: next.clients, [ACCOUNTS_KEY]: next.accounts };
            }),
          fetchFn,
        },
        meta,
      );
      if (!r.ok) return finish(r);
      changed = r.changed;
      count = 1;
    } else {
      // The operator's phone: devices live on this phone only in local mode.
      if (window.localStorage.getItem(ACCOUNTS_KEY) === null) return { ok: true, skipped: true };
      for (const rep of reps) {
        const phoneKey = repPhoneKey(rep.id);
        const code = loadRepDeviceCodes()[rep.id];
        if (!phoneKey || !code) continue;
        const r = await exchange(
          {
            config,
            scope: `owner:${rep.id}`,
            repId: rep.id,
            key: boundCopyKey(code, phoneKey),
            mine: "owner",
            view: () => ownerViewForRep(readJson<ClientStore>(CLIENTS_KEY, {}), readJson<StarlinkAccountSummary[]>(ACCOUNTS_KEY, []), rep.id),
            apply: (merge, nowIso) => {
              const next = applyMerge(readJson<ClientStore>(CLIENTS_KEY, {}), readJson<StarlinkAccountSummary[]>(ACCOUNTS_KEY, []), merge, nowIso, rep.id);
              window.localStorage.setItem(CLIENTS_KEY, JSON.stringify(next.clients));
              window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next.accounts));
            },
            fetchFn,
          },
          meta,
        );
        if (!r.ok) return finish({ ok: false, message: `${rep.name}: ${r.message}` });
        changed ||= r.changed;
        count += 1;
      }
    }
    if (changed) {
      window.dispatchEvent(new Event(LIVE_SYNC_EVENT));
      // the home screen reloads its devices and customers on this (repMenuRecords.ts)
      window.dispatchEvent(new Event("starnet:accounts-changed"));
      // the rep's app reloads its data on this (RepModeGate)
      if (isRepWorkspace()) window.dispatchEvent(new Event("starnet:rep-workspace"));
    }
    return finish({ ok: true, changed, reps: count });
  } finally {
    saveMeta(meta);
    running = false;
  }
}

function finish<T extends LiveSyncRun>(run: T): T {
  if ("skipped" in run) return run;
  saveStatus({ at: new Date().toISOString(), ok: run.ok, message: run.ok ? (run.changed ? "✓ وصلت تحديثات" : "✓ متزامن") : run.message });
  return run;
}
