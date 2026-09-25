import { describe, expect, it } from "vitest";
import { buildNewDeviceHref, parseNewDevicePrefill, saleLooksLikeDevice } from "./deviceFromSale";

describe("deviceFromSale", () => {
  it("recognises Starlink kits by name in Arabic or English", () => {
    expect(saleLooksLikeDevice(["كابل", "Starlink Standard"])).toBe(true);
    expect(saleLooksLikeDevice(["جهاز ستارلينك ميني"])).toBe(true);
    expect(saleLooksLikeDevice(["كابل", "راوتر"])).toBe(false);
  });

  it("round-trips the prefill through the home URL", () => {
    const href = buildNewDeviceHref({ clientId: "c 1", representativeId: "r1", name: "محمد" });
    expect(parseNewDevicePrefill(href.slice(1))).toEqual({ clientId: "c 1", representativeId: "r1", name: "محمد" });
    expect(parseNewDevicePrefill("?clientId=x")).toBeNull();
    expect(parseNewDevicePrefill("")).toBeNull();
  });
});
