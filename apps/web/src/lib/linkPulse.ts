/**
 * ⚡ The team link, live (his Nov 7 2026 ask «أريد أن تكون البيانات سريعة جدًا بينهم»): instead of each phone asking
 * Firebase every few seconds whether another member wrote, it LISTENS to the members' heads
 * (`starnet/{space}/link/{member}`, lib/deviceLink.ts) - the moment one of them sends a batch its head changes and the
 * others start their round at once. A listener costs one read per change (not one per check), so it is both faster
 * and cheaper than polling. Firebase's own SDK is loaded only here, only when the link is on.
 *
 * Nothing secret travels in the heads (seq, ack, sealed counts); the data itself stays in the sealed batches.
 */

import type { LinkConfig } from "./deviceLink";

/** The members whose head changed, mine left out (the first snapshot - what was already there - says nothing). */
export function otherHeadsChanged(changes: { id: string; type: "added" | "modified" | "removed" }[], myId: string, first: boolean): boolean {
  if (first) return false;
  return changes.some((c) => c.id !== myId && c.type !== "removed");
}

/**
 * Starts listening; `onOther` runs when another member wrote. Returns the stop function. `onState` says whether the
 * listener is live (false = it failed - the regular checks carry on alone).
 */
export function startLinkPulse(config: LinkConfig, onOther: () => void, onState: (live: boolean) => void): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  void (async () => {
    try {
      const [{ initializeApp, getApps }, { getAuth, signInAnonymously }, { getFirestore, collection, onSnapshot }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      const name = `starnet-link-${config.projectId}`;
      const app = getApps().find((a) => a.name === name) ?? initializeApp({ apiKey: config.apiKey, projectId: config.projectId, authDomain: `${config.projectId}.firebaseapp.com` }, name);
      const auth = getAuth(app);
      if (!auth.currentUser) await signInAnonymously(auth);
      if (stopped) return;
      let first = true;
      unsubscribe = onSnapshot(
        collection(getFirestore(app), "starnet", config.spaceId, "link"),
        (snap) => {
          onState(true);
          const changes = snap.docChanges().map((c) => ({ id: c.doc.id, type: c.type }));
          if (otherHeadsChanged(changes, config.memberId, first)) onOther();
          first = false;
        },
        () => onState(false),
      );
    } catch {
      onState(false);
    }
  })();
  return () => {
    stopped = true;
    unsubscribe?.();
    onState(false);
  };
}

/**
 * 🚩 The reps' warnings, live (his Nov 7 2026 report «لا تأتي رسائل مستعجل أو غير مستعجل من عند المندوبين بسرعة»): the
 * operator's phone listens to every rep's channel (`starnet/{space}/flags`) - the moment a rep writes a warning,
 * `onAdded` runs and the round reads it (it was a check every 45 s). Returns the stop function; `onState` false = the
 * listener failed (the regular checks carry on alone).
 */
export function startFlagPulse(config: { apiKey: string; projectId: string }, spaceIds: string[], onAdded: () => void, onState: (live: boolean) => void): () => void {
  let stopped = false;
  const unsubscribes: (() => void)[] = [];
  void (async () => {
    try {
      const [{ initializeApp, getApps }, { getAuth, signInAnonymously }, { getFirestore, collection, onSnapshot }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      const name = `starnet-link-${config.projectId}`;
      const app = getApps().find((a) => a.name === name) ?? initializeApp({ apiKey: config.apiKey, projectId: config.projectId, authDomain: `${config.projectId}.firebaseapp.com` }, name);
      const auth = getAuth(app);
      if (!auth.currentUser) await signInAnonymously(auth);
      if (stopped) return;
      for (const spaceId of spaceIds) {
        unsubscribes.push(
          onSnapshot(
            collection(getFirestore(app), "starnet", spaceId, "flags"),
            (snap) => {
              onState(true);
              if (snap.docChanges().some((c) => c.type === "added")) onAdded();
            },
            () => onState(false),
          ),
        );
      }
    } catch {
      onState(false);
    }
  })();
  return () => {
    stopped = true;
    for (const u of unsubscribes) u();
    onState(false);
  };
}

/** 💾 A business store (or a shared setting) written on this phone - what goes out at once. */
export function isLinkedWrite(key: string, shared: readonly string[]): boolean {
  return key.startsWith("starnet_") || shared.includes(key);
}
