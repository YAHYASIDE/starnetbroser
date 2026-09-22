"use client";

import { FormEvent, useEffect, useState } from "react";
import { checkHealth, listAccounts, login, register } from "@/lib/apiClient";
import { ApiError } from "@/lib/apiClient";
import { clearTokens, getApiBaseUrl, isDemoMode, isLoggedIn, setApiBaseUrl } from "@/lib/settingsStore";
import { loadDemoAccounts, saveDemoAccounts } from "@/lib/demoAccountStore";
import { createEncryptedBackupFile, mergeImportedAccounts, readEncryptedBackupFile } from "@/lib/accountBackup";
import { exportAccountSessions, importAccountSessions } from "@/lib/localBrowser";
import { saveAndShareBackupFile } from "@/lib/backupFile";
import {
  Currency,
  CurrencyStore,
  listCurrencies,
  loadCurrencyStore,
  saveCurrencyStore,
  setCurrencyEnabled,
  setCurrencyRate,
  upsertCurrency,
} from "@/lib/currencyStore";

export default function SettingsPage() {
  const [url, setUrl] = useState("");
  const [testResult, setTestResult] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setUrl(getApiBaseUrl());
    setLoggedIn(isLoggedIn());
  }, []);

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

      <CurrencySection />
      <BackupSection />
    </main>
  );
}

function formatRate(currency: Currency): string {
  return `1 USD = ${currency.rateFromUsd} ${currency.symbol}`;
}

function formatUpdatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ar");
  } catch {
    return iso;
  }
}

function CurrencySection() {
  const [store, setStore] = useState<CurrencyStore>({});
  useEffect(() => setStore(loadCurrencyStore()), []);

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newSymbol, setNewSymbol] = useState("");
  const [newRate, setNewRate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  function persist(next: CurrencyStore) {
    setStore(next);
    saveCurrencyStore(next);
  }

  function startEditRate(currency: Currency) {
    setEditingCode(currency.code);
    setEditRate(String(currency.rateFromUsd));
  }

  function saveEditRate(code: string) {
    const rate = Number(editRate);
    if (!Number.isFinite(rate) || rate <= 0) return;
    persist(setCurrencyRate(store, code, rate));
    setEditingCode(null);
  }

  function toggleEnabled(currency: Currency) {
    persist(setCurrencyEnabled(store, currency.code, !currency.enabled));
  }

  function submitNewCurrency(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rate = Number(newRate);
    if (!newCode.trim() || !newName.trim() || !newSymbol.trim()) {
      setFormError("املأ جميع الحقول");
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setFormError("أدخل سعر صرف صحيح أكبر من صفر");
      return;
    }
    setFormError(null);
    persist(upsertCurrency(store, { code: newCode, name: newName, symbol: newSymbol, rateFromUsd: rate }));
    setNewCode("");
    setNewName("");
    setNewSymbol("");
    setNewRate("");
    setShowAddForm(false);
  }

  const currencies = listCurrencies(store, true);

  return (
    <section className="section">
      <h2 className="section-title">العملات وأسعار الصرف</h2>
      <p className="settings-hint">
        الدولار الأمريكي هو العملة المرجعية الثابتة (لا يمكن تعديل سعره). سعر كل عملة أخرى هو قيمة
        1 دولار بهذه العملة - تغييره هنا لا يُغيّر أي معاملة سابقة، فسعر الصرف يُحفظ داخل كل معاملة
        لحظة تسجيلها.
      </p>

      <ul className="currency-list">
        {currencies.map((currency) => (
          <li key={currency.code} className={`currency-row${currency.enabled ? "" : " currency-row-disabled"}`}>
            <div className="currency-row-main">
              <strong>{currency.name}</strong>
              <span className="currency-row-code" dir="ltr">{currency.code}</span>
            </div>
            {editingCode === currency.code ? (
              <div className="currency-row-edit">
                <input
                  className="search-input"
                  type="number"
                  min="0"
                  step="0.0001"
                  dir="ltr"
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                />
                <button className="dialog-primary" type="button" onClick={() => saveEditRate(currency.code)}>حفظ</button>
                <button className="dialog-secondary" type="button" onClick={() => setEditingCode(null)}>إلغاء</button>
              </div>
            ) : (
              <div className="currency-row-info">
                <span dir="ltr">{formatRate(currency)}</span>
                <span className="currency-row-updated">آخر تحديث: {formatUpdatedAt(currency.updatedAt)}</span>
              </div>
            )}
            {currency.code !== "USD" && editingCode !== currency.code && (
              <div className="currency-row-actions">
                <button className="text-action" type="button" onClick={() => startEditRate(currency)}>تعديل السعر</button>
                <button className="text-action" type="button" onClick={() => toggleEnabled(currency)}>
                  {currency.enabled ? "إخفاء" : "إظهار"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!showAddForm ? (
        <div className="settings-actions">
          <button className="btn-icon" type="button" onClick={() => setShowAddForm(true)}>+ إضافة عملة جديدة</button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submitNewCurrency}>
          <input className="search-input" dir="ltr" placeholder="الرمز الدولي، مثال: EUR" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          <input className="search-input" placeholder="اسم العملة" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="search-input" dir="ltr" placeholder="رمز العرض، مثال: €" value={newSymbol} onChange={(e) => setNewSymbol(e.target.value)} />
          <input
            className="search-input"
            type="number"
            min="0"
            step="0.0001"
            dir="ltr"
            placeholder="قيمة 1 دولار بهذه العملة"
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
          />
          {formError && <div className="account-card-alert">{formError}</div>}
          <div className="settings-actions">
            <button className="btn-icon" type="submit">إضافة</button>
            <button className="btn-icon" type="button" onClick={() => setShowAddForm(false)}>إلغاء</button>
          </div>
        </form>
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
