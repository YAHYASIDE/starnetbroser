"use client";

import { useEffect, useState } from "react";
import { backgroundSyncCanRun, isRunningInAndroidApp, openOverlaySettings } from "@/lib/localBrowser";
import { isRepWorkspace } from "@/lib/repMode";
import { DEFAULT_SCHEDULED_SYNCS, hourLabel, loadScheduledSyncs, saveScheduledSyncs, type ScheduledSyncs } from "@/lib/scheduledSyncs";

const MORNING_HOURS = [5, 6, 7, 8, 9, 10];
const NIGHT_HOURS = [20, 21, 22, 23, 0];

/** ⏰ «مزامنات مجدولة» (settings → 🔄 المزامنة التلقائية) - his Oct 17 2026 choices. */
export function ScheduledSyncsSection() {
  const [value, setValue] = useState<ScheduledSyncs>(DEFAULT_SCHEDULED_SYNCS);
  const [canRun, setCanRun] = useState<boolean | null>(null);
  const [rep, setRep] = useState(false);
  useEffect(() => {
    setValue(loadScheduledSyncs());
    setRep(isRepWorkspace());
    const check = () => void backgroundSyncCanRun().then(setCanRun);
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  if (!isRunningInAndroidApp()) {
    return <p className="settings-hint">المزامنات المجدولة تعمل داخل تطبيق أندرويد فقط.</p>;
  }

  function change(next: Partial<ScheduledSyncs>) {
    const merged = { ...value, ...next };
    setValue(merged);
    saveScheduledSyncs(merged);
  }

  const needsPhone = value.morning || value.payment || value.retry;

  return (
    <section className="section">
      <h2 className="section-title">⏰ مزامنات مجدولة</h2>
      <div className="scheduled-syncs">
        <Toggle label="🌅 صباح أجهزة اليوم وغدًا" checked={value.morning} onChange={(morning) => change({ morning })} />
        {(value.morning || value.payment) && (
          <label className="form-field">
            <span>ساعة مزامنة الصباح</span>
            <select className="search-input" value={value.morningHour} onChange={(e) => change({ morningHour: Number(e.target.value) })}>
              {MORNING_HOURS.map((h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
        )}
        <p className="settings-hint">كل صباح تُزامَن وحدها الأجهزة التي تتجدد اليوم وغدًا، والتقرير يصلك على البوت.</p>

        <Toggle label="💳 فحص الدفع بعد التجديد" checked={value.payment} onChange={(payment) => change({ payment })} />
        <p className="settings-hint">في نفس مزامنة الصباح: أجهزة الأمس - هل أخذت ستارلينك الدفع أم توقف الجهاز؟ رسالة ⛔ لكل جهاز لم يُدفع.</p>

        <Toggle label="🔁 الإكمال وحده بعد خطأ 429" checked={value.retry} onChange={(retry) => change({ retry })} />
        <p className="settings-hint">إذا أوقفت ستارلينك المزامنة لكثرة الطلبات، تُكمَل الأجهزة الباقية وحدها في الخلفية بعد 21 دقيقة (مرتين على الأكثر).</p>

        <Toggle label="🌙 ملخص المزامنة آخر الليل" checked={value.night} onChange={(night) => change({ night })} />
        {value.night && (
          <label className="form-field">
            <span>وقت الملخص</span>
            <select className="search-input" value={value.nightHour} onChange={(e) => change({ nightHour: Number(e.target.value) })}>
              {NIGHT_HOURS.map((h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
        )}
        <p className="settings-hint">رسالة منفصلة على البوت: كم جهازًا تمت مزامنته، ومن خرجت جلسته، وما لم يُقرأ، والأجهزة المتوقفة.</p>

        {!rep && (
          <>
            <Toggle label="📤 نسخة المندوب تلقائيًا" checked={value.repCopy} onChange={(repCopy) => change({ repCopy })} />
            <p className="settings-hint">
              بعد 10 دقائق من آخر تغيير على أجهزة مندوب (جهاز جديد أو تغيّر زبونه) تُرسل له نسخته وحدها عبر بوت المندوبين -
              ما دام التطبيق مفتوحًا، وإلا فعند فتحه.
            </p>
          </>
        )}

        {needsPhone && canRun === false && (
          <>
            <p className="account-card-alert ledger-form-error">تحتاج إذن «الظهور فوق التطبيقات» لتعمل المزامنة وحدها.</p>
            <button type="button" className="dialog-primary" onClick={() => void openOverlaySettings()}>
              اسمح بـ«الظهور فوق التطبيقات»
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-switch-row">
      <span>{label}</span>
      <span className={`toggle-switch${checked ? " toggle-switch-on" : ""}`}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggle-switch-thumb" />
      </span>
    </label>
  );
}
