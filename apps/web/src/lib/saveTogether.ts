/**
 * 🔒 Several stores written as one (his Oct 22 2026 rule: an invoice never saved without its devices):
 * every key is snapshotted first and put back if any write throws (a full phone storage), so nothing
 * is left half-saved.
 */
export function saveTogether(keys: string[], write: () => void): { ok: true } | { ok: false; message: string } {
  if (typeof window === "undefined") {
    write();
    return { ok: true };
  }
  const before = keys.map((key) => [key, window.localStorage.getItem(key)] as const);
  try {
    write();
    return { ok: true };
  } catch {
    for (const [key, value] of before) {
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch {
        // nothing more can be done - the original value was never changed if this throws too
      }
    }
    return { ok: false, message: "تعذّر الحفظ (ذاكرة الهاتف ممتلئة؟) - لم يُحفظ شيء، حاول مرة أخرى" };
  }
}
