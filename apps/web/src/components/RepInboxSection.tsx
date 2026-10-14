"use client";

import { useCallback, useEffect, useState } from "react";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import { decideRepItems, openRepInbox, REP_INBOX_EVENT, type RepInboxView } from "@/lib/repChangesApply";

/**
 * 📝 «تسجيلات المندوبين» (representatives page): what each rep sent from his app with «📤 إرسال
 * تسجيلاتي», item by item. Nothing reaches the operator's devices before ✅ - one item, the selected
 * ones, or all of them; ❌ removes it from the rep's phone with his next copy.
 */
export function RepInboxSection() {
  const [views, setViews] = useState<RepInboxView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => setViews(await openRepInbox()), []);
  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(REP_INBOX_EVENT, onChange);
    return () => window.removeEventListener(REP_INBOX_EVENT, onChange);
  }, [refresh]);

  if (views.length === 0) return null;

  async function decide(repId: string, approve: string[], reject: string[], link: string[] = []) {
    setBusy(repId);
    setMessage(null);
    const result = await decideRepItems(repId, approve, reject, link);
    setBusy(null);
    setMessage(result.message);
    await refresh();
  }

  return (
    <section className="section rep-inbox" id="rep-inbox">
      <h2 className="section-title">📝 تسجيلات المندوبين</h2>
      {message && <p className="settings-hint rep-mode-message">{message}</p>}
      {views.map((view) => (
        <RepInboxCard key={view.file.id} view={view} busy={busy === view.file.repId} onDecide={(a, r, l) => void decide(view.file.repId, a, r, l)} />
      ))}
    </section>
  );
}

function RepInboxCard({ view, busy, onDecide }: { view: RepInboxView; busy: boolean; onDecide: (approve: string[], reject: string[], link?: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // A device you already have never goes with «تثبيت الكل» - it's rejected or linked one by one.
  const keys = view.items.filter((i) => !i.duplicateOf).map((i) => i.key);
  const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));

  function toggle(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function confirmThen(text: string, run: () => void) {
    if (window.confirm(text)) {
      run();
      setSelected(new Set());
    }
  }

  return (
    <div className="rep-inbox-card">
      <div className="rep-inbox-head">
        <strong>🤝 {view.repName}</strong>
        <small>
          أُرسلت <bdi dir="ltr">{view.file.sentAt.slice(0, 16).replace("T", " ")}</bdi> · {view.items.length} بانتظارك
        </small>
      </div>
      {view.error ? (
        <p className="settings-hint">{view.error}</p>
      ) : (
        <>
          <label className="rep-inbox-all">
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(keys))} />
            <span>تحديد الكل</span>
          </label>
          <ul className="rep-inbox-items">
            {view.items.map((item) => (
              <li key={item.key} className={`rep-inbox-item rep-inbox-${item.kind}${item.duplicateOf ? " rep-inbox-duplicate" : ""}`}>
                <label className="rep-inbox-check">
                  {!item.duplicateOf && <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} aria-label={item.title} />}
                </label>
                <span className="rep-inbox-main">
                  <strong>{item.title}</strong>
                  {item.detail && <small>{item.detail}</small>}
                  {item.duplicateOf && (
                    <small className="rep-inbox-dup-note">
                      ⚠️ مسجّل عندك من قبل: «{item.duplicateOf.name}» ({item.duplicateOf.field === "email" ? "نفس الإيميل" : "نفس رقم KIT"}) - لا يُضاف مرة ثانية
                    </small>
                  )}
                </span>
                {item.amount && item.amount.value > 0 && (
                  <span className="rep-inbox-amount">
                    <bdi dir="ltr">{formatAmount(item.amount.value)}</bdi> {LEDGER_CURRENCY_LABELS[item.amount.currency as LedgerCurrency] ?? item.amount.currency}
                  </span>
                )}
                <span className="rep-inbox-buttons">
                  {item.duplicateOf ? (
                    <button
                      type="button"
                      className="rep-inbox-ok"
                      disabled={busy}
                      onClick={() =>
                        confirmThen(
                          `ربط جهازك «${item.duplicateOf!.name}» بالمندوب ${view.repName}؟\nلا يُضاف جهاز جديد، وما سجّله المندوب على هذا المكرر لا يُنقل.`,
                          () => onDecide([], [], [item.key]),
                        )
                      }
                      aria-label="ربط بالجهاز الموجود"
                    >
                      🔗
                    </button>
                  ) : (
                    <button type="button" className="rep-inbox-ok" disabled={busy} onClick={() => onDecide([item.key], [])} aria-label="تثبيت">
                      ✅
                    </button>
                  )}
                  <button
                    type="button"
                    className="rep-inbox-no"
                    disabled={busy}
                    onClick={() =>
                      confirmThen(
                        item.duplicateOf
                          ? `رفض «${item.title}»؟ يُبلَّغ المندوب أنه مسجّل عندك من قبل، ويُحذف من هاتفه مع نسخته القادمة.`
                          : `رفض «${item.title}»؟ يُحذف من هاتف المندوب مع نسخته القادمة.`,
                        () => onDecide([], [item.key]),
                      )
                    }
                    aria-label="رفض"
                  >
                    ❌
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="rep-inbox-actions">
            {selected.size > 0 ? (
              <>
                <button type="button" className="dialog-primary" disabled={busy} onClick={() => confirmThen(`تثبيت ${selected.size} تسجيلاً؟`, () => onDecide([...selected], []))}>
                  ✅ تثبيت المحدد ({selected.size})
                </button>
                <button type="button" className="dialog-secondary" disabled={busy} onClick={() => confirmThen(`رفض ${selected.size} تسجيلاً؟`, () => onDecide([], [...selected]))}>
                  ❌ رفض المحدد
                </button>
              </>
            ) : (
              <button type="button" className="dialog-primary" disabled={busy} onClick={() => confirmThen(`تثبيت كل تسجيلات ${view.repName} (${keys.length})؟`, () => onDecide(keys, []))}>
                {busy ? "⏳ جارِ التثبيت…" : `✅ تثبيت الكل (${keys.length})`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
