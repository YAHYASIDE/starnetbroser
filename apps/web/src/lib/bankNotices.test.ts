import { describe, expect, it } from "vitest";
import {
  accountForApp,
  decideSuggestion,
  EMPTY_BANK_INBOX,
  ingestBankNotices,
  localNumber,
  parseBankNotice,
  parseNoticeAmount,
  pendingSuggestions,
  reopenSuggestion,
  suggestionNote,
  type RawBankNotice,
} from "./bankNotices";
import { addMoneyAccount, DEFAULT_ACCOUNTS, EMPTY_ACCOUNTS_BOOK, type AccountsBook } from "./moneyAccounts";

// Shaped like the operator's real notifications (business.md) - fake names and numbers only.
const OWN = ["22227268", "74646158"];
const MIN = 60 * 1000;

function raw(id: string, app: string, title: string, text: string, at = 1_000_000): RawBankNotice {
  return { id, app, title, text, at };
}

const GIMTEL_IN = raw(
  "b1",
  "bankily",
  "Gimtel envoie de l'argent",
  "Vous avez reçu 50.0 MRU du bénéficiaire : +22222227268 (SEDAD). ID de transaction : 1111222233334444",
  1_000_000,
);
const GIMTEL_OUT = raw("s1", "sedad", "ENVOI", "أرسلتم مبلغ 50.0 أوقية جديدة لصالح 22227268 (BANKILY)", 1_000_000 - 20 * 1000);

describe("parseNoticeAmount / localNumber", () => {
  it("reads the amounts as written", () => {
    expect(parseNoticeAmount("50.0")).toBe(50);
    expect(parseNoticeAmount("4600")).toBe(4600);
    expect(parseNoticeAmount("10000.0")).toBe(10000);
    expect(parseNoticeAmount("1 000")).toBe(1000);
    expect(parseNoticeAmount("1,000.50")).toBe(1000.5);
    expect(parseNoticeAmount("0")).toBeUndefined();
  });

  it("keeps the 8 local digits", () => {
    expect(localNumber("+22222227268")).toBe("22227268");
    expect(localNumber("22227268")).toBe("22227268");
  });
});

describe("parseBankNotice", () => {
  it("GIMTEL into Bankily from my own Sedad is a transfer", () => {
    expect(parseBankNotice(GIMTEL_IN, OWN)).toEqual({ kind: "transfer", amount: 50, currencyCode: "MRU", fromApp: "sedad", toApp: "bankily", txId: "1111222233334444" });
  });

  it("GIMTEL from my Sedad to my Bankily, seen from Sedad, is the same transfer", () => {
    expect(parseBankNotice(GIMTEL_OUT, OWN)).toEqual({ kind: "transfer", amount: 50, currencyCode: "MRU", fromApp: "sedad", toApp: "bankily" });
  });

  it("GIMTEL from someone else's number is money in", () => {
    const other = { ...GIMTEL_IN, text: GIMTEL_IN.text.replace("+22222227268", "+22240000000") };
    expect(parseBankNotice(other, OWN)).toMatchObject({ kind: "in", amount: 50, party: { number: "40000000" } });
  });

  it("Bankily «Transfert d'argent»: Beneficiaire is out, Expediteur is in", () => {
    expect(parseBankNotice(raw("x", "bankily", "Transfert d'argent", "Montant : 4600 MRU\nBeneficiaire : DEMO NAME ONE,40000001…"), OWN)).toEqual({
      kind: "out",
      amount: 4600,
      currencyCode: "MRU",
      party: { name: "DEMO NAME ONE", number: "40000001" },
    });
    expect(parseBankNotice(raw("y", "bankily", "Transfert d'argent", "Montant : 250 MRU\nExpediteur : DEMO NAME TWO,20000002"), OWN)).toEqual({
      kind: "in",
      amount: 250,
      currencyCode: "MRU",
      party: { name: "DEMO NAME TWO", number: "20000002" },
    });
  });

  it("a cut name without its number still reads", () => {
    expect(parseBankNotice(raw("x", "bankily", "Transfert d'argent", "Montant : 10 MRU\nBeneficiaire : DEMO NAME TH…"), OWN)).toMatchObject({
      kind: "out",
      amount: 10,
      party: { name: "DEMO NAME TH" },
    });
  });

  it("Sedad ENVOI to a person is money out with the name and number", () => {
    expect(parseBankNotice(raw("x", "sedad", "ENVOI", "أرسلتم مبلغ 200.0 أوقية جديدة لصالح ديمو ( 40000003 )"), OWN)).toEqual({
      kind: "out",
      amount: 200,
      currencyCode: "MRU",
      party: { name: "ديمو", number: "40000003" },
    });
  });

  it("Sedad PAIEMENT_CREDIT is phone credit bought", () => {
    expect(parseBankNotice(raw("x", "sedad", "PAIEMENT_CREDIT", "تلقيتم رصيدا بمبلغ 10 أوقية جديدة من شنقيتل"), OWN)).toEqual({
      kind: "airtime",
      amount: 10,
      currencyCode: "MRU",
      party: { name: "شنقيتل" },
    });
  });

  it("Nita «Compte à Compte» is money in, in SIFA", () => {
    expect(parseBankNotice(raw("x", "nita", "Compte à Compte", "Demo Sender vient de transferer un montant de 5000.0 F CFA vers votre compte"), OWN)).toEqual({
      kind: "in",
      amount: 5000,
      currencyCode: "SIFA",
      party: { name: "Demo Sender" },
    });
  });

  it("Binance: only «Deposit Successful» counts, USDT = dollars", () => {
    const ok = raw("x", "binance", "USDT Deposit Successful", "You have successfully deposited 10 USDT at 2026-05-20 22:48:40 (UTC). If you do not recognize this activity…");
    expect(parseBankNotice(ok, OWN)).toEqual({ kind: "in", amount: 10, currencyCode: "USD", deposit: true });
    expect(parseBankNotice(raw("y", "binance", "USDT Deposit Processing", "Your deposit of 10 USDT is currently processing."), OWN).kind).toBe("ignore");
    expect(parseBankNotice(raw("z", "binance", "BTC is up 5%", "Bitcoin 65000 USDT"), OWN).kind).toBe("ignore");
  });

  it("a notification not understood yet shows when it carries an amount", () => {
    expect(parseBankNotice(raw("x", "bankily", "MERPASSCDE", "Votre demande … Montant : 1000 MRU B…"), OWN)).toEqual({ kind: "unknown", amount: 1000, currencyCode: "MRU" });
    expect(parseBankNotice(raw("y", "sedad", "Sedad", "عرض جديد 2026"), OWN).kind).toBe("ignore");
  });
});

describe("ingestBankNotices", () => {
  it("merges the two halves of one GIMTEL transfer", () => {
    const { inbox, added } = ingestBankNotices(EMPTY_BANK_INBOX, [GIMTEL_IN, GIMTEL_OUT], OWN);
    expect(added).toBe(1);
    expect(inbox.suggestions).toHaveLength(1);
    const s = inbox.suggestions[0]!;
    expect(s.kind).toBe("transfer");
    expect(s.notices.map((n) => n.id)).toEqual(["s1", "b1"]);
    expect(s.txId).toBe("1111222233334444");
    expect(suggestionNote(s)).toBe("جيمتل من سداد إلى بنكيلي - عملية 1111222233334444");
  });

  it("never takes the same notification or transaction ID twice", () => {
    const first = ingestBankNotices(EMPTY_BANK_INBOX, [GIMTEL_IN], OWN).inbox;
    const again = ingestBankNotices(first, [GIMTEL_IN, { ...GIMTEL_IN, id: "b2", at: GIMTEL_IN.at + 60 * MIN }], OWN);
    expect(again.added).toBe(0);
    expect(again.inbox.suggestions).toHaveLength(1);
  });

  it("the same text a little later is its own suggestion, flagged «قد يكون مكررًا»", () => {
    const text = "أرسلتم مبلغ 200.0 أوقية جديدة لصالح ديمو ( 40000003 )";
    const { inbox } = ingestBankNotices(EMPTY_BANK_INBOX, [raw("a", "sedad", "ENVOI", text, 0), raw("b", "sedad", "ENVOI", text, 6 * MIN)], OWN);
    expect(inbox.suggestions).toHaveLength(2);
    expect(inbox.suggestions.map((s) => Boolean(s.maybeDuplicate))).toEqual([false, true]);
  });

  it("keeps everything the notification showed", () => {
    const n = raw("x", "bankily", "Transfert d'argent", "Montant : 40 MRU\nBeneficiaire : DEMO NAME,40000004", 5);
    const s = ingestBankNotices(EMPTY_BANK_INBOX, [n], OWN).inbox.suggestions[0]!;
    expect(s.notices).toEqual([{ id: "x", app: "bankily", title: n.title, text: n.text, at: 5 }]);
    expect(suggestionNote(s)).toBe("DEMO NAME · 40000004 - عبر بنكيلي");
  });

  it("ignored ones (ads, Binance processing) are only remembered as seen", () => {
    const { inbox, added } = ingestBankNotices(EMPTY_BANK_INBOX, [raw("p", "binance", "USDT Deposit Processing", "Your deposit of 10 USDT is processing")], OWN);
    expect(added).toBe(0);
    expect(inbox.seen).toEqual(["p"]);
  });
});

describe("deciding", () => {
  it("done / rejected leave the waiting list; a rejected one can come back", () => {
    let inbox = ingestBankNotices(EMPTY_BANK_INBOX, [GIMTEL_IN, raw("n", "nita", "Compte à Compte", "Demo vient de transferer un montant de 100 F CFA vers votre", 2_000_000)], OWN).inbox;
    expect(pendingSuggestions(inbox).map((s) => s.id)).toEqual(["n", "b1"]);
    inbox = decideSuggestion(inbox, "b1", "done", "🔁 تحويل");
    inbox = decideSuggestion(inbox, "n", "rejected", undefined);
    expect(pendingSuggestions(inbox)).toEqual([]);
    inbox = reopenSuggestion(inbox, "n");
    expect(pendingSuggestions(inbox).map((s) => s.id)).toEqual(["n"]);
    expect(inbox.suggestions.find((s) => s.id === "b1")?.outcome).toBe("🔁 تحويل");
  });
});

describe("accountForApp", () => {
  it("finds my account by its method, else by its name", () => {
    let book: AccountsBook = EMPTY_ACCOUNTS_BOOK;
    for (const preset of DEFAULT_ACCOUNTS) {
      const r = addMoneyAccount(book, { ...preset, openingBalance: 0, openingDate: "2026-01-01" });
      if (r.ok) book = r.book;
    }
    expect(accountForApp(book.accounts, "bankily")?.name).toBe("بنكيلي");
    expect(accountForApp(book.accounts, "nita")?.name).toBe("نيتا (النيجر)");
    expect(accountForApp(book.accounts, "binance")?.name).toBe("محفظة بينانس");
    expect(accountForApp(book.accounts, "unknown")).toBeUndefined();
  });
});
