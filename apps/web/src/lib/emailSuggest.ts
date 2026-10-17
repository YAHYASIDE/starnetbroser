/**
 * ✉️ «إنشاء حساب جديد»: the new Outlook address and its code, suggested from the account's name (his
 * Oct 17 2026 choices): «ahmed.salem» + 3 digits @outlook.com - the first name and the last one in
 * Latin letters, the digits so Microsoft doesn't say it's taken - written by itself as he types the
 * name (while the field is empty or still holds the last suggestion), «🔄 اقتراح آخر» for other
 * digits; and a strong 10-character code. Pure (the randomness is passed in).
 */

/** Common names, the way they are written in Latin in his market (French-style, like «cheikh»). */
const KNOWN: Record<string, string> = {
  محمد: "mohamed", أحمد: "ahmed", احمد: "ahmed", محمود: "mahmoud", محمدن: "mohameden", سالم: "salem", علي: "ali",
  عمر: "omar", عثمان: "othmane", ابراهيم: "ibrahim", إبراهيم: "ibrahim", يحيى: "yahya", يحي: "yahya", حسن: "hassen",
  حسين: "houssein", الحسن: "elhassen", الحسين: "elhoussein", عبدالله: "abdallah", عبدالرحمن: "abderrahmane",
  مصطفى: "mostapha", خالد: "khaled", سيدي: "sidi", الشيخ: "cheikh", شيخ: "cheikh", فاطمة: "fatma", عائشة: "aicha",
  عيشة: "aicha", مريم: "mariem", زينب: "zeinab", اسماعيل: "ismail", إسماعيل: "ismail", يوسف: "youssef",
  موسى: "moussa", عيسى: "aissa", الامين: "lemine", الأمين: "lemine", بوبكر: "boubacar", ابوبكر: "aboubakr",
  أبوبكر: "aboubakr", حمود: "hamoud", عمار: "ammar", الوالد: "elwaled", المختار: "elmokhtar", مختار: "mokhtar",
  سيد: "sid", الطالب: "taleb", بلال: "bilal", ادريس: "idriss", إدريس: "idriss", صالح: "saleh", كريم: "karim",
  عبد: "abd", ناصر: "nasser", منير: "mounir", زيد: "zeid", حمزة: "hamza", يونس: "younes", طه: "taha",
};

/** Letters the names drop between parts: «ولد» / «بنت» / «بن» / «ابن». */
const PARTICLES = new Set(["ولد", "بنت", "بن", "ابن", "إبن", "ول", "اهل", "أهل"]);

const LETTERS: Record<string, string> = {
  ا: "a", أ: "a", إ: "i", آ: "a", ٱ: "a", ب: "b", ت: "t", ث: "th", ج: "j", ح: "h", خ: "kh", د: "d", ذ: "dh",
  ر: "r", ز: "z", س: "s", ش: "ch", ص: "s", ض: "d", ط: "t", ظ: "dh", ع: "a", غ: "gh", ف: "f", ق: "k", ك: "k",
  ل: "l", م: "m", ن: "n", ه: "h", ة: "a", و: "ou", ي: "i", ى: "a", ء: "", ئ: "i", ؤ: "o", گ: "g", ڤ: "v",
};

/** One Arabic word in Latin letters (a known name as it is written, else letter by letter). */
export function latinWord(word: string): string {
  const clean = word.replace(/[ً-ْـ]/g, "").trim();
  if (KNOWN[clean]) return KNOWN[clean];
  if (/^[a-z0-9]+$/i.test(clean)) return clean.toLowerCase();
  // «ال…» → «el…»
  const withArticle = clean.startsWith("ال") && clean.length > 3 ? clean.slice(2) : clean;
  const prefix = withArticle !== clean ? "el" : "";
  if (KNOWN[withArticle]) return prefix + KNOWN[withArticle];
  let out = "";
  for (let i = 0; i < withArticle.length; i++) {
    const ch = withArticle[i]!;
    if (ch === "و") out += i === 0 ? "w" : "ou";
    else if (ch === "ي") out += i === 0 ? "y" : "i";
    else out += LETTERS[ch] ?? (/[a-z0-9]/i.test(ch) ? ch.toLowerCase() : "");
  }
  return prefix + out;
}

/** «أحمد ولد سالم» → "ahmed.salem" (first + last, «ولد» dropped); one word → itself. */
export function emailBaseFor(fullName: string): string {
  const words = fullName
    .split(/[\s\-_.]+/)
    .map((w) => w.trim())
    .filter((w) => w && !PARTICLES.has(w));
  const latin = words.map(latinWord).filter(Boolean);
  if (latin.length === 0) return "";
  const parts = latin.length === 1 ? [latin[0]!] : [latin[0]!, latin[latin.length - 1]!];
  return parts.map((p) => p.replace(/[^a-z0-9]/g, "")).filter(Boolean).join(".");
}

/** The suggested address: "ahmed.salem427@outlook.com" (3 digits, 100-999); "" without a name. */
export function suggestEmail(fullName: string, random: () => number = Math.random): string {
  const base = emailBaseFor(fullName);
  if (!base) return "";
  const digits = 100 + Math.floor(random() * 900);
  return `${base}${digits}@outlook.com`;
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "#@!$";

/** A strong 10-character code Microsoft accepts: capital + lower letters + digits + one symbol
 * (no look-alike letters such as O/0, l/1). */
export function suggestPassword(random: () => number = Math.random): string {
  const pick = (set: string) => set[Math.floor(random() * set.length)]!;
  let code = pick(UPPER);
  for (let i = 0; i < 5; i++) code += pick(LOWER);
  for (let i = 0; i < 3; i++) code += pick(DIGITS);
  return code + pick(SYMBOLS);
}
