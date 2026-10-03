"use client";

import { useEffect, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { listAccounts } from "@/lib/apiClient";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { normalizeSearchText } from "@/lib/homeInsights";
import { isDemoMode } from "@/lib/settingsStore";
import { settingsItem } from "@/lib/settingsGroups";
import { usedPasswords, type UsedPassword } from "@/lib/usedPasswords";
import { PartySheet } from "./AccountsSection";

/** 🔑 Every password on the devices, most used first (usedPasswords.ts): one line in الإعدادات
 * («كلمات المرور (12)») that opens a sheet - search, one small row each with copy, its devices on tap. */
export function UsedPasswordsSection() {
  const [rows, setRows] = useState<UsedPassword[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const item = settingsItem("passwords");

  useEffect(() => {
    const load = async () => {
      const accounts: StarlinkAccountSummary[] = isDemoMode() ? loadDemoAccounts([]) : await listAccounts().catch(() => []);
      setRows(usedPasswords(accounts));
    };
    void load();
  }, []);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setTimeout(() => setCopied((c) => (c === value ? null : c)), 1500);
    } catch {
      setCopied(null);
    }
  }

  const q = normalizeSearchText(query);
  const visible = q ? rows.filter((r) => normalizeSearchText(r.value).includes(q) || r.devices.some((d) => normalizeSearchText(d).includes(q))) : rows;

  return (
    <>
      <button type="button" className="settings-fold-summary settings-fold-row" id="fold-passwords" onClick={() => setOpen(true)}>
        <span className="settings-fold-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="settings-fold-text">
          <strong>
            {item.title} ({rows.length})
          </strong>
          <small>{item.summary}</small>
        </span>
        <span className="settings-fold-chevron" aria-hidden="true">
          ‹
        </span>
      </button>
      {open && (
        <PartySheet title={`🔑 كلمات المرور (${rows.length})`} onClose={() => setOpen(false)}>
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بكلمة المرور أو اسم الجهاز"
          />
          {visible.length === 0 ? (
            <p className="party-empty">{rows.length === 0 ? "لا كلمات مرور في الأجهزة بعد." : "لا نتيجة"}</p>
          ) : (
            <ul className="used-password-list used-password-compact">
              {visible.map((row) => (
                <li key={row.value} className="used-password-row">
                  <div className="used-password-top">
                    <button type="button" className="used-password-main" onClick={() => setExpanded((e) => (e === row.value ? null : row.value))}>
                      <strong dir="ltr" className="used-password-value">
                        {row.value}
                      </strong>
                      <small>📡 {row.count}</small>
                    </button>
                    <button type="button" className="btn-link" onClick={() => void copy(row.value)}>
                      {copied === row.value ? "✓" : "📋"}
                    </button>
                  </div>
                  {expanded === row.value && <span className="used-password-devices">{row.devices.join("، ")}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="settings-hint">تظهر أيضاً أزراراً سريعة عند إضافة جهاز أو تعديله.</p>
        </PartySheet>
      )}
    </>
  );
}
