import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { matchesDeleteCode, normalizeCode, sha256Hex } from "./deleteCode";

// A made-up code for the tests - never the operator's real one.
const FAKE_HASH = createHash("sha256").update("starnet-delete:1234").digest("hex");

describe("sha256Hex", () => {
  it("matches the standard SHA-256", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const long = "رمز ".repeat(40);
    expect(sha256Hex(long)).toBe(createHash("sha256").update(long).digest("hex"));
  });
});

describe("matchesDeleteCode", () => {
  it("accepts the right code, also typed with Arabic digits or spaces", () => {
    expect(matchesDeleteCode("1234", FAKE_HASH)).toBe(true);
    expect(matchesDeleteCode(" ١٢٣٤ ", FAKE_HASH)).toBe(true);
    expect(matchesDeleteCode("12 34", FAKE_HASH)).toBe(true);
  });

  it("refuses a wrong or empty code", () => {
    expect(matchesDeleteCode("1235", FAKE_HASH)).toBe(false);
    expect(matchesDeleteCode("", FAKE_HASH)).toBe(false);
    expect(matchesDeleteCode("1234", "0".repeat(64))).toBe(false);
  });

  it("normalizes Persian digits too", () => {
    expect(normalizeCode("۱۲۳۴")).toBe("1234");
  });
});
