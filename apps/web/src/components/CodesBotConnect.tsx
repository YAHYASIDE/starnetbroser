"use client";

import { useEffect, useState } from "react";
import { codesBotName, connectCodesBot, disconnectCodesBot, telegramConnection } from "@/lib/telegram";

/** 🔑 «بوت الأكواد» (his Oct 22 2026 ask): a new bot from @BotFather; every code the phone reads is
 * sent there with the device's details. Sends to his own chat, so his personal bot must be linked. */
export function CodesBotConnect() {
  const [name, setName] = useState<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setName(codesBotName());
    void telegramConnection().then(() => setName(codesBotName()));
  }, []);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const result = await connectCodesBot(token);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setToken("");
    setName(codesBotName());
    setMessage(`✓ تم الربط - أُرسلت رسالة تجربة إلى @${result.botName}`);
  }

  async function disconnect() {
    if (!window.confirm("فصل بوت الأكواد؟ تبقى الأكواد محفوظة هنا ولا تُرسل.")) return;
    await disconnectCodesBot();
    setName(undefined);
  }

  return (
    <div className="rep-extra-bot codes-bot">
      <div className="rep-extra-bot-head">
        <span>🤖 بوت الأكواد</span>
        {name && <bdi dir="ltr">@{name}</bdi>}
      </div>
      <p className="settings-hint">كل رمز يقرؤه الهاتف يصلك فورًا في هذا البوت مع اسم الجهاز والزبون والإيميل ورقم KIT.</p>
      {name ? (
        <button type="button" className="text-action" onClick={() => void disconnect()}>فصل</button>
      ) : (
        <>
          <ol className="codes-bot-steps">
            <li>
              في <bdi dir="ltr">@BotFather</bdi> أرسل <bdi dir="ltr">/newbot</bdi> وسمّه مثلًا «STAR NET الأكواد».
            </li>
            <li>افتح البوت الجديد واضغط «ابدأ».</li>
            <li>الصق مفتاحه هنا واضغط «ربط» (بوتك الشخصي يجب أن يكون مربوطًا).</li>
          </ol>
          <div className="rep-extra-bot-connect">
            <input
              className="search-input"
              type="password"
              dir="ltr"
              autoComplete="off"
              placeholder="123456789:AA..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              aria-label="مفتاح بوت الأكواد"
            />
            <button type="button" className="dialog-primary" disabled={busy || !token.trim()} onClick={() => void connect()}>
              {busy ? "⏳" : "ربط"}
            </button>
          </div>
        </>
      )}
      {message && <p className="settings-hint telegram-message">{message}</p>}
    </div>
  );
}
