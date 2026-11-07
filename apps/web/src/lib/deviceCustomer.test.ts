import { describe, expect, it } from "vitest";
import { customerExtrasFor } from "./deviceCustomer";

describe("📸 the device's customer for its browser", () => {
  it("name and number of its customer, nothing without one", () => {
    const store = { c1: { id: "c1", name: " زبون تجريبي ", phone: "+222 00 00 00 01" } } as never;
    expect(customerExtrasFor({ clientId: "c1" }, store)).toEqual({ customerName: "زبون تجريبي", customerPhone: "+222 00 00 00 01" });
    expect(customerExtrasFor({ clientId: "nobody" }, store)).toEqual({});
    expect(customerExtrasFor({}, store)).toEqual({});
  });
});
