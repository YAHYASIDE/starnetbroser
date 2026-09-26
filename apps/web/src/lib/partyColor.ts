/** Hues spread around the wheel and far enough apart that neighbouring cards never look alike. */
const PARTY_HUES = [200, 160, 280, 20, 330, 45, 240, 100, 0, 180];

/** A stable per-party hue (same id always gets the same colour) for the card's avatar/accent. */
export function partyHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PARTY_HUES[Math.abs(hash) % PARTY_HUES.length];
}

/** Up to two initials for the avatar - first letter of the first two words. */
export function partyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join(" ");
}
