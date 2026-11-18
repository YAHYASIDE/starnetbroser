// 🌐 «رابط الزبائن» - the crypto and links shared by the customers' page (index.html / page.js) and the STAR NET app
// (apps/web/src/lib/customerPortal.ts imports the same rules; customerPortal.test.ts checks both sides together).
// A request is sealed for the owner's app alone (ECDH P-256 + AES-GCM); a customer's «حسابي» page is sealed with that
// customer's own key, which lives only in his link (after the #, never sent to any server). Plain JS, no library.

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64u(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64u(text) {
  const b64 = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const s = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function packJson(obj) {
  return toB64u(enc.encode(JSON.stringify(obj)));
}

export function unpackJson(text) {
  return JSON.parse(dec.decode(fromB64u(text)));
}

const ECDH = { name: "ECDH", namedCurve: "P-256" };
const AES = { name: "AES-GCM", length: 256 };

/** The owner's key pair: the public half goes in the links (87 letters), the private half stays in his app. */
export async function makeOwnerKeys() {
  const pair = await crypto.subtle.generateKey(ECDH, true, ["deriveKey"]);
  return {
    publicKey: toB64u(await crypto.subtle.exportKey("raw", pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
}

/** A request → text only the owner's private key opens (a one-time key pair on the customer's side + AES-GCM). */
export async function sealForOwner(ownerPublicKey, obj) {
  const ownerPub = await crypto.subtle.importKey("raw", fromB64u(ownerPublicKey), ECDH, false, []);
  const once = await crypto.subtle.generateKey(ECDH, true, ["deriveKey"]);
  const aes = await crypto.subtle.deriveKey({ name: "ECDH", public: ownerPub }, once.privateKey, AES, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, enc.encode(JSON.stringify(obj)));
  const e = toB64u(await crypto.subtle.exportKey("raw", once.publicKey));
  return packJson({ v: 1, e, i: toB64u(iv), d: toB64u(data) });
}

export async function openFromCustomer(privateJwk, text) {
  const box = unpackJson(text);
  const priv = await crypto.subtle.importKey("jwk", privateJwk, ECDH, false, ["deriveKey"]);
  const theirs = await crypto.subtle.importKey("raw", fromB64u(box.e), ECDH, false, []);
  const aes = await crypto.subtle.deriveKey({ name: "ECDH", public: theirs }, priv, AES, false, ["decrypt"]);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(box.i) }, aes, fromB64u(box.d));
  return JSON.parse(dec.decode(data));
}

/** A customer's «حسابي» page, sealed with his own key (b64url of 32 random bytes). */
export async function sealView(keyB64u, obj) {
  const aes = await crypto.subtle.importKey("raw", fromB64u(keyB64u), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, enc.encode(JSON.stringify(obj)));
  return packJson({ v: 1, i: toB64u(iv), d: toB64u(data) });
}

export async function openView(keyB64u, text) {
  const box = unpackJson(text);
  const aes = await crypto.subtle.importKey("raw", fromB64u(keyB64u), "AES-GCM", false, ["decrypt"]);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64u(box.i) }, aes, fromB64u(box.d));
  return JSON.parse(dec.decode(data));
}

export function randomToken(bytes = 32) {
  return toB64u(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** "#j.<…>" = the requests form, "#v.<…>" = one customer's page. */
export function readHash(hash) {
  const h = String(hash || "").replace(/^#/, "");
  const dot = h.indexOf(".");
  if (dot < 1) return null;
  const kind = h.slice(0, dot);
  if (kind !== "j" && kind !== "v") return null;
  try {
    return { kind, data: unpackJson(h.slice(dot + 1)) };
  } catch {
    return null;
  }
}

export function firestoreDocUrl(projectId, path, apiKey) {
  const parts = String(path).split("/").map(encodeURIComponent).join("/");
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${parts}${apiKey ? `?key=${encodeURIComponent(apiKey)}` : ""}`;
}

/** What a request may hold - trimmed, bounded; null when it is not a valid one. */
export function cleanRequest(input) {
  const s = (v, max) => String(v ?? "").trim().slice(0, max);
  const kind = input && input.kind === "new" ? "new" : "existing";
  const out = { kind, name: s(input && input.name, 80), phone: s(input && input.phone, 30) };
  if (!out.name) return null;
  if (kind === "existing") {
    out.email = s(input.email, 120).toLowerCase();
    out.emailCode = s(input.emailCode, 120);
    out.wifiCode = s(input.wifiCode, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) return null;
  } else {
    out.kit = s(input.kit, 60).toUpperCase();
    if (!out.kit) return null;
  }
  return out;
}
