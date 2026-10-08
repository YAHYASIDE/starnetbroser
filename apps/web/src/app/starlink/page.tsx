"use client";

import { FrancHint, FrancUnit } from "@/components/FrancHint";
import { francBadge, francToSifa, isFrancAccount, sifaToFranc } from "@/lib/payCurrency";
import { ChangeEvent, FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { confirmClosedMonthChange, ledgerEntryMonthDates } from "@/lib/monthClosing";
import { loadAllocationStore, removeAllocationsForEntryFromStore, saveAllocationStore } from "@/lib/paymentAllocationStore";
import {
  buildPreviousDebtPayment,
  deletePreviousDebt,
  listOpenPreviousDebts,
  loadPreviousDebts,
  savePreviousDebts,
  totalPreviousDebtUsd,
  type PreviousDebt,
  type PreviousDebtList,
} from "@/lib/previousDebt";
import { StarlinkAccountSummary } from "@starnet/shared";
import { buildCardStatementFor, cardDeviceRows, groupDevicesByCard, type CardDeviceGroups, type CardStatement } from "@/lib/cardDevices";
import { debtRepId, isStarlinkTab, splitDebtsByRep, STARLINK_TABS, type StarlinkTab } from "@/lib/starlinkTabs";
import { DateInput } from "@/components/DateInput";
import { PartySheet } from "@/components/AccountsSection";
import { deviceMatchesQuery } from "@/lib/homeInsights";
import { loadCashEntries, saveCashEntries } from "@/lib/cashStore";
import { deleteProof, getProof, putProof } from "@/lib/paymentProofStore";
import { resizeImageToDataUrl } from "@/lib/imageUtils";
import { loadAccountsBook, type MoneyAccount } from "@/lib/moneyAccounts";
import { ClientStore, getClient, loadClientStore } from "@/lib/clientStore";
import { CurrencyStore, getCurrency, loadCurrencyStore, realRateFromUsd, saveCurrencyStore, setCurrencyRate } from "@/lib/currencyStore";
import { demoAccounts } from "@/lib/demoData";
import { loadDemoAccounts } from "@/lib/demoAccountStore";
import { formatAmount } from "@/lib/formatAmount";
import {
  LEDGER_CURRENCIES,
  LEDGER_CURRENCY_LABELS,
  LedgerByAccount,
  LedgerCurrency,
  LedgerEntry,
  loadLedgerStore,
  saveLedgerStore,
} from "@/lib/ledgerStore";
import { listAccounts } from "@/lib/apiClient";
import { isDemoMode, isLoggedIn } from "@/lib/settingsStore";
import {
  addPaymentCard,
  type CardDeposit,
  depositLabel,
  loadCardDeposits,
  loadPaymentCards,
  type PaymentCardList,
  pendingCardDeposits,
  pendingCardSpends,
  removePaymentCard,
  debtUsdToday,
  spendCandidates,
  rankAllSpend,
  saveCardDeposits,
  savePaymentCards,
  setDepositStatus,
} from "@/lib/kastCards";
import { drainKastDeposits, kastNotificationsEnabled, openKastNotificationAccess, pushFillCards } from "@/lib/localBrowser";
import { loadCardFillBook, maskedNumber, removeCardFill, saveCardFillBook, setCardFill, validateCardFill, type CardFillBook, type CardFillData, type CardFillInput } from "@/lib/cardFill";
import { getRepresentative, loadRepresentativeStore, RepresentativeStore } from "@/lib/repStore";
import {
  buildCardStatement,
  CardMoveVia,
  CardPayment,
  cardShortfallForSuspended,
  CardTopUp,
  CardTopUpInput,
  CardTopUpList,
  deleteCardTopUp,
  editCardTopUp,
  editSettlement,
  type ActualPaid,
  listCardPayments,
  listOpenShipmentDebts,
  listSuspendedWithDebt,
  loadCardTopUps,
  OpenShipmentDebt,
  postCardTopUpToCash,
  recordCardTopUp,
  removeCardTopUpCash,
  replaceCardTopUpCash,
  saveCardTopUps,
  SettlementEdit,
  settleShipments,
  totalOpenDebtUsd,
  unsettleShipmentCost,
  debtMatchesQuery,
} from "@/lib/starlinkDebt";

function todayInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysSince(date: string): number {
  const then = new Date(date.replace(/\//g, "-"));
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / 86400000));
}

function usd(value: number): string {
  return `${value < 0 ? "-" : ""}${formatAmount(Math.abs(value))} $`;
}

/**
 * "ستارلينك والبطاقة": what STAR NET currently owes Starlink (every open D, per device - we are
 * always borrowing the current month), paying it from the "كاش" card (one device or several at
 * once), and the card's own balance and statement. Paying a D is the moment its profit and the
 * representative's share become real (dated that day).
 */
/** Per-phone: which «ستارلينك والبطاقة» sections the operator folded away (settings-style key, not backed up). */
/** 🛰️ The icon he opened last (per-phone convenience). */
const TAB_KEY = "starnet.starlinkTab";

export default function StarlinkPage() {
  const [ledgerStore, setLedgerStore] = useState<LedgerByAccount>({});
  const [accounts, setAccounts] = useState<StarlinkAccountSummary[]>(demoAccounts);
  const [clientStore, setClientStore] = useState<ClientStore>({});
  const [repStore, setRepStore] = useState<RepresentativeStore>({});
  const [currencyStore, setCurrencyStore] = useState<CurrencyStore>({});
  const [topUps, setTopUps] = useState<CardTopUpList>([]);
  // 💰 «حسابي»'s bank/wallet accounts - a card charge/withdraw can move one of them (its balance follows).
  const [moneyAccounts, setMoneyAccounts] = useState<MoneyAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<"pay" | "topup" | "withdraw" | "prevpay" | "edittopup" | "editpay" | null>(null);
  const [editTopUp, setEditTopUp] = useState<CardTopUp | null>(null);
  const [editPayment, setEditPayment] = useState<CardPayment | null>(null);
  const [previousDebts, setPreviousDebts] = useState<PreviousDebtList>([]);
  const [prevPay, setPrevPay] = useState<PreviousDebt | null>(null);
  const [payItems, setPayItems] = useState<OpenShipmentDebt[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  // 💳 KAST: the cards (which pays which device) and the dollars received waiting to be recorded.
  const [paymentCards, setPaymentCards] = useState<PaymentCardList>([]);
  // 💳 the cards' full details, for filling Starlink's card form in a device's browser.
  const [fillBook, setFillBook] = useState<CardFillBook>({});
  const [deposits, setDeposits] = useState<CardDeposit[]>([]);
  const [depositToRecord, setDepositToRecord] = useState<CardDeposit | null>(null);
  const [spendToRecord, setSpendToRecord] = useState<CardDeposit | null>(null);
  /** «✏️ جهاز آخر»: the KAST payment whose device he is choosing by hand. */
  const [pickFor, setPickFor] = useState<CardDeposit | null>(null);
  const [kastNotifications, setKastNotifications] = useState<boolean | null>(null);
  // 🛰️ Four icons at the top instead of one long page (his Oct 2026 ask): one section at a time.
  const [tab, setTab] = useState<StarlinkTab>(() => {
    try {
      const saved = window.localStorage.getItem(TAB_KEY);
      return isStarlinkTab(saved) ? saved : "devices";
    } catch {
      return "devices";
    }
  });
  function chooseTab(next: StarlinkTab) {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      // per-phone convenience only
    }
  }

  useEffect(() => {
    setLedgerStore(loadLedgerStore());
    setClientStore(loadClientStore());
    setRepStore(loadRepresentativeStore());
    setCurrencyStore(loadCurrencyStore());
    setTopUps(loadCardTopUps());
    setMoneyAccounts(loadAccountsBook().accounts);
    setPreviousDebts(loadPreviousDebts());
    setPaymentCards(loadPaymentCards());
    setFillBook(loadCardFillBook());
    setDeposits(loadCardDeposits());
    void drainKastDeposits().then((added) => {
      if (added.length) setDeposits(loadCardDeposits());
    });
    void kastNotificationsEnabled().then(setKastNotifications);
    if (isDemoMode()) {
      setAccounts(loadDemoAccounts(demoAccounts));
      return;
    }
    if (!isLoggedIn()) return;
    listAccounts().then(setAccounts).catch(() => {});
  }, []);

  const mruRate = getCurrency(currencyStore, "MRU")?.rateFromUsd;
  const sifaRate = getCurrency(currencyStore, "SIFA")?.rateFromUsd;
  const debts = useMemo(() => listOpenShipmentDebts(ledgerStore), [ledgerStore]);
  // 🔍 search the list by device, customer, rep, email or amount.
  const [debtQuery, setDebtQuery] = useState("");
  // An earlier owner's unpaid debts (previousDebt.ts) - their own records, shown with an orange D.
  const openPrevious = useMemo(() => listOpenPreviousDebts(previousDebts, ledgerStore), [previousDebts, ledgerStore]);
  const totalDebt = totalOpenDebtUsd(debts) + totalPreviousDebtUsd(openPrevious);
  const suspended = useMemo(() => listSuspendedWithDebt(accounts, debts, openPrevious), [accounts, debts, openPrevious]);
  const card = useMemo(() => buildCardStatement(topUps, listCardPayments(ledgerStore)), [topUps, ledgerStore]);
  const cardGroups = useMemo(() => groupDevicesByCard(accounts, paymentCards), [accounts, paymentCards]);
  const suspendedShortfall = cardShortfallForSuspended(suspended, card.balanceUsd);
  const selectedDebts = debts.filter((d) => selected.has(d.entry.id));

  const account = (id: string) => accounts.find((a) => a.id === id);
  const shownDebts = debts.filter((d) => {
    const acc = account(d.accountId);
    return debtMatchesQuery(
      debtQuery,
      [acc?.name, acc?.expectedEmail, getClient(clientStore, acc?.clientId)?.name, getRepresentative(repStore, debtRepId(d, acc))?.name],
      d.costUsd,
    );
  });
  const shownPrevious = openPrevious.filter((d) => {
    const acc = account(d.accountId);
    return debtMatchesQuery(debtQuery, [acc?.name, acc?.expectedEmail, getClient(clientStore, acc?.clientId)?.name, d.note], d.amountUsd);
  });
  const debtKey = (d: OpenShipmentDebt) => d.entry.id;
  const repName = (id: string) => getRepresentative(repStore, id)?.name ?? "مندوب";
  // 📋 his own D's / 🤝 each rep's D's - the shown (searched) ones and all of them (for the counts).
  const shownSplit = splitDebtsByRep(shownDebts, account, repName);
  const allSplit = splitDebtsByRep(debts, account, repName);
  const pendingNotices = pendingCardSpends(deposits).length + pendingCardDeposits(deposits).length;
  const tabCount: Record<StarlinkTab, number> = {
    devices: allSplit.mine.length + openPrevious.length,
    reps: debts.length - allSplit.mine.length,
    cards: paymentCards.length,
    notices: pendingNotices,
  };
  const toggleAll = (list: OpenShipmentDebt[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const all = list.length > 0 && list.every((d) => next.has(debtKey(d)));
      for (const d of list) {
        if (all) next.delete(debtKey(d));
        else next.add(debtKey(d));
      }
      return next;
    });
  /** One D row (his devices and the reps' share it): select, device, customer, rep, cost, «سدّدت». */
  const debtRow = (d: OpenShipmentDebt) => {
    const acc = account(d.accountId);
    const client = getClient(clientStore, acc?.clientId)?.name;
    const rep = getRepresentative(repStore, debtRepId(d, acc));
    const isSelected = selected.has(debtKey(d));
    return (
      <li key={debtKey(d)} className={`sl-row${isSelected ? " sl-row-selected" : ""}`}>
        <label className="sl-check">
          <input type="checkbox" checked={isSelected} onChange={() => toggle(d)} aria-label={`تحديد ${acc?.name ?? ""}`} />
        </label>
        <div className="sl-row-main">
          <strong>
            <span className="sl-d">D</span> {acc?.name ?? "جهاز محذوف"}
            {acc?.serviceStatus === "suspended" && <span className="sl-stopped">متوقف</span>}
          </strong>
          <span>
            {client ?? "بدون زبون"}
            {rep ? ` · 🤝 ${rep.name}` : ""}
          </span>
          <span className="sl-meta">
            منذ <bdi dir="ltr">{d.entry.date}</bdi> ({daysSince(d.entry.date)} يوم)
            {d.expectedProfitUsd !== undefined && (
              <>
                {" "}· ربح متوقع{" "}
                <bdi dir="ltr">
                  {mruRate ? `${formatAmount(Math.round(d.expectedProfitUsd * mruRate))} أوقية` : usd(d.expectedProfitUsd)}
                </bdi>
              </>
            )}
          </span>
        </div>
        <div className="sl-row-side">
          <strong dir="ltr">{usd(d.costUsd)}</strong>
          <button type="button" className="text-action" onClick={() => openPay([d])}>
            سدّدت
          </button>
        </div>
      </li>
    );
  };
  const searchBox = (
    <input
      className="search-input sl-search"
      type="search"
      placeholder="🔍 ابحث: الزبون، الجهاز، المندوب أو المبلغ"
      value={debtQuery}
      onChange={(e) => setDebtQuery(e.target.value)}
    />
  );

  function toggle(d: OpenShipmentDebt) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(debtKey(d))) next.delete(debtKey(d));
      else next.add(debtKey(d));
      return next;
    });
  }

  function openPay(items: OpenShipmentDebt[]) {
    if (items.length === 0) return;
    setSpendToRecord(null);
    setPayItems(items);
    setSheet("pay");
  }

  // 💱 A real card payment to Starlink reveals today's true rate (foreign paid ÷ dollars out). Keep
  // the currency's registered *current* rate fresh from it, going forward only - setCurrencyRate
  // never touches the snapshot rate already locked onto past records. Returns the new rate when it
  // actually changed, so the toast can mention it (the operator asked for this to be automatic).
  function recordRealRate(code: string | undefined, foreignPaid: number | undefined, usdPaid: number): number | null {
    if (!code || code === "USD") return null;
    const rate = realRateFromUsd(foreignPaid, usdPaid);
    if (rate === null) return null;
    const current = getCurrency(currencyStore, code)?.rateFromUsd;
    if (current === undefined || Math.abs(current - rate) < 1e-6) return null;
    const next = setCurrencyRate(currencyStore, code, rate);
    setCurrencyStore(next);
    saveCurrencyStore(next);
    return rate;
  }

  function pay(date: string, fromCard: boolean, actual?: ActualPaid) {
    if (!confirmClosedMonthChange([date])) return;
    const next = settleShipments(
      ledgerStore,
      payItems.map((d) => ({ accountId: d.accountId, entryId: d.entry.id })),
      { date, profitRates: { MRU: mruRate, SIFA: sifaRate }, fromCard, ...(actual && payItems.length === 1 ? { actual } : {}) },
    );
    setLedgerStore(next);
    saveLedgerStore(next);
    setSelected(new Set());
    if (spendToRecord) updateDeposit(spendToRecord.id, "recorded");
    setSpendToRecord(null);
    setSheet(null);
    const paidUsd = actual && payItems.length === 1 ? actual.usd : totalOpenDebtUsd(payItems);
    const costCode = payItems.length === 1 ? payItems[0]!.entry.starlinkCost?.currencyCode : undefined;
    const newRate = actual && payItems.length === 1 ? recordRealRate(costCode, actual.amount, actual.usd) : null;
    setToast(
      `✓ تم تسديد ${payItems.length} جهاز بـ ${usd(paidUsd)} - الربح وحصص المندوبين نزلت بتاريخ ${date}${newRate !== null && costCode ? ` · حُدّث سعر ${costCode} الحالي إلى ${formatAmount(newRate)}` : ""}`,
    );
  }

  function openPreviousPay(debt: PreviousDebt) {
    setPrevPay(debt);
    setSheet("prevpay");
  }

  function payPrevious(debt: PreviousDebt, input: PreviousPayInput): string | null {
    if (!confirmClosedMonthChange([input.date])) return "لم يُحفظ (الشهر مُقفل)";
    const acc = account(debt.accountId);
    const rep = getRepresentative(repStore, acc?.representativeId);
    const rate = input.chargeCurrency === "USD" ? 1 : getCurrency(currencyStore, input.chargeCurrency)?.rateFromUsd;
    const result = buildPreviousDebtPayment(debt, {
      ...input,
      chargeRateFromUsd: rate,
      profitRates: { MRU: mruRate, SIFA: sifaRate },
      email: acc?.expectedEmail || acc?.starlinkAccountEmail || "",
      representative: rep ? { id: rep.id, commissionPercent: rep.commissionPercent, sharesLosses: rep.sharesLosses } : undefined,
    });
    if (!result.ok) return result.message;
    const next = { ...ledgerStore, [debt.accountId]: [...(ledgerStore[debt.accountId] ?? []), result.entry] };
    setLedgerStore(next);
    saveLedgerStore(next);
    setSheet(null);
    setPrevPay(null);
    const newRate = recordRealRate(input.chargeCurrency, input.chargeAmount, input.paidUsd);
    setToast(
      `✓ تم تسديد الدين السابق على ${acc?.name ?? "الجهاز"} (${usd(input.paidUsd)}) وسُجّل على الزبون ${formatAmount(input.chargeAmount)} ${LEDGER_CURRENCY_LABELS[input.chargeCurrency]}${newRate !== null ? ` · حُدّث سعر ${LEDGER_CURRENCY_LABELS[input.chargeCurrency]} الحالي إلى ${formatAmount(newRate)}` : ""}`,
    );
    return null;
  }

  function removePrevious(debt: PreviousDebt) {
    if (!window.confirm(`حذف الدين السابق ${usd(debt.amountUsd)} على ${account(debt.accountId)?.name ?? "الجهاز"}؟ (إن سُجّل خطأً)`)) return;
    const next = deletePreviousDebt(previousDebts, debt.id);
    savePreviousDebts(next);
    setPreviousDebts(next);
  }

  // 💳 Records a card charge (direction "in") or withdrawal (direction "out"). The counterpart money
  // moves through الكاش, a bank/wallet app (its balance follows) or - for a withdrawal - «خسارة»
  // (gone, counts as a مصروف in the reports). An optional payment-proof photo is kept by movement id.
  function saveMovement(input: CardTopUpInput, proofDataUrl?: string): string | null {
    if (!confirmClosedMonthChange([input.date])) return "لم يُحفظ (الشهر مُقفل)";
    const result = recordCardTopUp(topUps, input);
    if (!result.ok) return result.message;
    setTopUps(result.list);
    saveCardTopUps(result.list);
    saveCashEntries(postCardTopUpToCash(loadCashEntries(), result.topUp));
    if (proofDataUrl) void putProof(result.topUp.id, proofDataUrl);
    if (depositToRecord) updateDeposit(depositToRecord.id, "recorded");
    setDepositToRecord(null);
    setSheet(null);
    return null;
  }

  function updateDeposit(id: string, status: CardDeposit["status"]) {
    const next = setDepositStatus(loadCardDeposits(), id, status);
    saveCardDeposits(next);
    setDeposits(next);
  }

  function recordDeposit(deposit: CardDeposit) {
    setDepositToRecord(deposit);
    setSheet("topup");
  }

  function addCard(last4: string, name: string): string | null {
    const result = addPaymentCard(paymentCards, { last4, name });
    if (!result.ok) return result.message;
    savePaymentCards(result.list);
    setPaymentCards(result.list);
    return null;
  }

  function removeCard(id: string) {
    const card = paymentCards.find((c) => c.id === id);
    if (!card || !window.confirm(`حذف البطاقة ${card.name} •${card.last4} من القائمة؟`)) return;
    const next = removePaymentCard(paymentCards, id);
    savePaymentCards(next);
    setPaymentCards(next);
    if (fillBook[id]) storeFillBook(removeCardFill(fillBook, id));
  }

  function storeFillBook(next: CardFillBook) {
    saveCardFillBook(next);
    setFillBook(next);
    void pushFillCards();
  }

  function saveCardDetails(card: PaymentCardList[number], input: CardFillInput): string | null {
    const result = validateCardFill(input, card);
    if (!result.ok) return result.message;
    storeFillBook(setCardFill(fillBook, card.id, result.data));
    return null;
  }

  function removeTopUp(topUp: CardTopUp) {
    const isWithdraw = topUp.direction === "out";
    if (!window.confirm(isWithdraw ? "حذف عملية السحب هذه؟ يُحذف أثرها من الكاش/التطبيق أيضًا." : "حذف عملية الشحن هذه؟ يُحذف قيدها من الكاش أيضًا.")) return;
    if (!confirmClosedMonthChange([topUp.date])) return;
    const next = deleteCardTopUp(topUps, topUp.id);
    setTopUps(next);
    saveCardTopUps(next);
    saveCashEntries(removeCardTopUpCash(loadCashEntries(), topUp.id));
    void deleteProof(topUp.id);
    setSheet(null);
  }

  function openEditTopUp(topUp: CardTopUp) {
    setEditTopUp(topUp);
    setSheet("edittopup");
  }

  function saveTopUpEdit(topUp: CardTopUp, input: CardTopUpInput, proofDataUrl?: string): string | null {
    if (!confirmClosedMonthChange([topUp.date, input.date])) return "لم يُحفظ (الشهر مُقفل)";
    const result = editCardTopUp(topUps, topUp.id, input);
    if (!result.ok) return result.message;
    setTopUps(result.list);
    saveCardTopUps(result.list);
    saveCashEntries(replaceCardTopUpCash(loadCashEntries(), result.topUp));
    if (proofDataUrl) void putProof(topUp.id, proofDataUrl);
    setSheet(null);
    setToast(input.direction === "out" ? "✓ تم تعديل عملية السحب" : "✓ تم تعديل عملية الشحن وقيدها في الكاش");
    return null;
  }

  function openEditPayment(payment: CardPayment) {
    setEditPayment(payment);
    setSheet("editpay");
  }

  function replaceEntry(accountId: string, entryId: string, next: LedgerEntry | null) {
    const entries = ledgerStore[accountId] ?? [];
    const updated = next ? entries.map((e) => (e.id === entryId ? next : e)) : entries.filter((e) => e.id !== entryId);
    const store = { ...ledgerStore, [accountId]: updated };
    setLedgerStore(store);
    saveLedgerStore(store);
  }

  function savePaymentEdit(payment: CardPayment, edit: SettlementEdit): string | null {
    const result = editSettlement(payment.entry, edit);
    if (!result.ok) return result.message;
    if (!confirmClosedMonthChange([...ledgerEntryMonthDates(payment.entry), ...ledgerEntryMonthDates(result.entry)])) {
      return "لم يُحفظ (الشهر مُقفل)";
    }
    replaceEntry(payment.accountId, payment.entry.id, result.entry);
    setSheet(null);
    setToast(`✓ تم تعديل تسديد ${account(payment.accountId)?.name ?? "الجهاز"} - الربح بتاريخ ${edit.date}`);
    return null;
  }

  /** A payment recorded by mistake: a normal shipment goes back to D; the payment of an earlier
   * owner's debt is removed entirely (it was its own operation), so that debt is open again. */
  function undoPayment(payment: CardPayment) {
    const name = account(payment.accountId)?.name ?? "الجهاز";
    const isPrevious = Boolean(payment.entry.previousDebtId);
    const question = isPrevious
      ? `حذف تسديد الدين السابق على ${name}؟ يُحذف من حساب الزبون ويرجع الدين السابق غير مدفوع.`
      : `إلغاء تسديد ${name}؟ يرجع الجهاز إلى D (غير مدفوع لستارلينك) ويخرج ربحه من التقارير حتى تسدده من جديد.`;
    if (!window.confirm(question)) return;
    if (!confirmClosedMonthChange(ledgerEntryMonthDates(payment.entry))) return;
    if (isPrevious) {
      replaceEntry(payment.accountId, payment.entry.id, null);
      const allocations = removeAllocationsForEntryFromStore(loadAllocationStore(), payment.entry.id);
      saveAllocationStore(allocations);
    } else {
      replaceEntry(payment.accountId, payment.entry.id, unsettleShipmentCost(payment.entry));
    }
    setSheet(null);
    setToast(isPrevious ? `✓ حُذف تسديد الدين السابق على ${name}` : `✓ رجع ${name} إلى D`);
  }

  return (
    <main className="home">
      <div className="session-header">
        <Link href="/" className="btn-link">
          ← رجوع
        </Link>
        <h1 className="section-title">ستارلينك والبطاقة</h1>
      </div>

      {toast && (
        <button type="button" className="sl-toast" onClick={() => setToast(null)}>
          {toast}
        </button>
      )}

      <section className="sl-summary">
        <div className="sl-summary-item sl-summary-debt">
          <span>المتسلَّف عليه (عليّ لستارلينك)</span>
          <strong dir="ltr">{usd(totalDebt)}</strong>
          <small>
            {debts.length} D منك{openPrevious.length > 0 ? ` · ${openPrevious.length} دين سابق` : ""}
          </small>
        </div>
        <div className={`sl-summary-item sl-summary-card${card.balanceUsd < totalDebt ? " sl-summary-short" : ""}`}>
          <span>💳 رصيد بطاقة كاش</span>
          <strong dir="ltr">{usd(card.balanceUsd)}</strong>
          <small>{card.balanceUsd < totalDebt ? `ينقصها ${usd(totalDebt - card.balanceUsd)} لتسديد الكل` : "يكفي لتسديد الكل"}</small>
        </div>
      </section>

      {suspended.length > 0 && (
        <section className="section sl-alert">
          <h2 className="sl-title">⚠️ أجهزة توقفت وعليها D - ادفع لستارلينك الآن</h2>
          {suspendedShortfall > 0 && (
            <p className="sl-card-short">
              💳 رصيد البطاقة لا يكفي لها - ينقصها <bdi dir="ltr">{usd(suspendedShortfall)}</bdi>. اشحنها من أيقونة «💳 البطاقات».
            </p>
          )}
          <ul className="sl-list">
            {suspended.map((s) => (
              <li key={s.account.id} className="sl-row sl-row-alert">
                <div className="sl-row-main">
                  <strong>{s.account.name}</strong>
                  <span>{getClient(clientStore, s.account.clientId)?.name ?? "بدون زبون"} · متوقف بسبب عدم دفع الفواتير</span>
                </div>
                <div className="sl-row-side">
                  <strong dir="ltr">{usd(s.costUsd)}</strong>
                  <button
                    type="button"
                    className="dialog-primary sl-pay-one"
                    onClick={() => (s.debts.length > 0 ? openPay(s.debts) : s.previousDebts[0] && openPreviousPay(s.previousDebts[0]))}
                  >
                    سدّدت
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav className="sl-tabs" role="tablist" aria-label="أقسام ستارلينك والبطاقة" data-tour="starlink-tabs">
        {STARLINK_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`sl-tab${tab === t.id ? " sl-tab-active" : ""}`}
            onClick={() => chooseTab(t.id)}
          >
            <span className="sl-tab-icon" aria-hidden="true">
              {t.icon}
            </span>
            <small>{t.label}</small>
            {tabCount[t.id] > 0 && <b className={`sl-tab-count${t.id === "notices" ? " sl-tab-count-alert" : ""}`}>{tabCount[t.id]}</b>}
          </button>
        ))}
      </nav>

      {tab === "devices" && (
      <section className="section">
        <div className="sl-head">
          <h2 className="sl-title">📋 أجهزتي المتسلَّف عليها</h2>
          {shownSplit.mine.length > 0 && (
            <button type="button" className="text-action" onClick={() => toggleAll(shownSplit.mine)}>
              {shownSplit.mine.every((d) => selected.has(debtKey(d))) ? "إلغاء التحديد" : debtQuery.trim() ? `تحديد النتائج (${shownSplit.mine.length})` : "تحديد الكل"}
            </button>
          )}
        </div>
        {allSplit.mine.length + openPrevious.length > 0 && searchBox}
        {debtQuery.trim() && shownSplit.mine.length === 0 && shownPrevious.length === 0 && (
          <p className="empty-state">لا توجد نتيجة لـ «{debtQuery.trim()}».</p>
        )}
        {allSplit.mine.length === 0 && openPrevious.length === 0 ? (
          <p className="empty-state">لا يوجد جهاز لك عليه D{allSplit.reps.length ? " - أجهزة المناديب في «🤝 المناديب»." : " - لا شيء عليك لستارلينك الآن."}</p>
        ) : (
          <ul className="sl-list">
            {shownSplit.mine.map((d) => debtRow(d))}
          </ul>
        )}
        {shownPrevious.length > 0 && (
          <ul className="sl-list sl-list-previous">
            {shownPrevious.map((d) => {
              const acc = account(d.accountId);
              return (
                <li key={d.id} className="sl-row sl-row-previous">
                  <div className="sl-row-main">
                    <strong>
                      <span className="sl-d sl-d-previous">D</span> {acc?.name ?? "جهاز محذوف"}
                      <span className="sl-previous-tag">دين سابق</span>
                      {acc?.serviceStatus === "suspended" && <span className="sl-stopped">متوقف</span>}
                    </strong>
                    <span>
                      {getClient(clientStore, acc?.clientId)?.name ?? "بدون زبون"}
                      {d.note ? ` · ${d.note}` : ""}
                    </span>
                    <span className="sl-meta">
                      منذ <bdi dir="ltr">{d.date}</bdi> ({daysSince(d.date)} يوم) · يُسجَّل على الزبون عند التسديد
                    </span>
                  </div>
                  <div className="sl-row-side">
                    <strong dir="ltr">{usd(d.amountUsd)}</strong>
                    <button type="button" className="text-action" onClick={() => openPreviousPay(d)}>
                      سدّدت
                    </button>
                    <button type="button" className="text-action sl-delete" onClick={() => removePrevious(d)}>
                      حذف
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      )}

      {tab === "reps" && (
        <section className="section">
          <div className="sl-head">
            <h2 className="sl-title">🤝 أجهزة المناديب المتسلَّف عليها</h2>
          </div>
          {allSplit.reps.length > 0 && searchBox}
          {allSplit.reps.length === 0 ? (
            <p className="empty-state">لا يوجد جهاز مندوب عليه D الآن.</p>
          ) : shownSplit.reps.length === 0 ? (
            <p className="empty-state">لا توجد نتيجة لـ «{debtQuery.trim()}».</p>
          ) : (
            shownSplit.reps.map((group) => (
              <div key={group.repId} className="sl-rep-group">
                <div className="sl-rep-head">
                  <strong>🤝 {repName(group.repId)}</strong>
                  <span>
                    {group.debts.length} جهاز · <bdi dir="ltr">{usd(group.totalUsd)}</bdi>
                  </span>
                  <button type="button" className="text-action" onClick={() => toggleAll(group.debts)}>
                    {group.debts.every((d) => selected.has(debtKey(d))) ? "إلغاء التحديد" : "تحديد أجهزته"}
                  </button>
                </div>
                <ul className="sl-list">{group.debts.map((d) => debtRow(d))}</ul>
              </div>
            ))
          )}
        </section>
      )}

      {(tab === "devices" || tab === "reps") && selectedDebts.length > 0 && (
        <div className="sl-batch-bar">
          <span>
            {selectedDebts.length} جهاز · <bdi dir="ltr">{usd(totalOpenDebtUsd(selectedDebts))}</bdi>
          </span>
          <button type="button" className="dialog-primary" onClick={() => openPay(selectedDebts)}>
            تسديد المحدد
          </button>
        </div>
      )}

      {tab === "cards" && (
      <section className="section">
        <div className="sl-head" data-tour="card-section">
          <h2 className="sl-title">💳 بطاقة كاش</h2>
          <div className="sl-card-actions">
            <button type="button" className="btn-icon" onClick={() => setSheet("topup")}>
              + شحن البطاقة
            </button>
            <button type="button" className="btn-icon sl-withdraw-btn" onClick={() => setSheet("withdraw")}>
              💵 سحب رصيد
            </button>
          </div>
        </div>
        {card.rows.length === 0 ? (
          <p className="empty-state">لا توجد حركات بعد. سجّل «شحن البطاقة» عندما تضع فيها مالًا.</p>
        ) : (
          <ul className="sl-list">
            {card.rows.map((row) => (
              <li key={`${row.type}-${row.id}`} className={`sl-row sl-card-row sl-card-${row.type}`}>
                <div className="sl-row-main">
                  {row.type === "topup" ? (
                    (() => {
                      const t = row.topUp;
                      const out = t.direction === "out";
                      const via = t.via ?? "cash";
                      const acc = via === "account" ? moneyAccounts.find((a) => a.id === t.accountId) : undefined;
                      const place = via === "loss" ? "خسارة (مال ضائع)" : via === "account" ? `${acc?.icon ? `${acc.icon} ` : ""}${acc?.name ?? "تطبيق"}` : "الكاش";
                      if (via === "reset") {
                        return (
                          <>
                            <strong>🔄 تصفير الرصيد</strong>
                            <span>البداية من جديد - تصحيح، ليس مصروفًا</span>
                          </>
                        );
                      }
                      return (
                        <>
                          <strong>{out ? "💵 سحب رصيد" : "⬆️ شحن البطاقة"}</strong>
                          <span>
                            {via === "loss" ? (
                              <>خسارة (مال ضائع){t.note ? ` · ${t.note}` : ""}</>
                            ) : (
                              <>
                                {out ? "إلى" : "من"} {place} <bdi dir="ltr">{formatAmount(t.paidAmount)}</bdi>{" "}
                                {LEDGER_CURRENCY_LABELS[t.paidCurrency as LedgerCurrency] ?? t.paidCurrency}
                                {isFrancAccount(acc) && <span className="franc-badge"> ({francBadge({ currencyCode: t.paidCurrency, amount: t.paidAmount }, true)})</span>}
                                {t.note ? ` · ${t.note}` : ""}
                              </>
                            )}
                          </span>
                        </>
                      );
                    })()
                  ) : (
                    <>
                      <strong>⬇️ تسديد {account(row.payment.accountId)?.name ?? "جهاز"}</strong>
                      <span>{getClient(clientStore, account(row.payment.accountId)?.clientId)?.name ?? ""}</span>
                    </>
                  )}
                  <span className="sl-meta">
                    <bdi dir="ltr">{row.date}</bdi> · الرصيد بعدها <bdi dir="ltr">{usd(row.balanceAfter)}</bdi>
                  </span>
                </div>
                <div className="sl-row-side">
                  <strong dir="ltr" className={row.amountUsd >= 0 ? "sl-in" : "sl-out"}>
                    {row.amountUsd >= 0 ? "+" : "-"}
                    {formatAmount(Math.abs(row.amountUsd))} $
                  </strong>
                  {!(row.type === "topup" && row.topUp.via === "reset") && (
                    <button
                      type="button"
                      className="text-action sl-edit"
                      onClick={() => (row.type === "topup" ? openEditTopUp(row.topUp) : openEditPayment(row.payment))}
                    >
                      تعديل
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {tab === "cards" && (
      <PaymentCardsSection
        cards={paymentCards}
        groups={cardGroups}
        statementFor={(last4) => buildCardStatementFor(last4, accounts, listCardPayments(ledgerStore), deposits)}
        clientName={(clientId) => getClient(clientStore, clientId)?.name}
        fillBook={fillBook}
        onAdd={addCard}
        onRemove={removeCard}
        onSaveDetails={saveCardDetails}
        onRemoveDetails={(card) => {
          if (window.confirm(`حذف بيانات التعبئة للبطاقة ${card.name} •${card.last4}؟ تبقى البطاقة في القائمة.`)) storeFillBook(removeCardFill(fillBook, card.id));
        }}
        notifications={kastNotifications}
        onEnableNotifications={() => {
          void openKastNotificationAccess();
          // Back from Android's screen: read the switch again.
          window.setTimeout(() => void kastNotificationsEnabled().then(setKastNotifications), 4000);
        }}
      />
      )}

      {tab === "notices" && (
        <section className="section">
          <div className="sl-head">
            <h2 className="sl-title">🔔 إشعارات كاست - دخل وسحب</h2>
          </div>
          {pendingNotices === 0 && (
            <p className="empty-state">لا إشعارات KAST تنتظر. كل دفعة من البطاقة (سحب) أو شحن لها (دخل) يصل إشعارها يظهر هنا لتسجّله.</p>
          )}
        {pendingCardSpends(deposits).length > 0 && (
          <ul className="sl-list kast-deposits">
            {pendingCardSpends(deposits).map((s) => {
              const likely = spendCandidates(s.amountUsd, debts, currencyStore, { last4: s.cardLast4, of: (d) => account(d.accountId)?.paymentCardLast4 });
              const exact = likely.some((c) => c.exact);
              return (
                <li key={s.id} className="sl-row kast-deposit-row kast-spend-row">
                  <div className="sl-row-main">
                    <strong>💳 {depositLabel(s)}</strong>
                    <span>
                      من إشعار KAST{s.at ? ` · ${new Date(s.at).toLocaleDateString("en-GB")}` : ""} -{" "}
                      {exact ? "سدّد D الجهاز الذي دُفع له:" : likely.length ? "لا يوجد D بنفس المبلغ - الأقرب:" : "لا يوجد D مفتوح قريب من هذا المبلغ"}
                    </span>
                  </div>
                  <div className="kast-deposit-actions">
                    {likely.map(({ debt: d, usd: dUsd, exact: isExact }) => {
                      const cost = d.entry.starlinkCost;
                      const foreign = cost?.currencyCode && cost.currencyCode !== "USD" && cost.amount ? cost : undefined;
                      return (
                        <button
                          key={d.entry.id}
                          type="button"
                          className={isExact ? "dialog-primary" : "dialog-secondary"}
                          onClick={() => {
                            openPay([d]);
                            setSpendToRecord(s);
                          }}
                        >
                          سدّد {account(d.accountId)?.name ?? "جهاز"} (
                          {foreign ? (
                            <>
                              <bdi dir="ltr">{formatAmount(foreign.amount!)}</bdi> {foreign.currencyCode} ≈ <bdi dir="ltr">{usd(dUsd)}</bdi>
                            </>
                          ) : (
                            <bdi dir="ltr">{usd(dUsd)}</bdi>
                          )}
                          )
                        </button>
                      );
                    })}
                    <button type="button" className="dialog-secondary" onClick={() => setPickFor(s)}>
                      ✏️ جهاز آخر
                    </button>
                    <button type="button" className="text-action" onClick={() => updateDeposit(s.id, "dismissed")}>تجاهل</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {pickFor && (
          <SpendPickerSheet
            spend={pickFor}
            debts={debts}
            currencyStore={currencyStore}
            account={account}
            clientOf={(clientId) => getClient(clientStore, clientId)}
            onPick={(d) => {
              const spend = pickFor;
              setPickFor(null);
              openPay([d]);
              setSpendToRecord(spend);
            }}
            onClose={() => setPickFor(null)}
          />
        )}
        {pendingCardDeposits(deposits).length > 0 && (
          <ul className="sl-list kast-deposits">
            {pendingCardDeposits(deposits).map((d) => (
              <li key={d.id} className="sl-row kast-deposit-row">
                <div className="sl-row-main">
                  <strong>💵 {depositLabel(d)}</strong>
                  <span>من بريد KAST{d.at ? ` · ${new Date(d.at).toLocaleDateString("en-GB")}` : ""} - لم يُسجَّل بعد</span>
                </div>
                <div className="kast-deposit-actions">
                  <button type="button" className="dialog-primary" onClick={() => recordDeposit(d)}>سجّل شحناً</button>
                  <button type="button" className="text-action" onClick={() => updateDeposit(d.id, "dismissed")}>تجاهل</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        </section>
      )}

      {sheet === "pay" && (
        <PartySheet
          title="تسديد D لستارلينك"
          onClose={() => {
            setSpendToRecord(null);
            setSheet(null);
          }}
        >
          <PayForm
            items={payItems}
            accountName={(id) => account(id)?.name ?? "جهاز"}
            cardBalance={card.balanceUsd}
            spendUsd={spendToRecord?.amountUsd}
            todayUsd={(d) => debtUsdToday(d, currencyStore)}
            onPay={pay}
            onCancel={() => {
              setSpendToRecord(null);
              setSheet(null);
            }}
          />
        </PartySheet>
      )}

      {sheet === "prevpay" && prevPay && (
        <PartySheet title="تسديد دين سابق لستارلينك" onClose={() => setSheet(null)}>
          <PreviousPayForm
            debt={prevPay}
            accountName={account(prevPay.accountId)?.name ?? "جهاز"}
            defaultCurrency={chargeCurrencyFor(account(prevPay.accountId))}
            rateFor={(code) => (code === "USD" ? 1 : getCurrency(currencyStore, code)?.rateFromUsd)}
            cardBalance={card.balanceUsd}
            onPay={(input) => payPrevious(prevPay, input)}
            onCancel={() => setSheet(null)}
          />
        </PartySheet>
      )}

      {sheet === "topup" && (
        <PartySheet title="شحن بطاقة كاش" onClose={() => setSheet(null)}>
          <MovementForm
            direction="in"
            mruRate={mruRate}
            currencyStore={currencyStore}
            moneyAccounts={moneyAccounts}
            prefill={depositToRecord ? { amountUsd: depositToRecord.amountUsd, note: `KAST: ${depositLabel(depositToRecord)}` } : undefined}
            onSubmit={saveMovement}
            onCancel={() => {
              setDepositToRecord(null);
              setSheet(null);
            }}
          />
        </PartySheet>
      )}

      {sheet === "withdraw" && (
        <PartySheet title="سحب رصيد من البطاقة" onClose={() => setSheet(null)}>
          <MovementForm
            direction="out"
            mruRate={mruRate}
            currencyStore={currencyStore}
            moneyAccounts={moneyAccounts}
            onSubmit={saveMovement}
            onCancel={() => setSheet(null)}
          />
        </PartySheet>
      )}

      {sheet === "edittopup" && editTopUp && (
        <PartySheet title={editTopUp.direction === "out" ? "تعديل سحب الرصيد" : "تعديل شحن البطاقة"} onClose={() => setSheet(null)}>
          <MovementForm
            direction={editTopUp.direction === "out" ? "out" : "in"}
            initial={editTopUp}
            proofKey={editTopUp.id}
            mruRate={mruRate}
            currencyStore={currencyStore}
            moneyAccounts={moneyAccounts}
            onSubmit={(input, proof) => saveTopUpEdit(editTopUp, input, proof)}
            onDelete={() => removeTopUp(editTopUp)}
            onCancel={() => setSheet(null)}
          />
        </PartySheet>
      )}

      {sheet === "editpay" && editPayment && (
        <PartySheet title={`تعديل تسديد ${account(editPayment.accountId)?.name ?? "جهاز"}`} onClose={() => setSheet(null)}>
          <SettlementEditForm
            payment={editPayment}
            onSave={(edit) => savePaymentEdit(editPayment, edit)}
            onUndo={() => undoPayment(editPayment)}
            onCancel={() => setSheet(null)}
          />
        </PartySheet>
      )}
    </main>
  );
}

function PayForm({
  items,
  accountName,
  cardBalance,
  spendUsd,
  todayUsd,
  onPay,
  onCancel,
}: {
  items: OpenShipmentDebt[];
  accountName: (id: string) => string;
  cardBalance: number;
  /** The KAST notice this payment comes from - what really left the card. */
  spendUsd?: number;
  /** A cost in another currency at today's registered rate. */
  todayUsd: (d: OpenShipmentDebt) => number | undefined;
  onPay: (date: string, fromCard: boolean, actual?: ActualPaid) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayInput());
  const [fromCard, setFromCard] = useState(true);
  // One D: what was really paid - the dollars (and, for ARS…, the amount in that currency, which
  // locks the real rate). Several at once keep their recorded costs.
  const single = items.length === 1 ? items[0] : undefined;
  const cost = single?.entry.starlinkCost;
  const foreign = cost?.currencyCode && cost.currencyCode !== "USD" ? cost.currencyCode : undefined;
  const today = single ? todayUsd(single) : undefined;
  const [paidUsd, setPaidUsd] = useState(single ? String(spendUsd ?? round2(single.costUsd)) : "");
  const [paidAmount, setPaidAmount] = useState(foreign && cost?.amount ? String(cost.amount) : "");
  const usdValue = Number(paidUsd);
  const amountValue = Number(paidAmount);
  const changed = single !== undefined && (Math.abs(usdValue - single.costUsd) > 0.004 || (foreign !== undefined && amountValue !== cost?.amount));
  const valid = !single || (usdValue > 0 && (!foreign || amountValue > 0));
  const total = single && usdValue > 0 ? usdValue : totalOpenDebtUsd(items);
  return (
    <div className="party-balance-form">
      <ul className="sl-pay-list">
        {items.map((d) => (
          <li key={d.entry.id}>
            <span>{accountName(d.accountId)}</span>
            <bdi dir="ltr">{usd(d.costUsd)}</bdi>
          </li>
        ))}
        {!single && (
          <li className="sl-pay-total">
            <strong>المجموع</strong>
            <strong dir="ltr">{usd(total)}</strong>
          </li>
        )}
      </ul>
      {single && (
        <>
          {foreign && (
            <label className="rep-form-field">
              <span>المبلغ الذي دفعته لستارلينك ({foreign})</span>
              <input className="search-input" type="text" lang="en" dir="ltr" inputMode="decimal" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
            </label>
          )}
          <label className="rep-form-field">
            <span>{spendUsd !== undefined ? "ما خرج من البطاقة فعلاً (دولار - من إشعار KAST)" : "ما خرج فعلاً (دولار)"}</span>
            <input className="search-input" type="text" lang="en" dir="ltr" inputMode="decimal" value={paidUsd} onChange={(e) => setPaidUsd(e.target.value)} />
          </label>
          {foreign && usdValue > 0 && amountValue > 0 && (
            <p className="settings-hint">
              السعر الحقيقي: <bdi dir="ltr">1$ = {formatAmount(Math.round((amountValue / usdValue) * 100) / 100)} {foreign}</bdi>
              {today !== undefined && (
                <>
                  {" "}
                  · بسعر اليوم المسجّل <bdi dir="ltr">{usd(today)}</bdi>
                </>
              )}{" "}
              · عند التسجيل <bdi dir="ltr">{usd(single.costUsd)}</bdi>
              {" "}· يصبح سعر {foreign} الحالي
            </p>
          )}
          {changed && <p className="settings-hint">تُسجَّل التكلفة بما دُفع فعلاً، ويُحسب الربح عليه.</p>}
        </>
      )}
      <label className="rep-form-field">
        <span>تاريخ الدفع (يوم نزول الربح)</span>
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={fromCard} onChange={(e) => setFromCard(e.target.checked)} />
        <span>💳 من بطاقة كاش (الرصيد بعدها {usd(cardBalance - (fromCard ? total : 0))})</span>
      </label>
      {fromCard && cardBalance < total && <p className="account-card-alert">رصيد البطاقة لا يكفي - سجّل شحن البطاقة أولًا، أو تابع ويصبح رصيدها سالبًا.</p>}
      <p className="settings-hint">تزول D عن {items.length === 1 ? "الجهاز" : "هذه الأجهزة"}، وينزل الربح وحصة المندوب بتاريخ الدفع.</p>
      <div className="settings-actions">
        <button
          type="button"
          className="dialog-primary"
          disabled={!date || !valid}
          onClick={() => onPay(date, fromCard, changed ? { usd: usdValue, ...(foreign ? { amount: amountValue } : {}) } : undefined)}
        >
          تأكيد التسديد
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </div>
  );
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface PreviousPayInput {
  date: string;
  paidUsd: number;
  chargeAmount: number;
  chargeCurrency: LedgerCurrency;
  fromCard: boolean;
}

/** The device's renewal currency when it has a monthly plan in one of the ledger currencies, else أوقية. */
function chargeCurrencyFor(acc: StarlinkAccountSummary | undefined): LedgerCurrency {
  const code = acc?.renewalPlan?.saleCurrency;
  return (LEDGER_CURRENCIES as readonly string[]).includes(code ?? "") ? (code as LedgerCurrency) : "MRU";
}

/** Paying an earlier owner's debt: what went to Starlink, and what goes onto the customer. */
function PreviousPayForm({
  debt,
  accountName,
  defaultCurrency,
  rateFor,
  cardBalance,
  onPay,
  onCancel,
}: {
  debt: PreviousDebt;
  accountName: string;
  defaultCurrency: LedgerCurrency;
  rateFor: (code: LedgerCurrency) => number | undefined;
  cardBalance: number;
  onPay: (input: PreviousPayInput) => string | null;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayInput());
  const [paidUsd, setPaidUsd] = useState(String(debt.amountUsd));
  const [currency, setCurrency] = useState<LedgerCurrency>(defaultCurrency);
  const [charge, setCharge] = useState("");
  const [chargeTouched, setChargeTouched] = useState(false);
  const [fromCard, setFromCard] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Suggests the same amount in the customer's currency (today's rate) until typed by hand.
  const rate = rateFor(currency);
  const suggested = Number(paidUsd) > 0 && rate ? Math.round(Number(paidUsd) * rate * 100) / 100 : undefined;
  const shownCharge = chargeTouched ? charge : suggested !== undefined ? String(suggested) : "";
  const paid = Number(paidUsd) || 0;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(onPay({ date, paidUsd: paid, chargeAmount: Number(shownCharge), chargeCurrency: currency, fromCard }));
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <p className="settings-hint">
        {accountName} · دين سابق منذ <bdi dir="ltr">{debt.date}</bdi>
        {debt.note ? ` · ${debt.note}` : ""}
      </p>
      <label className="rep-form-field">
        <span>ما دفعته لستارلينك (دولار)</span>
        <input className="search-input" type="text" inputMode="decimal" min="0" step="0.01" dir="ltr" value={paidUsd} onChange={(e) => setPaidUsd(e.target.value)} />
      </label>
      <div className="sl-form-row">
        <label className="rep-form-field">
          <span>يُسجَّل على الزبون</span>
          <input
            className="search-input"
            type="text"
            inputMode="decimal"
            min="0"
            step="0.01"
            dir="ltr"
            value={shownCharge}
            onChange={(e) => {
              setChargeTouched(true);
              setCharge(e.target.value);
            }}
          />
        </label>
        <label className="rep-form-field">
          <span>العملة</span>
          <select className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value as LedgerCurrency)}>
            {LEDGER_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {LEDGER_CURRENCY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="rep-form-field">
        <span>تاريخ الدفع</span>
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={fromCard} onChange={(e) => setFromCard(e.target.checked)} />
        <span>💳 من بطاقة كاش (الرصيد بعدها {usd(cardBalance - (fromCard ? paid : 0))})</span>
      </label>
      <p className="settings-hint">يُسجَّل المبلغ دينًا على الزبون في كشف الجهاز، والفرق بينه وبين ما دفعته (إن وجد) ربح لك بتاريخ الدفع.</p>
      {error && <p className="account-card-alert">{error}</p>}
      <div className="settings-actions">
        <button type="submit" className="dialog-primary" disabled={!date}>
          تأكيد التسديد
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
    </form>
  );
}

/**
 * 💳 One card movement: a charge (`direction="in"`, money INTO the card) or a withdrawal
 * (`direction="out"`, money OUT of it). The counterpart moves through الكاش, a bank/wallet app of
 * «حسابي» (its balance follows) or - only for a withdrawal - «خسارة» (gone, no counterpart, counts
 * as a مصروف in the reports). A payment-proof photo may be attached (kept by the movement id).
 */
function MovementForm({
  direction,
  initial,
  proofKey,
  mruRate,
  currencyStore,
  moneyAccounts,
  prefill,
  onSubmit,
  onDelete,
  onCancel,
}: {
  direction: "in" | "out";
  /** Set when editing a past movement. */
  initial?: CardTopUp;
  /** The movement id whose saved proof photo to load (editing). */
  proofKey?: string;
  /** 💳 Dollars received on KAST (its mail): the amount and a note filled in (a charge). */
  prefill?: { amountUsd: number; note: string };
  mruRate: number | undefined;
  currencyStore: CurrencyStore;
  moneyAccounts: MoneyAccount[];
  onSubmit: (input: CardTopUpInput, proofDataUrl?: string) => string | null;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const isOut = direction === "out";
  const [amountUsd, setAmountUsd] = useState(initial ? String(initial.amountUsd) : prefill ? String(prefill.amountUsd) : "");
  // Where the counterpart money moves: "cash" (الكاش), a bank/wallet id, or "loss" (withdrawal only).
  const initialVia = initial ? (initial.via === "account" ? (initial.accountId ?? "cash") : initial.via === "loss" ? "loss" : "cash") : "cash";
  const [via, setVia] = useState<string>(initialVia);
  const isLoss = via === "loss";
  const viaAccount = moneyAccounts.find((a) => a.id === via);
  const [paidCurrency, setPaidCurrency] = useState<string>(initial?.paidCurrency ?? "MRU");
  // 🟠 أورانج / نيتا count in فرانك: typed ×5, kept in سيفا (payCurrency.ts).
  const [paidAmount, setPaidAmount] = useState(() => {
    if (!initial) return "";
    const initialAccount = initial.via === "account" ? moneyAccounts.find((a) => a.id === initial.accountId) : undefined;
    return String(isFrancAccount(initialAccount) ? sifaToFranc(initial.paidAmount) : initial.paidAmount);
  });
  // An edit starts from what really moved, never a re-suggestion from today's rate.
  const [paidTouched, setPaidTouched] = useState(Boolean(initial));
  const [date, setDate] = useState(initial?.date ?? todayInput());
  const [note, setNote] = useState(initial?.note ?? prefill?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  // 📷 إثبات دفع (اختياري) - يُحفظ بمفتاح معرّف العملية (لا مع «خسارة»).
  const [proofDraft, setProofDraft] = useState<string | null>(null);
  const [savedProof, setSavedProof] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    if (proofKey) void getProof(proofKey).then((d) => !cancelled && setSavedProof(d));
    return () => {
      cancelled = true;
    };
  }, [proofKey]);

  async function pickProof(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setProofDraft(await resizeImageToDataUrl(file, 1280, 0.72));
    } catch {
      setError("تعذرت قراءة الصورة - جرّب صورة أخرى");
    }
  }

  // Suggests the counterpart from today's rate until the operator types the real figure.
  // An app only holds its own currency: the amount that moved through it is in that currency.
  const currency = viaAccount ? viaAccount.currencyCode : paidCurrency;
  const rate = currency === "USD" ? 1 : currency === "MRU" ? mruRate : getCurrency(currencyStore, currency)?.rateFromUsd;
  const franc = isFrancAccount(viaAccount);
  const suggested = Number(amountUsd) > 0 && rate ? Math.round(Number(amountUsd) * rate * (franc ? sifaToFranc(1) : 1) * 100) / 100 : undefined;
  const shownPaid = paidTouched ? paidAmount : suggested !== undefined ? String(suggested) : "";
  const counterpartLabel = isLoss
    ? ""
    : via === "cash"
      ? isOut
        ? "دخل الكاش"
        : "خرج من الكاش"
      : `${isOut ? "دخل" : "خرج من"} ${viaAccount?.icon ? `${viaAccount.icon} ` : ""}${viaAccount?.name ?? "التطبيق"}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    const resolvedVia: CardMoveVia = via === "cash" ? "cash" : via === "loss" ? "loss" : "account";
    setError(
      onSubmit(
        {
          amountUsd: Number(amountUsd),
          paidAmount: isLoss ? 0 : franc ? francToSifa(Number(shownPaid)) : Number(shownPaid),
          paidCurrency: currency,
          date,
          note,
          ...(isOut ? { direction: "out" as const } : {}),
          via: resolvedVia,
          ...(resolvedVia === "account" ? { accountId: via } : {}),
        },
        !isLoss && proofDraft ? proofDraft : undefined,
      ),
    );
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      <label className="rep-form-field">
        <span>{isOut ? "المبلغ المسحوب من البطاقة (دولار)" : "المبلغ الذي دخل البطاقة (دولار)"}</span>
        <input
          className="search-input"
          type="text"
          lang="en"
          min="0"
          step="0.01"
          dir="ltr"
          inputMode="decimal"
          placeholder="0"
          value={amountUsd}
          onChange={(e) => setAmountUsd(e.target.value)}
          autoFocus={!initial}
        />
      </label>
      <label className="form-field party-source-field">
        <span>{isOut ? "إلى أين ذهب المال؟" : "من أين جاء المال؟"}</span>
        <select className="search-input" value={via} onChange={(e) => setVia(e.target.value)}>
          <option value="cash">{isOut ? "إلى الكاش" : "من الكاش"}</option>
          {moneyAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.icon ? `${a.icon} ` : ""}
              {a.name}
            </option>
          ))}
          {isOut && <option value="loss">خسارة (مال ضائع)</option>}
        </select>
      </label>
      {isLoss ? (
        <p className="settings-hint">💸 المبلغ المسحوب يُحسب خسارة (مصروف) في التقارير - لا يدخل أي مكان.</p>
      ) : (
        <label className="rep-form-field">
          <span>{counterpartLabel}</span>
          <div className="party-balance-row">
            <input
              className="search-input"
              type="text"
              lang="en"
              min="0"
              step="0.01"
              dir="ltr"
              inputMode="decimal"
              placeholder="0"
              value={shownPaid}
              onChange={(e) => {
                setPaidTouched(true);
                setPaidAmount(e.target.value);
              }}
            />
            {franc ? (
              <FrancUnit />
            ) : viaAccount ? (
              <span className="search-input sl-fixed-currency">{LEDGER_CURRENCY_LABELS[currency as LedgerCurrency] ?? currency}</span>
            ) : (
              <select className="search-input" value={paidCurrency} onChange={(e) => setPaidCurrency(e.target.value)}>
                {LEDGER_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {LEDGER_CURRENCY_LABELS[c]}
                  </option>
                ))}
              </select>
            )}
          </div>
          {franc && <FrancHint amount={shownPaid} where={viaAccount?.name} />}
        </label>
      )}
      <label className="rep-form-field">
        <span>التاريخ</span>
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <input className="search-input" placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      {!isLoss && (
        <div className="ledger-proof-field">
          {proofDraft || savedProof ? (
            <>
              <img src={proofDraft ?? savedProof} alt="صورة إثبات الدفع" className="ledger-proof-thumb" />
              <span>📷 {proofDraft ? "صورة جديدة - تُحفظ مع العملية" : "إثبات محفوظ"}</span>
              <label className="text-action">
                تغيير
                <input type="file" accept="image/*" hidden onChange={pickProof} />
              </label>
            </>
          ) : (
            <label className="ledger-proof-pick">
              📷 إرفاق صورة إثبات الدفع (اختياري)
              <input type="file" accept="image/*" hidden onChange={pickProof} />
            </label>
          )}
        </div>
      )}
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!amountUsd}>
          {initial ? "حفظ التعديل" : isOut ? "حفظ السحب" : "حفظ الشحن"}
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
      {onDelete && (
        <button type="button" className="dialog-danger" onClick={onDelete}>
          {isOut ? "حذف عملية السحب" : "حذف عملية الشحن"}
        </button>
      )}
    </form>
  );
}

/** Edits a past payment to Starlink from the card list: its day, whether it came from the card,
 * and what was really paid (for ARS…: the amount and the dollars, the real rate) - or undoes it. */
function SettlementEditForm({
  payment,
  onSave,
  onUndo,
  onCancel,
}: {
  payment: CardPayment;
  onSave: (edit: SettlementEdit) => string | null;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const cost = payment.entry.starlinkCost;
  const foreign = cost?.currencyCode && cost.currencyCode !== "USD" ? cost.currencyCode : undefined;
  const [date, setDate] = useState(payment.date);
  const [amount, setAmount] = useState(String(Math.round(payment.amountUsd * 100) / 100));
  const [foreignAmount, setForeignAmount] = useState(foreign && cost?.amount ? String(cost.amount) : "");
  const [fromCard, setFromCard] = useState(cost?.paidVia === "card");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const usdChanged = Math.abs(Number(amount) - payment.amountUsd) > 0.004;
    const foreignChanged = foreign !== undefined && Number(foreignAmount) !== cost?.amount;
    setError(
      onSave({
        date,
        fromCard,
        ...(usdChanged || foreignChanged ? { amountUsd: Number(amount), ...(foreign ? { amount: Number(foreignAmount) } : {}) } : {}),
      }),
    );
  }

  return (
    <form className="party-balance-form" onSubmit={submit}>
      {foreign && (
        <label className="rep-form-field">
          <span>المبلغ المدفوع لستارلينك ({foreign})</span>
          <input className="search-input" type="text" lang="en" dir="ltr" inputMode="decimal" value={foreignAmount} onChange={(e) => setForeignAmount(e.target.value)} />
        </label>
      )}
      <label className="rep-form-field">
        <span>{foreign ? "ما خرج من البطاقة (دولار)" : "المبلغ المدفوع لستارلينك (دولار)"}</span>
        <input
          className="search-input"
          type="text"
          lang="en"
          min="0"
          step="0.01"
          dir="ltr"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>
      {foreign && Number(amount) > 0 && Number(foreignAmount) > 0 && (
        <p className="settings-hint">
          السعر الحقيقي: <bdi dir="ltr">1$ = {formatAmount(Math.round((Number(foreignAmount) / Number(amount)) * 100) / 100)} {foreign}</bdi>
          {" "}· يصبح سعر {foreign} الحالي
        </p>
      )}
      <label className="rep-form-field">
        <span>تاريخ الدفع (يوم نزول الربح)</span>
        <DateInput className="search-input" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="ledger-d-toggle party-cash-toggle">
        <input type="checkbox" checked={fromCard} onChange={(e) => setFromCard(e.target.checked)} />
        <span>💳 دُفع من بطاقة كاش</span>
      </label>
      {!fromCard && <p className="settings-hint">بدون البطاقة يرجع المبلغ إلى رصيدها ويختفي التسديد من هذه القائمة.</p>}
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <div className="settings-actions">
        <button className="dialog-primary" type="submit" disabled={!date}>
          حفظ التعديل
        </button>
        <button type="button" className="text-action" onClick={onCancel}>
          إلغاء
        </button>
      </div>
      <button type="button" className="dialog-danger" onClick={onUndo}>
        {payment.entry.previousDebtId ? "حذف هذا التسديد (يرجع الدين السابق)" : "إلغاء التسديد (يرجع إلى D)"}
      </button>
    </form>
  );
}

/** 💳 «بطاقاتي»: the KAST cards (last 4 digits + a name). Each device picks the one that pays its
 * Starlink (its edit dialog) - so a refused payment's Telegram alert names the likely device. */
function PaymentCardsSection({
  cards,
  groups,
  statementFor,
  clientName,
  fillBook,
  onAdd,
  onRemove,
  onSaveDetails,
  onRemoveDetails,
  notifications,
  onEnableNotifications,
}: {
  cards: PaymentCardList;
  /** Each card's devices, devices on an unregistered card, devices whose card isn't known. */
  groups: CardDeviceGroups;
  statementFor: (last4: string) => CardStatement;
  clientName: (clientId: string | undefined) => string | undefined;
  fillBook: CardFillBook;
  onAdd: (last4: string, name: string) => string | null;
  onRemove: (id: string) => void;
  onSaveDetails: (card: PaymentCardList[number], input: CardFillInput) => string | null;
  onRemoveDetails: (card: PaymentCardList[number]) => void;
  /** «Notification access» on (KAST payments read), off, or null off the phone. */
  notifications: boolean | null;
  onEnableNotifications: () => void;
}) {
  const [last4, setLast4] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<PaymentCardList[number] | null>(null);
  const [statementOf, setStatementOf] = useState<PaymentCardList[number] | null>(null);
  const [showUnregistered, setShowUnregistered] = useState(false);
  // 📡 The card whose devices are open (email + the day each one renews = when the card is charged).
  const [openCard, setOpenCard] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = onAdd(last4, name);
    setError(problem);
    if (!problem) {
      setLast4("");
      setName("");
    }
  }

  return (
    <section className="section">
      <div className="sl-head">
        <h2 className="sl-title">💳 بطاقاتي (KAST)</h2>
      </div>
      <p className="settings-hint">
        عند رفض دفع Starlink يصلك تنبيه في تيليغرام مع الجهاز الأرجح (من المبلغ، وأجهزة البطاقة أولاً). اختر بطاقة كل جهاز من نافذة تعديله.
      </p>
      {notifications !== null && (
        <div className={`kast-notify-status${notifications ? " is-on" : ""}`}>
          {notifications ? (
            <span>🔔 قراءة إشعارات KAST مفعّلة ✓ - الدفعات الناجحة تظهر أعلاه لتسدّد D جهازها</span>
          ) : (
            <>
              <span>🔔 الدفعات الناجحة تظهر فقط في إشعارات تطبيق KAST - فعّل «الوصول إلى الإشعارات» لـ STAR NET</span>
              <button type="button" className="dialog-primary" onClick={onEnableNotifications}>
                تفعيل
              </button>
            </>
          )}
        </div>
      )}
      {cards.length > 0 && (
        <ul className="sl-list">
          {cards.map((card) => (
            <Fragment key={card.id}>
            <li className="sl-row">
              <div className="sl-row-main">
                <strong>{card.name}</strong>
                <span>
                  تنتهي بـ <bdi dir="ltr">{card.last4}</bdi>
                  {fillBook[card.id] ? (
                    <>
                      {" "}
                      · 💳 جاهزة للتعبئة <bdi dir="ltr">{fillBook[card.id]!.expiry}</bdi>
                    </>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="text-action sl-card-devices-toggle"
                  aria-expanded={openCard === card.id}
                  onClick={() => setOpenCard(openCard === card.id ? null : card.id)}
                >
                  📡 {groups.byCard[card.last4]?.length ?? 0} جهاز مربوط بها {openCard === card.id ? "▴" : "▾"}
                </button>
              </div>
              <button type="button" className="text-action" onClick={() => setStatementOf(card)}>
                📄 الكشف
              </button>
              <button type="button" className="text-action" onClick={() => setDetailsFor(card)}>
                {fillBook[card.id] ? "✎ البيانات" : "💳 أكمل البيانات"}
              </button>
              <button type="button" className="text-action" onClick={() => onRemove(card.id)}>
                حذف
              </button>
            </li>
            {openCard === card.id && (
              <li className="sl-card-devices">
                {(groups.byCard[card.last4] ?? []).length === 0 ? (
                  <p className="party-empty">لا يوجد جهاز مربوط بهذه البطاقة بعد.</p>
                ) : (
                  <ul>
                    {cardDeviceRows(groups.byCard[card.last4] ?? []).map((d) => (
                      <li key={d.id}>
                        <span className="sl-card-device-day">{d.day ? `يوم ${d.day}` : "اليوم ؟"}</span>
                        <span className="sl-card-device-main">
                          <strong>{d.name}</strong>
                          <small dir="ltr">{d.email ?? "لا بريد بعد"}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )}
            </Fragment>
          ))}
        </ul>
      )}
      {cards.length > 0 && groups.unregistered.length > 0 && (
        <button type="button" className="account-card-alert kast-unregistered" onClick={() => setShowUnregistered(true)}>
          ⚠️ {groups.unregistered.length} {groups.unregistered.length === 1 ? "جهاز يُدفع ببطاقة غير مسجّلة" : "أجهزة تُدفع ببطاقات غير مسجّلة"} عندك - اضغط لتراها
        </button>
      )}
      {cards.length > 0 && groups.unknown > 0 && (
        <p className="settings-hint">{groups.unknown} جهاز لم تُعرف بطاقته بعد - تُقرأ من صفحة الفوترة عند المزامنة.</p>
      )}
      <form className="kast-card-form" onSubmit={submit}>
        <input dir="ltr" inputMode="numeric" maxLength={4} placeholder="آخر 4 أرقام" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
        <input placeholder="اسم البطاقة (اختياري)" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="dialog-primary">+ إضافة</button>
      </form>
      {error && <div className="account-card-alert">{error}</div>}
      {cards.length > 0 && (
        <p className="settings-hint">
          💳 أكمل بيانات البطاقة (الرقم، الاسم، التاريخ، الرمز، العنوان، رقم الهوية/الجواز) مرة واحدة: في متصفح أي جهاز، عند الضغط على خانة البطاقة في صفحة الدفع - أو زر 💳 في الأعلى - تختار البطاقة فتُملأ الخانات وحدها. تبقى في هاتفك ونسختك الاحتياطية فقط.
        </p>
      )}
      {showUnregistered && (
        <PartySheet title="⚠️ أجهزة ببطاقة غير مسجّلة" onClose={() => setShowUnregistered(false)}>
          <p className="settings-hint">بطاقة الدفع في ستارلينك لهذه الأجهزة ليست من بطاقاتك المسجّلة. سجّل البطاقة إن كانت لك، أو غيّرها في ستارلينك.</p>
          <ul className="kast-card-devices">
            {groups.unregistered.map((a) => (
              <li key={a.id}>
                <span>
                  {a.name}
                  {clientName(a.clientId) ? <small> · {clientName(a.clientId)}</small> : null}
                </span>
                <bdi dir="ltr">•{a.paymentCardLast4}</bdi>
              </li>
            ))}
          </ul>
        </PartySheet>
      )}
      {statementOf && (
        <CardStatementSheet
          card={statementOf}
          devices={groups.byCard[statementOf.last4] ?? []}
          statement={statementFor(statementOf.last4)}
          clientName={clientName}
          onClose={() => setStatementOf(null)}
        />
      )}
      {detailsFor && (
        <PartySheet title={`💳 ${detailsFor.name} •${detailsFor.last4}`} onClose={() => setDetailsFor(null)}>
          <CardDetailsForm
            existing={fillBook[detailsFor.id]}
            onSave={(input) => {
              const problem = onSaveDetails(detailsFor, input);
              if (!problem) setDetailsFor(null);
              return problem;
            }}
            onRemove={
              fillBook[detailsFor.id]
                ? () => {
                    onRemoveDetails(detailsFor);
                    setDetailsFor(null);
                  }
                : undefined
            }
          />
        </PartySheet>
      )}
    </section>
  );
}

/** ✏️ The KAST payment's device, chosen by hand: every open D, the paying card's first then the
 * nearest amount, with a search by device name, customer, phone or KIT. */
function SpendPickerSheet({
  spend,
  debts,
  currencyStore,
  account,
  clientOf,
  onPick,
  onClose,
}: {
  spend: CardDeposit;
  debts: OpenShipmentDebt[];
  currencyStore: CurrencyStore;
  account: (id: string) => StarlinkAccountSummary | undefined;
  clientOf: (clientId: string | undefined) => { name: string; phone?: string } | undefined;
  onPick: (debt: OpenShipmentDebt) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const ranked = useMemo(
    () => rankAllSpend(spend.amountUsd, debts, currencyStore, { last4: spend.cardLast4, of: (d) => account(d.accountId)?.paymentCardLast4 }),
    [spend, debts, currencyStore, account],
  );
  const shown = ranked.filter(({ debt }) => {
    if (!search.trim()) return true;
    const acc = account(debt.accountId);
    if (!acc) return false;
    const client = clientOf(acc.clientId);
    return deviceMatchesQuery(search, acc, { name: client?.name ?? "", phone: client?.phone ?? acc.phone });
  });
  return (
    <PartySheet title={`✏️ لأي جهاز دفعة ${formatAmount(spend.amountUsd)}$؟`} onClose={onClose}>
      <div className="spend-picker">
        <input
          id="spend-picker-search"
          className="search-input"
          type="search"
          placeholder="ابحث: اسم الجهاز، الزبون، الهاتف أو KIT"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="settings-hint">الأجهزة التي عليها D، الأقرب مبلغًا أولًا{spend.cardLast4 ? ` (أجهزة البطاقة ${spend.cardLast4} في الأعلى)` : ""}.</p>
        {shown.length === 0 ? (
          <p className="settings-hint">لا يوجد جهاز عليه D بهذا البحث.</p>
        ) : (
          <ul className="kast-card-devices">
            {shown.map(({ debt, usd: dUsd, exact, sameCard }) => {
              const acc = account(debt.accountId);
              const client = clientOf(acc?.clientId);
              return (
                <li key={debt.entry.id}>
                  <button type="button" className="spend-picker-row" onClick={() => onPick(debt)}>
                    <span>
                      {exact ? "✓ " : ""}
                      {acc?.name ?? "جهاز"}
                      {client?.name ? <small> · {client.name}</small> : null}
                      {sameCard ? <small> · 💳 {spend.cardLast4}</small> : null}
                    </span>
                    <bdi dir="ltr">{formatAmount(dUsd)} $</bdi>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PartySheet>
  );
}

/** 📄 One card: its devices, then what was paid with it (D's of its devices, by month) and its KAST
 * notices still waiting to be matched. */
function CardStatementSheet({
  card,
  devices,
  statement,
  clientName,
  onClose,
}: {
  card: PaymentCardList[number];
  devices: StarlinkAccountSummary[];
  statement: CardStatement;
  clientName: (clientId: string | undefined) => string | undefined;
  onClose: () => void;
}) {
  const months = Object.entries(statement.months).sort(([a], [b]) => b.localeCompare(a));
  return (
    <PartySheet title={`📄 كشف ${card.name} •${card.last4}`} onClose={onClose}>
      <div className="kast-card-statement">
        <section>
          <strong>📡 الأجهزة المربوطة بها ({devices.length})</strong>
          {devices.length === 0 ? (
            <p className="settings-hint">لا يوجد جهاز بهذه البطاقة بعد - تُقرأ بطاقة كل جهاز من صفحة الفوترة عند المزامنة.</p>
          ) : (
            <ul className="kast-card-devices">
              {devices.map((a) => (
                <li key={a.id}>
                  <span>
                    {a.name}
                    {clientName(a.clientId) ? <small> · {clientName(a.clientId)}</small> : null}
                  </span>
                  {a.balanceDue ? <bdi dir="ltr">{a.balanceDue} {a.currency ?? ""}</bdi> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <strong>
            💵 المدفوع بها: <bdi dir="ltr">{formatAmount(statement.totalPaidUsd)} $</bdi>
          </strong>
          {months.length > 0 && (
            <div className="kast-card-months">
              {months.map(([month, total]) => (
                <span key={month}>
                  <bdi dir="ltr">{month}</bdi>: <bdi dir="ltr">{formatAmount(total)} $</bdi>
                </span>
              ))}
            </div>
          )}
          {statement.rows.length === 0 ? (
            <p className="settings-hint">لا توجد دفعات بعد.</p>
          ) : (
            <ul className="kast-card-devices">
              {statement.rows.map((r, i) => (
                <li key={`${r.kind}-${r.date}-${i}`} className={r.kind === "notice" ? "kast-card-notice" : undefined}>
                  <span>
                    {r.kind === "paid" ? `⬇️ D ${r.label}` : `📩 إشعار لم يُربط بجهاز (${r.label})`}
                    <small>
                      {" "}
                      · <bdi dir="ltr">{r.date}</bdi>
                    </small>
                  </span>
                  <bdi dir="ltr">{formatAmount(r.amountUsd)} $</bdi>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PartySheet>
  );
}

/** The card's full details for the device browsers' card form (lib/cardFill.ts). */
function CardDetailsForm({ existing, onSave, onRemove }: { existing?: CardFillData; onSave: (input: CardFillInput) => string | null; onRemove?: () => void }) {
  const [number, setNumber] = useState(existing?.number.replace(/(\d{4})(?=\d)/g, "$1 ") ?? "");
  const [holderName, setHolderName] = useState(existing?.holderName ?? "");
  const [expiry, setExpiry] = useState(existing?.expiry ?? "");
  const [cvc, setCvc] = useState(existing?.cvc ?? "");
  const [postalCode, setPostalCode] = useState(existing?.postalCode ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [taxId, setTaxId] = useState(existing?.taxId ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="party-balance-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(onSave({ number, holderName, expiry, cvc, postalCode, address, taxId }));
      }}
    >
      {existing && <small className="settings-hint">محفوظة: <bdi dir="ltr">{maskedNumber(existing.number)}</bdi></small>}
      <label className="tool-field">
        <span>رقم البطاقة</span>
        <input className="search-input" dir="ltr" inputMode="numeric" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="0000 0000 0000 0000" />
      </label>
      <label className="tool-field">
        <span>الاسم كما يظهر على البطاقة</span>
        <input className="search-input" dir="ltr" autoComplete="off" value={holderName} onChange={(e) => setHolderName(e.target.value.toUpperCase())} />
      </label>
      <div className="expenses-amount-row">
        <label className="tool-field">
          <span>شهر/سنة</span>
          <input className="search-input" dir="ltr" inputMode="numeric" autoComplete="off" value={expiry} onChange={(e) => setExpiry(e.target.value)} placeholder="03/30" />
        </label>
        <label className="tool-field">
          <span>رمز التحقق</span>
          <input className="search-input" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={4} value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))} placeholder="123" />
        </label>
      </div>
      <label className="tool-field">
        <span>الرمز البريدي (اختياري)</span>
        <input className="search-input" dir="ltr" autoComplete="off" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
      </label>
      <label className="tool-field">
        <span>العنوان (اختياري)</span>
        <input className="search-input" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label className="tool-field">
        <span>رقم الهوية/الجواز (اختياري - DNI/RTN/Passport)</span>
        <input className="search-input" dir="ltr" autoComplete="off" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="DNI / RTN / Passport" />
      </label>
      {error && <div className="account-card-alert ledger-form-error">{error}</div>}
      <button className="dialog-primary" type="submit">
        حفظ البيانات
      </button>
      {onRemove && (
        <button type="button" className="dialog-danger" onClick={onRemove}>
          حذف بيانات التعبئة
        </button>
      )}
    </form>
  );
}
