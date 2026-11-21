import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultMenuDoc } from "./agentMenus";

// The phone's reader (WhatsAppMenu.java) is tested against this same menu: the file must stay the app's default.
describe("🗂️ the reader's test menu is the app's default", () => {
  it("menu-default.json = defaultMenuDoc()", () => {
    const file = resolve(__dirname, "../../../../packages/local-browser-plugin/android/src/test/resources/menu-default.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(defaultMenuDoc());
  });
});
