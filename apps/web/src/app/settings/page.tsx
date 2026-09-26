"use client";

import { useEffect, useRef, useState } from "react";
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
import { STORAGE_BUDGET_CHARS, StorageUsage, formatChars, isQuotaError, measureStorage, storageKeyLabel } from "@/lib/storageGuard";
import { collectAppData, createEncryptedBackupFile, mergeImportedAccounts, readEncryptedBackupFile, restoreAppData } from "@/lib/accountBackup";
import {
  checkAccountSession,
  exportAccountSessions,
  importAccountSessions,
  isRunningInAndroidApp,
  openIsolatedAccountBrowser,
  openNotificationSettings,
} from "@/lib/localBrowser";
import {
  clearSessionCheckResults,
  loadSessionCheckResults,
  needsLogin,
  saveSessionCheckResults,
  SESSION_STATUS_LABELS,
  SessionCheckResults,
  sessionExportWarning,
  sortForSessionCheck,
  summarizeSessionChecks,
} from "@/lib/sessionCheck";
import type { StarlinkAccountSummary } from "@starnet/shared";
import { saveAndShareBackupFile } from "@/lib/backupFile";
import { APK_DOWNLOAD_URL, checkForAppUpdate, CURRENT_COMMIT, UpdateCheckResult } from "@/lib/appUpdate";
import { getMorningDigestHour, isMorningDigestEnabled, setMorningDigestEnabled, setMorningDigestHour } from "@/lib/morningNotifications";
import { getAutoBackupLastRun, getAutoBackupPassword, setAutoBackupPassword } from "@/lib/autoBackup";
import { runAutoBackup, shareLatestAutoBackup } from "@/lib/autoBackupRunner";
import { BusinessProfile, loadBusinessProfile, saveBusinessProfile } from "@/lib/pdfDocument";
import { clearAppPin, hasAppPin, setAppPin, verifyAppPin } from "@/lib/appLock";
import { loadProfitReset, ProfitReset, saveProfitReset, startProfitFresh, undoProfitFresh } from "@/lib/profitReset";
import { loadRepresentativeStore, saveRepresentativeStore } from "@/lib/repStore";

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

      <ProfitResetSection />

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

      <SessionCheckSection />

      <StorageUsageSection />
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
  const [exportWarning, setExportWarning] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);

  async function handleExport() {
    setExportMessage(null);
    setExportWarning(null);
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
        setExportWarning(sessionExportWarning(accounts.length, Object.keys(sessions).length, isRunningInAndroidApp()));
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
    setImportDone(false);
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
        try {
          restoreAppData(window.localStorage, result.data);
        } catch (err) {
          // restoreAppData already put every original record back - nothing on this phone changed.
          setImportMessage(
            isQuotaError(err)
              ? "لا توجد مساحة كافية لاستعادة هذه النسخة - لم يتغير شيء من بياناتك الحالية. احذف صور المنتجات الكبيرة أو السجلات القديمة ثم حاول مجدداً."
              : "تعذرت الاستعادة - لم يتغير شيء من بياناتك الحالية.",
          );
          return;
        }
      } else {
        if (!isDemoMode()) {
          setImportMessage("هذه نسخة قديمة (أجهزة فقط) - استيرادها متاح فقط في الوضع المحلي");
          return;
        }
        saveDemoAccounts(mergeImportedAccounts(loadDemoAccounts([]), result.accounts));
      }
      const sessionResult = await importAccountSessions(result.sessions);
      // Every earlier check was about the sessions this phone had before the restore.
      clearSessionCheckResults();
      const sessionNote =
        Object.keys(result.sessions).length > 0
          ? sessionResult.ok
            ? " افحص جلسات الدخول من القسم التالي لتعرف أي جهاز يحتاج تسجيل دخول من جديد."
            : " تعذرت استعادة جلسات الدخول على هذا الهاتف - ستحتاج تسجيل الدخول في كل جهاز."
          : "";
      setImportMessage(
        (dataKeys > 0
          ? `تمت استعادة كل البيانات (${result.accounts.length} جهاز، ${sessionResult.importedCount} جلسة دخول).`
          : `تم استيراد ${result.accounts.length} حساب و ${sessionResult.importedCount} جلسة دخول.`) + sessionNote,
      );
      setImportPassword("");
      setImportFile(null);
      setImportDone(true);
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
        {exportWarning && <div className="account-card-alert session-warning">{exportWarning}</div>}
      </div>

      <div className="auth-form" style={{ marginTop: "16px" }}>
        {/* No "accept" filter: Android's picker only understands real file types, so a filter on
            the backup's own extension greyed the file out and it could never be chosen. */}
        <label className="backup-file-pick">
          <input type="file" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
          <span className="backup-file-button">📂 اختر ملف النسخة</span>
          <span className="backup-file-name">{importFile ? importFile.name : "لم تختر ملفًا بعد"}</span>
        </label>
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
        {importMessage && <div className={`account-card-alert${importDone ? " backup-restored" : ""}`}>{importMessage}</div>}
        {importDone && (
          <button type="button" className="dialog-primary" onClick={() => (window.location.href = "/")}>
            فتح الصفحة الرئيسية بالبيانات المستعادة
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * "فحص جلسات الدخول": opens each device's isolated Starlink browser hidden, one by one, and shows
 * which are still signed in - the check to run right after restoring a backup.
 */
function SessionCheckSection() {
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>([]);
  const [results, setResults] = useState<SessionCheckResults>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inApp, setInApp] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    setInApp(isRunningInAndroidApp());
    setResults(loadSessionCheckResults());
    (async () => {
      try {
        const list = isDemoMode() ? loadDemoAccounts([]) : await listAccounts();
        setAccounts(list.filter((a) => !a.deletedAt));
      } catch {
        setAccounts([]);
      }
    })();
  }, []);

  async function checkOne(accountId: string, current: SessionCheckResults): Promise<SessionCheckResults> {
    setCheckingId(accountId);
    const status = await checkAccountSession(accountId);
    const next = { ...current, [accountId]: { status, checkedAt: new Date().toISOString() } };
    setResults(next);
    saveSessionCheckResults(next);
    return next;
  }

  async function checkAll() {
    if (!inApp) {
      setMessage("الفحص متاح فقط داخل تطبيق Android.");
      return;
    }
    setMessage(null);
    setRunningAll(true);
    stopRef.current = false;
    let current = results;
    for (const account of accounts) {
      if (stopRef.current) break;
      current = await checkOne(account.id, current);
    }
    setCheckingId(null);
    setRunningAll(false);
    const summary = summarizeSessionChecks(
      accounts.map((a) => a.id),
      current,
    );
    setMessage(
      summary.needLogin > 0
        ? `${summary.needLogin} جهاز يحتاج تسجيل دخول - اضغط "فتح" بجانبه وسجّل الدخول ثم افحصه من جديد.`
        : summary.unknown > 0
          ? "بعض الأجهزة تعذر التأكد منها (تحقق من الإنترنت ثم أعد الفحص)."
          : "كل الأجهزة متصلة.",
    );
  }

  async function checkSingle(accountId: string) {
    if (!inApp) {
      setMessage("الفحص متاح فقط داخل تطبيق Android.");
      return;
    }
    await checkOne(accountId, results);
    setCheckingId(null);
  }

  async function openForLogin(account: StarlinkAccountSummary) {
    const opened = await openIsolatedAccountBrowser(account.id, account.name);
    if (!opened.ok) setMessage(opened.message);
  }

  const ids = accounts.map((a) => a.id);
  const summary = summarizeSessionChecks(ids, results);
  const ordered = sortForSessionCheck(accounts, results);
  const busy = runningAll || checkingId !== null;

  return (
    <section className="section" id="sessions">
      <h2 className="section-title">فحص جلسات الدخول</h2>
      <p className="settings-hint">
        يفتح متصفح كل جهاز في الخلفية ويتأكد هل ما زال مسجّل الدخول في Starlink. افحص بعد استعادة نسخة
        احتياطية على هاتف جديد: الجهاز الذي يظهر &quot;يحتاج تسجيل دخول&quot; افتحه وسجّل الدخول مرة واحدة.
      </p>

      {summary.checked > 0 && (
        <div className="session-summary">
          <span className="session-chip session-ok">متصل {summary.loggedIn}</span>
          <span className="session-chip session-login">يحتاج دخول {summary.needLogin}</span>
          {summary.unknown > 0 && <span className="session-chip session-unknown">غير مؤكد {summary.unknown}</span>}
        </div>
      )}

      <div className="settings-actions">
        {runningAll ? (
          <button className="btn-icon" onClick={() => (stopRef.current = true)}>
            إيقاف الفحص
          </button>
        ) : (
          <button className="btn-icon" disabled={busy || accounts.length === 0} onClick={checkAll}>
            فحص كل الأجهزة ({accounts.length})
          </button>
        )}
      </div>
      {message && <div className="account-card-alert">{message}</div>}

      {accounts.length > 0 && (
        <ul className="session-list">
          {ordered.map((account) => {
            const result = results[account.id];
            const status = result?.status;
            const checking = checkingId === account.id;
            return (
              <li key={account.id} className="session-row">
                <div className="session-row-main">
                  <span className="session-name">{account.name}</span>
                  <span className={`session-chip ${status ? `session-${status === "loggedIn" ? "ok" : needsLogin(status) ? "login" : "unknown"}` : ""}`}>
                    {checking ? "جارِ الفحص…" : status ? SESSION_STATUS_LABELS[status] : "لم يُفحص"}
                  </span>
                </div>
                <div className="session-row-actions">
                  <button type="button" className="session-action" disabled={busy} onClick={() => checkSingle(account.id)}>
                    فحص
                  </button>
                  {needsLogin(status) && (
                    <button type="button" className="session-action session-action-primary" onClick={() => openForLogin(account)}>
                      فتح وتسجيل الدخول
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
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

/** "بداية جديدة للأرباح": profit counts from zero from now on, every representative restarts
 * from the same point. Nothing is deleted - shipments, client balances and payments stay - and it
 * can be undone. */
function ProfitResetSection() {
  const [reset, setReset] = useState<ProfitReset | null>(null);
  useEffect(() => setReset(loadProfitReset()), []);

  function start() {
    const message = reset
      ? "بدء الأرباح من الصفر مرة أخرى من الآن؟"
      : "بدء الأرباح من الصفر من الآن؟\n\n• التقارير تحسب الأرباح من اليوم فقط.\n• كل المندوبين يبدأون حسابًا جديدًا (القديم في الأرشيف).\n• لا يُحذف أي شيء من حسابات الزبائن، ويمكن التراجع.";
    if (!window.confirm(message)) return;
    const { reset: next, repStore } = startProfitFresh(loadRepresentativeStore());
    // Starting again keeps the representatives' resets from before the FIRST fresh start.
    const merged = reset ? { ...next, previousRepResets: { ...next.previousRepResets, ...reset.previousRepResets } } : next;
    saveRepresentativeStore(repStore);
    saveProfitReset(merged);
    setReset(merged);
  }

  function undo() {
    if (!reset) return;
    if (!window.confirm("إلغاء البداية الجديدة وإرجاع كل الأرباح القديمة وحسابات المندوبين كما كانت؟")) return;
    saveRepresentativeStore(undoProfitFresh(reset, loadRepresentativeStore()));
    saveProfitReset(null);
    setReset(null);
  }

  return (
    <section className="section">
      <h2 className="section-title">بداية جديدة للأرباح</h2>
      <p className="settings-hint">
        يبدأ حساب الأرباح من الصفر: التقارير لا تحسب إلا الأرباح التي تتأكد من الآن (بعد الدفع لستارلينك)، وكل المندوبين يبدأون حسابًا
        جديدًا ويبقى القديم في أرشيفهم. لا يُحذف أي شيء: الشحنات وديون الزبائن والدفعات تبقى كما هي، ويمكنك التراجع.
      </p>
      {reset && (
        <p className="profit-reset-active">
          🔄 الأرباح محسوبة من <bdi dir="ltr">{reset.date}</bdi>
        </p>
      )}
      <div className="settings-actions">
        <button type="button" className="dialog-danger" onClick={start}>
          🔄 ابدأ الأرباح من الصفر الآن
        </button>
        {reset && (
          <button type="button" className="text-action" onClick={undo}>
            إلغاء (إرجاع الأرباح القديمة)
          </button>
        )}
      </div>
    </section>
  );
}

/** "مساحة التخزين": how much of the phone's app storage the data uses, and which stores are the
 * biggest - so a nearly-full phone can be dealt with before a save fails (StorageFullBanner). */
function StorageUsageSection() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  useEffect(() => {
    try {
      setUsage(measureStorage(window.localStorage));
    } catch {
      setUsage(null);
    }
  }, []);
  if (!usage) return null;
  const percent = Math.min(100, Math.round(usage.ratio * 100));
  return (
    <section className="section">
      <h2 className="section-title">مساحة التخزين</h2>
      <p className="settings-hint">
        كل بياناتك محفوظة داخل الهاتف في مساحة محدودة (حوالي {formatChars(STORAGE_BUDGET_CHARS)}). عند امتلائها لا يُحفظ أي
        تغيير جديد.
      </p>
      <div className="storage-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div
          className={`storage-meter-fill${usage.level === "full" ? " is-full" : usage.level === "warn" ? " is-warn" : ""}`}
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      </div>
      <p className="settings-hint">
        مستخدم <bdi dir="ltr">{percent}%</bdi> ({formatChars(usage.usedChars)})
        {usage.level !== "ok" && " - خذ نسخة احتياطية الآن، ثم احذف صور المنتجات غير الضرورية أو السجلات القديمة من سلة المحذوفات."}
      </p>
      <ul className="storage-keys">
        {usage.keys.slice(0, 5).map((entry) => (
          <li key={entry.key}>
            <span>{storageKeyLabel(entry.key)}</span>
            <span>{formatChars(entry.chars)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
