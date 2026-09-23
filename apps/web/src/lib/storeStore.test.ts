import { describe, expect, it } from "vitest";
import {
  computeInventoryValueByCurrency,
  computeStock,
  computeStockByItem,
  createStoreItem,
  deleteStoreItem,
  deleteStoreTransaction,
  getStoreItem,
  lastTransactionForItem,
  listStoreItems,
  listTransactionsForClient,
  listTransactionsForItem,
  recordStoreTransaction,
  StoreItemRegistry,
  StoreTransactionList,
} from "./storeStore";

function makeItems(...names: string[]): { items: StoreItemRegistry; ids: string[] } {
  let items: StoreItemRegistry = {};
  const ids: string[] = [];
  for (const name of names) {
    const result = createStoreItem(items, { name });
    items = result.items;
    ids.push(result.item.id);
  }
  return { items, ids };
}

describe("createStoreItem", () => {
  it("creates an item with a trimmed name and default unit", () => {
    const { item } = createStoreItem({}, { name: "  راوتر Starlink  " });
    expect(item.name).toBe("راوتر Starlink");
    expect(item.unit).toBe("قطعة");
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBe(item.updatedAt);
  });

  it("keeps a custom unit when given", () => {
    const { item } = createStoreItem({}, { name: "كابل", unit: "متر" });
    expect(item.unit).toBe("متر");
  });
});

describe("listStoreItems", () => {
  it("sorts items by name (Arabic-aware)", () => {
    const { items } = makeItems("زبدية", "أنتينا", "بطارية");
    const names = listStoreItems(items).map((i) => i.name);
    expect(names).toEqual(["أنتينا", "بطارية", "زبدية"]);
  });
});

describe("deleteStoreItem", () => {
  it("removes the item and leaves the rest", () => {
    const { items, ids } = makeItems("أ", "ب");
    const next = deleteStoreItem(items, ids[0]);
    expect(getStoreItem(next, ids[0])).toBeUndefined();
    expect(getStoreItem(next, ids[1])).toBeDefined();
  });
});

describe("computeStock / computeStockByItem", () => {
  it("is 0 with no transactions", () => {
    expect(computeStock([], "item-1")).toBe(0);
  });

  it("adds buys and subtracts sells for one item", () => {
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 5, currencyCode: "USD", date: "2026-01-01", createdAt: "t1" },
      { id: "2", itemId: "a", kind: "sell", quantity: 3, unitPrice: 8, currencyCode: "USD", date: "2026-01-02", createdAt: "t2" },
    ];
    expect(computeStock(transactions, "a")).toBe(7);
  });

  it("keeps items independent of each other", () => {
    const { items, ids } = makeItems("a", "b");
    const transactions: StoreTransactionList = [
      { id: "1", itemId: ids[0], kind: "buy", quantity: 10, unitPrice: 5, currencyCode: "USD", date: "2026-01-01", createdAt: "t1" },
      { id: "2", itemId: ids[1], kind: "buy", quantity: 4, unitPrice: 5, currencyCode: "USD", date: "2026-01-01", createdAt: "t2" },
    ];
    const stockByItem = computeStockByItem(items, transactions);
    expect(stockByItem[ids[0]]).toBe(10);
    expect(stockByItem[ids[1]]).toBe(4);
  });
});

describe("recordStoreTransaction", () => {
  it("rejects a non-positive quantity", () => {
    const result = recordStoreTransaction([], {
      itemId: "a",
      kind: "buy",
      quantity: 0,
      unitPrice: 5,
      currencyCode: "USD",
      date: "2026-01-01",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-positive unit price", () => {
    const result = recordStoreTransaction([], {
      itemId: "a",
      kind: "buy",
      quantity: 5,
      unitPrice: 0,
      currencyCode: "USD",
      date: "2026-01-01",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a buy and appends the transaction", () => {
    const result = recordStoreTransaction([], {
      itemId: "a",
      kind: "buy",
      quantity: 10,
      unitPrice: 5,
      currencyCode: "USD",
      date: "2026-01-01",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.transactions).toHaveLength(1);
      expect(result.transaction.kind).toBe("buy");
    }
  });

  it("accepts a sell within available stock", () => {
    const buy = recordStoreTransaction([], {
      itemId: "a",
      kind: "buy",
      quantity: 10,
      unitPrice: 5,
      currencyCode: "USD",
      date: "2026-01-01",
    });
    if (!buy.ok) throw new Error("expected buy to succeed");
    const sell = recordStoreTransaction(buy.transactions, {
      itemId: "a",
      kind: "sell",
      quantity: 10,
      unitPrice: 8,
      currencyCode: "USD",
      date: "2026-01-02",
    });
    expect(sell.ok).toBe(true);
  });

  it("rejects a sell that exceeds available stock", () => {
    const buy = recordStoreTransaction([], {
      itemId: "a",
      kind: "buy",
      quantity: 5,
      unitPrice: 5,
      currencyCode: "USD",
      date: "2026-01-01",
    });
    if (!buy.ok) throw new Error("expected buy to succeed");
    const sell = recordStoreTransaction(buy.transactions, {
      itemId: "a",
      kind: "sell",
      quantity: 6,
      unitPrice: 8,
      currencyCode: "USD",
      date: "2026-01-02",
    });
    expect(sell.ok).toBe(false);
    if (!sell.ok) expect(sell.message).toContain("5");
  });

  it("drops clientId for a buy even if one was passed", () => {
    const result = recordStoreTransaction([], {
      itemId: "a",
      kind: "buy",
      quantity: 5,
      unitPrice: 5,
      currencyCode: "USD",
      clientId: "client-1",
      date: "2026-01-01",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.transaction.clientId).toBeUndefined();
  });

  it("keeps clientId for a sell", () => {
    const buy = recordStoreTransaction([], {
      itemId: "a",
      kind: "buy",
      quantity: 5,
      unitPrice: 5,
      currencyCode: "USD",
      date: "2026-01-01",
    });
    if (!buy.ok) throw new Error("expected buy to succeed");
    const sell = recordStoreTransaction(buy.transactions, {
      itemId: "a",
      kind: "sell",
      quantity: 2,
      unitPrice: 8,
      currencyCode: "USD",
      clientId: "client-1",
      date: "2026-01-02",
    });
    expect(sell.ok).toBe(true);
    if (sell.ok) expect(sell.transaction.clientId).toBe("client-1");
  });
});

describe("deleteStoreTransaction", () => {
  it("removes only the given transaction", () => {
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 5, unitPrice: 5, currencyCode: "USD", date: "2026-01-01", createdAt: "t1" },
      { id: "2", itemId: "a", kind: "buy", quantity: 3, unitPrice: 5, currencyCode: "USD", date: "2026-01-01", createdAt: "t2" },
    ];
    const next = deleteStoreTransaction(transactions, "1");
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("2");
  });
});

describe("listTransactionsForItem / listTransactionsForClient", () => {
  const transactions: StoreTransactionList = [
    { id: "1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 5, currencyCode: "USD", date: "2026-01-01", createdAt: "t1" },
    { id: "2", itemId: "a", kind: "sell", quantity: 2, unitPrice: 8, currencyCode: "USD", clientId: "c1", date: "2026-01-03", createdAt: "t3" },
    { id: "3", itemId: "b", kind: "sell", quantity: 1, unitPrice: 8, currencyCode: "USD", clientId: "c2", date: "2026-01-02", createdAt: "t2" },
    { id: "4", itemId: "a", kind: "sell", quantity: 1, unitPrice: 8, currencyCode: "USD", clientId: "c1", date: "2026-01-02", createdAt: "t2b" },
  ];

  it("lists only the given item's transactions, newest first", () => {
    const result = listTransactionsForItem(transactions, "a");
    expect(result.map((t) => t.id)).toEqual(["2", "4", "1"]);
  });

  it("lists only the given client's sell transactions, newest first", () => {
    const result = listTransactionsForClient(transactions, "c1");
    expect(result.map((t) => t.id)).toEqual(["2", "4"]);
  });

  it("returns nothing for a client with no purchases", () => {
    expect(listTransactionsForClient(transactions, "nobody")).toEqual([]);
  });
});

describe("lastTransactionForItem", () => {
  it("returns undefined for an item with no transactions", () => {
    expect(lastTransactionForItem([], "a")).toBeUndefined();
  });

  it("returns the most recent transaction for that item", () => {
    const transactions: StoreTransactionList = [
      { id: "1", itemId: "a", kind: "buy", quantity: 10, unitPrice: 100, currencyCode: "MRU", date: "2026-01-01", createdAt: "t1" },
      { id: "2", itemId: "a", kind: "sell", quantity: 2, unitPrice: 150, currencyCode: "MRU", date: "2026-01-05", createdAt: "t2" },
    ];
    expect(lastTransactionForItem(transactions, "a")?.id).toBe("2");
  });
});

describe("computeInventoryValueByCurrency", () => {
  it("is empty with no items", () => {
    expect(computeInventoryValueByCurrency({}, [])).toEqual({});
  });

  it("skips an item with zero or negative stock", () => {
    const { items, ids } = makeItems("a");
    const transactions: StoreTransactionList = [
      { id: "1", itemId: ids[0], kind: "buy", quantity: 5, unitPrice: 100, currencyCode: "MRU", date: "2026-01-01", createdAt: "t1" },
      { id: "2", itemId: ids[0], kind: "sell", quantity: 5, unitPrice: 150, currencyCode: "MRU", date: "2026-01-02", createdAt: "t2" },
    ];
    expect(computeInventoryValueByCurrency(items, transactions)).toEqual({});
  });

  it("values remaining stock at the last recorded unit price, grouped by currency", () => {
    const { items, ids } = makeItems("a", "b");
    const transactions: StoreTransactionList = [
      { id: "1", itemId: ids[0], kind: "buy", quantity: 10, unitPrice: 100, currencyCode: "MRU", date: "2026-01-01", createdAt: "t1" },
      { id: "2", itemId: ids[0], kind: "sell", quantity: 4, unitPrice: 150, currencyCode: "MRU", date: "2026-01-02", createdAt: "t2" },
      { id: "3", itemId: ids[1], kind: "buy", quantity: 3, unitPrice: 20, currencyCode: "USD", date: "2026-01-01", createdAt: "t3" },
    ];
    // item a: stock 6, last price 150 MRU -> 900 MRU. item b: stock 3, last price 20 USD -> 60 USD.
    expect(computeInventoryValueByCurrency(items, transactions)).toEqual({ MRU: 900, USD: 60 });
  });
});
