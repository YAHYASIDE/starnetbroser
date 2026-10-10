import { describe, expect, it } from "vitest";
import { emailLocalPart, emailsMismatch, loginEmailIsAdmin } from "./emailMatch";

describe("emailsMismatch", () => {
  it("returns false when both emails match exactly", () => {
    expect(emailsMismatch("test@example.com", "test@example.com")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(emailsMismatch("Test@Example.com", "test@example.com")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(emailsMismatch(" test@example.com ", "test@example.com")).toBe(false);
  });

  it("returns true when the emails genuinely differ", () => {
    expect(emailsMismatch("expected@example.com", "actual@example.com")).toBe(true);
  });

  it("never flags a mismatch when the expected email hasn't been entered yet", () => {
    expect(emailsMismatch(undefined, "actual@example.com")).toBe(false);
    expect(emailsMismatch("", "actual@example.com")).toBe(false);
  });

  it("never flags a mismatch when Starlink hasn't synced an email yet", () => {
    expect(emailsMismatch("expected@example.com", undefined)).toBe(false);
    expect(emailsMismatch("expected@example.com", "")).toBe(false);
  });
});

describe("emailLocalPart", () => {
  it("lowercases and takes the part before @", () => {
    expect(emailLocalPart("Dede868@Out.com")).toBe("dede868");
  });

  it("handles a truncated 'local@' and blank values", () => {
    expect(emailLocalPart("dede868@")).toBe("dede868");
    expect(emailLocalPart(undefined)).toBe("");
  });
});

describe("loginEmailIsAdmin - the account's own login email carries the Admin role", () => {
  it("matches on the local part when the admin cell is truncated to 'local@…'", () => {
    expect(loginEmailIsAdmin(["dedesidival868@…"], "dedesidival868@outlook.com")).toBe(true);
  });

  it("matches any of several candidate login emails", () => {
    expect(loginEmailIsAdmin(["owner@mail.com"], undefined, "owner@mail.com")).toBe(true);
  });

  it("does NOT match a different admin email (a genuine limited user stays flagged)", () => {
    expect(loginEmailIsAdmin(["someoneelse@mail.com"], "mylimited@mail.com")).toBe(false);
  });

  it("returns false with no admin emails or no candidate", () => {
    expect(loginEmailIsAdmin([], "me@mail.com")).toBe(false);
    expect(loginEmailIsAdmin(undefined, "me@mail.com")).toBe(false);
    expect(loginEmailIsAdmin(["me@mail.com"], undefined)).toBe(false);
  });
});
