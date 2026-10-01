"use client";

import { useEffect, useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { listAccounts } from "@/lib/apiClient";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { isDemoMode } from "@/lib/settingsStore";
import { usedPasswords, type UsedPassword } from "@/lib/usedPasswords";

const SHOWN = 10;

/** 🔑 Every password on the devices, most used first (usedPasswords.ts) - shown as-is, with copy. */
export function UsedPasswordsSection() {
  const [rows, setRows] = useState<UsedPassword[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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

  const visible = showAll ? rows : rows.slice(0, SHOWN);
  return (
    <section className="section">
      <h2 className="section-title">🔑 كلمات المرور المستعملة</h2>
      <p className="settings-hint">
        كل كلمات المرور في أجهزتك، الأكثر استعمالاً أولاً. تظهر أيضاً أزراراً سريعة عند إضافة جهاز أو تعديله. حين يرفض Starlink كلمة مرور
        وتكتب الصحيحة، يحفظها التطبيق للجهاز وحده.
      </p>
      {rows.length === 0 ? (
        <p className="party-empty">لا كلمات مرور في الأجهزة بعد.</p>
      ) : (
        <ul className="used-password-list">
          {visible.map((row) => (
            <li key={row.value} className="used-password-row">
              <div className="used-password-top">
                <strong dir="ltr" className="used-password-value">{row.value}</strong>
                <button type="button" className="btn-link" onClick={() => void copy(row.value)}>
                  {copied === row.value ? "✓ نُسخت" : "📋 نسخ"}
                </button>
              </div>
              <span className="used-password-devices">
                📡 {row.count} جهاز: {row.devices.slice(0, 3).join("، ")}
                {row.devices.length > 3 ? ` و${row.devices.length - 3} آخر` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > SHOWN && (
        <button type="button" className="btn-link" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "عرض أقل" : `عرض الكل (${rows.length})`}
        </button>
      )}
    </section>
  );
}
