import { describe, expect, it } from "vitest";
import { duePins, isPinned, mergeDeviceNotes, noteMatchesQuery, pinAgeText, pinnedDevices, saveDeviceNote, setDevicePinned, shouldAskUnpin, unpinAll, type DeviceNotesStore } from "./deviceNotes";

const NOW = new Date(2026, 9, 8, 12, 0, 0);

describe("saveDeviceNote", () => {
  it("«💾 ملاحظة فقط» writes the text without pinning", () => {
    const store = saveDeviceNote({}, "a", { text: "  الطبق عند الفني   للإصلاح ", pin: false }, NOW);
    expect(store.a).toEqual({ text: "الطبق عند الفني للإصلاح", noteAt: NOW.toISOString() });
    expect(isPinned(store, "a")).toBe(false);
  });

  it("«📌 حفظ وتثبيت» pins too, with an optional date; a pin keeps its first time", () => {
    const first = saveDeviceNote({}, "a", { text: "وعد بالدفع", pin: true, until: "2026-10-12" }, NOW);
    expect(first.a).toMatchObject({ pinnedAt: NOW.toISOString(), pinUntil: "2026-10-12" });
    const later = saveDeviceNote(first, "a", { text: "وعد بالدفع الخميس", pin: true }, new Date(2026, 9, 9));
    expect(later.a!.pinnedAt).toBe(NOW.toISOString());
    expect(later.a!.pinUntil).toBeUndefined();
  });

  it("«ملاحظة فقط» on a pinned device keeps the pin; empty text deletes the note, empty entry is removed", () => {
    const pinned = setDevicePinned({}, "a", true, NOW);
    const noted = saveDeviceNote(pinned, "a", { text: "x", pin: false }, NOW);
    expect(isPinned(noted, "a")).toBe(true);
    const cleared = saveDeviceNote(noted, "a", { text: " ", pin: false }, NOW);
    expect(cleared.a).toEqual({ pinnedAt: NOW.toISOString(), history: [{ text: "x", at: NOW.toISOString() }] });
    expect(setDevicePinned(saveDeviceNote({}, "b", { text: "", pin: true }, NOW), "b", false)).toEqual({});
  });

  it("keeps the note's time when only the pin changes", () => {
    const first = saveDeviceNote({}, "a", { text: "x", pin: false }, NOW);
    const again = saveDeviceNote(first, "a", { text: "x", pin: true }, new Date(2026, 9, 10));
    expect(again.a!.noteAt).toBe(NOW.toISOString());
  });
});

describe("pins", () => {
  const accounts = [
    { id: "a", name: "أ" },
    { id: "b", name: "ب" },
    { id: "c", name: "ج", deletedAt: "2026-10-01T00:00:00.000Z" },
  ];
  const store: DeviceNotesStore = {
    a: { pinnedAt: "2026-10-01T00:00:00.000Z", pinUntil: "2026-10-08", text: "اتصل به" },
    b: { pinnedAt: "2026-10-05T00:00:00.000Z", pinUntil: "2026-10-20" },
    c: { pinnedAt: "2026-10-06T00:00:00.000Z", pinUntil: "2026-10-01" },
  };

  it("lists live pinned devices, newest pin first - the trash and archive don't count", () => {
    expect(pinnedDevices(store, accounts).map((a) => a.id)).toEqual(["b", "a"]);
  });

  it("⏰ due pins are the ones whose date has come", () => {
    expect(duePins(store, accounts, "2026-10-08")).toEqual([{ accountId: "a", name: "أ", text: "اتصل به", pinUntil: "2026-10-08" }]);
    expect(duePins(store, accounts, "2026-10-07")).toEqual([]);
  });

  it("says how old a pin is", () => {
    expect(pinAgeText(NOW.toISOString(), NOW)).toBe("اليوم");
    expect(pinAgeText(new Date(2026, 9, 7, 23).toISOString(), NOW)).toBe("منذ يوم");
    expect(pinAgeText(new Date(2026, 9, 6).toISOString(), NOW)).toBe("منذ يومين");
    expect(pinAgeText(new Date(2026, 9, 2).toISOString(), NOW)).toBe("منذ 6 أيام");
    expect(pinAgeText(new Date(2026, 8, 8).toISOString(), NOW)).toBe("منذ 30 يومًا");
  });
});

describe("mergeDeviceNotes", () => {
  it("moves the duplicate's note onto the kept device and keeps the earliest pin", () => {
    const store: DeviceNotesStore = {
      drop: { text: "بُدّل الراوتر", noteAt: "2026-10-02T00:00:00.000Z", pinnedAt: "2026-10-01T00:00:00.000Z" },
      keep: { text: "وعد بالدفع", noteAt: "2026-10-03T00:00:00.000Z" },
    };
    expect(mergeDeviceNotes(store, "drop", "keep")).toEqual({
      keep: { text: "وعد بالدفع · بُدّل الراوتر", noteAt: "2026-10-03T00:00:00.000Z", pinnedAt: "2026-10-01T00:00:00.000Z" },
    });
    expect(mergeDeviceNotes({ keep: { text: "x" } }, "drop", "keep")).toEqual({ keep: { text: "x" } });
  });
});

describe("📜 the note log", () => {
  it("keeps every replaced or deleted note with its date, newest first", () => {
    const d1 = new Date(2026, 9, 1), d2 = new Date(2026, 9, 3), d3 = new Date(2026, 9, 5);
    let store = saveDeviceNote({}, "a", { text: "بُدّل الراوتر", pin: false }, d1);
    store = saveDeviceNote(store, "a", { text: "وعد بالدفع", pin: false }, d2);
    store = saveDeviceNote(store, "a", { text: "", pin: false }, d3);
    expect(store.a).toEqual({
      history: [
        { text: "وعد بالدفع", at: d2.toISOString() },
        { text: "بُدّل الراوتر", at: d1.toISOString() },
      ],
    });
    expect(pinnedDevices(store, [{ id: "a" }])).toEqual([]);
  });
});

describe("🧹 / 🔍", () => {
  it("unpins everything and keeps the notes", () => {
    const store: DeviceNotesStore = { a: { pinnedAt: "x", pinUntil: "2026-10-09", text: "t" }, b: { pinnedAt: "y" } };
    expect(unpinAll(store)).toEqual({ a: { text: "t" } });
  });

  it("finds a device by its current or older note", () => {
    const note = { text: "الطبق عند الفني", history: [{ text: "Router changed", at: "x" }] };
    expect(noteMatchesQuery(note, "الفني")).toBe(true);
    expect(noteMatchesQuery(note, "router")).toBe(true);
    expect(noteMatchesQuery(note, "بطاقة")).toBe(false);
    expect(noteMatchesQuery(undefined, "x")).toBe(false);
  });

  it("asks to unpin only when an operation was added to a pinned device", () => {
    const store: DeviceNotesStore = { a: { pinnedAt: "x" } };
    expect(shouldAskUnpin(store, "a", [{ id: "1" }], [{ id: "1" }, { id: "2" }])).toBe(true);
    expect(shouldAskUnpin(store, "a", [{ id: "1" }], [{ id: "1" }])).toBe(false);
    expect(shouldAskUnpin(store, "b", [], [{ id: "2" }])).toBe(false);
  });
});
