"use client";

import { useEffect, useState } from "react";
import { DEVICE_LINK_EVENT, DEVICE_LINK_NOW_EVENT, TEAM_SESSIONS_EVENT, TEAM_SESSIONS_NOW_EVENT, TEAM_SESSIONS_PROGRESS_EVENT } from "@/components/DeviceLinkRunner";
import { activityLine, COUNTED_STORES, type TeamActivity } from "@/lib/teamActivity";
import { MISSING_REASON_TEXT, sessionsNoteText, type MissingReason, type SessionRoundResult } from "@/lib/teamSessions";
import { demoAccounts } from "@/lib/demoData";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { isDesktopApp } from "@/lib/desktop";
import {
  approvePendingDeletion,
  browserLinkStorage,
  clearConflicts,
  compareCounts,
  isMainMember,
  loadPendingDeletions,
  MAIN_MEMBER,
  rejectPendingDeletion,
  type PendingDeletion,
  confirmHeldDeletion,
  joinAsMember,
  linkCode,
  loadActivityLog,
  loadConflicts,
  loadTeam,
  loadLinkConfig,
  loadLinkState,
  newPhoneLink,
  readLinkCode,
  renameMember,
  resetLink,
  saveLinkConfig,
  startAsPhone,
  type LinkConfig,
  type LinkState,
  type StoredConflict,
  type TeamMember,
} from "@/lib/deviceLink";
import { readDocument, writeDocument } from "@/lib/firestoreRest";
import { loadLiveSyncConfig } from "@/lib/liveSyncConfig";

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /starnet/{space}/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`;

/** Store keys → what he calls them (the conflicts list). */
const STORE_NAMES: Record<string, string> = {
  starnet_demo_accounts_v1: "الأجهزة",
  starnet_clients_v1: "الزبائن",
  starnet_customer_ledger_v1: "عمليات الأجهزة",
  starnet_store_invoices_v1: "الفواتير",
  starnet_store_items_v1: "أصناف المتجر",
  starnet_cash_entries_v1: "الكاش",
  starnet_rep_settlements_v1: "تسويات المندوبين",
  starnet_representatives_v1: "المندوبون",
};
const storeName = (key: string) => STORE_NAMES[key] ?? key.replace(/^starnet_/, "").replace(/_v\d+$/, "");

async function testConnection(config: LinkConfig): Promise<{ ok: true } | { ok: false; message: string }> {
  const path = `starnet/${config.spaceId}/tests/ping`;
  const written = await writeDocument(config, path, { at: new Date().toISOString() });
  if (!written.ok) return written;
  const read = await readDocument(config, path);
  return read.ok ? { ok: true } : read;
}

/**
 * 🔗 Settings → «ربط الأجهزة (الفريق)» (his Oct 24 2026 choice «اتجاهان مباشرة», his own Firebase; since Oct 31 2026 a
 * team - his phone, the laptop, «المسؤول 2»'s phone): on his phone, the Firebase steps + apiKey / projectId → «📋 رمز
 * الربط»; on another phone or the laptop, a name and that code (its data is replaced by the team's). Then the team,
 * the status, «مزامنة الآن», «📥 خذ جلسات الفريق», what came from the others, held mass deletions and conflicts.
 */
export function DeviceLinkSection() {
  const desktop = isDesktopApp();
  const [config, setConfig] = useState<LinkConfig | null>(null);
  const [state, setState] = useState<LinkState | null>(null);
  const [conflicts, setConflicts] = useState<StoredConflict[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [projectId, setProjectId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [log, setLog] = useState<TeamActivity[]>([]);
  const [joining, setJoining] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [sessionsNote, setSessionsNote] = useState<string | null>(null);
  const [sessionsProgress, setSessionsProgress] = useState<{ done: number; total: number } | null>(null);
  const [missing, setMissing] = useState<{ id: string; reason: MissingReason }[]>([]);
  const [pending, setPending] = useState<PendingDeletion[]>([]);

  function refresh() {
    const s = browserLinkStorage();
    setConfig(loadLinkConfig(s));
    setState(loadLinkState(s));
    setConflicts(loadConflicts(s));
    setTeam(loadTeam(s));
    setLog(loadActivityLog(s));
    setPending(loadPendingDeletions(s));
  }

  useEffect(() => {
    refresh();
    // The reps' Firebase, if he made one already, is the same project.
    const old = loadLiveSyncConfig();
    if (old) {
      setApiKey(old.apiKey);
      setProjectId(old.projectId);
    }
    setMemberName(desktop ? "اللابتوب" : "المسؤول 2");
    const onSessions = (e: Event) => {
      const r = (e as CustomEvent<SessionRoundResult>).detail;
      setSessionsNote(sessionsNoteText(r));
      setSessionsProgress(null);
      setMissing(r.missing ?? []);
    };
    const onSessionsProgress = (e: Event) => setSessionsProgress((e as CustomEvent<{ done: number; total: number }>).detail);
    window.addEventListener(TEAM_SESSIONS_EVENT, onSessions);
    window.addEventListener(TEAM_SESSIONS_PROGRESS_EVENT, onSessionsProgress);
    window.addEventListener(DEVICE_LINK_EVENT, refresh);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener(DEVICE_LINK_EVENT, refresh);
      window.removeEventListener(TEAM_SESSIONS_EVENT, onSessions);
      window.removeEventListener(TEAM_SESSIONS_PROGRESS_EVENT, onSessionsProgress);
      window.clearInterval(timer);
    };
  }, []);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt("انسخ:", text);
    }
  }

  async function linkPhone() {
    const made = newPhoneLink(apiKey, projectId);
    if (!made.ok) return setMessage({ ok: false, text: made.message });
    setBusy(true);
    setMessage({ ok: true, text: "⏳ أجرّب الاتصال بـ Firebase…" });
    const tested = await testConnection(made.config);
    setBusy(false);
    if (!tested.ok) return setMessage({ ok: false, text: `✗ ${tested.message}` });
    startAsPhone(browserLinkStorage(), made.config);
    refresh();
    setMessage({ ok: true, text: "✓ الاتصال يعمل - انسخ «رمز الربط» وألصقه في برنامج اللابتوب." });
    window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT));
  }

  async function linkLaptop() {
    const read = readLinkCode(code);
    if (!read.ok) return setMessage({ ok: false, text: read.message });
    if (!memberName.trim()) return setMessage({ ok: false, text: "اكتب اسمًا لهذا الجهاز (مثلًا: المسؤول 2)" });
    if (!window.confirm(`الانضمام إلى الفريق باسم «${memberName.trim()}»؟\n\nكل البيانات الموجودة الآن على هذا الجهاز تُستبدل ببيانات الفريق، ثم يبقى متزامنًا معهم.`)) return;
    setBusy(true);
    setMessage({ ok: true, text: "⏳ أجرّب الاتصال…" });
    const tested = await testConnection(read.config);
    setBusy(false);
    if (!tested.ok) return setMessage({ ok: false, text: `✗ ${tested.message}` });
    joinAsMember(browserLinkStorage(), read.config, memberName);
    setCode("");
    refresh();
    setMessage({ ok: true, text: "✓ انضم - تصل بيانات الفريق خلال دقيقة (وأحدهم مفتوح على التطبيق)." });
    window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT));
  }

  function toggle(enabled: boolean) {
    if (!config) return;
    saveLinkConfig(browserLinkStorage(), { ...config, enabled });
    refresh();
    if (enabled) window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT));
  }

  function unlink() {
    if (!window.confirm("فك الربط؟ تبقى البيانات على هذا الجهاز كما هي، ولا تصله تغييرات الفريق بعد الآن.")) return;
    resetLink(browserLinkStorage());
    refresh();
    setMessage(null);
  }

  const status = state?.lastAt ? (
    <>
      {state.lastOk ? "☁️" : "⚠️"} {state.lastMessage} · <bdi dir="ltr">{new Date(state.lastAt).toLocaleTimeString("en-GB")}</bdi>
    </>
  ) : (
    "لم تتم مزامنة بعد"
  );

  return (
    <section className="section device-link">
      <p className="settings-hint">
        البيانات نفسها على كل أجهزة الفريق (هاتفك، اللابتوب، هاتف «المسؤول 2»…): ما يسجّله أحدهم يظهر عند الكل خلال ثوانٍ (نحو 10)،
        والتطبيق مفتوح. عبر Firebase الخاص بك، والبيانات مشفّرة قبل أن تخرج من الجهاز.
      </p>

      {!config && !desktop && (
        <div className="report-period-row" role="tablist" aria-label="الربط">
          <button type="button" className={`report-period-btn${!joining ? " report-period-btn-active" : ""}`} onClick={() => setJoining(false)}>
            🆕 أنشئ الربط (هاتفي)
          </button>
          <button type="button" className={`report-period-btn${joining ? " report-period-btn-active" : ""}`} onClick={() => setJoining(true)}>
            🔗 انضم برمز (المسؤول 2)
          </button>
        </div>
      )}

      {!config && !desktop && !joining && (
        <>
          <details className="device-link-steps" open={!apiKey}>
            <summary>📋 خطوات Firebase (مرة واحدة، مجانًا)</summary>
            <ol>
              <li>
                افتح <bdi dir="ltr">console.firebase.google.com</bdi> بحساب <bdi dir="ltr">starnet.om@gmail.com</bdi>، ثم:{" "}
                <bdi dir="ltr" className="device-link-path">Create a project → starnet-link → (Analytics: off) → Create</bdi>
              </li>
              <li>
                الدخول المجهول: <bdi dir="ltr" className="device-link-path">Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save</bdi>
              </li>
              <li>
                قاعدة البيانات: <bdi dir="ltr" className="device-link-path">Build → Firestore Database → Create database → eur3 → Production mode → Create</bdi>
              </li>
              <li>
                القواعد: <bdi dir="ltr" className="device-link-path">Firestore → Rules</bdi> احذف ما فيه والصق هذا ثم <bdi dir="ltr">Publish</bdi>:
                <pre className="device-link-rules" dir="ltr">{RULES}</pre>
                <button type="button" className="text-action" onClick={() => void copy(RULES, "rules")}>
                  {copied === "rules" ? "✓ نُسخت" : "📋 نسخ القواعد"}
                </button>
              </li>
              <li>
                المفتاح: <bdi dir="ltr" className="device-link-path">⚙️ Project settings → General → Your apps → {"</>"} Web → Register app</bdi> ثم انسخ{" "}
                <bdi dir="ltr">apiKey</bdi> و <bdi dir="ltr">projectId</bdi> من الكود الظاهر.
              </li>
              <li>الصقهما هنا واضغط «💾 احفظ وجرّب».</li>
            </ol>
          </details>
          <label className="tool-field">
            <span>apiKey</span>
            <input className="search-input" dir="ltr" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza…" />
          </label>
          <label className="tool-field">
            <span>projectId</span>
            <input className="search-input" dir="ltr" autoComplete="off" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="starnet-link" />
          </label>
          <button type="button" className="dialog-primary" disabled={busy} onClick={() => void linkPhone()}>
            💾 احفظ وجرّب
          </button>
        </>
      )}

      {!config && (desktop || joining) && (
        <>
          <ol className="settings-hint device-link-steps-list">
            <li>في هاتفك الرئيسي: الإعدادات ← النسخ الاحتياطي ← «🔗 ربط الأجهزة» (بعد خطوات Firebase مرة واحدة).</li>
            <li>اضغط هناك «📋 نسخ رمز الربط» وأرسله لهذا الجهاز (تيليغرام / واتساب) - الرمز سرّي.</li>
            <li>اكتب اسمًا لهذا الجهاز، الصق الرمز واضغط «🔗 اربط».</li>
          </ol>
          <label className="tool-field">
            <span>اسم هذا الجهاز (يظهر على ما يسجّله)</span>
            <input className="search-input" value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="المسؤول 2" />
          </label>
          <textarea className="search-input device-link-code" dir="ltr" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="STARNET-LINK-…" />
          <button type="button" className="dialog-primary" disabled={busy || !code.trim()} onClick={() => void linkLaptop()}>
            🔗 اربط
          </button>
        </>
      )}

      {config && (
        <>
          <p className="device-link-linked">
            ✅ مربوط - هذا الجهاز: «{config.name}»{" "}
            <button
              type="button"
              className="text-action"
              onClick={() => {
                const name = window.prompt("اسم هذا الجهاز في الفريق:", config.name);
                if (!name?.trim()) return;
                renameMember(browserLinkStorage(), name);
                refresh();
                window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT));
              }}
            >
              ✎ الاسم
            </button>
          </p>
          {team.length > 0 && (
            <p className="settings-hint device-link-team">
              👥 الفريق: {team.map((m) => `${m.name}${isMainMember(m.id) ? " ⭐" : ""}${m.id === config.memberId ? " (هذا)" : ""}`).join(" · ")}
              {team.some((m) => isMainMember(m.id)) && <span className="device-link-main-note"> · ⭐ الرئيسي: نسخته تفوز في التعارض، والحذف من غيره ينتظر موافقته</span>}
            </p>
          )}
          <div className="device-link-code-box">
            <span>لإضافة عضو (اللابتوب، المسؤول 2…): انسخ رمز الربط وأرسله له - سرّي، من يملكه يرى كل شيء.</span>
            <button type="button" className="dialog-secondary" onClick={() => void copy(linkCode(config), "code")}>
              {copied === "code" ? "✓ نُسخ" : "📋 نسخ رمز الربط"}
            </button>
          </div>
          <label className="toggle-switch-row">
            <span>تشغيل الربط</span>
            <span className={`toggle-switch${config.enabled ? " toggle-switch-on" : ""}`}>
              <input type="checkbox" checked={config.enabled} onChange={(e) => toggle(e.target.checked)} />
              <span className="toggle-switch-thumb" />
            </span>
          </label>
          <div className="live-sync-status">
            <span>{status}</span>
            <button type="button" className="text-action" onClick={() => window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT))}>
              🔄 مزامنة الآن
            </button>
          </div>

          {state?.progress && state.progress.total > 0 && state.progress.done < state.progress.total && (
            <LinkProgress label="📥 نسخ البيانات من الفريق" done={state.progress.done} total={state.progress.total} />
          )}

          <CopyCheck config={config} state={state} team={team} />

          {pending.length > 0 && (
            <div className="device-link-pending" role="alert">
              <strong>🗑️ حذف من الفريق بانتظار موافقتك ({pending.length})</strong>
              {pending.map((p) => (
                <div key={p.id} className="device-link-pending-item">
                  <span>
                    <b>{p.byName}</b> حذف: {p.labels.length ? p.labels.join("، ") : `${p.ops.length} سجل`} · <bdi dir="ltr">{new Date(p.at).toLocaleString("en-GB")}</bdi>
                  </span>
                  <div className="device-link-pending-actions">
                    <button
                      type="button"
                      className="dialog-secondary device-link-pending-yes"
                      onClick={() => {
                        if (!window.confirm(`حذف ${p.labels.join("، ") || "هذه السجلات"} من هذا الهاتف أيضًا؟`)) return;
                        const changed = approvePendingDeletion(browserLinkStorage(), p.id);
                        if (changed.length > 0) window.location.reload();
                        else refresh();
                      }}
                    >
                      ✓ احذفها هنا أيضًا
                    </button>
                    <button
                      type="button"
                      className="dialog-secondary"
                      onClick={() => {
                        rejectPendingDeletion(browserLinkStorage(), p.id);
                        refresh();
                        window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT));
                      }}
                    >
                      ✗ أبقِها (تعود عنده)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {team.length > 1 && (
            <div className="live-sync-status">
              <span>{sessionsNote ?? "🔐 جلسات Starlink تُنقل كل 30 دقيقة (للأجهزة غير المسجّلة هنا)"}</span>
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  if (!window.confirm("أخذ أحدث جلسات Starlink من الفريق لكل الأجهزة؟ تُستبدل الجلسات الموجودة هنا بالأحدث.")) return;
                  setSessionsNote("⏳ يأخذ الجلسات…");
                  window.dispatchEvent(new Event(TEAM_SESSIONS_NOW_EVENT));
                }}
              >
                📥 خذ جلسات الفريق
              </button>
            </div>
          )}

          {sessionsProgress && sessionsProgress.total > 0 && <LinkProgress label="🔐 نقل الجلسات" done={sessionsProgress.done} total={sessionsProgress.total} />}

          {missing.length > 0 && !sessionsProgress && <MissingSessions missing={missing} />}

          {log.length > 0 && (
            <details className="device-link-conflicts device-link-log">
              <summary>📜 ماذا وصل من الفريق ({log.length})</summary>
              <ul>
                {log.slice(0, 80).map((a, i) => (
                  <li key={i}>
                    <b>{a.by}</b>: {activityLine(a)} · <bdi dir="ltr">{new Date(a.at).toLocaleString("en-GB")}</bdi>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {(state?.held ?? []).map((h) => (
            <div key={h.k} className="account-card-alert device-link-held">
              <span>
                ⚠️ حُذف {h.count} من {h.total} في «{storeName(h.k)}» دفعة واحدة - لم يُرسل للفريق حتى تؤكد أنك حذفتها فعلًا.
              </span>
              <button
                type="button"
                className="dialog-secondary"
                onClick={() => {
                  confirmHeldDeletion(browserLinkStorage(), h.k);
                  window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT));
                  refresh();
                }}
              >
                نعم حذفتها
              </button>
            </div>
          ))}

          {conflicts.length > 0 && (
            <details className="device-link-conflicts">
              <summary>⚖️ تعارضات ({conflicts.length}) - نفس الشيء عُدّل في جهازين</summary>
              <p className="settings-hint">بقي التعديل الأحدث. هذه القائمة للمراجعة: إن كان القديم هو الصحيح فعدّله من مكانه.</p>
              <ul>
                {conflicts.slice(0, 50).map((c, i) => (
                  <li key={i}>
                    «{storeName(c.k)}» · <bdi dir="ltr">{c.r.split("\u001f").pop()?.slice(-8)}</bdi> · بقي تعديل {c.kept === "local" ? "هذا الجهاز" : "عضو آخر"} ·{" "}
                    <bdi dir="ltr">{new Date(c.seenAt).toLocaleString("en-GB")}</bdi>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="text-action"
                onClick={() => {
                  clearConflicts(browserLinkStorage());
                  refresh();
                }}
              >
                مسح القائمة
              </button>
            </details>
          )}

          <button type="button" className="text-action device-link-unlink" onClick={unlink}>
            ✕ فك الربط
          </button>
        </>
      )}

      {message && <p className={message.ok ? "settings-hint live-sync-ok" : "account-card-alert"}>{message.text}</p>}
    </section>
  );
}

/** 📊 A bar with its % - the copy, or the sessions. */
function LinkProgress({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
  return (
    <div className="device-link-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="bulk-send-progress">
        <span>{label}</span>
        <b>
          <bdi dir="ltr">{pct}%</bdi> · <bdi dir="ltr">{done}/{total}</bdi>
        </b>
      </div>
      <div className="bulk-send-bar">
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** ✅ / ⚠️ This phone's counts against YAHYA's (on YAHYA: each member's against his). */
function CopyCheck({ config, state, team }: { config: LinkConfig; state: LinkState | null; team: TeamMember[] }) {
  if (!state?.counts || team.length < 2) return null;
  const mine = state.counts;
  const others = isMainMember(config.memberId) ? team.filter((m) => m.id !== config.memberId) : team.filter((m) => m.id === MAIN_MEMBER);
  if (others.length === 0) return null;
  const receiving = Boolean(state.progress && state.progress.done < state.progress.total);
  return (
    <div className="device-link-check">
      {others.map((m) => {
        const theirs = state.theirCounts?.[m.id];
        if (!theirs) {
          return (
            <p key={m.id} className="settings-hint">
              ⏳ لم تصل أرقام «{m.name}» بعد - حدّث تطبيقه وافتحه
            </p>
          );
        }
        const diff = compareCounts(mine, theirs.counts);
        return (
          <details key={m.id} className={`device-link-check-item${diff.length ? " device-link-check-diff" : ""}`}>
            <summary>
              {receiving ? `⏳ ينسخ… يُقارن مع «${m.name}» بعد اكتمال النسخ` : diff.length === 0 ? `✅ مطابق لـ «${m.name}»` : `⚠️ يختلف عن «${m.name}» في ${diff.length}`}
            </summary>
            <table className="device-link-check-table">
              <thead>
                <tr>
                  <th />
                  <th>هنا</th>
                  <th>{m.name}</th>
                </tr>
              </thead>
              <tbody>
                {COUNTED_STORES.map(({ k, label }) => {
                  const a = mine[k] ?? 0;
                  const b = theirs.counts[k] ?? 0;
                  return (
                    <tr key={k} className={a !== b ? "device-link-check-off" : undefined}>
                      <td>{label}</td>
                      <td>
                        <bdi dir="ltr">{a}</bdi>
                      </td>
                      <td>
                        <bdi dir="ltr">{b}</bdi>
                        {a === b ? " ✓" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="settings-hint">أرقام «{m.name}» عند آخر مزامنة له: <bdi dir="ltr">{theirs.at ? new Date(theirs.at).toLocaleString("en-GB") : "-"}</bdi> - فرق صغير لحظة التسجيل طبيعي ويختفي خلال ثوانٍ.</p>
          </details>
        );
      })}
    </div>
  );
}

/** 📵 The devices still signed out here after the sessions round, by name, and why. */
function MissingSessions({ missing }: { missing: { id: string; reason: MissingReason }[] }) {
  const names = new Map(loadDemoAccounts(demoAccounts).map((a) => [a.id, a.name || a.starlinkAccountEmail || a.id]));
  return (
    <details className="device-link-conflicts device-link-missing">
      <summary>📵 أجهزة بلا دخول هنا ({missing.length})</summary>
      <ul>
        {missing.slice(0, 300).map((m) => (
          <li key={m.id}>
            <b>{names.get(m.id) ?? m.id}</b>: {MISSING_REASON_TEXT[m.reason]}
          </li>
        ))}
      </ul>
    </details>
  );
}

