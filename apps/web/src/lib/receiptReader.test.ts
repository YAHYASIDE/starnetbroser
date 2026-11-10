import { describe, expect, it } from "vitest";
import { readPendingReceipts, receiptsToRead, type ReceiptReaderDeps } from "./receiptReader";
import type { ReceiptRegistry } from "./receiptCheck";
import type { RepRequest, RepRequestList } from "./repRequests";

// Fake data only.
const RECEIPT = ["Montant", "50 000 CFA", "Date", "01 11 2026 à 09:30", "Référence", "PP261101.0930.B12345"].join("\n");

function world(requests: RepRequestList, images: Record<string, string>, texts: Record<string, string>) {
  let list = requests;
  let registry: ReceiptRegistry = {};
  const told: string[] = [];
  const kept: string[] = [];
  const deps: ReceiptReaderDeps = {
    load: () => list,
    save: (l) => (list = l),
    loadRegistry: () => registry,
    saveRegistry: (r) => (registry = r),
    download: async (fileId) => images[fileId] ?? null,
    readText: async (dataUrl) => texts[dataUrl] ?? null,
    hash: async (dataUrl) => `h-${dataUrl}`,
    keepImage: async (id) => void kept.push(id),
    tellRep: async (repId, text) => void told.push(`${repId}: ${text}`),
    now: () => new Date("2026-11-07T10:00:00Z"),
  };
  return { deps, list: () => list, registry: () => registry, told, kept };
}

const req = (id: string, fileId: string, extra: Partial<RepRequest> = {}): RepRequest => ({ id, repId: "rep1", kind: "handover", text: "t", createdAt: "2026-11-07T09:50:00Z", status: "pending", amount: 10000, currency: "SIFA", proofFileId: fileId, proofBot: "money", ...extra });

describe("🧾 reading the reps' receipts as they arrive", () => {
  it("reads the reference, keeps it on the request, and locks a second use of it - the rep is told", async () => {
    const w = world([req("r1", "f1"), req("r2", "f2")], { f1: "img1", f2: "img2" }, { img1: RECEIPT, img2: RECEIPT });
    expect(await readPendingReceipts(w.deps)).toBe(2);
    const [r1, r2] = w.list();
    expect(r1!.receipt).toMatchObject({ ref: "PP261101.0930.B12345", amount: 50000, unit: "CFA", at: "2026-11-01T09:30", hash: "h-img1" });
    expect(r1!.receiptDup).toBeUndefined();
    expect(r2!.receiptDup).toEqual({ requestId: "r1", repId: "rep1", at: "2026-11-07T09:50:00Z", by: "ref" });
    expect(w.told).toEqual(["rep1: ⛔ التحويل رقم PP261101.0930.B12345 أُرسل من قبل يوم 07/11 - لن يُسجَّل مرة ثانية.\nإن كان تحويلًا جديدًا فأرسل صورته هو."]);
    expect(w.kept).toEqual(["r1", "r2"]);
    // read once
    expect(receiptsToRead(w.list())).toEqual([]);
  });

  it("the same picture with nothing readable (the laptop) is still caught; a rejected first one frees it", async () => {
    const w = world([req("r1", "f1", { status: "rejected" }), req("r2", "f1")], { f1: "img1" }, {});
    // r1 was registered before it was rejected
    w.deps.saveRegistry({ "img:h-img1": { requestId: "r1", repId: "rep1", at: "t" } });
    await readPendingReceipts(w.deps);
    expect(w.list()[1]!.receiptDup).toBeUndefined();
    expect(w.registry()["img:h-img1"]!.requestId).toBe("r2");

    const w2 = world([req("r1", "f1"), req("r2", "f1")], { f1: "img1" }, {});
    await readPendingReceipts(w2.deps);
    expect(w2.list()[1]!.receiptDup).toMatchObject({ requestId: "r1", by: "img" });
  });

  it("a photo that can't be downloaded is tried again, three times at most; other kinds are left alone", async () => {
    const w = world([req("r1", "gone"), req("r3", "f3", { kind: "loan" })], {}, {});
    for (let i = 0; i < 5; i++) await readPendingReceipts(w.deps);
    expect(w.list()[0]!.receipt).toMatchObject({ error: "download", tries: 3 });
    expect(w.list()[1]!.receipt).toBeUndefined();
  });

  it("a request read by an older reader is read again once, correcting its amount; the rep is not told twice", async () => {
    const old = req("r1", "f1", { receipt: { ref: "PP261101.0930.B12345", amount: 111163, unit: "CFA", readAt: "2026-11-07T09:55:00Z", hash: "h-img1" }, receiptDup: { requestId: "r0", repId: "rep1", at: "2026-11-06T09:00:00Z", by: "ref" } });
    const w = world([old], { f1: "img1" }, { img1: RECEIPT });
    expect(receiptsToRead(w.list())).toHaveLength(1);
    expect(await readPendingReceipts(w.deps)).toBe(1);
    expect(w.list()[0]!.receipt).toMatchObject({ amount: 50000, v: 2 });
    expect(w.told).toEqual([]);
    expect(receiptsToRead(w.list())).toHaveLength(0);
  });
});
