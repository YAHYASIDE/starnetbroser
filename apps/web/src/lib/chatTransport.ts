"use client";

/**
 * 💬 The chat's trip (lib/chat.ts): each message is a sealed Firestore document `starnet/{space}/chat/{id}` with a
 * plain `at` (zero-padded time) to ask for «what came after». The team's conversation uses the team link's space and
 * key; a rep's uses his warnings channel (the operator's phones hold every channel - shared in the link -, the rep's
 * phone its own, from his copy). Readers never delete: the sender removes documents older than 30 days now and then.
 * Live through Firebase's listener while the app is open; the background service announces what comes while it is
 * closed (AlertWatch.java).
 */

import { chatAtKey, chatCollection, parseChatPayload, repConv, TEAM_CONV, type ChatMessage } from "./chat";
import { browserLinkStorage, loadLinkConfig } from "./deviceLink";
import { openText, sealText, type Sealed } from "./deviceSyncCrypto";
import { deleteDocument, queryIdsBefore, writeDocument } from "./firestoreRest";
import { loadLiveSyncConfig } from "./liveSyncConfig";
import { loadRepCopy } from "./repCopy";
import { loadFlagChannels, ownerFirebase } from "./repFlags";
import { isRepWorkspace } from "./repMode";
import { loadRepresentativeStore } from "./repStore";

export interface ChatTarget {
  conv: string;
  title: string;
  firebase: { apiKey: string; projectId: string };
  spaceId: string;
  key: string;
}

/** The conversations this phone can hold: the rep's own one on his phone; the team's and every rep's on the operator's. */
export function chatTargets(): ChatTarget[] {
  if (isRepWorkspace()) {
    const link = loadRepCopy()?.flagLink;
    if (!link) return [];
    return [{ conv: repConv(loadRepCopy()!.repId), title: "المسؤول", firebase: { apiKey: link.apiKey, projectId: link.projectId }, spaceId: link.spaceId, key: link.key }];
  }
  const link = loadLinkConfig(browserLinkStorage());
  const firebase = ownerFirebase({ link: () => link, live: loadLiveSyncConfig });
  if (!firebase) return [];
  const out: ChatTarget[] = [];
  if (link && link.enabled !== false) out.push({ conv: TEAM_CONV, title: "👥 الفريق", firebase, spaceId: link.spaceId, key: link.key });
  const reps = loadRepresentativeStore();
  for (const [repId, channel] of Object.entries(loadFlagChannels())) {
    const rep = reps[repId];
    if (!rep) continue;
    out.push({ conv: repConv(repId), title: `🤝 ${rep.name}`, firebase, spaceId: channel.spaceId, key: channel.key });
  }
  return out;
}

const DAY = 24 * 60 * 60 * 1000;
const KEEP_MS = 30 * DAY;

/** Sends one message; false when it couldn't (it stays «⏳» and goes again). */
export async function sendChat(target: ChatTarget, message: ChatMessage): Promise<boolean> {
  try {
    const sealed = await sealText(JSON.stringify(message), target.key);
    const r = await writeDocument(target.firebase, `${chatCollection(target.spaceId)}/${message.id}`, { sealed: JSON.stringify(sealed), at: chatAtKey(message.at) });
    if (r.ok && Math.random() < 0.1) void pruneOldChat(target);
    return r.ok;
  } catch {
    return false;
  }
}

/** Documents older than 30 days go (each phone keeps its own copy of what it read). */
async function pruneOldChat(target: ChatTarget): Promise<void> {
  const old = await queryIdsBefore(target.firebase, `starnet/${target.spaceId}`, "chat", "at", chatAtKey(Date.now() - KEEP_MS));
  if (!old.ok) return;
  for (const id of old.value) await deleteDocument(target.firebase, `${chatCollection(target.spaceId)}/${id}`);
}

/** Opens a document's `sealed` field into a message of the target's conversation, or null. */
export async function openChatDoc(target: Pick<ChatTarget, "conv" | "key">, sealedJson: string | undefined): Promise<ChatMessage | null> {
  try {
    return parseChatPayload(await openText(JSON.parse(sealedJson ?? "") as Sealed, target.key), target.conv);
  } catch {
    return null;
  }
}

/** 📞 Firestore (Firebase's SDK, signed in anonymously) for a conversation's project - the call's live document. */
export async function firestoreFor(firebase: ChatTarget["firebase"]) {
  const [{ initializeApp, getApps }, { getAuth, signInAnonymously }, fs] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
  const name = `starnet-link-${firebase.projectId}`;
  const app = getApps().find((a) => a.name === name) ?? initializeApp({ apiKey: firebase.apiKey, projectId: firebase.projectId, authDomain: `${firebase.projectId}.firebaseapp.com` }, name);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  return { db: fs.getFirestore(app), fs };
}

/**
 * Listens to a conversation: every message from `since` on (the sender's clock - a margin is taken by the caller).
 * Returns the stop function; `onState` false = it failed (the page says so).
 */
export function listenChat(target: ChatTarget, since: number, onMessages: (messages: ChatMessage[]) => void, onState: (live: boolean) => void): () => void {
  let stopped = false;
  let unsubscribe: (() => void) | null = null;
  void (async () => {
    try {
      const [{ initializeApp, getApps }, { getAuth, signInAnonymously }, { getFirestore, collection, onSnapshot, query, where }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
        import("firebase/firestore"),
      ]);
      const name = `starnet-link-${target.firebase.projectId}`;
      const app =
        getApps().find((a) => a.name === name) ??
        initializeApp({ apiKey: target.firebase.apiKey, projectId: target.firebase.projectId, authDomain: `${target.firebase.projectId}.firebaseapp.com` }, name);
      const auth = getAuth(app);
      if (!auth.currentUser) await signInAnonymously(auth);
      if (stopped) return;
      unsubscribe = onSnapshot(
        query(collection(getFirestore(app), "starnet", target.spaceId, "chat"), where("at", ">", chatAtKey(since))),
        (snap) => {
          onState(true);
          const docs = snap.docChanges().filter((c) => c.type === "added").map((c) => c.doc.data() as { sealed?: string });
          if (docs.length === 0) return;
          void Promise.all(docs.map((d) => openChatDoc(target, d.sealed))).then((list) => {
            const messages = list.filter((m): m is ChatMessage => Boolean(m));
            if (messages.length) onMessages(messages);
          });
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
  };
}
