import { describe, expect, it } from "vitest";
import type { Client, ClientStore } from "./clientStore";
import {
  applyClientImport,
  findExistingClient,
  IMPORT_FILE_KIND,
  parseClientImport,
  planClientImport,
  planTotals,
  undoClientImport,
} from "./clientImport";

const client = (id: string, name: string): Client => ({ id, name, createdAt: "", updatedAt: "" });

describe("📥 استيراد زبائن", () => {
  it("reads «date له/عليه amount name» lines - also the PDF's presentation-form letters", () => {
    const text = ["التاريخ نوع الحساب الرصيد اسم الحساب", "2026-09-30 له 1,917,900 زبون أول", "2025-02-27 ﻋﻠﻴﻪ 160,000 ﺯﺑﻮﻥ ﺛﺎﻥ", "Google Play Store"].join("\n");
    const parsed = parseClientImport(text);
    expect(parsed).toEqual({
      ok: true,
      rows: [
        { name: "زبون أول", direction: "weOwe", amount: 1917900, date: "2026-09-30" },
        { name: "زبون ثان", direction: "owesUs", amount: 160000, date: "2025-02-27" },
      ],
    });
  });

  it("reads the prepared JSON file and drops invalid rows", () => {
    const json = JSON.stringify({
      kind: IMPORT_FILE_KIND,
      rows: [
        { name: "زبون", direction: "عليه", amount: "2,125", date: "2026-10-05" },
        { name: "", direction: "له", amount: 5, date: "2026-10-05" },
        { name: "بلا مبلغ", direction: "له", amount: 0, date: "2026-10-05" },
      ],
    });
    expect(parseClientImport(json)).toEqual({ ok: true, rows: [{ name: "زبون", direction: "owesUs", amount: 2125, date: "2026-10-05" }] });
    expect(parseClientImport('{"kind":"other"}').ok).toBe(false);
    expect(parseClientImport("").ok).toBe(false);
  });

  it("skips a name that is already a customer - «احمد ولد محجوب» = «احمد محجوب», letters folded", () => {
    const clients = [client("a", "احمد محجوب"), client("b", "جمال"), client("c", "محمد")];
    expect(findExistingClient("أحمد ولد محجوب", clients)?.id).toBe("a");
    expect(findExistingClient("جمال", clients)?.id).toBe("b");
    // one shared word alone is not enough
    expect(findExistingClient("محمد ولد بكر", clients)).toBeUndefined();
    expect(findExistingClient("عالي ولد شيخا", clients)).toBeUndefined();
  });

  it("plans: new rows added, existing ones skipped, totals per side", () => {
    const rows = [
      { name: "احمد ولد محجوب", direction: "weOwe" as const, amount: 1917900, date: "2026-09-30" },
      { name: "زبون جديد", direction: "owesUs" as const, amount: 1000, date: "2026-09-01" },
    ];
    const plan = planClientImport(rows, [client("a", "احمد محجوب")]);
    expect(plan.toAdd.map((r) => r.name)).toEqual(["زبون جديد"]);
    expect(plan.skipped.map((s) => s.existing.id)).toEqual(["a"]);
    expect(planTotals(rows)).toEqual({ owesUs: 1000, weOwe: 1917900 });
  });

  it("adds each customer with an opening balance in أوقية on the file's date (money didn't move), and undoes it", () => {
    const rows = [
      { name: "زبون عليه", direction: "owesUs" as const, amount: 345000, date: "2026-09-01" },
      { name: "زبون له", direction: "weOwe" as const, amount: 50000, date: "2026-09-03" },
    ];
    const existing: ClientStore = { x: client("x", "قديم") };
    const done = applyClientImport(existing, [], rows);
    expect(Object.keys(done.store)).toHaveLength(3);
    expect(done.adjustments).toHaveLength(2);
    expect(done.adjustments[0]).toMatchObject({ partyKind: "client", direction: "owesUs", amount: 345000, currencyCode: "MRU", date: "2026-09-01" });
    expect(done.adjustments[0]!.cashMoved).toBeUndefined();
    expect(done.adjustments[0]!.accountId).toBeUndefined();

    // a device was linked to the second customer meanwhile: he stays, the other goes
    const second = done.batch.clientIds[1]!;
    const undone = undoClientImport(done.store, done.adjustments, done.batch, [{ clientId: second }], []);
    expect(undone.adjustments).toEqual([]);
    expect(Object.keys(undone.store).sort()).toEqual([second, "x"].sort());
    expect(undone.kept).toBe(1);
  });
});
