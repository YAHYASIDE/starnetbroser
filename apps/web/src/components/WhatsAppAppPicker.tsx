"use client";

import { useEffect, useState } from "react";
import { PartySheet } from "./AccountsSection";
import {
  decideApp,
  installedWhatsAppApps,
  isWhatsAppLink,
  loadChoice,
  openInWhatsApp,
  pushChoiceToNative,
  saveChoice,
  WHATSAPP_APP_LABELS,
  WHATSAPP_ASK_EVENT,
  WHATSAPP_PICK_EVENT,
  type WhatsAppAppId,
} from "@/lib/whatsappApp";

const original = typeof window !== "undefined" ? window.open.bind(window) : null;

/**
 * 💬 Every WhatsApp link of the app (a customer's message, a statement, an activation…) opens in the WhatsApp he chose -
 * asked once by name when both WhatsApp and WhatsApp Business are installed (lib/whatsappApp.ts). Catches the links in one
 * place (a tap on a wa.me anchor, window.open): no screen had to change. Off the Android app nothing changes.
 */
export function WhatsAppAppPicker() {
  const [pending, setPending] = useState<{ url?: string; apps: WhatsAppAppId[]; resolve?: (app: WhatsAppAppId | null) => void } | null>(null);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    const system = (url: string) => {
      // what the browser would have done
      if (original) original(url, "_blank", "noopener,noreferrer");
    };
    const handle = async (url: string) => {
      const apps = await installedWhatsAppApps();
      const d = decideApp(apps, loadChoice());
      if (d.do === "system") return system(url);
      if (d.do === "open") {
        if (!(await openInWhatsApp(url, d.app))) system(url);
        return;
      }
      setPending({ url, apps });
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !isWhatsAppLink(a.href)) return;
      e.preventDefault();
      e.stopPropagation();
      void handle(a.href);
    };
    const onPick = (e: Event) => void handle((e as CustomEvent<string>).detail);
    // a picture share asks which app too (lib/whatsappApp.ts pickAppForShare)
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent<{ apps: WhatsAppAppId[]; resolve: (app: WhatsAppAppId | null) => void }>).detail;
      setPending({ apps: d.apps, resolve: d.resolve });
    };
    window.addEventListener(WHATSAPP_ASK_EVENT, onAsk);
    // the native shares read his choice from the phone itself: tell it once at the start
    void pushChoiceToNative();
    document.addEventListener("click", onClick, true);
    window.addEventListener(WHATSAPP_PICK_EVENT, onPick);
    const patched: typeof window.open = (url, target, features) => {
      if (isWhatsAppLink(typeof url === "string" ? url : url?.toString())) {
        void handle(String(url));
        return null;
      }
      return original ? original(url, target, features) : null;
    };
    window.open = patched;
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(WHATSAPP_PICK_EVENT, onPick);
      window.removeEventListener(WHATSAPP_ASK_EVENT, onAsk);
      if (original) window.open = original;
    };
  }, []);

  if (!pending) return null;
  const choose = async (app: WhatsAppAppId) => {
    const { url, resolve } = pending;
    if (remember) saveChoice(app);
    setPending(null);
    if (resolve) return resolve(app);
    if (url && !(await openInWhatsApp(url, app)) && original) original(url, "_blank", "noopener,noreferrer");
  };
  const close = () => {
    pending.resolve?.(null);
    setPending(null);
  };
  return (
    <PartySheet title="💬 افتح في أي واتساب؟" onClose={close}>
      <p className="settings-hint">عندك واتساب وواتساب الأعمال. اختر أيهما يفتح هذا الرابط.</p>
      <div className="agent-actions">
        {pending.apps.map((app) => (
          <button key={app} type="button" className="dialog-primary" onClick={() => void choose(app)}>
            {WHATSAPP_APP_LABELS[app]}
          </button>
        ))}
      </div>
      <label className="toggle-switch-row">
        <span>تذكّر اختياري (تغييره من الإعدادات)</span>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      </label>
    </PartySheet>
  );
}

/** ⚙️ الإعدادات: which WhatsApp the app uses. */
export function WhatsAppAppSection() {
  const [installed, setInstalled] = useState<WhatsAppAppId[] | null>(null);
  const [choice, setChoice] = useState(loadChoice());
  useEffect(() => {
    void installedWhatsAppApps().then(setInstalled);
  }, []);
  const set = (c: ReturnType<typeof loadChoice>) => {
    saveChoice(c);
    setChoice(c);
  };
  return (
    <section className="section">
      <p className="settings-hint">
        {installed === null
          ? "⏳ يبحث عن تطبيقات واتساب في هاتفك…"
          : installed.length === 0
            ? "لم أجد واتساب ولا واتساب الأعمال في هذا الهاتف (أو هذا ليس تطبيق الأندرويد)."
            : installed.length === 1
              ? `عندك ${WHATSAPP_APP_LABELS[installed[0]!]} فقط، فلا شيء تختاره (وإن كان عندك نسخة مكررة من واتساب فيظهر اختيارها في نافذة أندرويد كالمعتاد).`
              : "عندك واتساب وواتساب الأعمال. اختر الذي تفتح به روابط الزبائن:"}
      </p>
      {installed && installed.length > 1 && (
        <div className="tool-chips">
          <button type="button" className={`tool-chip${choice === "ask" ? " tool-chip-on" : ""}`} onClick={() => set("ask")}>
            اسألني كل مرة
          </button>
          {installed.map((app) => (
            <button key={app} type="button" className={`tool-chip${choice === app ? " tool-chip-on" : ""}`} onClick={() => set(app)}>
              {WHATSAPP_APP_LABELS[app]}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
