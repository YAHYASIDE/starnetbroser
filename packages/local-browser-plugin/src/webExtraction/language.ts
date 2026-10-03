import { isDangerousControl } from "./oceanMode";
import { toVisibleText } from "./visibleText";

/**
 * Sync reads Starlink best in English (real, confirmed by the operator: an Arabic page kept
 * producing partial or wrong reads, the same account in English synced cleanly). The portal's own
 * language picker (real, confirmed by the operator): the ☰ at the top of Home opens a panel, its
 * globe/region control ("US") opens a list of regions with their languages, and the first one is
 * "UNITED STATES / English". Each sync walks that same path, one tap per call, until the page reads
 * English - the choice is kept by the device's own isolated browser, so later syncs find it done.
 *
 * One call = at most one tap. The native side calls again after the page settles:
 * - "english"  already English (or nothing Arabic left to switch) - continue the sync;
 * - "loading"  too little text yet to tell - wait and ask again;
 * - "clicked"  tapped "English" in the list - the page reloads in English;
 * - "globe"    opened the region/language list;
 * - "menu"     opened the ☰ panel;
 * - "unknown"  none of the above was found - give up and sync as the page is.
 */
export type EnglishStep = "english" | "loading" | "clicked" | "globe" | "menu" | "unknown";

const ARABIC_LETTER = /[ء-ي]/g;
const LATIN_LETTER = /[A-Za-z]/g;
/** Fewer letters than this on the whole page means it hasn't rendered yet. */
const MIN_LETTERS = 40;
/** Arabic share of all letters above which the page is Arabic. Account names, emails, "STARLINK",
 * "ACC-..." and plan codes are Latin even on an Arabic page, so an Arabic page never gets near 0. */
const ARABIC_SHARE = 0.2;

/** Accented Latin letters (é è à â ç ñ ã ...): French, Spanish, Portuguese... - an English page has
 * next to none (only in a customer's own name). Real, confirmed: a rep's device opened Starlink in
 * French (prices in €) and passed as "English" - Latin letters, no Arabic - so it was never
 * switched and nothing on it could be read. */
const ACCENTED_LETTER = /[À-ÖØ-öø-ÿ]/g;
const MIN_ACCENTED = 6;
const ACCENTED_SHARE = 0.003;
const FOREIGN_WORDS = /\b(votre|vos|des|les|pour|avec|aux|sur|est|une|vous|nous|tu|su|sus|los|las|para|con|una|seu|sua|seus|suas|para|com|uma|ihr|ihre|und|mit|für|der|die|das)\b/gi;
const ENGLISH_WORDS = /\b(the|your|and|for|with|you|this|our|are|of)\b/gi;

export function isEnglishText(text: string): boolean | undefined {
  const arabic = (text.match(ARABIC_LETTER) ?? []).length;
  const latin = (text.match(LATIN_LETTER) ?? []).length;
  if (arabic + latin < MIN_LETTERS) return undefined;
  if (arabic / (arabic + latin) >= ARABIC_SHARE) return false;
  const accented = (text.match(ACCENTED_LETTER) ?? []).length;
  if (accented >= MIN_ACCENTED && accented / (latin + accented) >= ACCENTED_SHARE) return false;
  const foreign = (text.match(FOREIGN_WORDS) ?? []).length;
  const english = (text.match(ENGLISH_WORDS) ?? []).length;
  return !(foreign >= 6 && foreign > english * 2);
}

function directText(el: Element): string {
  let text = "";
  for (const node of Array.from(el.childNodes)) if (node.nodeType === 3) text += node.textContent ?? "";
  return text.trim();
}

/** jsdom (tests) has no layout at all - there, everything counts as shown. */
function isShown(el: Element): boolean {
  if (document.body.getBoundingClientRect().height <= 0) return true;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isClickable(el: Element): boolean {
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "A") return true;
  const role = el.getAttribute("role");
  if (role === "button" || role === "link" || role === "menuitem" || role === "option" || role === "tab") return true;
  if (el.hasAttribute("onclick")) return true;
  try {
    return getComputedStyle(el).cursor === "pointer";
  } catch {
    return false;
  }
}

/** The element itself or its nearest clickable ancestor (a few hops at most) - the text is often a
 * <span> inside the real <button>/<a>. */
function tapTarget(el: Element): HTMLElement | null {
  let node: Element | null = el;
  for (let hop = 0; hop < 4 && node && node !== document.body; hop++) {
    if (isClickable(node)) return node as HTMLElement;
    node = node.parentElement;
  }
  return null;
}

function tap(el: HTMLElement | null): boolean {
  if (!el || isDangerousControl(el)) return false;
  el.click();
  return true;
}

const UNITED_STATES = /united states|الولايات المتحدة|états-unis|etats-unis|estados unidos/i;

/** "English" in the region/language list - the one under "UNITED STATES" first (the operator's
 * choice), else the first English entry at all. */
function findEnglishOption(): HTMLElement | null {
  const options = Array.from(document.body.querySelectorAll("*")).filter((el) => {
    const text = directText(el);
    return text.length <= 30 && /^english\b/i.test(text) && isShown(el);
  });
  // Climbs only while the ancestor still holds this ONE English entry - the whole list's container
  // mentions United States too, and must not vouch for Canada's entry.
  const nearUs = (el: Element) => {
    let node: Element | null = el;
    for (let hop = 0; hop < 4 && node; hop++) {
      if (options.some((other) => other !== el && node!.contains(other))) return false;
      const text = node.textContent ?? "";
      if (text.length < 300 && UNITED_STATES.test(text)) return true;
      node = node.parentElement;
    }
    return false;
  };
  const ordered = [...options.filter(nearUs), ...options.filter((el) => !nearUs(el))];
  for (const el of ordered) {
    const target = tapTarget(el) ?? (el as HTMLElement);
    if (!isDangerousControl(target)) return target;
  }
  return null;
}

const SAVE_LANGUAGE_PROMPT = /حفظ اللغة|save (this )?language|enregistrer (la |cette )?langue|guardar (el |este )?idioma|salvar (o |este )?idioma/i;
const NO_ANSWER = /^(لا|no|no thanks|not now|لا شكرا|لا شكرًا|non|non merci|pas maintenant|no gracias|não|nao|agora não)$/i;

/** The "لا"/"No" button of the save-language question, when that question is on screen. */
function findSaveLanguageNo(): HTMLElement | null {
  const prompt = Array.from(document.body.querySelectorAll("*")).find(
    (el) => SAVE_LANGUAGE_PROMPT.test(directText(el)) && isShown(el),
  );
  let scope: Element | null = prompt?.parentElement ?? null;
  for (let hop = 0; hop < 6 && scope; hop++) {
    const no = Array.from(scope.querySelectorAll<HTMLElement>("button, a, [role='button']")).find(
      (el) => NO_ANSWER.test((el.textContent ?? "").trim()) && isShown(el),
    );
    if (no) return no;
    scope = scope.parentElement;
  }
  return null;
}

/** The region/language list is on screen: "English" offered more than once (every English-speaking
 * region has its own entry), or the "UNITED STATES" region heading itself is showing. */
function languageListOpen(): boolean {
  let english = 0;
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const text = directText(el);
    if (!text || text.length > 30 || !isShown(el)) continue;
    if (/^(united states|الولايات المتحدة|états-unis|etats-unis|estados unidos)$/i.test(text)) return true;
    if (/^english\b/i.test(text) && ++english >= 2) return true;
  }
  return false;
}

const LANGUAGE_LABEL = /language|locale|region|country|اللغة|لغة|المنطقة|البلد|الدولة|\b(langue|région|pays|idioma|región|país|região|língua|sprache)\b/i;
/** The picker's own face: a two-letter region code ("US", "SA", "MR"), optionally with a language. */
const REGION_CODE = /^[A-Z]{2}(\s*[|/·-]\s*\S{2,12})?$/;
const LANGUAGE_NAMES = /^(العربية|عربي|english|français|francais|español|espanol|português|portugues|deutsch|italiano)$/i;
/** Two capitals that are never a region picker (data units, buttons). */
const NOT_REGIONS = new Set(["GB", "MB", "TB", "KB", "OK", "ID"]);

/** The globe/region control that opens the list. */
function findLanguageControl(): HTMLElement | null {
  const labeled = Array.from(document.body.querySelectorAll<HTMLElement>("[aria-label], [title]")).find((el) => {
    const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`;
    return LANGUAGE_LABEL.test(label) && isClickable(el) && isShown(el);
  });
  if (labeled && !isDangerousControl(labeled)) return labeled;
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const text = directText(el);
    if (!text || !(REGION_CODE.test(text) || LANGUAGE_NAMES.test(text)) || NOT_REGIONS.has(text) || !isShown(el)) continue;
    const target = tapTarget(el);
    if (!target || (target.textContent ?? "").trim().length > 24) continue;
    if (!isDangerousControl(target)) return target;
  }
  return null;
}

const MENU_LABEL = /menu|navigation|القائمة|قائمة|التنقل|menú/i;
const MENU_CLASS = /hamburger|burger|menu|drawer/i;

/** The ☰ button: by its own label/class first; else the top bar's outermost small icon on the
 * reading-start side (the ☰ sits at the top right on the Arabic page, the rail icons are below). */
function findMenuButton(): HTMLElement | null {
  const buttons = Array.from(document.body.querySelectorAll<HTMLElement>("button, a, [role='button']")).filter(isShown);
  const labeled = buttons.find((el) => {
    const label = `${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("title") ?? ""}`;
    return MENU_LABEL.test(label) || (MENU_CLASS.test(el.getAttribute("class") ?? "") && !(el.textContent ?? "").trim());
  });
  if (labeled && !isDangerousControl(labeled)) return labeled;
  if (document.body.getBoundingClientRect().height <= 0) return null; // no layout: never guess
  const topBar = buttons
    .map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({ el, rect }) => rect.top < 90 && rect.width <= 64 && rect.height <= 64 && !(el.textContent ?? "").trim() && el.querySelector("svg"));
  if (!topBar.length) return null;
  const rtl = (document.documentElement.getAttribute("dir") ?? getComputedStyle(document.body).direction) === "rtl";
  topBar.sort((a, b) => (rtl ? b.rect.right - a.rect.right : a.rect.left - b.rect.left));
  const target = topBar[0]!.el;
  return isDangerousControl(target) ? null : target;
}

/** One step toward an English page (see the module doc). `menuOpened` = the ☰ was already tapped
 * in this run, so it is never tapped again (a second tap would just close it). */
export function ensureEnglishStep(menuOpened = false): EnglishStep {
  // Right after "English", Starlink asks "حفظ اللغة؟ - also save this language to your profile for
  // emails and other communications?" (real, confirmed screenshot). Always "لا": only the page's
  // display changes - the customer's own account settings are never touched by the app.
  if (tap(findSaveLanguageNo())) return "clicked";
  // The region/language list open on screen comes first: it is itself a long wall of Latin text
  // ("UNITED STATES", "CANADA", "ARGENTINA"...), which made the letter count below read the still
  // Arabic page as English and stop right there, the list open and nothing tapped (real, confirmed
  // screenshot). Only the page's own lang="en..." means English is already chosen.
  if (languageListOpen()) {
    const lang = (document.documentElement.getAttribute("lang") ?? "").toLowerCase();
    if (lang.startsWith("en")) return "english";
    if (tap(findEnglishOption())) return "clicked";
  }
  const english = isEnglishText(toVisibleText(document.body));
  if (english === undefined) return "loading";
  if (english) return "english";
  if (tap(findEnglishOption())) return "clicked";
  if (tap(findLanguageControl())) return "globe";
  if (!menuOpened && tap(findMenuButton())) return "menu";
  return "unknown";
}
