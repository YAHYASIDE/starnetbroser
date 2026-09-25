"use client";

import type { BalanceFormInput } from "@/components/AccountsSection";
import { saveClientDevicePayment } from "@/lib/clientDevicePaymentSave";
import { useEffect, useMemo, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
import { loadCashEntries, postPartyAdjustmentToCash, removeLinkedCashEntries, saveCashEntries } from "@/lib/cashStore";
import {
  Client,
  ClientStore,
  createClient,
  CreateClientInput,
  getClient,
  listClients,
  loadClientStore,
  saveClientStore,
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
import { LedgerByAccount, loadLedgerStore } from "@/lib/ledgerStore";
import { AllocationsByAccount, loadAllocationStore } from "@/lib/paymentAllocationStore";
import { demoAccounts } from "@/lib/demoData";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
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
import { ClientDialog } from "@/components/ClientDialog";

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

  useEffect(() => {
    setClientStore(loadClientStore());
    setSupplierStore(loadSupplierStore());
    setInvoices(loadInvoices());
    setLedgerStore(loadLedgerStore());
    setAllocationStore(loadAllocationStore());
    setPartyAdjustments(loadPartyAdjustments());
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const clients = useMemo(() => listClients(clientStore), [clientStore]);
  const suppliers = useMemo(() => listSuppliers(supplierStore), [supplierStore]);
  const openClient = getClient(clientStore, openClientId ?? undefined);

  function handleCreateClient(input: CreateClientInput) {
    const next = createClient(clientStore, input).store;
    setClientStore(next);
    saveClientStore(next);
  }

  function handleUpdateClient(clientId: string, input: CreateClientInput) {
    const next = updateClient(clientStore, clientId, input);
    setClientStore(next);
    saveClientStore(next);
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

  function handleAddAdjustment(input: RecordPartyAdjustmentInput): string | null {
    const result = recordPartyAdjustment(partyAdjustments, input);
    if (!result.ok) return result.message;
    setPartyAdjustments(result.list);
    savePartyAdjustments(result.list);
    if (result.adjustment.cashMoved) {
      const partyName =
        (input.partyKind === "client" ? clientStore[input.partyId]?.name : supplierStore[input.partyId]?.name) ?? "";
      const cash = postPartyAdjustmentToCash(loadCashEntries(), result.adjustment, partyName);
      saveCashEntries(cash);
    }
    return null;
  }

  /** Edits a balance entry; its linked cash entry (if any) is replaced to match. */
  function handleUpdateAdjustment(adjustmentId: string, input: Omit<BalanceFormInput, "deviceId">): string | null {
    const result = updatePartyAdjustment(partyAdjustments, adjustmentId, input);
    if (!result.ok) return result.message;
    setPartyAdjustments(result.list);
    savePartyAdjustments(result.list);
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
    return null;
  }

  function handleDeleteAdjustment(adjustmentId: string) {
    const next = deletePartyAdjustment(partyAdjustments, adjustmentId);
    setPartyAdjustments(next);
    savePartyAdjustments(next);
    const cash = removeLinkedCashEntries(loadCashEntries(), adjustmentId);
    saveCashEntries(cash);
  }

  return (
    <main className="home">
      <h1 className="section-title">الزبائن والموردون</h1>
      <section className="section">
        <PartyDirectory
          clients={clients}
          suppliers={suppliers}
          invoices={invoices}
          accounts={accounts}
          ledgerStore={ledgerStore}
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
          onLedgerChange={setLedgerStore}
        />
      )}
    </main>
  );
}
