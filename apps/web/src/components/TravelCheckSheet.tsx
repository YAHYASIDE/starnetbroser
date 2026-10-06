"use client";

import { useState } from "react";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { PartySheet } from "./AccountsSection";
import { loadTravelSent, markTravelSent, needsTravelRegistration, travelDueArabic, travelWhatsAppLink } from "@/lib/travelRegistration";

/** 🛂 The devices that need the travel registration, each with its WhatsApp message ready - after
 * a «كشف توثيق» (`checked`: how many were checked) or from the home «🛂 تحتاج توثيق» button (all of
 * them, any time: add a number, come back, send). A device leaves the list by itself once Starlink
 * no longer shows the banner. */
export function TravelCheckSheet({
  label,
  ids,
  skipped = 0,
  checked = true,
  accounts,
  phoneFor,
  onClose,
}: {
  label: string;
  ids: string[];
  skipped?: number;
  checked?: boolean;
  accounts: StarlinkAccountSummary[];
  phoneFor: (account: StarlinkAccountSummary) => string | undefined;
  onClose: () => void;
}) {
  const [sent, setSent] = useState<Record<string, string>>(() => loadTravelSent());
  const found = ids
    .map((id) => accounts.find((a) => a.id === id))
    .filter((a): a is StarlinkAccountSummary => Boolean(a) && needsTravelRegistration(a!));
  return (
    <PartySheet title={`🛂 ${checked ? "كشف توثيق" : "تحتاج توثيق"}${label ? ` - ${label}` : ""}`} onClose={onClose}>
      <p className="sync-choice-hint">
        {checked ? `فُحص ${ids.length} جهاز · ` : ""}يحتاج توثيق: {found.length}
        {skipped > 0 && ` · لم يُفحص ${skipped}`}
      </p>
      {found.length === 0 ? (
        <p className="sync-choice-hint">✅ لا جهاز يحتاج توثيقًا.</p>
      ) : (
        <div className="day-sheet-rows">
          {found.map((account) => {
            const phone = phoneFor(account);
            return (
              <div key={account.id} className="day-sheet-row">
                <span>
                  {account.name}
                  <small> · قبل {travelDueArabic(account.travelRegistrationDue)}</small>
                  {sent[account.id] && <small className="day-sheet-ok"> · ✓ أُرسل</small>}
                  <br />
                  <small dir="ltr">{account.expectedEmail || account.starlinkAccountEmail || "—"}</small>
                  {!phone && <small> · بلا رقم - تختار الزبون في واتساب</small>}
                </span>
                <a
                  className="day-sheet-wa"
                  href={travelWhatsAppLink(account, phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setSent(markTravelSent(account.id))}
                >
                  واتساب
                </a>
              </div>
            );
          })}
        </div>
      )}
    </PartySheet>
  );
}
