"use client";

import { useEffect, useState } from "react";
import { connectRepExtraBot, disconnectRepExtraBot, repBotNames, telegramConnection } from "@/lib/telegram";
import type { RepBotNames } from "@/lib/repBots";

const BOTS: { bot: "money" | "alerts"; title: string; hint: string }[] = [
  {
    bot: "money",
    title: "💰 بوت المال",
    hint: "الدفعات، وعود الدفع، ديون الزبائن، حصته وأرباحه ورصيده، ما سلّمه لك، ومبالغ ⚡ التفعيل مع مجموع الشهر.",
  },
  {
    bot: "alerts",
    title: "🔔 بوت التنبيهات",
    hint: "تنبيهات فقط: جهاز توقف (مع علامة 🅳 وزر «اطلب من المسؤول الدفع»)، وتجديدات الصباح. تصلك نسخة من كل تنبيه في بوتك.",
  },
];

/** The reps' optional 💰 money and 🔔 alerts bots (repBots.ts) - each a new bot from @BotFather.
 * Reps are linked once in the devices bot; they only press «ابدأ» in these. */
export function RepExtraBotsSettings() {
  const [names, setNames] = useState<RepBotNames>({});
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setNames(repBotNames());
    void telegramConnection().then(() => setNames(repBotNames()));
  }, []);

  async function connect(bot: "money" | "alerts") {
    setBusy(bot);
    setMessage(null);
    const result = await connectRepExtraBot(bot, tokens[bot] ?? "");
    setBusy(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setTokens({ ...tokens, [bot]: "" });
    setNames(repBotNames());
    setMessage(`✓ تم الربط - أُرسل رابط @${result.botName} لكل المندوبين المربوطين ليضغطوا «ابدأ»`);
  }

  async function disconnect(bot: "money" | "alerts") {
    if (!window.confirm("فصل هذا البوت؟ تعود رسائله إلى بوت الأجهزة.")) return;
    await disconnectRepExtraBot(bot);
    setNames(repBotNames());
  }

  return (
    <div className="rep-extra-bots">
      <strong>بوتات إضافية للمندوبين (اختياري)</strong>
      <p className="settings-hint">بدونها يبقى كل شيء في بوت الأجهزة كما هو. أنشئ كل بوت من <bdi dir="ltr">@BotFather</bdi> بأمر <bdi dir="ltr">/newbot</bdi>.</p>
      {BOTS.map(({ bot, title, hint }) => {
        const name = names[bot];
        return (
          <div key={bot} className="rep-extra-bot">
            <div className="rep-extra-bot-head">
              <span>{title}</span>
              {name && <bdi dir="ltr">@{name}</bdi>}
            </div>
            <p className="settings-hint">{hint}</p>
            {name ? (
              <button type="button" className="text-action" onClick={() => void disconnect(bot)}>فصل</button>
            ) : (
              <div className="rep-extra-bot-connect">
                <input
                  className="search-input"
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="123456789:AA..."
                  value={tokens[bot] ?? ""}
                  onChange={(e) => setTokens({ ...tokens, [bot]: e.target.value })}
                  aria-label={`مفتاح ${title}`}
                />
                <button type="button" className="dialog-primary" disabled={busy !== null || !(tokens[bot] ?? "").trim()} onClick={() => void connect(bot)}>
                  {busy === bot ? "⏳" : "ربط"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {message && <p className="settings-hint telegram-message">{message}</p>}
    </div>
  );
}
