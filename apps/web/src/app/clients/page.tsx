"use client";

import { useEffect, useMemo, useState } from "react";
import { StarlinkAccountSummary } from "@starnet/shared";
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
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  useEffect(() => {
    setClientStore(loadClientStore());
    setSupplierStore(loadSupplierStore());
    setInvoices(loadInvoices());
    setLedgerStore(loadLedgerStore());
    setAllocationStore(loadAllocationStore());
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
        />
      )}
    </main>
  );
}
