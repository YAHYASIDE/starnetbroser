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
 * never a label) AND was deliberately styled (an inline `style` attribute) - never an ordinary
 * unstyled leaf, and never a text-bearing element even if that text happens to be styled gray
 * (e.g. an "Manage"/"إدارة" link colored gray is still text, not a status dot).
 */
function isStatusDotCandidate(el: Element): boolean {
  if (el.children.length !== 0) return false;
  if ((el.textContent ?? "").trim() !== "") return false;
  const style = el.getAttribute("style");
  return !!style && style.trim() !== "";
}

function statusInScope(scope: Element): StatusColorValue | null {
  const labeled = Array.from(scope.querySelectorAll("[aria-label], [title]"));
  for (const el of labeled) {
    const text = el.getAttribute("aria-label") || el.getAttribute("title");
    const status = statusFromLabelText(text);
    if (status) return status;
  }

  const dotCandidates = Array.from(scope.querySelectorAll("*")).filter(isStatusDotCandidate);
  for (const el of dotCandidates) {
    const style = getComputedStyle(el);
    const byBackground = statusFromComputedColor(style.backgroundColor);
    if (byBackground !== "unknown") return byBackground;
    const byColor = statusFromComputedColor(style.color);
    if (byColor !== "unknown") return byColor;
    // A genuine dot candidate whose color can't be classified (e.g. a gray/neutral dot) is a
    // real, definitive "unknown" - not "nothing found here, keep searching", or a real gray
    // status dot would silently vanish into an eventual `undefined` instead of being reported.
    return "unknown";
  }

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

  for (const labelEl of labelElements) {
    const ownStatus = statusFromLabelText(labelEl.getAttribute("aria-label") || labelEl.getAttribute("title"));
    if (ownStatus) return ownStatus;

    let scope: Element | null = labelEl.parentElement;
    for (let hop = 0; hop < 3 && scope; hop++) {
      const status = statusInScope(scope);
      if (status) return status;
      scope = scope.parentElement;
    }
  }

  return undefined;
}
