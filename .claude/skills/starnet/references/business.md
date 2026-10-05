# The operator's business - facts and decisions

What the operator told us about his business and what he decided, so the next session doesn't ask
again or undo it. Add a line here with every new decision (and correct a line when he changes his
mind). Exact texts and numbers live in the code - this file says where.

## Money places (where his money is)

- **«الكاش»** - cash in hand. He has no "till/box": every UI text says «الكاش» (never «الصندوق»;
  the store/key is still `cashStore` / `starnet_cash_entries_v1`). The bot also accepts «كاش»,
  «الكاش» and the old «الصندوق».
- **Mauritanian apps (أوقية, on his number 22227268):** بنكيلي، مصرفي، سداد، كليك، أمانتي.
- **Foreign apps (سيفا):** أورانج موني مالي (74646158), نيتا النيجر (22227268). These two run in
  **«فرانك»** (his rate, Oct 2026: **5 فرانك = 1 سيفا**): in «حسابي» their balance is typed and shown
  in فرانك (as their app shows it), and the app stores/totals it in سيفا (÷5) - so transfers,
  totals and customers' payments (still entered in سيفا) are untouched. Computed from the account's
  method (orange/nita), `accountDisplayUnit` / `FRANC_PER_SIFA` in `moneyAccounts.ts`; no data change,
  but he must re-type each one's current balance once in فرانك after the update.
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
  `/money?add=1`), 🔁 monthly income/expense (salary, rent) that records itself on its day each month; **never on
  the day it's added** (his rule: a day that is today or already passed → first record next month;
  a later day this month → this month), never twice in a month (`firstRecurringMonth`); a deleted
  month stays deleted.
- Figure 1 «يبقى لك هذا الشهر» = the reports' business «الصافي» + income − personal expenses.
- Figure 2 «في يدك الآن» = الكاش + banks/wallets + KAST − what he owes (Starlink D + previous debts,
  **customers he owes**, suppliers, reps, people); «كل ما تملك» = that + what customers, reps and
  people owe him. Every line opens who/which account and how much (`buildWealth`, `loadWealthInput`).
- **A customer with a credit («له رصيد», a negative balance = we owe him) shows under «👥 عليك
  للزبائن»** (his Oct 2026 report: «شخص له عندنا 1,917,900 لا يظهر»). `loadWealthInput` splits each
  client's combined total: positive remaining → «لك عند الزبائن», negative → `customersOwe` → «عليك
  للزبائن». Before this, negatives were dropped, so a customer we owed appeared nowhere.
- **«إضافة رصيد» (party balance, `BalanceForm`) - how the money moved** (his Oct 2026 choice, both
  «عليه» and «له»): one selector «من أين تحرّك المال؟» replaces the old cash-only checkbox - «لم
  يتحرك المال (رصيد فقط)» / «💵 الكاش» / **any of his banks/wallets** (listed from `loadAccountsBook`).
  Picking an app sets the adjustment's `accountId`, so that app's balance moves in «حسابي» (via
  `partyFlows`, already in `loadAccountFlows`) and **no** cash entry is posted; «الكاش» posts a cash
  entry as before; «لم يتحرك» records a plain balance entry. `accountId` and `cashMoved` are mutually
  exclusive (the store drops `cashMoved` when `accountId` is set). Useful for a customer outside
  Starlink paid through a bank app.
- **Clients page filter** (his Oct 2026 choice): «👤 زبائني» is the first chip and the default
  (instead of «الكل»); a second row filters by balance direction - «الكل / 🔴 مدينون لنا / 🟢 لهم
  رصيد علينا» (`BalanceFilter`, counts per chip).
- **Foreign-currency lines show their own currency beside the أوقية** (his Oct 2026 choice): a
  wallet/app that runs in a non-أوقية currency comes out to its **own front-line entry** shown as
  «السعر الأصلي + مقابله بالأوقية» - أورانج موني & نيتا (سيفا), بينانس (دولار). The أوقية apps
  (بنكيلي، مصرفي…) stay grouped under «🏦 البنوك والمحافظ». «💳 محفظة KAST» and «🛰️ عليك لستارلينك (D)»
  likewise show دولار + أوقية. The own-currency figure is `WealthLine.native` (any non-MRU balance
  on the line), rendered small/muted (`.money-line-native`); all totals stay computed in أوقية.
- **The registered exchange rate follows real payments.** When he settles a Starlink D from the card
  («تسديد D») or pays a previous debt, the dollars that actually leave the card against the foreign
  amount reveal today's true rate (e.g. 2700 HNL ÷ 100.61 $ = 26.84). That currency's **current**
  registered rate is then updated automatically from this payment (his Oct 2026 choice: «تلقائيًا
  بدون سؤال», everywhere «السعر الحقيقي» is shown). Future-only: no past record is recomputed - each
  keeps its locked snapshot rate (`realRateFromUsd` + `setCurrencyRate`, the toast says «حُدّث سعر …»).
- No double counting: personal records post linked cash entries (`personal-expense`,
  `personal-income`, `personal-debt`) that the business reports ignore; the figures reuse the same
  functions as the clients, suppliers, reps, reports and card pages.
- **Categories = groups like his «مصاريف» app** (his screenshots): small round icons (home-ring
  size), a group opens under its row to its items (فواتير → الكهرباء، الغاز، الإنترنت، الاتصالات،
  الإيجار، التلفاز، المياه…), «عام» = the group itself; his own top sections first (سحب رصيد، تحويل
  رصيد، العائلة، خسارة من الأجهزة), «أخرى» last. **Long press** any icon → remove it (hidden; old
  records keep the name) or add an item inside a group; dashed «➕ قسم جديد» adds a group. Same
  for الدخل (its old categories kept, now in the same style). Tree: `DEFAULT_EXPENSE_TREE`
  (`personalExpenses.ts`), `lib/categoryTree.ts`, `components/CategoryPicker.tsx`; stored
  `starnet_expense_tree_v1` / `starnet_income_tree_v1`. **The old flat expense categories (أكل،
  شرب، رصيد…) were removed with the expenses recorded on them** - his explicit choice, confirmed
  twice («احذف المصاريف القديمة نفسها»); done once by `expenseTreeStore.loadExpenseTree` (with
  their الكاش entries; an old 🔁 rule moves to the matching new category). Phone credit from a
  bank notification → «فواتير · الاتصالات».
- Logic: `myMoney.ts`, `moneyAccounts.ts`, `myMoneyData.ts`; UI: `app/money/page.tsx`,
  `components/MyMoney.tsx`. The reports' «المصروفات» tab and its 🧾 button stay too.
- **«⚙️ البداية من جديد»** (bottom of «حسابي», both behind the delete code, both undoable):
  - «🔄 الأرباح والخسائر من 0 (الديون تبقى)» = **profits & losses only** (his choice): reports and
    «حسابي» (net, income, expense) count from today (`profitReset.ts`, the same
    `starnet_profit_reset_v1` as the reports' reset + every rep starts fresh; `monthLeft` takes
    `since`). The «أرباح عملك (الصافي)» figure zeroes across **all** sources from that day:
    `buildMonthNet` (netProfit.ts) drops not only the Starlink profit but also store sales / COGS /
    commission and the business expenses dated before the reset day (bug he reported Oct 2026:
    «زر تصفير الأرباح لا يعمل - الأرباح تبقى» - only Starlink was being trimmed before). Nothing is
    deleted: الكاش, banks and customers'/people's debts stay. «↩️ إرجاع».
  - «💵 إرجاع الكاش إلى 0» = **the till only** (his Oct 2026 choice: «تصحيح إلى 0، قابل للتراجع»): one
    offsetting cash entry per currency brings الكاش to 0 today (`resetCashToZero`, `sourceKind:"cash-reset"`).
    Nothing is deleted and it is **not** counted as a مصروف (it carries a `sourceId`, so
    `listStandaloneCashEntries` skips it); banks, wallets and all debts stay untouched. While a reset
    stands, the button turns into «↩️ تراجع عن تصفير الكاش» (`undoCashReset`, `hasCashReset`). Also
    behind the delete code.
  - «🗑️ حذف كل المعاملات وتصفير كل الحسابات» = **the transactions only** (his choice): every
    money record is removed (shipments, payments, الكاش, invoices, stock moves, expenses, income,
    debts, party/rep entries, card top-ups, previous debts, closings - `wipeTransactions.ts`
    `TRANSACTION_KEYS`); banks/wallets stay at 0 from today, 🔁 rules restart at their next day.
    Devices, customers, reps, suppliers, items, categories and settings stay. A snapshot is kept
    on the phone first (`starnet.wipeUndo`, not in backups) → «↩️ استرجاع ما حُذف».
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
  الكاش - except the «💵 إيداع من الكاش / سحب للكاش» choice, which is a transfer between الكاش and
  that account (`CASH_ACCOUNT_ID`, a linked cash entry `account-transfer`, deleted together). Supplier / rep payments carry `accountId` too (`partyFlows`); transfers between his
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
- **Bankily `Versement espèces`**: `Votre compte a été crédité de 11800 MRU suite à votre versement
  espèce… ID Trs : <id>` = he put cash into Bankily → suggested as **«💵 إيداع من الكاش»** (his
  choice: a transfer from الكاش to بنكيلي; changeable on confirm).
- Phones write the apostrophe as ’ («Transfert d’argent») - both the Java title match and the
  parser normalize it (the first real Bankily transfers were missed because of it).
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
- A bank notification whose body is **InboxStyle** (several lines, like Bankily's «Transfert
  d'argent»: «Montant : … MRU» on one line, «Beneficiaire : …» on the next) was dropped because
  the lines live in `EXTRA_TEXT_LINES`, not `EXTRA_TEXT` - the capture now joins `EXTRA_TEXT_LINES`
  and `EXTRA_SUB_TEXT` too (`KastNotificationListener.titleAndText`).
- The existing `KastNotificationListener` (Android «Notification access») is the place to extend.

## 💳 Filling Starlink's card form with his own cards

- In «ستارلينك والبطاقة», each KAST card (same list, last 4) gets «💳 أكمل البيانات»: full number
  (check digit + must end with its last 4), name on card, MM/YY, security code, postal code,
  address, and **DNI / RTN / Passport** (a tax id some countries' Starlink payment form requires -
  the «taxId» card field, filled when the form shows a DNI/RTN/Passport box; his own id, kept per
  card on the phone). **His choices:** kept on the phone **and in the encrypted backup** (`starnet_card_fill_v1`),
  the code is filled too, **no fingerprint**; never in the rep's copy (`pushFillCards` sends [] in
  rep mode), never to the assistant. Logic `lib/cardFill.ts`.
- In a device's browser: tapping a card field of the payment form (or the top-bar «💳») lists the
  completed cards; the one picked fills every field. The fields are usually inside the payment
  company's own frames, so `starnetCardFill.js` (`src/webExtraction/cardFill.ts`,
  `cardFillScript.ts`, bundled in CI like the extractor) runs at the start of **every** frame
  (androidx.webkit document-start script + web-message listener, `CardFillController.java`); only
  secure frames that have card fields receive the card. **Works on his phone** (all fields
  filled); if a field isn't filled, ask for a «🧪 لقطة تشخيص» of that page.
- **Filled values must enable «Submit»/«Save».** Starlink's forms are React; a plain `input.value`
  set (or `execCommand`) leaves React's hidden value tracker stale, so the button stays greyed out
  until a real keystroke - which is why the operator's workaround was «delete the last digit and
  retype it». All field typing (card fields and the OTP code) now goes through `formInput.ts`
  (`typeValue` / `setNativeValue`): native prototype setter + tracker reset + a real `InputEvent`
  and key events, so the form re-validates and the button enables on its own.
- **«Additional verification needed to process this payment…»** on Save = the KAST card is
  **frozen** (not an app problem). His steps to add a KAST card to a device:
  1. KAST app → «البطاقات» → swipe to the card (several cards, last 4 shown) → «إلغاء التجميد» →
     fingerprint/code → a KAST code by email, or «تجربة طريقة أخرى» → WhatsApp/SMS → paste it.
  2. Device browser → Billing → Payment Method «Edit» → fill the card (💳) → Save → a white
     «VISA» page → «Verify transaction» → choose **Email** → the code comes from **no-reply**
     («STARLINK INTERNET – Please confirm the following payment… €0.00», 6 digits). The emails
     titled «Your KAST verification code» are the unfreeze codes - not this one.
  3. Paste it → Submit → wait → Billing shows «VISA ending in ####».
  Never store or log these codes, the card number or the CVV from his screenshots.
- **«💳 أضف البطاقة» is automatic** (his choice when asked «الا توجد طريقة لنجعل كل شي تلقائي»:
  **the KAST card stays unfrozen**, so nothing in KAST is needed; **one device at a time**). He
  taps «💳» (or a card field) and picks the card; the app opens Billing → Payment Method → Edit,
  fills, taps Save, picks **Email** on «Verify transaction», reads **no-reply's** code from the
  phone's mail notification (the same «Notification access»; read only while waiting, KAST's own
  codes ignored) - or takes the code he copied when he comes back to the app - types it, taps
  Submit, and when Billing shows the card's last 4 says «✅» and runs «مزامنة». «Additional
  verification needed» → tells him the card is probably frozen. Any step it can't find → tells
  him to tap it himself and carries on. Code: `cardFlow.ts` (what a frame shows + the taps),
  `cardFillScript.ts`, `CardAddFlow.java` (step order, tested), `PaymentCode(Inbox).java`,
  `CardFillController.java`. Fingerprint/biometrics can never be done by an app.
- **رمز البطاقة من البريد مباشرة** (his ask «اربط البريدين للقراءة التلقائية»): no-reply's card code
  goes to the card's billing Gmail (his personal Gmail (not the shop's `starnet.om`)), NOT the device's
  Starlink email nor «بريد الرموز» (`starnet.om`, that one is for Microsoft login codes). Gmail's
  notification usually hides the code inside the body, so he links the card's Gmail once in
  **Settings → «💳 بريد رمز البطاقة (Gmail)»** (read-only, via Google's screen); then «أضف البطاقة»
  reads the code from that mailbox via the Gmail API and types it (notification + clipboard stay
  as fallback). Code: `GmailCodes.PAYMENT_QUERY`/`paymentCodeIn`, `GmailCodeFetcher.forCardPayment`,
  `CardFillController.awaitCode`, plugin `linkCardGmail`, `CardGmailSection`. Read-only Gmail scope;
  the code is never logged.

## 📋 A Starlink session sent to a bot → a new device

- He (or a linked rep) pastes the Firefox session («Cookie-Editor» → Export → JSON) in the bot.
  **Telegram cuts it into 2+ messages** (~4096 characters, often inside one long cookie value -
  his screenshot): the app joins the pieces of one chat (within 5 min, any cookie-looking piece in any order) and adds the
  device only when they read as a whole session; no part is ever answered as a command.
- **His choices:** his own bot → a **new device at once** (named «📋 جهاز جديد HH:MM») whose browser
  is signed in, then «مزامنة» reads its email/KIT/dates (a device already on the app gets «⚠️
  مكرّر» + «دمج»); **reps' bot too**, but a rep's session waits in «طلبات المناديب» (✅ أضف الجهاز /
  ❌ رفض) and becomes his device; **the Telegram message is left as is** (not deleted).
- Code: `telegramSession.ts` (joining + checks, tested), `telegramSessionRunner.ts`,
  `RepRequestsSection` (session card), native `SessionText.java` (TelegramReplyService hands the
  parts to the app, «📥 وصلت الجلسة» when the app is closed). The cookies of a rep's request are
  dropped when he decides. Never log or commit a session; tell him to sign out if one is pasted
  in a chat with Claude.

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

## Duplicate devices (same email or KIT)

- **Rep's app: warning only, he can still send** (his choice). His copy carries `known`: one-way
  fingerprints of the operator's other devices' emails/KITs (`knownDevicesOf`, `deviceFingerprint`
  in `lib/duplicates.ts`) - never the emails themselves; his add dialog says «مسجّل عند المسؤول».
- **Owner's «تسجيلات المندوبين»:** a new device that matches one he has (`duplicateOf`, computed
  in `listRepChangeItems`) is **never installed as a second device**: no ✅, not in «تثبيت الكل»;
  ❌ rejects it (the rep is told «مسجّل عند المسؤول من قبل») or 🔗 links the operator's existing
  device to that rep instead (`decideRepItems(..., linkKeys)`).
- **Existing duplicates:** «⚠️ مكرّر · دمج» on the card (`deviceTwins`); merging moves the
  duplicate's operations, allocations and previous debts to its twin, fills what the twin lacks
  (customer, rep, phone, KIT, passwords, monthly price…) and sends the duplicate to the trash
  (`lib/deviceMerge.ts`). The card pressed is the one merged away.

## Sync decisions (details in the `starnet-browsers` skill)

- Background sync (invisible overlay WebView) when enabled; otherwise the visible auto-sync.
- Faulty and limited-access devices sync only by command.
- A new device's renewal date is empty («لم يُقرأ بعد») until its first sync - never a placeholder.
- The renewal date is the **stop instant**: the device goes off at that date's midnight, so it is
  active only through the end of the day *before* its date. Every «أيام متبقية» display reflects this
  (decided Oct 2026, his words «يوم 5 يعني ليلة ساعة 12»): date tomorrow ⇒ «ينتهي الليلة», the day
  before ⇒ «يوم واحد متبقٍ», date today ⇒ «منتهٍ» (already stopped). Renewal reminders, the morning
  Telegram digest, the rep bot's day lines and «تجديد اليوم» all count the same way (one day earlier
  than the raw date). `daysRemainingNumber` still returns the raw calendar count; callers treat `<= 0`
  as expired and show `days - 1` as the days left.
