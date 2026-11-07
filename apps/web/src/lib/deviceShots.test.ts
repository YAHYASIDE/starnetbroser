import { describe, expect, it } from "vitest";
import { addDeviceShot, allShotIds, isShotImage, removeDeviceShot, shotKey } from "./deviceShots";

describe("📎 a device's kept screenshots", () => {
  it("kept once each, newest first; removed one by one", () => {
    let s = addDeviceShot({}, "d1", 1000);
    s = addDeviceShot(s, "d1", 3000);
    s = addDeviceShot(s, "d1", 1000);
    expect(s.d1!.map((x) => x.at)).toEqual([3000, 1000]);
    expect(allShotIds(addDeviceShot(s, "d2", 5))).toEqual([shotKey("d1", 3000), shotKey("d1", 1000), shotKey("d2", 5)]);
    s = removeDeviceShot(s, "d1", shotKey("d1", 3000));
    expect(s.d1).toHaveLength(1);
    expect(removeDeviceShot(s, "d1", shotKey("d1", 1000))).toEqual({});
  });

  it("only an image data URL is kept", () => {
    expect(isShotImage("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(isShotImage("javascript:alert(1)")).toBe(false);
    expect(isShotImage("data:image/jpeg;base64," + "A".repeat(50), 20)).toBe(false);
  });
});
