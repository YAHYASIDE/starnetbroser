// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clickFirstSubscriptionRow, clickIconRailItem, expandDevicesSection } from "./navigation";

// Fake/dummy fixtures only - none of this is real Starlink account data. jsdom never computes
// real layout, so every test that relies on clickIconRailItem's geometry check stubs
// getBoundingClientRect per element directly (a real, standard jsdom testing technique).
function setRect(el: Element, rect: Partial<DOMRect>) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON() {} , ...rect } as DOMRect);
}

describe("clickIconRailItem", () => {
  it("clicks the Nth icon-sized button hugging the viewport's own right edge, sorted top to bottom", () => {
    Object.defineProperty(window, "innerWidth", { value: 360, configurable: true });
    document.body.innerHTML = `
      <button id="home">🏠</button>
      <button id="edit">✏️</button>
      <button id="briefcase">💼</button>
      <button id="receipt">📄</button>
    `;
    setRect(document.getElementById("home")!, { top: 100, right: 350, width: 30, height: 30 });
    setRect(document.getElementById("edit")!, { top: 150, right: 350, width: 30, height: 30 });
    setRect(document.getElementById("briefcase")!, { top: 200, right: 350, width: 30, height: 30 });
    setRect(document.getElementById("receipt")!, { top: 250, right: 350, width: 30, height: 30 });

    let clicked: string | null = null;
    for (const id of ["home", "edit", "briefcase", "receipt"]) {
      document.getElementById(id)!.addEventListener("click", () => {
        clicked = id;
      });
    }

    expect(clickIconRailItem(1)).toBe(true);
    expect(clicked).toBe("edit");
  });

  it("ignores a full-width row and a small button that isn't near the edge", () => {
    Object.defineProperty(window, "innerWidth", { value: 360, configurable: true });
    document.body.innerHTML = `
      <button id="wide-row">إضافة اشتراك</button>
      <button id="center-btn">حفظ</button>
      <button id="rail-icon">⚙️</button>
    `;
    setRect(document.getElementById("wide-row")!, { top: 50, right: 350, width: 300, height: 40 });
    setRect(document.getElementById("center-btn")!, { top: 80, right: 200, width: 30, height: 30 });
    setRect(document.getElementById("rail-icon")!, { top: 100, right: 350, width: 30, height: 30 });

    let clicked: string | null = null;
    document.getElementById("rail-icon")!.addEventListener("click", () => {
      clicked = "rail-icon";
    });

    expect(clickIconRailItem(0)).toBe(true);
    expect(clicked).toBe("rail-icon");
  });

  it("returns false (never throws) when fewer rail-shaped elements exist than the requested index", () => {
    Object.defineProperty(window, "innerWidth", { value: 360, configurable: true });
    document.body.innerHTML = `<button id="only">🏠</button>`;
    setRect(document.getElementById("only")!, { top: 100, right: 350, width: 30, height: 30 });
    expect(clickIconRailItem(3)).toBe(false);
  });

  it("returns false on a page with no clickable elements at all", () => {
    document.body.innerHTML = `<div>welcome</div>`;
    expect(clickIconRailItem(0)).toBe(false);
  });
});

describe("clickFirstSubscriptionRow", () => {
  it("clicks the first real subscription row, skipping the 'إضافة اشتراك' button next to the same column header", () => {
    document.body.innerHTML = `
      <button>إضافة اشتراك</button>
      <div>الاشتراك</div>
      <button>التجوال - غير محدود</button>
    `;
    let clicked = false;
    document.querySelectorAll("button")[1]!.addEventListener("click", () => {
      clicked = true;
    });
    expect(clickFirstSubscriptionRow()).toBe(true);
    expect(clicked).toBe(true);
  });

  it("returns false when the page has no 'الاشتراك' column header at all", () => {
    document.body.innerHTML = `<div>لا شيء هنا</div>`;
    expect(clickFirstSubscriptionRow()).toBe(false);
  });
});

describe("expandDevicesSection", () => {
  it("clicks the first clickable element found after the 'الأجهزة' heading (the real toggle, never the heading itself)", () => {
    document.body.innerHTML = `
      <div>الأجهزة</div>
      <button>STARLINK</button>
    `;
    let clicked = false;
    document.querySelector("button")!.addEventListener("click", () => {
      clicked = true;
    });
    expect(expandDevicesSection()).toBe(true);
    expect(clicked).toBe(true);
  });

  it("returns false when the page has no 'الأجهزة' heading at all", () => {
    document.body.innerHTML = `<div>صفحة أخرى</div>`;
    expect(expandDevicesSection()).toBe(false);
  });
});
