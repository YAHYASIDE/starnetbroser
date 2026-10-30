import { describe, expect, it } from "vitest";
import { reminderWhenLabel, remindersByAccount, sortReminders, type DeviceReminder } from "./deviceReminders";

// Fake data only.
const r = (o: Partial<DeviceReminder>): DeviceReminder => ({ id: "x", accountId: "a", device: "DEMO", at: 0, note: "", fired: false, ...o });
const now = new Date(2026, 9, 30, 21, 13).getTime();

describe("⏰ device reminders (his Oct 30 2026 ask)", () => {
  it("says when: today, tomorrow, a date - and «حان» once rung or past", () => {
    expect(reminderWhenLabel(r({ at: new Date(2026, 9, 30, 22, 5).getTime() }), now)).toBe("اليوم 22:05");
    expect(reminderWhenLabel(r({ at: new Date(2026, 9, 31, 9, 0).getTime() }), now)).toBe("غدًا 09:00");
    expect(reminderWhenLabel(r({ at: new Date(2026, 10, 2, 9, 0).getTime() }), now)).toBe("2026/11/02 09:00");
    expect(reminderWhenLabel(r({ at: new Date(2026, 9, 30, 20, 0).getTime() }), now)).toBe("🔔 حان · اليوم 20:00");
  });

  it("due ones first, then the soonest; one per device", () => {
    const later = r({ id: "later", at: now + 7_200_000 });
    const soon = r({ id: "soon", at: now + 600_000, accountId: "b" });
    const rung = r({ id: "rung", at: now - 60_000, fired: true });
    expect(sortReminders([later, soon, rung], now).map((x) => x.id)).toEqual(["rung", "soon", "later"]);
    const byAccount = remindersByAccount([later, soon, rung], now);
    expect(byAccount.a?.id).toBe("rung");
    expect(byAccount.b?.id).toBe("soon");
  });
});
