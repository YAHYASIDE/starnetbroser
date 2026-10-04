# The operator's business - facts and decisions

What the operator told us about his business and what he decided, so the next session doesn't ask
again or undo it. Add a line here with every new decision (and correct a line when he changes his
mind). Exact texts and numbers live in the code - this file says where.

## Money places (where his money is)

- **«الكاش»** - cash in hand. He has no "till/box": every UI text says «الكاش» (never «الصندوق»;
  the store/key is still `cashStore` / `starnet_cash_entries_v1`). The bot also accepts «كاش»,
  «الكاش» and the old «الصندوق».
- **Mauritanian apps (أوقية, on his number 22227268):** بنكيلي، مصرفي، سداد، كليك، أمانتي.
- **Foreign apps (سيفا):** أورانج موني مالي (74646158), نيتا النيجر (22227268).
- **Wallets (USD):** KAST (= the existing card: `starlinkDebt.ts` top-ups − card payments, shown as
  «محفظة KAST»; never also a money account - it would count twice) and بينانس.
- The ready-made accounts: `DEFAULT_ACCOUNTS` in `apps/web/src/lib/moneyAccounts.ts` (added once,
  each «اكتب الرصيد» until he types its real balance; deleted ones never come back).
- Customers' payment methods stay: بنكيلي، مصرفي، سداد، أورانج موني، نيتا، نقدًا (he said no to
  adding كليك/أمانتي/بينانس). A payment by a method linked to an account goes to that account, and
  is left out of «الكاش» in «حسابي» (`cashInHandEntries`).
- These two numbers are his public business contacts (on invoices, statements, reminders) - fine in
  code defaults. Customers' phones, emails, cards, passwords: never in code/tests/commits.

## «💰 حسابي» (`/money`) - his own money in one place

- Like the app «مصاريف»: tabs الدخل / المصروف / الديون, sections with icons, green «+» (pinnable,
  `/money?add=1`), 🔁 monthly income/expense (salary, rent) that records itself from its first day
  on/after creation; a deleted month stays deleted.
- Figure 1 «يبقى لك هذا الشهر» = the reports' business «الصافي» + income − personal expenses.
- Figure 2 «في يدك الآن» = الكاش + banks/wallets + KAST − what he owes (Starlink D + previous debts,
  suppliers, reps, people); «كل ما تملك» = that + what customers, reps and people owe him.
  Every line opens who/which account and how much (`buildWealth`, `loadWealthInput`).
- No double counting: personal records post linked cash entries (`personal-expense`,
  `personal-income`, `personal-debt`) that the business reports ignore; the figures reuse the same
  functions as the clients, suppliers, reps, reports and card pages.
- Logic: `myMoney.ts`, `moneyAccounts.ts`, `myMoneyData.ts`; UI: `app/money/page.tsx`,
  `components/MyMoney.tsx`. The reports' «المصروفات» tab and its 🧾 button stay too.
- Next step he agreed to: read bank/wallet notifications (Bankily…) into these accounts - see
  «Bank / wallet notifications» below.

## Bank / wallet notifications (built - «📩 عمليات البنوك» in «حسابي»)

- **Built from the screenshots received so far (his call: «ابدأ ببناء الميزة بما وصلك الآن»).**
  Native: `BankNotice.java` (which apps: package keywords, else known titles; needs a figure),
  `BankNoticeStore.java` (kept on disk until the app acks), the same `KastNotificationListener`
  (also scans active notifications when access is turned on). Web: `lib/bankNotices.ts` (parser +
  inbox `starnet_bank_inbox_v1`, backed up), `lib/bankSuggestionSave.ts` (a confirmed choice → the
  usual record), `components/BankInbox.tsx`, wired in `app/money/page.tsx`; drained on open and
  when the app comes back (`drainBankNotices`).
- A record from a notification goes through the chosen account (`accountId`), never through
  الكاش. Supplier / rep payments carry `accountId` too (`partyFlows`); transfers between his
  accounts are `AccountsBook.transfers` (listed and deletable in «البنوك والمحافظ»).
- Limits for now: «دفعة زبون» only on an account linked to a payment method (بنكيلي، سداد، مصرفي،
  نيتا، أورانج) - it's a device payment by that method; a transfer is only between his registered
  accounts (KAST is the card, not an account here). Formats not received yet show as «إشعار لم
  يُفهم» (he picks in/out) - add each new wording to the parser + tests when he sends it.

- **Wait for ALL screenshots** before building (his choice): every app (بنكيلي، مصرفي، سداد، كليك،
  أمانتي، أورانج موني مالي، نيتا) and every kind (received from someone, sent/paid, withdrawal…).
  Received so far: GIMTEL (سداد → بنكيلي), Bankily money sent to a person, Sedad money sent to a
  person, Sedad phone credit, Nita money received, Bankily money received, Binance deposit.
- **GIMTEL** = moving money between his own apps on the same number (e.g. سداد → بنكيلي). It arrives
  as two notifications for one operation, real wording (amount/number as he sent it):
  - Bankily app, title `Gimtel envoie de l'argent`: `Vous avez reçu 50.0 MRU du bénéficiaire :
    +22222227268 (SEDAD). ID de transaction : <id>`
  - Sedad app, title `ENVOI`: `أرسلتم مبلغ 50.0 أوقية جديدة لصالح 22227268 (BANKILY)`
  → one **transfer between his accounts** (minus from one, plus to the other; not income/expense,
  «كل ما تملك» unchanged); the two notifications are merged into one.
- **Bankily money sent to a person**, title `Transfert d'argent`: `Montant : 10 MRU` /
  `Beneficiaire : <NAME>,<number>` (the text is cut with «…» when long - read the full big text)
  → an **outgoing-money suggestion** from Bankily carrying the beneficiary's name (amounts can be
  large, e.g. 4600, no thousands separator; the number may be cut off entirely). On confirming he
  picks one of: personal expense (category), «دين أعطيته», «تسديد دين», **payment to a supplier**
  or **money given to a rep** - the last two go to that supplier's / rep's book (business), not to
  personal expenses. Same choice for every outgoing transfer (Sedad's below too).
- **Sedad phone credit**, title `PAIEMENT_CREDIT`: `تلقيتم رصيدا بمبلغ 10 أوقية جديدة من شنقيتل`
  = he bought phone airtime with Sedad money → **expense «رصيد الهاتف»** from Sedad (category
  changeable on confirm).
- **Sedad money sent to a person**, title `ENVOI`: `أرسلتم مبلغ 200.0 أوقية جديدة لصالح <NAME> (
  <number> )` → outgoing-money suggestion from Sedad with the name and number, like Bankily's.
  (Same title `ENVOI` as GIMTEL - GIMTEL is the one whose «لصالح» is his own number + `(BANKILY)`.)
- **Bankily money received**: same title `Transfert d'argent`, but `Expediteur : <NAME>,<number>`
  instead of `Beneficiaire` → received (Expediteur = in, Beneficiaire = out).
- **Bankily `MERPASSCDE`** (`Votre demande…`, `Montant : 1000 MRU`, `B…`): meaning not known yet -
  ask him for the expanded notification before reading it.
- **Binance**: `USDT Deposit Processing` (ignore) then `USDT Deposit Successful`: `You have
  successfully deposited 10 USDT at 2026-05-20 22:48:40 (UTC)…` → only "Successful" counts, a
  suggestion in his Binance account where on confirming he picks **income** or **transfer from
  another account of his** (KAST…). **USDT = USD** (recorded as dollars).
- **Nita (Niger) money received**, app «my NITA», title `Compte à Compte`: `<NAME> vient de
  transferer un montant de 5000.0 F CFA vers votre…` (cut - read the full big text) → **income**
  suggestion in his «نيتا النيجر» account; `F CFA` = SIFA (never converted).
- **Keep everything the notification shows** on each suggestion and record (his decision): the
  person's name and number, the transaction ID, the app, the full notification text and its time.
  This stays on his phone and in his backup only - never in code, tests, fixtures or commits
  (tests use fake names/numbers).
- **Duplicates:** Sedad gives no transaction ID; two identical texts at different times were two
  real transfers. Every notification posted at a different time is its own suggestion, flagged
  «قد يكون مكررًا» when the same text came shortly before - he rejects what he doesn't want. A
  transaction ID (Bankily) that was already seen is never suggested twice.
- Every read notification is a **suggestion awaiting his confirmation** in «حسابي» (accept / edit /
  reject) - never recorded silently.
- Money received from another person's number → suggested as **personal income**, no automatic
  customer matching; on confirming he can change it to: payment from a customer, money from a rep,
  «دين أخذته» or «دين رُدّ لي» (the customer/rep ones go to that book, not personal income).
- The existing `KastNotificationListener` (Android «Notification access») is the place to extend.

## What customers receive

- Debt reminder on WhatsApp: his exact wording - `debtReminderText` in `lib/whatsapp.ts` (السلام
  عليكم… amount with currency… payment lines… ⭐ STAR NET.OM). Payment lines come from settings
  (`paymentInstructions`) or `DEFAULT_PAYMENT_INSTRUCTIONS` (BANKILY - NITA / ORANGE MONEY).
- Client statement: invoice-style image (last 15 operations) + PDF (all), with payment methods,
  small WhatsApp QR codes for both numbers and his email - `lib/statementDocument.ts`; contact
  defaults `DEFAULT_CONTACT` in `lib/pdfDocument.ts`, editable in settings «بيانات النشاط».

## Notifications

- Events go to the phone's notification bar and a tap opens the page: rep requests (even with the
  app closed - native `tellOwner` in `TelegramReplyService`), sync results, KAST money, morning /
  evening summaries. In-app toasts stay too. Native: `AppEventNotifier`; web: `lib/appEvents.ts`.

## The rep's app (same APK, rep mode)

- He has: home, clients, reminders, tools (+ خطة اليوم), «تقاريري», **التقارير** (his devices'
  numbers), background sync, morning/evening summaries, «بيانات النشاط» (once he saves it, it's his
  own and a new copy doesn't replace it). Pages: `REP_ALLOWED_PATHS` in `lib/repMode.ts`.
- Owner-only: store, «ستارلينك والبطاقة», archive, trash, backup, Telegram settings, «حسابي».
- After a new APK, the operator sends the rep a fresh copy so shared data (business profile…) updates.

## Sync decisions (details in the `starnet-browsers` skill)

- Background sync (invisible overlay WebView) when enabled; otherwise the visible auto-sync.
- Faulty and limited-access devices sync only by command.
- A new device's renewal date is empty («لم يُقرأ بعد») until its first sync - never a placeholder.
