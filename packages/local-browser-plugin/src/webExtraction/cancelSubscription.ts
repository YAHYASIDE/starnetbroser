import { toWesternDigits } from "./arabicNumerals";

/**
 * 🛑 «إلغاء الاشتراك»: ONE step of cancelling the open subscription on Starlink's own pages, called
 * again and again by the device browser (AccountBrowserActivity) until it answers "done". Only ever
 * runs after the operator pressed the card's button and confirmed. The confirmed order (real
 * screenshots, English page):
 *   «Manage» (next to «Service Plan») → «Manage Service Plan»: «Cancel service» →
 *   «Keep your service?»: «Cancellation reason» = the reason, «Please describe your reason» = the
 *   reason, «Continue To Cancel» → «Before you cancel, consider the following plans»: «Continue To
 *   Cancel» → «Let us make things right.»: «Confirm & Cancel Service» →
 *   the page says «Your service is scheduled to end on 10/9/2026» / «Ending 2026/10/9» = done.
 * Each call looks at what is on the screen and does the one right thing for it - so a step that
 * didn't take (a slow dialog) is simply done again, and an already-cancelled subscription is
 * "done" at once. Anything it doesn't recognise answers "unknown" and presses nothing.
 *
 * Answers: "done:<date>" | "manage" | "cancel-service" | "open-reason" | "pick-reason" |
 * "type-reason" | "continue" | "continue-plans" | "confirm" | "wait" | "unknown".
 */
export function cancelSubscriptionStep(reason: string): string {
  const reasonText = reason.trim();
  const dialog = topDialog();
  const listbox = visibleListbox();

  // The reason's drop-down list is open: pick the reason.
  if (listbox) {
    const option = Array.from(listbox.querySelectorAll<HTMLElement>("[role=option], li")).find((o) => sameText(o, reasonText));
    if (option) {
      option.click();
      return "pick-reason";
    }
    return "wait";
  }

  if (dialog) {
    const text = normalized(dialog.textContent);
    if (/let us make things right/.test(text)) return press(dialog, /^confirm\s*&\s*cancel service$/i, "confirm");
    if (/before you cancel/.test(text)) return press(dialog, /^continue to cancel$/i, "continue-plans");
    if (/manage service plan/.test(text)) return press(dialog, /^cancel service$/i, "cancel-service");
    if (/keep your service/.test(text)) {
      const select = dialog.querySelector<HTMLElement>("[role=combobox], [aria-haspopup=listbox]");
      if (select && !normalized(select.textContent).includes(reasonText.toLowerCase())) {
        // MUI's select opens on a left-button mouse-down (a click would not open it).
        select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
        return "open-reason";
      }
      const describe = describeField(dialog);
      if (describe && !describe.value.trim()) {
        typeInto(describe, reasonText);
        return "type-reason";
      }
      if (!select && !describe) return "wait";
      return press(dialog, /^continue to cancel$/i, "continue");
    }
    return "unknown";
  }

  const ending = scheduledEnd(document.body);
  if (ending !== null) return "done:" + ending;

  const manage = manageNextToServicePlan();
  if (manage) {
    manage.click();
    return "manage";
  }
  return "unknown";
}

function normalized(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function sameText(el: Element, wanted: string): boolean {
  return normalized(el.textContent) === wanted.toLowerCase();
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}

/** The dialog on top (the last visible one - Starlink stacks «Let us make things right.» over
 * «Keep your service?», real screenshot). */
function topDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role=dialog], .MuiDialog-paper")).filter(isVisible);
  return dialogs.length ? dialogs[dialogs.length - 1]! : null;
}

function visibleListbox(): HTMLElement | null {
  const boxes = Array.from(document.querySelectorAll<HTMLElement>("[role=listbox]")).filter(isVisible);
  return boxes.length ? boxes[boxes.length - 1]! : null;
}

/** Presses the visible, enabled button in `root` whose own text matches `re`. */
function press(root: Element, re: RegExp, answer: string): string {
  const buttons = Array.from(root.querySelectorAll<HTMLElement>("button, [role=button], a, input[type=submit]"));
  for (const b of buttons) {
    const label = (b.textContent || (b as HTMLInputElement).value || "").replace(/\s+/g, " ").trim();
    if (!re.test(label) || !isVisible(b)) continue;
    if ((b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true") return "wait";
    b.click();
    return answer;
  }
  return "wait";
}

/** «Please describe your reason»: the dialog's visible text field (never the select's own hidden input). */
function describeField(dialog: Element): HTMLInputElement | HTMLTextAreaElement | null {
  const fields = Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("textarea, input"));
  return (
    fields.find((f) => {
      const type = (f.getAttribute("type") || "text").toLowerCase();
      if (f.tagName === "INPUT" && type !== "text") return false;
      if (f.getAttribute("aria-hidden") === "true" || f.classList.contains("MuiSelect-nativeInput")) return false;
      return isVisible(f) && !f.disabled && !f.readOnly;
    }) ?? null
  );
}

/** React-safe typing (the page's own state sees the value). */
function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  field.focus();
  if (setter) setter.call(field, value);
  else field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

/** The end date once the subscription is cancelled - the plan's «Ending ٢٠٢٦/١٠/٩» chip first
 * (year first, never ambiguous), else «Your service is scheduled to end on 10/9/2026» (the English
 * page's month/day/year) - as "YYYY/MM/DD", the form the sync stores (pendingCancellationDate);
 * "" when the page says it ends without a readable date; null when it doesn't say so at all. */
export function scheduledEnd(root: Element): string | null {
  const text = toWesternDigits((root as HTMLElement).innerText ?? root.textContent ?? "");
  const chip = text.match(/\bending\s+(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/i);
  if (chip) return ymd(chip[1]!, chip[2]!, chip[3]!);
  const banner = text.match(/scheduled to end on\s*(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/i);
  if (banner) return ymd(banner[3]!, banner[1]!, banner[2]!);
  const bannerYearFirst = text.match(/scheduled to end on\s*(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/i);
  if (bannerYearFirst) return ymd(bannerYearFirst[1]!, bannerYearFirst[2]!, bannerYearFirst[3]!);
  return /scheduled to end|\bending\b/i.test(text) ? "" : null;
}

function ymd(year: string, month: string, day: string): string {
  return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
}

/** «Manage» next to «Service Plan» (never «Edit» next to the nickname or the location). */
function manageNextToServicePlan(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, a, [role=button]")).filter(
    (b) => /^manage$/i.test((b.textContent ?? "").trim()) && isVisible(b),
  );
  for (const b of buttons) {
    let node: Element | null = b.parentElement;
    for (let hop = 0; hop < 5 && node; hop++, node = node.parentElement) {
      if (/service plan/i.test(node.textContent ?? "")) return b;
    }
  }
  return null;
}
