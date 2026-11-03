"use client";

import { useEffect, useState } from "react";
import { PartySheet } from "./AccountsSection";
import { loadRepresentativeStore } from "@/lib/repStore";
import { isRepWorkspace } from "@/lib/repMode";
import { loadRepCopy } from "@/lib/repCopy";
import { browserLinkStorage, loadLinkConfig } from "@/lib/deviceLink";
import { loadLiveSyncConfig } from "@/lib/liveSyncConfig";
import { sendRepText, sendTelegramText } from "@/lib/telegram";
import {
  addIncomingFlags,
  loadFlagChannels,
  loadOutbox,
  loadOwnerFlags,
  markFlagSent,
  markOwnerFlagReviewed,
  openFlagsForDevice,
  openOwnerFlags,
  ownerFirebase,
  ownerFlagMessage,
  REP_FLAGS_CHANGED,
  repReviewedMessage,
  saveOutbox,
  saveOwnerFlags,
  unsentFlags,
  type OwnerFlag,
} from "@/lib/repFlags";
import { pullFlags, pushFlags } from "@/lib/repFlagLink";
import { homeSearchHref } from "@/lib/homeActions";

/** Anything (the card's red line) can open the list. */
export const OPEN_REP_FLAGS = "starnet:open-rep-flags";

function when(at: number): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The open warnings of one device, live (the operator's card). */
export function useDeviceRepFlags(deviceId: string, enabled: boolean): OwnerFlag[] {
  const [flags, setFlags] = useState<OwnerFlag[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const reload = () => setFlags(openFlagsForDevice(loadOwnerFlags(), deviceId));
    reload();
    window.addEventListener(REP_FLAGS_CHANGED, reload);
    return () => window.removeEventListener(REP_FLAGS_CHANGED, reload);
  }, [deviceId, enabled]);
  return flags;
}

const PULL_MS = 45_000;
const PUSH_MS = 60_000;

/**
 * 🚩 The warnings' round while the app is open: on the rep's phone his outbox goes up (until it
 * arrives); on the operator's, every rep's channel is read - what came is kept, told on his own bot.
 */
export function RepFlagRunner() {
  useEffect(() => {
    let busy = false;
    const rep = isRepWorkspace();
    const round = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        if (rep) {
          const link = loadRepCopy()?.flagLink;
          const waiting = unsentFlags(loadOutbox());
          if (!link || waiting.length === 0) return;
          const { sent } = await pushFlags(link, waiting);
          let outbox = loadOutbox();
          for (const id of sent) outbox = markFlagSent(outbox, id);
          if (sent.length) saveOutbox(outbox);
          return;
        }
        const channels = loadFlagChannels();
        if (Object.keys(channels).length === 0) return;
        const firebase = ownerFirebase({ link: () => loadLinkConfig(browserLinkStorage()), live: loadLiveSyncConfig });
        if (!firebase) return;
        const { flags } = await pullFlags(firebase, channels);
        if (flags.length === 0) return;
        const { store, added } = addIncomingFlags(loadOwnerFlags(), flags);
        if (added.length === 0) return;
        saveOwnerFlags(store);
        const reps = loadRepresentativeStore();
        for (const f of added) void sendTelegramText(ownerFlagMessage(f, reps[f.repId]?.name ?? ""));
      } finally {
        busy = false;
      }
    };
    void round();
    const timer = window.setInterval(() => void round(), rep ? PUSH_MS : PULL_MS);
    const onVisible = () => void round();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}

/**
 * 🚩 The operator's red bar on top of every page while a rep's warning is open (his Nov 3 2026
 * choices): it opens the list - the device, its email, the description, who and when - with
 * «📍 إظهار الجهاز» and «✓ راجعته» (the rep is told on the reps bot).
 */
export function RepFlagsBanner() {
  const [flags, setFlags] = useState<OwnerFlag[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isRepWorkspace()) return;
    const reload = () => setFlags(openOwnerFlags(loadOwnerFlags()));
    const show = () => setOpen(true);
    reload();
    window.addEventListener(REP_FLAGS_CHANGED, reload);
    window.addEventListener("storage", reload);
    window.addEventListener(OPEN_REP_FLAGS, show);
    return () => {
      window.removeEventListener(REP_FLAGS_CHANGED, reload);
      window.removeEventListener("storage", reload);
      window.removeEventListener(OPEN_REP_FLAGS, show);
    };
  }, []);

  // The page makes room for the bar while a warning is open.
  useEffect(() => {
    document.documentElement.classList.toggle("has-rep-flags", flags.length > 0);
    return () => document.documentElement.classList.remove("has-rep-flags");
  }, [flags.length]);

  if (!flags.length) return null;
  const reps = loadRepresentativeStore();

  return (
    <>
      <button type="button" className="rep-flags-bar" role="alert" data-tour="rep-flags" onClick={() => setOpen(true)}>
        🚩 <bdi dir="ltr">{flags.length}</bdi> تحذير من المندوب · {flags[0]!.deviceName}
      </button>
      {open && (
        <PartySheet title="🚩 تحذيرات المندوبين" onClose={() => setOpen(false)}>
          <ul className="rep-flags-list">
            {flags.map((f) => (
              <li key={f.id} className="rep-flags-item">
                <p className="rep-flags-who">
                  🤝 {reps[f.repId]?.name ?? "المندوب"} · <bdi dir="ltr">{when(f.at)}</bdi>
                </p>
                <p className="rep-flags-device">
                  📡 <strong dir="auto">{f.deviceName}</strong>
                  {f.email && f.email !== f.deviceName && (
                    <>
                      {" "}
                      · <bdi dir="ltr">{f.email}</bdi>
                    </>
                  )}
                </p>
                <p className="rep-flags-note" dir="auto">
                  📝 {f.note}
                </p>
                <div className="rep-flags-actions">
                  <button
                    type="button"
                    className="dialog-secondary"
                    onClick={() => {
                      setOpen(false);
                      // a full visit: the home page reads its search only when it opens
                      window.location.assign(homeSearchHref(f.email || f.deviceName));
                    }}
                  >
                    📍 إظهار الجهاز
                  </button>
                  <button
                    type="button"
                    className="dialog-primary"
                    onClick={() => {
                      const next = markOwnerFlagReviewed(loadOwnerFlags(), f.id);
                      saveOwnerFlags(next);
                      void sendRepText(f.repId, repReviewedMessage(f));
                      if (!openOwnerFlags(next).length) setOpen(false);
                    }}
                  >
                    ✓ راجعته
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </PartySheet>
      )}
    </>
  );
}
