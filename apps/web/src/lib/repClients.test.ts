import { describe, expect, it } from "vitest";
import type { StarlinkAccountSummary } from "@starnet/shared";
import type { Client, ClientStore } from "./clientStore";
import type { LedgerByAccount, LedgerEntry } from "./ledgerStore";
import {
  addRepBookEntry,
  currentRepOfClient,
  listRepClients,
  moveClientToOwner,
  ourDebtLedger,
  planRepHandover,
  replayRepClients,
  repTransferCandidates,
  transferClientsToRep,
  undoRepBookEntry,
  type RepBookEntry,
} from "./repClients";

// Fake data only.
function client(id: string, name = id): Client {
  return { id, name, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

function device(id: string, clientId: string, representativeId?: string): StarlinkAccountSummary {
  return { id, name: id, clientId, representativeId } as StarlinkAccountSummary;
}

let seq = 0;
function entry(kind: "debit" | "credit", amount: number, at: string, extra: Partial<LedgerEntry> = {}): LedgerEntry {
  seq += 1;
  return { id: `e${seq}`, kind, amount, currency: "MRU", note: "", email: "", date: at.slice(0, 10), createdAt: at, ...extra };
}

function bookEntry(kind: RepBookEntry["kind"], amount: number, at: string, repId = "r1", clientId = "c1"): RepBookEntry {
  seq += 1;
  return { id: `b${seq}`, repId, clientId, kind, amount, currency: "MRU", date: at.slice(0, 10), createdAt: at };
}

const T1 = "2026-03-01T10:00:00.000Z";
const T2 = "2026-04-01T10:00:00.000Z";
const T3 = "2026-05-01T10:00:00.000Z";
const T4 = "2026-06-01T10:00:00.000Z";
const T5 = "2026-07-01T10:00:00.000Z";

describe("transferring a rep's customers onto him («نقل ديون زبائنه عليه»)", () => {
  const accounts = [device("d1", "c1", "r1"), device("d2", "c2", "r1"), device("d3", "c3", "r2"), device("d4", "c4")];
  const ledger: LedgerByAccount = {
    d1: [entry("debit", 3000, T1), entry("credit", 1000, T2)],
    d2: [entry("debit", 500, T1)],
    d3: [entry("debit", 700, T1)],
    d4: [entry("debit", 900, T1)],
  };
  const clients: ClientStore = { c1: client("c1", "أحمد"), c2: client("c2", "بلال"), c3: client("c3"), c4: client("c4") };

  it("lists only this rep's customers, with what they owe us now", () => {
    const rows = repTransferCandidates("r1", clients, accounts, ledger);
    expect(rows.map((r) => [r.clientId, r.balance])).toEqual([
      ["c1", { MRU: 2000 }],
      ["c2", { MRU: 500 }],
    ]);
  });

  it("moves their debt onto the rep, opens his book with it, and takes it out of our debts", () => {
    const moved = transferClientsToRep(clients, "r1", ["c1"], T3);
    expect(currentRepOfClient(moved.c1)).toBe("r1");
    const replays = replayRepClients(moved, accounts, ledger, []);
    const [row] = listRepClients("r1", moved, accounts, replays);
    expect(row).toMatchObject({ clientId: "c1", current: true, book: { MRU: 2000 }, owedToUs: { MRU: 2000 } });
    const ours = ourDebtLedger(ledger, accounts, replays);
    expect(ours.d1).toEqual([]);
    expect(ours.d2).toEqual(ledger.d2); // not transferred yet: still ours
  });
});

describe("a rep's customer after the transfer", () => {
  const accounts = [device("d1", "c1", "r1")];
  const base = { ...client("c1"), repSegments: [{ repId: "r1", from: T2, carry: true }] };

  it("a renewal is the rep's debt to us AND the customer's debt in the rep's book", () => {
    const ledger: LedgerByAccount = { d1: [entry("debit", 1500, T3)] };
    const replays = replayRepClients({ c1: base }, accounts, ledger, []);
    const replay = replays.get("c1")!;
    expect(replay.owedToUs.r1).toEqual({ MRU: 1500 });
    expect(replay.book.r1).toEqual({ MRU: 1500 });
    expect(replay.bookLines.map((l) => l.kind)).toEqual(["renewal"]);
  });

  it("the customer paying the rep changes only the rep's book, never what the rep owes us", () => {
    const ledger: LedgerByAccount = { d1: [entry("debit", 1500, T3)] };
    const replays = replayRepClients({ c1: base }, accounts, ledger, [bookEntry("payment", 1000, T4)]);
    const replay = replays.get("c1")!;
    expect(replay.book.r1).toEqual({ MRU: 500 });
    expect(replay.owedToUs.r1).toEqual({ MRU: 1500 });
  });

  it("له/عليه entries from the bot move the book only", () => {
    const replays = replayRepClients({ c1: base }, accounts, {}, [bookEntry("charge", 300, T3), bookEntry("credit", 100, T4)]);
    expect(replays.get("c1")!.book.r1).toEqual({ MRU: 200 });
    expect(replays.get("c1")!.owedToUs.r1).toBeUndefined();
  });

  it("the rep handing us money settles his debt, spread over his customers' devices", () => {
    const ledger: LedgerByAccount = { d1: [entry("debit", 1500, T3)] };
    const replays = replayRepClients({ c1: base }, accounts, ledger, []);
    const plan = planRepHandover("r1", 2000, "MRU", accounts, ledger, replays);
    expect(plan).toEqual({ allocations: [{ accountId: "d1", amount: 1500 }], remainder: 500 });
    const paid: LedgerByAccount = { d1: [...ledger.d1!, entry("credit", 1500, T4, { heldByRepId: "r1" })] };
    const after = replayRepClients({ c1: base }, accounts, paid, []);
    expect(after.get("c1")!.owedToUs.r1).toEqual({ MRU: 0 });
    expect(after.get("c1")!.book.r1).toEqual({ MRU: 1500 }); // the customer still owes the rep
  });
});

describe("moving a customer away from a rep («أسأل عند النقل»)", () => {
  const accounts = [device("d1", "c1", "r1")];
  const ledger: LedgerByAccount = { d1: [entry("debit", 1000, T3), entry("debit", 400, T5)] };
  const onR1 = { ...client("c1"), repSegments: [{ repId: "r1", from: T2, carry: true }] };

  it("balance stays with the first rep: he keeps owing us and keeps his book; the new owner starts at zero", () => {
    const moved = moveClientToOwner(onR1, "r2", false, T4);
    const replay = replayRepClients({ c1: moved }, accounts, ledger, [bookEntry("payment", 200, T3)]).get("c1")!;
    expect(replay.owedToUs.r1).toEqual({ MRU: 1000 });
    expect(replay.book.r1).toEqual({ MRU: 800 });
    expect(replay.owedToUs.r2).toEqual({ MRU: 400 });
    expect(replay.book.r2).toEqual({ MRU: 400 });
    const rows = listRepClients("r1", { c1: moved }, accounts, new Map([["c1", replay]]));
    expect(rows[0]).toMatchObject({ current: false, book: { MRU: 800 } });
  });

  it("balance moves with him: the first rep is cleared, the new rep takes both balances", () => {
    const moved = moveClientToOwner(onR1, "r2", true, T4);
    const replay = replayRepClients({ c1: moved }, accounts, ledger, [bookEntry("payment", 200, T3)]).get("c1")!;
    expect(replay.owedToUs.r1).toEqual({});
    expect(replay.book.r1).toEqual({});
    expect(replay.owedToUs.r2).toEqual({ MRU: 1400 });
    expect(replay.book.r2).toEqual({ MRU: 1200 }); // what he really owed the first rep, + the new renewal
  });

  it("back to us with his balance: it is our debt again, in the dated views too", () => {
    const moved = moveClientToOwner(onR1, undefined, true, T4);
    const replays = replayRepClients({ c1: moved }, accounts, ledger, []);
    expect(replays.get("c1")!.owedToUs[""]).toEqual({ MRU: 1400 });
    expect(ourDebtLedger(ledger, accounts, replays).d1).toEqual(ledger.d1);
  });

  it("moving to the owner he already has changes nothing", () => {
    expect(moveClientToOwner(onR1, "r1", true, T4)).toBe(onR1);
    expect(moveClientToOwner(client("c9"), undefined, true, T4).repSegments).toBeUndefined();
  });
});

describe("the rep's book entries", () => {
  it("the same bot message applied twice is recorded once", () => {
    const first = addRepBookEntry([], { id: "x1", repId: "r1", clientId: "c1", kind: "payment", amount: 50, currency: "MRU", date: "2026-05-01" });
    expect(first.ok).toBe(true);
    const again = addRepBookEntry(first.ok ? first.book : [], { id: "x1", repId: "r1", clientId: "c1", kind: "payment", amount: 50, currency: "MRU", date: "2026-05-01" });
    expect(again.ok && again.book).toHaveLength(1);
  });

  it("rejects a zero amount", () => {
    expect(addRepBookEntry([], { repId: "r1", clientId: "c1", kind: "charge", amount: 0, currency: "MRU", date: "2026-05-01" }).ok).toBe(false);
  });

  it("↩️ تراجع: only his own entry, only within 24 hours", () => {
    const book = [bookEntry("payment", 100, "2026-05-01T10:00:00.000Z")];
    const id = book[0]!.id;
    expect(undoRepBookEntry(book, id, "r2", new Date("2026-05-01T11:00:00.000Z")).ok).toBe(false);
    expect(undoRepBookEntry(book, id, "r1", new Date("2026-05-02T11:00:00.000Z")).ok).toBe(false);
    const undone = undoRepBookEntry(book, id, "r1", new Date("2026-05-01T12:00:00.000Z"));
    expect(undone.ok && undone.book).toEqual([]);
  });
});
