import { describe, expect, it } from "vitest";
import { fallbackDeviceName } from "./deviceDisplay";

describe("🏷️ an optional device name (his Nov 2 2026 ask)", () => {
  it("typed name first, else the email, else the KIT, else «جهاز جديد»", () => {
    expect(fallbackDeviceName({ name: "  منزل  ", expectedEmail: "a@b.com" })).toBe("منزل");
    expect(fallbackDeviceName({ name: " ", expectedEmail: " fake@outlook.com " })).toBe("fake@outlook.com");
    expect(fallbackDeviceName({ starlinkAccountEmail: "s@x.com" })).toBe("s@x.com");
    expect(fallbackDeviceName({ name: "", kitNumber: "KIT0001" })).toBe("KIT0001");
    expect(fallbackDeviceName({})).toBe("جهاز جديد");
  });
});
