"use client";

import { useEffect, useState } from "react";
import { LIVE_SYNC_NOW_EVENT } from "@/components/LiveSyncRunner";
import { readDocument, writeDocument } from "@/lib/firestoreRest";
import { LIVE_SYNC_STOPPED, loadLiveSyncStatus, LIVE_SYNC_EVENT, type LiveSyncStatus } from "@/lib/liveSync";
import { checkConfigInput, loadLiveSyncConfig, newSpaceId, saveLiveSyncConfig, type LiveSyncConfig } from "@/lib/liveSyncConfig";

/** ☁️ Settings → «الربط الحيّ مع المندوبين»: his Firebase (apiKey + projectId), a real connection
 * test, on / off, and the last sync. Each rep joins with his next copy (it carries the link). */
export function LiveSyncSection() {
  const [config, setConfig] = useState<LiveSyncConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<LiveSyncStatus | null>(null);

  useEffect(() => {
    const saved = loadLiveSyncConfig();
    setConfig(saved);
    setApiKey(saved?.apiKey ?? "");
    setProjectId(saved?.projectId ?? "");
    setStatus(loadLiveSyncStatus());
    const refresh = () => setStatus(loadLiveSyncStatus());
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener(LIVE_SYNC_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(LIVE_SYNC_EVENT, refresh);
    };
  }, []);

  async function saveAndTest() {
    const checked = checkConfigInput(apiKey, projectId);
    if (!checked.ok) {
      setMessage({ ok: false, text: checked.message });
      return;
    }
    setBusy(true);
    setMessage({ ok: true, text: "⏳ أجرّب الاتصال…" });
    const next: LiveSyncConfig = {
      apiKey: checked.apiKey,
      projectId: checked.projectId,
      // the same space when only re-entering the same project; a new one for another project
      spaceId: config && config.projectId === checked.projectId ? config.spaceId : newSpaceId(),
      enabled: true,
    };
    const path = `starnet/${next.spaceId}/tests/ping`;
    const at = new Date().toISOString();
    const written = await writeDocument(next, path, { at });
    const read = written.ok ? await readDocument(next, path) : written;
    setBusy(false);
    if (!read.ok) {
      setMessage({ ok: false, text: `✗ ${read.message}` });
      return;
    }
    saveLiveSyncConfig(next);
    setConfig(next);
    setMessage({ ok: true, text: "✓ الاتصال يعمل. أرسل لكل مندوب نسخة جديدة («إرسال نسخته») لينضم هاتفه للربط." });
    window.dispatchEvent(new Event(LIVE_SYNC_NOW_EVENT));
  }

  function toggle(enabled: boolean) {
    if (!config) return;
    const next = { ...config, enabled };
    saveLiveSyncConfig(next);
    setConfig(next);
    if (enabled) window.dispatchEvent(new Event(LIVE_SYNC_NOW_EVENT));
  }

  return (
    <section className="section live-sync-section">
      {LIVE_SYNC_STOPPED && (
        <p className="account-card-alert">
          ⏸️ متوقف: زبائن المندوب صاروا عنده فقط، ونسختك له تحمل أجهزته وعملياتها فقط - لا يُنقل أي زبون بين الهاتفين.
        </p>
      )}
      <p className="settings-hint">
        زبائن كل مندوب وربطهم بأجهزته يظهرون عندك وعنده تلقائيًا خلال ثوانٍ (عبر Firebase الخاص بك). البيانات مشفّرة برمز المندوب قبل أن تخرج من الهاتف.
      </p>
      <label className="tool-field">
        <span>apiKey (إعدادات المشروع ← تطبيقاتك)</span>
        <input className="search-input" dir="ltr" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza…" />
      </label>
      <label className="tool-field">
        <span>projectId</span>
        <input className="search-input" dir="ltr" autoComplete="off" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="my-project-123" />
      </label>
      <button type="button" className="dialog-primary" disabled={busy} onClick={() => void saveAndTest()}>
        💾 حفظ وتجربة الاتصال
      </button>
      {message && <p className={message.ok ? "settings-hint live-sync-ok" : "account-card-alert"}>{message.text}</p>}
      {config && (
        <>
          <label className="toggle-switch-row">
            <span>تشغيل الربط الحيّ</span>
            <span className={`toggle-switch${config.enabled ? " toggle-switch-on" : ""}`}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => toggle(e.target.checked)} />
              <span className="toggle-switch-thumb" />
            </span>
          </label>
          <div className="live-sync-status">
            <span>
              {status ? (
                <>
                  {status.ok ? "☁️" : "⚠️"} {status.message} · <bdi dir="ltr">{new Date(status.at).toLocaleTimeString("en-GB")}</bdi>
                </>
              ) : (
                "لم تتم مزامنة بعد"
              )}
            </span>
            <button type="button" className="text-action" onClick={() => window.dispatchEvent(new Event(LIVE_SYNC_NOW_EVENT))}>
              🔄 مزامنة الآن
            </button>
          </div>
        </>
      )}
    </section>
  );
}
