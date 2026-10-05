"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { PartySheet } from "@/components/AccountsSection";
import { askDeleteCode } from "@/components/DeleteCodePrompt";
import {
  applyClientImport,
  loadImportBatch,
  parseClientImport,
  planClientImport,
  planTotals,
  saveImportBatch,
  undoClientImport,
  type ImportBatch,
  type ImportPlan,
} from "@/lib/clientImport";
import { listClients, type ClientStore } from "@/lib/clientStore";
import { formatAmount } from "@/lib/formatAmount";
import type { InvoiceList } from "@/lib/invoiceStore";
import type { PartyAdjustmentList } from "@/lib/partyBalanceStore";

/** 📥 Clients page: many customers from a file at once (lib/clientImport.ts), with a summary
 * before anything is saved and «↩️ تراجع» for the last import. */
export function ClientImport({
  clientStore,
  adjustments,
  devices,
  invoices,
  onSaved,
}: {
  clientStore: ClientStore;
  adjustments: PartyAdjustmentList;
  devices: { clientId?: string }[];
  invoices: InvoiceList;
  onSaved: (store: ClientStore, adjustments: PartyAdjustmentList, message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  useEffect(() => setBatch(loadImportBatch()), []);

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setPlan(null);
    const parsed = parseClientImport(await file.text());
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setPlan(planClientImport(parsed.rows, listClients(clientStore)));
  }

  function runImport() {
    if (!plan || plan.toAdd.length === 0) return;
    const done = applyClientImport(clientStore, adjustments, plan.toAdd);
    saveImportBatch(done.batch);
    setBatch(done.batch);
    setOpen(false);
    setPlan(null);
    onSaved(done.store, done.adjustments, `✓ أُضيف ${plan.toAdd.length} زبونًا مع أرصدتهم بالأوقية`);
  }

  async function undoImport() {
    if (!batch || !(await askDeleteCode(`التراجع عن استيراد ${batch.clientIds.length} زبونًا؟ تُحذف أرصدتهم الافتتاحية، ويُحذف كل زبون منهم لم يُسجَّل له شيء بعدها.`))) return;
    const undone = undoClientImport(clientStore, adjustments, batch, devices, invoices);
    saveImportBatch(null);
    setBatch(null);
    onSaved(undone.store, undone.adjustments, undone.kept ? `✓ تم التراجع - بقي ${undone.kept} زبون سُجّلت لهم أشياء بعد الاستيراد` : "✓ تم التراجع عن الاستيراد");
  }

  const totals = plan ? planTotals(plan.toAdd) : null;

  return (
    <>
      <div className="client-import-row" data-tour="client-import">
        <button type="button" className="dialog-secondary" onClick={() => setOpen(true)}>
          📥 استيراد زبائن من ملف
        </button>
        {batch && (
          <button type="button" className="text-action" onClick={() => void undoImport()}>
            ↩️ تراجع عن آخر استيراد
          </button>
        )}
      </div>
      {open && (
        <PartySheet
          title="📥 استيراد زبائن"
          onClose={() => {
            setOpen(false);
            setPlan(null);
            setError(null);
          }}
        >
          <div className="party-balance-form">
            <p className="settings-hint">اختر ملف الزبائن. كل رصيد يُسجَّل بالأوقية رصيدًا افتتاحيًا بتاريخه في الملف (لم يتحرك المال). من يشبه زبونًا موجودًا يُتخطّى.</p>
            <label className="ledger-proof-pick">
              📄 اختر الملف
              <input type="file" accept=".json,.txt,.csv,application/json,text/plain" hidden onChange={(e) => void pickFile(e)} />
            </label>
            {error && <div className="account-card-alert">{error}</div>}
            {plan && totals && (
              <>
                <div className="client-import-summary">
                  <strong>يُضاف {plan.toAdd.length} زبونًا</strong>
                  <span>
                    🔴 عليهم: <bdi dir="ltr">{formatAmount(totals.owesUs)}</bdi> أوقية
                  </span>
                  <span>
                    🟢 لهم: <bdi dir="ltr">{formatAmount(totals.weOwe)}</bdi> أوقية
                  </span>
                </div>
                {plan.skipped.length > 0 && (
                  <details className="client-import-skipped">
                    <summary>⏭️ يُتخطّى {plan.skipped.length} (موجودون عندك)</summary>
                    <ul>
                      {plan.skipped.map(({ row, existing }) => (
                        <li key={`${row.name}-${row.date}`}>
                          {row.name} ← موجود: «{existing.name}»
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <details className="client-import-skipped">
                  <summary>👥 قائمة من سيُضاف</summary>
                  <ul>
                    {plan.toAdd.map((row) => (
                      <li key={`${row.name}-${row.date}`}>
                        {row.name} · {row.direction === "owesUs" ? "عليه" : "له"} <bdi dir="ltr">{formatAmount(row.amount)}</bdi> · <bdi dir="ltr">{row.date}</bdi>
                      </li>
                    ))}
                  </ul>
                </details>
                <button type="button" className="dialog-primary" disabled={plan.toAdd.length === 0} onClick={runImport}>
                  استيراد {plan.toAdd.length} زبونًا
                </button>
              </>
            )}
          </div>
        </PartySheet>
      )}
    </>
  );
}
