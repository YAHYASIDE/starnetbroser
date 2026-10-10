/**
 * 🕒 Customers ordered by their latest activity (his Oct 2026 request: «اجعل ترتيب الزبناء آخر
 * عملية أو تعديل لزبون يكون هو الزبون الفوقاني»): the newest of - the customer record changed, an
 * operation on one of his devices, a store invoice, a manual balance entry. Pure.
 */

type Stamped = { createdAt?: string; date?: string; updatedAt?: string };

const later = (a: string, b: string | undefined) => (b && b > a ? b : a);

/** The newest moment among records (createdAt / updatedAt, else the record's day). */
export function latestStamp(records: Iterable<Stamped>): string {
  let best = "";
  for (const r of records) {
    best = later(best, r.updatedAt);
    best = later(best, r.createdAt);
    if (!r.createdAt && !r.updatedAt) best = later(best, r.date);
  }
  return best;
}

export interface ClientActivityInput {
  client: Stamped;
  /** Every ledger entry on his devices. */
  entries: Stamped[];
  invoices: Stamped[];
  adjustments: Stamped[];
}

export function clientLastActivity(input: ClientActivityInput): string {
  return latestStamp([input.client, ...input.entries, ...input.invoices, ...input.adjustments]);
}

/** Newest first; ties (no activity at all) by name. */
export function byLastActivity<T extends { activity: string; name: string }>(a: T, b: T): number {
  if (a.activity !== b.activity) return a.activity > b.activity ? -1 : 1;
  return a.name.localeCompare(b.name, "ar");
}
