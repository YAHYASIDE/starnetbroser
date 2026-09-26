import { describe, expect, it } from "vitest";
import { homeActionHref, parseHomeAction } from "./homeActions";

describe("homeActions", () => {
  it("round-trips an action through the home URL", () => {
    expect(parseHomeAction(homeActionHref("add-account").slice(1))).toBe("add-account");
    expect(parseHomeAction("?action=sync")).toBe("sync");
    expect(parseHomeAction("?action=clients&x=1")).toBe("clients");
  });

  it("ignores anything that isn't a known action", () => {
    expect(parseHomeAction("")).toBeNull();
    expect(parseHomeAction("?action=delete-everything")).toBeNull();
    expect(parseHomeAction("?rep=1")).toBeNull();
  });
});
