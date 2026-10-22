import type { StarlinkAccountSummary } from "@starnet/shared";
import { describe, expect, it } from "vitest";
import { autoSignInOptionsFor, mailLoginFor, starlinkLoginFor } from "./localBrowser";

describe("starlinkLoginFor", () => {
  it("fills the email and uses the Wi-Fi code as the Starlink password", () => {
    expect(starlinkLoginFor({ expectedEmail: " a@b.com ", wifiPassword: "Aa1", expectedEmailPassword: "Bb2" })).toEqual({ loginEmail: "a@b.com", loginPassword: "Aa1" });
  });

  it("falls back to the email's own code, and leaves out what is missing", () => {
    expect(starlinkLoginFor({ expectedEmail: "a@b.com", expectedEmailPassword: "Bb2" })).toEqual({ loginEmail: "a@b.com", loginPassword: "Bb2" });
    expect(starlinkLoginFor({ wifiPassword: " " })).toEqual({});
  });
});

describe("mailLoginFor", () => {
  it("is the device email with the email's own password, never the Wi-Fi code", () => {
    expect(mailLoginFor({ expectedEmail: " a@outlook.com ", expectedEmailPassword: " Bb2 " })).toEqual({ email: "a@outlook.com", password: "Bb2", recoveryEmail: "starnet.om@gmail.com" });
    expect(mailLoginFor({ expectedEmail: "a@outlook.com" })).toEqual({ email: "a@outlook.com", recoveryEmail: "starnet.om@gmail.com" });
    expect(mailLoginFor({})).toEqual({ recoveryEmail: "starnet.om@gmail.com" });
  });

  it("offers the device's other codes and the most used passwords, never the saved one again", () => {
    const others = [{ name: "x", wifiPassword: "demo-common" }, { name: "y", expectedEmailPassword: "demo-mail" }] as StarlinkAccountSummary[];
    expect(mailLoginFor({ expectedEmail: "a@outlook.com", expectedEmailPassword: "demo-mail", wifiPassword: "demo-wifi" }, others)).toEqual({
      email: "a@outlook.com",
      password: "demo-mail",
      suggestions: ["demo-wifi", "demo-common"],
      recoveryEmail: "starnet.om@gmail.com",
    });
  });
});

describe("autoSignInOptionsFor", () => {
  it("opens the mailbox signed in by itself, then the Starlink browser signed in by itself", () => {
    const account = { id: "d1", name: "جهاز 1", expectedEmail: "a@outlook.com", expectedEmailPassword: "demo-mail", wifiPassword: "demo-wifi" } as StarlinkAccountSummary;
    expect(autoSignInOptionsFor(account, [account])).toEqual({
      accountId: "d1",
      accountName: "جهاز 1",
      email: "a@outlook.com",
      password: "demo-mail",
      suggestions: ["demo-wifi"],
      recoveryEmail: "starnet.om@gmail.com",
      auto: true,
      then: {
        accountName: "جهاز 1",
        url: "https://starlink.com/account/home",
        loginEmail: "a@outlook.com",
        loginPassword: "demo-wifi",
        mailPassword: "demo-mail",
        mailSuggestions: ["demo-wifi"],
        mailRecoveryEmail: "starnet.om@gmail.com",
        autoLogin: true,
      },
    });
  });
});

describe("🖥️ on the Windows app", () => {
  it("opens the device's own window with its login, and restores/exports sessions through it", async () => {
    const { openIsolatedAccountBrowser, importAccountSessions, exportAccountSessions, openAutoSync } = await import("./localBrowser");
    const calls: unknown[] = [];
    const g = globalThis as unknown as { window?: unknown };
    const hadWindow = "window" in g;
    const previous = g.window;
    g.window = {
      starnetDesktop: {
        platform: "windows",
        version: "2",
        openDevice: async (opts: unknown) => (calls.push(opts), { ok: true }),
        importSessions: async () => ({ importedCount: 2 }),
        exportSessions: async (ids: string[]) => ({ [ids[0]]: { "https://starlink.com": "a=1" } }),
      },
    };
    try {
      expect(await openIsolatedAccountBrowser("d1", "جهاز", { loginEmail: "fake@example.com", loginPassword: "x", mailPassword: "m" })).toEqual({ ok: true });
      expect(calls).toEqual([{ accountId: "d1", accountName: "جهاز", loginEmail: "fake@example.com", loginPassword: "x", mailPassword: "m" }]);
      expect(await importAccountSessions({ d1: { "https://starlink.com": "a=1" } })).toEqual({ ok: true, importedCount: 2 });
      expect(await exportAccountSessions(["d1"])).toEqual({ d1: { "https://starlink.com": "a=1" } });
      const sync = await openAutoSync({ id: "d1", name: "جهاز" } as StarlinkAccountSummary);
      expect(sync.ok).toBe(false);
    } finally {
      if (hadWindow) g.window = previous;
      else delete g.window;
    }
  });

  it("🔄 «تحديث» on the laptop: the device's window reads Starlink and the app gets the reads", async () => {
    const { openAutoSync, listPendingAccountSyncs, ackPendingAccountSyncs, onAccountDataSynced } = await import("./localBrowser");
    const calls: unknown[] = [];
    const acked: string[][] = [];
    let push: ((entry: unknown) => void) | null = null;
    const g = globalThis as unknown as { window?: unknown };
    const hadWindow = "window" in g;
    const previous = g.window;
    g.window = {
      starnetDesktop: {
        platform: "windows",
        version: "3",
        syncDevice: async (opts: unknown) => (calls.push(opts), { ok: true, outcome: "ok" }),
        listPendingSyncs: async () => [{ syncId: "s1", accountId: "d1", fields: { balance: "1" }, recordedAt: 1 }],
        ackSyncs: async (ids: string[]) => (acked.push(ids), true),
        onSynced: (handler: (entry: unknown) => void) => ((push = handler), () => (push = null)),
      },
    };
    try {
      expect(await openAutoSync({ id: "d1", name: "جهاز", expectedEmail: "fake@example.com", expectedEmailPassword: "m" } as StarlinkAccountSummary)).toEqual({ ok: true });
      expect(calls).toEqual([{ accountId: "d1", accountName: "جهاز", loginEmail: "fake@example.com", loginPassword: "m", mailPassword: "m" }]);
      // a run over many devices stays the phone's
      expect((await openAutoSync({ id: "d1", name: "جهاز" } as StarlinkAccountSummary, "اليوم · 1/3")).ok).toBe(false);
      expect((await listPendingAccountSyncs()).map((p) => p.syncId)).toEqual(["s1"]);
      expect(await ackPendingAccountSyncs(["s1"])).toBe(true);
      expect(acked).toEqual([["s1"]]);
      const got: unknown[] = [];
      const handle = await onAccountDataSynced((e) => got.push(e.syncId));
      push!({ syncId: "s2", accountId: "d1", fields: {}, recordedAt: 2 });
      expect(got).toEqual(["s2"]);
      await handle.remove();
      expect(push).toBeNull();
    } finally {
      if (hadWindow) g.window = previous;
      else delete g.window;
    }
  });
});
