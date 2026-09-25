"use client";

import { useEffect, useState } from "react";
import { checkHealth, listAccounts, login, register } from "@/lib/apiClient";
import { ApiError } from "@/lib/apiClient";
import {
  clearTokens,
  getApiBaseUrl,
  getDefaultInvoiceCurrency,
  getThemePreference,
  isDemoMode,
  isHelpModeEnabled,
  isLoggedIn,
  isRemindersBadgeEnabled,
  recordBackupExported,
  setApiBaseUrl,
  setDefaultInvoiceCurrency,
  setHelpModeEnabled,
  setRemindersBadgeEnabled,
  setThemePreference,
  ThemePreference,
} from "@/lib/settingsStore";
import { LEDGER_CURRENCIES, LEDGER_CURRENCY_LABELS, LedgerCurrency } from "@/lib/ledgerStore";
import { loadDemoAccounts, saveDemoAccounts } from "@/lib/demoAccountStore";
import { collectAppData, createEncryptedBackupFile, mergeImportedAccounts, readEncryptedBackupFile, restoreAppData } from "@/lib/accountBackup";
import { exportAccountSessions, importAccountSessions, isRunningInAndroidApp, openNotificationSettings } from "@/lib/localBrowser";
import { saveAndShareBackupFile } from "@/lib/backupFile";
import { APK_DOWNLOAD_URL, checkForAppUpdate, CURRENT_COMMIT, UpdateCheckResult } from "@/lib/appUpdate";
import { getMorningDigestHour, isMorningDigestEnabled, setMorningDigestEnabled, setMorningDigestHour } from "@/lib/morningNotifications";
import { getAutoBackupLastRun, getAutoBackupPassword, setAutoBackupPassword } from "@/lib/autoBackup";
import { runAutoBackup, shareLatestAutoBackup } from "@/lib/autoBackupRunner";
import { BusinessProfile, loadBusinessProfile, saveBusinessProfile } from "@/lib/pdfDocument";
import { clearAppPin, hasAppPin, setAppPin, verifyAppPin } from "@/lib/appLock";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "داكن (الافتراضي)" },
  { value: "light", label: "فاتح" },
  { value: "system", label: "حسب الجهاز" },
];

export default function SettingsPage() {
  const [url, setUrl] = useState("");
  const [testResult, setTestResult] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [helpMode, setHelpMode] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState<string>("MRU");
  const [remindersBadgeEnabled, setRemindersBadgeEnabledState] = useState(true);
  const [isAndroidApp, setIsAndroidApp] = useState(false);

  useEffect(() => {
    setUrl(getApiBaseUrl());
    setLoggedIn(isLoggedIn());
    setTheme(getThemePreference());
    setHelpMode(isHelpModeEnabled());
    setDefaultCurrency(getDefaultInvoiceCurrency());
    setRemindersBadgeEnabledState(isRemindersBadgeEnabled());
    setIsAndroidApp(isRunningInAndroidApp());
  }, []);

  function handleThemeChange(next: ThemePreference) {
    setTheme(next);
    setThemePreference(next);
  }

  function handleHelpModeChange(next: boolean) {
    setHelpMode(next);
    setHelpModeEnabled(next);
  }

  function handleDefaultCurrencyChange(next: string) {
    setDefaultCurrency(next);
    setDefaultInvoiceCurrency(next);
  }

  function handleRemindersBadgeChange(next: boolean) {
    setRemindersBadgeEnabledState(next);
    setRemindersBadgeEnabled(next);
  }

  async function handleSave() {
    setApiBaseUrl(url);
    setTestResult("testing");
    const ok = url ? await checkHealth() : true;
    setTestResult(ok ? "ok" : "fail");
  }

  async function handleAuth(mode: "login" | "register") {
    setAuthBusy(true);
    setAuthError(null);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
      setLoggedIn(true);
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : "حدث خطأ غير متوقع");
    } finally {
      setAuthBusy(false);
    }
  }

  function handleLogout() {
    clearTokens();
    setLoggedIn(false);
  }

  return (
    <main className="home">
      <h1 className="section-title">الإعدادات</h1>

      <section className="section">
        <h2 className="section-title">المظهر</h2>
        <p className="settings-hint">اختر مظهر التطبيق - يمكنك اختيار الوضع الداكن يدويًا بدل الاعتماد على إعداد الجهاز.</p>
        <div className="theme-option-row">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`theme-option-btn${theme === opt.value ? " theme-option-btn-active" : ""}`}
              onClick={() => handleThemeChange(opt.value)}
              aria-pressed={theme === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <BusinessProfileSection />

      <AppUpdateSection />

      <AutoBackupSection />

      <section className="section">
        <h2 className="section-title">المساعدة الذكية</h2>
        <p className="settings-hint">
          عند التفعيل، تظهر تلميحات قصيرة تشرح لك كيفية استخدام أهم الشاشات خطوة بخطوة.
        </p>
        <label className="toggle-switch-row">
          <span>تفعيل المساعدة والشرح</span>
          <span className={`toggle-switch${helpMode ? " toggle-switch-on" : ""}`}>
            <input
              type="checkbox"
              checked={helpMode}
              onChange={(e) => handleHelpModeChange(e.target.checked)}
            />
            <span className="toggle-switch-thumb" />
          </span>
        </label>
      </section>

      <section className="section">
        <h2 className="section-title">العملة الافتراضية للفواتير</h2>
        <p className="settings-hint">
          العملة التي تبدأ بها كل فاتورة جديدة في المتجر - يمكنك دائمًا تغييرها لفاتورة معيّنة عند إنشائها.
        </p>
        <div className="theme-option-row">
          {LEDGER_CURRENCIES.map((code) => (
            <button
              key={code}
              type="button"
              className={`theme-option-btn${defaultCurrency === code ? " theme-option-btn-active" : ""}`}
              onClick={() => handleDefaultCurrencyChange(code)}
              aria-pressed={defaultCurrency === code}
            >
              {LEDGER_CURRENCY_LABELS[code as LedgerCurrency]}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">التذكيرات والإشعارات</h2>
        <p className="settings-hint">
          يمكنك إخفاء الرقم الظاهر فوق أيقونة التذكيرات في الأعلى دون التأثير على التذكيرات نفسها -
          تبقى صفحة التذكيرات وكل تنبيهاتها كما هي.
        </p>
        <label className="toggle-switch-row">
          <span>إظهار عدد التذكيرات فوق الأيقونة</span>
          <span className={`toggle-switch${remindersBadgeEnabled ? " toggle-switch-on" : ""}`}>
            <input
              type="checkbox"
              checked={remindersBadgeEnabled}
              onChange={(e) => handleRemindersBadgeChange(e.target.checked)}
            />
            <span className="toggle-switch-thumb" />
          </span>
        </label>
        <MorningDigestSettings />
        {isAndroidApp && (
          <div className="settings-actions" style={{ marginTop: "12px" }}>
            <button className="btn-icon" onClick={() => openNotificationSettings()}>
              إعدادات إشعارات التطبيق (النظام)
            </button>
          </div>
        )}
        <p className="settings-hint">
          إشعارات المزامنة (نجاح/فشل التحديث) وإشعارات التذكيرات (تجديد/دين/نسخة احتياطية) تُتحكَّم
          بها من إعدادات إشعارات النظام لتطبيق STAR NET - الزر أعلاه يفتحها مباشرة.
        </p>
      </section>

      <AppLockSection />

      <section className="section">
        <h2 className="section-title">عنوان الخادم</h2>
        <p className="settings-hint">
          اتركه فارغًا للبقاء في وضع العرض التجريبي (بيانات وهمية). أدخل عنوان الـ API الحقيقي للانتقال إلى بياناتك الفعلية.
        </p>
        <input
          className="search-input"
          type="url"
          placeholder="https://api.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <div className="settings-actions">
          <button className="btn-icon" onClick={handleSave}>
            حفظ واختبار الاتصال
          </button>
          {testResult === "testing" && <span>جارِ الاختبار…</span>}
          {testResult === "ok" && <span className="conn-badge conn-ok">تم الاتصال بنجاح</span>}
          {testResult === "fail" && <span className="conn-badge conn-error">تعذّر الاتصال بهذا العنوان</span>}
        </div>
      </section>

      {url && (
        <section className="section">
          <h2 className="section-title">حساب STAR NET</h2>
          {loggedIn ? (
            <button className="btn-icon" onClick={handleLogout}>
              تسجيل الخروج
            </button>
          ) : (
            <div className="auth-form">
              <input
                className="search-input"
                type="email"
                placeholder="البريد الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="search-input"
                type="password"
                placeholder="كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {authError && <div className="account-card-alert">{authError}</div>}
              <div className="settings-actions">
                <button className="btn-icon" disabled={authBusy} onClick={() => handleAuth("login")}>
                  دخول
                </button>
                <button className="btn-icon" disabled={authBusy} onClick={() => handleAuth("register")}>
                  إنشاء حساب
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <BackupSection />
    </main>
  );
}

const MIN_PIN_LENGTH = 4;

type AppLockMode = "idle" | "setNew" | "change" | "remove";

/** "قفل التطبيق": a PIN requested once whenever the app is opened (AppLockGate.tsx) - lives
 * entirely in appLock.ts (PBKDF2 hash, never plaintext). Changing or removing an existing PIN
 * always requires re-entering the current one first, same as any password-change flow. */
function AppLockSection() {
  const [pinSet, setPinSet] = useState(false);
  const [mode, setMode] = useState<AppLockMode>("idle");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => setPinSet(hasAppPin()), []);

  function resetForm() {
    setMode("idle");
    setCurrentPin("");
    setNewPin("");
    setNewPinConfirm("");
    setMessage(null);
  }

  async function handleSetNew() {
    setMessage(null);
    if (newPin.length < MIN_PIN_LENGTH) {
      setMessage(`الرمز يجب أن يكون ${MIN_PIN_LENGTH} أرقام على الأقل`);
      return;
    }
    if (newPin !== newPinConfirm) {
      setMessage("الرمزان غير متطابقين");
      return;
    }
    setBusy(true);
    try {
      await setAppPin(newPin);
      setPinSet(true);
      resetForm();
    } finally {
      setBusy(false);
    }
  }

  async function handleChange() {
    setMessage(null);
    if (newPin.length < MIN_PIN_LENGTH) {
      setMessage(`الرمز الجديد يجب أن يكون ${MIN_PIN_LENGTH} أرقام على الأقل`);
      return;
    }
    if (newPin !== newPinConfirm) {
      setMessage("الرمزان غير متطابقين");
      return;
    }
    setBusy(true);
    try {
      const ok = await verifyAppPin(currentPin);
      if (!ok) {
        setMessage("الرمز الحالي غير صحيح");
        return;
      }
      await setAppPin(newPin);
      resetForm();
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setMessage(null);
    setBusy(true);
    try {
      const ok = await verifyAppPin(currentPin);
      if (!ok) {
        setMessage("الرمز غير صحيح");
        return;
      }
      clearAppPin();
      setPinSet(false);
      resetForm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h2 className="section-title">قفل التطبيق</h2>
      <p className="settings-hint">
        عند التفعيل، يُطلب إدخال رمز عند كل فتح للتطبيق قبل الوصول إلى أي بيانات.
      </p>

      {mode === "idle" && (
        <div className="settings-actions">
          {!pinSet && (
            <button className="btn-icon" onClick={() => setMode("setNew")}>
              تفعيل قفل برمز
            </button>
          )}
          {pinSet && (
            <>
              <button className="btn-icon" onClick={() => setMode("change")}>
                تغيير الرمز
              </button>
              <button className="btn-icon" onClick={() => setMode("remove")}>
                إلغاء القفل
              </button>
            </>
          )}
        </div>
      )}

      {mode === "setNew" && (
        <div className="auth-form">
          <input
            className="search-input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            placeholder="رمز جديد"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/[^\d]/g, ""))}
          />
          <input
            className="search-input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            placeholder="تأكيد الرمز"
            value={newPinConfirm}
            onChange={(e) => setNewPinConfirm(e.target.value.replace(/[^\d]/g, ""))}
          />
          {message && <div className="account-card-alert">{message}</div>}
          <div className="settings-actions">
            <button className="btn-icon" disabled={busy} onClick={handleSetNew}>
              حفظ
            </button>
            <button className="btn-icon" disabled={busy} onClick={resetForm}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {mode === "change" && (
        <div className="auth-form">
          <input
            className="search-input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            placeholder="الرمز الحالي"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/[^\d]/g, ""))}
          />
          <input
            className="search-input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            placeholder="الرمز الجديد"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/[^\d]/g, ""))}
          />
          <input
            className="search-input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            placeholder="تأكيد الرمز الجديد"
            value={newPinConfirm}
            onChange={(e) => setNewPinConfirm(e.target.value.replace(/[^\d]/g, ""))}
          />
          {message && <div className="account-card-alert">{message}</div>}
          <div className="settings-actions">
            <button className="btn-icon" disabled={busy} onClick={handleChange}>
              حفظ
            </button>
            <button className="btn-icon" disabled={busy} onClick={resetForm}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {mode === "remove" && (
        <div className="auth-form">
          <input
            className="search-input"
            type="password"
            inputMode="numeric"
            maxLength={6}
            dir="ltr"
            placeholder="الرمز الحالي"
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value.replace(/[^\d]/g, ""))}
          />
          {message && <div className="account-card-alert">{message}</div>}
          <div className="settings-actions">
            <button className="btn-icon" disabled={busy} onClick={handleRemove}>
              إلغاء القفل
            </button>
            <button className="btn-icon" disabled={busy} onClick={resetForm}>
              تراجع
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const MIN_BACKUP_PASSWORD_LENGTH = 8;

function BackupSection() {
  const [exportPassword, setExportPassword] = useState("");
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  async function handleExport() {
    setExportMessage(null);
    if (exportPassword.length < MIN_BACKUP_PASSWORD_LENGTH) {
      setExportMessage(`كلمة المرور يجب أن تكون ${MIN_BACKUP_PASSWORD_LENGTH} أحرف على الأقل`);
      return;
    }
    if (exportPassword !== exportPasswordConfirm) {
      setExportMessage("كلمتا المرور غير متطابقتين");
      return;
    }

    setExportBusy(true);
    try {
      const accounts = isDemoMode() ? loadDemoAccounts([]) : await listAccounts();
      const data = collectAppData(window.localStorage);
      if (accounts.length === 0 && Object.keys(data).length === 0) {
        setExportMessage("لا توجد بيانات لتصديرها");
        return;
      }

      const sessions = await exportAccountSessions(accounts.map((a) => a.id));
      const created = await createEncryptedBackupFile(accounts, sessions, exportPassword, data);
      if (!created.ok) {
        setExportMessage(created.message);
        return;
      }

      const saved = await saveAndShareBackupFile(created.fileContents);
      setExportMessage(
        saved.ok
          ? `تم إنشاء نسخة كاملة (${accounts.length} جهاز، ${Object.keys(sessions).length} جلسة دخول، ${Object.keys(data).length} سجل بيانات: الزبائن والحسابات والمتجر والمندوبين والصندوق) - اختر أين تحفظها`
          : saved.message,
      );
      if (saved.ok) {
        recordBackupExported();
        setExportPassword("");
        setExportPasswordConfirm("");
      }
    } catch {
      setExportMessage("تعذر إنشاء النسخة الاحتياطية");
    } finally {
      setExportBusy(false);
    }
  }

  async function handleImport() {
    setImportMessage(null);
    if (!importFile) {
      setImportMessage("اختر ملف النسخة الاحتياطية أولًا");
      return;
    }
    if (!importPassword) {
      setImportMessage("أدخل كلمة المرور");
      return;
    }

    setImportBusy(true);
    try {
      const fileContents = await importFile.text();
      const result = await readEncryptedBackupFile(fileContents, importPassword);
      if (!result.ok) {
        setImportMessage(result.message);
        return;
      }
      const dataKeys = Object.keys(result.data).length;
      if (dataKeys > 0) {
        // A full (version 2) backup restores every app-data store exactly as it was - so it must
        // be confirmed, since it replaces whatever is on this phone now.
        const when = new Date(result.exportedAt).toLocaleString("ar-u-nu-latn");
        if (!window.confirm(`استعادة نسخة ${when}؟ سيتم استبدال كل البيانات الحالية على هذا الهاتف ببيانات النسخة.`)) {
          return;
        }
        restoreAppData(window.localStorage, result.data);
      } else {
        if (!isDemoMode()) {
          setImportMessage("هذه نسخة قديمة (أجهزة فقط) - استيرادها متاح فقط في الوضع المحلي");
          return;
        }
        saveDemoAccounts(mergeImportedAccounts(loadDemoAccounts([]), result.accounts));
      }
      const sessionResult = await importAccountSessions(result.sessions);
      setImportMessage(
        dataKeys > 0
          ? `تمت استعادة كل البيانات (${result.accounts.length} جهاز، ${sessionResult.importedCount} جلسة دخول). افتح الصفحة الرئيسية.`
          : `تم استيراد ${result.accounts.length} حساب و ${sessionResult.importedCount} جلسة دخول. افتح الصفحة الرئيسية لرؤيتها.`,
      );
      setImportPassword("");
      setImportFile(null);
    } catch {
      setImportMessage("تعذر قراءة الملف - تأكد من كلمة المرور");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <section className="section" id="backup">
      <h2 className="section-title">نسخة احتياطية كاملة محمية</h2>
      <p className="settings-hint">
        نسخة كاملة لكل بيانات التطبيق: الأجهزة، الزبائن والموردون، الديون والدفعات، فواتير المتجر
        والبضاعة، المندوبون، الصندوق والعملات - مع جلسات الدخول (إن وُجدت) - في ملف واحد مشفّر بكلمة
        المرور التي تختارها، لا يمكن فتحه بدونها. أرسل الملف إلى نفسك على واتساب أو احفظه في Google Drive. جلسات الدخول تُقرأ فقط من الحسابات التي فتحتها مرة واحدة على الأقل
        بزر &quot;فتح&quot;؛ حساب لم يُفتح بعد يُصدَّر بدون جلسة دخول. احتفظ بكلمة المرور في مكان
        آمن - لا توجد طريقة لاسترجاع النسخة الاحتياطية بدونها.
      </p>

      <div className="auth-form">
        <input
          className="search-input"
          type="password"
          placeholder={`كلمة مرور التصدير (${MIN_BACKUP_PASSWORD_LENGTH} أحرف على الأقل)`}
          value={exportPassword}
          onChange={(e) => setExportPassword(e.target.value)}
        />
        <input
          className="search-input"
          type="password"
          placeholder="تأكيد كلمة المرور"
          value={exportPasswordConfirm}
          onChange={(e) => setExportPasswordConfirm(e.target.value)}
        />
        <div className="settings-actions">
          <button className="btn-icon" disabled={exportBusy} onClick={handleExport}>
            {exportBusy ? "جارِ التصدير…" : "تصدير نسخة احتياطية"}
          </button>
        </div>
        {exportMessage && <div className="account-card-alert">{exportMessage}</div>}
      </div>

      <div className="auth-form" style={{ marginTop: "16px" }}>
        <input
          className="search-input"
          type="file"
          accept=".starnetbackup,application/json"
          onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
        />
        <input
          className="search-input"
          type="password"
          placeholder="كلمة مرور النسخة الاحتياطية"
          value={importPassword}
          onChange={(e) => setImportPassword(e.target.value)}
        />
        <div className="settings-actions">
          <button className="btn-icon" disabled={importBusy} onClick={handleImport}>
            {importBusy ? "جارِ الاستيراد…" : "استيراد نسخة احتياطية"}
          </button>
        </div>
        {importMessage && <div className="account-card-alert">{importMessage}</div>}
      </div>
    </section>
  );
}

/** اسم النشاط وهاتفه وعنوانه - تظهر في رأس كل كشف أو فاتورة PDF. */
function BusinessProfileSection() {
  const [profile, setProfile] = useState<BusinessProfile>({ name: "" });
  const [saved, setSaved] = useState(false);
  useEffect(() => setProfile(loadBusinessProfile()), []);

  function update(patch: Partial<BusinessProfile>) {
    setProfile((current) => ({ ...current, ...patch }));
    setSaved(false);
  }

  return (
    <section className="section">
      <h2 className="section-title">بيانات النشاط (للكشوفات و PDF)</h2>
      <p className="settings-hint">تظهر في رأس كل كشف حساب أو فاتورة تصدّرها بصيغة PDF.</p>
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          saveBusinessProfile(profile);
          setProfile(loadBusinessProfile());
          setSaved(true);
        }}
      >
        <input className="search-input" placeholder="اسم النشاط (مثال: STAR NET)" value={profile.name} onChange={(e) => update({ name: e.target.value })} />
        <input className="search-input" dir="ltr" type="tel" placeholder="هاتف النشاط (اختياري)" value={profile.phone ?? ""} onChange={(e) => update({ phone: e.target.value })} />
        <input className="search-input" placeholder="العنوان (اختياري)" value={profile.address ?? ""} onChange={(e) => update({ address: e.target.value })} />
        <button className="dialog-primary" type="submit">
          {saved ? "✓ تم الحفظ" : "حفظ بيانات النشاط"}
        </button>
      </form>
    </section>
  );
}

function AppUpdateSection() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);

  async function check() {
    setChecking(true);
    setResult(await checkForAppUpdate());
    setChecking(false);
  }

  return (
    <section className="section">
      <h2 className="section-title">تحديث التطبيق</h2>
      <p className="settings-hint">
        الإصدار الحالي: <bdi dir="ltr">{CURRENT_COMMIT.slice(0, 7)}</bdi> - يتحقق التطبيق تلقائيًا من وجود نسخة أحدث.
      </p>
      <div className="settings-actions">
        <button type="button" className="dialog-primary" onClick={check} disabled={checking}>
          {checking ? "جارِ التحقق…" : "التحقق من التحديثات الآن"}
        </button>
      </div>
      {result?.status === "current" && <p className="settings-hint">✓ لديك أحدث نسخة</p>}
      {result?.status === "unknown" && <p className="settings-hint">{result.message}</p>}
      {result?.status === "update" && (
        <a href={APK_DOWNLOAD_URL} target="_blank" rel="noreferrer" className="backup-banner update-banner">
          <span aria-hidden="true">🆕</span>
          <span>
            <strong>نسخة أحدث متوفرة (<bdi dir="ltr">{result.releaseCommit.slice(0, 7)}</bdi>)</strong>
            <small>اضغط للتنزيل ثم ثبّت فوق النسخة الحالية - بياناتك تبقى كما هي</small>
          </span>
        </a>
      )}
    </section>
  );
}

/** النسخ الاحتياطي التلقائي اليومي - see autoBackup.ts. */
function AutoBackupSection() {
  const [enabled, setEnabled] = useState(false);
  const [lastRun, setLastRun] = useState<{ date: string | null; file: string | null }>({ date: null, file: null });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [android, setAndroid] = useState(true);

  useEffect(() => {
    setAndroid(isRunningInAndroidApp());
    setEnabled(getAutoBackupPassword() !== null);
    setLastRun(getAutoBackupLastRun());
  }, []);

  async function backupNow() {
    setBusy(true);
    const accounts = isDemoMode() ? loadDemoAccounts([]) : await listAccounts().catch(() => []);
    const outcome = await runAutoBackup(accounts, true);
    setBusy(false);
    setLastRun(getAutoBackupLastRun());
    setMessage(outcome.status === "saved" ? `✓ تم حفظ نسخة اليوم${outcome.inAppStorage ? " داخل مساحة التطبيق (استخدم «مشاركة آخر نسخة» لنقلها)" : " في ملفات الهاتف (Documents/STARNET)"}` : outcome.status === "failed" ? outcome.message : "النسخ التلقائي يعمل داخل تطبيق Android فقط");
  }

  function enable() {
    if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
      setMessage(`كلمة المرور يجب أن تكون ${MIN_BACKUP_PASSWORD_LENGTH} أحرف على الأقل`);
      return;
    }
    if (password !== confirm) {
      setMessage("كلمتا المرور غير متطابقتين");
      return;
    }
    setAutoBackupPassword(password);
    setEnabled(true);
    setPassword("");
    setConfirm("");
    void backupNow();
  }

  function disable() {
    if (!window.confirm("إيقاف النسخ الاحتياطي التلقائي؟ تبقى النسخ القديمة في ملفات الهاتف.")) return;
    setAutoBackupPassword(null);
    setEnabled(false);
    setMessage(null);
  }

  return (
    <section className="section">
      <h2 className="section-title">نسخ احتياطي تلقائي يومي</h2>
      <p className="settings-hint">
        كل يوم عند فتح التطبيق تُحفظ نسخة كاملة مشفّرة في ملفات الهاتف (مجلد Documents/STARNET)، ويُحتفظ بآخر 7 نسخ.
        هذه الملفات تبقى حتى لو حذفت التطبيق. احفظ كلمة المرور جيدًا - بدونها لا يمكن استرجاع النسخة.
      </p>
      {!android && <p className="settings-hint">⚠️ يعمل داخل تطبيق Android فقط.</p>}
      {enabled ? (
        <>
          <p className="settings-hint">
            ✓ مفعّل{lastRun.date ? <> - آخر نسخة: <bdi dir="ltr">{lastRun.date}</bdi></> : " - لم تُحفظ نسخة بعد"}
          </p>
          <div className="settings-actions">
            <button type="button" className="dialog-primary" onClick={backupNow} disabled={busy}>
              {busy ? "جارِ الحفظ…" : "نسخ الآن"}
            </button>
            {lastRun.file && (
              <button
                type="button"
                className="dialog-secondary"
                onClick={async () => {
                  const r = await shareLatestAutoBackup();
                  if (!r.ok) setMessage(r.message);
                }}
              >
                مشاركة آخر نسخة
              </button>
            )}
            <button type="button" className="text-action" onClick={disable}>
              إيقاف
            </button>
          </div>
        </>
      ) : (
        <div className="auth-form">
          <input className="search-input" type="password" autoComplete="new-password" placeholder="كلمة مرور النسخ التلقائي" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input className="search-input" type="password" autoComplete="new-password" placeholder="تأكيد كلمة المرور" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <button type="button" className="dialog-primary" onClick={enable} disabled={!password}>
            تفعيل النسخ التلقائي
          </button>
        </div>
      )}
      {message && <p className="settings-hint">{message}</p>}
    </section>
  );
}

/** ☀️ التنبيه الصباحي - on/off and time; the schedule itself is refreshed each time the home page
 * opens (HomeView.tsx). */
function MorningDigestSettings() {
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState(8);
  useEffect(() => {
    setEnabled(isMorningDigestEnabled());
    setHour(getMorningDigestHour());
  }, []);

  return (
    <div className="morning-digest-settings">
      <label className="toggle-switch-row">
        <span>☀️ تنبيه صباحي يومي (يصل حتى والتطبيق مغلق)</span>
        <span className={`toggle-switch${enabled ? " toggle-switch-on" : ""}`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setMorningDigestEnabled(e.target.checked);
            }}
          />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      {enabled && (
        <label className="form-field">
          <span>وقت التنبيه</span>
          <select
            className="search-input"
            value={hour}
            onChange={(e) => {
              const next = Number(e.target.value);
              setHour(next);
              setMorningDigestHour(next);
            }}
          >
            {[5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
              <option key={h} value={h}>
                {h}:00 صباحًا
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="settings-hint">
        يلخّص الأجهزة التي تنتهي اليوم وغدًا والمنتهية والديون المستحقة. الضغط عليه يفتح صفحة التذكيرات. يُحدَّث الجدول كل مرة تفتح فيها الصفحة الرئيسية.
      </p>
    </div>
  );
}
