"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { DeviceStatus } from "@starnet/shared";
import { PartySheet } from "@/components/AccountsSection";
import { WrongPasswordError } from "@/lib/backupCrypto";
import { daysRemainingLabel, daysRemainingNumber } from "@/lib/date";
import { formatAmount } from "@/lib/formatAmount";
import { LEDGER_CURRENCY_LABELS, type LedgerCurrency } from "@/lib/ledgerStore";
import {
  deleteIsolatedAccountSession,
  importAccountSessions,
  isRunningInAndroidApp,
  openIsolatedAccountBrowser,
  starlinkLoginFor,
  takeSharedFile,
} from "@/lib/localBrowser";
import {
  isOlderCopy,
  isRepCopyFile,
  loadRepCopy,
  readRepCopyFile,
  removedDeviceIds,
  type RepCopy,
  type RepCopyDevice,
  saveRepCopy,
  summarizeRepDevice,
  withoutSessions,
} from "@/lib/repCopy";

/**
 * 📋 «أجهزتي» in «وضع المندوب»: the copy of his devices the operator sent (lib/repCopy.ts). The
 * file is opened from Telegram («فتح بـ STAR NET») or picked here; each new copy replaces the old
 * one, and a device no longer his is removed with its Starlink session.
 */
export function RepCopyView({ code }: { code: string }) {
  const [copy, setCopy] = useState<RepCopy | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<RepCopyDevice | null>(null);
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const apply = useCallback(
    async (text: string) => {
      if (!isRepCopyFile(text)) return setMessage("هذا الملف ليس نسخة أجهزتك من المسؤول");
      setBusy(true);
      try {
        const payload = await readRepCopyFile(text, code);
        const current = loadRepCopy();
        if (isOlderCopy(current, payload)) return setMessage("هذه نسخة أقدم من التي عندك - لم تتغيّر");
        const next = withoutSessions(payload);
        const removed = removedDeviceIds(current, next);
        for (const id of removed) await deleteIsolatedAccountSession(id);
        await importAccountSessions(payload.sessions);
        if (!saveRepCopy(next)) return setMessage("ذاكرة الهاتف ممتلئة - تعذّر حفظ النسخة");
        setCopy(next);
        setMessage(`✓ وصلت نسخة جديدة: ${next.devices.length} جهاز${removed.length ? ` · حُذف ${removed.length}` : ""}`);
      } catch (err) {
        setMessage(err instanceof WrongPasswordError ? "هذه النسخة لمندوب آخر (رمزك لا يفتحها)" : "تعذّر فتح النسخة");
      } finally {
        setBusy(false);
      }
    },
    [code],
  );

  // A file opened with STAR NET from Telegram arrives here on start and on every return.
  useEffect(() => {
    setCopy(loadRepCopy());
    const check = async () => {
      const text = await takeSharedFile();
      if (text) await apply(text);
    };
    void check();
    const handles: Array<Promise<{ remove: () => Promise<void> }>> = [];
    if (isRunningInAndroidApp()) handles.push(App.addListener("resume", () => void check()));
    return () => {
      for (const h of handles) void h.then((x) => x.remove());
    };
  }, [apply]);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    await apply(await file.text());
    if (fileInput.current) fileInput.current.value = "";
  }

  async function openAccount(device: RepCopyDevice) {
    const result = await openIsolatedAccountBrowser(device.account.id, device.account.name || "حساب Starlink", {
      ...starlinkLoginFor(device.account),
      ...(device.account.expectedEmailPassword ? { mailPassword: device.account.expectedEmailPassword } : {}),
    });
    if (!result.ok) setMessage(result.message);
  }

  const mruRate = copy?.rates.MRU;
  const devices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = copy?.devices ?? [];
    const filtered = q
      ? list.filter((d) => [d.account.name, d.clientName, d.clientPhone, d.account.expectedEmail].some((v) => v?.toLowerCase().includes(q)))
      : list;
    // Soonest renewal first - what needs attention today is on top.
    return [...filtered].sort((a, b) => (daysLeft(a) ?? 9999) - (daysLeft(b) ?? 9999));
  }, [copy, query]);

  return (
    <section className="rep-copy">
      <div className="rep-copy-head">
        <strong>📋 أجهزتي{copy ? ` (${copy.devices.length})` : ""}</strong>
        {copy && (
          <small>
            نسخة <bdi dir="ltr">{copy.sentAt.slice(0, 16).replace("T", " ")}</bdi>
          </small>
        )}
      </div>
      <p className="settings-hint">
        يرسل لك المسؤول نسخة أجهزتك في البوت: اضغط الملف ← «فتح بـ STAR NET». أو افتحه من هنا بعد تنزيله.
      </p>
      <button type="button" className="text-action" disabled={busy} onClick={() => fileInput.current?.click()}>
        {busy ? "⏳ جارِ الفتح…" : "📥 فتح ملف نسخة"}
      </button>
      <input ref={fileInput} type="file" accept=".json,application/json,text/plain" hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
      {message && <p className="settings-hint rep-mode-message">{message}</p>}

      {copy && copy.devices.length > 0 && (
        <input className="search-input" placeholder="🔍 ابحث: جهاز، زبون، هاتف" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {copy && copy.devices.length === 0 && <p className="settings-hint">لا توجد أجهزة لك في آخر نسخة.</p>}

      <ul className="rep-copy-list">
        {devices.map((device) => (
          <RepCopyCard key={device.account.id} device={device} mruRate={mruRate} onOpen={() => void openAccount(device)} onDetails={() => setOpen(device)} />
        ))}
      </ul>

      {open && <RepCopyDetails device={open} mruRate={mruRate} onClose={() => setOpen(null)} />}
    </section>
  );
}

function daysLeft(device: RepCopyDevice): number | null {
  return daysRemainingNumber(device.account.rechargeDate || device.account.standbyDate);
}

const STATUS: Record<string, { label: string; tone: string }> = {
  active: { label: "نشط", tone: "good" },
  suspended: { label: "موقوف", tone: "bad" },
  standby: { label: "استعداد", tone: "warn" },
  canceled: { label: "ملغى", tone: "bad" },
};

function dot(status: DeviceStatus): string {
  return status === DeviceStatus.GREEN ? "🟢" : status === DeviceStatus.RED ? "🔴" : status === DeviceStatus.YELLOW ? "🟡" : "⚪";
}

function Amounts({ values }: { values: Record<string, number> }) {
  const codes = Object.keys(values);
  if (codes.length === 0) return <span>0</span>;
  return (
    <>
      {codes.map((c) => (
        <span key={c}>
          <bdi dir="ltr">{formatAmount(values[c]!)}</bdi> {LEDGER_CURRENCY_LABELS[c as LedgerCurrency] ?? c}
        </span>
      ))}
    </>
  );
}

function mru(value: number): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.abs(Math.round(value)))}`;
}

function RepCopyCard({ device, mruRate, onOpen, onDetails }: { device: RepCopyDevice; mruRate?: number; onOpen: () => void; onDetails: () => void }) {
  const { account } = device;
  const summary = useMemo(() => summarizeRepDevice(device, mruRate), [device, mruRate]);
  const status = STATUS[account.serviceStatus ?? ""];
  const days = daysLeft(device);
  const date = account.rechargeDate || account.standbyDate;
  const tone = days === null ? "" : days < 0 ? " is-expired" : days <= 3 ? " is-soon" : "";
  return (
    <li className={`rep-copy-card${account.serviceStatus === "suspended" ? " is-suspended" : ""}`}>
      <div className="rep-copy-card-top">
        <strong className="rep-copy-name">{account.name}</strong>
        {status && <span className={`rep-copy-status rep-copy-status-${status.tone}`}>{status.label}</span>}
      </div>
      <div className="rep-copy-client">
        👤 {device.clientName ?? "بدون زبون"}
        {device.clientPhone && (
          <a href={`tel:${device.clientPhone}`} className="rep-copy-phone">
            <bdi dir="ltr">{device.clientPhone}</bdi>
          </a>
        )}
      </div>
      <div className="rep-copy-chips">
        {date && (
          <span className={`rep-copy-chip${tone}`}>
            📅 <bdi dir="ltr">{date}</bdi> · {daysRemainingLabel(date) ?? ""}
          </span>
        )}
        <span className="rep-copy-chip">
          {dot(account.dishStatus)} الطبق · {dot(account.wifiStatus)} الواي فاي
        </span>
      </div>
      <div className="rep-copy-money">
        <span>
          <small>على الزبون</small>
          <strong className={Object.keys(summary.debt).length ? "report-bad" : "report-good"}>
            <Amounts values={summary.debt} />
          </strong>
        </span>
        <span>
          <small>الربح · حصتك</small>
          <strong className="report-good rep-copy-inline">
            <bdi dir="ltr">{mru(summary.confirmedMru)}</bdi> · <bdi dir="ltr">{mru(summary.repShareMru)}</bdi>
          </strong>
        </span>
      </div>
      <div className="rep-copy-actions">
        <button type="button" className="dialog-primary" onClick={onOpen}>
          ↗ فتح الحساب
        </button>
        <button type="button" className="dialog-secondary" onClick={onDetails}>
          📄 التفاصيل
        </button>
      </div>
    </li>
  );
}

function RepCopyDetails({ device, mruRate, onClose }: { device: RepCopyDevice; mruRate?: number; onClose: () => void }) {
  const summary = useMemo(() => summarizeRepDevice(device, mruRate), [device, mruRate]);
  const { account } = device;
  const operations = [...device.entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const rowById = new Map(summary.rows.map((r) => [r.entryId, r]));
  return (
    <PartySheet title={account.name} onClose={onClose}>
      <dl className="profit-detail">
        <div>
          <dt>👤 الزبون</dt>
          <dd>{device.clientName ?? "بدون زبون"}</dd>
        </div>
        {account.expectedEmail && (
          <div>
            <dt>📧 البريد</dt>
            <dd>
              <bdi dir="ltr">{account.expectedEmail}</bdi>
            </dd>
          </div>
        )}
        {account.planName && (
          <div>
            <dt>🛰️ الخطة</dt>
            <dd>{account.planName}</dd>
          </div>
        )}
        <div>
          <dt>💰 Starlink مستحق</dt>
          <dd>
            <bdi dir="ltr">
              {account.currency} {account.balanceDue || "0"}
            </bdi>
          </dd>
        </div>
        <div className="profit-detail-block profit-detail-profit">
          <dt>📈 الربح المؤكد</dt>
          <dd>
            <strong>
              <bdi dir="ltr">{mru(summary.confirmedMru)}</bdi> أوقية
            </strong>
            {summary.expectedMru !== 0 && (
              <small>
                متوقع (D) <bdi dir="ltr">≈ {mru(summary.expectedMru)}</bdi>
              </small>
            )}
          </dd>
        </div>
        <div className="profit-detail-block profit-detail-rep">
          <dt>🤝 حصتك</dt>
          <dd>
            <strong>
              <bdi dir="ltr">{mru(summary.repShareMru)}</bdi> أوقية
            </strong>
          </dd>
        </div>
      </dl>

      <h4 className="rep-copy-ops-title">العمليات</h4>
      {operations.length === 0 ? (
        <p className="party-empty">لا توجد عمليات.</p>
      ) : (
        <ul className="today-lines">
          {operations.map((entry) => {
            const row = rowById.get(entry.id);
            const isShipment = entry.kind === "debit";
            return (
              <li key={entry.id} className="today-line">
                <span className="today-line-main">
                  <strong>
                    {isShipment ? "📦 شحنة" : "💵 دفعة"} · <bdi dir="ltr">{entry.date}</bdi>
                  </strong>
                  <small>
                    {isShipment && entry.starlinkCost?.status === "pending" ? "D غير مدفوعة لـ Starlink" : ""}
                    {row ? ` الربح ${row.status === "expected" ? "≈ " : ""}${mru(row.profitMru ?? 0)}${row.rep ? ` · حصتك ${mru(row.rep.shareMru ?? 0)}` : ""}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </small>
                </span>
                <strong className={isShipment ? "report-bad" : "report-good"}>
                  <bdi dir="ltr">{formatAmount(entry.amount)}</bdi> {LEDGER_CURRENCY_LABELS[entry.currency] ?? entry.currency}
                </strong>
              </li>
            );
          })}
        </ul>
      )}
    </PartySheet>
  );
}
