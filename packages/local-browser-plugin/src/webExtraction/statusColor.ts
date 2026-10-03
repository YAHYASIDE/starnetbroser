export type StatusColorValue = "online" | "offline" | "warning" | "unknown";

const ONLINE_WORDS = ["online", "connected", "متصل", "متصلة"];
const OFFLINE_WORDS = ["offline", "disconnected", "not connected", "غير متصل", "غير متصلة", "منقطع", "منقطعة"];
const WARNING_WORDS = ["warning", "attention", "degraded", "تنبيه", "تحذير", "انتباه"];

/**
 * Preferred detection path: a status dot's accessible name (aria-label) or title text usually
 * says the state in words - this is far more reliable than guessing from color. Returns null
 * (not "unknown") when the text doesn't match anything recognized, so the caller knows to fall
 * back to statusFromComputedColor instead of treating an unrecognized label as a real answer.
 */
export function statusFromLabelText(text: string | null | undefined): StatusColorValue | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (OFFLINE_WORDS.some((word) => lower.includes(word.toLowerCase()))) return "offline";
  if (WARNING_WORDS.some((word) => lower.includes(word.toLowerCase()))) return "warning";
  if (ONLINE_WORDS.some((word) => lower.includes(word.toLowerCase()))) return "online";
  return null;
}

/**
 * Fallback when a status dot carries no usable aria-label/title: classifies its computed color.
 * This is necessarily approximate - real pages can use any shade for "green" - so it only
 * commits to green/red/amber when the color is clearly saturated toward that hue, and reports
 * "unknown" for anything ambiguous (including grayscale) rather than guessing.
 */
export function statusFromComputedColor(colorValue: string | null | undefined): StatusColorValue {
  const rgb = parseRgb(colorValue);
  if (!rgb) return "unknown";
  if (rgb.a !== undefined && rgb.a < 0.3) return "unknown"; // (nearly) transparent - no real color
  const { r, g, b } = rgb;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 40 || max < 60) return "unknown"; // grayscale / near-black - genuinely unknown

  // By hue, not by raw channel sizes: Starlink's own "offline" red is a soft coral (e.g.
  // rgb(235, 100, 85)) whose green channel is high enough that a channel comparison mistook it
  // for amber - its hue (~6°) is unmistakably red.
  const hue = hueOf(r, g, b);
  if (hue <= 18 || hue >= 335) return "offline";
  if (hue < 70) return "warning";
  if (hue >= 75 && hue <= 170) return "online";
  return "unknown";
}

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function parseRgb(value: string | null | undefined): { r: number; g: number; b: number; a?: number } | null {
  if (!value) return null;
  // An SVG `fill="#e5484d"` attribute (never computed into rgb() by the page itself).
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.split("").map((c) => c + c).join("") : hex[1]!;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const match = value.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[,/]\s*([\d.]+%?))?/i);
  if (!match) return null;
  const alpha = match[4] === undefined ? undefined : match[4].endsWith("%") ? Number(match[4].slice(0, -1)) / 100 : Number(match[4]);
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alpha };
}
