import { describe, expect, it } from "vitest";
import { deviceRoute, HOME_ROUTE, notifyPhone } from "./appEvents";
import { parseHomeSearch } from "./homeActions";

describe("deviceRoute", () => {
  it("opens the home screen searching for the device", () => {
    const route = deviceRoute(" demo-a@example.com ");
    expect(route).toBe("/?q=demo-a%40example.com");
    expect(parseHomeSearch(route.slice(1))).toBe("demo-a@example.com");
  });

  it("falls back to the home screen without a name", () => {
    expect(deviceRoute("  ")).toBe(HOME_ROUTE);
  });
});

describe("notifyPhone", () => {
  it("does nothing outside the Android app", async () => {
    await expect(notifyPhone("✅ انتهت المزامنة", HOME_ROUTE)).resolves.toBeUndefined();
  });
});
