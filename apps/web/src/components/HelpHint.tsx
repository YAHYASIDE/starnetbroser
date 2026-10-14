"use client";

import { useEffect, useState } from "react";
import { isHelpModeEnabled } from "@/lib/settingsStore";

interface Props {
  title: string;
  steps: string[];
}

/**
 * A short "how to use this screen" hint box - only rendered when المساعدة الذكية is on
 * (settingsStore.ts's "starnet.helpMode", toggled from الإعدادات). Scoped to the two screens the
 * operator most needs explained (Home + كشف الحساب), never a full app-wide walkthrough. The × only
 * collapses it for the current page view (component state) - it reappears on the next visit as
 * long as the setting stays on, since turning it off entirely is what the Settings toggle is for.
 */
export function HelpHint({ title, steps }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setEnabled(isHelpModeEnabled()), []);

  if (!enabled || collapsed) return null;

  return (
    <div className="help-hint" role="note">
      <div className="help-hint-header">
        <strong className="help-hint-title">💡 {title}</strong>
        <button
          type="button"
          className="help-hint-close"
          onClick={() => setCollapsed(true)}
          aria-label="إخفاء المساعدة"
          title="إخفاء المساعدة"
        >
          ×
        </button>
      </div>
      <ol className="help-hint-steps">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
