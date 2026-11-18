// Types for portal.js (shared by the customers' page and the STAR NET app).
export function toB64u(bytes: Uint8Array | ArrayBuffer): string;
export function fromB64u(text: string): Uint8Array;
export function packJson(obj: unknown): string;
export function unpackJson<T = unknown>(text: string): T;
export function makeOwnerKeys(): Promise<{ publicKey: string; privateJwk: JsonWebKey }>;
export function sealForOwner(ownerPublicKey: string, obj: unknown): Promise<string>;
export function openFromCustomer<T = unknown>(privateJwk: JsonWebKey, text: string): Promise<T>;
export function sealView(keyB64u: string, obj: unknown): Promise<string>;
export function openView<T = unknown>(keyB64u: string, text: string): Promise<T>;
export function randomToken(bytes?: number): string;
export interface PortalLinkData {
  /** Firebase projectId */ p: string;
  /** Firebase apiKey */ k: string;
  /** the owner's space */ s: string;
  /** the owner's public key (requests) */ e?: string;
  /** «حسابي»: the view's token and key */ t?: string;
  x?: string;
  /** business name */ n?: string;
}
export function readHash(hash: string): { kind: "j" | "v"; data: PortalLinkData } | null;
export function firestoreDocUrl(projectId: string, path: string, apiKey?: string): string;
export interface PortalRequest {
  kind: "existing" | "new";
  name: string;
  phone: string;
  email?: string;
  emailCode?: string;
  wifiCode?: string;
  kit?: string;
}
export function cleanRequest(input: unknown): PortalRequest | null;
