import { resolveCorsOrigin } from "./cors";

describe("resolveCorsOrigin", () => {
  it("resolves undefined to true (allow all), not the array [\"*\"]", () => {
    // This is the exact bug that silently broke every cross-origin
    // request from apps/web: the `cors` package treats an array as an
    // exact-match allowlist, so ["*"] never matches a real Origin header.
    expect(resolveCorsOrigin(undefined)).toBe(true);
  });

  it('resolves the literal string "*" to true', () => {
    expect(resolveCorsOrigin("*")).toBe(true);
  });

  it("splits a comma-separated list into a trimmed array", () => {
    expect(resolveCorsOrigin("https://app.example.com, https://admin.example.com")).toEqual([
      "https://app.example.com",
      "https://admin.example.com",
    ]);
  });

  it("passes a single explicit origin through as a one-element array", () => {
    expect(resolveCorsOrigin("https://app.example.com")).toEqual(["https://app.example.com"]);
  });
});
