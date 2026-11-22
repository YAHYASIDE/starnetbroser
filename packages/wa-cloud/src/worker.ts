/**
 * ☁️ The Cloudflare Worker (deployed by .github/workflows/wa-cloud.yml). Routes:
 *   GET  /            - alive? (and whether the app's pack arrived) - nothing secret
 *   GET  /webhook     - Meta's verification (hub.verify_token = the pack's verifyToken)
 *   POST /webhook     - Meta's messages (X-Hub-Signature-256 checked with the pack's app secret); answered after a
 *                       quick 200 (Meta wants an answer within seconds)
 *   GET  /img/<id>    - a product's picture (the carousel's header needs a public link)
 *   POST /pack | /events | /ack | /send | /release - the app, every body sealed with PACK_KEY (lib/seal.ts)
 * Bindings: KV (namespace), PACK_KEY (secret, 64 hex - the same key as the app's «☁️ واتساب الرسمي»).
 */

import { handleIncoming, incomingFrom, release, staffReply, type AgentEvent, type Deps, type Pack, type Store } from "./core";
import { isKeyHex, open, seal, validMetaSignature, type Sealed } from "./seal";

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string; limit?: number; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

interface Env {
  KV: KVNamespace;
  PACK_KEY: string;
}

interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const GRAPH = "https://graph.facebook.com/v23.0";

function kvStore(kv: KVNamespace): Store {
  return {
    get: (k) => kv.get(k),
    put: (k, v, ttl) => kv.put(k, v, ttl ? { expirationTtl: Math.max(60, ttl) } : undefined),
    del: (k) => kv.delete(k),
    async list(prefix) {
      const out: string[] = [];
      let cursor: string | undefined;
      do {
        const r = await kv.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
        out.push(...r.keys.map((x) => x.name));
        cursor = r.list_complete ? undefined : r.cursor;
      } while (cursor && out.length < 2000);
      return out;
    },
  };
}

async function loadPack(env: Env): Promise<Pack | null> {
  const raw = await env.KV.get("pack");
  if (!raw || !isKeyHex(env.PACK_KEY)) return null;
  try {
    return JSON.parse(await open(JSON.parse(raw) as Sealed, env.PACK_KEY)) as Pack;
  } catch {
    return null;
  }
}

function deps(env: Env, pack: Pack, origin: string): Deps {
  return {
    store: kvStore(env.KV),
    now: () => Date.now(),
    async sendWa(payload) {
      const r = await fetch(`${GRAPH}/${pack.cloud.phoneNumberId}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${pack.cloud.token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) return { ok: true };
      const body = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } };
      // 131047: more than 24 hours since his last message - only an approved template may be sent
      return { ok: false, error: body.error?.code === 131047 ? "مرّت 24 ساعة على آخر رسالة منه - لا يُرسل إلا بقالب معتمد" : `واتساب ${r.status}: ${body.error?.message ?? ""}`.trim() };
    },
    async claude(body) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": pack.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, text: await r.text() };
    },
    imageUrl: (id) => (pack.images?.[id] ? `${origin}/img/${encodeURIComponent(id)}` : null),
  };
}

/** The app calls from its own page (Capacitor's https://localhost): every answer allows it - each body is sealed anyway. */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...CORS } });

/** A sealed request from the app → its JSON (null = not from a key holder). */
async function sealedBody<T>(req: Request, env: Env): Promise<T | null> {
  if (!isKeyHex(env.PACK_KEY)) return null;
  try {
    return JSON.parse(await open((await req.json()) as Sealed, env.PACK_KEY)) as T;
  } catch {
    return null;
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (req.method === "GET" && path === "/") {
      const pack = await loadPack(env);
      return json({ ok: true, service: "STAR NET WhatsApp agent", keySet: isKeyHex(env.PACK_KEY), packReady: Boolean(pack), menus: Boolean(pack?.menus) });
    }

    if (path === "/webhook" && req.method === "GET") {
      const pack = await loadPack(env);
      const ok = pack && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === pack.cloud.verifyToken;
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 }) : new Response("forbidden", { status: 403 });
    }

    if (path === "/webhook" && req.method === "POST") {
      const raw = await req.text();
      const pack = await loadPack(env);
      if (!pack) return new Response("no pack", { status: 503 });
      if (!(await validMetaSignature(raw, req.headers.get("x-hub-signature-256"), pack.cloud.appSecret))) return new Response("bad signature", { status: 401 });
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return new Response("ok");
      }
      const d = deps(env, pack, url.origin);
      ctx.waitUntil(
        (async () => {
          for (const m of incomingFrom(body)) {
            try {
              await handleIncoming(pack, m, d);
            } catch {
              // one bad message never stops the others
            }
          }
        })(),
      );
      return new Response("ok");
    }

    if (req.method === "GET" && path.startsWith("/img/")) {
      const pack = await loadPack(env);
      const data = pack?.images?.[decodeURIComponent(path.slice(5))];
      const m = data ? /^data:(image\/[a-z+]+);base64,(.+)$/.exec(data) : null;
      if (!m) return new Response("not found", { status: 404 });
      const bin = atob(m[2]!);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Response(bytes, { headers: { "content-type": m[1]!, "cache-control": "public, max-age=3600" } });
    }

    if (req.method !== "POST") return new Response("not found", { status: 404, headers: CORS });

    if (path === "/pack") {
      if (!isKeyHex(env.PACK_KEY)) return json({ ok: false, error: "PACK_KEY غير مضبوط في Cloudflare" }, 500);
      const raw = await req.text();
      try {
        const pack = JSON.parse(await open(JSON.parse(raw) as Sealed, env.PACK_KEY)) as Pack;
        if (!pack.cloud?.token || !pack.cloud?.phoneNumberId) return json({ ok: false, error: "ينقص مفتاح Meta أو رقم الهاتف" }, 400);
      } catch {
        return json({ ok: false, error: "مفتاح الربط لا يطابق PACK_KEY" }, 403);
      }
      await env.KV.put("pack", raw);
      return json({ ok: true });
    }

    if (path === "/events") {
      const q = await sealedBody<{ limit?: number }>(req, env);
      if (!q) return new Response("forbidden", { status: 403, headers: CORS });
      const store = kvStore(env.KV);
      const keys = (await store.list("ev:")).sort().slice(0, Math.min(500, q.limit ?? 300));
      const events: (AgentEvent & { k: string })[] = [];
      for (const k of keys) {
        const v = await env.KV.get(k);
        if (v) events.push({ ...(JSON.parse(v) as AgentEvent), k });
      }
      return json(await seal(JSON.stringify(events), env.PACK_KEY));
    }

    if (path === "/ack") {
      const q = await sealedBody<{ keys: string[] }>(req, env);
      if (!q) return new Response("forbidden", { status: 403, headers: CORS });
      for (const k of q.keys ?? []) if (k.startsWith("ev:")) await env.KV.delete(k);
      return json({ ok: true });
    }

    if (path === "/send" || path === "/release") {
      const q = await sealedBody<{ to: string; text?: string; by?: string }>(req, env);
      const pack = await loadPack(env);
      if (!q || !pack) return new Response("forbidden", { status: 403, headers: CORS });
      const to = String(q.to ?? "").replace(/\D/g, "");
      if (!to) return json({ ok: false, error: "رقم غير صحيح" }, 400);
      if (path === "/release") {
        await release(kvStore(env.KV), to);
        return json({ ok: true });
      }
      if (!q.text?.trim()) return json({ ok: false, error: "النص فارغ" }, 400);
      return json(await staffReply(deps(env, pack, url.origin), to, q.text.trim(), q.by ?? ""));
    }

    return new Response("not found", { status: 404 });
  },
};
