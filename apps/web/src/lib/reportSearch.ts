/**
 * 🔎 «ابحث عن أي شيء في STAR NET...» on the reports page (his Oct 9 2026 request): one box that finds
 * a report section, a device (name, email, KIT, SN, IDs), a customer, a rep, a supplier, a product,
 * a payment (amount, method, note) or an expense (category, note) - grouped by kind, a few of each.
 * A hit only opens the right place (a section, a tab, the home device search…); it never changes or
 * records anything. Searches the phone's own data in memory (nothing is downloaded). Pure.
 */

import type { StarlinkAccountSummary } from "@starnet/shared";
import type { CashEntryList } from "./cashStore";
import { deviceMatchesQuery, matches, normalizeSearchText } from "./homeInsights";
import { formatAmount } from "./formatAmount";
import { homeSearchHref } from "./homeActions";
import { LEDGER_CURRENCY_LABELS, PAYMENT_METHOD_LABELS, type LedgerByAccount } from "./ledgerStore";

export type ReportHitKind = "section" | "device" | "client" | "rep" | "supplier" | "item" | "payment" | "expense";

export const REPORT_HIT_LABELS: Record<ReportHitKind, { icon: string; label: string }> = {
  section: { icon: "📊", label: "قسم" },
  device: { icon: "📡", label: "جهاز" },
  client: { icon: "👤", label: "زبون" },
  rep: { icon: "🤝", label: "مندوب" },
  supplier: { icon: "🏭", label: "مورد" },
  item: { icon: "📦", label: "منتج" },
  payment: { icon: "💵", label: "دفعة" },
  expense: { icon: "🧾", label: "مصروف" },
};

export interface ReportHit {
  kind: ReportHitKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Another page to open. */
  href?: string;
  /** A place on this page: a dashboard section id or a reports tab. */
  section?: string;
  tab?: string;
}

export interface ReportSection {
  id: string;
  title: string;
  /** Extra words that find it («ربح», «ديون»…). */
  keywords?: string;
  tab?: string;
}

export interface ReportSearchSources {
  sections: ReportSection[];
  accounts: StarlinkAccountSummary[];
  clients: { id: string; name: string; phone?: string }[];
  reps: { id: string; name: string; phone?: string }[];
  suppliers: { id: string; name: string; phone?: string }[];
  items: { id: string; name: string; code?: string }[];
  ledger: LedgerByAccount;
  cash: CashEntryList;
}

function currencyLabel(code: string): string {
  return (LEDGER_CURRENCY_LABELS as Record<string, string>)[code] ?? code;
}

/** "15000" / "15,000" / "15 000" all find 15,000. */
function amountMatches(query: string, amount: number): boolean {
  const digits = query.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(digits)) return false;
  return String(amount) === digits || String(Math.round(amount)) === digits;
}

export function searchReports(query: string, sources: ReportSearchSources, limit = 5): ReportHit[] {
  if (!normalizeSearchText(query)) return [];
  const hits: ReportHit[] = [];
  const push = (list: ReportHit[]) => hits.push(...list.slice(0, limit));

  push(
    sources.sections
      .filter((s) => matches(query, s.title, s.keywords))
      .map((s) => ({ kind: "section" as const, id: s.id, title: s.title, ...(s.tab ? { tab: s.tab } : { section: s.id }) })),
  );
  const clientName = (id?: string) => sources.clients.find((c) => c.id === id)?.name;
  push(
    sources.accounts
      .filter((a) => !a.deletedAt && deviceMatchesQuery(query, a, { name: clientName(a.clientId) ?? "", phone: sources.clients.find((c) => c.id === a.clientId)?.phone }))
      .map((a) => ({ kind: "device" as const, id: a.id, title: a.name, subtitle: a.expectedEmail || a.starlinkAccountEmail || a.kitNumber || undefined, href: homeSearchHref(a.name) })),
  );
  push(sources.clients.filter((c) => matches(query, c.name, c.phone)).map((c) => ({ kind: "client" as const, id: c.id, title: c.name, subtitle: c.phone, href: homeSearchHref(c.name) })));
  push(sources.reps.filter((r) => matches(query, r.name, r.phone)).map((r) => ({ kind: "rep" as const, id: r.id, title: r.name, subtitle: r.phone, href: "/representatives" })));
  push(sources.suppliers.filter((s) => matches(query, s.name, s.phone)).map((s) => ({ kind: "supplier" as const, id: s.id, title: s.name, subtitle: s.phone, href: "/clients" })));
  push(sources.items.filter((i) => matches(query, i.name, i.code)).map((i) => ({ kind: "item" as const, id: i.id, title: i.name, subtitle: i.code, href: "/store" })));

  const deviceName = (id: string) => sources.accounts.find((a) => a.id === id)?.name ?? "جهاز";
  const payments: ReportHit[] = [];
  for (const [accountId, entries] of Object.entries(sources.ledger)) {
    for (const e of entries) {
      if (e.kind !== "credit") continue;
      const method = e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod] : undefined;
      if (!amountMatches(query, e.amount) && !matches(query, e.note, method)) continue;
      payments.push({
        kind: "payment",
        id: e.id,
        title: `${formatAmount(e.amount)} ${currencyLabel(e.currency)} · ${deviceName(accountId)}`,
        subtitle: [e.date, method, e.note].filter(Boolean).join(" · "),
        href: homeSearchHref(deviceName(accountId)),
      });
    }
  }
  push(payments.sort((a, b) => (b.subtitle ?? "").localeCompare(a.subtitle ?? "")));

  push(
    sources.cash
      .filter((c) => c.kind === "out" && !c.sourceKind && (amountMatches(query, c.amount) || matches(query, c.category, c.note)))
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((c) => ({
        kind: "expense" as const,
        id: c.id,
        title: `${formatAmount(c.amount)} ${currencyLabel(c.currencyCode)} · ${c.category?.trim() || "بدون تصنيف"}`,
        subtitle: [c.date, c.note].filter(Boolean).join(" · "),
        tab: "net",
      })),
  );
  return hits;
}
