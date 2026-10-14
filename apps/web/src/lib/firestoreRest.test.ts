// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { documentUrl, explainFirebaseError, idToken, readDocument, writeDocument, type FetchFn } from "./firestoreRest";
import { checkConfigInput, newSpaceId } from "./liveSyncConfig";

const config = { apiKey: "AIzaFAKE_key_for_tests_0000000000000", projectId: "demo-project" };

function fakeFetch(routes: Array<(url: string, init?: RequestInit) => { status: number; body: unknown } | null>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    for (const route of routes) {
      const hit = route(url, init);
      if (hit) return new Response(typeof hit.body === "string" ? hit.body : JSON.stringify(hit.body), { status: hit.status });
    }
    return new Response("{}", { status: 500 });
  };
  return { fn, calls };
}

const signUp = (url: string) => (url.includes("accounts:signUp") ? { status: 200, body: { idToken: "tok-1", refreshToken: "ref-1", expiresIn: "3600" } } : null);

describe("☁️ Firebase over HTTPS", () => {
  beforeEach(() => window.localStorage.clear());

  it("signs in anonymously once and reuses the token", async () => {
    const { fn, calls } = fakeFetch([signUp]);
    expect(await idToken(config, fn, 1_000)).toEqual({ ok: true, value: "tok-1" });
    expect(await idToken(config, fn, 2_000)).toEqual({ ok: true, value: "tok-1" });
    expect(calls).toHaveLength(1);
  });

  it("refreshes an expired token", async () => {
    const { fn } = fakeFetch([signUp, (url) => (url.includes("securetoken") ? { status: 200, body: { id_token: "tok-2", refresh_token: "ref-2", expires_in: "3600" } } : null)]);
    await idToken(config, fn, 0);
    expect(await idToken(config, fn, 3_600_000)).toEqual({ ok: true, value: "tok-2" });
  });

  it("reads a document's text fields, a missing one as null, and writes with the token", async () => {
    const { fn, calls } = fakeFetch([
      signUp,
      (url, init) => (url.endsWith("/sides/rep") && !init?.method ? { status: 200, body: { fields: { data: { stringValue: "x" }, at: { stringValue: "t" } } } } : null),
      // Firestore's real reply for a document not written yet (it names the databases path)
      (url, init) =>
        url.endsWith("/sides/owner") && !init?.method
          ? { status: 404, body: { error: { code: 404, message: 'Document "projects/demo-project/databases/(default)/documents/starnet/s/reps/r1/sides/owner" not found.', status: "NOT_FOUND" } } }
          : null,
      (url) => (url.endsWith("/nodb") ? { status: 404, body: { error: { message: "The database (default) does not exist for project demo-project" } } } : null),
      (_url, init) => (init?.method === "PATCH" ? { status: 200, body: {} } : null),
    ]);
    expect(await readDocument(config, "starnet/s/reps/r1/sides/rep", fn)).toEqual({ ok: true, value: { data: "x", at: "t" } });
    expect(await readDocument(config, "starnet/s/reps/r1/sides/owner", fn)).toEqual({ ok: true, value: null });
    const noDb = await readDocument(config, "starnet/s/nodb", fn);
    expect(noDb.ok === false && noDb.message).toContain("Firestore");
    expect(await writeDocument(config, "starnet/s/reps/r1/sides/owner", { data: "y" }, fn)).toEqual({ ok: true, value: true });
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect((patch.init!.headers as Record<string, string>).Authorization).toBe("Bearer tok-1");
    expect(JSON.parse(String(patch.init!.body))).toEqual({ fields: { data: { stringValue: "y" } } });
  });

  it("explains each setup step that was missed, in Arabic", async () => {
    expect(explainFirebaseError(400, '{"error":{"message":"ADMIN_ONLY_OPERATION"}}')).toContain("Anonymous");
    expect(explainFirebaseError(403, '{"error":{"status":"PERMISSION_DENIED"}}')).toContain("قواعد");
    expect(explainFirebaseError(404, '{"error":{"message":"The database (default) does not exist for project x"}}')).toContain("Firestore");
    expect(explainFirebaseError(400, "API key not valid. Please pass a valid API key.")).toContain("apiKey");
    expect(explainFirebaseError(0, "")).toContain("الإنترنت");
    const { fn } = fakeFetch([(url) => (url.includes("signUp") ? { status: 400, body: '{"error":{"message":"ADMIN_ONLY_OPERATION"}}' } : null)]);
    const r = await readDocument(config, "starnet/s/x", fn);
    expect(r.ok).toBe(false);
  });

  it("builds document URLs and checks what he pastes", () => {
    expect(documentUrl(config, "starnet/abc/reps/r1/sides/rep")).toBe("https://firestore.googleapis.com/v1/projects/demo-project/databases/(default)/documents/starnet/abc/reps/r1/sides/rep");
    expect(checkConfigInput(" " + config.apiKey + " ", "demo-project")).toEqual({ ok: true, apiKey: config.apiKey, projectId: "demo-project" });
    expect(checkConfigInput("nope", "demo-project").ok).toBe(false);
    expect(checkConfigInput(config.apiKey, "Bad Project").ok).toBe(false);
    expect(newSpaceId(() => new Uint8Array(12).fill(171))).toBe("ab".repeat(12));
  });
});
