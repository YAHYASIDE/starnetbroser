"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { updateDownloadUrl } from "@/lib/appUpdate";
import { downloadAppUpdate, isRunningInAndroidApp } from "@/lib/localBrowser";

/** 🆕 The «تحديث جديد» banner. On the phone the app downloads the APK itself and opens Android's
 * installer (a browser like Edge didn't finish the download); elsewhere it stays a download link. */
export function UpdateBanner({ title, hint, onTap }: { title: ReactNode; hint: string; onTap?: (event: MouseEvent) => void }) {
  const [state, setState] = useState<{ busy: boolean; percent: number; message: string | null }>({ busy: false, percent: -1, message: null });

  async function download(event: MouseEvent) {
    onTap?.(event);
    if (!isRunningInAndroidApp() || event.defaultPrevented) return;
    event.preventDefault();
    if (state.busy) return;
    setState({ busy: true, percent: -1, message: null });
    const result = await downloadAppUpdate(updateDownloadUrl(), (percent) => setState((s) => ({ ...s, percent })));
    setState({
      busy: false,
      percent: -1,
      message: !result.ok
        ? result.message
        : result.status === "needsPermission"
          ? "فعّل «السماح من هذا المصدر» لـ STAR NET، ثم ارجع واضغط التحديث مرة أخرى."
          : "✓ تم التنزيل - اضغط «تثبيت» في نافذة أندرويد. بياناتك تبقى كما هي.",
    });
  }

  const small = state.busy ? (state.percent >= 0 ? `⬇️ يتم التنزيل… ${state.percent}%` : "⬇️ يتم التنزيل…") : state.message ?? hint;

  return (
    <a href={updateDownloadUrl()} target="_blank" rel="noreferrer" className="backup-banner update-banner" onClick={(e) => void download(e)} aria-busy={state.busy}>
      <span aria-hidden="true">🆕</span>
      <span>
        <strong>{title}</strong>
        <small>{small}</small>
      </span>
    </a>
  );
}
