import { describe, expect, it } from "vitest";
import {
  combinePhoneNumber,
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRY_CODES,
  splitPhoneNumber,
} from "./phoneCountryCodes";

describe("PHONE_COUNTRY_CODES", () => {
  it("orders Mauritania, Mali, Algeria, then Niger first, exactly in that order", () => {
    expect(PHONE_COUNTRY_CODES.slice(0, 4).map((c) => c.country)).toEqual([
      "موريتانيا",
      "مالي",
      "الجزائر",
      "النيجر",
    ]);
  });

  it("defaults to Mauritania", () => {
    expect(DEFAULT_PHONE_COUNTRY_CODE.country).toBe("موريتانيا");
    expect(DEFAULT_PHONE_COUNTRY_CODE.dialCode).toBe("+222");
  });

  it("has no duplicate dial codes", () => {
    const codes = PHONE_COUNTRY_CODES.map((c) => c.dialCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("splitPhoneNumber", () => {
  it("splits a Mauritanian number into its dial code and local number", () => {
    expect(splitPhoneNumber("22212345678")).toEqual({ dialCode: "+222", localNumber: "12345678" });
  });

  it("splits a Malian number correctly rather than misreading it as Mauritanian", () => {
    expect(splitPhoneNumber("22398765432")).toEqual({ dialCode: "+223", localNumber: "98765432" });
  });

  it("matches the longest known dial code, never a shorter false-prefix match", () => {
    // Egypt is "+20" (2 digits); a number starting with "20" followed by more digits must not be
    // mistaken for some other, unrelated 2-digit-prefixed code.
    expect(splitPhoneNumber("201234567890")).toEqual({ dialCode: "+20", localNumber: "1234567890" });
  });

  it("falls back to Mauritania (the default) for a legacy number with no recognizable dial code", () => {
    expect(splitPhoneNumber("12345678")).toEqual({ dialCode: "+222", localNumber: "12345678" });
  });

  it("returns an empty local number and the default dial code for an empty/missing phone", () => {
    expect(splitPhoneNumber("")).toEqual({ dialCode: "+222", localNumber: "" });
    expect(splitPhoneNumber(undefined)).toEqual({ dialCode: "+222", localNumber: "" });
  });
});

describe("combinePhoneNumber", () => {
  it("joins a dial code and local number into the flat digits-only stored shape", () => {
    expect(combinePhoneNumber("+222", "12345678")).toBe("22212345678");
  });

  it("strips any non-digit characters from the local number first", () => {
    expect(combinePhoneNumber("+223", "98 76 54 32")).toBe("22398765432");
  });

  it("returns an empty string when there is no local number, never a bare country code", () => {
    expect(combinePhoneNumber("+222", "")).toBe("");
    expect(combinePhoneNumber("+213", "   ")).toBe("");
  });
});

describe("splitPhoneNumber / combinePhoneNumber round-trip", () => {
  it("recovers the exact same stored phone for every listed country", () => {
    for (const { dialCode } of PHONE_COUNTRY_CODES) {
      const stored = combinePhoneNumber(dialCode, "55512345");
      const { dialCode: recoveredCode, localNumber } = splitPhoneNumber(stored);
      expect(recoveredCode).toBe(dialCode);
      expect(localNumber).toBe("55512345");
    }
  });
});
