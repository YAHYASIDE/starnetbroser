"use client";

import { exitRepMode, isRepWorkspace } from "@/lib/repMode";
import { askDeleteCode } from "@/components/DeleteCodePrompt";
import { groupForHash, loadRememberedGroup, rememberGroup, SETTINGS_GROUPS, type SettingsGroupId } from "@/lib/settingsGroups";
import { RepExtraBotsSettings } from "@/components/RepExtraBotsSettings";
import { RepModeEntrySection } from "@/components/RepModeEntrySection";
import { RepPairButton } from "@/components/RepPairButton";
import { ActivationCostsSection } from "@/components/ActivationCostsSection";
import { PhoneShortcutsSection } from "@/components/PhoneShortcutsSection";
import { UsedPasswordsSection } from "@/components/UsedPasswordsSection";
import { GmailCodesSection } from "@/components/GmailCodesSection";
import { BiometricUnlockToggle } from "@/components/BiometricUnlockToggle";
import { openSettingsFold, SettingsFold } from "@/components/SettingsFold";
import { SettingsSearch } from "@/components/SettingsSearch";
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
import { restoreProofsFromBackup, withProofs } from "@/lib/paymentProofStore";
import {
  connectRepsBot,
  disconnectRepsBot,
  dismissRepRequest,
  linkRepChat,
  loadRepChats,
  loadRepRequests,
  RepChat,
  RepLinkRequest,
  unlinkRep,
  connectTelegram,
  disconnectTelegram,
  loadTelegramPrefs,
  saveTelegramPrefs,
  sendTelegramText,
  telegramConnection,
  TelegramConnection,
  isRepsBotConnected,
  isTelegramConnected,
  isTelegramInstant,
  openAutostartSettings,
  requestBatteryUnrestricted,
  setTelegramInstant,
  telegramServiceState,
  type TelegramServiceState,
} from "@/lib/telegram";
import { DEFAULT_TELEGRAM_PREFS, TelegramPrefs } from "@/lib/telegramMessages";
import {
  checkAccountSession,
  exportAccountSessions,
  importAccountSessions,
  isRunningInAndroidApp,
  openIsolatedAccountBrowser,
  openNotificationSettings,
  isAutoSyncEnabled,
  isBackgroundSyncEnabled,
  setBackgroundSyncEnabled,
  backgroundSyncCanRun,
  openOverlaySettings,
  setAutoSyncEnabled,
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
import {
  EVENING_HOURS,
  getEveningSummaryHour,
  getMorningDigestHour,
  isEveningSummaryEnabled,
  isMorningDigestEnabled,
  setEveningSummaryEnabled,
  setEveningSummaryHour,
  setMorningDigestEnabled,
  setMorningDigestHour,
} from "@/lib/morningNotifications";
import { getAutoBackupLastRun, getAutoBackupPassword, setAutoBackupPassword } from "@/lib/autoBackup";
import { runAutoBackup, shareLatestAutoBackup } from "@/lib/autoBackupRunner";
import { DriveFile, DriveUploadStatus, driveBackupLabel, getDriveEmail, getDriveLastUpload, isDriveLinked } from "@/lib/driveBackup";
import { downloadGoogleDriveBackup, linkGoogleDrive, listGoogleDriveBackups, runDriveBackup, unlinkGoogleDrive } from "@/lib/driveBackupRunner";
import { PartySheet } from "@/components/AccountsSection";
import { BusinessProfile, DEFAULT_PAYMENT_INSTRUCTIONS, loadBusinessProfile, saveBusinessProfile } from "@/lib/pdfDocument";
import { clearAppPin, hasAppPin, setAppPin, verifyAppPin } from "@/lib/appLock";
import { loadProfitReset, ProfitReset, saveProfitReset, startProfitFresh, undoProfitFresh } from "@/lib/profitReset";
import { listRepresentatives, loadRepresentativeStore, Representative, saveRepresentativeStore } from "@/lib/repStore";

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
  const [group, setGroup] = useState<SettingsGroupId>("general");
  // 📱 the rep's app: a short settings page (lib/repMode.ts).
  const [rep, setRep] = useState(false);
  const current = SETTINGS_GROUPS.find((g) => g.id === group) ?? SETTINGS_GROUPS[0]!;

  // A link like "/settings#backup" opens its group (and scrolls to it); otherwise the last one.
  useEffect(() => {
    const hash = window.location.hash;
    const fromHash = groupForHash(hash);
    setGroup(fromHash ?? loadRememberedGroup() ?? "general");
    if (fromHash) {
      window.setTimeout(() => openSettingsFold(hash.slice(1)), 300);
    }
  }, []);

  function chooseGroup(id: SettingsGroupId) {
    setGroup(id);
    rememberGroup(id);
  }

  useEffect(() => {
    setUrl(getApiBaseUrl());
    setLoggedIn(isLoggedIn());
    setTheme(getThemePreference());
    setHelpMode(isHelpModeEnabled());
    setDefaultCurrency(getDefaultInvoiceCurrency());
    setRemindersBadgeEnabledState(isRemindersBadgeEnabled());
    setIsAndroidApp(isRunningInAndroidApp());
    setRep(isRepWorkspace());
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

  if (rep) {
    return (
      <main className="home">
        <h1 className="section-title">الإعدادات</h1>
        <section className="section">
          <h2 className="section-title">المظهر</h2>
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
        <AppLockSection />
        <AppUpdateSection />
        <section className="section">
          <h2 className="section-title">📱 وضع المندوب</h2>
          <p className="settings-hint">
            هذا التطبيق يعمل على نسخة أجهزتك من المسؤول. الخروج يحذف النسخة من هاتفك (تبقى أجهزتك غير المرسلة).
          </p>
          <RepPairButton />
          <button
            type="button"
            className="dialog-danger"
            onClick={() => {
              if (window.confirm("الخروج من وضع المندوب؟ تُحذف نسخة أجهزة المسؤول من هاتفك.")) {
                exitRepMode();
                window.location.href = "/";
              }
            }}
          >
            الخروج من وضع المندوب
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="home">
      <h1 className="section-title">الإعدادات</h1>
      <SettingsSearch
        onOpenSetting={(item) => {
          chooseGroup(item.group);
          window.setTimeout(() => openSettingsFold(item.id), 80);
        }}
      />

      <nav className="settings-hub" aria-label="أقسام الإعدادات">
        {SETTINGS_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`settings-hub-tile settings-tone-${g.tone}${group === g.id ? " settings-hub-tile-active" : ""}`}
            onClick={() => chooseGroup(g.id)}
            aria-pressed={group === g.id}
          >
            <span className="settings-hub-icon" aria-hidden="true">{g.icon}</span>
            <span className="settings-hub-title">{g.short}</span>
            <span className="settings-hub-subtitle">{g.subtitle}</span>
          </button>
        ))}
      </nav>

      <div className={`settings-group settings-tone-${current.tone}`} id={current.id}>
        <h2 className="settings-group-title">
          <span aria-hidden="true">{current.icon}</span> {current.title}
        </h2>

        {group === "general" && (
          <>
      <SettingsFold id="shortcuts"><PhoneShortcutsSection /></SettingsFold>
      <UsedPasswordsSection />
      <SettingsFold id="gmail-codes"><GmailCodesSection /></SettingsFold>
      <SettingsFold id="theme">
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
      </SettingsFold>
      <SettingsFold id="help">
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
      </SettingsFold>
      <SettingsFold id="invoice-currency">
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
      </SettingsFold>
            <SettingsFold id="business"><BusinessProfileSection /></SettingsFold>
            <SettingsFold id="profit-reset"><ProfitResetSection /></SettingsFold>
          </>
        )}

        {group === "alerts" && (
          <>
      <SettingsFold id="reminders">
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
        <EveningSummarySettings />
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
      </SettingsFold>
          </>
        )}

        {group === "devices" && (
          <>
            <SettingsFold id="auto-sync">
              {isAndroidApp ? (
                <section className="section">
                  <h2 className="section-title">🔄 تحديث الأجهزة من Starlink</h2>
                  <AutoSyncSettings />
                  <BackgroundSyncSettings />
                </section>
              ) : (
                <p className="settings-hint">المزامنة التلقائية تعمل داخل تطبيق أندرويد فقط.</p>
              )}
            </SettingsFold>
            <SettingsFold id="sessions"><SessionCheckSection /></SettingsFold>
          </>
        )}

        {group === "bots" && (
          <>
            <SettingsFold id="telegram"><TelegramSection /></SettingsFold>
            <SettingsFold id="rep-bots"><TelegramRepsSection /></SettingsFold>
            <SettingsFold id="activation-costs"><ActivationCostsSection /></SettingsFold>
            <SettingsFold id="instant-replies"><TelegramInstantSection /></SettingsFold>
          </>
        )}

        {group === "backup" && (
          <>
            <SettingsFold id="backup-full"><BackupSection /></SettingsFold>
            <SettingsFold id="backup-daily"><AutoBackupSection /></SettingsFold>
            <SettingsFold id="drive"><DriveSection /></SettingsFold>
          </>
        )}

        {group === "security" && (
          <>
            <SettingsFold id="lock"><AppLockSection /></SettingsFold>
            <SettingsFold id="update"><AppUpdateSection /></SettingsFold>
            <SettingsFold id="rep-mode"><RepModeEntrySection /></SettingsFold>
            <SettingsFold id="storage"><StorageUsageSection /></SettingsFold>
      <SettingsFold id="server">
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
      </SettingsFold>
          </>
        )}
      </div>
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
      {mode === "idle" && pinSet && <BiometricUnlockToggle />}

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
  const [inApp, setInApp] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFile[] | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  useEffect(() => setInApp(isRunningInAndroidApp()), []);

  // "استعادة من Google Drive": the chosen backup becomes the file to import, exactly as if it had
  // been picked from the phone - the same password + confirmation + safe restore follow.
  async function openDrivePicker() {
    setImportMessage(null);
    setDriveBusy(true);
    const result = await listGoogleDriveBackups();
    setDriveBusy(false);
    if (!result.ok) {
      setImportMessage(result.message);
      return;
    }
    if (result.value.length === 0) {
      setImportMessage("لا توجد نسخ في مجلد STARNET على Google Drive بعد");
      return;
    }
    setDriveFiles(result.value);
  }

  async function pickDriveFile(file: DriveFile) {
    setDriveBusy(true);
    const result = await downloadGoogleDriveBackup(file.id);
    setDriveBusy(false);
    if (!result.ok) {
      setImportMessage(result.message);
      return;
    }
    setDriveFiles(null);
    setImportFile(new File([result.value], file.name, { type: "application/octet-stream" }));
    setImportDone(false);
    setImportMessage(`تم تنزيل نسخة ${driveBackupLabel(file.name)} من Google Drive - أدخل كلمة المرور ثم اضغط «استيراد نسخة احتياطية».`);
  }

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
      const data = await withProofs(collectAppData(window.localStorage));
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
          await restoreProofsFromBackup(result.data);
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
        {inApp && (
          <button type="button" className="btn-icon" disabled={driveBusy} onClick={openDrivePicker}>
            {driveBusy ? "جارِ الاتصال بـ Google Drive…" : "☁️ اختيار نسخة من Google Drive"}
          </button>
        )}
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

      {driveFiles && (
        <PartySheet title="نسخ Google Drive" onClose={() => setDriveFiles(null)}>
          <ul className="drive-file-list">
            {driveFiles.map((file) => (
              <li key={file.id}>
                <button type="button" className="drive-file" disabled={driveBusy} onClick={() => pickDriveFile(file)}>
                  <bdi dir="ltr">{driveBackupLabel(file.name)}</bdi>
                  {file.size ? <span className="settings-hint">{Math.max(1, Math.round(file.size / 1024))} KB</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </PartySheet>
      )}
    </section>
  );
}

/** "2026-09-26 17:55" - reads the same inside RTL text as outside it. */
function formatLocalDateTime(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "Google Drive": the daily encrypted backup also goes to the operator's own Drive (see
 * driveBackup.ts / driveBackupRunner.ts), so losing the phone never loses the data. */
function DriveSection() {
  const [android, setAndroid] = useState(true);
  const [linked, setLinked] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [last, setLast] = useState<DriveUploadStatus | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [busy, setBusy] = useState<"link" | "upload" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function refresh() {
    setLinked(isDriveLinked());
    setEmail(getDriveEmail());
    setLast(getDriveLastUpload());
    setHasPassword(getAutoBackupPassword() !== null);
  }

  useEffect(() => {
    setAndroid(isRunningInAndroidApp());
    refresh();
  }, []);

  async function uploadNow() {
    setBusy("upload");
    setMessage(null);
    const accounts = isDemoMode() ? loadDemoAccounts([]) : await listAccounts().catch(() => []);
    const outcome = await runDriveBackup(accounts, true);
    setBusy(null);
    refresh();
    setMessage(outcome.status === "uploaded" ? `✓ رُفعت النسخة إلى Google Drive (مجلد STARNET)` : outcome.status === "failed" ? outcome.message : null);
  }

  async function link() {
    setBusy("link");
    setMessage(null);
    const result = await linkGoogleDrive();
    setBusy(null);
    refresh();
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    if (getAutoBackupPassword() !== null) await uploadNow();
    else setMessage("✓ تم الربط. فعّل «النسخ الاحتياطي التلقائي» أعلاه (كلمة المرور) لتبدأ النسخ بالرفع.");
  }

  async function unlink() {
    if (!window.confirm("فصل Google Drive؟ تتوقف النسخ عن الرفع، وتبقى النسخ القديمة في Drive.")) return;
    await unlinkGoogleDrive();
    refresh();
    setMessage("تم فصل Google Drive");
  }

  const lastAt = last ? formatLocalDateTime(new Date(last.at)) : null;

  return (
    <section className="section" id="drive">
      <h2 className="section-title">☁️ نسخة في Google Drive</h2>
      <p className="settings-hint">
        كل يوم تُرفع نسخة كاملة مشفّرة إلى مجلد STARNET في حسابك على Google Drive، ويُحتفظ بآخر 30 نسخة - حتى لو ضاع
        الهاتف أو تعطّل تستعيد كل شيء على هاتف جديد. التطبيق يرى ملفاته فقط، لا شيء آخر في Drive.
      </p>
      {!android && <p className="settings-hint">⚠️ يعمل داخل تطبيق Android فقط.</p>}
      {linked ? (
        <>
          <p className="settings-hint">
            ✓ مربوط{email ? <> بـ <bdi dir="ltr">{email}</bdi></> : ""}
          </p>
          {!hasPassword && <p className="account-card-alert">فعّل «النسخ الاحتياطي التلقائي» أعلاه (كلمة المرور) - به تُشفَّر نسخة Drive.</p>}
          {last && (
            <p className={last.ok ? "settings-hint" : "account-card-alert"}>
              {last.ok ? "✓ آخر رفع: " : "⚠️ فشل آخر رفع: "}
              <bdi dir="ltr">{lastAt}</bdi>
              {!last.ok && last.message ? ` - ${last.message}` : ""}
            </p>
          )}
          <div className="settings-actions">
            <button type="button" className="dialog-primary" disabled={busy !== null} onClick={uploadNow}>
              {busy === "upload" ? "جارِ الرفع…" : "رفع الآن"}
            </button>
            <button type="button" className="text-action" disabled={busy !== null} onClick={unlink}>
              فصل
            </button>
          </div>
        </>
      ) : (
        <div className="settings-actions">
          <button type="button" className="dialog-primary" disabled={busy !== null || !android} onClick={link}>
            {busy === "link" ? "جارِ الربط…" : "ربط Google Drive"}
          </button>
        </div>
      )}
      {message && <div className={`account-card-alert${message.startsWith("✓") ? " backup-restored" : ""}`}>{message}</div>}
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
        <label className="tool-field">
          <span>طرق الدفع في رسائل تذكير الديون (سطر لكل طريقة)</span>
          <textarea
            className="search-input"
            rows={3}
            placeholder={DEFAULT_PAYMENT_INSTRUCTIONS}
            value={profile.paymentInstructions ?? ""}
            onChange={(e) => update({ paymentInstructions: e.target.value })}
          />
        </label>
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

/** ✈️ تيليغرام - the operator's own bot: connect with its token, choose what is sent. */
function TelegramSection() {
  const [connection, setConnection] = useState<TelegramConnection>({ configured: false });
  const [prefs, setPrefs] = useState<TelegramPrefs>(DEFAULT_TELEGRAM_PREFS);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setPrefs(loadTelegramPrefs());
    void telegramConnection().then(setConnection);
  }, []);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const result = await connectTelegram(token);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setToken("");
    setConnection({ configured: true, botName: result.botName, chatName: result.chatName });
    setMessage("✓ تم الربط - وصلتك رسالة ترحيب في تيليغرام");
  }

  async function update(next: TelegramPrefs) {
    setPrefs(next);
    await saveTelegramPrefs(next);
  }

  const options: { key: keyof TelegramPrefs; label: string }[] = [
    { key: "stopped", label: "⛔ الأجهزة المتوقفة (فور اكتشافها)" },
    { key: "payments", label: "💵 كل دفعة تُسجَّل" },
    { key: "morning", label: "☀️ ملخص الصباح (التجديدات القريبة بالأسماء)" },
    { key: "evening", label: "🌙 ملخص آخر اليوم" },
    { key: "weekly", label: "📊 ملخص الأسبوع (كل سبت مساءً)" },
  ];

  return (
    <section className="section telegram-section">
      <h2 className="section-title">✈️ تيليغرام</h2>
      {connection.configured ? (
        <>
          <p className="telegram-status">
            ✓ مربوط بالبوت <bdi dir="ltr">@{connection.botName}</bdi>
            {connection.chatName ? <> - يرسل إلى {connection.chatName}</> : null}
          </p>
          {options.map((option) => (
            <label key={option.key} className="toggle-switch-row">
              <span>{option.label}</span>
              <span className={`toggle-switch${prefs[option.key] ? " toggle-switch-on" : ""}`}>
                <input type="checkbox" checked={prefs[option.key]} onChange={(e) => void update({ ...prefs, [option.key]: e.target.checked })} />
                <span className="toggle-switch-thumb" />
              </span>
            </label>
          ))}
          <p className="settings-hint">
            📄 في أي كشف PDF (زبون، مورد، مندوب، إقفال شهر، سند قبض) اختر «✈️ إرسال إلى تيليغرام». وتستطيع أن تكتب للبوت: المتوقفة، تنتهي،
            الصندوق، ملخص، كشف + اسم الزبون أو المورد.
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="btn-icon"
              onClick={async () => setMessage((await sendTelegramText("👋 رسالة تجربة من STAR NET")) ? "✓ أُرسلت رسالة تجربة" : "تعذر الإرسال")}
            >
              إرسال رسالة تجربة
            </button>
            <button
              type="button"
              className="text-action"
              onClick={async () => {
                if (!window.confirm("فصل تيليغرام؟ يُحذف مفتاح البوت من الهاتف ولن تصل الرسائل.")) return;
                await disconnectTelegram();
                setConnection({ configured: false });
                setMessage("تم الفصل");
              }}
            >
              فصل
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="settings-hint">اربط بوتك الخاص لتصلك الإشعارات والكشوف على تيليغرام (مجاني):</p>
          <ol className="telegram-steps">
            <li>في تيليغرام ابحث عن <bdi dir="ltr">@BotFather</bdi> وأرسل له <bdi dir="ltr">/newbot</bdi>، ثم اختر اسماً للبوت.</li>
            <li>انسخ «المفتاح» (token) الذي يعطيك إياه.</li>
            <li>افتح بوتك الجديد واضغط «ابدأ» (Start).</li>
            <li>الصق المفتاح هنا واضغط «ربط».</li>
          </ol>
          <input
            className="search-input"
            type="password"
            dir="ltr"
            autoComplete="off"
            placeholder="123456789:AA..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="settings-actions">
            <button type="button" className="dialog-primary" disabled={busy || !token.trim()} onClick={() => void connect()}>
              {busy ? "⏳ جارِ الربط…" : "ربط"}
            </button>
          </div>
          <p className="settings-hint">المفتاح يُحفظ في هاتفك فقط ولا يدخل النسخ الاحتياطية.</p>
        </>
      )}
      {message && <p className="settings-hint telegram-message">{message}</p>}
    </section>
  );
}

/** ⚡ Both bots keep answering with the app closed (native service + permanent notification). */
function TelegramInstantSection() {
  const [shown, setShown] = useState(false);
  const [instant, setInstant] = useState(true);
  const [state, setState] = useState<TelegramServiceState | null>(null);
  useEffect(() => {
    const refresh = () => {
      setShown(isTelegramConnected() || isRepsBotConnected());
      setInstant(isTelegramInstant());
      void telegramServiceState().then(setState);
    };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);
  if (!shown) return null;
  return (
    <section className="section telegram-section">
      <h2 className="section-title">⚡ رد البوت والتطبيق مغلق</h2>
      <label className="toggle-switch-row">
        <span>يرد البوتان فوراً حتى والتطبيق مغلق</span>
        <span className={`toggle-switch${instant ? " toggle-switch-on" : ""}`}>
          <input
            type="checkbox"
            checked={instant}
            onChange={(e) => {
              setInstant(e.target.checked);
              void setTelegramInstant(e.target.checked);
            }}
          />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      {instant && state && (
        <>
          <p className={`settings-hint ${state.running ? "telegram-running" : "telegram-stopped"}`}>
            {state.running ? "✅ يعمل الآن - البوتان يردان خلال ثوانٍ" : "⚠️ متوقف الآن - أعد فتح التطبيق، واسمح له بالعمل في الخلفية أدناه."}
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="btn-icon"
              onClick={async () => {
                await setTelegramInstant(true);
                window.setTimeout(() => void telegramServiceState().then(setState), 1500);
              }}
            >
              🔄 إعادة تشغيل الرد
            </button>
          </div>
          <div className="telegram-autostart">
            <p className="settings-hint">
              📲 <strong>مهم في هواتف HONOR و Huawei</strong> (وشاومي، أوبو، فيفو، تكنو): الهاتف يجمّد التطبيق عند الخروج منه فلا يرد
              البوت حتى تفتحه. اضغط الزر، ابحث عن STAR NET، أطفئ «الإدارة التلقائية» ثم فعّل الثلاثة: التشغيل التلقائي، التشغيل
              الثانوي، التشغيل في الخلفية.
            </p>
            <div className="settings-actions">
              <button type="button" className="dialog-primary" onClick={() => void openAutostartSettings()}>
                فتح «تشغيل التطبيقات» في الهاتف
              </button>
            </div>
          </div>
          <details className="telegram-diag">
            <summary>🩺 تشخيص (أرسل صورته إن لم يعمل الرد)</summary>
            <ul>
              {[
                ["device", "الهاتف"],
                ["startedAt", "آخر تشغيل للخدمة"],
                ["startError", "رفض التشغيل"],
                ["pollAt", "آخر اتصال بتيليغرام"],
                ["pollError", "آخر خطأ اتصال"],
                ["replyAt", "آخر رد من الخدمة"],
                ["sendError", "آخر خطأ إرسال"],
              ].map(([key, label]) => (
                <li key={key}>
                  {label}: <bdi dir="ltr">{String(state.diagnostics[key!] ?? "—")}</bdi>
                </li>
              ))}
            </ul>
          </details>
          {state.batteryUnrestricted ? (
            <p className="settings-hint telegram-running">🔋 مسموح له بالعمل في الخلفية بلا قيود</p>
          ) : (
            <>
              <p className="settings-hint telegram-stopped">
                🔋 أندرويد قد يوقف الرد بعد إغلاق التطبيق. اضغط الزر ثم اختر «سماح» ليبقى البوت يرد دائماً.
              </p>
              <div className="settings-actions">
                <button type="button" className="dialog-primary" onClick={() => void requestBatteryUnrestricted()}>
                  السماح بالعمل في الخلفية
                </button>
              </div>
            </>
          )}
        </>
      )}
      <p className="settings-hint">
        {instant
          ? "يبقى إشعار صغير «🤖 بوت تيليغرام يرد» في شريط الإشعارات - هو ما يسمح لأندرويد بإبقاء الرد يعمل. الردود والتطبيق مغلق تكون حسب بيانات آخر مرة فُتح فيها التطبيق (يُكتب الوقت تحت كل رد)، وكشف PDF يُرسل عند فتح التطبيق."
          : "مطفأ: يرد البوتان فقط والتطبيق مفتوح على هاتفك."}
      </p>
      {instant && (
        <p className="settings-hint">
          في بعض الهواتف (شاومي، تكنو، إنفينكس، أوبو...) فعّل أيضاً «التشغيل التلقائي / Autostart» لـ STAR NET من إعدادات التطبيقات، ولا تغلقه بالسحب من قائمة التطبيقات الأخيرة. وإن أُوقف رغم ذلك، يعيد التطبيق تشغيل الرد وحده كل 15 دقيقة.
        </p>
      )}
    </section>
  );
}

/** 🤝 بوت المندوبين - one bot for all reps; each rep presses Start and is linked here to his record. */
function TelegramRepsSection() {
  const [connection, setConnection] = useState<TelegramConnection>({ configured: false });
  const [prefs, setPrefs] = useState<TelegramPrefs>(DEFAULT_TELEGRAM_PREFS);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [chats, setChats] = useState<Record<string, RepChat>>({});
  const [requests, setRequests] = useState<RepLinkRequest[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [reps, setReps] = useState<Representative[]>([]);

  useEffect(() => {
    setPrefs(loadTelegramPrefs());
    setReps(listRepresentatives(loadRepresentativeStore()));
    void telegramConnection().then(setConnection);
    const refresh = () => {
      setChats(loadRepChats());
      setRequests(loadRepRequests());
    };
    refresh();
    // New link requests arrive through the bot while this screen is open.
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function connect() {
    setBusy(true);
    setMessage(null);
    const result = await connectRepsBot(token);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setToken("");
    setConnection((c) => ({ ...c, repsConfigured: true, repsBotName: result.botName }));
    setMessage(`✓ تم ربط بوت المندوبين - أرسل رابط @${result.botName} لكل مندوب ليضغط «ابدأ»`);
  }

  async function update(next: TelegramPrefs) {
    setPrefs(next);
    await saveTelegramPrefs(next);
  }

  const options: { key: keyof TelegramPrefs; label: string }[] = [
    { key: "repStopped", label: "⛔ أجهزته المتوقفة" },
    { key: "repMorning", label: "☀️ تجديداته القريبة صباحاً (مع هواتف الزبائن)" },
    { key: "repPayments", label: "💵 دفعات زبائنه" },
    { key: "repMonthly", label: "📊 حصته ورصيده عند إقفال الشهر" },
  ];
  const repName = (id: string) => reps.find((r) => r.id === id)?.name ?? "مندوب محذوف";

  return (
    <section className="section telegram-section">
      <h2 className="section-title">🤝 بوتات المندوبين (تيليغرام)</h2>
      {!connection.repsConfigured ? (
        <>
          <p className="settings-hint">
            بوت ثانٍ لكل المندوبين: كل مندوب يرى أجهزته وزبائنه فقط - حصته وديون زبائنه، دون تكلفة Starlink أو ربحك أو الصندوق.
          </p>
          <ol className="telegram-steps">
            <li>أنشئ بوتاً ثانياً (غير بوتك الشخصي): أرسل <bdi dir="ltr">/newbot</bdi> إلى <bdi dir="ltr">@BotFather</bdi>.</li>
            <li>الصق مفتاحه هنا واضغط «ربط».</li>
            <li>أرسل رابط البوت لكل مندوب ليضغط «ابدأ»، ثم اربطه هنا بمندوبه.</li>
          </ol>
          <input
            className="search-input"
            type="password"
            dir="ltr"
            autoComplete="off"
            placeholder="123456789:AA..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <div className="settings-actions">
            <button type="button" className="dialog-primary" disabled={busy || !token.trim()} onClick={() => void connect()}>
              {busy ? "⏳ جارِ الربط…" : "ربط بوت المندوبين"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="telegram-status">
            ✓ البوت <bdi dir="ltr">@{connection.repsBotName}</bdi> - أرسل رابطه للمندوبين
          </p>

          {requests.length > 0 && (
            <div className="telegram-requests">
              <strong>طلبات ربط جديدة ({requests.length})</strong>
              {requests.map((request) => (
                <div key={request.chatId} className="telegram-request">
                  <span>
                    👤 {request.name || "بدون اسم"}
                    {request.username && <bdi dir="ltr"> @{request.username}</bdi>}
                  </span>
                  <select
                    className="search-input"
                    value={choice[request.chatId] ?? ""}
                    onChange={(e) => setChoice({ ...choice, [request.chatId]: e.target.value })}
                    aria-label="المندوب"
                  >
                    <option value="">اختر المندوب…</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {chats[r.id] ? " (مربوط)" : ""}
                      </option>
                    ))}
                  </select>
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="dialog-primary"
                      disabled={!choice[request.chatId]}
                      onClick={async () => {
                        const repId = choice[request.chatId]!;
                        await linkRepChat(repId, request, repName(repId));
                        setChats(loadRepChats());
                        setRequests(loadRepRequests());
                        setMessage(`✓ رُبط ${repName(repId)} - وصلته رسالة ترحيب`);
                      }}
                    >
                      ربط
                    </button>
                    <button
                      type="button"
                      className="text-action"
                      onClick={() => {
                        dismissRepRequest(request.chatId);
                        setRequests(loadRepRequests());
                      }}
                    >
                      تجاهل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <ul className="telegram-rep-list">
            {reps.length === 0 && <li className="settings-hint">لا يوجد مندوبون بعد</li>}
            {reps.map((r) => (
              <li key={r.id}>
                <span>
                  {chats[r.id] ? "✓" : "○"} {r.name}
                  {chats[r.id] && <small> - {chats[r.id]!.name}</small>}
                </span>
                {chats[r.id] ? (
                  <button
                    type="button"
                    className="text-action"
                    onClick={async () => {
                      if (!window.confirm(`فك ربط ${r.name}؟ لن تصله رسائل البوت.`)) return;
                      await unlinkRep(r.id);
                      setChats(loadRepChats());
                    }}
                  >
                    فك الربط
                  </button>
                ) : (
                  <small className="settings-hint">غير مربوط</small>
                )}
              </li>
            ))}
          </ul>

          {options.map((option) => (
            <label key={option.key} className="toggle-switch-row">
              <span>{option.label}</span>
              <span className={`toggle-switch${prefs[option.key] ? " toggle-switch-on" : ""}`}>
                <input type="checkbox" checked={prefs[option.key]} onChange={(e) => void update({ ...prefs, [option.key]: e.target.checked })} />
                <span className="toggle-switch-thumb" />
              </span>
            </label>
          ))}
          <p className="settings-hint">
            للمندوب أزرار ثابتة أسفل المحادثة: أجهزتي، تنتهي، الموقوفة، ديون زبائني، كشفي، بحث - ويكفي أن يكتب اسم زبون أو رقمه للبحث. تحت القوائم أزرار 💬 واتساب ترسل للزبون رسالة جاهزة. من ليس مربوطاً لا يرى أي بيانات.
          </p>
          <RepExtraBotsSettings />
          <div className="settings-actions">
            <button
              type="button"
              className="text-action"
              onClick={async () => {
                if (!window.confirm("فصل بوت المندوبين؟ يُحذف مفتاحه وروابط كل المندوبين من الهاتف.")) return;
                await disconnectRepsBot();
                setConnection((c) => ({ ...c, repsConfigured: false }));
                setChats({});
                setRequests([]);
                setMessage("تم الفصل");
              }}
            >
              فصل بوت المندوبين
            </button>
          </div>
        </>
      )}
      {message && <p className="settings-hint telegram-message">{message}</p>}
    </section>
  );
}

/** 🔄 المزامنة التلقائية - the phone checks the important devices on its own (SyncPriority.java). */
function AutoSyncSettings() {
  const [enabled, setEnabled] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => setEnabled(isAutoSyncEnabled()), []);

  return (
    <div className="morning-digest-settings">
      <label className="toggle-switch-row">
        <span>🔄 مزامنة تلقائية للأجهزة المهمة</span>
        <span className={`toggle-switch${enabled ? " toggle-switch-on" : ""}`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={async (e) => {
              const next = e.target.checked;
              setEnabled(next);
              setSaved((await setAutoSyncEnabled(next)) ? "✓ حُفظ" : "تعذر الحفظ - حاول مجدداً");
            }}
          />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      {saved && <span className="settings-hint">{saved}</span>}
      <ul className="settings-hint auto-sync-rules">
        <li>⛔ انتهى تاريخه (حتى 3 أيام) ولم يُرَ موقوفاً بعد: كل ساعتين</li>
        <li>⏰ بقي يوم واحد: كل 6 ساعات</li>
        <li>📅 بقي 2 - 3 أيام: كل 12 ساعة</li>
        <li>🗓 بقي 4 - 7 أيام: مرة في اليوم</li>
        <li>🔴 موقوف عند Starlink: مرة في اليوم لمدة أسبوع</li>
        <li>بقية الأجهزة: يدوياً فقط بزر «تحديث» في البطاقة</li>
      </ul>
      <p className="settings-hint">
        عندما يكتشف التطبيق أن Starlink أوقف جهازاً يصلك إشعار واحد بكل الأجهزة التي توقفت. الأجهزة
        تُحدَّث واحداً بعد واحد مع استراحة حتى لا يوقفك Starlink بخطأ 429.
      </p>
    </div>
  );
}

/** 🔄 المزامنة في الخلفية - «مزامنة الآن», the day menu and the card's «تحديث من Starlink» read the
 * devices without opening their pages (BackgroundSyncService), once «الظهور فوق التطبيقات» is allowed. */
function BackgroundSyncSettings() {
  const [enabled, setEnabled] = useState(false);
  const [canRun, setCanRun] = useState<boolean | null>(null);
  useEffect(() => {
    setEnabled(isBackgroundSyncEnabled());
    const check = () => void backgroundSyncCanRun().then(setCanRun);
    check();
    // Back from Android's permission page.
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return (
    <div className="morning-digest-settings">
      <label className="toggle-switch-row">
        <span>🌙 المزامنة في الخلفية (بدون فتح الصفحات)</span>
        <span className={`toggle-switch${enabled ? " toggle-switch-on" : ""}`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setBackgroundSyncEnabled(e.target.checked);
              if (e.target.checked && canRun === false) void openOverlaySettings();
            }}
          />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      {enabled && canRun === false && (
        <button type="button" className="dialog-primary" onClick={() => void openOverlaySettings()}>
          اسمح بـ«الظهور فوق التطبيقات»
        </button>
      )}
      {enabled && canRun && <span className="settings-hint">✓ الإذن ممنوح - المزامنة تعمل في الخلفية</span>}
      <p className="settings-hint">
        «مزامنة الآن» وأيام التقويم و«تحديث من Starlink» تقرأ الأجهزة دون أن تظهر صفحاتها: إشعار
        «🔄 3 / 10» مع «إيقاف»، والنتيجة في البوت. الشاشة تبقى مضاءة حتى تنتهي.
      </p>
    </div>
  );
}

/** 🌙 ملخص آخر اليوم - on/off and time; rescheduled from the home page like the morning one. */
function EveningSummarySettings() {
  const [enabled, setEnabled] = useState(true);
  const [hour, setHour] = useState(21);
  useEffect(() => {
    setEnabled(isEveningSummaryEnabled());
    setHour(getEveningSummaryHour());
  }, []);

  return (
    <div className="morning-digest-settings">
      <label className="toggle-switch-row">
        <span>🌙 ملخص آخر اليوم (يصل حتى والتطبيق مغلق)</span>
        <span className={`toggle-switch${enabled ? " toggle-switch-on" : ""}`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              setEveningSummaryEnabled(e.target.checked);
            }}
          />
          <span className="toggle-switch-thumb" />
        </span>
      </label>
      {enabled && (
        <label className="form-field">
          <span>وقت الملخص</span>
          <select
            className="search-input"
            value={hour}
            onChange={(e) => {
              const next = Number(e.target.value);
              setHour(next);
              setEveningSummaryHour(next);
            }}
          >
            {EVENING_HOURS.map((h) => (
              <option key={h} value={h}>
                {h - 12}:00 مساءً
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="settings-hint">
        ما تحصّل اليوم، والشحنات، والمصاريف، وما في الصندوق، ومن لم يدفع بعد - كل عملة وحدها. تُحدَّث أرقامه كلما فتحت الصفحة الرئيسية، والضغط عليه يفتح التقارير.
      </p>
    </div>
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

  async function start() {
    const message = reset
      ? "بدء الأرباح من الصفر مرة أخرى من الآن؟"
      : "بدء الأرباح من الصفر من الآن؟\n\n• التقارير تحسب الأرباح من اليوم فقط.\n• كل المندوبين يبدأون حسابًا جديدًا (القديم في الأرشيف).\n• لا يُحذف أي شيء من حسابات الزبائن، ويمكن التراجع.";
    if (!(await askDeleteCode(message))) return;
    const { reset: next, repStore } = startProfitFresh(loadRepresentativeStore());
    // Starting again keeps the representatives' resets from before the FIRST fresh start.
    const merged = reset ? { ...next, previousRepResets: { ...next.previousRepResets, ...reset.previousRepResets } } : next;
    saveRepresentativeStore(repStore);
    saveProfitReset(merged);
    setReset(merged);
  }

  async function undo() {
    if (!reset) return;
    if (!(await askDeleteCode("إلغاء البداية الجديدة وإرجاع كل الأرباح القديمة وحسابات المندوبين كما كانت؟"))) return;
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
