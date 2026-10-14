import { describe, expect, it } from "vitest";
import { toastBody, toastTone } from "./toastTone";

describe("toastTone", () => {
  it("reads the tone from the text", () => {
    expect(toastTone("✓ تم التجديد")).toBe("success");
    expect(toastTone("تعذر النسخ الاحتياطي")).toBe("error");
    expect(toastTone("جارِ المزامنة")).toBe("info");
    expect(toastBody("✓ تم التجديد")).toBe("تم التجديد");
  });
});
