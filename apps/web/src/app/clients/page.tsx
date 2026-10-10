"use client";

import { methodLabel } from "@/lib/payCurrency";
import { askDeleteCode } from "@/components/DeleteCodePrompt";
import { ClientImport } from "@/components/ClientImport";
import { LIVE_SYNC_EVENT } from "@/lib/liveSync";
import { useRouter } from "next/navigation";
import { PaymentPickerSheet } from "@/components/HomeFab";
import { homePaymentHref } from "@/lib/homeActions";
import type { BalanceFormInput } from "@/components/AccountsSection";
import { saveClientDevicePayment } from "@/lib/clientDevicePaymentSave";
import { useEffect, useMemo, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { loadCashEntries, postPartyAdjustmentToCash, removeLinkedCashEntries, saveCashEntries } from "@/lib/cashStore";
import { deleteProof, putProof } from "@/lib/paymentProofStore";
import {
  Client,
  ClientStore,
  createClient,
  CreateClientInput,
  deleteClient,
  getClient,
  listClients,
  loadClientStore,
  commitClientStore,
  updateClient,
} from "@/lib/clientStore";
import {
  createSupplier,
  CreateSupplierInput,
  listSuppliers,
  loadSupplierStore,
  saveSupplierStore,
  SupplierStore,
  updateSupplier,
} from "@/lib/supplierStore";
import { InvoiceList, loadInvoices } from "@/lib/invoiceStore";
import { computeBalanceByCurrency, LedgerByAccount, LedgerCurrency, type LedgerEntry, loadLedgerStore } from "@/lib/ledgerStore";
import { AllocationsByAccount, loadAllocationStore } from "@/lib/paymentAllocationStore";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { commitDemoAccounts, loadDemoAccounts } from "@/lib/demoAccountStore";
import { loadRepresentativeStore, RepresentativeStore } from "@/lib/repStore";
import { listAccounts } from "@/lib/apiClient";
import {
  deletePartyAdjustment,
  loadPartyAdjustments,
  PartyAdjustmentList,
  RecordPartyAdjustmentInput,
  recordPartyAdjustment,
  updatePartyAdjustment,
  savePartyAdjustments,
} from "@/lib/partyBalanceStore";
import { PartyDirectory } from "@/components/AccountsSection";
import { ClientDeviceCard } from "@/components/ClientDeviceCard";
import { hiddenRepIds, visibleClients } from "@/lib/repSeparation";
import { confirmAndDeleteLedgerEntry, LedgerEntryEditor } from "@/components/LedgerEntryEditor";
import { moveClientToOwner, ourDebtLedgerForClients } from "@/lib/repClients";
import { notifyPaymentTelegram } from "@/lib/telegram";
import { ClientDialog } from "@/components/ClientDialog";
import { computeClientCombinedTotals } from "@/lib/clientAccount";
import {
  clearClientsProfitFresh,
  type ClientProfitResets,
  loadClientProfitResets,
  saveClientProfitResets,
  startClientsProfitFresh,
  zeroingAdjustments,
} from "@/lib/clientBulk";

/** "الزبائن" bottom-nav tab: every client and supplier as colour-coded cards (PartyDirectory), with
 * each client's full per-device card (ClientDialog) one tap away. */
export default function ClientsPage() {
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [supplierStore, setSupplierStore] = useState<SupplierStore>({});
  const [invoices, setInvoices] = useState<InvoiceList>([]);
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  const [allocationStore, setAllocationStore] = useState<AllocationsByAccount>({});
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [partyAdjustments, setPartyAdjustments] = useState<PartyAdjustmentList>([]);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [representatives, setRepresentatives] = useState<RepresentativeStore>({});
  const [picking, setPicking] = useState(false);
  const [profitResets, setProfitResets] = useState<ClientProfitResets>({});
  // ✎ A device operation opened for editing from a customer's statement (same dialog as the device's).
  const [editingEntry, setEditingEntry] = useState<{ accountId: string; entry: LedgerEntry; deviceName: string; ledger: LedgerByAccount } | null>(null);
  const router = useRouter();

  // ☁️ The live link brought a rep's customer / device link (lib/liveSync.ts).
  useEffect(() => {
    const reload = () => {
      setClientStore(loadClientStore());
      if (isDemoMode()) setAccounts(loadDemoAccounts(demoAccounts));
    };
    window.addEventListener(LIVE_SYNC_EVENT, reload);
    return () => window.removeEventListener(LIVE_SYNC_EVENT, reload);
  }, []);

  useEffect(() => {
    setClientStore(loadClientStore());
    setSupplierStore(loadSupplierStore());
    setInvoices(loadInvoices());
    setLedgerStore(loadLedgerStore());
    setAllocationStore(loadAllocationStore());
    setPartyAdjustments(loadPartyAdjustments());
    setRepresentatives(loadRepresentativeStore());
    setProfitResets(loadClientProfitResets());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  // 🔒 A rep with «زبائنه عنده فقط» keeps his customers to himself (repSeparation.ts).
  const hiddenReps = useMemo(() => hiddenRepIds(representatives), [representatives]);
  const clients = useMemo(() => visibleClients(listClients(clientStore), hiddenReps), [clientStore, hiddenReps]);
  // A representative's customers owe HIM (repClients.ts) - their debt to us here is only their own.
  const debtLedger = useMemo(() => ourDebtLedgerForClients(ledgerStore, accounts, clients), [ledgerStore, accounts, clients]);
  const suppliers = useMemo(() => listSuppliers(supplierStore), [supplierStore]);
  const openClient = getClient(clientStore, openClientId ?? undefined);

  function handleCreateClient(input: CreateClientInput) {
    setClientStore(commitClientStore(clientStore, createClient(clientStore, input).store));
  }

  function handleUpdateClient(clientId: string, input: CreateClientInput) {
    setClientStore(commitClientStore(clientStore, updateClient(clientStore, clientId, input)));
  }

  /** Removes the client record only: their devices are unlinked (kept, with every operation), and
   * invoices / balance entries stay as history. */
  // "زبون مَن؟": the whole customer moves to a rep (or back to us), his devices with him.
  function handleMoveClientRep(clientId: string, repId: string | undefined, carry: boolean) {
    const client = clientStore[clientId];
    if (!client) return;
    setClientStore(commitClientStore(clientStore, { ...clientStore, [clientId]: moveClientToOwner(client, repId, carry, new Date().toISOString()) }));
    const nextAccounts = accounts.map((a) => (a.clientId === clientId && !a.deletedAt ? { ...a, representativeId: repId } : a));
    setAccounts(isDemoMode() ? commitDemoAccounts(accounts, nextAccounts, "client-move") : nextAccounts);
  }

  function handleDeleteClient(clientId: string) {
    if (accounts.some((a) => a.clientId === clientId)) {
      const nextAccounts = accounts.map((a) => (a.clientId === clientId ? { ...a, clientId: undefined } : a));
      setAccounts(isDemoMode() ? commitDemoAccounts(accounts, nextAccounts, "client-delete", { unlink: true }) : nextAccounts);
    }
    setClientStore(commitClientStore(clientStore, deleteClient(clientStore, clientId)));
    setOpenClientId(null);
  }

  // ---- 👥 bulk actions (☑️ تحديد) - each asks first ----

  const names = (ids: string[]) => {
    const list = ids.map((id) => clientStore[id]?.name ?? "").filter(Boolean);
    return list.length <= 5 ? list.join("، ") : `${list.slice(0, 5).join("، ")} و${list.length - 5} آخرين`;
  };

  async function handleBulkDelete(ids: string[]) {
    if (!(await askDeleteCode(`حذف ${ids.length} زبون؟\n${names(ids)}\nأجهزتهم تبقى بكل عملياتها وتصبح «الزبون غير محدد».`))) return;
    const gone = new Set(ids);
    if (accounts.some((a) => a.clientId && gone.has(a.clientId))) {
      const nextAccounts = accounts.map((a) => (a.clientId && gone.has(a.clientId) ? { ...a, clientId: undefined } : a));
      setAccounts(isDemoMode() ? commitDemoAccounts(accounts, nextAccounts, "client-delete", { unlink: true }) : nextAccounts);
    }
    let next = clientStore;
    for (const id of ids) next = deleteClient(next, id);
    setClientStore(commitClientStore(clientStore, next));
    setOpenClientId(null);
  }

  /** «تصفير الحساب»: one balance entry per currency brings each chosen client's total to 0 (no
   * cash moves; deleting the entry from his statement undoes it). */
  function handleBulkZero(ids: string[]) {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const inputs = ids.flatMap((id) => {
      const totals = computeClientCombinedTotals(invoices, partyAdjustments, id, accounts.filter((a) => a.clientId === id), debtLedger);
      return zeroingAdjustments(id, Object.fromEntries(Object.entries(totals).map(([c, t]) => [c, t.remaining])), date);
    });
    if (!inputs.length) {
      window.alert("حسابات الزبائن المحددين صفر أصلاً");
      return;
    }
    const zeroed = new Set(inputs.map((i) => i.partyId)).size;
    if (!window.confirm(`تصفير حساب ${zeroed} زبون؟\n${names([...new Set(inputs.map((i) => i.partyId))])}\nيُضاف قيد «تصفير الحساب» يجعل الرصيد 0، والسجل القديم يبقى. لا يتحرك الكاش.`)) return;
    let list = partyAdjustments;
    for (const input of inputs) {
      const result = recordPartyAdjustment(list, input);
      if (result.ok) list = result.list;
    }
    setPartyAdjustments(list);
    savePartyAdjustments(list);
  }

  /** «📈 الأرباح من 0»: the reports count only these clients' profit from today on. */
  async function handleBulkProfitFresh(ids: string[]) {
    if (!(await askDeleteCode(`بدء أرباح ${ids.length} زبون من 0 اليوم؟\n${names(ids)}\nالتقارير تحسب أرباح أجهزتهم من اليوم فقط. لا يُحذف شيء، و«↩️ إرجاع الأرباح» يعيدها.`))) return;
    const next = startClientsProfitFresh(profitResets, ids);
    saveClientProfitResets(next);
    setProfitResets(next);
  }

  async function handleBulkProfitClear(ids: string[]) {
    const withReset = ids.filter((id) => profitResets[id]);
    if (!withReset.length) {
      window.alert("لا أحد من المحددين بدأت أرباحه من 0");
      return;
    }
    if (!(await askDeleteCode(`إرجاع الأرباح القديمة لـ ${withReset.length} زبون؟\n${names(withReset)}`))) return;
    const next = clearClientsProfitFresh(profitResets, withReset);
    saveClientProfitResets(next);
    setProfitResets(next);
  }

  function handleCreateSupplier(input: CreateSupplierInput) {
    const next = createSupplier(supplierStore, input).store;
    setSupplierStore(next);
    saveSupplierStore(next);
  }

  function handleUpdateSupplier(supplierId: string, input: CreateSupplierInput) {
    const next = updateSupplier(supplierStore, supplierId, input);
    setSupplierStore(next);
    saveSupplierStore(next);
  }

  function handleAddAdjustment(input: RecordPartyAdjustmentInput, proofDataUrl?: string): string | null {
    const result = recordPartyAdjustment(partyAdjustments, input);
    if (!result.ok) return result.message;
    setPartyAdjustments(result.list);
    savePartyAdjustments(result.list);
    if (proofDataUrl) void putProof(result.adjustment.id, proofDataUrl);
    if (input.partyKind === "client" && input.direction === "weOwe") {
      // A client paying into their general (store) account.
      notifyPaymentTelegram({
        deviceName: "حساب المتجر",
        clientName: clientStore[input.partyId]?.name,
        amount: input.amount,
        currency: input.currencyCode,
        date: input.date,
      });
    }
    if (result.adjustment.cashMoved) {
      const partyName =
        (input.partyKind === "client" ? clientStore[input.partyId]?.name : supplierStore[input.partyId]?.name) ?? "";
      const cash = postPartyAdjustmentToCash(loadCashEntries(), result.adjustment, partyName);
      saveCashEntries(cash);
    }
    return null;
  }

  /** Edits a balance entry; its linked cash entry (if any) is replaced to match. */
  function handleUpdateAdjustment(adjustmentId: string, input: Omit<BalanceFormInput, "deviceId">, proofDataUrl?: string): string | null {
    const result = updatePartyAdjustment(partyAdjustments, adjustmentId, input);
    if (!result.ok) return result.message;
    setPartyAdjustments(result.list);
    savePartyAdjustments(result.list);
    if (proofDataUrl) void putProof(adjustmentId, proofDataUrl);
    const party = result.adjustment.partyKind === "client" ? clientStore[result.adjustment.partyId] : supplierStore[result.adjustment.partyId];
    const cash = postPartyAdjustmentToCash(removeLinkedCashEntries(loadCashEntries(), adjustmentId), result.adjustment, party?.name ?? "");
    saveCashEntries(cash);
    return null;
  }

  /** Turns a general "له" entry into a payment on one of the client's devices. */
  function handleMoveAdjustmentToDevice(adjustmentId: string, deviceId: string, input: Omit<BalanceFormInput, "deviceId">): string | null {
    const device = accounts.find((a) => a.id === deviceId);
    if (!device) return "الجهاز غير موجود";
    if (input.direction !== "weOwe") return "يمكن نقل الدفعات (له) فقط إلى جهاز";
    const original = partyAdjustments.find((a) => a.id === adjustmentId);
    // The general entry's own cash posting goes first - the device payment re-posts it if cash.
    saveCashEntries(removeLinkedCashEntries(loadCashEntries(), adjustmentId));
    const result = saveClientDevicePayment(
      ledgerStore,
      { id: device.id, name: device.name, email: device.expectedEmail || device.starlinkAccountEmail || undefined },
      input,
    );
    if (!result.ok) {
      // Put the removed cash entry back so nothing changed.
      if (original) saveCashEntries(postPartyAdjustmentToCash(loadCashEntries(), original, clientStore[original.partyId]?.name ?? ""));
      return result.message;
    }
    setLedgerStore(result.ledgerStore);
    const next = deletePartyAdjustment(partyAdjustments, adjustmentId);
    setPartyAdjustments(next);
    savePartyAdjustments(next);
    return null;
  }

  /** "الدفعة عن جهاز" from a client card - recorded in that device's own ledger. */
  function handleAddDevicePayment(deviceId: string, input: Omit<BalanceFormInput, "deviceId">): string | null {
    const device = accounts.find((a) => a.id === deviceId);
    if (!device) return "الجهاز غير موجود";
    const result = saveClientDevicePayment(
      ledgerStore,
      { id: device.id, name: device.name, email: device.expectedEmail || device.starlinkAccountEmail || undefined },
      input,
    );
    if (!result.ok) return result.message;
    setLedgerStore(result.ledgerStore);
    notifyPaymentTelegram({
      deviceName: device.name,
      clientName: device.clientId ? clientStore[device.clientId]?.name : undefined,
      amount: input.amount,
      currency: input.currencyCode,
      method: input.paymentMethod ? methodLabel(input.paymentMethod, input.currencyCode, input.amount) : undefined,
      balanceAfter: computeBalanceByCurrency(result.ledgerStore[device.id] ?? [])[input.currencyCode as LedgerCurrency] ?? 0,
      date: input.date,
      representativeId: device.representativeId,
    });
    return null;
  }

  function handleDeleteAdjustment(adjustmentId: string) {
    const next = deletePartyAdjustment(partyAdjustments, adjustmentId);
    setPartyAdjustments(next);
    savePartyAdjustments(next);
    const cash = removeLinkedCashEntries(loadCashEntries(), adjustmentId);
    saveCashEntries(cash);
    void deleteProof(adjustmentId);
  }

  return (
    <main className="home">
      <div className="clients-title-row">
        <h1 className="section-title">الزبائن والموردون</h1>
        <button type="button" className="clients-pay-button" onClick={() => setPicking(true)}>
          💵 دفعة من زبون
        </button>
      </div>
      <ClientImport
        clientStore={clientStore}
        adjustments={partyAdjustments}
        devices={accounts}
        invoices={invoices}
        onSaved={(store, adjustments, message) => {
          setClientStore(commitClientStore(clientStore, store));
          setPartyAdjustments(adjustments);
          savePartyAdjustments(adjustments);
          window.alert(message);
        }}
      />
      {picking && (
        <PaymentPickerSheet
          accounts={accounts.filter((a) => !a.deletedAt)}
          clientStore={clientStore}
          ledgerStore={ledgerStore}
          onPick={(account) => {
            setPicking(false);
            router.push(homePaymentHref(account.id));
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {editingEntry && (
        <LedgerEntryEditor
          accountId={editingEntry.accountId}
          entry={editingEntry.entry}
          deviceName={editingEntry.deviceName}
          ledgerStore={editingEntry.ledger}
          onSaved={(next) => {
            setLedgerStore(next);
            setAllocationStore(loadAllocationStore());
          }}
          onClose={() => setEditingEntry(null)}
        />
      )}
      <section className="section">
        <PartyDirectory
          clients={clients}
          suppliers={suppliers}
          invoices={invoices}
          accounts={accounts}
          ledgerStore={debtLedger}
          adjustments={partyAdjustments}
          onAddAdjustment={handleAddAdjustment}
          onDeleteAdjustment={handleDeleteAdjustment}
          onAddDevicePayment={handleAddDevicePayment}
          onUpdateAdjustment={handleUpdateAdjustment}
          onMoveAdjustmentToDevice={handleMoveAdjustmentToDevice}
          onCreateClient={handleCreateClient}
          onUpdateClient={handleUpdateClient}
          onCreateSupplier={handleCreateSupplier}
          onUpdateSupplier={handleUpdateSupplier}
          onOpenClientCard={(client: Client) => setOpenClientId(client.id)}
          onDeleteClient={handleDeleteClient}
          representatives={representatives}
          onEditDeviceEntry={(entryId) => {
            const full = loadLedgerStore();
            const accountId = Object.keys(full).find((id) => (full[id] ?? []).some((e) => e.id === entryId));
            const entry = accountId ? full[accountId]!.find((e) => e.id === entryId) : undefined;
            if (accountId && entry) setEditingEntry({ accountId, entry, deviceName: accounts.find((a) => a.id === accountId)?.name ?? "", ledger: full });
          }}
          onDeleteDeviceEntry={(entryId) => {
            // The full ledger (not the debt view above): find the device holding this operation.
            const full = loadLedgerStore();
            const accountId = Object.keys(full).find((id) => (full[id] ?? []).some((e) => e.id === entryId));
            const entry = accountId ? full[accountId]!.find((e) => e.id === entryId) : undefined;
            if (!accountId || !entry) return false;
            const deviceName = accounts.find((a) => a.id === accountId)?.name ?? "";
            const result = confirmAndDeleteLedgerEntry(full, accountId, entry, deviceName);
            if (!result) return false;
            setLedgerStore(result.ledgerStore);
            setAllocationStore(result.allocations);
            return true;
          }}
          renderDevice={(device) => (
            <ClientDeviceCard
              device={device}
              allAccounts={accounts}
              ledgerStore={ledgerStore}
              allocationStore={allocationStore}
              clientStore={clientStore}
              representatives={representatives}
              onPatch={
                isDemoMode()
                  ? (target, patch) => {
                      const next = accounts.map((a) => (a.id === target.id ? { ...a, ...patch } : a));
                      setAccounts(commitDemoAccounts(accounts, next, "patch", { unlink: "clientId" in patch }));
                    }
                  : undefined
              }
            />
          )}
          bulk={{
            onDelete: handleBulkDelete,
            onZero: handleBulkZero,
            onProfitFresh: handleBulkProfitFresh,
            onProfitClear: handleBulkProfitClear,
            profitFreshIds: new Set(Object.keys(profitResets)),
          }}
        />
      </section>

      {openClient && (
        <ClientDialog
          key={openClient.id}
          client={openClient}
          devices={accounts.filter((account) => account.clientId === openClient.id)}
          ledgerStore={ledgerStore}
          allocationStore={allocationStore}
          onClose={() => setOpenClientId(null)}
          onSave={(patch) => handleUpdateClient(openClient.id, { ...patch, creditLimit: openClient.creditLimit })}
          onDelete={() => handleDeleteClient(openClient.id)}
          onZero={() => handleBulkZero([openClient.id])}
          onLedgerChange={setLedgerStore}
          representatives={Object.values(representatives).map((r) => ({ id: r.id, name: r.name }))}
          onMoveRep={(repId, carry) => handleMoveClientRep(openClient.id, repId, carry)}
        />
      )}
    </main>
  );
}
