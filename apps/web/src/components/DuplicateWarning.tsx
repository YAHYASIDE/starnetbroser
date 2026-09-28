"use client";

import { type DuplicateHit, duplicateLine } from "@/lib/duplicates";

/** ⚠️ Shown while typing when the email / KIT / phone / name is already registered. */
export function DuplicateWarning({ hits, onUse }: { hits: DuplicateHit[]; onUse?: (hit: DuplicateHit) => void }) {
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
