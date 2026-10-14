import { StatusColorValue, statusFromComputedColor, statusFromLabelText } from "./statusColor";

function directText(el: Element): string {
  let text = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      text += node.textContent ?? "";
    }
  }
  return text.trim();
}

/** Elements whose own (non-descendant) text is one of the section's label words - the label itself, not a value. */
function findLabelElements(doc: Document, labels: string[]): Element[] {
  const lowerLabels = labels.map((label) => label.toLowerCase());
  const all = Array.from(doc.body.querySelectorAll("*"));
  return all.filter((el) => {
    const text = directText(el).toLowerCase();
    if (!text) return false;
    return lowerLabels.some((label) => text === label || text.includes(label));
  });
}

/**
 * A leaf counts as a status-dot candidate only when it carries no text of its own (a dot is
 * never a label) AND was deliberately styled - either an inline `style` attribute OR a non-empty
 * `class` (a real production page colors its dot via a CSS class far more often than an inline
 * style - requiring only the latter was a real, confirmed miss: a page whose dot had classes but
 * no inline style came back "no data" entirely). Never an ordinary unstyled leaf, and never a
 * text-bearing element even if that text happens to be styled gray (e.g. a "Manage"/"إدارة" link
 * colored gray is still text, not a status dot).
 */
const SVG_SHAPES = new Set(["circle", "ellipse", "rect"]);

/** "styled": a class/style/fill of its own - a real dot candidate (its gray means "unknown").
 * "bare": an empty leaf with none of those - only counts if it actually shows a red/green/amber
 * color (a real page can color it through a parent's CSS selector); an uncolored one is ignored. */
function dotCandidateKind(el: Element): "styled" | "bare" | null {
  if (el.children.length !== 0) return null;
  if ((el.textContent ?? "").trim() !== "") return null;
  // A dot drawn as an SVG shape colored by its own `fill` attribute (no class, no style).
  if (SVG_SHAPES.has(el.tagName.toLowerCase()) && el.getAttribute("fill")) return "styled";
  const style = el.getAttribute("style");
  if (style && style.trim() !== "") return "styled";
  const className = el.getAttribute("class");
  return className && className.trim() !== "" ? "styled" : "bare";
}

/** A dot drawn by CSS on an element's ::before/::after (content set, colored background/glyph). */
function pseudoStatus(el: Element): StatusColorValue | null {
  if (typeof getComputedStyle !== "function") return null;
  // jsdom (the tests) has no pseudo-element styles - skip instead of logging "Not implemented".
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return null;
  for (const pseudo of ["::before", "::after"]) {
    let style: CSSStyleDeclaration;
    try {
      style = getComputedStyle(el, pseudo);
    } catch {
      continue;
    }
    const content = style.getPropertyValue("content");
    if (!content || content === "none" || content === "normal") continue;
    const byBackground = statusFromComputedColor(style.backgroundColor);
    if (byBackground !== "unknown") return byBackground;
    if (/[●•⬤]/.test(content)) {
      const byColor = statusFromComputedColor(style.color);
      if (byColor !== "unknown") return byColor;
    }
  }
  return null;
}

/** One short "what did the reader see" note per candidate (tag.class:colors) for the trace. */
function describe(el: Element, style: CSSStyleDeclaration): string {
  const cls = (el.getAttribute("class") ?? "").split(/\s+/)[0]?.slice(0, 14) ?? "";
  const colors = [style.backgroundColor, style.color, el.getAttribute("fill") || style.getPropertyValue("fill")]
    .filter((c) => c && !/^rgba\(0, 0, 0, 0\)$/.test(c))
    .map((c) => c.replace(/\s+/g, ""));
  return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}:${colors.join("/") || "-"}`;
}

function isTransparent(color: string | null | undefined): boolean {
  return !color || color === "transparent" || /^rgba\([^)]*,\s*0(\.0+)?\)$/.test(color.replace(/\s+/g, " "));
}

/**
 * The status inside one scope. Priority: an accessible label ("Online"/"غير متصل"), then a real
 * dot - an empty element with a colored BACKGROUND (confirmed real page: an 8x8 box,
 * rgb(244, 67, 54) for offline) - then a colored icon (the real page also tints a small alert
 * icon light red next to an offline dish). A dot with a gray background is a real "unknown";
 * white/gray icon strokes are just icons and never count.
 */
function statusInScope(scope: Element, seen?: string[]): StatusColorValue | null {
  const labeled = Array.from(scope.querySelectorAll("[aria-label], [title]"));
  for (const el of labeled) {
    const text = el.getAttribute("aria-label") || el.getAttribute("title");
    const status = statusFromLabelText(text);
    if (status) return status;
  }

  let grayDot = false;
  let iconStatus: StatusColorValue | null = null;
  for (const el of Array.from(scope.querySelectorAll("*"))) {
    const kind = dotCandidateKind(el);
    if (!kind) continue;
    const style = getComputedStyle(el);
    if (seen && seen.length < 4 && !isTransparent(style.backgroundColor)) seen.push(describe(el, style));
    if (!isTransparent(style.backgroundColor)) {
      const byBackground = statusFromComputedColor(style.backgroundColor);
      if (byBackground !== "unknown") return byBackground;
      grayDot = true;
      continue;
    }
    if (!iconStatus) {
      const byFill = statusFromComputedColor(el.getAttribute("fill") || style.getPropertyValue("fill"));
      const byColor = statusFromComputedColor(style.color);
      const icon = byFill !== "unknown" ? byFill : byColor;
      if (icon !== "unknown") iconStatus = icon;
    }
  }
  for (const el of [scope, ...Array.from(scope.querySelectorAll("*"))]) {
    const byPseudo = pseudoStatus(el);
    if (byPseudo) return byPseudo;
  }
  if (iconStatus) return iconStatus;
  return grayDot ? "unknown" : null;
}

/**
 * Finds a device's online/offline/warning/unknown state. Preference order per the spec: the
 * status element's own aria-label/title text first (statusInScope checks this before any
 * color), then a computed-color fallback for a plain colored dot with no accessible text -
 * never the reverse, since a color guess is inherently less reliable than a stated label.
 */
export interface DeviceStatusOptions {
  /** Only labels after this element count (the "الأجهزة" heading - the dots live under it). */
  after?: Element;
  /** Receives one short note per label tried: its text, the result and what it looked at. */
  trace?: string[];
  /** Every device row's label word (dish AND Wi-Fi): climbing stops before a scope that holds
   * another row's label, so one device never borrows the other's dot. */
  rowLabels?: string[];
}

/** How far up from a label to look for its dot - the real page nests it 4 levels up, in a
 * sibling box of the name (li > button > [name box, dot box]). Leaving the row stops it sooner. */
const MAX_HOPS = 6;

export function extractDeviceStatus(doc: Document, labels: string[], options: DeviceStatusOptions = {}): StatusColorValue | undefined {
  const after = options.after;
  const isAfter = (el: Element) => !after || (after.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const labelElements = findLabelElements(doc, labels).filter(isAfter);
  const rowLabelElements = findLabelElements(doc, options.rowLabels ?? labels).filter(isAfter);
  let sawUnknown = false;

  for (const labelEl of labelElements) {
    const ownStatus = statusFromLabelText(labelEl.getAttribute("aria-label") || labelEl.getAttribute("title"));
    if (ownStatus) return ownStatus;

    let scope: Element | null = labelEl.parentElement;
    for (let hop = 0; hop < MAX_HOPS && scope; hop++) {
      const current: Element = scope;
      // Left this device's row: the scope now holds another row's label.
      if (rowLabelElements.some((other) => other !== labelEl && !other.contains(labelEl) && current.contains(other))) break;
      const seen: string[] = [];
      const status = statusInScope(current, options.trace ? seen : undefined);
      if (options.trace && options.trace.length < 10 && (status || seen.length)) {
        options.trace.push(`${directText(labelEl).slice(0, 16)}#${hop}=${status ?? "-"}${seen.length ? `[${seen.join(",")}]` : ""}`);
      }
      // A gray dot next to THIS label is its real "unknown" - stop climbing for it.
      if (status === "unknown") {
        sawUnknown = true;
        break;
      }
      if (status) return status;
      scope = current.parentElement;
    }
  }

  return sawUnknown ? "unknown" : undefined;
}
