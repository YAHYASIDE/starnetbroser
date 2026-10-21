"use client";

import type { ReactNode } from "react";
import { NotificationsBell } from "../NotificationsBell";

/** 🖥️ The top of a page on the Windows app: its name, the search, the bell and its main action. */
export function DeskTopBar({
  title,
  subtitle,
  search,
  onSearch,
  searchPlaceholder = "ابحث: جهاز، Kit، بريد، زبون، هاتف، مندوب…",
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  action?: ReactNode;
}) {
  return (
    <header className="desk-topbar">
      <div className="desk-topbar-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {onSearch && (
        <label className="desk-search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            type="search"
            value={search ?? ""}
            placeholder={searchPlaceholder}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="بحث"
            onKeyDown={(e) => {
              if (e.key === "Escape" && search) {
                e.preventDefault();
                onSearch("");
              }
            }}
          />
          <kbd className="desk-kbd" aria-hidden="true">
            Ctrl K
          </kbd>
        </label>
      )}
      <div className="desk-topbar-actions">
        <NotificationsBell />
        {action}
      </div>
    </header>
  );
}
