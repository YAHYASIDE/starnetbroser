"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { AccountCard } from "./AccountCard";
import { allStoredAllocations, type AllocationsByAccount } from "@/lib/paymentAllocationStore";
import type { ClientStore } from "@/lib/clientStore";
import { loadCurrencyStore } from "@/lib/currencyStore";
import { homeSearchHref } from "@/lib/homeActions";
import { getAccountEntries, type LedgerByAccount } from "@/lib/ledgerStore";
import { getRepresentative, type RepresentativeStore } from "@/lib/repStore";

/**
 * 📡 A customer's device opened from his «الأجهزة» (clients page, his Oct 2026 request): the same
 * card as on the home page, right inside the customer card. What it shows and opens by itself
 * (Starlink, the mailbox, copying, WhatsApp…) works here; an action that needs the home page's
 * dialogs (edit, a payment, the statement, archive…) opens that device on the home page.
 */
export function ClientDeviceCard({
  device,
  allAccounts,
  ledgerStore,
  allocationStore,
  clientStore,
  representatives,
  onPatch,
}: {
  device: StarlinkAccountSummary;
  allAccounts: StarlinkAccountSummary[];
  ledgerStore: LedgerByAccount;
  allocationStore: AllocationsByAccount;
  clientStore: ClientStore;
  representatives: RepresentativeStore;
  onPatch?: (device: StarlinkAccountSummary, patch: Partial<StarlinkAccountSummary>) => void;
}) {
  const router = useRouter();
  const [currencyStore] = useState(loadCurrencyStore);
  const allocations = useMemo(() => allStoredAllocations(allocationStore), [allocationStore]);
  const onHome = () => router.push(homeSearchHref(device.expectedEmail?.trim() || device.name));
  const rep = getRepresentative(representatives, device.representativeId);
  return (
    <AccountCard
      account={device}
      ledgerEntries={getAccountEntries(ledgerStore, device.id)}
      allocations={allocations}
      client={device.clientId ? clientStore[device.clientId] : undefined}
      onOpenClient={() => undefined}
      repColor={rep?.color}
      currencyStore={currencyStore}
      allAccounts={allAccounts}
      onEdit={onHome}
      onLedger={onHome}
      onDeviceStatement={onHome}
      onSetDeviceFault={onHome}
      onSetRepair={onHome}
      onArchive={onHome}
      onSoftDelete={onHome}
      onRestore={onHome}
      onConfirmRenewal={onHome}
      onPatch={onPatch}
    />
  );
}
