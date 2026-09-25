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
import { createEncryptedBackupFile, mergeImportedAccounts, readEncryptedBackupFile } from "@/lib/accountBackup";
import { exportAccountSessions, importAccountSessions, isRunningInAndroidApp, openNotificationSettings } from "@/lib/localBrowser";
import { saveAndShareBackupFile } from "@/lib/backupFile";
import { clearAppPin, hasAppPin, setAppPin, verifyAppPin } from "@/lib/appLock";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "حسب الجهاز" },
  { value: "light", label: "فاتح" },
  { value: "dark", label: "داكن" },
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
      if (accounts.length === 0) {
        setExportMessage("لا توجد حسابات لتصديرها");
        return;
      }

      const sessions = await exportAccountSessions(accounts.map((a) => a.id));
      const created = await createEncryptedBackupFile(accounts, sessions, exportPassword);
      if (!created.ok) {
        setExportMessage(created.message);
        return;
      }

      const saved = await saveAndShareBackupFile(created.fileContents);
      setExportMessage(
        saved.ok
          ? `تم إنشاء النسخة الاحتياطية (${accounts.length} حساب، ${Object.keys(sessions).length} جلسة دخول) - اختر أين تحفظها`
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
      if (!isDemoMode()) {
        setImportMessage("الاستيراد متاح حاليًا فقط في الوضع التجريبي (المحلي) - لا يوجد خادم حقيقي متصل بعد");
        return;
      }

      const merged = mergeImportedAccounts(loadDemoAccounts([]), result.accounts);
      saveDemoAccounts(merged);
      const sessionResult = await importAccountSessions(result.sessions);
      setImportMessage(
        `تم استيراد ${result.accounts.length} حساب و ${sessionResult.importedCount} جلسة دخول. افتح الصفحة الرئيسية لرؤيتها.`,
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
    <section className="section">
      <h2 className="section-title">نسخة احتياطية محمية</h2>
      <p className="settings-hint">
        تُصدَّر قائمة الحسابات وجلسات الدخول (إن وُجدت) في ملف واحد مشفّر بكلمة المرور التي تختارها
        - لا يمكن فتحه بدونها. جلسات الدخول تُقرأ فقط من الحسابات التي فتحتها مرة واحدة على الأقل
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
