"use client";

import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { daySummary, repDayMessages } from "@/lib/dayActions";
import { formatAmount } from "@/lib/formatAmount";
import type { RepresentativeStore } from "@/lib/repStore";
import { isRepsBotConnected, loadRepChats, sendRepText } from "@/lib/telegram";
import { buildExpiryReminderMessage, buildWhatsAppLink } from "@/lib/whatsapp";

type View = "menu" | "reps" | "remind" | "summary";

/** 📅 Long press on a day of «التجديد حسب اليوم»: send each rep his devices of that day (reps bot),
 * sync that day's devices one by one, remind the customers on WhatsApp, or see the day's summary. */
export function DayActionsSheet({
  day,
  dayAccounts,
  reps,
  phoneFor,
  onSync,
  onClose,
}: {
  day: number;
  dayAccounts: StarlinkAccountSummary[];
  reps: RepresentativeStore;
  phoneFor: (account: StarlinkAccountSummary) => string | undefined;
  onSync: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("menu");
  const { messages, withoutRep } = useMemo(() => repDayMessages(dayAccounts, day, reps), [dayAccounts, day, reps]);
  const linked = useMemo(() => (isRepsBotConnected() ? loadRepChats() : {}), []);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const summary = useMemo(() => daySummary(dayAccounts), [dayAccounts]);
  const linkedCount = messages.filter((m) => linked[m.repId]).length;

  async function sendToLinked() {
    setSending(true);
    const results: Record<string, boolean> = {};
    for (const message of messages) {
      if (!linked[message.repId]) continue;
      results[message.repId] = await sendRepText(message.repId, message.text);
    }
    setSent((current) => ({ ...current, ...results }));
    setSending(false);
  }

  const title = view === "reps" ? "📨 للمندوبين" : view === "remind" ? "💬 تذكير الزبائن" : view === "summary" ? "📊 ملخص اليوم" : "";

  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet" role="dialog" aria-modal="true" aria-label={`يوم ${day}`} onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>
            📅 يوم <bdi dir="ltr">{day}</bdi> · {dayAccounts.length} جهاز{title ? ` · ${title}` : ""}
          </strong>
          <button type="button" className="dialog-close" onClick={view === "menu" ? onClose : () => setView("menu")} aria-label={view === "menu" ? "إغلاق" : "رجوع"}>
            {view === "menu" ? "×" : "→"}
          </button>
        </div>

        {view === "menu" && (
          <div className="card-more-list">
            <button type="button" className="card-more-item" onClick={() => setView("reps")}>
              <span aria-hidden="true">📨</span> إرسال للمندوبين <small>{messages.length} مندوب</small>
            </button>
            <button type="button" className="card-more-item" onClick={onSync}>
              <span aria-hidden="true">🔄</span> تحديث أجهزة هذا اليوم <small>جهاز بعد جهاز</small>
            </button>
            <button type="button" className="card-more-item" onClick={() => setView("remind")}>
              <span aria-hidden="true">💬</span> تذكير الزبائن بواتساب
            </button>
            <button type="button" className="card-more-item" onClick={() => setView("summary")}>
              <span aria-hidden="true">📊</span> ملخص اليوم
            </button>
          </div>
        )}

        {view === "reps" && (
          <>
            {messages.length === 0 ? (
              <p className="sync-choice-hint">لا أجهزة لمندوبين في هذا اليوم.</p>
            ) : (
              <div className="day-sheet-rows">
                {messages.map((message) => {
                  const wa = buildWhatsAppLink(message.phone, message.text);
                  return (
                    <div key={message.repId} className="day-sheet-row">
                      <span>
                        {message.repName} <small>({message.count})</small>
                      </span>
                      {sent[message.repId] === true ? (
                        <span className="day-sheet-ok">✓ أُرسل</span>
                      ) : sent[message.repId] === false ? (
                        <span className="day-sheet-bad">✗ تعذر</span>
                      ) : linked[message.repId] ? (
                        <span className="day-sheet-muted">🤖 بالبوت</span>
                      ) : wa ? (
                        <a className="day-sheet-wa" href={wa} target="_blank" rel="noopener noreferrer">
                          واتساب
                        </a>
                      ) : (
                        <span className="day-sheet-muted">غير مربوط · بلا هاتف</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {withoutRep > 0 && <p className="sync-choice-hint">{withoutRep} جهاز بلا مندوب - لا يُرسل لأحد.</p>}
            {linkedCount > 0 && (
              <button type="button" className="dialog-primary" disabled={sending} onClick={() => void sendToLinked()}>
                {sending ? "جارِ الإرسال…" : `📨 أرسل بالبوت إلى ${linkedCount} مندوب`}
              </button>
            )}
          </>
        )}

        {view === "remind" && (
          <div className="day-sheet-rows">
            {dayAccounts.map((account) => {
              const wa = buildWhatsAppLink(phoneFor(account), buildExpiryReminderMessage(account.name));
              return (
                <div key={account.id} className="day-sheet-row">
                  <span>{account.name}</span>
                  {wa ? (
                    <a className="day-sheet-wa" href={wa} target="_blank" rel="noopener noreferrer">
                      واتساب
                    </a>
                  ) : (
                    <span className="day-sheet-muted">بلا هاتف</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {view === "summary" && (
          <div className="day-sheet-rows">
            <div className="day-sheet-row">
              <span>الأجهزة</span>
              <strong>{summary.count}</strong>
            </div>
            <div className="day-sheet-row">
              <span>موقوفة</span>
              <strong>{summary.stopped}</strong>
            </div>
            <div className="day-sheet-row">
              <span>متعطلة</span>
              <strong>{summary.faulty}</strong>
            </div>
            <div className="day-sheet-row">
              <span>يُحصَّل من الزبائن</span>
              <strong>
                {Object.entries(summary.salesByCurrency).map(([currency, amount]) => (
                  <bdi key={currency} dir="ltr" className="day-sheet-amount">
                    {formatAmount(amount)} {currency}
                  </bdi>
                ))}
                {Object.keys(summary.salesByCurrency).length === 0 && "—"}
              </strong>
            </div>
            <div className="day-sheet-row">
              <span>تكلفة Starlink</span>
              <strong>
                {Object.entries(summary.costByCurrency).map(([currency, amount]) => (
                  <bdi key={currency} dir="ltr" className="day-sheet-amount">
                    {formatAmount(amount)} {currency}
                  </bdi>
                ))}
                {Object.keys(summary.costByCurrency).length === 0 && "—"}
              </strong>
            </div>
            {summary.withoutPrice > 0 && <p className="sync-choice-hint">{summary.withoutPrice} جهاز بلا سعر شهري - غير محسوب في المبالغ.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
