/**
 * 🧪 "لقطة تشخيص": a structure-and-colors copy of the open Starlink page, to reproduce a misread
 * (e.g. a dot) in a real test. Personal data never leaves: every word that isn't a known Starlink
 * interface word is masked letter by letter (latin -> a, Arabic -> س, digit -> 0), so emails,
 * names, addresses, account/KIT/serial numbers come out as shapes only. No script, no image, no
 * link target, no form value (except a checkbox's on/off).
 */

import {
  ACCOUNT_NUMBER_LABELS,
  BALANCE_LABELS,
  KIT_NUMBER_LABELS,
  PLAN_LABELS,
  RENEWAL_DATE_LABELS,
  SERIAL_NUMBER_LABELS,
  SERVICE_LOCATION_LABELS,
  SERVICE_STATUS_LABELS,
  STARLINK_ID_LABELS,
} from "./textFields";

const EXTRA_WORDS = [
  "starlink", "wifi", "wi-fi", "router", "dish", "devices", "subscription", "subscriptions", "billing",
  "settings", "home", "manage", "edit", "online", "offline", "ocean", "mode", "standby", "active",
  "roam", "unlimited", "personal", "maritime", "residential", "data", "usd", "gb",
  "الأجهزة", "الجهاز", "وضع", "المحيط", "البيانات", "الاشتراك", "الاشتراكات", "الفوترة", "الإعدادات",
  "خطة", "الخدمة", "نشط", "موقوف", "معلق", "الاستعداد", "الانتظار", "إدارة", "تعديل", "النقل", "إعادة",
  "التمهيد", "معرف", "الرقم", "التسلسلي", "رقم", "الطقم", "إصدار", "البرنامج", "الرصيد", "المستحق",
  "ادفع", "الرئيسية", "تسجيل", "الدخول", "الخروج", "وحدات", "إضافية", "متصل", "غير", "التجوال", "محدود",
  "موقع", "اللقب", "استئناف", "إجمالي", "استهلاك", "الباقة", "جيجابايت", "الوحدات", "الزائدة", "لكل",
];

const KNOWN = new Set(
  [
    ...EXTRA_WORDS,
    ...[PLAN_LABELS, RENEWAL_DATE_LABELS, SERVICE_STATUS_LABELS, STARLINK_ID_LABELS, ACCOUNT_NUMBER_LABELS,
      SERIAL_NUMBER_LABELS, KIT_NUMBER_LABELS, BALANCE_LABELS, SERVICE_LOCATION_LABELS]
      .flat()
      .flatMap((label) => label.split(/\s+/)),
  ].map((w) => w.toLowerCase()),
);

/** Known interface words stay, everything else becomes its shape. */
export function maskText(text: string): string {
  return text.replace(/\S+/g, (token) => {
    const bare = token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
    if (bare && KNOWN.has(bare)) return token;
    return token
      .replace(/[A-Za-z]/g, "a")
      .replace(/[؀-ۿ]/g, (c) => (/[٠-٩۰-۹]/.test(c) ? "0" : "س"))
      .replace(/[0-9]/g, "0");
  });
}

const SKIP = new Set(["script", "style", "noscript", "iframe", "img", "video", "audio", "canvas", "link", "meta", "template"]);
const MAX_CHARS = 900_000;

function colorsOf(el: Element): string {
  let style: CSSStyleDeclaration;
  try {
    style = getComputedStyle(el);
  } catch {
    return "";
  }
  const parts: string[] = [];
  const bg = style.backgroundColor;
  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") parts.push(`background-color: ${bg}`);
  if (style.color) parts.push(`color: ${style.color}`);
  const fill = style.getPropertyValue("fill");
  if (fill && fill !== "rgb(0, 0, 0)" && fill !== "none") parts.push(`fill: ${fill}`);
  for (const pseudo of ["::before", "::after"]) {
    try {
      const p = getComputedStyle(el, pseudo);
      const content = p.getPropertyValue("content");
      if (content && content !== "none" && content !== "normal") parts.push(`--${pseudo.slice(2)}: ${p.backgroundColor} ${p.color}`);
    } catch {
      // ignore
    }
  }
  return parts.join("; ");
}

function attr(name: string, value: string | null | undefined): string {
  return value ? ` ${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}"` : "";
}

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function walk(node: Node, out: string[], budget: { left: number }): void {
  if (budget.left <= 0) return;
  if (node.nodeType === 3) {
    const text = node.textContent ?? "";
    if (text.trim()) {
      const piece = escapeText(maskText(text));
      out.push(piece);
      budget.left -= piece.length;
    }
    return;
  }
  if (node.nodeType !== 1) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag)) return;
  const classes = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
  let attrs = attr("class", classes);
  for (const name of ["role", "aria-checked", "aria-expanded", "aria-selected", "type", "fill", "stroke", "cx", "cy", "r", "width", "height", "viewBox"]) {
    attrs += attr(name, el.getAttribute(name));
  }
  const label = el.getAttribute("aria-label") || el.getAttribute("title");
  if (label) attrs += attr("aria-label", maskText(label));
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") && el.checked) attrs += " checked";
  try {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.width <= 40 && rect.height > 0 && rect.height <= 40) attrs += attr("data-wh", `${Math.round(rect.width)}x${Math.round(rect.height)}`);
  } catch {
    // ignore
  }
  attrs += attr("style", colorsOf(el));
  const open = `<${tag}${attrs}>`;
  out.push(open);
  budget.left -= open.length;
  for (const child of Array.from(el.childNodes)) walk(child, out, budget);
  out.push(`</${tag}>`);
}

/** The whole masked page, as a small standalone HTML file. */
export function captureSnapshot(doc: Document): string {
  const out: string[] = [];
  const path = maskText(doc.location?.pathname ?? "");
  walk(doc.body, out, { left: MAX_CHARS });
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>starnet snapshot ${path}</title></head>${out.join("")}</html>`;
}
