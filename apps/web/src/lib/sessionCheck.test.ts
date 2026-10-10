import { describe, expect, it } from "vitest";
import { accountIdsNeedingLogin, markSignedInFromSync, needsLogin, withSessionStatus, sessionExportWarning, sortForSessionCheck, summarizeSessionChecks, SessionCheckResults } from "./sessionCheck";

const at = "2026-09-26T10:00:00.000Z";

describe("sessionCheck", () => {
  it("treats a sign-in page and a missing session as needing login", () => {
    expect(needsLogin("loginRequired")).toBe(true);
    expect(needsLogin("none")).toBe(true);
    expect(needsLogin("loggedIn")).toBe(false);
    expect(needsLogin("unknown")).toBe(false);
    expect(needsLogin(undefined)).toBe(false);
  });

  it("summarizes only the given accounts' results", () => {
    const results: SessionCheckResults = {
      a: { status: "loggedIn", checkedAt: at },
      b: { status: "loginRequired", checkedAt: at },
      c: { status: "none", checkedAt: at },
      d: { status: "unknown", checkedAt: at },
      gone: { status: "loggedIn", checkedAt: at },
    };
    expect(summarizeSessionChecks(["a", "b", "c", "d", "e"], results)).toEqual({ checked: 4, loggedIn: 1, needLogin: 2, unknown: 1 });
  });

  it("lists devices needing login first, then unclear, unchecked, and connected", () => {
    const results: SessionCheckResults = {
      ok: { status: "loggedIn", checkedAt: at },
      login: { status: "loginRequired", checkedAt: at },
      unclear: { status: "unknown", checkedAt: at },
    };
    const accounts = [
      { id: "ok", name: "أ" },
      { id: "unchecked", name: "ب" },
      { id: "unclear", name: "ج" },
      { id: "login", name: "د" },
    ];
    expect(sortForSessionCheck(accounts, results).map((a) => a.id)).toEqual(["login", "unclear", "unchecked", "ok"]);
  });

  it("warns when an export captured no or only some sessions", () => {
    expect(sessionExportWarning(0, 0, true)).toBeNull();
    expect(sessionExportWarning(3, 3, true)).toBeNull();
    expect(sessionExportWarning(3, 0, true)).toContain("لم تُحفظ أي جلسة");
    expect(sessionExportWarning(3, 1, true)).toContain("2 جهاز بدون جلسة");
    expect(sessionExportWarning(3, 0, false)).toContain("Android");
  });

  it("finds the devices that need the sign-in bubble", () => {
    let results: SessionCheckResults = {};
    results = withSessionStatus(results, "a", "loginRequired", new Date(at));
    results = withSessionStatus(results, "b", "loggedIn", new Date(at));
    results = withSessionStatus(results, "c", "none", new Date(at));
    results = withSessionStatus(results, "gone", "none", new Date(at));
    expect(results.a).toEqual({ status: "loginRequired", checkedAt: at });
    expect(accountIdsNeedingLogin(results, ["a", "b", "c", "d"])).toEqual(["a", "c"]);
  });

  it("clears a device's bubble when a Starlink sync proves it is signed in", () => {
    const results: SessionCheckResults = {
      a: { status: "loginRequired", checkedAt: at },
      b: { status: "loggedIn", checkedAt: at },
    };
    const later = new Date("2026-09-27T08:00:00.000Z");
    const next = markSignedInFromSync(results, ["a", "b", "never-checked"], later);
    expect(next.a).toEqual({ status: "loggedIn", checkedAt: later.toISOString() });
    expect(next.b).toBe(results.b);
    expect(next["never-checked"]).toBeUndefined();
    expect(markSignedInFromSync(results, ["b"])).toBe(results);
  });
});
