// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractDeviceStatus } from "./deviceStatus";

// Fake/dummy fixtures only - no real Starlink account markup or data appears anywhere in this
// file, matching the rest of this project's "no real account data" rule.
const DISH_LABELS = ["starlink dish", "dish", "الطبق"];
const WIFI_LABELS = ["wi-fi", "wifi", "واي فاي"];

function setBody(html: string) {
  document.body.innerHTML = html;
}

describe("extractDeviceStatus", () => {
  it("prefers aria-label over the dot's computed color, even when they disagree", () => {
    setBody(`
      <div class="row">
        <span>Starlink Dish</span>
        <span aria-label="Online" style="background-color: rgb(239, 68, 68);">●</span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBe("online");
  });

  it("falls back to the title attribute when there is no aria-label", () => {
    setBody(`
      <div class="row">
        <span>Wi-Fi</span>
        <span title="Offline" style="background-color: rgb(34, 197, 94);">●</span>
      </div>
    `);
    expect(extractDeviceStatus(document, WIFI_LABELS)).toBe("offline");
  });

  it("falls back to the computed color of a plain dot when there is no aria-label or title at all", () => {
    setBody(`
      <div class="row">
        <span>Starlink Dish</span>
        <span class="dot" style="background-color: rgb(34, 197, 94);"></span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBe("online");
  });

  it("works with an Arabic label and an Arabic aria-label", () => {
    setBody(`
      <div class="row">
        <span>الطبق</span>
        <span aria-label="متصل"></span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBe("online");
  });

  it("recognizes an Arabic offline aria-label", () => {
    setBody(`
      <div class="row">
        <span>واي فاي</span>
        <span aria-label="غير متصل"></span>
      </div>
    `);
    expect(extractDeviceStatus(document, WIFI_LABELS)).toBe("offline");
  });

  it("returns undefined when the device section isn't on the page at all", () => {
    setBody(`<div>Some unrelated content</div>`);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBeUndefined();
  });

  it("classifies an amber dot as warning via computed color", () => {
    setBody(`
      <div class="row">
        <span>Dish</span>
        <span class="dot" style="background-color: rgb(245, 158, 11);"></span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBe("warning");
  });

  it("reports a genuinely gray status dot as 'unknown' - not as nothing-found (round 6 regression)", () => {
    setBody(`
      <div class="row">
        <span>Starlink Dish</span>
        <span class="dot" style="background-color: rgb(150, 150, 150);"></span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBe("unknown");
  });

  it("never treats ordinary gray-colored text as a status dot, even when no real dot is present", () => {
    setBody(`
      <div class="row">
        <span>Starlink Dish</span>
        <span style="color: rgb(150, 150, 150);">تفاصيل إضافية</span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBeUndefined();
  });

  it("never treats an unstyled empty leaf as a status dot", () => {
    setBody(`
      <div class="row">
        <span>Starlink Dish</span>
        <span></span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBeUndefined();
  });

  it("finds a dot colored via a CSS class, not just an inline style (real bug: came back 'no data')", () => {
    // jsdom doesn't apply real stylesheets, so the class-colored dot's computed color has to be
    // set via a matching inline style too here purely to make the *test* work - the point being
    // verified is that the class attribute alone is what makes it a *candidate* at all (see the
    // next test for a class-only dot with no inline style whatsoever).
    setBody(`
      <div class="row">
        <span>Starlink Dish</span>
        <span class="status-dot status-dot-green" style="background-color: rgb(34, 197, 94);"></span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBe("online");
  });

  it("still finds it when the dot has no inline style at all and no aria-label/title", () => {
    setBody(`
      <div class="row">
        <span>Wi-Fi</span>
        <span class="status-dot-green"></span>
      </div>
    `);
    // jsdom never applies the CSS a real class would carry, so this dot's computed color is
    // whatever jsdom defaults to (unclassifiable) - the real assertion here is that it's still
    // recognized as a genuine dot *candidate* (not silently skipped for lacking inline style),
    // so the definitive "unknown" comes back rather than "nothing found" (undefined).
    expect(extractDeviceStatus(document, WIFI_LABELS)).toBe("unknown");
  });

  it("keeps checking later candidates when an earlier one in the same scope doesn't classify", () => {
    setBody(`
      <div class="row">
        <span>Starlink Dish</span>
        <span class="icon-spacer"></span>
        <span class="status-dot" style="background-color: rgb(34, 197, 94);"></span>
      </div>
    `);
    expect(extractDeviceStatus(document, DISH_LABELS)).toBe("online");
  });
});
