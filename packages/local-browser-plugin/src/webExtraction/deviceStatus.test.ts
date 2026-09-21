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
});
