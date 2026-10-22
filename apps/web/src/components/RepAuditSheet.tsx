"use client";

import { useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { PartySheet } from "./AccountsSection";
import { auditRep, repAuditReport } from "@/lib/repAudit";
import { loadCashEntries } from "@/lib/cashStore";
import type { LedgerByAccount } from "@/lib/ledgerStore";
import { loadRepLedgerBook } from "@/lib/repLedgers";
import { loadRepRequests } from "@/lib/repRequests";
import type { RepSettlement } from "@/lib/repStore";
import { homeSearchHref } from "@/lib/homeActions";

/**
 * 🔍 «فحص حساب المندوب» (the council's first step, his Oct 22 2026 choice): what looks wrong in one rep's
 * records - read only, nothing is changed here. Each line says what and where; «📋 نسخ التقرير» copies it
 * without any name, for him to send us.
 */
export function RepAuditSheet({
  repId,
  repName,
  settlements,
  ledgerStore,
  accounts,
  onClose,
}: {
  repId: string;
  repName: string;
  settlements: RepSettlement[];
  ledgerStore: LedgerByAccount;
  accounts: StarlinkAccountSummary[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const findings = useMemo(
    () => auditRep({ repId, repName, settlements, ledger: ledgerStore, accounts, ledgerBook: loadRepLedgerBook(), requests: loadRepRequests(), cash: loadCashEntries() }),
    [repId, repName, settlements, ledgerStore, accounts],
  );
  const errors = findings.filter((f) => f.severity === "error").length;
  const report = repAuditReport(findings, new Date().toISOString().slice(0, 10));
  const device = (id: string) => accounts.find((a) => a.id === id);

  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("انسخ التقرير:", report);
    }
  }

  return (
    <PartySheet title={`🔍 فحص حساب ${repName}`} onClose={onClose}>
      <div className="rep-audit">
        <p className={`rep-audit-summary${findings.length === 0 ? " is-clean" : errors > 0 ? " is-bad" : " is-warn"}`}>
          {findings.length === 0
            ? "✅ لا مشاكل: لا تكرار، ولا دفعة ناقصة، ولا «سعر بديل» ناقص، ولا قيد كاش يتيم، ولا جهاز خرج دينه."
            : `${errors > 0 ? `🔴 ${errors} خطأ في المبالغ` : ""}${errors > 0 && findings.length > errors ? " · " : ""}${findings.length > errors ? `🟠 ${findings.length - errors} للمراجعة` : ""}`}
        </p>
        <p className="settings-hint">الفحص يقرأ فقط ولا يغيّر شيئًا. أصلح كل سطر بيدك من كشفه (✎ / 🗑)، ثم افحص من جديد.</p>
        {findings.length > 0 && (
          <ul className="rep-audit-list">
            {findings.map((f, i) => (
              <li key={i} className={`rep-audit-item is-${f.severity}`}>
                <span aria-hidden="true">{f.severity === "error" ? "🔴" : "🟠"}</span>
                <div>
                  <p>{f.text}</p>
                  {f.accountId && (
                    <a className="text-action" href={homeSearchHref(device(f.accountId)?.expectedEmail || device(f.accountId)?.name || "")}>
                      فتح الجهاز
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="dialog-secondary" onClick={() => void copy()}>
          {copied ? "✓ نُسخ" : "📋 نسخ التقرير (بلا أسماء) لترسله"}
        </button>
      </div>
    </PartySheet>
  );
}
