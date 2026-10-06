"use client";

import type { StarlinkAccountSummary } from "@starnet/shared";
import { PartySheet } from "./AccountsSection";
import { buildTravelRegistrationMessage, needsTravelRegistration, travelDueArabic } from "@/lib/travelRegistration";
import { buildWhatsAppLink } from "@/lib/whatsapp";

/** 🛂 The «كشف توثيق» result in the app (the owner also gets it in the bot; the rep's app has no
 * bot): each device that needs it, with its WhatsApp message ready. */
export function TravelCheckSheet({
  label,
  ids,
  skipped,
  accounts,
  phoneFor,
  onClose,
}: {
  label: string;
  ids: string[];
  skipped: number;
  accounts: StarlinkAccountSummary[];
  phoneFor: (account: StarlinkAccountSummary) => string | undefined;
  onClose: () => void;
}) {
  const found = ids
    .map((id) => accounts.find((a) => a.id === id))
    .filter((a): a is StarlinkAccountSummary => Boolean(a) && needsTravelRegistration(a!));
  return (
    <PartySheet title={`🛂 كشف توثيق${label ? ` - ${label}` : ""}`} onClose={onClose}>
      <p className="sync-choice-hint">
        فُحص {ids.length} جهاز · يحتاج توثيق: {found.length}
        {skipped > 0 && ` · لم يُفحص ${skipped}`}
      </p>
      {found.length === 0 ? (
        <p className="sync-choice-hint">✅ لا جهاز يحتاج توثيقًا.</p>
      ) : (
        <div className="day-sheet-rows">
          {found.map((account) => {
            const phone = phoneFor(account);
            const wa = buildWhatsAppLink(phone, buildTravelRegistrationMessage(account.name, account.travelRegistrationDue));
            return (
              <div key={account.id} className="day-sheet-row">
                <span>
                  {account.name}
                  <small> · قبل {travelDueArabic(account.travelRegistrationDue)}</small>
                  <br />
                  <small dir="ltr">{account.expectedEmail || account.starlinkAccountEmail || "—"}</small>
                </span>
                {wa ? (
                  <a className="day-sheet-wa" href={wa} target="_blank" rel="noopener noreferrer">
                    واتساب
                  </a>
                ) : (
                  <span className="day-sheet-muted">بلا رقم</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PartySheet>
  );
}
