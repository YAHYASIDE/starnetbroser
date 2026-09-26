import { describe, expect, it } from "vitest";
import { emailsMismatch } from "./emailMatch";

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
