"use client";

import { useEffect, useState } from "react";
import { DEVICE_LINK_EVENT, DEVICE_LINK_NOW_EVENT } from "@/components/DeviceLinkRunner";
import { CLOUD_RULES } from "@/lib/cloudDb";
import { browserLinkStorage, isMainMember, loadCloud, moveTeamToCloud, type CloudState, type LinkConfig } from "@/lib/deviceLink";

/**
 * ☁️ «Firebase القاعدة الرئيسية» (his Nov 25 2026 choice - lib/cloudDb.ts): on the main phone the steps (Blaze with a
 * 10$ budget, the new rules) and «انقل الفريق»; on the others, where they stand. The old link keeps running beside it.
 */
export function CloudDbSection({ config }: { config: LinkConfig }) {
  const [cloud, setCloud] = useState<CloudState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const load = () => setCloud(loadCloud(browserLinkStorage()));
    load();
    window.addEventListener(DEVICE_LINK_EVENT, load);
    const t = window.setInterval(load, 5000);
    return () => {
      window.removeEventListener(DEVICE_LINK_EVENT, load);
      window.clearInterval(t);
    };
  }, []);
  if (!cloud) return null;
  const main = isMainMember(config.memberId);

  async function move() {
    setBusy(true);
    setNote(null);
    const r = await moveTeamToCloud(browserLinkStorage(), undefined, (text) => setNote({ ok: true, text }));
    setBusy(false);
    setCloud(loadCloud(browserLinkStorage()));
    setNote(r.ok ? { ok: true, text: `✅ رُفع ${r.sent} سجل وعدّها الخادم: ${r.counted}. المسؤولون ينضمون وحدهم خلال دقيقة.` } : { ok: false, text: r.message });
    if (r.ok) window.dispatchEvent(new Event(DEVICE_LINK_NOW_EVENT));
  }

  return (
    <div className="menus-card cloud-db">
      <strong>☁️ Firebase القاعدة الرئيسية</strong>
      {cloud.on ? (
        <>
          <p className="settings-hint">
            ✅ هذا الهاتف على قاعدة Firebase: كل سجل محفوظ على الخادم، وكل هاتف يأخذ ما ينقصه منه ولو كانت الهواتف الأخرى مطفأة. الربط القديم يعمل بجانبه
            مؤقتًا.
          </p>
          {cloud.moved && (
            <p className="settings-hint">
              نُقل الفريق <bdi dir="ltr">{new Date(cloud.moved.at).toLocaleString("en-GB")}</bdi>: <bdi dir="ltr">{cloud.moved.counted}</bdi> سجل على الخادم.
            </p>
          )}
          {cloud.lastMessage && <p className="settings-hint">{cloud.lastMessage}</p>}
          {cloud.tooBig && cloud.tooBig.length > 0 && <p className="settings-hint">⚠️ {cloud.tooBig.length} سجل أكبر من حد Firebase - يبقى على الربط القديم.</p>}
        </>
      ) : main ? (
        <>
          <p className="settings-hint">كل بياناتك تصبح على خادم Google، وكل هاتف في الفريق يقرأ منه ويكتب فيه. لا يُحذف شيء من هاتفك، والربط الحالي يبقى يعمل بجانبه.</p>
          <ol className="settings-hint device-link-steps-list">
            <li>
              Firebase ← ⚙️ ← Usage and billing ← <bdi dir="ltr">Modify plan</bdi> ← <bdi dir="ltr">Blaze</bdi> (بطاقة دفع). ثم في Google Cloud ← Billing ←
              <bdi dir="ltr"> Budgets &amp; alerts</bdi>: ميزانية <bdi dir="ltr">10$</bdi> مع تنبيه عند <bdi dir="ltr">50%</bdi> و<bdi dir="ltr">100%</bdi>.
            </li>
            <li>
              Firestore Database ← Rules: امسح القديم والصق القواعد الجديدة ← Publish. (تحمي السجلات: فقط هواتف فريقك.)
              <div className="agent-actions">
                <button
                  type="button"
                  className="text-action"
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(CLOUD_RULES)
                      .then(() => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1500);
                      })
                      .catch(() => undefined);
                  }}
                >
                  {copied ? "✓ نُسخت" : "📋 انسخ القواعد الجديدة"}
                </button>
              </div>
            </li>
            <li>خذ نسخة احتياطية كاملة (للأمان)، ثم اضغط الزر. يرفع كل السجلات ثم يعدّها الخادم - إن نقص شيء لا ينتقل أحد.</li>
          </ol>
          <button type="button" className="dialog-primary" disabled={busy} onClick={() => void move()}>
            {busy ? "⏳ جارٍ النقل…" : "☁️ انقل الفريق إلى Firebase"}
          </button>
        </>
      ) : (
        <p className="settings-hint">⏳ ينتظر أن ينقل الهاتف الرئيسي الفريق إلى Firebase - بعدها ينضم هذا الهاتف وحده.{cloud.lastMessage ? ` (${cloud.lastMessage})` : ""}</p>
      )}
      {note && <p className={note.ok ? "settings-hint" : "account-card-alert"}>{note.text}</p>}
    </div>
  );
}
