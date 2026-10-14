// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clickFirstSubscriptionRow, expandDevicesSection } from "./navigation";
import { isDangerousControl, readOceanMode } from "./oceanMode";

const CARD = (checked: boolean) => `
  <div class="card">
    <div>وحدات إضافية</div>
    <div>وضع المحيط</div>
    <span class="MuiSwitch-root"><input type="checkbox" ${checked ? "checked" : ""} /></span>
    <div>يمكنك التبديل إلى وضع المحيط للحصول على تغطية في المياه الدولية.</div>
  </div>`;

describe("oceanMode", () => {
  it("reads the switch ON and OFF", () => {
    document.body.innerHTML = CARD(true);
    expect(readOceanMode(document)).toBe(true);
    document.body.innerHTML = CARD(false);
    expect(readOceanMode(document)).toBe(false);
  });

  it("reads an aria switch", () => {
    document.body.innerHTML = `<div><span>Ocean Mode</span><button role="switch" aria-checked="true"></button></div>`;
    expect(readOceanMode(document)).toBe(true);
  });

  it("is undefined on a page without the switch", () => {
    document.body.innerHTML = `<div>خطة الخدمة</div>`;
    expect(readOceanMode(document)).toBeUndefined();
  });

  it("marks the switch and its card as never-tap", () => {
    document.body.innerHTML = CARD(false);
    expect(isDangerousControl(document.querySelector("input")!)).toBe(true);
    expect(isDangerousControl(document.querySelector(".MuiSwitch-root")!)).toBe(true);
  });

  it("the navigation taps never press the ocean switch", () => {
    document.body.innerHTML = `
      <div>الأجهزة</div>
      ${CARD(false)}
      <div>الاشتراك</div>
      <div class="card"><div>وضع المحيط</div><button>تفعيل</button></div>`;
    let pressed = 0;
    document.querySelectorAll("input, button").forEach((el) => el.addEventListener("click", () => pressed++));
    expandDevicesSection();
    clickFirstSubscriptionRow();
    expect(pressed).toBe(0);
    expect((document.querySelector("input") as HTMLInputElement).checked).toBe(false);
  });
});
