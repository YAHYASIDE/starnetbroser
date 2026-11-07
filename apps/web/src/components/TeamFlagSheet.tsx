"use client";

import { announceTeamFlags } from "@/lib/alertWatchRun";
import { useState } from "react";
import { PartySheet } from "./AccountsSection";
import { browserLinkStorage, loadLinkConfig } from "@/lib/deviceLink";
import { addIncomingFlags, loadOwnerFlags, MAX_FLAG_NOTE, newTeamFlag, saveOwnerFlags, type FlagLevel } from "@/lib/repFlags";

/** Who this phone is in the team (its name in «🔗 ربط الأجهزة»), else «أنا». */
export function teamMemberName(): string {
  return loadLinkConfig(browserLinkStorage())?.name?.trim() || "أنا";
}

/**
 * 🚩 «تنبيه للمسؤول» on a device (his Nov 7 2026 ask «لكل المسؤولين أن يضيفوا تنبيهًا على الأجهزة»): the problem in
 * words and 🔴 عاجل / 🟡 عادي. It is kept with the warnings (lib/repFlags.ts), reaches every phone of the team by the
 * link, shows on top of every page and on the card, and YAHYA closes it with «✓ راجعته».
 */
export function TeamFlagSheet({ device, onClose }: { device: { id: string; name: string; email?: string }; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [level, setLevel] = useState<FlagLevel>("normal");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const flag = newTeamFlag({ deviceId: device.id, deviceName: device.name, email: device.email, note, level, by: teamMemberName() });
    if (!flag) return setError("اكتب المشكلة أولًا");
    saveOwnerFlags(addIncomingFlags(loadOwnerFlags(), [flag]).store);
    void announceTeamFlags([flag]); // 🔴🟡 the others see it even with their app closed
    onClose();
  }

  return (
    <PartySheet title={`🚩 تنبيه للمسؤول - ${device.name}`} onClose={onClose}>
      <p className="settings-hint">يظهر في كل أجهزة الفريق (شريط أحمر فوق + سطر في بطاقة الجهاز)، ويصل إشعار لـ YAHYA. يُغلق حين يضغط «✓ راجعته».</p>
      <textarea
        className="search-input team-flag-note"
        rows={3}
        maxLength={MAX_FLAG_NOTE}
        dir="auto"
        placeholder="ما المشكلة؟ مثلًا: الطبق لا يتصل منذ أمس، الزبون يطلب تغيير الباقة…"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setError(null);
        }}
        autoFocus
      />
      <div className="report-period-row" role="radiogroup" aria-label="الأهمية">
        <button type="button" role="radio" aria-checked={level === "urgent"} className={`report-period-btn${level === "urgent" ? " report-period-btn-active team-flag-urgent" : ""}`} onClick={() => setLevel("urgent")}>
          🔴 عاجل
        </button>
        <button type="button" role="radio" aria-checked={level === "normal"} className={`report-period-btn${level === "normal" ? " report-period-btn-active" : ""}`} onClick={() => setLevel("normal")}>
          🟡 عادي
        </button>
      </div>
      {error && <p className="settings-hint telegram-stopped">{error}</p>}
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={save}>
          🚩 أرسل التنبيه
        </button>
        <button type="button" className="text-action" onClick={onClose}>
          إلغاء
        </button>
      </div>
    </PartySheet>
  );
}
