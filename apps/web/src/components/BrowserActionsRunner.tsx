"use client";

import { useEffect } from "react";
import { demoAccounts } from "@/lib/demoData";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { takeBrowserActions, type StagedRead } from "@/lib/browserActions";
import { loadDeviceShots, saveDeviceShots } from "@/lib/deviceShots";
import { ackPendingAccountSyncs, isRunningInAndroidApp, listPendingAccountSyncs, onAccountDataSynced } from "@/lib/localBrowser";
import { putProof } from "@/lib/paymentProofStore";
import { isBrowserTeamFlag, loadOutbox, loadOwnerFlags, markFlagSent, queueFlag, repFlagsFromBrowser, saveOutbox, saveOwnerFlags } from "@/lib/repFlags";
import { pushFlags } from "@/lib/repFlagLink";
import { isRepWorkspace } from "@/lib/repMode";
import { loadRepCopy } from "@/lib/repCopy";
import { teamMemberName } from "./TeamFlagSheet";
import { announceTeamFlags } from "@/lib/alertWatchRun";

/**
 * 🚩📎 The device browser's alerts and kept screenshots, taken on whatever page the app is on (lib/browserActions.ts) -
 * on opening, on coming back, and live. Only those two kinds are acknowledged here; everything else stays for the home
 * page's own drain.
 */
export function BrowserActionsRunner() {
  useEffect(() => {
    if (!isRunningInAndroidApp()) return;
    let busy = false;
    const take = async (all: StagedRead[]) => {
      if (busy || all.length === 0) return;
      busy = true;
      try {
        let syncs = all;
        const devices = loadDemoAccounts(demoAccounts)
          .filter((a) => !a.deletedAt)
          .map((a) => ({ id: a.id, name: a.name, email: a.starlinkAccountEmail || a.expectedEmail }));
        // 🚩 in a rep's app the browser's 🚩 is his warning to the operator: sent on his channel at once
        if (isRepWorkspace()) {
          const flagReads = syncs.filter((s) => isBrowserTeamFlag(s as never));
          syncs = syncs.filter((s) => !flagReads.includes(s));
          const copy = loadRepCopy();
          if (copy && flagReads.length > 0) {
            const { flags, syncIds } = repFlagsFromBrowser(flagReads as never, devices, copy.repId);
            let outbox = loadOutbox();
            for (const f of flags) outbox = queueFlag(outbox, f);
            saveOutbox(outbox);
            await ackPendingAccountSyncs(syncIds);
            if (copy.flagLink && flags.length > 0) {
              const { sent } = await pushFlags(copy.flagLink, flags);
              outbox = loadOutbox();
              for (const id of sent) outbox = markFlagSent(outbox, id);
              if (sent.length) saveOutbox(outbox);
            }
          }
        }
        if (syncs.length === 0) return;
        const r = takeBrowserActions(syncs, { flags: loadOwnerFlags(), shots: loadDeviceShots(), devices, by: teamMemberName() });
        if (r.done.length === 0) return;
        for (const p of r.pictures) await putProof(p.key, p.dataUrl);
        if (r.added > 0) {
          saveOwnerFlags(r.flags);
          void announceTeamFlags(r.addedFlags); // 🔴🟡 the others see it even with their app closed
        }
        if (r.pictures.length > 0) saveDeviceShots(r.shots);
        await ackPendingAccountSyncs(r.done);
      } finally {
        busy = false;
      }
    };
    const drain = async () => take((await listPendingAccountSyncs()) as unknown as StagedRead[]);
    void drain();
    const onVisible = () => document.visibilityState === "visible" && void drain();
    document.addEventListener("visibilitychange", onVisible);
    let remove: (() => void) | null = null;
    void onAccountDataSynced((event) => void take([event as unknown as StagedRead])).then((h) => {
      remove = () => void h.remove();
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      remove?.();
    };
  }, []);
  return null;
}
