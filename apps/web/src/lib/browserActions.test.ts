import { describe, expect, it } from "vitest";
import { takeBrowserActions } from "./browserActions";

describe("🚩📎 the browser's alerts and kept shots, taken on any page", () => {
  const devices = [{ id: "d1", name: "DEMO 1" }];
  it("an alert with its picture, a kept shot; Starlink reads and «تم التوثيق» are left alone", () => {
    const r = takeBrowserActions(
      [
        { syncId: "a", accountId: "d1", fields: { teamFlag: { note: "لا يتصل", level: "urgent", at: 5, image: "data:image/jpeg;base64,AAAA" } } },
        { syncId: "b", accountId: "d1", fields: { deviceShot: { at: 7, image: "data:image/jpeg;base64,BBBB" } } },
        { syncId: "c", accountId: "d1", fields: { travelDoneRequest: { at: 8 } } },
        { syncId: "d", accountId: "d1", fields: { balanceDue: "1" } },
      ],
      { flags: {}, shots: {}, devices, by: "المسؤول 2" },
    );
    expect(r.done).toEqual(["a", "b"]);
    expect(r.added).toBe(1);
    expect(Object.values(r.flags)[0]).toMatchObject({ by: "المسؤول 2", image: "data:image/jpeg;base64,AAAA", level: "urgent" });
    expect(r.pictures).toEqual([{ key: "shot:d1:7", dataUrl: "data:image/jpeg;base64,BBBB" }]);
    expect(r.shots.d1).toHaveLength(1);
  });

  it("taken twice (here and on the home page) - still one of each", () => {
    const read = [{ syncId: "a", accountId: "d1", fields: { teamFlag: { note: "x" } } }];
    const once = takeBrowserActions(read, { flags: {}, shots: {}, devices, by: "Y" });
    const twice = takeBrowserActions(read, { flags: once.flags, shots: once.shots, devices, by: "Y" });
    expect(twice.added).toBe(0);
    expect(Object.keys(twice.flags)).toHaveLength(1);
  });
});
