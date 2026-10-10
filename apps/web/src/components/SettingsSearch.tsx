"use client";

import { useEffect, useMemo, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { listAccounts } from "@/lib/apiClient";
import { searchApp, type AppSearchHit } from "@/lib/appSearch";
import { listClients, loadClientStore } from "@/lib/clientStore";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { listRepresentatives, loadRepresentativeStore } from "@/lib/repStore";
import { isDemoMode } from "@/lib/settingsStore";
import type { SettingsItem } from "@/lib/settingsGroups";
import { listStoreItems, loadStoreItems } from "@/lib/storeStore";
import { listSuppliers, loadSupplierStore } from "@/lib/supplierStore";

type Sources = Parameters<typeof searchApp>[1];

const KIND_ICON: Record<string, string> = {
  page: "📄",
  device: "📡",
  client: "👤",
  supplier: "🏭",
  representative: "🤝",
  item: "📦",
};

/** 🔍 Top of الإعدادات: search anything - a setting opens its line here; anything else opens. */
export function SettingsSearch({ onOpenSetting }: { onOpenSetting: (item: SettingsItem) => void }) {
  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<Sources | null>(null);

  // The data is read the first time something is typed - the page itself stays light.
  useEffect(() => {
    if (!query.trim() || sources) return;
    const load = async () => {
      const devices: StarlinkAccountSummary[] = isDemoMode() ? loadDemoAccounts([]) : await listAccounts().catch(() => []);
      setSources({
        devices: devices
          .filter((d) => !d.deletedAt)
          .map((d) => ({
            ...d,
            kitNumber: d.kitNumber ?? "",
            serialNumber: d.serialNumber ?? "",
          })),
        clients: listClients(loadClientStore()),
        suppliers: listSuppliers(loadSupplierStore()),
        representatives: listRepresentatives(loadRepresentativeStore()),
        items: listStoreItems(loadStoreItems()),
      });
    };
    void load();
  }, [query, sources]);

  const hits = useMemo(
    () =>
      searchApp(
        query,
        sources ?? {
          devices: [],
          clients: [],
          suppliers: [],
          representatives: [],
          items: [],
        },
      ),
    [query, sources],
  );

  function open(hit: AppSearchHit) {
    if (hit.kind === "setting") {
      setQuery("");
      onOpenSetting(hit.item);
      return;
    }
    window.location.href = hit.route;
  }

  return (
    <div className="settings-search">
      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 ابحث عن أي شيء…"
        aria-label="بحث"
      />
      {query.trim() && (
        <ul className="settings-search-results">
          {hits.length === 0 && <li className="party-empty">لا نتيجة</li>}
          {hits.map((hit) => (
            <li key={hit.kind === "setting" ? `s-${hit.item.id}` : hit.kind === "page" ? `p-${hit.route}` : `${hit.kind}-${hit.id}`}>
              <button type="button" className="settings-search-hit" onClick={() => open(hit)}>
                <span aria-hidden="true">{hit.kind === "setting" ? hit.item.icon : KIND_ICON[hit.kind]}</span>
                <span className="settings-fold-text">
                  <strong>{hit.kind === "setting" ? hit.item.title : hit.kind === "page" ? hit.label : hit.title}</strong>
                  <small>{hit.kind === "setting" ? `⚙️ ${hit.item.summary}` : hit.kind === "page" ? "صفحة" : (hit.subtitle ?? "")}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
