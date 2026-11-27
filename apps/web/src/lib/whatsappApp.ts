/**
 * 💬 Which WhatsApp opens a customer's link (his Nov 27 2026 «أريد أن تظهر لي حسابات واتساب الأعمال… أختار من داخل
 * التطبيق»): WhatsApp and WhatsApp Business are both installed and Android's «فتح بواسطة» showed two identical «واتساب». The
 * app asks him once, by name, and opens that one directly after. The choice is phone-only (`starnet.whatsappApp`).
 * Pure parts tested in whatsappApp.test.ts; the native calls (LocalBrowser.whatsappApps / openWhatsAppLink) at the bottom.
 */

export type WhatsAppAppId = "personal" | "business";
export type WhatsAppChoice = WhatsAppAppId | "ask";

export const WHATSAPP_APP_KEY = "starnet.whatsappApp";
export const WHATSAPP_PICK_EVENT = "starnet:whatsapp-pick";

export const WHATSAPP_APP_LABELS: Record<WhatsAppAppId, string> = {
  personal: "💬 واتساب",
  business: "💼 واتساب الأعمال (Business)",
};

/** Only a WhatsApp chat link is taken over (everything else opens as before). */
export function isWhatsAppLink(url: unknown): url is string {
  return typeof url === "string" && (/^https:\/\/wa\.me[/?]/.test(url) || url.startsWith("https://api.whatsapp.com/"));
}

export function parseChoice(raw: string | null): WhatsAppChoice {
  return raw === "personal" || raw === "business" ? raw : "ask";
}

/** What to do with a link: open this app now, ask him, or leave it to the system (none installed). */
export function decideApp(installed: WhatsAppAppId[], choice: WhatsAppChoice): { do: "open"; app: WhatsAppAppId } | { do: "ask" } | { do: "system" } {
  if (installed.length === 0) return { do: "system" };
  if (installed.length === 1) return { do: "open", app: installed[0]! };
  if (choice !== "ask" && installed.includes(choice)) return { do: "open", app: choice };
  return { do: "ask" };
}

export function loadChoice(): WhatsAppChoice {
  try {
    return parseChoice(window.localStorage.getItem(WHATSAPP_APP_KEY));
  } catch {
    return "ask";
  }
}

export function saveChoice(choice: WhatsAppChoice): void {
  try {
    if (choice === "ask") window.localStorage.removeItem(WHATSAPP_APP_KEY);
    else window.localStorage.setItem(WHATSAPP_APP_KEY, choice);
  } catch {
    // asked again next time
  }
}

// ---- the native side ----

let installedCache: { at: number; apps: WhatsAppAppId[] } | null = null;

/** The WhatsApp apps installed on this phone (kept a minute). Empty off the Android app. */
export async function installedWhatsAppApps(now = Date.now()): Promise<WhatsAppAppId[]> {
  if (installedCache && now - installedCache.at < 60_000) return installedCache.apps;
  try {
    const { isRunningInAndroidApp } = await import("./localBrowser");
    if (!isRunningInAndroidApp()) return [];
    const { LocalBrowser } = await import("@starnet/local-browser-plugin");
    const { apps } = await LocalBrowser.whatsappApps();
    const list = apps.filter((a) => a.installed).map((a) => a.id);
    installedCache = { at: now, apps: list };
    return list;
  } catch {
    return [];
  }
}

/** Opens the link in that app. False when it could not (the caller falls back to the system). */
export async function openInWhatsApp(url: string, app: WhatsAppAppId): Promise<boolean> {
  try {
    const { LocalBrowser } = await import("@starnet/local-browser-plugin");
    await LocalBrowser.openWhatsAppLink({ url, app });
    return true;
  } catch {
    return false;
  }
}
