"use client";

import { useMemo, useState } from "react";
import { featureSections, permissionChanges, permissionsOf, REP_FEATURES } from "@/lib/repPermissions";
import type { Representative } from "@/lib/repStore";

/**
 * 🔑 Before a rep's copy goes out (his Oct 17 2026 ask): the features his phone will open, each
 * with a tick - what he has now ticked, the rest not until the operator ticks it - grouped and
 * sorted, with a search over every feature.
 */
export function RepPermissionsSheet({
  rep,
  deviceCount,
  busy,
  onSend,
  onClose,
}: {
  rep: Representative;
  deviceCount: number;
  busy: boolean;
  onSend: (permissions: string[]) => void;
  onClose: () => void;
}) {
  const before = useMemo(() => permissionsOf(rep), [rep]);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(before));
  const [query, setQuery] = useState("");
  const sections = useMemo(() => featureSections(query), [query]);
  const changes = permissionChanges(before, chosen);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="party-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="party-sheet rep-perms-sheet" role="dialog" aria-modal="true" aria-label={`صلاحيات ${rep.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="party-sheet-head">
          <strong>🔑 صلاحيات {rep.name}</strong>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </div>
        <p className="sync-choice-hint">
          ✓ = ما يفتحه في تطبيقه. المعلَّم الآن هو ما عنده اليوم - علّم ما تريد إضافته ثم أرسل. ({chosen.size} من {REP_FEATURES.length})
        </p>
        <input
          className="search-input"
          type="search"
          placeholder="🔍 ابحث عن أي ميزة…"
          aria-label="ابحث عن ميزة"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="rep-perms-list">
          {sections.length === 0 && <p className="sync-choice-hint">لا ميزة بهذا الاسم.</p>}
          {sections.map((section) => (
            <section key={section.id} className="rep-perms-group">
              <h3 className="rep-perms-title">{section.title}</h3>
              {section.features.map((feature) => {
                const on = chosen.has(feature.id) || Boolean(feature.locked);
                return (
                  <label key={feature.id} className={`rep-perms-row${on ? " is-on" : ""}${feature.locked ? " is-locked" : ""}`}>
                    <input type="checkbox" checked={on} disabled={feature.locked} onChange={() => toggle(feature.id)} />
                    <span className="rep-perms-icon" aria-hidden="true">{feature.icon}</span>
                    <span className="rep-perms-text">
                      <strong>{feature.label}</strong>
                      <small>{feature.locked ? `${feature.hint} · دائمًا` : feature.hint}</small>
                    </span>
                  </label>
                );
              })}
            </section>
          ))}
        </div>
        {(changes.added.length > 0 || changes.removed.length > 0) && (
          <p className="sync-choice-hint">
            {changes.added.length > 0 && <>➕ يضاف: {changes.added.join("، ")}. </>}
            {changes.removed.length > 0 && <>➖ يُزال: {changes.removed.join("، ")}.</>}
          </p>
        )}
        <button type="button" className="dialog-primary" disabled={busy} onClick={() => onSend([...chosen])}>
          {busy ? "⏳ جارِ التجهيز…" : `📤 أرسل نسخته بهذه الصلاحيات (${deviceCount} جهاز)`}
        </button>
      </div>
    </div>
  );
}
