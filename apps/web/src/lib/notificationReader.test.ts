import { describe, expect, it } from "vitest";
import { lastSeenText, readerProblem } from "./notificationReader";

describe("🔔 notification reader", () => {
  it("access on but unbound (after an update) is «down»; off is «off»; older builds say nothing", () => {
    expect(readerProblem({ enabled: true, connected: false })).toBe("down");
    expect(readerProblem({ enabled: false, connected: false })).toBe("off");
    expect(readerProblem({ enabled: true, connected: true })).toBeNull();
    expect(readerProblem({ enabled: true })).toBeNull();
    expect(readerProblem(null)).toBeNull();
  });

  it("when the last notification arrived", () => {
    const now = new Date(2026, 9, 10, 18, 13);
    expect(lastSeenText(new Date(2026, 9, 10, 15, 21).getTime(), now)).toBe("آخر إشعار وصل: اليوم 15:21");
    expect(lastSeenText(new Date(2026, 9, 9, 22, 29).getTime(), now)).toBe("آخر إشعار وصل: 09/10 22:29");
    expect(lastSeenText(0, now)).toBe("لم يصل أي إشعار بعد");
  });
});
