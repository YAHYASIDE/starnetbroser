// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ensureEnglishStep, isEnglishText } from "./language";

// Fake/dummy fixtures only - none of this is real Starlink account data.
const ARABIC_HOME = `
  <header><button id="menu" aria-label="فتح القائمة"><svg></svg></button></header>
  <main>
    <h1>الصفحة الرئيسية</h1>
    <div>DEMO NAME • ACC-0000-0000-DEMO</div>
    <div>موقع الخدمة</div><div>الاشتراكات</div><div>الفوترة</div>
    <div>خدمة Starlink مقيدة لأن الجهاز كان خارج البلد المسجل فيه لفترة طويلة جدًا</div>
  </main>`;

const ENGLISH_HOME = `
  <header><button aria-label="Open menu"><svg></svg></button></header>
  <main>
    <h1>Home</h1>
    <div>DEMO NAME • ACC-0000-0000-DEMO</div>
    <div>Service Location</div><div>Subscriptions</div><div>Billing</div>
    <div>Your Starlink's service is restricted because it has been outside of its home country for too long.</div>
  </main>`;

function clicks(...ids: string[]): string[] {
  const seen: string[] = [];
  for (const id of ids) document.getElementById(id)!.addEventListener("click", () => seen.push(id));
  return seen;
}

describe("isEnglishText", () => {
  it("reads an Arabic page as not English, even with Latin names/IDs on it", () => {
    document.body.innerHTML = ARABIC_HOME;
    expect(isEnglishText(document.body.textContent ?? "")).toBe(false);
  });

  it("reads an English page as English", () => {
    document.body.innerHTML = ENGLISH_HOME;
    expect(isEnglishText(document.body.textContent ?? "")).toBe(true);
  });

  it("can't tell yet on an almost empty (still loading) page", () => {
    expect(isEnglishText("Loading…")).toBeUndefined();
  });
});

describe("ensureEnglishStep", () => {
  it("does nothing on an English page", () => {
    document.body.innerHTML = ENGLISH_HOME;
    expect(ensureEnglishStep()).toBe("english");
  });

  it("waits while the page has no text yet", () => {
    document.body.innerHTML = "<div></div>";
    expect(ensureEnglishStep()).toBe("loading");
  });

  it("opens the ☰ menu first on an Arabic page", () => {
    document.body.innerHTML = ARABIC_HOME;
    const seen = clicks("menu");
    expect(ensureEnglishStep()).toBe("menu");
    expect(seen).toEqual(["menu"]);
  });

  it("never taps the ☰ a second time (that would close it)", () => {
    document.body.innerHTML = ARABIC_HOME;
    const seen = clicks("menu");
    expect(ensureEnglishStep(true)).toBe("unknown");
    expect(seen).toEqual([]);
  });

  it("with the menu open, taps the globe/region control", () => {
    document.body.innerHTML = `${ARABIC_HOME}
      <nav><a href="#">تسجيل الخروج</a><button id="globe"><svg></svg><span>US</span></button></nav>`;
    const seen = clicks("globe", "menu");
    expect(ensureEnglishStep(true)).toBe("globe");
    expect(seen).toEqual(["globe"]);
  });

  it("never mistakes a data unit (GB) for the region control", () => {
    document.body.innerHTML = `${ARABIC_HOME}<button id="gb">GB</button>`;
    const seen = clicks("gb");
    expect(ensureEnglishStep(true)).toBe("unknown");
    expect(seen).toEqual([]);
  });

  it("in the language list, taps English under UNITED STATES", () => {
    document.body.innerHTML = `${ARABIC_HOME}
      <ul>
        <li><div>UNITED STATES</div><a id="us-en" href="#">English</a><a id="us-es" href="#">Español</a></li>
        <li><div>CANADA</div><a id="ca-en" href="#">English</a><a id="ca-fr" href="#">Français</a></li>
      </ul>`;
    const seen = clicks("us-en", "ca-en", "menu");
    expect(ensureEnglishStep()).toBe("clicked");
    expect(seen).toEqual(["us-en"]);
  });

  it("finds United States even when the region names are listed later", () => {
    document.body.innerHTML = `${ARABIC_HOME}
      <ul>
        <li><div>CANADA</div><button id="ca-en"><span>English</span></button></li>
        <li><div>الولايات المتحدة</div><button id="us-en"><span>English</span></button></li>
      </ul>`;
    const seen = clicks("us-en", "ca-en");
    expect(ensureEnglishStep()).toBe("clicked");
    expect(seen).toEqual(["us-en"]);
  });
});
