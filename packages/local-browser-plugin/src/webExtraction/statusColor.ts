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
  const { r, g, b } = rgb;

  const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
  if (maxDiff < 12) return "unknown"; // grayscale (including black/white) - genuinely unknown

  if (g > r && g > b && g - r > 25) return "online"; // green-dominant
  if (r > g && r > b) {
    // Red-dominant - amber/orange still has a meaningful green channel, pure red doesn't.
    return g > 90 && g < r ? "warning" : "offline";
  }
  return "unknown";
}

function parseRgb(value: string | null | undefined): { r: number; g: number; b: number } | null {
  if (!value) return null;
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}
