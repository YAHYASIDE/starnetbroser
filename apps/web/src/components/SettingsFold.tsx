"use client";

import { settingsItem, type SettingsItemId } from "@/lib/settingsGroups";

/** One setting as a single folded line (icon, title, one short line); tap opens it in place. The
 * section's own heading is hidden inside (globals.css) - the line already names it. */
export function SettingsFold({ id, children }: { id: SettingsItemId; children: React.ReactNode }) {
  const item = settingsItem(id);
  return (
    <details className="settings-fold" id={`fold-${id}`}>
      <summary className="settings-fold-summary">
        <span className="settings-fold-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="settings-fold-text">
          <strong>{item.title}</strong>
          <small>{item.summary}</small>
        </span>
        <span className="settings-fold-chevron" aria-hidden="true">
          ‹
        </span>
      </summary>
      <div className="settings-fold-body">{children}</div>
    </details>
  );
}

/** Opens (and scrolls to) a setting's line - from the search, or a link like "/settings#drive". */
export function openSettingsFold(id: string): void {
  const el = document.getElementById(id.startsWith("fold-") ? id : `fold-${id}`) ?? document.getElementById(id);
  const fold = el?.closest("details.settings-fold") as HTMLDetailsElement | null;
  if (fold) fold.open = true;
  (fold ?? el)?.scrollIntoView({ block: "start", behavior: "smooth" });
}
