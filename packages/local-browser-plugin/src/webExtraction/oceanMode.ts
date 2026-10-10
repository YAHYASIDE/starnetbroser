/**
 * "وضع المحيط" (Ocean Mode / Personal Maritime) on the subscription page - a switch that bills
 * every gigabyte at maritime rates ($2-6/GB), so one device left on it can run a bill of
 * thousands of dollars. This module only ever READS the switch, and gives every automated tap in
 * this project a way to refuse it (isDangerousControl) - it must never be toggled by the app.
 */

const OCEAN_WORDS = [/وضع المحيط/, /ocean mode/i, /personal maritime/i];

function directText(el: Element): string {
  let text = "";
  for (const node of Array.from(el.childNodes)) if (node.nodeType === 3) text += node.textContent ?? "";
  return text.trim();
}

function mentionsOcean(text: string): boolean {
  return OCEAN_WORDS.some((re) => re.test(text));
}

function isSwitch(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "input" && (el.getAttribute("type") ?? "").toLowerCase() === "checkbox") return true;
  const role = el.getAttribute("role");
  if (role === "switch" || role === "checkbox") return true;
  return /\bswitch\b|Switch/.test(el.getAttribute("class") ?? "");
}

function switchIsOn(el: Element): boolean | undefined {
  if (el instanceof HTMLInputElement && el.type === "checkbox") return el.checked;
  const aria = el.getAttribute("aria-checked");
  if (aria === "true") return true;
  if (aria === "false") return false;
  const input = el.querySelector("input[type=checkbox]");
  if (input instanceof HTMLInputElement) return input.checked;
  const cls = el.getAttribute("class") ?? "";
  if (/checked|\bon\b|active/i.test(cls)) return true;
  if (el.querySelector("[class*=checked]")) return true;
  return undefined;
}

/** True/false when the page shows the Ocean Mode switch (its own state), undefined otherwise. */
export function readOceanMode(doc: Document): boolean | undefined {
  const labels = Array.from(doc.body.querySelectorAll("*")).filter((el) => mentionsOcean(directText(el)));
  for (const label of labels) {
    let scope: Element | null = label.parentElement;
    for (let hop = 0; hop < 5 && scope; hop++) {
      const switches = [scope, ...Array.from(scope.querySelectorAll("*"))].filter(isSwitch);
      for (const sw of switches) {
        const on = switchIsOn(sw);
        if (on !== undefined) return on;
      }
      scope = scope.parentElement;
    }
  }
  return undefined;
}

/** Never tap this: any switch/checkbox at all, or anything inside the Ocean Mode card. */
export function isDangerousControl(el: Element): boolean {
  if (isSwitch(el) || el.closest("[role=switch], input[type=checkbox]")) return true;
  let node: Element | null = el;
  for (let hop = 0; hop < 6 && node; hop++) {
    const text = node.textContent ?? "";
    if (text.length < 800 && mentionsOcean(text)) return true;
    node = node.parentElement;
  }
  return false;
}
