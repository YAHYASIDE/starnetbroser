// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { clickBillingRailItem, clickFirstSubscriptionRow, clickIconRailItem, clickSettingsRailItem, clickSubscriptionsRailItem, countIconRailItems, expandDevicesSection, railShowsFullAccess } from "./navigation";

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
    setRect(document.getElementById("home")!, { top: 100, left: 320, right: 350, width: 30, height: 30 });
    setRect(document.getElementById("edit")!, { top: 150, left: 320, right: 350, width: 30, height: 30 });
    setRect(document.getElementById("briefcase")!, { top: 200, left: 320, right: 350, width: 30, height: 30 });
    setRect(document.getElementById("receipt")!, { top: 250, left: 320, right: 350, width: 30, height: 30 });

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
    setRect(document.getElementById("wide-row")!, { top: 50, left: 50, right: 350, width: 300, height: 40 });
    setRect(document.getElementById("center-btn")!, { top: 80, left: 170, right: 200, width: 30, height: 30 });
    setRect(document.getElementById("rail-icon")!, { top: 100, left: 320, right: 350, width: 30, height: 30 });

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
    setRect(document.getElementById("only")!, { top: 100, left: 320, right: 350, width: 30, height: 30 });
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

  it("never taps (closes) the section when it is already open", () => {
    document.body.innerHTML = `
      <div>الأجهزة</div>
      <button aria-expanded="true">STARLINK</button>
      <div><span>STARLINK</span><span class="dot"></span></div>
      <div><span>WIFI 1AB310E</span><span class="dot"></span></div>
    `;
    let clicked = false;
    document.querySelector("button")!.addEventListener("click", () => {
      clicked = true;
    });
    expect(expandDevicesSection()).toBe(true);
    expect(clicked).toBe(false);
    // Same without aria-expanded: the Wi-Fi row being there is enough.
    document.querySelector("button")!.removeAttribute("aria-expanded");
    expect(expandDevicesSection()).toBe(true);
    expect(clicked).toBe(false);
  });

  it("taps a CLOSED section even though its rows are still in the page (MUI keeps them hidden)", () => {
    document.body.innerHTML = `
      <div>الأجهزة</div>
      <div role="button">STARLINK</div>
      <div class="MuiCollapse-root MuiCollapse-vertical MuiCollapse-hidden">
        <div><span>STARLINK</span><span class="dot"></span></div>
        <div><span>WIFI 1AB310E</span><span class="dot"></span></div>
      </div>`;
    let clicked = false;
    document.querySelector("[role=button]")!.addEventListener("click", () => (clicked = true));
    expect(expandDevicesSection()).toBe(true);
    expect(clicked).toBe(true);
  });

  it("returns false when the page has no 'الأجهزة' heading at all", () => {
    document.body.innerHTML = `<div>صفحة أخرى</div>`;
    expect(expandDevicesSection()).toBe(false);
  });
});

function rail(ids: string[]) {
  Object.defineProperty(window, "innerWidth", { value: 360, configurable: true });
  document.body.innerHTML = ids.map((id) => `<button id="${id}">•</button>`).join("");
  ids.forEach((id, i) => setRect(document.getElementById(id)!, { top: 100 + i * 50, left: 320, right: 350, width: 30, height: 30 }));
  const clicked: string[] = [];
  ids.forEach((id) => document.getElementById(id)!.addEventListener("click", () => clicked.push(id)));
  return clicked;
}

describe("limited-access rail (an email that isn't the account's owner)", () => {
  it("opens billing only on a full 7-icon rail", () => {
    const clicked = rail(["home", "edit", "briefcase", "receipt", "gift", "envelope", "gear"]);
    expect(countIconRailItems()).toBe(7);
    expect(clickBillingRailItem()).toBe(true);
    expect(clicked).toEqual(["receipt"]);
  });

  it("never taps settings as if it were billing on a 4-icon rail", () => {
    const clicked = rail(["home", "edit", "gift", "gear"]);
    expect(countIconRailItems()).toBe(4);
    expect(clickBillingRailItem()).toBe(false);
    expect(clicked).toEqual([]);
  });

  it("full / limited / unknown", () => {
    expect(railShowsFullAccess(7)).toBe(true);
    expect(railShowsFullAccess(4)).toBe(false);
    expect(railShowsFullAccess(0)).toBeUndefined();
  });
});

describe("rail on the LEFT edge (the RTL/Arabic account portal), with a ☰ top bar on the right", () => {
  // Real, confirmed layout: the icon rail sits on the LEFT, while the top-right corner has only the
  // cart + the ☰ account menu. The sync used to read that 2-item top bar as "the rail" and open the
  // ☰ menu (email only) instead of the sections, so a whole sync learned nothing about the device.
  function twoSided() {
    Object.defineProperty(window, "innerWidth", { value: 360, configurable: true });
    const leftIds = ["l-home", "l-subs", "l-briefcase", "l-billing", "l-gift", "l-envelope", "l-gear"];
    const rightIds = ["cart", "hamburger"];
    document.body.innerHTML = [...leftIds, ...rightIds].map((id) => `<button id="${id}">•</button>`).join("");
    leftIds.forEach((id, i) => setRect(document.getElementById(id)!, { top: 100 + i * 50, left: 8, right: 38, width: 30, height: 30 }));
    // The top bar hugs the RIGHT edge but is only two items.
    rightIds.forEach((id, i) => setRect(document.getElementById(id)!, { top: 20, left: 300 + i * 34, right: 330 + i * 34, width: 30, height: 30 }));
    const clicked: string[] = [];
    [...leftIds, ...rightIds].forEach((id) => document.getElementById(id)!.addEventListener("click", () => clicked.push(id)));
    return clicked;
  }

  it("detects the 7-icon LEFT rail, not the 2-item right top bar", () => {
    twoSided();
    expect(countIconRailItems()).toBe(7);
  });

  it("clickIconRailItem(1) opens Subscriptions on the left rail (never the cart/☰)", () => {
    const clicked = twoSided();
    expect(clickIconRailItem(1)).toBe(true);
    expect(clicked).toEqual(["l-subs"]);
  });

  it("clickSettingsRailItem opens the left rail's gear, never the ☰ menu", () => {
    const clicked = twoSided();
    expect(clickSettingsRailItem()).toBe(true);
    expect(clicked).toEqual(["l-gear"]);
  });
});

describe("rail navigation by aria-label (confirmed on the real portal: Home/Subscriptions/Billing/Settings)", () => {
  // Real, confirmed structure from the operator's diagnostic snapshots: each rail icon is an
  // <a role="link" aria-label="..."> with the English label, while the big Home-page cards carry
  // the same words only as plain text. aria-label is the reliable target, whatever the layout.
  it("opens Subscriptions / Billing / Settings by aria-label, never the same-named Home card", () => {
    document.body.innerHTML = `
      <ul>
        <li><a role="link" aria-label="Home">home</a></li>
        <li><a role="link" aria-label="Subscriptions">subs</a></li>
        <li><a role="link" aria-label="Billing">bill</a></li>
        <li><a role="link" aria-label="Settings">gear</a></li>
      </ul>
      <a class="card"><p>Subscriptions</p><p>Manage Starlink service</p></a>
      <a class="card"><p>Settings</p></a>
    `;
    const clicks: string[] = [];
    document.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => clicks.push(a.getAttribute("aria-label") ?? `card:${a.textContent?.slice(0, 12)}`)),
    );
    expect(clickSubscriptionsRailItem()).toBe(true);
    expect(clickBillingRailItem()).toBe(true);
    expect(clickSettingsRailItem()).toBe(true);
    expect(clicks).toEqual(["Subscriptions", "Billing", "Settings"]);
  });

  it("matches the Arabic aria-labels too", () => {
    document.body.innerHTML = `<a role="link" aria-label="الإعدادات">اعدادات</a>`;
    let clicked = false;
    document.querySelector("a")!.addEventListener("click", () => (clicked = true));
    expect(clickSettingsRailItem()).toBe(true);
    expect(clicked).toBe(true);
  });
});
