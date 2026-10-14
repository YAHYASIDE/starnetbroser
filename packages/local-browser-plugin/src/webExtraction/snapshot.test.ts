// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { captureSnapshot, maskText } from "./snapshot";

describe("snapshot", () => {
  it("keeps interface words and masks everything personal", () => {
    expect(maskText("الأجهزة")).toBe("الأجهزة");
    expect(maskText("WIFI 1AB310E")).toBe("WIFI 0aa000a");
    expect(maskText("hassene.sid@outlook.com")).toBe("aaaaaaa.aaa@aaaaaaa.aaa");
    expect(maskText("محمد غالي")).toBe("سسسس سسسس");
    expect(maskText("SL-DF-12253838-80932-10")).toBe("aa-aa-00000000-00000-00");
  });

  it("captures structure and colors, never scripts or personal text", () => {
    document.body.innerHTML = `
      <script>secret()</script>
      <div>الأجهزة</div>
      <div class="row"><span>STARLINK</span><span class="dot" style="background-color: rgb(235, 87, 72);"></span></div>
      <div>Mohamed Ghaly • ACC-1234</div>
      <input type="checkbox" checked />`;
    const html = captureSnapshot(document);
    expect(html).toContain("الأجهزة");
    expect(html).toContain("STARLINK");
    expect(html).toContain("background-color: rgb(235, 87, 72)");
    expect(html).toContain("checked");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("Mohamed");
    expect(html).not.toContain("1234");
  });
});
