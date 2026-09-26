/**
 * Stage 2 of on-device Starlink sync: the real account page only shows the Devices' own colored
 * status dots and the Subscription/Billing sections' fields once the operator has actually
 * navigated there themselves - a single "تحديث من Starlink" tap used to only ever read whichever
 * one page happened to be open (see extractStarlinkFields.ts), which is exactly the real,
 * confirmed complaint this module fixes: reading "الفوترة"/"الاشتراك" required leaving STAR NET's
 * sync button alone and manually clicking into each section first.
 *
 * This module never knows a single fixed URL for "الاشتراك"/"الفوترة" (the real account portal is
 * a client-rendered SPA that was never confirmed to expose stable per-section URLs) - it instead
 * drives the SAME taps a human operator already does, confirmed against real screenshots of the
 * account portal's own right-edge icon rail (home/edit/briefcase/receipt/gift/envelope/gear, top
 * to bottom) and the "الاشتراك" list -> "الاشتراك" detail -> "الأجهزة" (Devices, confirmed always
 * collapsed by default) drill-down. Every function here degrades to a plain `false`/no-op on a
 * page whose structure doesn't match what was confirmed - never throws, never corrupts a click
 * into some unrelated element by guessing past what's actually confirmed.
 */

function directText(el: Element): string {
  let text = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      text += node.textContent ?? "";
    }
  }
  return text.trim();
}

/** The first element (in document order) whose OWN text - never a descendant's - equals `label`
 * exactly. Mirrors extractStarlinkFields.ts's own label-matching discipline: a label is a leaf's
 * direct text, never a substring match that could land on some unrelated, longer sentence. */
function findExactTextElement(root: Element, label: string): Element | null {
  const all = Array.from(root.querySelectorAll("*"));
  for (const el of all) {
    if (directText(el) === label) return el;
  }
  return null;
}

/** The next element after `el` in document order - a plain TreeWalker over `document.body`, used
 * to search forward from a confirmed label (e.g. "الأجهزة") for the real clickable control near
 * it, since the label itself is only ever a heading/text, never the tappable element. */
function nextElementInDocumentOrder(el: Element): Element | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  walker.currentNode = el;
  return walker.nextNode() as Element | null;
}

/** True for an element a real tap would actually land on - a real `<button>`/`<a>`/`[role=button]`
 * first (the strongest signal), falling back to a `cursor: pointer` computed style only when none
 * of those tags/roles is present, since a real production page just as often makes an entire
 * clickable row a plain styled `<div>`. */
function isClickable(el: Element): boolean {
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "A") return true;
  if (el.getAttribute("role") === "button") return true;
  if (el.hasAttribute("onclick")) return true;
  try {
    return getComputedStyle(el).cursor === "pointer";
  } catch {
    return false;
  }
}

/**
 * The real account portal's right-edge icon rail (confirmed via screenshot: home, a pencil/edit
 * icon opening "الاشتراكات", a briefcase, a receipt icon opening "فوترة", a gift, an envelope,
 * then a gear opening "الإعدادات" - in that fixed top-to-bottom order) carries no visible text or
 * confirmed aria-label at all, so it can't be found by label the way every other target in this
 * module is. Found instead by geometry alone, the same class of signal deviceStatus.ts already
 * uses for an unlabeled colored dot: every icon-sized clickable element (never a full-width row)
 * hugging the viewport's own trailing edge, sorted top to bottom to match real tap order.
 */
function findIconRailItems(): HTMLElement[] {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role='button']"));
  const railWidth = 60; // generous upper bound for a single icon button, never a text row
  const edgeSlack = 40; // how close to the viewport's own edge counts as "the rail", not "nearby"
  return candidates
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ rect }) => {
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (rect.width > railWidth || rect.height > railWidth) return false;
      return window.innerWidth - rect.right <= edgeSlack;
    })
    .sort((a, b) => a.rect.top - b.rect.top)
    .map(({ el }) => el);
}

/** Clicks the `index`th icon (0-based, top to bottom) in the confirmed right-edge icon rail -
 * e.g. index 1 is the pencil/edit icon ("الاشتراكات"), index 3 is the receipt icon ("فوترة").
 * Returns false (never throws) when fewer than `index + 1` rail-shaped elements are found at all,
 * so a page whose chrome doesn't match what was confirmed is simply skipped by the caller. */
export function clickIconRailItem(index: number): boolean {
  const target = findIconRailItems()[index];
  if (!target) return false;
  target.click();
  return true;
}

/** On the confirmed "الاشتراكات" list page (reached via clickIconRailItem(1)): clicks the first
 * real row under the "الاشتراك" column - the account's own (usually only) subscription - to open
 * its own "الاشتراك" detail page. Deliberately skips the page's own "إضافة اشتراك" button, which
 * sits right next to that same column header and would otherwise be the first clickable element
 * found after it. */
export function clickFirstSubscriptionRow(): boolean {
  const header = findExactTextElement(document.body, "الاشتراك");
  if (!header) return false;

  let node: Element | null = header;
  for (let hop = 0; hop < 80 && node; hop++) {
    node = nextElementInDocumentOrder(node);
    if (!node) break;
    const text = directText(node);
    if (!text || text === "إضافة اشتراك") continue;
    if (isClickable(node)) {
      (node as HTMLElement).click();
      return true;
    }
  }
  return false;
}

/** On the confirmed "الاشتراك" detail page: expands the "الأجهزة" accordion (confirmed ALWAYS
 * collapsed by default) so its dish/Wi-Fi status dots actually render into the DOM for
 * extractStarlinkFields.ts's own extractDeviceStatus to find - without this, a sync run on this
 * page can only ever see the plan/identifiers fields around it, never the device status. The
 * "الأجهزة" heading itself is only ever a section title, never the tappable control, so this
 * searches forward from it for the real toggle (confirmed to show the dish's own product name,
 * e.g. "STARLINK", with a collapse/expand caret). */
export function expandDevicesSection(): boolean {
  const header = findExactTextElement(document.body, "الأجهزة");
  if (!header) return false;

  let node: Element | null = header;
  for (let hop = 0; hop < 40 && node; hop++) {
    node = nextElementInDocumentOrder(node);
    if (!node) break;
    if (isClickable(node)) {
      (node as HTMLElement).click();
      return true;
    }
  }
  return false;
}
