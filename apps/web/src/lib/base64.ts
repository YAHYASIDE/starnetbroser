/**
 * ⚡ Bytes ↔ base64 in chunks (his Nov 18 2026 report: the main phone froze on opening). The old way added one character
 * at a time - on his biggest data (the encrypted backup, the team link's sealed batches, chat pictures and voices) that
 * held the screen for many seconds and Android closed the app («التطبيق لا يعمل»). 32 KB at a time is the same result,
 * many times faster. Pure.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return btoa(parts.join(""));
}

export function base64ToBytes(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
