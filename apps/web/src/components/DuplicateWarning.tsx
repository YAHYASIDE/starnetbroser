"use client";

import { type DuplicateField, type DuplicateHit, duplicateLine } from "@/lib/duplicates";

/** ⚠️ Right under the field itself: this email / KIT / phone / name is already registered. */
export function FieldDuplicate({ hits, field }: { hits: DuplicateHit[]; field: DuplicateField }) {
  const owners = hits.filter((h) => h.field === field);
  if (owners.length === 0) return null;
  return (
    <span className="field-duplicate" role="alert">
      ⚠️ مسجل من قبل {owners[0]!.kind === "device" ? "على الجهاز" : "للزبون"} {owners.slice(0, 3).map((h) => `«${h.owner}»`).join("، ")}
    </span>
  );
}

/** ⚠️ Shown while typing when the email / KIT / phone / name is already registered - the fields
 * in `inline` already say so under themselves (FieldDuplicate). */
export function DuplicateWarning({ hits: allHits, onUse, inline = [] }: { hits: DuplicateHit[]; onUse?: (hit: DuplicateHit) => void; inline?: DuplicateField[] }) {
  const hits = allHits.filter((h) => !inline.includes(h.field));
  if (hits.length === 0) return null;
  return (
    <div className="duplicate-warning" role="alert">
      <strong>⚠️ قد يكون تسجيلاً مكرراً</strong>
      <ul>
        {hits.slice(0, 5).map((hit, i) => (
          <li key={`${hit.field}-${hit.owner}-${i}`}>
            {duplicateLine(hit)}
            {onUse && hit.id && (
              <button type="button" className="text-action" onClick={() => onUse(hit)}>
                اختيار «{hit.owner}»
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
