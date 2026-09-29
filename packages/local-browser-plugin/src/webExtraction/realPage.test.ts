// @vitest-environment jsdom
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { extractStarlinkFields } from "./extractStarlinkFields";
import { expandDevicesSection } from "./navigation";

// A real Starlink subscription page, captured with the app's own "🧪 لقطة تشخيص" (every personal
// word masked to its shape - see snapshot.ts). Starlink showed both the dish and the Wi-Fi dot red.
function loadRealPage(name: string) {
  const html = readFileSync(join(__dirname, "fixtures", name), "utf8");
  document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, "");
}

describe("real Starlink page (snapshot) - الأجهزة with both dots red", () => {
  it("reads the dish and the Wi-Fi as offline, like Starlink shows them", () => {
    loadRealPage("real-devices-page.html");
    const fields = extractStarlinkFields(document);
    expect(fields.dishStatus).toBe("offline");
    expect(fields.wifiStatus).toBe("offline");
    expect(fields.dotTrace).toContain("STARLINK#3=offline");
  });

  it("reads Ocean Mode OFF from the real switch", () => {
    loadRealPage("real-devices-page.html");
    expect(extractStarlinkFields(document).oceanMode).toBe(false);
  });

  it("leaves the already-open devices section open (no tap)", () => {
    loadRealPage("real-devices-page.html");
    let taps = 0;
    document.querySelectorAll("[role=button], button").forEach((el) => el.addEventListener("click", () => taps++));
    expect(expandDevicesSection()).toBe(true);
    expect(taps).toBe(0);
  });
});

describe("real Starlink page (snapshot) - الأجهزة CLOSED", () => {
  it("opens it by tapping the STARLINK row, never the text-less button after the heading", () => {
    loadRealPage("real-devices-closed.html");
    const tapped: string[] = [];
    document.querySelectorAll("[role=button], button").forEach((el) =>
      el.addEventListener("click", () => tapped.push((el.textContent ?? "").trim().slice(0, 12))),
    );
    expect(expandDevicesSection()).toBe(true);
    expect(tapped).toEqual(["STARLINK"]);
  });

  it("finds no dots while closed (the rows are not in the page yet)", () => {
    loadRealPage("real-devices-closed.html");
    const fields = extractStarlinkFields(document);
    expect(fields).not.toHaveProperty("wifiStatus");
  });
});
