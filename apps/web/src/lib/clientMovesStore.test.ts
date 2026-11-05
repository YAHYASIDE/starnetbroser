// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { commitDemoAccounts, saveDemoAccounts } from "./demoAccountStore";
import { loadClientMoves } from "./clientMoves";
import type { StarlinkAccountSummary } from "@starnet/shared";

const dev = (id: string, clientId?: string) => ({ id, name: id, ...(clientId ? { clientId } : {}) }) as unknown as StarlinkAccountSummary;

describe("🔀 saving the devices records a move between customers", () => {
  beforeEach(() => window.localStorage.clear());

  it("saveDemoAccounts and commitDemoAccounts both record it, a first link doesn't", () => {
    saveDemoAccounts([dev("d1", "A"), dev("d2")]);
    expect(loadClientMoves()).toEqual([]);
    saveDemoAccounts([dev("d1", "B"), dev("d2", "C")]);
    expect(loadClientMoves().map((m) => [m.accountId, m.from, m.to])).toEqual([["d1", "A", "B"]]);
    const base = [dev("d1", "B"), dev("d2", "C")];
    commitDemoAccounts(base, [dev("d1", "B"), dev("d2", "A")], "test");
    expect(loadClientMoves().map((m) => [m.accountId, m.from, m.to])).toEqual([["d1", "A", "B"], ["d2", "C", "A"]]);
  });
});
