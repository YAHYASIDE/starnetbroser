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

function statusInScope(scope: Element): StatusColorValue | null {
  const labeled = Array.from(scope.querySelectorAll("[aria-label], [title]"));
  for (const el of labeled) {
    const text = el.getAttribute("aria-label") || el.getAttribute("title");
    const status = statusFromLabelText(text);
    if (status) return status;
  }

  // Broadening candidacy to class-styled leaves (above) means a scope can now hold several
  // candidates - an icon, a spacer, the real dot - so every one is checked for an actual
  // classifiable color before giving up, rather than committing to whichever happens to be
  // first. Only once every candidate has been checked and NONE classified does this report the
  // definitive "unknown" (a real gray/neutral dot) rather than "nothing found here" (undefined).
  let sawCandidate = false;
  for (const el of Array.from(scope.querySelectorAll("*"))) {
    const kind = dotCandidateKind(el);
    if (!kind) continue;
    const style = getComputedStyle(el);
    const byBackground = statusFromComputedColor(style.backgroundColor);
    if (byBackground !== "unknown") return byBackground;
    const byColor = statusFromComputedColor(style.color);
    if (byColor !== "unknown") return byColor;
    const byFill = statusFromComputedColor(el.getAttribute("fill") || style.getPropertyValue("fill"));
    if (byFill !== "unknown") return byFill;
    if (kind === "styled") sawCandidate = true;
  }
  for (const el of [scope, ...Array.from(scope.querySelectorAll("*"))]) {
    const byPseudo = pseudoStatus(el);
    if (byPseudo) return byPseudo;
  }
  if (sawCandidate) return "unknown";

  return null;
}

/**
 * Finds a device's online/offline/warning/unknown state. Preference order per the spec: the
 * status element's own aria-label/title text first (statusInScope checks this before any
 * color), then a computed-color fallback for a plain colored dot with no accessible text -
 * never the reverse, since a color guess is inherently less reliable than a stated label.
 */
export function extractDeviceStatus(doc: Document, labels: string[]): StatusColorValue | undefined {
  const labelElements = findLabelElements(doc, labels);
  // Real, confirmed miss: the Devices page's first "STARLINK" is the collapsible section header
  // (label + chevron icon, no dot) - its uncolored chevron read as a definitive "unknown" and
  // stopped the search before the real device row's red/green dot was ever reached. A gray
  // "unknown" is now only the answer when nothing anywhere had a real color.
  let sawUnknown = false;

  for (const labelEl of labelElements) {
    const ownStatus = statusFromLabelText(labelEl.getAttribute("aria-label") || labelEl.getAttribute("title"));
    if (ownStatus) return ownStatus;

    let scope: Element | null = labelEl.parentElement;
    for (let hop = 0; hop < 3 && scope; hop++) {
      const status = statusInScope(scope);
      // A gray dot next to THIS label ends this label's search (climbing further could reach the
      // other device's dot); the next label element still gets its own look.
      if (status === "unknown") {
        sawUnknown = true;
        break;
      }
      if (status) return status;
      scope = scope.parentElement;
    }
  }

  return sawUnknown ? "unknown" : undefined;
}
