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
- **«💵 كاش سيفا»** (his Oct 2026 request): a SIFA cash wallet, separate from «الكاش» (which is his
  أوقية cash in hand). It is a money account with **no payment method** (balance = opening + transfers
  + its party `accountId` flows), so it shows in «حسابي» as its own front line (سيفا + أوقية, via the
  foreign-wallet rule). In `DEFAULT_ACCOUNTS`, and added once to already-seeded older books via the
  `seededCashSifa` one-time flag (never re-added if he deletes it).
- The ready-made accounts: `DEFAULT_ACCOUNTS` in `apps/web/src/lib/moneyAccounts.ts` (added once,
  each «اكتب الرصيد» until he types its real balance; deleted ones never come back).
- Customers' payment methods stay: بنكيلي، مصرفي، سداد، أورانج موني، نيتا، نقدًا (he said no to
  adding كليك/أمانتي/بينانس). A payment by a method linked to an account goes to that account, and
  is left out of «الكاش» in «حسابي» (`cashInHandEntries`).
- These two numbers are his public business contacts (on invoices, statements, reminders) - fine in
  code defaults. Customers' phones, emails, cards, passwords: never in code/tests/commits.

## «💰 حسابي» (`/money`) - his own money in one place

- **Tabs: الدخل / المصروف only** (his Oct 2026 choice: «انقل السلف إلى صفحة الزبائن»). The old
  «الديون» tab (سلّفت/استلفت مع الناس) and its «👥 لك عند الناس / ↩ عليك للناس» overview lines were
  removed; a person he lends to / borrows from is now added as a **client** on `/clients` and managed
  with عليه/له there (so it shows under «لك عند الزبائن» / «عليك للزبائن»). `DebtBook` lib + storage
  (`starnet_personal_debts_v1`) are kept for old data/backups but no longer surfaced or counted.
- Like the app «مصاريف»: sections with icons, green «+» (pinnable,
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
  Starlink paid through a bank app. **When an app is the source, a «📷 إرفاق صورة إثبات الدفع»
  (optional)** appears; it is saved in IndexedDB keyed by the adjustment id (`paymentProofStore`,
  carried in backups), viewable/replaceable when editing the entry, removed when it is deleted.
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
- **💳 بطاقة كاش - شحن + سحب رصيد** (his Oct 2026 request): the card page has «+ شحن البطاقة» (money
  INTO the card) and «💵 سحب رصيد» (money OUT). Both ask «من أين/إلى أين تحرّك المال؟»: **الكاش**
  (posts a linked cash entry - a charge takes money OUT of الكاش, a withdrawal brings it IN), **a
  bank/wallet app** (its «حسابي» balance follows, no cash entry, via `cardMovementFlows` in
  `loadAccountFlows`), or - **withdrawal only** - **«خسارة (مال ضائع)»**. A loss has no counterpart:
  the withdrawn dollars are counted as a business expense «خسارة بطاقة كاش» in that month's reports
  «الصافي» (derived from the card movement via `buildMonthNet`'s `cardTopUps`, so it disappears on its
  own if the movement is deleted - never a stored record). Both charge and withdraw can attach a
  «📷 صورة إثبات دفع» (optional, not for a loss), kept in IndexedDB by the movement id and carried in
  backups. Model: `CardTopUp.direction`/`via`/`accountId`, `cardMoveDeltaUsd`; the statement shows a
  charge «⬆️ شحن البطاقة» and a withdrawal «💵 سحب رصيد» with its source/destination.
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
- **بطاقة الزبون (`ClientDialog`) تُظهر الربح دائمًا، حتى لعمليات D** (بلاغه Oct 2026: «أريد كل ربح
  يظهر حتى وإن كان D»): كل جهاز يعرض **الربح الكامل = المؤكَّد + المتوقَّع** (`sumProfitMru`:
  `confirmedMru + expectedMru`) بدل «الربح غير محسوب»، مع «· يشمل متوقّع D» و«≈» عند وجود عمليات D؛
  وفي الأعلى سطر «الربح الكامل (مع المتوقع)» يجمع كل الأجهزة. المتوقَّع بسعر اليوم (تقريبي، يتأكد عند
  تسديد ستارلينك)، والمؤكَّد بسعره المقفل.
- Logic: `myMoney.ts`, `moneyAccounts.ts`, `myMoneyData.ts`; UI: `app/money/page.tsx`,
  `components/MyMoney.tsx`. The reports' «المصروفات» tab and its 🧾 button stay too.
- **A rep's customers never change with a new copy** (*superseded: copies carry no customers at all - see «📱 The rep's copy carries devices only»*) (his Oct 2026 rule; his choice on a conflict:
  «زبون المندوب يغلب»). A device both sides changed since the last copy is merged field by field
  (`repWorkspace.mergeDevice`): the operator's news (renewal date, name…) arrives, the rep's
  untouched-by-operator edits stay, and the rep's `clientId` always stays. Before this, any operator
  change on that device (a renewal moving `renewalDate`) took the rep's customer off it.
- **☁️ Live link with the reps over his own Firebase** (*STOPPED Oct 2026 - customers no longer travel; see «📱 The rep's copy carries devices only»*) (his Oct 2026 choices: «مزامنة حيّة عبر
  الإنترنت»، «زبون المندوب يغلب»، he already has Firebase). v1 syncs a rep's **customers (name,
  phone) and his devices' customer links**, both ways, every 30 s while the app is open
  (`LiveSyncRunner`) and on return to the front. On the operator's phone a customer the rep added
  becomes **that rep's customer** (rep segment) - shown under the rep, total counted on the rep
  (rep-owes-all). Payments/balances still travel by «تسجيلاتي» with his approval. Conflict rule
  (`liveSyncData.mergeIncoming`): newest change wins except a record both changed → the rep's; on the
  first sync a real value always beats an empty one (an empty link never wipes the other side's).
  Deleting a customer is not synced (v1). Transport: Firestore REST + anonymous auth
  (`firestoreRest.ts`), docs `starnet/{spaceId}/reps/{repId}/sides/{rep|owner}`, each encrypted with
  the rep's code + phone key (same key as his copy). Config (apiKey, projectId, spaceId) in
  `starnet.liveSync` - Settings → البوتات → «☁️ الربط الحيّ مع المندوبين» (save + real connection
  test); the rep's phone gets it inside his next copy. Setup he was given: Authentication →
  Anonymous on; Firestore created; rules allowing `starnet/{space}/**` to signed-in users.
  **🔗 Live-link side of disappearing links (his Oct 2026 report: «نربط الجهاز بزبون… أخرج وأرجع لا أجده
  مربوطًا، عندي وعند المندوب»).** Cause: a device that reached the rep's phone in a copy (made before
  the link) counted as the rep's own "unlink, now", and the rep wins a conflict → the operator's link
  was wiped on both phones on the next round (also: an older copy opened after a live link). Now
  (`liveSyncData.ts`): a device new on a phone is a starting point (BASELINE), a copy's changes are
  re-based (`rebaselineTracked`, flag `starnet.liveSyncRebaseline` set by `repCopyApply`), a starting
  point meeting the other side for the first time keeps «a real customer beats an empty one», and the
  other side is merged every round (not only when it changed). The tracked state moved to
  `starnet.liveSyncMeta.v2` so every phone starts over once with that rule.
  **He does NOT use the live link** (Oct 2026: «المزامنة من خلال فايربيس لم افعلها ولا اريدها») -
  the links he lost had another cause, below.
- **🔗 A saved customer link must never be written over (Oct 2026: linked on the card, the name
  showed, «أخرج للشاشة الرئيسية» and back → «الزبون غير محدد», on every device, his phone and the
  rep's; nothing else he edited was lost).** Every screen kept its own in-memory device list and saved
  it WHOLE (`saveDemoAccounts(next)`), so any later save from an older list (a Starlink read drained
  on resume, a page, a tool) wrote the link away. Now device/customer saves go through
  `commitDemoAccounts(base, next, source)` / `commitClientStore(base, next)` (`lib/storeMerge.ts`):
  only the fields that screen changed, applied onto the latest stored list. A link removed by anything
  but him (the edit dialog, deleting a customer) posts a 🔔 «⚠️ أُزيل الزبون عن N جهاز … المصدر: …»
  (`LinkGuardListener`) - if he ever sends that, the source names the culprit.
- **🎨 Rep color on device cards** (his Oct 2026 choice «الاثنان معًا»): the whole card tinted with the
  rep's color (20%), a full 3px frame in it, and a 3px line across the middle under the device /
  customer name (`.account-card-rep-tint`). Before: a light 9% tint + one top line.
- **🔒 «زبائنه عنده فقط» - a rep's customers separated from the operator** (Oct 2026: «أريد أن أسجّل
  فقط على المندوب ولا أعرف حسابات زبائنه… يكفيني زبائني الشخصيون»; went to the council first - report
  artifact «فصل زبائن المندوب»; his choice: «مفتاح لكل مندوب»). Per rep, `Representative.customersHidden`
  (rep card → ⚙️ إدارة). On: his customers vanish from the clients page (`visibleClients`), his devices'
  cards show «🔒 زبون <rep>» instead of the customer, WhatsApp / reminders / receipts for his devices go
  to the rep's phone, the reminders page drops his customers' debts, and his card loses «👥 زبائنه»
  («عليه لك عن أجهزته» stays - what he owes is unchanged). Nothing is deleted (customer stays on the
  device, hidden - a safeguard if the rep disappears); the same button brings everything back.
  Money model unchanged: rep-owes-all + % of profit, renewal by the device's saved monthly price. The
  council's later options, NOT built (need his agreement with the rep): a wholesale price per device
  tied to cost, a debt ceiling per rep, «استلمت لحساب المندوب». Logic `lib/repSeparation.ts`.
- **🔄 Rep reset = «من 0 إلى 0»** (his Oct 2026 ask: «أريد تصفير حساب المندوب حتى لا تظهر له أي
  عملية سابقة»): the existing «🔄 تصفير الحساب» (`rep.resetFrom`) used to zero only his share; now
  every line of his card starts from 0 too - «عليه لك عن أجهزته», «الصافي», «ديون أجهزته على
  الزبائن», his customers' books, the operations list and «🔁 ترتيب ديون أجهزته» read only device
  operations and rep-book entries after the reset (`ledgerAfterRepReset` / `bookAfterRepReset` in
  `lib/repAccount.ts`). Nothing is deleted: the customers' own statements and the stored ledger keep
  everything, and «إلغاء التصفير» brings the old amounts back. The rep's copy / his phone is unchanged.
- **📄 The rep's statement is his whole account** (Oct 2026: «عليه 13,500 لماذا لا تظهر… تظهر ربحه
  ومتوقع ومن أي جهاز بتفاصيل… وإرسال له كشف حسابه PDF»; his choices: «عمليات أجهزته داخل الكشف»،
  «قائمة لكل جهاز مفصولة»، «زر أرسل له الكشف»). The statement now runs his customers' device operations
  (renewal = عليه, payment / handover = له, `RepStatementRow` type "customer" from `repOperations`)
  in the same balance as his share, so «الرصيد الحالي» = the card's «الصافي». «📈 أرباح أجهزته جهازًا
  جهازًا» lists the period's shipments: ✓ confirmed and ⏳ expected (D) apart, each with device, sale,
  cost, profit, his share, and totals (`repProfitBreakdown`); the PDF carries both as tables.
  «📤 أرسل له الكشف» sends that PDF to the rep's Telegram through the reps bot (`sendRepPdf`); with
  «🔒 زبائنه عنده فقط» on, customer names stay out of the statement and PDF.
- **🔒 With «زبائنه عنده فقط» every operation on his devices is his debt** (Oct 2026: «لماذا تظهر 13500
  فقط… يجب أن تظهر عليه كل الديون حتى لو عادت D فهي مسجّلة على المندوب»). Before, only records of
  customers registered as his (rep segments) were his; the others showed as «ديون أجهزته على الزبائن».
  Now, for a rep with the switch on, `repOperations(…, { allHisDevices })` adds every record on his
  live devices: a renewal sold while the device was his (locked `representativeId`, or none) and every
  payment on it; a record another rep owes stays that rep's. «عليه لك عن أجهزته», «الصافي», the
  statement and the PDF all use it; the «ديون أجهزته على الزبائن» line is gone for him. Reps without
  the switch keep the old customer-based rule.
- **🤖 The rep's money bot shows his card's figures** (Oct 2026: «بوت الأموال غير جيد» - «كشفي» said
  «متعادل ✓» while he owed 46,000 سيفا, «ديون زبائني» listed pre-reset debts, «دفتري» odd balances;
  his choices: «مثل بطاقته + PDF»، «دفتره + ما عليه لك بعد التصفير»). One computation for card and bot:
  `lib/repPosition.ts` `repPosition` (since his reset: owed for devices, confirmed/expected share,
  net, his book, operations). «📊 كشفي» = `repPositionText` (+ last 10 operations by device name; the
  full PDF stays the app's «📤 أرسل له الكشف»); «💰 ديون زبائني» = `repPositionDebtsReply` (his book by
  name, then what he owes us per device; the old «ديون زبائن أجهزتك» section is gone); «دفتري»
  balances and the bot search read the post-reset ledger/book too. Amounts in the reps page's display
  currency (`starnet.repDisplayCurrency`). The month-closing message uses the same text.
- **💼 Each one keeps his own debts - the copy and «تسجيلاتي» carry no money** (Oct 13 2026: «أريد نسخة التي يرسلها لي
  المندوب ألا تكون فيها إلا تعديلات الاسم أو الزبون… الجهاز عليه D أو دين الزبون أو العملات لا أريده أن يظهر عندي، وديون
  زبائنه لا تتغير عنده ولا عندي، كلٌّ له عنده ديونه»). His choices: «الاسم + الأجهزة الجديدة»، «اسم زبونه على الجهاز
  للعلم»، «الأجهزة فقط، ديونه لا تُمس». **From the rep** (`buildRepChangeSet` / `limitRepChangeSet` /
  `limitDeviceChanges`): only a device he added (with its session, without `renewalPlan` / `travelRegistrationPrice`), and
  on his other devices only `name` and `repClientName` (his customer's name, from his phone's customers -
  `withRepClientNames`); renewals, D, payments, debts, currencies, promises, customers never - the operator's side drops
  them too (an older rep app), the review lists only «📡 جهاز جديد» / «✏️ تعديل الجهاز» (detail: «✏️ الاسم: A ← B · 👤
  زبونه: X»). `repPending` counts only those. The operator's card shows «👤 زبون المندوب: X» (`repClientName`, owner view
  only, information - not his customer, no debt). **From the operator** (`repStoreSlice`, `COPY_STORES`): devices + rates,
  templates, business profile, the rep himself - no ledger, allocations, previous debts, store invoices, settlements, rep
  book or past ledger (and `buildRepCopy` gets an empty ledger); `rebaseWorkspace` writes only COPY_STORES, so the rep's
  operations and his customers' debts on his phone are never touched. What the rep owes the operator stays the operator's
  (his statement, the money bot's «📊 كشفي»).
- **📱 The rep's copy carries devices only - no customers either way** (*operations / debts too since Oct 13 2026 - see
  «💼 Each one keeps his own debts»*) (Oct 2026: «النسخ التي أرسلها
  للمندوب فيها الأجهزة فقط… تتوقف نسختي ونسخته من الزبائن… إذا عدّل المندوب على أجهزته تظهر له… لا
  يمكنه حذفها»; his choices: «الأجهزة + عملياتها»، «عنده تبقى ولا تُمسح»، «الحذف فقط»).
  `repStoreSlice` sends his devices (without `clientId`), their ledger/allocations/previous debts and
  the shared settings - never `CUSTOMER_STORES` (customers, notes, adjustments, promises). On his phone
  those stores are his alone: a copy never touches them, his device↔customer link (`LOCAL_FIELDS`) is
  kept from his phone, and none of it is pending or sent back (`buildRepChangeSet`, `repPending`);
  the operator's side refuses customer stores and never takes his `clientId` (older rep apps).
  Every device field he changed stays his until approved/rejected (`mergeDevice` - his edit wins over
  a newer copy). He can archive but not delete: no «حذف» on his cards / dialog, and a removed or
  trashed operator device comes back on the next copy. The ☁️ live link (customers only) is stopped
  (`LIVE_SYNC_STOPPED`); copies no longer carry its config.
- **🔒 A rep's bot payment is recorded once** (Oct 2026: a 10,000-franc Orange payment showed as
  20,000 سيفا paid - recorded twice, two «سُجّلت دفعتك» messages; council report «الدفعة المكرّرة»;
  his choice «نعم، ابنِ القفل»). The bot's record id travels as `RepRequest.botId`
  (`hasBotRequest`: the same inbox message never makes a second card, payments and loans); the
  approve button claims the request first (`claimRepRequest` → approved, `releaseRepRequest` if
  saving fails) and the ledger entry id is `rep-<requestId>` (`saveClientDevicePayment` skips an
  id already on the device). For a «زبائنه عنده فقط» rep the confirmation says what HE still owes
  for his devices (`repPaymentConfirm.ts`), never «لم يبقَ على الزبون شيء».
  **Units:** his reps count Orange/Nita money in **فرانك**; the app's «سيفا» is **5 فرانك** (his
  words: «10000 فرانك… قيمة 2000 سيفا»). That day's payment was really 2,000 سيفا (he fixes it by
  hand: one entry edited to 2,000, the duplicate deleted → 44,000 owed).
  **His rule «أورانج موني لفرانك فقط… سيفا تدفع فقط كاش»:** the money bot's 💵 دفعة currency step
  offers أوقية / «سيفا (كاش)» / دولار / «🟠 فرانك (أورانج / نيتا)». سيفا → cash only; فرانك → أورانج
  or نيتا only, and on choosing the app the amount becomes سيفا ÷5 (`TelegramReplies.FRANC`,
  `francToSifa`, `explicitPayCurrency` reads «فرنك/فرانك/cfa» typed with the amount); the rep sees
  «10,000 فرانك = 2,000 سيفا». A recorded سيفا payment keeps its أورانج/نيتا label; activations (fixed
  سيفا price) and loans still offer أورانج / نيتا.
  **The same rule in the app's forms** (his «طبّق نفس قاعدة أورانج فرانك في نماذج التطبيق»): every
  customer-payment form (device «له» `LedgerDialog`, «تعديل الحركة», «💵 دفعة سريعة», the client /
  supplier `BalanceForm`, a rep's payment-request card) picks أوقية / «سيفا (كاش)» / دولار / «🟠 فرانك
  (أورانج / نيتا)»; methods follow it (أوقية: كاش/بنكيلي/مصرفي/سداد, سيفا & دولار: كاش, فرانك:
  أورانج/نيتا); فرانك saves as سيفا ÷5 with «10,000 فرانك = 2,000 سيفا» under the amount, and a saved
  سيفا payment by أورانج/نيتا reopens in فرانك ×5 (`lib/payCurrency.ts`). Nothing new is stored; an
  older entry's own (non-فرانك) method stays listed when edited. Activations keep their أورانج / نيتا.
  **Everywhere money goes through أورانج / نيتا** (his «تأكد من كل الأقسام… يكون ظاهر اشارة او تعليمات»):
  choosing an أورانج / نيتا account (`isFrancAccount`) turns the currency into «🟠 فرانك» with the
  `FrancHint` note under the amount, saving سيفا ÷5 and reopening ×5 - «حسابي» income / expense /
  monthly (`AmountRow`, `storedAmount`), the card top-up / withdrawal, the bank-notice confirm (Nita's
  «F CFA» is فرانك: 5,000 F CFA = 1,000 سيفا - supersedes «F CFA = SIFA never converted»), and the
  client/supplier balance form offers أورانج / نيتا as a source only with «فرانك». Saved records show
  it: `methodLabel` («أورانج موني · 🟠 10,000 فرانك») in device / client statements and payment
  notifications, `francBadge` on expenses, incomes, transfers and card moves, the أورانج / نيتا
  lines of «حسابي» in فرانك. Fixed سيفا amounts through أورانج / نيتا (activations, loans) show
  «8,000 سيفا = 40,000 فرانك» in the app cards and the bot (`TelegramReplies.francLine`).
- **✎ in the rep statement** (his «اجعل هناك خيارات تعديل», on the duplicate 10,000 payment): a
  customer's renewal / payment row opens «✎ تعديل العملية» (`LedgerEntryEditor`) and «🗑 حذف العملية»
  (`confirmAndDeleteLedgerEntry`).
- **🗑 Delete a device operation from the customer's statement** (clients page «تفاصيل العملية», his
  Oct 2026 request): same path as the device statement's delete (`confirmAndDeleteLedgerEntry` -
  closed-month check, confirm, removes its cash entry and allocations). «✎ تعديل» there opens the
  device's own operation dialog (`LedgerEntryEditor`) right on the clients page - his ask was «يذهب بي
  إلى الجهاز ويعدّل العملية من هناك»; the same dialog without leaving the page.
- **👥 Clients page order + device cards** (his Oct 2026 request): customers are ordered by their
  latest activity - the newest of the customer edited, an operation on one of his devices, a store
  invoice, a manual balance entry (`lib/clientActivity.ts`); suppliers keep «who owes first, then
  by name». In a customer's «الأجهزة», tapping a device shows its full home-page card in place of
  the list (`ClientDeviceCard`, «→ كل أجهزته» back); actions needing the home page's dialogs (edit,
  payment, statement, archive…) open that device on the home page (`/?q=<email>`).
- **💱 «فرق غير مسجّل» is never just the exchange rate** (his Oct 2026 report: a D of ARS 54,876
  locked at $38.53, the same ARS bill read at $39.94 → «فرق 1.41 $ غير مسجّل»; «لا أريد أن تظهر هذه
  الزيادات… أضفه للعملية السابقة»). An open D in the bill's own currency counts at today's rate
  (`previousDebt.openDebtUsdToday`); while a D is open, a gap counts only when it's a new bill (over
  25% of the open D and at least $5, `unrecordedGapUsd`) - a smaller drift is part of that D and is
  paid at its real amount when the D is settled (the settle dialog takes what was actually paid).
- **📋 The rep's copy was sent by hand** (his choice «لا، أرسلها بيدي»; since Oct 17 2026 it also goes out by itself
  10 minutes after the last change - see «⏰ مزامنات مجدولة»). Devices he
  gives a rep (or links) reach the rep's phone only with the next «📤 إرسال نسخته». Each sent copy
  records which devices / customers it held (`starnet.repCopySentDevices`); the rep card then shows
  «⚠️ نسخته قديمة: X جهاز لم يصله · Y تغيّر زبونه · Z لم يعد له» (`repCopy.copyGaps`), a tap opens the
  send panel. Shown only after the first copy sent with this version.
- **📥 «استيراد زبائن من ملف»** (clients page, his Oct 2026 request: a list exported from «مدونة
  الحسابات» as PDF - 51 customers). His choices: a name that looks like an existing customer is
  **skipped automatically** (`findExistingClient`: letters folded, «ولد/بن» dropped, «سالم ولد
  الأمين» = «سالم الأمين» - example names; one shared word alone never matches); each balance becomes an **opening
  balance in أوقية, money didn't move, dated with the file's own date** («عليه» = owesUs, «له» =
  weOwe); **a ready file I send him** (JSON `{kind:"starnet-clients-import", rows}` made from his PDF
  in the session - never committed: customers' names stay out of the repo). The parser also takes
  plain «date له/عليه amount name» lines. A summary (count, totals, skipped, list) before saving;
  «↩️ تراجع عن آخر استيراد» (delete code) removes the batch (`starnet_client_import_v1`), keeping a
  customer who got anything since. Logic `lib/clientImport.ts`, UI `components/ClientImport.tsx`.
- **🆕 «ما الجديد» - a guided tour after every update** (his Oct 2026 request and choices: «جولة
  خطوة بخطوة»، «تلقائيًا مرة واحدة + زر لإعادتها»، «كل تغيير تراه في الشاشة»). Each step opens the
  page, lights up the changed place and shows «كان: … / الآن: …» with «موافق» (next) / «تخطي الجولة».
  Plays once by itself after an update (the newest unseen updates, at most 3; on the feature's very
  first run only the newest), never in a rep's app; Settings → «🆕 ما الجديد» → «▶️ شاهد» replays any.
  Seen ids per phone in `starnet.whatsNewSeen` (not backed up). Logic `lib/whatsNew.ts` (WHATS_NEW,
  newest first), UI `components/WhatsNewTour.tsx` (mounted in the layout) + `WhatsNewSection.tsx`.
- **An app holds only its own currency** (his Oct 2026 rule: «بنكيلي فقط أوقية»): a customer's device
  payment lands in its method's app only when the currencies match (`devicePaymentAccountId`). A
  payment in another currency (a SIFA payment left on the default «بنكيلي» showed «13,500 سيفا» in
  بنكيلي) goes to **«💵 كاش سيفا»** (`cashWallet`, his choice), or stays in الكاش when no cash wallet
  exists in that currency. An account whose balance was never typed counts every routed payment
  (`countsFrom`). The forms only offer apps in the chosen currency («إضافة رصيد»), and a card
  charge/withdraw through an app is in that app's currency.
- **Oct 12 2026 - his rule wins over everything below:** «زر تصفير الارباح لا يمس من المندوب ابدا ولا
  علاقة له بالأجهزة وخاصة الأجهزة التي عليها D … هو فقط يصفر البنوك والكاش». The «حسابي» button is now
  «🔄 تصفير الكاش والبنوك والمحافظ إلى 0»: الكاش, every bank/wallet and KAST to 0 - it no longer starts the
  profits, and its «↩️ إرجاع الكاش والبنوك كما كانت» undoes only those corrections. `startProfitFresh`
  (الإعدادات «بداية جديدة للأرباح», التقارير) never touches the representatives any more: no rep reset,
  `previousRepResets` empty (undoing an older reset that did restart them still restores them). A rep's
  own «تصفير» stays on the representatives page. Devices and D are never touched by any of them.
- **«🔄 البداية من جديد» is ONE permanent button** (his Oct 2026 rule - it used to vanish after one
  press): every press starts profits & losses from today **and** brings الكاش, every bank/wallet
  (`zeroAccountsBalances`, adjustments tagged `fromReset`) and **the KAST card** (`zeroCardBalance`,
  a `via:"reset"` card movement - not a مصروف) to 0. Debts stay: customers, suppliers, D, reps.
  «↩️ إرجاع كل شيء كما كان» undoes every press at once. «💵 إرجاع الكاش إلى 0 فقط» stays.
  (The older wording below is the history of this section.)
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
    `listStandaloneCashEntries` skips it); banks, wallets and all debts stay untouched. The button is
    **always available** (his Oct 2026 note: «أريد تصفير في أي وقت») - each press offsets the current
    balance to 0 again; «↩️ تراجع عن تصفير الكاش» (`undoCashReset`, removes every reset entry) shows
    **in addition** whenever a reset stands (`hasCashReset`). Both behind the delete code.
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
  suggestion in his «نيتا النيجر» account; `F CFA` = فرانك (÷5 = سيفا, Oct 2026 - see «أورانج / نيتا»).
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
  card on the phone). **His rule: the DNI/CUIT box always gets «madrid02» instead of a passport**
  (`DEFAULT_TAX_ID`; prefilled in the form, used when a card has no value; a value typed on a card
  wins). He insisted after being told DNI is a national id, not a city. **His choices:** kept on the phone **and in the encrypted backup** (`starnet_card_fill_v1`),
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

## 📤 «نسخ الجلسة»: a device's session out to Chrome (Oct 14 2026)

- His ask «كيف أصدّر الجلسة من جهاز في التطبيق إلى متصفح آخر، كروم مثلاً»; his choice «زر 📤 نسخ الجلسة». The card's
  «⋯» → «📤 نسخ الجلسة (لمتصفح آخر)» (`CopySessionSheet`): reads that device's cookies (`exportAccountSessions`),
  turns them into Cookie-Editor JSON (`toCookieEditorJson` - starlink.com only, a year long, secure) and copies it
  (fallback: a read-only box to copy by hand). In Chrome on a computer (or Kiwi / Firefox on a phone - Chrome on
  Android has no add-ons): Cookie-Editor → Import → paste → refresh. Never logged or stored; a warning says whoever
  has it is inside the account.
- His test the same day: the first copy worked in the other browser, then the device in the app was signed out too.
  I first blamed Starlink's key rotation and warned «one place only»; **he corrected it: «أريده أن ينتسخ لا ينقل» -
  sessions he copied from his old phone to the new one still work on the old phone.** So copying must keep both
  signed in. The difference was ours: the export wrote a host-only copy of each cookie per address (starlink.com,
  www, api, auth); Starlink's renewed sign-in cookie is site-wide, so the stale copies kept being sent beside it and
  the account was signed out everywhere. Now `toCookieEditorJson` lays cookies out like the phone-to-phone restore
  (`CookieStringUtil.buildRestoreCookies`): a cookie read at starlink.com is one `.starlink.com` cookie, its copies on
  sub-addresses are dropped. His pasted copy (old build) confirmed the shape: the sign-in is ASP.NET cookies -
  `Starlink.Com.Sso` + `Starlink.Com.Access.V1` = "chunks-N" with the ticket split into `…V1C1`, `…V1C2` - each
  repeated host-only on starlink.com, www, api and auth. When Starlink re-issues the ticket (possibly in a different
  number of chunks, site-wide), stale per-host chunks mix with the new ones and the ticket no longer reads. The sheet says: Cookie-Editor «Delete All» before Import, never re-paste an old copy,
  never «Sign out» in the other browser (one session - it signs the app out too).

## ⏸ Starlink's 429 + every sync in «المزامنة التلقائية» (Oct 17 2026)

- His report: a device browser showed Starlink's raw «Error 429 Too many requests» (Varnish). I found the 🌙 background
  run (BackgroundSyncService/SyncRunner) and the visible «مزامنة الآن» chain had no pacing (1 s gaps) and kept going
  after a 429. His «اوك اجعلها»: both now pause between devices (10-16 s / 10 s) and stop at the first 429 for the
  20-minute cooldown (`SyncPacing`), the rest reported «⏸ ستارلينك طلبت التمهّل (429)» + `RATE_LIMIT_NOTE`; an
  auto-sync started during the cooldown is skipped at once. The manual browser's toast now says 15-20 minutes.
- His ask «كل أنواع المزامنة في الإعدادات في مكان اسمه المزامنة التلقائية»: a settings group «🔄 المزامنة التلقائية»
  (`sync`): تحديث الأجهزة من Starlink (+ the 429 protection text), 🌙 المزامنة في الخلفية (its own fold now), ☁️ الربط
  الحيّ مع المندوبين (moved from البوتات). «الأجهزة» keeps the sessions check and the renewal-day lock.
- «أضف فيها أكثر من المزامنات التي عندنا - فقط اقترح وأنا أقرر»: proposals only, nothing built until he picks.

## ⏰ «مزامنات مجدولة» - what he picked (Oct 17 2026)

- He picked 5 of my proposals: 🌅 صباح أجهزة اليوم، 💳 فحص الدفع بعد التجديد، 🔁 إعادة المحاولة بعد 429، 📤 نسخة
  المندوب تلقائيًا، 🌙 ملخص آخر الليل (not: weekly travel check, weekly rep statement). All **on by default**, each with
  its own switch in settings → 🔄 المزامنة التلقائية → «⏰ مزامنات مجدولة» (`starnet.scheduledSyncs`, not backed up;
  `lib/scheduledSyncs.ts` pushes it to the phone on every start). Native: `ScheduledSyncWorker` (WorkManager, re-arms
  itself daily), `ScheduledSyncPlan` / `ScheduledSyncText` (pure, JUnit), `ScheduledSyncStore`.
- 🌅 **His hour: 8:00** («8:00 صباحًا», choice 5-10). The devices renewing today and tomorrow (full date, the later of the
  app's date and the last read). A faulty device or a limited (non-main) email is never scheduled (`limited` in the
  auto-sync list). Runs in the 🌙 background sync (BackgroundSyncService) whatever the «المزامنة في الخلفية» switch -
  it's the only way the page draws with no screen; it needs «الظهور فوق التطبيقات» (a scheduled start shows a
  1-pixel overlay for Android 15). Without the permission: a notification + bot line, nothing lost.
- 💳 In the same 8:00 run, first: yesterday's renewals (date = yesterday, or already next month on the same day). A full
  sync; its own bot report «💳 فحص الدفع بعد التجديد»: ⛔ لم يُدفع (stopped, or Billing's balance due > 0) first, ❔ not
  known, ✓ تمّ الدفع (active, nothing due).
- 🔁 After a 429 (background run, morning run or the visible «مزامنة الآن» chain), the refused device and every one
  not opened yet sync by themselves in the background after 21 minutes (cooldown + 1); at most 2 retries in a row,
  then «أعد مزامنة الآن لاحقًا»; a run Starlink lets through resets the count. The report says «🔁 سأكمل … بعد 21 دقيقة».
- 🌙 **A separate message** (his choice, not inside «🌙 ملخص اليوم»), default 11:00 ليلًا: today's syncs by each
  device's last try (✓ count, 🔑 signed out, ⚠️ not read, ⏸ 429) + the devices stopped now. Log: every
  `AutoSyncResults.record` also goes to today's log. No bot → a phone notification.
- 📤 **The rep's copy now goes out by itself** - this replaces his earlier «لا، أرسلها بيدي». His timing: **10 minutes
  after the last change** to that rep's devices (a new device, a customer changed, one taken back = `copyGaps`), one
  file, only through the reps bot to a rep whose phone is linked (never the share sheet), only after a first copy was
  sent by hand; a failed send waits 30 minutes. Runs while the app is open (`RepCopyAutoRunner`, `lib/repCopyAuto.ts`);
  he hears «📤 أُرسلت نسخة X وحدها». The «⚠️ نسخته قديمة» warning and the manual «📤 إرسال نسخته» stay.

## 🔵 More home circles + 🔍 a check on every circle (Oct 17 2026, «سأنام… طبّق فقط»)

- His list: «غير ملغي، ملغي، تم تجديد، SIS، ROM، 100G، المندوب كل مندوب أيقونة خاص به» next to «الأجهزة / متصلة
  الآن». Added in the first row of circles (`lib/deviceRings.ts`): ملغي = an end date set or the service ended
  (`isCanceledDevice`; SIS is not ملغي), غير ملغي = the rest, تم تجديد = **a renewal recorded today**
  (`renewedOn`, lib/renewals.ts's rule), SIS / ROM / 100G = the card's plan pill (`planRing`; 50G is not 100G), one
  circle per rep who has devices, in his color; «مكرر» when a device is registered twice.
- «كل الأزرار حتى السابقة فيها الفحص… الضغط المطوّل: 1 فحص، 2 فحص في الخلفية»: **every** home circle has a long
  press (`RingActionsSheet`): 🔍 فحص (the visible chain) / 🌙 فحص في الخلفية (BackgroundSyncService, whatever the
  background switch). «فحص فقط إن كان الجهاز ملغي»: the sync walk is the same, the **report** answers only that
  circle's question (`ringCheckReport`: yes now, changed since the start, not checked) on the bot + notification.
  «تحتاج توثيق» runs the travel check (Home only) with its own report. Faulty / limited emails stay out, except in
  the «المعطلة» circle itself.
- «مكان لإزالة المكرر مثل إزالة مضاف من قبل المندوب»: «مكرر» → «🔗 دمج كل المكرر» (header button + long press):
  each pair merged (lib/deviceMerge.ts) into the device kept - his own over a rep's, then more operations, then
  the older; the duplicate goes to the trash (restorable). The «من المندوبين» long press also has «✕ إزالة علامة
  المندوب عن الكل».

## 🫧 The service NOW ← AFTER this month, instead of «✅ نشط» (Oct 17 2026)

- He explained it screenshot by screenshot, I wrote the table back and he approved («نعم، ابدأ»).
  Services: **ROM** = «Roam - Unlimited» (تجوال غير محدود), **100G** = «Roam - 100GB», **SIS** = «Standby Mode»
  (وضع الاستعداد، إنترنت ضعيف), **STOP** = stopped. Badge + banner → [now] ← [after the month]:
  Active → X ← X; «Standby Mode Pending» + «will switch to Standby Mode on …» → X ← SIS (date); «Ending …» /
  «scheduled to end on …» → X ← STOP (date); SIS + Standby Mode → SIS ← SIS; SIS + Ending → SIS ← STOP;
  «Inactive» (after the end) → STOP ← STOP. **A SIS device never goes back to ROM or 100G.** Suspended for
  billing keeps its plan in the bubble and the red «موقوف» stays. The second bubble always shows.
- His choices: English words in colors (ROM blue, 100G violet, SIS yellow, STOP red); the bubbles replace
  «✅ نشط» and the old plan pill (a priority-data warning pill stays); new home circles «← SIS» / «← STOP»
  (with the long-press check). The SIS/ROM/100G circles count the service NOW. `lib/serviceBubbles.ts`.
- Real misreads found from his screenshots: «Inactive» contains «active» and was read as active (now
  STOP); «Roam - Unlimited» wasn't recognized as ROM (only «Roaming»); the travel banner «…your plan's travel
  allowance…» was saved as the plan name. A plain plan card (Active / Standby Mode, no banner) now clears an
  older end / switch date (`planChangePending: false`) - «Keep Current Service» / «Resume» pressed.
- His first try («غير جيد لم تظهرهم»): an «Ending» device still showed «نشط» + «Ending ٢٠٢٦/١١/١١» as its plan -
  the reader had taken the badge for the plan name. Fixed in the reader (`isPlanDateBadge`) and the app never
  shows such a stored «plan» (`cleanPlanName`); the bubbles appear after that device's next sync.
- «ملغى لماذا هنا»: the red «ملغى» chip is hidden when the bubbles show (STOP + date says it); «🛑 إلغاء الاشتراك» stays
  in the card's ⋯ menu.
- «موقوف بسبب الفاتورة … يظهر مفعّل بـ Rom- factur»: a device suspended for billing shows «ROM - FACTUR» (or
  «100G - FACTUR») in orange as its first bubble; the second bubble and the red «موقوف» stay.
- «أزل أيقونة صورة الشخص (ش ح)»: the initials circle at the top of every card is gone; the top row now wraps
  so the name never gets squeezed by the chips.
- «تكرار الأجهزة يمكن إزالته - إزالة كلمة تكرار»: «✕» beside «⚠️ مكرّر · دمج» = two different devices -
  both remember it (`notDuplicateOf`, backed up) and the pair is never a twin again; the «مكرر» circle and its
  list header also have «✕ إزالة العلامة عن الكل». Nothing is merged or deleted.

## 🆕 «إنشاء حساب جديد» - his field order (Oct 17 2026)

- His order: 1 اسم الحساب الكامل (typed - required; Starlink's first + family name) · 2 رقم الهاتف · 3 KIT أو SN ·
  4 كود الواي فاي (new here, kept as `wifiPassword`) · 5 البريد الجديد · 6 كود البريد · 7 الزبون - **optional** («غير
  مهم، فقط إن أضفناه يُسجَّل عليه الجهاز»; picking him fills an empty name and phone) · 8 المندوب. His list skipped 6:
  the new email's address sits there, next to its code. Next step he announced: «طريقة إنشاء الإيميل».
- ✉️ The new email from the name (his choices): **«ahmed.salem» + 3 digits @outlook.com** - first and last name in
  Latin (common names written his market's way: محمد→mohamed, الشيخ→cheikh, ولد/بنت dropped; others letter by
  letter), filled by itself while the field is empty or still holds the last suggestion, «🔄 اقتراح آخر» for
  new digits; the code is suggested too (10 characters: capital, lower, 3 digits, a symbol; no look-alikes),
  «🔄» for another. What he types himself is never replaced. `lib/emailSuggest.ts`.
- Automating Microsoft's signup page by page (pressing its buttons, its «Press and hold» human check) was declined:
  it is automated account creation that Microsoft forbids. Filling the fields stays; he presses the buttons.
- 📮 **«بريد على نطاقي»** (his choice instead): his own domain with catch-all forwarding (e.g. Cloudflare Email
  Routing) to the «بريد الرموز» Gmail. Settings → عام → «📮 بريد على نطاقي» (`starnet.mailDomain`, pushed to the
  phone: `ForwardedMail.java`). «إنشاء حساب جديد» then offers «📮 @domain» / «📧 أوتلوك» (domain by default): the
  address is suggested on the domain, no mailbox code, and «إنشاء» opens «تفعيل Starlink» at once. A Starlink
  code for such a device is read from «بريد الرموز» with `to:<its address>` (never another device's code). Warned:
  renew the domain for years - if it lapses every device's mail stops; the addresses receive only. Try one
  device first (Starlink accepting a custom domain wasn't tested here).
- His setup (Oct 17 2026): domain **starnet-om.com** bought on Cloudflare (registrant email starnet.om@gmail.com),
  Email Routing + catch-all to **starnet.om@gmail.com** - a test message arrived. The Gmail «Never send to Spam»
  filter was too hard for him on the phone, so instead the app's Starlink-code search also looks in Spam
  (`includeSpamTrash=true` on `GmailCodes.starlinkListUrl*`; Microsoft/payment searches unchanged).
- 🔑 **Password patterns** (his Oct 17 2026 choice, «اجعل كل كلمات مرور حساباتي على نوع واحد … مثل star net om»):
  the account's code = **«StarNetOm#» + 4 digits of its own** (warned: the addresses are guessable, so one code
  for all would let a customer open others' accounts - he took the per-device digits); the **Wi-Fi code is the
  same on every dish** (his choice; he then fixed his own code). The repo is public, so the code is **never in
  the source**: he types it once and taps «📌 اجعله ثابتًا» (`starnet.wifiDefault`, phone-only, lib/wifiDefault.ts). New accounts only - existing devices keep theirs. In «إنشاء حساب
  جديد» both are filled by themselves (editable); the code is saved as the device's Starlink password
  (`starlinkPassword`) too, and on his domain the field reads «كلمة مرور Starlink» (required, 8+).
  He asked «كود الإيميل ما فائدته والإيميل لا يعمل أساسًا»: on his domain the email has no password at all - the
  field is only Starlink's account password (a note under it says so).

## ✨ Card polish he chose (Oct 17 2026, «ماذا تقترح لتجميل البطاقة»)

- Picked: the date + days in one pill («📌 2026/11/07 · 20 يومًا»); the email once (a device named by its email
  has no email pill - tapping the name copies it); Starlink's bill once when it equals what's unpaid to
  Starlink («USD 5.77 · غير مدفوع»); small dish / Wi-Fi pills side by side; **one row of buttons** (فتح الحساب ·
  دفعة · تجديد · ⋯) with «📧 البريد» / Gmail moved into ⋯; the second bubble faded (dashed) when nothing
  changes; a colored edge by the service now (ROM blue, 100G violet, SIS yellow, STOP red, FACTUR orange).
- His own addition: devices named by the time («📋 جهاز جديد 13:11» - a pasted session) take their email as
  their name once it's known (`lib/placeholderName.ts`, on load and in the sync merge); a typed name never changes.

## 🔑 A rep's permissions, chosen before each copy (Oct 17 2026)

- His ask: «أي مندوب سأرسل له نسخة، قبل الإرسال تأتيني قائمة بالصلاحيات… ما عنده الآن كلها عليها صح والأخرى لا… زر
  البحث عن أي ميزة، والميزات مفروزة». «📤 إرسال نسخته» now opens `RepPermissionsSheet`: features by group (📄 الصفحات،
  🛰️ الأجهزة، 🔄 المزامنة، 🔔 الإشعارات، 💾 البيانات والأمان), A-Z inside each, a search (Arabic folded), ➕/➖ what
  changes, then «📤 أرسل نسخته بهذه الصلاحيات». Saved on the rep (`Representative.permissions`, kept by
  `saveRepresentativeStore` against older screens) and carried in the copy (`RepCopy.permissions`).
- A rep with no list = the base list = exactly what every rep had (home, clients, تقاريري, reminders, tools,
  reports, currencies, mailboxes, settings, add device, send devices, sync now, background sync, scheduled syncs,
  summaries, business profile, lock). Extra, off until ticked: 🛍️ المتجر، 💳 ستارلينك والبطاقة، 💰 حسابي (on his data
  only), الأرشيف، السلة، 💾 النسخ الاحتياطي on his phone. Home, settings and the app lock are always on.
- On his phone (`repCan`, `isRepAllowedPath`): the page guard, the bottom tabs and both «المزيد» menus, the rep
  settings sections, the background sync and the scheduled syncs follow the list. Automatic copies carry the
  last list chosen.

## 📝 The rep can paste his copy's text (Oct 17 2026)

- His ask «اجعل للمندوب مكان يضيف فيه نسخه». Until now the rep's «📋 أجهزتي» only opened a copy file (from Telegram
  or picked). Now «📝 أو الصق نص النسخة هنا» (`RepCopyView`): a text box + «➕ أضف النسخة» → the same
  `applyRepCopyText` (format check, the rep's code, «أقدم من التي عندك» refusal, sessions) as a file. Nothing new is
  stored or sent; the paste only replaces the file pick.

## 🔐 «تفعيل التطبيق»: every installed copy needs his code once (Oct 16 2026)

- His ask: «أي نسخة من التطبيق تنزل تكون محمية بكود ولا يمكن اختراقه، لكي عندما يأخذ أحد نسخة من التطبيق لا يمكنه
  تشغيله». His choices: asked **once after installing** (or after the app's data is cleared; updates don't ask);
  on a **rep's phone he types the code himself** (the rep never learns it). The code is HIS - never write it in the
  repo, a test, a commit or a log.
- `ActivationGate` wraps the whole layout (even TelegramBridge / shortcuts) on the phone app only (the web demo has
  demo data). `lib/appActivation.ts` holds only a random salt + SHA-256(PBKDF2-SHA256(code, salt, 210,000)); typing
  the right code keeps the PBKDF2 proof on the phone (`starnet.activation`, not in backups → a restored / copied
  phone asks again) and each open re-checks it, so the flag can't be set by hand without the code. 5 wrong guesses
  → 30 s, 1 m, 2 m … 30 m wait. To change the code: derive a new salt/check (node crypto, the code only in an env
  var) and replace `ACTIVATION` - every phone then asks once.
- Told him honestly: this stops anyone who installs a copy; an expert who takes the APK apart could still remove a
  check that lives in the app (no protection inside an app is unbreakable).

## 📊 The reports page, simpler (Oct 16 2026)

- His words: «مكان التقارير صار أسوأ، وفيه الكثير ومختلط جدًا». His choices: first thing = «ربحي هذا الشهر»; keep
  «الصافي + ستارلينك»، «الديون»، «المصروفات» (not «المتجر»); «اليوم» out of the reports.
- Tabs now: «💰 ربح الشهر» (default) · ستارلينك · الديون · المصروفات. ربح الشهر = month chips, the big figure, «من
  أين جاء الصافي» right under it, then folded (`report-fold`): the month's Starlink shipments (N), ⏳ D expected,
  the expenses by type (N); then the 6-month chart. The «المتجر» tab is gone (the store page has its own
  StoreReportsSection; store profit still counts in ربح الشهر); a saved «store» tab falls back to ربح الشهر.
  TodayPanel and the «الملخص صار في حسابي» note were removed from the reports.

## 💳 The card's «D» navigates in place (Oct 16 2026)

- His report: «D عندما أضغطها لا تعمل، فقط يخرجني من التطبيق». The D (Oct 14) opened `/starlink?pay=<id>` with
  `window.location.assign` - a full page load, the only one to that page (every other way is a Next `Link`). In the
  Capacitor app that threw him out. Now `router.push("/starlink")` and the D to pay is handed over in sessionStorage
  (`lib/payDeepLink.ts`: `rememberPayTarget` / `takePayTarget`, read once; `?pay=` still honoured). The card's
  fallback (no open D) uses the router too. Rule: inside the app never navigate with `location.assign` / `href =` to
  an app page - use `Link` / `router.push`.

## 📧 Backups carry each device's mailbox session too (Oct 14 2026)

- He asked «هل في الجلسة كودات الإيميل أو الواي فاي؟» (no: a Starlink session is cookies only - the sign-in
  ticket, the account number, language, analytics; the Starlink/mail/Wi-Fi passwords live in the device record,
  which the full backup carries). I told him the backup kept the Starlink session but not the device's
  📧 mailbox (Outlook inside the app); his choice «نعم أضف جلسة البريد للنسخة الاحتياطية».
- Every backup (settings export, the daily automatic one, Drive) now calls `exportAccountSessions(ids, true)`:
  the mailbox goes in under `mail:<deviceId>` (the native MAIL_SESSION_PREFIX), and the restore already puts it
  back in the device's mail profile and marks it signed in. Messages count both: «N جلسة دخول، M بريد»
  (`countSessions` / `sessionCountWords` in `accountBackup.ts`); the "devices without a session" warning counts
  Starlink sessions only.
- A restored session is only as fresh as the backup: an old backup's sessions may already be dead at Starlink
  (his Oct 13 backup restored on another phone came back signed out) - after a restore, sign in where needed and
  make a new backup.

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
- 📱 Oct 13 2026, his «الصورة التي أرسلها للزبون ليست واضحة دائمًا»: WhatsApp shrinks a tall picture (longest side
  ≈1600px), so 15 operations blurred the text. His choice «صورة واحدة أقصر»: the image shows the last 8 operations
  (`IMAGE_STATEMENT_ROWS`), every text ×1.3 and grey text darker (`sharpenForImage`, image only - the PDF is unchanged
  and still has every operation).
- Client statement: invoice-style image (last 8 operations) + PDF (all), with payment methods,
  small WhatsApp QR codes for both numbers and his email - `lib/statementDocument.ts`; contact
  defaults `DEFAULT_CONTACT` in `lib/pdfDocument.ts`, editable in settings «بيانات النشاط».
- **🟠 The فرانك line for customers** (his «نعم أضف سطر الفرانك في رسائل الزبائن», Oct 2026): a customer
  who owes سيفا gets, under the payment lines of the debt reminder, «🟠 بأورانج موني / نيتا تُدفع
  بالفرانك: 10,000 سيفا = 50,000 فرانك» (`francPayLine`); the WhatsApp statement shows «• عليه 10,000
  سيفا (🟠 بأورانج / نيتا: 50,000 فرانك)», the statement image / PDF has the same line under «💳 طرق
  الدفع المتاحة» (`contactBlockHtml`), and a payment by أورانج / نيتا reads «أورانج موني · 🟠 10,000
  فرانك» in statements and the receipt (`methodLabel`). No line when nothing is owed in سيفا.

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
- **Reps bots: several phones per rep** (Oct 2026, «بوت المندوب حسين اريد ربط فيه هاتفين»): linking
  another Telegram account to a rep ADDS a phone (never replaces). News/alerts/approvals/copy/month
  statement go to every phone; a direct answer (search, hints, session steps) only to the phone that
  asked. Each phone has its own «فك الربط». Logic: `lib/repChatLinks.ts`; native map chatId → repId.

## 💳 Cards ↔ devices (Oct 2026)

- Each registered card («بطاقاتي (KAST)») lists its devices (device `paymentCardLast4`, read from
  Starlink's Billing → Payment Method or chosen in the device dialog) and has «📄 الكشف»: its devices,
  the D's paid for them by month, its pending KAST notices (`lib/cardDevices.ts`).
- A device billed to a card he didn't register: warning in the cards section + «💳 •XXXX غير مسجّلة» on
  the device card. A KAST payment matches a same-card D within **2%** (his example: 100$ ← 98-102$).
- A KAST payment's suggested device can be wrong (two devices, same price): «✏️ جهاز آخر» lists every
  open D (same card first, then nearest amount) with a search (name, customer, phone, KIT) - his pick
  settles that D (`rankAllSpend` in `lib/kastCards.ts`).
- The pending KAST notices fold under one line «📩 إشعارات KAST تنتظر (N)», rows smaller.

## 📅 Renewal calendar (home «التجديد حسب اليوم»)

- Days **1-28 only** (his Oct 2026 rule). In place of 29-31: ❓ unknown date (synced, no valid date),
  ⏳ never synced, 👤 faulty «إيميل غير رئيسي», 🔥 faulty «محروق» - each opens its devices
  (`lib/dayBuckets.ts`). Day 28 stays a normal day (his choice).

## 🛂 Travel registration («كشف توثيق», Oct 2026)

- Starlink's Home banner «Complete Travel Registration by October 15 … disabled outside your home
  country». His choices: «🛂 كشف توثيق» in the day's long-press menu runs **device by device in front
  of him** (visible browser, Home only - `autoSyncHomeOnly`; its reads are `checkOnly` and change
  nothing but the notice, not even the sync time); then **one** bot message lists the devices that
  need it (name, email, phone, deadline) with a WhatsApp button each; the customer text is his
  **strong** wording («وإلا سيُغلق الحساب وتتوقف الخدمة»); every sync also puts a 🛂 banner on the
  card, cleared when Home no longer shows it. Logic: `lib/travelRegistration.ts`.
- His follow-up: the day's «🔄 تحديث» and «🛂 كشف توثيق» ask whose devices first - «الكل», «🏠 أجهزتي»
  (no rep) or one rep's (`dayOwnerGroups` in `lib/dayActions.ts`); with one group only (e.g. the
  rep's own app) they run at once. The result also opens in the app (TravelCheckSheet, WhatsApp
  buttons) - the rep's app has no bot.
- Many rep devices are in **French**: the check reads them as they are (no language switch) and
  waits for Home to load on a slow phone (his report: «يخرج بسرعة ويكتب لم يتم العثور»).
- His Oct 9 request («اجعل زر كشف الأجهزة الموثق يعمل في الخلفية… وتأكد أنه يعمل جيد… وفي زر كل
  الأجهزة»): with «🌙 المزامنة في الخلفية» on, every «🛂 كشف توثيق» (a day, a card's «🔄 تحقق الآن», all
  devices) runs in the background service - the same Home-only read, nothing else changes. New
  «🛂 كشف توثيق كل الأجهزة» in «🔄 مزامنة الآن»: every device except the faulty ones (متعطل / محروق…) and
  the non-main emails (= the «كل الأجهزة» sync set). No errors rule: a device counts as checked only
  when Home really said it (its account line or the banner); signed out / stuck / closed / page never
  loaded = «لم يُفحص» in the report, never «لا يحتاج». The bot and the phone notification get the
  report at the end; the app shows it with the WhatsApp buttons when opened (`starnet.travelBgRun`).

## 🔔 Notifications stay (Oct 2026)

- His rule «أي إشعار يأتي يبقى هناك ولا يُمحى» - his choice «الاثنان معًا»: the phone's notification no
  longer disappears when tapped (only when swiped), and every app event is also kept natively
  (`AppEventLog.java`, even with the app closed / notifications off) and copied into the app's 🔔
  list (top of home, unread badge), which only he empties (🗑 per item / «مسح الكل»). Phone-only
  (`starnet.eventLog`). Logic: `lib/eventLog.ts`.
- 🛂 «تحتاج توثيق (N)» chip on home (his choice): every device still showing the banner, any time,
  with WhatsApp; no number → WhatsApp opens on the message and he picks the contact; «✓ أُرسل»
  marks (`starnet.travelSent`, phone-only).
- His follow-up: its own button «🛂 الأجهزة التي تحتاج توثيق (N)» under the home shortcuts (the chip
  is gone) - copies only, devices stay in place. He registers the reps' devices himself: «✅ اكتمل»
  stores `travelRegistrationDoneFor` (= the deadline) so the device leaves the list and the card
  banner until Starlink asks again with another date, and its rep gets «✅ تم توثيق جهاز…» on the
  reps bot.
- **Redesign (Oct 7, his choices)**: no separate list - two chips beside «المعطلة»: «🛂 تحتاج توثيق (N)»
  and «✅ تم توثيقها (N)», each filtering the home device cards. The card's travel strip has «💬 واتساب»
  / «✅ تم التوثيق»; after «تم التوثيق» the device STAYS («⏳ بانتظار التأكيد», «🔄 تحقق الآن» = Home-only
  read of that device, «↩️ لم يتم»), and the rep is told at once (his choice). It moves to «تم توثيقها»
  only when a Home read finds the banner gone (`travelRegistrationVerifiedAt`, set by the merge).
  There «💰 السعر» records what he charged (`travelRegistrationPrice`), and the top line sums it per
  currency. *Changed Oct 9 2026* («اجعل عندما اضيف سعر علي الاجهزة الموثقة ان يطلع علي صاحب الجهاز
  دين من توثيق الجهاز وان ارسل له كشفه بعد العملية»): saving the price also posts «عليه 🛂 توثيق
  السفر» on the device's ledger, so it lands on the device's owner (his customer, or the rep's book
  for a rep's device) - linked to that registration (`LedgerEntry.travelFeeFor` = its deadline),
  changed with the price, removed by «حذف السعر»; a later registration gets its own debt. It is a
  debt, **not a renewal**: no Starlink cost, no D, no profit, no rep commission, not counted as a
  shipment (`isShipmentEntry`). The price sheet defaults to the owner's currency and warns on
  another one. After saving, «💬 أرسل له كشفه» opens WhatsApp with the device statement (no number →
  he picks the contact). Not the cash (no money came in yet). Logic: `applyTravelFee`.
- **«✅ تم توثيقها» as circles (Oct 9, his choices)**: six circles - الكل · 🏠 أجهزتي · 👥 المندوبين (then
  one chip per rep) · 💰 بلا سعر · 🧾 لم يُدفع (its debt not fully paid) · 📈 ربحي (sheet with the split) -
  each filters the cards; money per currency, one line each («حصلنا» no longer glued). A rep gets his
  **own travel percent** («⚙️ النسبة», `Representative.travelPercent`, not his renewal percent), of the
  price, **no cost** (his choice «بلا تكلفة»): locked on each price when saved (`repId`/`repPercent`
  on `travelRegistrationPrice`); setting it locks it on his priced devices that have none yet, the
  locked ones keep theirs. Per rep: his devices' total, his share, mine, and «💬 كشفه» (WhatsApp
  statement by Starlink email). Prices saved before they became debts can be posted in one tap
  («سجّل الدين عليهم» under 🧾). Logic: `lib/travelBook.ts`.
- The customer's WhatsApp message names the device by its **Starlink email**, not his internal device
  name («الإيميل أهم شيء في الرسالة»); the name only when there's no email.
- «اجعل هناك فارق»: the list is split - «🏠 أجهزتي» first, then each rep's devices under his name
  (`groupTravelByOwner`).

## 📇 Device card taps (Oct 2026)

- His request: one tap opens the full card (and closes it); holding still works; 2 quick taps =
  payment, 3 = edit (unchanged). Tapping the email at the top of the card copies it («✓ نُسخ»).
  Logic: `lib/cardGestures.ts`.

## 👤 Devices without a customer (home chip)

- His request (Oct 2026): a «👤 بدون زبون (N)» chip next to «المعطلة» / «قيد الإصلاح»; tapping it
  lists them with a row «الكل / 🏠 أجهزتي / 📱 <each rep>». «Without a customer» = no client, or its
  client was deleted; «mine» = no representative. Logic: `lib/noClientDevices.ts`.

## 📌 Locked renewal day

- His rule (Oct 2026): a device's renewal day never moves («ينتهي يوم 10 … شهر 11 يوم 10») except when
  it moves to another country (rare). His choices: a button per device (tap the card's 📅 date) **and**
  one «📌 ثبّت يوم التجديد لكل الأجهزة» in Settings → الأجهزة والتحديث; on a different read: a mark on
  the card with «اقبل اليوم الجديد (نُقل لدولة أخرى)» / «تجاهل», plus the sync result line.
  Logic: `lib/renewalDayLock.ts`, merge in `starlinkSync.ts`.

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

## Big ideas go to the council first

- Oct 2026, his choice after reading about «Claude Council»: a big idea / plan / direction is put to
  the `council` skill (5 advisors → blind peer review → chairman's verdict, an Arabic HTML report)
  before anything is built. First council: «خطة تطوير التطبيق» (6 Oct 2026) - verdict: two weeks of
  stabilizing and using what exists, only money-leak protections (losing-margin devices, KAST need
  for the next 7 days), Firebase with one rep, then easier rep onboarding; first step: restore a
  full backup on another phone. **He accepted it (6 Oct 2026)**: two weeks with no new feature areas -
  only fixes of what bothers him + the two money alerts.

## 🛰️ «ستارلينك والبطاقة» page layout

- **Four icons at the top instead of one long page** (his Oct 2026 ask «بدل تقليب تحت الي تحت اجعلهم
  ايقونات الفوق»; his choices «4 أيقونات», «أيقونة خاصة 🤝 المناديب», «تحت كل بطاقة: أجهزتها»):
  📋 أجهزتي (his own D's + previous debts) · 🤝 المناديب (each rep on his own: his D devices, their
  total, «تحديد أجهزته») · 💳 البطاقات (بطاقة كاش movements + «بطاقاتي (KAST)») · 🔔 إشعارات كاست
  (pending KAST spends = سحب and deposits = دخل). A count sits on each icon; the last icon opened is
  remembered on the phone (`starnet.starlinkTab`). The «توقفت وعليها D» alert stays above the icons.
  A D is the rep's of the device's CURRENT rep (his Oct 2026 report: a device taken off a rep still
  showed under him because its old shipment locked the rep) - the shipment's `representativeId` only
  when the device is gone (`debtRepId` in `lib/starlinkTabs.ts`).
- **Under each card, its devices**: «📡 N جهاز مربوط بها» opens each device's Starlink email and its
  renewal day of the month (the locked day, else the day of `rechargeDate`) - the day the card is
  charged - soonest first (`cardDeviceRows` in `lib/cardDevices.ts`).

## ✅ خطة اليوم, reminders and the «المزيد» menu

- **«المزيد» (home ➕ fan)** (his Oct 2026 ask): «💳 البطاقة» (/starlink) and «الإعدادات» added,
  «وعود الدفع» and «إضافة حساب» removed (`bottomMoreItems` in `BottomNav.tsx`; the rep's menu is
  unchanged).
- **No reps' devices in his «خطة اليوم» and reminders** («ازل عني فيها اجهزة المندوبين»; his choice
  «خطة اليوم + صفحة التذكيرات»): any device with a rep and any customer who belongs to a rep now are
  left out (`ownerOnly` in `repSeparation.ts`) - plan, the reminders page and the bell count. Only
  «توقفت وعليها D» keeps every device (he pays Starlink for the reps' too). On the rep's own phone
  (`isRepWorkspace`) nothing is left out.
- **A task opens its device**: a device task (renewal, win-back) opens a sheet with the device
  (customer, phone, email, KIT, renewal, what it owes) + «📡 افتح الجهاز» (home search by KIT, else
  email, else name - `deviceSearchKey`) + «واتساب». A «🩺 بيانات» task opens its devices; a duplicate
  (email / KIT / customer phone, his choice «الجهازان معًا + الدليل + دمج») shows each group with the
  shared value as proof, both devices with customer, date added, last sync and operations count,
  «افتح» each, and «🔗 اعرضهما للدمج» (home search on the shared value, where each card has «دمج»)
  (`duplicateGroups` in `lib/duplicateProof.ts`).

## 💱 عملة المندوب / الزبون (currency alerts)

His Oct 2026 ask «ان كنا نتعامل معه علي عملة فلتكن هي عملته الافتراضي وعندما نغير احد اجهزته الي
عملة اخرا… يجب ان يظهر لنا تنبيه واضح جدا» (it came from the rep whose renewal was typed as 6,000 أوقية
instead of سيفا); his choices «تلقائية + تستطيع تغييرها», «نافذة توقفك», «علامة عليها + قائمة».

- **Whose currency**: a device's operations belong to its rep (device rep, else the customer's current
  rep), else its customer; on the rep's own phone always the customer (`partyOf`).
- **His currency**: «💱 عملته» on the rep / customer form (`defaultCurrency`; empty = automatic). Automatic
  = the currency with strictly the most votes - one per shipment (عليه) on his devices + each device's
  monthly price; a tie = no default yet, no warning (`lib/partyCurrency.ts`).
- **Before saving** (new operation, editing one, «دفعة» quick tool, the device's monthly price): a red
  line in the form, then a red window «عملة مختلفة!» with «غيّر إلى X» / «متأكد، سجّل» / «رجوع». A new
  operation starts in his currency. A فرانك payment is سيفا, so it matches a سيفا party. Nothing is ever
  converted.
- **Confirmed = never flagged again**: «متأكد» stamps `currencyConfirmed` on the entry (or on the
  monthly price).
- **Older ones**: «⚠️ عملة مختلفة» on the device's operations and the rep statement lines; the list is
  a 🩺 high data issue «💱 عملية بعملة مختلفة» in «خطة اليوم» and فحص البيانات - from every device, the
  reps' too - with «افتح» and «✓ صحيحة».

## 📌 تثبيت الأجهزة + الملاحظة البنفسجية

His Oct 2026 ask «اضف ايقونة مع الايقونات فيه المثبت… ضغط مطول تاتيني خيارات تثبيت او اضافة ملاحظه،
والملاحظة تكون ظاهر فوق الجهاز بلون ارجواني… يسالني هل يوضع في تثبيتات ام فقط ملاحظات», judged by the
council (skill 5; report https://claude.ai/artifact/PpqKVH5ZecHYiM7H5Bfn91); his choices «كما في
التوصية» + «⏰ تثبيت حتى تاريخ».

- **Long-press on a device card** opens «📌 تثبيت / إلغاء · 📝 ملاحظة · 📋 التفاصيل» (the one tap still
  opens the details - the long-press only repeated it). A card without the menu (customer page) still
  opens its details on a long-press (`cardGestures.ts`, `DeviceNoteSheet.tsx`).
- **His question at save = two buttons**: «📌 حفظ وتثبيت» / «💾 ملاحظة فقط» (no extra pop-up). Optional
  «⏰ حتى تاريخ» on the pin: from that day it's a «📌 مثبت» task in «خطة اليوم» (`duePins`).
- **One current note per device** (about the dish, not the customer - customer notes stay separate),
  ≤ 300 chars, shown as ONE purple line on top of the card (cut with …, tap = edit), with «📌 منذ N
  أيام» when pinned. The card never grows.
- **«📌 المثبتة (N)»** first in the home chip row, only when something is pinned; live devices only;
  normal sort order kept (a pin never buries a device that ends today).
- **Private**: own store `starnet_device_notes_v1` (backed up), keyed by device id - never on the device
  record, so never in a rep's copy / live link (not in `REP_STORES`), never in customer messages,
  statements or images. Follows the device to the trash and back; merging a duplicate moves the
  note onto the kept device (`lib/deviceNotes.ts`).
- **His follow-up «اضف الاقتراحات»** (all four built):
  - 🔍 home search also matches note text, current and logged (`noteMatchesQuery`);
  - 🧹 a renewal (any kind) or a new operation on a pinned device asks «إزالة التثبيت؟» once its
    dialog is closed (`shouldAskUnpin`) - unpinning keeps the note;
  - 🧹 «إلغاء كل التثبيتات» inside «📌 المثبتة» (≥ 2 pinned), notes kept (`unpinAll`);
  - 📜 a replaced or deleted note moves to the device's dated log (≤ 30, newest first), shown in the
    note editor; merging duplicates joins both logs.
- **📌 From a device's browser (his Oct 12 2026 ask)**: «اريد تثبيت الجهاز الذي يكون على البطاقة … زر
  صغير في المنتصف اليميني … يظهر لي تثبيت لم يتم تسجيل بعد … لأن الفوترة 00: ازلنا الدين السابق وفعلنا خدمة
  جديدة ولكن الفاتورة تنتظر عدة دقائق لكي تنزل فنسجلها المبلغ مع D». A purple «📌» tab on the right edge,
  half-way down (`starnet_pin_handle`) → «📌 تثبيت: لم يُسجَّل الشحن بعد» → «📌 ثبّت». It is staged like a
  sync read (`PendingSyncStore`, field `pinRequest`, `PinRequest.java`) so it reaches the app even while
  closed; the app pins the device with the note «⏳ لم يُسجَّل الشحن بعد - الفوترة 0 حتى تنزل الفاتورة؛ سجّل
  المبلغ مع D» (`applyBrowserPins`, the older note goes to the log) and never treats it as a Starlink read.
  Recording the charge then asks «إزالة التثبيت؟» as for any pin.

## ⬇️ Downloads in a device's browser

His Oct 2026 report «لماذا لا يمكنني تنزيل pdf الفاتورة»: the Starlink «Invoice PDF» (and any file the
Starlink page hands out) is now saved in the phone's Downloads / STAR NET folder and opened at once, so
he can share it (WhatsApp) or print it. Session-aware: it uses that device's own login. See the
starnet-browsers skill («Downloads from a device's browser»).

## 🔄 «مزامنة الآن ← اليوم»

His Oct 2026 report «تسجيلات اليوم لا تظهر عندي، تظهر فقط عندما اضغط على 7 أيام»: the renewal date is
the stop instant (midnight), so a card that says «ينتهي اليوم» is dated TOMORROW. «اليوم» now takes
those (ending tonight) plus the ones dated today (stopped this midnight) - `days` 0..1; «N أيام» takes
`days` 0..N (`pickSyncAccounts` in `lib/syncQueue.ts`).

## 💳 Card auto-add: the CVC

His Oct 2026 report «دايم خانة الكود لا تمتلئ» (the Starlink Payment Method form: every field filled
except CVC, then «Something went wrong»): typing the card number makes the form clear the security
code a moment later while it checks the card type. The fill now has a second pass (0.7 / 1.8 / 3.5 s)
that refills only the fields that are empty again (`fillCardFields(doc, card, onlyEmpty)`), and «Save»
is never pressed while a field is empty - it refills and saves on the next try (`cardFillScript.ts`).

## 📊 Bottom nav + the financial dashboard (Oct 9 2026)

- His order: bottom tabs «الرئيسية · الزبائن · 💰 حسابي · المندوبون · 📊 التقارير»; «المتجر» moved into the
  bottom «المزيد» (his choice), «حسابي» left both «المزيد» menus (it is a tab now).
- His long brief «STAR NET Financial Dashboard» is built in **3 phases** (his choice), one update each:
  1. (done) «📊 الملخص» = the reports' first tab: sticky top bar (search «ابحث عن أي شيء في STAR NET...»,
     ⋯ = Excel export / refresh / rates), period filter (اليوم … هذه السنة, مخصصة), collapsible sections
     with «طي الكل / فتح الكل» (state kept on the phone, `starnet.dashboard`), KPI cards (tap = how it is
     computed + «التفاصيل»), «مقارنة الأداء» (default = same day last month, his example 9 Oct ↔ 9 Sep;
     or previous day / week / year; no % on a zero base → «لا توجد قاعدة مقارنة»), «تحليل الأداء الشهري»
     (12-month bars per year, up to two money metrics or the renewals count alone, best/worst month,
     growth, table), «من أين جاء صافي الربح؟», payment sources.
  2. money sources in full, Starlink analysis, debts & collections, rings/gauge, goals & alerts.
  3. export by section, and an audit log of edits in a CLOSED month (his choice: keep «إقفال الشهر»,
     no daily close).
- Currency (his choice): everything in أوقية - Starlink at each renewal's locked rate, the rest at
  today's rate marked ≈; a currency without a rate is listed, never guessed.
- Accounting rules (his brief, kept in `lib/financeDashboard.ts`): revenue is REALIZED (a renewal counts
  on the day Starlink was paid) so revenue − Starlink cost − rep shares + store net − expenses = net,
  exactly the «الصافي» figure (`buildPeriodNet` = the month calculation over any days); a renewal whose
  cost is still owed (D) is «ربح معلّق», never profit; payments are collections, never revenue; personal
  expenses are not business expenses; a figure with no data shows «لا توجد بيانات كافية».
- **Phase 2 (done, Oct 9 2026)**, `lib/financeAnalysis.ts`: «🔔 التنبيهات» (only from the numbers: net
  profit ≥ 20% below the compared period, expenses ≥ 30% and ≥ 1,000 above it, new debts beyond
  collections by ≥ 1,000, ≥ 3 renewals still owing Starlink, goals near / reached / ceiling passed) shown
  in the dashboard only; «🎯 الأهداف» in أوقية kept with «أهداف الشهر» (`starnet_goals_v1`: daily and
  monthly profit, monthly collection, ceilings on monthly expenses and new debts) with a half-circle
  gauge; «⭕ النسب والتوزيع» rings (each says its formula and numbers on tap) and donuts in the fixed
  categorical order; «💳 مصادر الأموال» - each amount once: device payments by method, rep handovers
  (the device part is already a device payment `heldByRepId`, only the remainder is a settlement),
  store paid at the till, manual «داخل»; sales on credit shown apart, refunds not recorded in the app
  (said on screen); «📡 اشتراكات ستارلينك» realized vs pending, paid vs owed, best devices/customers,
  ending within 7 days; «🧾 الديون والتحصيلات» new debts vs collections (collection ratio = collected ÷
  new debt of the period), owed by customers / to suppliers / to Starlink now, paid to suppliers. The
  operating balance stays in «💰 حسابي» (the card links there - never computed twice).
- **Phase 2 completed (his detailed brief «المرحلة الثانية», Oct 9 2026)** - built on the existing records,
  nothing new is stored except alert statuses:
  - «💳 مصادر الأموال والتحصيلات» (`lib/moneyMovements.ts`): every record that moved money is classified
    (sale paid at the till, debt collection, advance = the part of a payment beyond what the customer owed
    on his whole account, money from a supplier, transfer between his places, operating expense, supplier /
    Starlink payment, rep payout, money out to a customer, personal withdrawal, money from outside, manual
    «داخل», balance correction). Per place (الكاش, each «حسابي» account, the KAST card): opening +
    received + transfers in − paid − transfers out (± corrections) = closing - equal to «حسابي»'s balance
    (tested). An account whose balance was never typed, or typed after the period started, shows the
    period's net only (no invented opening). A transfer counts once and is never income.
  - «📡 تحليل اشتراكات Starlink» (`lib/financeStarlink.ts`): each renewal of the period with sale, cost,
    paid by the customer (his payments settle the oldest charges first - FIFO, like debt aging), paid to
    Starlink, still owed both ways, margin. The profit POLICY is unchanged (realized on the day Starlink
    was paid); shown apart: «محقق ومحصّل بالكامل» (customer paid AND Starlink paid). A renewal without cost
    or sale value = «بيانات غير مكتملة», never a loss/profit.
  - «🧾 ديون العملاء» (`lib/financeDebts.ts`): ages 0-7 / 8-30 / 31-60 / 60+. **Debts have no due date in
    the app**: «متأخر» only when a «وعد دفع» is past its day; otherwise only the age is shown. Customers who
    paid beyond what they owe = «رصيد زائد» kept for them. «🏭 ديون الموردين»: store suppliers + Starlink
    (open D + earlier owners' debts), compared with the end of the compared period, and the renewals coming
    within 7 days by their monthly price.
  - «🎯 الأهداف المالية» (`lib/financeGoals.ts`): + week (Monday→Sunday), year, today's collection, ceiling
    on open debts, renewals and new customers (same `starnet_goals_v1`); a goal in another currency is
    compared at today's rate, the rate written beside it. End-of-month forecast = profit so far ÷ days
    passed × days of the month - hidden before day 5, with < 3 profit days, or when one day makes > 60%.
  - «🔔 مركز التنبيهات» (`lib/alertCenter.ts`): fixed windows (this month so far vs the same days of last
    month, last 30 days, now) - never the chosen period, so changing it resolves nothing; the old period
    alerts stay listed under it. Status جديد → راجعتُه → تم حلّه (only when its cause is gone, with the
    time) and «تمت المعالجة» for causes that can be legitimate (stays quiet until its numbers change).
    States `starnet_alert_states_v1` (backed up, resolved kept 60 days). **Defaults I chose (he can change
    them in «⚙️ القواعد», per phone `starnet.alertRules`)**: margin under 10%, one customer over 30,000
    أوقية, 30 days without paying, expenses +30% (and ≥ 1,000), ≥ 3 Starlink costs unpaid. Nothing is sent
    or paid automatically.
  - A rep's app never shows «حسابي»'s places (owner-only).

## 🔄 What a renewal is (Oct 9 2026)

- His report: he forgets the «تجديد» button and records the month from «الدين» / «دفعة» (the device's
  «عليه» form); and «التجديد يجب أن يُحسب فقط لجهاز كانت عليه فاتورة D وأزلتها عنه وأضفت له D جديد».
  His choices: **«D جديد بعد تسديد السابق»** (a Starlink «عليه» recorded while no earlier D of the
  device was unpaid - its D was paid, or it is the device's first; a D added while another is still
  unpaid is more on the same month, not a renewal), **«سؤال قبل الحفظ»** (saving any «عليه» asks
  «🔄 هل هذا تجديد اشتراك؟» with the rule's answer suggested; stored as `LedgerEntry.renewal`, which
  wins over the rule; the «تجديد» button's own shipment is `renewal: true`), and **recount the past by
  the rule** (derived - no record changes). Only COUNTS use it (reports' «عمليات التجديد», goals,
  leaderboards, the weekly insight, the dashboard's «تجديدات الفترة»); sale, cost and profit of every
  shipment are unchanged. Logic `lib/renewals.ts`.
- **سيفا form rate bug** (same report: a سيفا customer's «حساب الزبون» opened in سيفا with the أوقية
  rate 430 in «سعر عملة البيع», so profit was wrong until he switched currencies back and forth): the
  rate now follows the currency the form opens in. **Old records saved with the wrong rate are left as
  they are** (his choice «اتركها كما هي»).

## ✓ «إزالة العطل» (Oct 10 2026)

- His request (screenshot of the «الأجهزة المعطلة» dialog): «اضف زر ازالة العطل». A «✓ إزالة العطل»
  button sits on the yellow fault banner of the card (active list) and in the dialog, for EVERY group -
  also the ones the app found by itself (إيميل غير رئيسي = limitedAccess, ملغي اشتراك = noSubscription /
  canceled). Before, clearing his own mark left such a device in «المعطلة» with no button at all.
- An auto group he removes is kept in `faultDismissed`; Starlink's flags stay as read. A sync that reads
  the flag cleared forgets the dismissal, so a later real one shows again. Removing a fault still brings
  back any D he had dropped when marking it (as before).

## 🏦 Bank notifications kept all the time (Oct 10 2026)

- His report: Sedad's «ENVOI» transfers received were never read; his request: «نجعل استار نيت شي ك
  اشعار ثابت يحدث كل الاشعارات ويقراه يكون دايما فاتح».
- **Sedad money received** (real wording, title `ENVOI`): `وصلكم من <NAME> ( <number> ) مبلغ 500.0 أوقية
  جديدة` → **money in** with the name and number; from his own number tagged `(BANKILY)` etc. → a
  transfer between his apps.
- **Permanent notification** «🏦 STAR NET يقرأ إشعارات البنوك» (`BankWatchService`, low importance)
  while «Notification access» is on: keeps the app alive on HONOR/Huawei-type phones, reconnects the
  notification reader every 5 minutes if the phone dropped it, and re-reads the bank notifications
  still on the screen (also each time «حسابي» opens). A notification seen twice is still one
  suggestion (same id). Turned off only by turning off «Notification access».
- Bankily's folded (grouped) notifications are read fine - each one arrives on its own (checked
  with his screenshots: 10 / 50 / 600 all present).

## 🏦 Bank amounts: MRU (new) → the app's أوقية (old) ×10 (Oct 10 2026)

- **The whole app works in the OLD ouguiya** (MRO, his «أوقية», rate ≈430 per dollar - the code is
  still `MRU`). The bank apps (بنكيلي، سداد «أوقية جديدة»، مصرفي…) write the NEW ouguiya. His rule:
  «100 MRU تساوي 1000 MRO» → every MRU amount read from a bank notification is **×10** before it becomes
  a suggestion (`toAppOuguiya` in bankNotices.ts; such a suggestion carries `appOuguiya: true`).
- What was read before the rule was fixed **once, automatically** (his choice «صحّحها كلها تلقائياً ×10»,
  `bankOuguiya.applyOuguiyaFix`, run when «حسابي» opens): waiting suggestions ×10; each confirmed one's
  record ×10 when exactly one record matches its amount, currency, day and note (a debt repayment: amount
  + day). A record he changed by hand, or two identical candidates, is left as it is and counted in the
  message he sees once. The list of fixes is kept in the bank inbox (`ouguiyaFix`).

## 💸 «تحويل الأموال» - the remittance branch (Oct 10 2026)

- His request: «فرع تحويل اموال يكون في حسابي … بين تطبيقات البنكية واورانج موني ونيتا والكاش ودولار …
  وفيه عمولة او اضافة». His choices: **حوالات للناس** (a person pays him in one place, he sends from
  another, for that person or someone else, and takes a commission); **the rate is typed on each one**
  (the «العملات» rate is offered, locked on the record); **commission chosen each time** (% or a fixed
  amount; paid on top by the customer, or deducted from what is sent); **what isn't paid stays a debt** on
  the customer until he pays it (one or more payments, into الكاش or an account).
- Where: a «💸 تحويل الأموال» card in «حسابي» (under «كل ما تملك») → a sheet with «➕ حوالة جديدة» and the
  list (tap one: details, «تسديد الباقي», delete). Store `starnet_remittances_v1` (backed up, wiped by
  «حذف كل المعاملات»).
- Money: received money is added to its account, sent money leaves its account (derived, like every
  balance); a الكاش leg is a cash entry with `sourceKind: "remittance"` and the transfer's id (removed with
  it). Orange / Nita are typed and shown in فرانك (the rate too); kept in سيفا.
- Profit = what the customer owes − what was sent, both in أوقية at the day's locked rates (the
  commission + any exchange difference); a line «💸 أرباح التحويل» in «يبقى لك» of that month. What is still
  owed shows in «كل ما تملك» → «لك عند الزبائن» as «💸 name». The dashboard's money movements show them as
  «💸 تحويل أموال (حوالة)».
- **The rate the way he quotes it** (his Oct 10 2026 correction, with a real example: 50,000 فرانك in on
  أورانج = 10,000 سيفا, «اشتريتها بـ 3600» → 36,000 أوقية out of بنكيلي): the rate field is «سعر 1,000 سيفا
  بالأوقية» (3600) / «سعر الدولار بالأوقية»; between two non-أوقية currencies «1 X = ? Y». Beside it «أو المبلغ
  المرسَل» - typing the amount sent sets the rate from it. Profit is measured against the «العملات» rate of
  the day (keep the سيفا rate there up to date).

## ⏸️ Moving to Standby (SIS) is not «ملغي» (Oct 10 2026)

- His report (screenshot): Starlink said «Your current service will switch to Standby Mode on 10/24/2026»
  / «Standby Mode Pending», and the card showed «ملغي» - «هو غير ملغي، عليه خدمة SIS». That banner now
  gives the card a neutral chip «⏸️ SIS من 2026/10/24»; «ملغى» only for «scheduled to end» / «تنتهي خدمتك».
  A device already marked «ملغي» by this banner is corrected on its next sync.
- **Receipt + editing** (his Oct 10 2026 request: «الحوالات اريد لها وصل فاتورة وفاتورة بصورة ولعمليات التي
  اضيفة يمكن تعديلها»): in a transfer's detail «🧾 وصل PDF» and «🖼️ وصل صورة» (`remittanceReceipt.ts`, the
  branded layout; number «H-yyyymmdd-XXXX»; amounts in فرانك for أورانج/نيتا; the agreed rate «1,000 سيفا =
  3,600 أوقية»; what reaches the beneficiary, paid, left; **never his profit**), «✎ تعديل» (everything
  recomputed, payments kept; refused below what's already paid, or changing the received currency while
  payments exist), and ✕ on a later payment entered by mistake.


## 📄 كشف حساب of each bank / wallet and الكاش (Oct 10 2026)

- His request: «اجعل لنا كشف حساب كل حساب بنكي وكشف حساب كاش فقط عندما اضغط علي المحفظة تأتيني كشف
  حسابها». Asked together with «حوّل لي شخص 50000 فرانك (10000 سيفا) وكان عندي 52500 سيفا وصارت 88200
  لماذا» - one 50,000 فرانك transfer adds exactly 10,000 سيفا (tested); the extra 35,700 is other records
  on أورانج, which the statement lists so he can find and delete / fix them.
- In «البنوك والمحافظ» tapping an account's name opens its statement; the «كاش» line has «📄 كشف حساب
  الكاش». `lib/placeLedger.ts` (`buildPlaceLedger`, pure) + `placeLedgerData.ts` (reads the stores):
  the place's movements from `moneyMovements.ts` (the same records the balance adds up), from the typed
  opening day on, oldest→newest with the running balance; shown newest first, per currency, with
  received / paid totals and the opening line. Its last balance = the balance shown (`placeBalance`).
  Orange / Nita in فرانك (×5, «= X سيفا» beside the total). Movements before the opening day are only
  counted («not in the balance - the typed balance includes them»). Nothing new is stored.

## 🇩🇿 Algerian dinar in الكاش and «تحويل الأموال» (Oct 10 2026)

- His request: «اضف لي دينار جزائري مع العملات لي تحويل الاموال وكاش». `lib/cashCurrencies.ts`:
  `CASH_CURRENCIES` = أوقية / سيفا / دولار / **دينار جزائري (DZD)** - offered for الكاش in a transfer, the
  cash register's movements and «حسابي»'s amount pickers. Device / customer ledgers keep their three.
- Rate typed like سيفا: «سعر 1,000 دينار بالأوقية» (`rateQuote` block 1,000 - our assumption, a small
  unit like سيفا; change it if he quotes otherwise).
- No dinar rate in «العملات» yet (we never guess one): the transfer locks the dinar's rate from its own
  typed rate (`lockRates`, `rateFromTransfer`), so its profit = the commission alone, and the form says
  «سجّل سعره هناك ليُحسب فرق الصرف». Once he adds DZD in «العملات», new transfers count the exchange gain.

## 🔒 Only the open sheet scrolls (Oct 10 2026)

- His report: «دايم عندما اكون في شاشة واحركها تتحرك شاشة التي اسفلها في الكثير من الاماكن». While any
  sheet / dialog / menu / lock screen is open (`html:has(.party-sheet-backdrop, .dialog-backdrop, …)` in
  globals.css) the page is `overflow: hidden`, and every scroller inside an overlay has
  `overscroll-behavior: contain`, so a swipe never reaches the page underneath. A NEW full-screen overlay
  class must be added to that list.

## 🏦 Sedad notices with invisible direction marks (Oct 10 2026)

- His report (screenshots): Sedad «أرسلتم مبلغ 3600.0 أوقية جديدة لصالح NAME ( NUMBER )» and «وصلكم من NAME
  ( NUMBER ) مبلغ 500.0 أوقية جديدة» never reached «عمليات البنوك». The wording was already understood;
  the phone's text carries invisible bidi marks (U+200E/200F, U+202A-202E, U+2066-2069…) around the numbers,
  so no amount matched and the notice was dropped as «ignore». `parseBankNotice` now removes those marks
  first (every app). And a notice nothing was read from is no longer remembered as seen: while it's still
  in the tray, the rescan on opening «حسابي» reads it again with the newer parser (so his missed ones come back).

## 🏦 Sedad still not read → caught on the phone itself (Oct 10 2026)

- His report after the direction-marks fix: «مازال لا يقرأ رسايل تطبيق sedad».
- Native `BankNotice`: the title is cleaned of the same invisible marks before matching («\u200eENVOI»
  matched nothing). An app whose package we don't know is kept when its text names money
  (`أوقية` / `MRU` / `F CFA` / `FCFA` with a figure) as `other:<package>` - never chat / SMS / mail apps,
  never STAR NET itself. MessagingStyle notices: the words come from `android.messages`.
- Web: an `other:` notice in Sedad's words («أرسلتم مبلغ» / «وصلكم من» / «تلقيتم رصيدا بمبلغ») becomes
  سداد; anything else shows «لم يُفهم» with «📱 <package>» - his screenshot of it tells us the app.
- Once (`forgetUnreadSeen`, flag `seenCleaned`): the seen ids of the last 14 days that no suggestion holds
  are forgotten, so the Sedad notices remembered as seen before the fix (still in the tray) are read again.
  Nothing comes twice: suggested ones are held by their suggestion, transaction IDs stay in `txIds`.

## 🔄 The notification reader stopped after updates (Oct 10 2026)

- His screenshots at 18:13: the tray held Bankily «Montant : 3500 MRU» (2 min old), Bankily «1000 MRU» from
  15:49 and two Sedad «ENVOI», yet «عمليات البنوك»'s newest was 15:21 - nothing at all was read after the
  update he installed then. «Notification access» still showed on: the phone (HONOR-type) just never bound
  the reader again after the app update.
- `KastNotificationListener.forceRebind`: our reader component off → on (DONT_KILL_APP) + `requestRebind`
  = what him switching access off/on does. Runs on `MY_PACKAGE_REPLACED` (every update), and from
  `ensureConnected` when a plain rebind asked 20 s+ earlier didn't bring it back (BankWatchService checks
  every 5 min, «حسابي» on open).
- «حسابي»: when access is on but the reader isn't bound, a red «⚠️ قارئ الإشعارات متوقف» box shows the time
  the last notification reached it (`lastSeenAt`) and «🔄 أعد تشغيل القارئ»; if still down after 3 s, it opens
  «Notification access» and tells him to switch STAR NET off and on. On reconnect the bank notices still in
  the tray are read.

## 🏦 A rep's «دفعة في حسابي الشخصي» through an app goes to that app (Oct 11 2026)

- His report (bot screenshots: 26,000 سيفا by نيتا = 130,000 فرانك, 14,000 سيفا by أورانج = 70,000 فرانك, both approved):
  «لم تُسجَّل في حساباتي شخصيًا». `recordRepMoneyHandover` always used «cash» + a الكاش entry.
- Now `paymentMethod` from the request: the money account of that method (`devicePaymentAccountId` - the account
  with that `method` in its currency, else a cash wallet of that currency) gets it: device payments of the handover
  carry the method (routed, no cash entry), the remainder settlement carries `accountId` (no cash entry). Cash, or
  no matching account → الكاش as before. The approval card says «🏦 يدخل في حساب X في «حسابي»».
- The two already approved stay in الكاش: he moves them with «🔁 تحويل» (الكاش → أورانج / نيتا).

## ⚖️ A customer's net in his own currency (Oct 11 2026)

- His words: «أريد لكل زبون تُحسب له عملته الأساسية… له 60,000 سيفا وعليه 214,000 أوقية… سطر تحتهم بعملته: 60,000 سيفا
  = 216,000 أوقية → 2,000 أوقية متبقي له، وإن كانت عملته سيفا 555.55».
- Client card (clients page): when he has open balances in 2+ currencies, «⚖️ الصافي بعملته (X)» under them, in
  his currency = `Client.defaultCurrency` («💱 عملته»), else the automatic one (`autoCurrencyOf`), else أوقية;
  with each other currency's line «60,000 سيفا ≈ 216,000 أوقية بسعر اليوم». `partyNetIn` (lib/partyNet.ts), today's
  registry rates (العملات). Display only - the balances stay per currency, nothing is converted in the records.
  A currency without a rate → no line. Suppliers: in أوقية.
- **The net decides what he owes everywhere he is told** (Oct 19 2026, his angry report on نافع دبو: «دفع كل شيء
  عليه وحسابه 0 وأنت تُظهر سيفا» - +32,000 سيفا رصيد عليه, 118,400 أوقية له at 1,000 سيفا = 3,700 → the card said
  «متعادل» but its badge said «عليه دين» and the statement image/PDF said «المبلغ المستحق عليك 32,000 سيفا · رصيد لك
  118,400 أوقية» with the franc line). With balances in 2+ currencies (`partyNetIn` not null): the card badge and the
  «عليهم دين» list (`partyStanding`), the statement image/PDF headline (`StatementData.net`: the net in his currency,
  «✓ لا يوجد مبلغ مستحق - الحساب متعادل» + «⚖️ الحساب بعملتك» lines with the rate; the franc line only for a net in
  سيفا), the WhatsApp «تذكير بالدين» and «إرسال كشف الحساب», and the bot's «كشف …» all use the net. The per-currency
  table stays as the detail; records are never converted.
- His follow-up: «60,000 سيفا مقابلها 214,000… سعرها كل 1,000 سيفا 3,600» (the registry gave 3,642 = 435 / 119.44).
  The line shows the rate used («بسعر 1,000 سيفا = 3,642 أوقية ✎ غيّر»); typing 3,600 sets the registry's سيفا rate to
  أوقية-rate × 1,000 ÷ 3,600 (`foreignRateFromQuote`, `setCurrencyRate` - from now on only, records keep their locks).

## 💱 «سعر 1,000 سيفا بالأوقية» in العملات (Oct 16 2026)

- His report (rep page screenshots): «المندوب عليه 14,000 سيفا وهي مقابلها بـ 3.6… أين أجد مكان تعديل السعر بين
  الأوقية والسيفا». The page showed 50,393.05 أوقية: the registry keeps rates per dollar only, and 435 ÷ 120.85 gave
  3.5995, not his 3.6. His choice: «نعم أضف خانة سعر 1000 سيفا بالأوقية».
- العملات → a currency → «تعديل السعر»: a field «سعر 1,000 سيفا بالأوقية» (1,000 for سيفا / دينار, else 1 unit) above
  the dollar one; typing it sets that currency's rate = أوقية rate × block ÷ typed (`foreignRateFromQuote`), the أوقية
  rate kept; the dollar fields are disabled while it's filled. Each row also shows its rate in أوقية
  (`mruQuoteFor`, lib/partyNet.ts). As every rate change: from now on only - records keep their locked rates; the rep
  page's «ما عليه» lines on his customers' renewals follow today's rate, so they move at once.

## 📒 The rep statement: «ما عليه» and «ربحه» are two accounts (Oct 11 2026)

- His words (screenshot of «ملخص الفترة», one balance 506,490 = owed − his share): «أريد أن تظهر ما عليه وحده، وإن
  أضفت له رصيدًا يُزال منه، ولكن الربح يكون وحده لا يُخصم مما كان على المندوب… كل حساب مفترق».
- `repRowSplit` / `repRowAccount` (lib/repAccount.ts): **ما عليه** = renewals on his devices (−), payments on them /
  what he handed over (+), «استلمت منه نقدًا», the له / عليه amounts he adds by hand, cash collected on store sales;
  **ربحه** = his share of each shipment, store commissions, minus «دفعت له نقدًا» (commissionPayout).
  `buildRepPeriodStatement` returns `debt` / `profit` (opening, closing, after each row); the old single balance stays
  as «⚖️ الصافي لو خُصم ربحه (للمعلومة)».
- Screen summary: two boxes «📡 حساب ما عليه» / «📈 حساب ربحه (لم يُخصم مما عليه)» + the net; each statement row shows
  its own account's balance («ما عليه: …» / «ربحه: …»). PDF: the same tiles (no «حصتي») and a «حسابه بعدها» column.
- Not changed (yet): the rep card's «الصافي», the bot's «كشفي» - they still show the combined figure.

## 📄 The rep's statement PDF shows his share only (Oct 11 2026)

- His words (screenshot of the PDF): «لا أريد أن تظهر له حصتي، أريد أن تظهر فقط حصته». `buildRepStatementPdf`
  no longer has the «حصتي» tile (ربح أجهزته / حصته / تجديدات / دُفع عنها / الرصيد stay). The bot and the rep's
  own app already showed «حصتك» only; the operator's own screens keep «حصتي».

## 💱 «سعر المندوب» - a rep's own dollar rate (Oct 10 2026)

- His ask: «أريد أن يكون هناك سعر للمندوب، يعني سعر الدولار مثلاً 430 ولكن أحسبه للمندوب بـ450 أو ما أريد».
  His choices: «حساب ربحه ونصيبه»، «الدولار والسيفا»، «من تاريخ أختاره».
- Rep card → ⚙️ إدارة → «💱 سعر المندوب»: 1 $ = ? أوقية and/or 1 $ = ? سيفا (empty = the real rate) + «يبدأ من»
  (`Representative.usdRates` = `RepRatePlan`). Saving stamps `LedgerEntry.representativeRates` on every shipment of
  his dated that day or later (`stampRepRates`); new shipments get it when recorded (`createLedgerEntry` with
  `representative.ratePlan`). Older shipments keep what they had; «إزالة سعره» removes it from the chosen day.
- Math (lib/repRates.ts): on a shipment sold in أوقية / سيفا his profit counts Starlink's cost × (his rate ÷ the
  sale's locked rate). 30,000 أوقية, 50 $, real 430 → our profit 8,500; his 450 → his profit 7,500, his 50% = 3,750,
  ours = 8,500 − 3,750. A dollar sale or no rate for the sale's currency = unchanged. Expected (D) shares too.
  His statement rows show his view (cost at his rate, his profit); our reports keep the real profit.
- Oct 11 2026, his report: «أضفت سعر له 460… لم يتغير شيء… وأضفت عملية الآن ولم تُحسب بـ460». His rep (الحسين) sells
  in سيفا and only the أوقية rate was set → nothing applied. Now the plan keeps `base` (the real rates when saved; an
  older plan gets today's once) and a rate in one currency is the same markup on the dollar for a sale in the other:
  factor = 460 ÷ 435 on a سيفا sale. `applyRepRatePlans` runs when the reps page loads: every shipment of his from
  «يبدأ من» that misses the plan (recorded before saving, on his phone…) gets it.

## 🅳 «تجديد» never clears a D silently + ↩️ «أرجع D» (Oct 10 2026)

- His report: «زبون أو اثنين كانت عليهم D، بعد أيام راحت عنهم D وصار دين فقط» (screenshots: a 94,000 أوقية
  shipment of Oct 7 whose ALL 17,714 cost showed as paid, while Starlink still asked ALL 17,714 → «فرق 225.14 $
  غير مسجّل»). Cause: «🔄 تجديد» on a device with an open D always meant «paid that D to Starlink today».
- His choices: «يسألني كل مرة» and «نعم، أضفه».
- RenewalConfirmDialog with an open D: no default - «✓ دفعت D لستارلينك الآن» (settles it, no new shipment) or
  «📅 شهر جديد على الزبون» (the old D stays; the new month defaults to D). «دفعت» while the last Starlink read
  still shows money due needs a second tick («نعم دفعت (القراءة قديمة)»). `onConfirmRenewal(..., payOpenD)`.
- Card: `settledButStillDue` (lib/settledStillDue.ts) - D's settled in the last 60 days, BEFORE the last Starlink
  read, whose value today equals the gap Starlink still asks (±max($2, 5%)) → red «⚠️ D سُدّد في … لكن ستارلينك ما
  زال يطلب …» + «↩️ أرجع D» (`unsettleShipmentCost`: pending again, nothing new on the customer). While it shows,
  the «فرق غير مسجّل / الدين» line is hidden (its «دين D عادي» would charge the customer twice).
- Oct 11 2026, his case: he HAD paid the old D (ARS 7,201.88) and Starlink then billed the next month on credit -
  same amount, so the card offered «أرجع D», which would have cancelled his real payment. His question: «هل عندما
  أضغط إرجاع D لن تحسب العملية الأولى؟» - yes, it un-settles it. Now the box asks: «📅 شهر جديد» (opens «🔄 تجديد»
  to record the new month as D), «✓ دفعته» (`starlinkCost.stillDueOk` - never offered again; the «فرق غير مسجّل»
  line comes back for the new bill) or «↩️ لم أدفعه» (un-settle, with a confirm saying exactly that).

## 💵 «كل ما تملك»: cash one line per currency, أورانج / نيتا always in فرانك (Oct 10 2026)

- His words: «كاش سيفا اجعله وحده وكاش العملة وحده. واجعل أورانج ونيتا يظهران بالفرانك أيضاً في الأمام».
  His choices: «سطر لكل عملة» and «دائماً ظاهران بالفرانك».
- `buildWealth`: «💵 كاش» = الكاش in أوقية only (key `cash`); «💵 كاش سيفا» always (key `cash:SIFA`) =
  الكاش's سيفا + every cash wallet (`isCashWallet`, the «كاش سيفا» account), no longer under «البنوك»;
  «كاش دولار», «كاش دينار جزائري»… (key `cash:<code>`) only when there is some. Totals unchanged.
- أورانج / نيتا (`franc`) are always their own line in front, even at 0: the big figure in فرانك, «≈ X أوقية»
  beside it; their detail in فرانك too.
- Each line carries `places`: its sheet shows «📄 كشف حساب …» for الكاش and each account behind it.

## 🔍 Balance matching + 🔔 low-balance alerts (Oct 10 2026)

- His choice from the suggestions list: all four («مطابقة الرصيد»، «شراء عملة»، «تنبيه الرصيد»، «تأكيد سريع
  + قواعد»), with: profit vs his average purchase cost, rules that prepare + one-tap confirm (never record
  silently), alerts = phone notification + red mark.
- 🔍 In every statement sheet (per currency): «مطابقة الرصيد» - he types the real balance; `explainDifference`
  (lib/balanceMatch.ts) lists a waiting bank notification of that amount, a duplicate (same amount / day /
  kind), one movement or two together equal to the difference, an أوقية amount 10× off. Nothing changes until
  «✓ سجّل الفرق تسوية»: an account → `correctBalance` (or its first balance), الكاش → a cash entry «تسوية».
- 🔔 «تنبيه الرصيد» per place + currency (lib/balanceAlerts.ts, `starnet_balance_alerts_v1`, floor kept in the
  place's currency - typed in فرانك for أورانج / نيتا): below it the phone is told once per crossing
  (`notifyPhone`, from «حسابي» and when the home screen loads the devices) and the line shows «⚠️ منخفض».

## 💱 «شراء عملة» + profit against his average purchase cost (Oct 10 2026)

- lib/exchanges.ts (`starnet_exchanges_v1`): «دفعت من» place + amount, «استلمت في» place + amount (أورانج /
  نيتا typed in فرانك), seller, note. Both sides move (flows for apps, cash entries `sourceKind: "exchange"`
  for الكاش; movement kind «شراء عملة (صرف)»); editable / deletable. Rate shown his way.
- His choice «مقابل متوسط شرائي»: `averageCost` = purchases paid in أوقية over the last 30 days, weighted
  (none in 30 days → the latest). A NEW transfer locks that cost as the currency's rate (`lockRates` costs →
  `costBasis` on the record), so its profit = what he received − what the sent currency really cost him.
  Older transfers keep their locked rates. Purchases paid in another currency don't count in the average.

## 🧠 Bank-inbox rules + «⚡ تأكيد الكل الجاهز» (Oct 10 2026)

- His choice «يُجهّز وتؤكد بضغطة»: lib/bankRules.ts (`starnet_bank_rules_v1`). Confirming a notification from
  a number with «🧠 تذكّر» (on by default) keeps number + direction → account + choice (expense / income /
  new debt / supplier / rep / customer device). Never learned: debt repayments, transfers between his apps,
  الكاش deposits, notices without a number. The next waiting ones from that number show «⚡ جاهز: …»; nothing
  is recorded until «⚡ تأكيد الكل الجاهز» (or «⚡ سجّل كما في القاعدة» inside one) - each saved exactly like a
  manual confirm (`saveSuggestionChoice`). A «قد يكون مكررًا» one is never ready. Rules listed and deletable.

## 🔁 Manual transfer button (Oct 10 2026)

- His request: «احتاج زر تحويل بين التطبيقات أو الكاش» - before, a transfer was only created from a bank
  notification. «🔁 تحويل بين حساباتي والكاش» card in «حسابي» (components/TransferSection.tsx): من / إلى (any
  account or الكاش in a currency), amount (فرانك for أورانج / نيتا), date, note → `addAccountTransfer` + its
  الكاش entry (`transferCashEntry`, removed with it). One currency only (`transferCurrencyError`); between two
  currencies → «💱 شراء عملة». The last 15 transfers are listed with delete.

## 📅 «حسابي» periods: اليوم / أمس / a picked day + 💰 balance under every account choice (Oct 10 2026)

- His request (screenshot of the month chips): «اليوم، أمس وتحديد تاريخ». lib/moneyPeriod.ts: chips «اليوم»,
  «أمس», «📅 تاريخ» (one day), then this month and 4 before, on one line scrolling sideways. The top card
  («يبقى لك اليوم / أمس / يوم … / في …») takes every figure over from..to: business «الصافي»
  (`businessNetForPeriod` = netProfit.buildPeriodNet; a month still uses businessNetForMonth), transfers'
  profit (`remittancePeriod`), income / spending (`periodLeft`); the income tab follows the same period.
- «في كل مكان رصيد الحساب ظاهر»: components/PlaceBalances.tsx - «حسابي» provides every place's balance
  (`loadPlaceBalances`) in a context; `BalanceHint` («💰 الرصيد الآن: …», فرانك for أورانج / نيتا, الكاش in its
  chosen currency) sits under PlacePicker (transfer, purchase, transfers to people), SourceSelect (income,
  expense, debts) and the bank-confirm account choices.

## 🧹 Top «المزيد» repeats nothing from the bottom (Oct 10 2026)

- His words: «ايقونات المزيد فيهم أشياء مكررة مثل الإعدادات - أزل أي شيء في الفوق يكون في السفلي، اتركه».
  `topMoreItems` (BottomNav.tsx, lib/moreMenu.ts `withoutBottomDuplicates`) drops a top item whose page is a
  bottom-bar tab or in the bottom «المزيد» (owner: الإعدادات and ستارلينك والبطاقة left the top). A rep whose top
  list ends up empty has no top «المزيد» button. Any new item: put it in one of the two lists only.

## ✕ Removing «📱 أضافه المندوب» (Oct 11 2026)

- His words (screenshot of the «أجهزة أضافها المندوبون» filter): «ازل عن هاذه اضافه الحسين». The chip has a ✕
  (one card) and the «📱 من المندوبين» filter has «✕ إزالة العلامة عن الكل» (every card shown), both confirmed.
  `clearRepAddedPatch` (lib/repAddedMark.ts) drops `addedByRepId` / `addedByRepAt` only - the device keeps its
  rep (`representativeId`), and the day it was added moves to `addedAt` («أضفناها اليوم», duplicate proof).
  A rep's later edits never bring the mark back (repChanges keeps it only when the owner's device has it).

## 💵 Every سيفا in cash goes to «كاش سيفا» (Oct 11 2026)

- His report (bot «أكّد المسؤول استلام 700 سيفا» + the «كاش سيفا» statement without it): «سيفا كاش يزيد
  الحساب فعلا ولاكن لا يظهر في كشف الحساب». The «💵 كاش سيفا» line = الكاش's سيفا + the «كاش سيفا» wallet;
  the 700 went to الكاش, so the line grew but the wallet's statement didn't have it. His choice: «كل سيفا
  نقدًا لكاش سيفا».
- Rule (`cashEntryWalletId`, lib/moneyAccounts.ts): a الكاش entry created from `CASH_WALLET_FROM`
  (2026-10-11T00:00Z, by `createdAt`) by a business record - `device-payment`, `rep-settlement` (a rep's
  handover or his commission), `party-balance` (a customer's / supplier's «إضافة رصيد»), an invoice - in a
  currency that has a cash wallet counts in that wallet, not in الكاش: left out of `cashInHandEntries`,
  added to the wallet by `cashWalletFlows` (in `loadAccountFlows`), and placed there in `buildMovements`.
  The entry itself stays (deleted with its record); only where it counts moves. Only money really in hand
  has a الكاش entry, so a payment «ما زال عند المندوب» never counts.
- Entries he aims at الكاش himself stay there: transfers, purchases, remittances, card moves, his own
  income/expenses/debts, closings / resets, one typed on the الكاش page. Older entries never move (he moves
  them with «🔁 تحويل»). الكاش keeps the أوقية.
- `postRepSettlementToCash` never posts a settlement that has an `accountId` (an edited أورانج/نيتا
  handover used to get a الكاش entry too).

## 🏦 A rep's loan comes out of its app + no دولار in the money bot (Oct 11 2026)

- His report: the rep's «سلفة» 15,000 سيفا (= 75,000 فرانك) sent by أورانج موني was recorded on the rep but
  أورانج didn't go down. `recordRepLoan` now puts the app's account on the advance (`loanAccountId`: the
  bot's app name → its `PaymentMethod` → `devicePaymentAccountId` in the loan's currency), so it is a
  money-out of أورانج / نيتا / بنكيلي… in «حسابي» and its statement. Loans approved from Oct 11 2026 before
  the fix get their account once (`routeBotLoans` / `routeSavedBotLoans`, run on «حسابي» and the
  representatives page, matching the bot's note «سلفة عبر X إلى N (بوت المال)»); older ones are untouched.
- His words: «بوت المال ازل منه دولار لانه لا يتسلف ولا يدفع بدولار». The money bot offers أوقية / سيفا
  (and فرانك for أورانج / نيتا) only: no دولار button in 💵 دفعة or 📒 دفتري, a typed «50 دولار» asks the
  currency again (`explicitMoneyCurrency`, `isPayCurrency` without USD). The loan never had دولار. The
  devices bot's ⚡ activation price still reads دولار.
- His ask «تأكد من ربط كل الفروع»: every money flow and where it lands - a rep's handover (cash → الكاش /
  كاش سيفا, app → that app), his loan (→ out of its app), his commission (cash → الكاش / كاش سيفا),
  customer device payments (their method's app, else الكاش / كاش سيفا), «إضافة رصيد» (the chosen place),
  transfers / purchases / remittances / card moves / personal records (their chosen places).

## 💰 «عندك اليوم» at the top of «حسابي» (Oct 11 2026)

- His words: «اريد ان يظهر لي المبلغ المتواجد عندي اليوم … يجمع المحافظ والكاش … اجعله مع الايقونات الفوق
  في يدك الان». `Wealth.haveMru` = the sum of the «عندك» lines (كاش، كاش سيفا، البنوك، أورانج، نيتا، بينانس،
  KAST) in أوقية, before what he owes; shown as a full-width tile «💰 عندك اليوم» above «في يدك الآن» and
  «كل ما تملك» (`money-two-wide`).

## 🗄 A rep's resets are saved versions (Oct 12 2026)

- His words: «اريد ان يكون استرجاع تصفير الحساب ان يرد فقط ما كان قبل التصفير … كل تصفير تحفظ فقط من تصفير
  الي تصفير سابقها وان لا تختفي ان تبقى هناك كنسخات … وحاول تطبقه على ما مضى» (his «إلغاء التصفير» had brought
  back many old operations at once).
- lib/repResets.ts: `Representative.resetHistory` keeps every earlier reset (oldest first) beside `resetFrom`.
  A new reset (`applyRepReset`) keeps the old one; «↩️ رجوع إلى تصفير X» (`undoRepReset`) goes back to the
  reset before the current one only (no reset only when it was the first) and keeps the undone one saved;
  «🗄 التصفيرات المحفوظة» lists them all with «اجعله الحالي» (`pickRepReset`), plus «كل العمليات من البداية».
- The statement's «🗄 نسخة الحساب» (`repVersions` / `inRepVersion`) shows the current account or any period
  between two resets («2026-10-07 ← 2026-10-11», «قبل 2026-10-07») - replaces the single archive checkbox.
- The past: `seedRepResetHistory` (reps page load) brings back the resets older versions overwrote, from the
  profit fresh start's memory (`profitReset.previousRepResets` + its own point) - as saved points only, never
  forced as the current one.

## 💳 KAST top-ups from بينانس by default + 🏦 the method picks its account (Oct 12 2026)

- His words: «شحن البطاقة دائما يكون من بينانس اجعله افتراضي ويمكن تغيره» - a new KAST top-up's «من أين جاء
  المال؟» starts on «محفظة بينانس» (`defaultCardTopUpAccountId`, by name), else الكاش. Withdrawals and edits
  are unchanged.
- «اجعل عندما اضغط على دفع من بنكيلي يظهر الاختيار بنكيلي» - in «إضافة رصيد» (BalanceForm) tapping a payment
  method sets «من أين تحرّك المال؟» to its account in that currency (`methodAccountId`), «نقدًا» to الكاش;
  he can still change it.

## 🕘 «آخر جهاز» + every home list as a ring (Oct 12 2026)

- His words: «أضف لي أيقونة آخر جهاز، وهي آخر جهاز دخلناه وحدثناه أو عدلنا عليه شيء، أضفنا له رصيدًا أو أزلنا عنه
  رصيدًا - ديره مع الأيقونات الدائرية مثل كل الأجهزة. واجعل المثبت والمعطل وكل تلك الأيقونات دائرية وموازية لأيقونات
  كل الأجهزة ومتصل الآن».
- `lib/recentDevices.ts`: a device's last touch = the newest of its browser opened / card saved / ledger changed
  on this phone (`starnet.recentDevices`, not backed up - a convenience). The ring's number = devices touched
  today; tapping lists the last 30, newest first.
- **Oct 16 2026, his report «آخر جهاز لا تعمل جيدًا، تظهر أجهزة قديمة وأنا لم أفتحها - اجعل آخر جهاز دائمًا هو
  الأول»**: the background / batch syncs (`lastSuccessfulScanAt`) and entries the app or a rep wrote (ledger
  `createdAt`) pushed old devices to the top. Now ONLY his own taps count, all through the log: the card's «فتح»,
  its edit, its own sync button, and every hand edit of operations (home ledger, LedgerEntryEditor, /starlink pay
  D and previous debt, the rep page's share button, `saveClientDevicePayment`; `markLedgerTouched` marks every
  device a save changed). Automatic writes (sync merges, travel-fee batch, rep rate stamping) never mark.
- Under the five status rings, a second grid of rings (`status-rings-more`): 🕘 آخر جهاز, المثبتة (always shown
  now, even at 0), المعطلة, قيد الإصلاح, تحتاج توثيق, تم توثيقها, من المندوبين / بدون زبون (when any). Only
  «🧹 إلغاء كل التثبيتات» stays a chip (inside «المثبتة»).
- «⏰ لم يُجدَّد» (his words «أضف إلى الأزرار لم يتم تجديد، وهي الأجهزة التي لم تُجدَّد منذ بداية اليوم»), second
  in that grid: live, not faulty devices whose renewal day is today (`stoppedTodayNotRenewed` = days 0 - they
  stopped at midnight). A renewal moves the date on, so the device leaves the list by itself; older dates stay
  in «منتهية».

## 🔗 Money places always follow the method + Binance's 0.01 $ on KAST (Oct 12 2026)

- His words: «اجعل دائما الخيارات متناسقة: عندما اضيف سيفا فرانك يجب ان تظهر في الاسفل تلقائيا اورانج او نيتا،
  وكذلك ان وضعت بنكيلي يجب ان تظهر بنكيلي في الاسفل. هذا في كل مكان اضافة العملات». His screenshot: «فرانك» +
  «أورانج موني» (picked by itself) still said «استلمناها نقدًا - تدخل الكاش» - the place followed only a TAP.
  Now `BalanceForm` sets «من أين تحرّك المال؟» from `methodSource` on a tap, on a currency change (the method
  that fits the new currency) and on «له/عليه» for a payment. Other payment forms (device payment, quick
  payment, rep requests) have no separate place field - they route by the method (`devicePaymentAccountId`);
  «حسابي» forms pick the place itself (أورانج/نيتا = فرانك).
- «دائما في كاست عندما اضيف لها رصيد يضاف من بينانس وبالدولار … 50 دولار من بينانس تأتي لكاست 49.99 - دائما تخصم
  0.01 لكل عملية». A top-up from «محفظة بينانس» (`isBinanceAccount`) links the two amounts: typing what left
  بينانس sets the card to −0.01 (`cardFromBinance`), typing the card sets بينانس to +0.01 (`binanceForCard`,
  `KAST_TOPUP_FEE_USD`). Withdrawals and other places are unchanged.

## 📂 A rep's accounts page: سيفا وأورانج · الربح · الأوقية (Oct 12 2026)

- His words: «اريد ان يكون هناك مكان لارباح المندوب مثل حساب ويمكنني تصفير ارباحه وارساله لحسابه او ازالته من
  الذي عليه … وان يكون للمندوب عدة حسابات داخل حسابه: حساب للسيفا واورانج (يودع فيه سيفا واورانج ونتسلف عنده
  سيفا)، وحسابه للربح، وحسابه للعملة». His choices: «3 حسابات منفصلة», all four profit actions, «صفحة كاملة».
- «📂 حساباته» on the rep card opens components/RepAccountsPage.tsx (full screen): tiles «🟠 حساب السيفا وأورانج»,
  «💰 حساب الربح», «🟢 حساب الأوقية» (another currency gets its own when it has records), each with its balance
  (له / عليه) and its own operations + balance after each. lib/repWallets.ts: the money accounts are «ما عليه»
  (repRowSplit's debt side) cut by each record's own currency - never converted; profit in his shown currencies.
  It reads his current account (after his reset).
- Profit actions (new settlement kind `profitTransfer`, `toDebt`): «↪️ إلى حساب السيفا / الأوقية» = out of his
  profit into that account (total unchanged, `repRowDelta` 0); «🧹 تصفير الربح» = written off (profit −X, nothing
  else); «💸 دفعت له من حسابي» = `commissionPayout` from الكاش or an app (`accountId`, no الكاش entry). The amount
  defaults to all his profit in that currency (`repProfitIn`, today's rates). A profitTransfer opens a delete-only
  sheet (the له/عليه form would change its kind). The store's own balances follow it
  (`computeRepCommissionOwedByCurrency` −, `computeRepManualBalanceByCurrency` + when `toDebt`).

## 📂 له / عليه / تصفير on each of a rep's accounts (Oct 12 2026)

- His words: «عندي مشكلة في حسابات المندوب، فهو الآن عليه ديون وأريد أصفّر حساباته - أضف له في كل حساب له أو عليه،
  لا عليه فقط». In «📂 حساباته» each money account (🟠 السيفا وأورانج, 🟢 الأوقية, any other currency) has
  «➕ له» / «➖ عليه» (manualCredit / manualDebit in that account's currency, no money moves, no الكاش entry)
  and «🧹 تصفير الحساب» = the له/عليه of its balance (`repZeroEntry`, note «🧹 تصفير الحساب») - one record,
  deletable from the statement. It is not the rep's dated reset (versions) - that stays as it was.
- The profit account keeps its own actions (↪️ / 💸) and has «➕ له» / «➖ عليه» too.
- His follow-up «حساب الربح لا يمكن تصفيره كالحسابات الأخرى وهذا خطأ» (a rep's profit stood at «عليه 336,025.91
  سيفا» - more profit had been moved into his سيفا account than he had): new settlement kind `profitCredit` = له in
  «ربحه» (profit +X, no money, no الكاش entry; counted by `computeRepCommissionOwedByCurrency`). «🧹 تصفير الربح»
  reads his profit now (`repProfitSigned`) and goes either way (`repProfitZeroEntry`): له → written off
  (profitTransfer), عليه → profitCredit; note «🧹 تصفير الربح». Both open the delete-only sheet on the statement.

## 💵 «تسوية» on a rep's card: «عليه» is always what he owes (Oct 12 2026)

- His words: «المندوب عندما ضغطت على تسوية وأضفت أن عليه 50000 سيفا ظهر في ربحه، لماذا لا تظهر عليه». The form's
  cash box was ticked by default, and «عليه» + «نقدًا» was saved as `commissionPayout` («💸 دفعت له من ربحه»):
  it lowered his profit and took 50,000 out of الكاش instead of adding to what he owes.
- Now «عليه» is always `manualDebit` in its currency's account (`settleFormKind`), no money moves, his profit and
  الكاش untouched; the cash box is shown for «له» only («استلمتها منه نقدًا»). Paying him his profit stays in
  «📂 حساباته ← 💸 دفعت له من حسابي». An old «دفعت له من ربحه» opened for editing stays one.
- The wrong record already saved is fixed by deleting it from his statement (its الكاش entry goes with it) and
  adding «عليه» again.

## 💰 The money bot shows the rep's accounts; his payment says which account (Oct 12 2026)

- His words: «المندوب اريد اذا دفع دفعة ان يسأل ان كان سيدفع عن حسابه الشخصي ام اي حساباته، وان تظهر له في البوت
  كل حساباته ومبالغهم، واي عملية ارسلها تدخل في الحسابات التي عندي وايضا تظهر له كما في السابق».
- `RepPosition.wallets` (repPosition.ts → repWallets): the same three accounts as «📂 حساباته» - one computation
  for the app and the bot. «📊 كشفي» starts with «📂 حساباتك:» (`repWalletsText`, he reads + as «لك», − as «عليك»).
  The snapshot carries `reps[id].wallets` and `wallet:<SIFA|MRU|profit>` for the Java bot.
- 💵 دفعة (amount → currency → who): the who step shows «📂 حساباتك» and asks «في حسابك الشخصي أم عن زبون؟»; the 💼
  button names the account of the payment's currency and its balance («💼 في حسابي: 🟠 السيفا وأورانج · عليك
  44,000 سيفا»; فرانك (أورانج/نيتا) = السيفا وأورانج, أوقية = الأوقية). A payment can only land in its own
  currency's account - never converted, so there is no choice of another currency's account. The summary adds
  «📂 قبل هذه الدفعة», the request in the app reads «💼 دفعة في حسابي الشخصي · 🟠 السيفا وأورانج: …».
- Nothing changed in where the money lands: on approval a personal payment is `recordRepMoneyHandover` (his
  customers' devices first, the rest a cash handover) and an app payment (أورانج / بنكيلي …) goes to that
  account of «حسابي», cash to الكاش. Every confirmation he gets (payment, handover, loan) ends with
  «📂 حساباتك الآن:» (`repWalletsNow`).

## ☁️ Google Drive backup every hour (Oct 12 2026)

- His words: «اجعل النسخة الاحتياطية التي تُرسل إلى Google Drive كل ساعة نسخة». `isDriveUploadDue` = an hour
  after the last successful upload (`DRIVE_UPLOAD_EVERY_MS`); HomeView checks every 5 minutes and when the app
  comes back to the front (after the first run, once the real list is loaded). The upload is web-side, so it
  runs while the app is open / in memory - a closed app uploads on its next open.
- Pruning (`driveFilesToPrune`): the newest 48 copies (two days hour by hour) + the last copy of each of the newest
  30 days. The phone's own daily file backup (autoBackup.ts, 7 kept) is unchanged.

## 💰 «حسابي»: every place in front, in its full currencies + what the reps really owe (Oct 12 2026)

- His words (screenshot: «لك عند المندوبين 0» while his rep owed): «لا يظهر الذي على المندوب، كذلك أريد أن تكون
  التطبيقات البنكية والكاش كل شيء خارج الأمام وواضح ومحسوب بعملاته الكاملة».
- Reps: `WealthInput.reps` = each rep's three accounts added per currency (`repPosition` with `keepCurrency` →
  `repTotalByCurrency`) - the old `repBalancesMru` left out his customers' renewals (his debt), so he showed as owed.
  Each currency goes to its own side: what he owes → «لك عند المندوبين», what I owe him → «عليك للمندوبين».
- Places: every app / wallet is its own line (no more «البنوك والمحافظ (N)» group); «🏦 إدارة البنوك والمحافظ»
  under «عندك» opens the add / correct sheet. Every line shows `WealthLine.byCurrency` in full first (أورانج /
  نيتا in فرانك) and «≈ … أوقية» under it when anything is in another currency; the totals stay in أوقية.

## 💰 «حسابي» as a financial dashboard; the reports' «📊 الملخص» moved into it (Oct 12 2026)

- His request (six parts): summary cards, collapsible sections, comparisons, one search, alerts, a
  professional design - keeping every existing feature, no demo data in the real accounts, no change to how
  records or debts are computed. His answers: comparisons = «الأرباح والدخل والتحصيل» from the records (past
  balances are not kept, so never compared); the reports' dashboard moves entirely into «حسابي» (reports keep
  الصافي / ستارلينك / المتجر / الديون / المصروفات; a saved "dash" tab falls back to «الصافي»); the summary and the
  alerts open, the rest folded and remembered on the phone (`starnet.moneySections`, not backed up).
- Logic: `lib/moneyDashboard.ts` (pure, tested) on top of `buildWealth` - nothing recomputed another way:
  المال المتاح = the «عندك» lines; الالتزامات = «عليك»; المستحقات = «لك»; صافي المركز = المتاح + المستحقات −
  الالتزامات (= «كل ما تملك»). Big figure ≈ أوقية at the registered rates, the real amounts per currency under it.
  A transfer between his places never changes a total; a rep's customers' debt is counted once (inside the rep's
  line - ourDebtLedger).
- The finance dashboard's data now comes from `lib/financeDashboardData.ts` (same figures the reports page used).
  In «حسابي» its alert center renders inside «🔔 التنبيهات» (portal, `alertsHost`), with the money alerts:
  low balance, a negative place balance (= a missing or doubled record → open its statement), an account with no
  opening balance, bank notices waiting, currencies without a rate, promised payments due within 3 days.
- ⚖️ مقارنات سريعة: today vs the same day last month (clamped at month end); this month vs the same days of last
  month, or the whole last month on request - flagged «غير مكتمل» (no ▲/▼) because a running month vs a finished
  one is misleading; no comparison before the first record, «ناقص» when records start inside the earlier period.
- 🔎 one search over wallets, currencies, customers / suppliers / reps (balance lines first), personal income /
  expenses, the business's own الكاش entries, transfers, currency purchases and remittances, by name / note /
  number / amount (Arabic spellings folded); each hit opens its record (line sheet, place statement, section, tab).

## 📒 A rep's named accounts, like his old ledger app (Oct 12 2026 - council + his decisions)

- His words: «الحسابات التي أضفتها للمندوب جيدة ولكن ليست هي التي نعمل عليها. أنا والمندوب كنا نعمل على تطبيق
  مدونة حسابات وكل حساب وحده… حساب العملة وحده وهو الذي أسجل عليه من الأجهزة… أريد أن يمكنني إضافة رصيد لأي حساب له،
  والأجهزة تحسب تلقائيًا في حسابه الطبيعي الذي يأخذ منه ربح، وتلك الحسابات الأخرى لا علاقة لها بربح، هي فقط حسابات
  أمانة أو وديعة أو أنا أتدين من عند المندوب… وفي بوت المال تظهر له كل حساباته… والحساب الطبيعي دائمًا الاقتراح الأول».
  His old app showed per rep free-named accounts («<rep> الأجهزة», «شحن الأجهزة», «شهر 10», «أرباح <rep>»,
  «<rep> اورانج», «تنزيل دبو»…) and one total.
- Council report (artifact «دفتر حسابات المندوب»): build named accounts on top of the records, the normal account
  stays the only one tied to devices + profit, start with the rep only, bot in a second step.
- His decisions: build the first step now; trust / loan accounts count in «حسابي» «داخل له/عليه كالباقي» (not apart);
  «شهر 10» / «شحن الأجهزة» = free accounts like the others (not a monthly filter); in the bot the rep picks the account
  (normal first) and the owner sees it in the approval and can change it (next step).
- Built (step 1): lib/repLedgers.ts - its OWN store `starnet_rep_ledgers_v1` {ledgers, entries} (not settlements, so
  profit / normal accounts / paying his customers' devices / the bot / the rep copy can never read it). A ledger =
  {repId, name (unique per rep), kind trust | loan | free, its currencies (see «💱 … several currencies»)}; entries له (+) / عليه (−), «رصيد
  افتتاحي» (`opening`), all deletable; balance derived. «📂 حساباته» → «➕ حساب», each account: له / عليه / 🧹 تصفير /
  ✏️ الاسم / 🗑️ حذف (code). «حسابي» adds `repLedgerTotals` to the rep's له/عليه per currency.
- Step 2 (built, his «ابدأ الخطوة الثانية»): the money bot's 💵 دفعة who step starts with «💼 في حسابي» (his normal
  account - first, his rule) then «📒 في حسابي: <name> · <balance>» for each named account in the payment's currency
  (فرانك = سيفا), then his customers. Snapshot: `reps[id].ledgers` = "id\tlabel\tcurrency\tbalance" per line; the
  📂 حساباتك block, «📊 كشفي» and every confirmation list the named accounts too. Target "L:<id>"
  (`isPersonalTarget`, `namedTarget`); the request carries `ledgerId` / `ledgerName` (personal = false) and becomes a
  «handover» request. The approval card asks «في أي حساب من حساباته؟» (his choice preselected, changeable; only
  accounts of the chosen currency). A named account: `recordRepLedgerDeposit` = a له entry with `placeId` = the
  method's app in «حسابي» (devicePaymentAccountId) or الكاش (a linked cash entry, sourceKind "rep-ledger", removed with
  the entry; its سيفا goes to «كاش سيفا» like a rep's handover), `botId` counted once. Never his profit, his normal
  account or his customers' devices. App deposits count in the app's balance (`repLedgerFlows` in loadAccountFlows)
  and statement (moneyMovements `repLedgers`).
- **🟠 أورانج account in فرنك (Oct 19 2026, his choice «نعم، هو فرنك»):** a named account can show
  its سيفا as **«فرنك FCFA 🟠»** (`RepLedger.franc`): shown and typed in فرنك, stored in سيفا ÷5 like
  every أورانج amount, so «حسابي» still adds it in سيفا. A new account named أورانج/ORANJ/نيتا starts
  in فرنك; an existing one asks once on opening «هل المبالغ التي كتبتها فيه بالفرنك؟» (نعم → the typed
  amounts ÷5, e.g. his 6,652 → 1,330.4 سيفا shown as 6,652 فرنك; لا → shown only; اتركه بالسيفا).
  «💱 العملات» toggles it later (display only). Bot deposits are real سيفا and never converted.
- **🛂 «توثيق الأجهزة» account (Oct 19 2026, his choice «يمتلئ تلقائيًا»):** kind `travel`, one per rep;
  his existing account named «توثيق الأجهزه» became it (any account named توثيق, `normalizeRepLedgerBook`).
  Every «💰 سعر التوثيق» on that rep's verified devices is a «عليه» line there named by the device
  (`lib/repTravelLedger.ts`), **instead of** the debt in his normal account: the device-ledger debt
  is moved in (also old ones), the line follows the price (changed / removed with it, no 🗑 on it).
  A debt a payment was already allocated to stays where it was paid. His travel percent/share is
  unchanged. Known effects: the rep's own app no longer shows these debts (named accounts aren't in
  his copy); deleting the account deletes its lines (the prices stay - «سجّل الدين عليهم» re-posts).

## 💱 A rep's named account in several currencies (Oct 12 2026)

- His words: «هذه الحسابات اجعل يمكن أن أضيف لهم عملة، مثلًا هذا اورانج يجب أن يكون فيه سيفا و(أوقية)، وذاك MRO يعمل
  فقط بالعملة». His choices: «أنت تختار عملات كل حساب» (not every account taking every currency); اورانج = سيفا +
  أوقية; a currency may be removed from an account only when it has no entries (his MRO account was made in سيفا by
  mistake, empty: add أوقية then remove سيفا).
- Built: a ledger has `currencies: string[]` (≥ 1, his order) instead of one `currencyCode`; every entry carries its
  `currencyCode` (one of them). Old saved accounts keep their one currency (`normalizeRepLedgerBook` on load). Balance,
  statement «الرصيد بعدها», totals in «حسابي», app flows and الكاش entries are per the ENTRY's currency - never added or
  converted. The new-account form has currency chips (one or more) and the opening balance picks one; the account has
  «💱 العملات» (add one; ✕ إزالة only with no entries and never the last) and a currency choice beside the amount and
  in «🧹 تصفير» (zeroes that currency). Tile/header: «له 5,000 سيفا · عليه 20,000 أوقية» when the sides differ.
- Bot: one `ledgers` line per account AND currency (same id), so 💵 دفعة offers the account under each of its
  currencies; `namedTarget(repId, target, currency, s)` shows the balance in the payment's currency; approval lists
  accounts that HAVE the chosen currency.

- Same day: «الحساب الذي مكتوب عليه سيفا اورانج عدّله ليكون اسم الحساب شخصي» - the rep's normal سيفا account
  (repWallets id "SIFA") is now «🟠 حساب شخصي» (bot: «🟠 شخصي», button «💼 في حسابي: 🟠 شخصي»); name only, same
  records. Profit / أوقية keep their names.

## 🤝 A previous debt paid on a rep's customer's device carries his share (Oct 14 2026)

- His report: a rep's customer's device had a previous Starlink debt of 94.64 $; they agreed to charge 13,500 سيفا
  (both shares of profit inside). After paying it (/starlink «سدّد» the previous debt) the 13,500 showed in the rep's
  statement as «📡 تجديد عليه» but not in «📈 أرباح أجهزته جهازًا جهازًا» and with no «حصته / حصتي» on that day.
- Cause: the paid shipment took the rep only from the DEVICE (`representativeId`); when the device belongs to the rep
  through its customer only (`repSegments`), the entry had no rep → no commission row (it still counts as his debt
  through `repOperations`). Fix: `shipmentRepId(device, client)` = the device's rep, else the customer's current
  rep - used by the previous-debt payment (/starlink `payPrevious`), the home one-tap renewal and the device ledger's
  `representative`. Repair for what's already recorded: the operation's sheet on the rep's statement offers «🤝 احسب
  حصته من ربح هذه الشحنة (N%)» when a Starlink shipment has no rep (`setShipmentRepShare`, his current percent).

## 💳 «D» opens the card page's payment form + 🔔 notices of every edit (Oct 14 2026)

- His words: «اجعل عندما أضغط على D تظهر نفس هذه التي أدفعها عبر مكان البطاقة، تظهر سعر ما خرج من البطاقة… وإن لم
  تكن الميزة مفعّلة فعّلها: عندما أضيف ما خرج من البطاقة أن يحسب كأنه سعر جديد مقابل العملة… وأن يظهر لي إشعاره
  في الإشعارات… وأيضًا أي تعديل تم على الأجهزة أو الزبائن أو حذف لمعاملة أن يأتي إشعارها في الإشعارات».
- The card's red «D» now opens `/starlink?pay=<entryId>` (its oldest open D, `oldestOpenDebt`): the card page's own
  «تسديد D لستارلينك» form (amount in the cost's currency, «ما خرج فعلاً (دولار)», «السعر الحقيقي», card balance
  after); paid or closed → back to where he was (`history.back`). Supersedes Oct 12's LedgerDialog `openSettlement`
  (removed). The rate rule was already on: a changed «ما خرج» locks the real rate and sets the currency's current
  rate (`recordRealRate`); untouched amounts teach nothing (an old D never pulls today's rate back).
- Fixed: paying a previous debt used to set the CHARGE currency's rate from charge ÷ paid (13,500 سيفا for 94.64 $ →
  «1$ = 142.6 سيفا») - a price with profit in it, not a rate. Removed. (His سيفا rate may have moved on Oct 14 - check
  «العملات».)
- 🔔 Notices (`lib/changeLog.ts` pure + `changeLogStore.ts`, hooked into `saveDemoAccounts` / `commitDemoAccounts`,
  `saveClientStore` / `commitClientStore`, `saveLedgerStore`, `saveCurrencyStore`; the stored value before vs after
  each save → `addLocalEvent`): 💱 a currency's rate changed (`1$ = old ← new`); ✏️ a device edited (name, customer,
  rep, renewal date, monthly price, email, phone, KIT, notes, card - never Starlink-read fields), 🗑 trashed / gone,
  📦 archived; ✏️ a customer edited (name, phone, credit limit, rep, currency) / 🗑 deleted; 🗑 an operation deleted,
  ✏️ an operation's amount / currency / date / kind edited. Additions and a D being paid are no notice. More than 8 in
  one save (restore, merge…) = one summary notice. In the 🔔 list only (not the phone bar).

## 💳 Tap «D» to pay Starlink (Oct 12 2026)

- His words: «اجعل عندما أضغط على D تظهر لي مكان تسديد الفاتورة». The card's red «D» is a button: it opens the
  device's ledger with `openSettlement` = straight to «تسوية تكلفة Starlink» of its OLDEST unpaid shipment
  (`openDebtEntries`); settling or closing it closes the ledger too. The orange «D» (a previous owner's debt) opens
  /starlink (where previous debts are paid). No open D entry behind a red D → /starlink as well.

## 🔍 Home search (Oct 18 2026, «اجعل البحث احترافي»)

- 🕘 Every search is kept (`starnet.searchHistory`, phone-only, last 15): it counts after a 1.5 s pause or Enter;
  shown under the empty bar when tapped - tap to search again, ✕ / «مسح الكل» to drop. Typing letter by letter
  leaves one entry («سال» → «سالم»).
- ✉️ A pasted line holding an email («salehstarlink@outlook.com يحتاج كذا») keeps the email alone in the bar.
- Any part of the name, words in any order («سالم أحمد» → «أحمد ولد سالم»); Arabic diacritics/digits folded.
- 🔤 Typos only as a fallback when nothing matches exactly, marked with a note: 1 typo up to 6 letters, 2 from 7,
  none under 4; the first letter must be right; numbers (KIT, phone) are never guessed.
- 👤 A customer tapped in the home search opens his options (`ClientSearchSheet`, his Oct 18 2026 ask): 📋 his
  devices · ⛔ only the expired ones (the home list narrowed to him, «✕ كل الأجهزة» to leave) · 🔄 update them one
  by one in their browsers · 🌙 in the background · 🗂️ his file (the old tap). Faulty devices and limited
  emails are left out of the updates, as everywhere.

## 🟩 Sync run line (Oct 18 2026, «بدل هذه الإشعارات اجعله خطًا أخضر…»)

- A run (visible chain or 🌙 background) no longer shows one bubble per device: a see-through green line at
  the middle of the right edge fills as its devices finish, the device being read beside it (lib/syncRun.ts,
  components/SyncRunLine.tsx, `starnet.syncRun` phone-only). It stays until the run is over (full line, ❌ count
  if any), then hides after 3 minutes or with «إخفاء الخط». A background run's outcomes are fetched every 8 s
  while the app is open; one gone quiet 10 minutes (stopped from its notification) counts as over.
- Tapped: ❌ failed (with the problem in plain words) · ⏳ not finished · ⚠️ no data · ✅ done (fields changed);
  each device → «📍 إظهار الجهاز» / «🔄 إعادة»; «🔁 إعادة غير المكتملة» retries the run's same way.
- A save failure still shows its bubble; single-card syncs keep their bubble too.

## 📐 Card fixed lines (Oct 18 2026, «كل شيء مكانه ثابت لا يتحرك»)

- His order, each line one height and never wrapping: 1 the name + the email under it (tap = copy) · 2 the
  service bubbles (SIS ← STOP), D, ✓, P and the status badge · 3 «Starlink:» bill (its own currency first, ≈ USD
  after) + «فرق X $ · الدين» chip · 4 dish · Wi-Fi · country (the words «الطبق:/واي فاي:» drop under 400px).
  Rare extras (أضافه المندوب، مكرّر، بانتظار المسؤول) get their own line under 2.
- Buttons: WhatsApp · فتح الحساب · دفعة · 🔄 «تحديث» · ⋯ - «تجديد» moved into ⋯. One SVG icon set, same
  size, each its own color. «تحديث» first read in the background; he reported (Oct 18 2026) «التحديث في الخلفية
  غير جيد ولا يحدث نفس التحديث الطبيعي» - nothing changes, slow/stuck, dish and Wi-Fi gray - and chose the
  normal sync for the card (the device's browser opens, syncs by itself, closes).
- 🧭 To fix the background read on real data (the walk in SyncRunner is the same as the device browser's; the
  hidden overlay window is the suspect), every background device now records what each page gave
  (`SyncTrace.java` → `AutoSyncResults.trace` → the sync line's details «🧭 ما قُرئ»: ✓ complete · ⚪ partial ·
  ✗ nothing, with the seconds). Ask him for that line of 2-3 devices before changing the background walk.

## 📊 The money bot's «كشفي», 🔎 بحث and 🔔 new operations (Oct 19 2026 - his choices)

- His ask: «عندما يضغط كشفي تظهر له حساباته في مربعات… وعندما يضغط على أحدها يظهر له كشف حسابه… والمتبقي
  له بعد خصم كل شيء أو بعد خصم ربحه فقط، ولا تظهر له تلك الأجهزة». His picks: **summary + a button
  per account** (the squares of «📂 حساباته»: شخصي، الربح، الأوقية, then the named accounts - an empty
  other currency left out), **both** «⚖️ الباقي بعد خصم ربحك فقط» (money accounts + profit) and «⚖️ الباقي
  بعد خصم كل شيء» (+ named accounts, stored سيفا), each currency alone; **no device list** in كشفي.
- A button → that account's operations, 10 per page (⬅️ أقدم / أحدث ➡️, up to 10 pages), «📄 كشف PDF»
  (the service queues `repStatementPdf`; the app makes it and sends it in the money bot when open) and
  «↩️ كل الحسابات». Pages are prepared in the snapshot as `ks:<key>` (+`#kb`); the service shows them
  (`TelegramReplies.preparedPage`). Logic `lib/repBotStatement.ts`, wording `lib/repRowText.ts`.
- **«💰 ديون زبائني» and «📒 دفتري (له/عليه)» removed** from the money bot's keyboard and help (his ask
  «ازل ديون زبائني… ازل دفتري»); typing their words still works.
- **🔎 بحث = his money operations** («اجعله يمكن البحث عن عملية مالية معينة مثل دين أو دفع»): a typed
  amount (5000 / 5,000 / ٥٠٠٠), date (17/10) or word (دفعة، دين، سلفة، توثيق، an account's name) searches
  every operation of every account (`ops`, keys folded like the Java `normalize`, every word must
  match, 20 shown); buttons «➕ ما لك» / «➖ ما عليك» / «📋 آخر العمليات» (15 each). Any free text in the
  money bot is this search (the payment / loan / book flows take their text first).
- **🔔 Every new operation** in his accounts is sent to him once in the money bot (his extra pick):
  found by comparing operation ids at each snapshot refresh (`starnet.repBotSeenOps`, phone-only);
  the first time only remembers; up to 5 shown, then «… و N أخرى».
- Only when the money bot is connected; without it the devices bot keeps the old text statement.

## 📌 The reps' bots keep their bottom buttons (Oct 19 2026, «اجعل الأيقونات ثابتة»)

- His screenshot (money bot, «💵 دفعة جديدة - اكتب المبلغ»): the question was sent as a Telegram «force reply», which
  hides the buttons kept at the bottom of the chat, and nothing brought them back. Every flow already knows what it
  waits for (its pending stage), so `TelegramReplyService.send` swaps any force-reply markup for that bot's own kept
  buttons (devices bot `repKeyboard`, money bot `moneyKeyboard`; `TelegramReplies.keepKeyboard`, JUnit). The alerts
  bot keeps no buttons. «❌ أُلغيت الدفعة» only ever comes from the «❌ إلغاء» button (`payx`).
- His follow-up the same day «أيقونات بوت المال غير ثابتة أبدًا، مرات لا أجدها»: once hidden, nothing brought them back
  (most replies carry inline buttons or none). Now every plain reply (no markup) of the devices / money bot to a
  linked rep carries that bot's kept buttons again (`keepKeyboard(null, kb)` → kb); inline-button replies leave the
  bottom ones as they are. The app's own sends already default to the bot's buttons (`sendRepText` → defaultKeyboard).
- Then «لا توجد أي أيقونات» on a «كشفي» page: a reply with its own (inline) buttons can't carry the bottom ones, so
  buttons hidden earlier never came back there. Once per bot and chat (`TelegramStore.takeKeyboardRestore`), a short
  «📌 أزرارك أسفل المحادثة 👇» with the bot's buttons goes before such a reply; a plain reply that carried them marks
  it done. (His install of the previous build had failed - the bot answers from HIS phone, so it must be updated.)
- 💰 **The money bot is money only** (Oct 19 2026, «أي شيء لا يخص المال أزله من البوت»): his choice «طلب ⚡ تفعيل فقط» -
  the «تفعيل» command answers «⚡ طلب التفعيل في بوت الأجهزة: @…» and the device money card lost its ⚡ button; an
  approved activation's amount + the month's total still arrive in the money bot. Keyboard unchanged (no preference).
- 💼 **The money bot asks only for his accounts** (Oct 19 2026: «أزل عني زبائنه، فأنا لدي فقط كشوف حساباته، وزبائنه
  يدفعهم عنده أو يتركهم»; his choices «كل المناديب» + «عملياته المالية فقط»): «💵 دفعة» → whose = 💼 his personal
  account or one of his 📒 named accounts, never a customer or a device (no customer pages, no 🔎 by customer /
  device; a typed name shows the same choice); «✏️ غيّر الحساب». «🔎 بحث» and any typed word search his money
  operations only (no customer list). Old buttons of messages already sent still answer.

## 📡 The rep statement PDF = what he owes only; profit is its own PDF (Oct 19 2026)

- His words (on الحسين's PDF with 7 cards and mixed rows): «لا أريد للمندوب هذا الكشف، أريد أن يكون لكل عمليات الأرباح
  والأرباح المنتظرة كشفها وحده، وكشف الحساب يضيف فقط الذي على المندوب من عمليات ستارلينك… الفوق فيه كثير من البطاقات،
  أضف فقط بطاقة المبلغ المتبقي عليه»; also «أين العملية الأخيرة لم أرها».
- «🖨️ تصدير الكشف PDF» / «📤 أرسل له الكشف» (`buildRepStatementPdf`): ONE card «📡 المبلغ المتبقي عليه» (debt.closing)
  and only the «ما عليه» rows (`repRowAccount === "debt"`), **newest first** (the last operation on top), column
  «ما عليه بعدها». New «📈 كشف الأرباح PDF» / «📤 أرسل له كشف الأرباح» (`buildRepProfitPdf`): حصته المؤكدة · المتوقعة
  (D) · دفعت له من ربحه · ربحه الآن, the confirmed / expected profit tables, and the «ربحه» rows, newest first.
- A bot payment shows in the statement only once approved in «طلبات المندوب» (then `recordRepMoneyHandover`).

## 📄 The customer's statement, his own design (Oct 19 2026)

- He sent a mockup + spec (مولاي زويرا): smaller type (title 13-14, numbers 14, details / date 11-12); kind + device /
  email on top, the email on its own line with a copy button; «19 أكتوبر 2026» on one line, the time smaller; three
  equal fixed columns الرصيد قبل · المضاف للدين (red, +) / المسدَّد (green, payments) / المخصوم (adjust) · الرصيد بعد (the
  clearest number, red when owed, green when not), the others gray; the currency once per movement; «الربح: X» tiny
  and muted under a shipment («الربح غير محسوب» while its cost isn't settled), hideable («🙈 إخفاء الربح»,
  `starnet.statementShowProfit`); filters الكل / الشحن / التسديد / التعديلات + 🔍 by email or device; PDF and image in
  one «⬇️ تصدير» sheet; the summary says «المتبقي عليه» and «رصيد يدوي» is «تسوية رصيد» (tap = its movements).
- Logic `lib/partyMovements.ts` (movementView, filterMovements, arabicDate); rows now carry `accountId`.

## 🏷️ The clients page by category, his own design (Oct 19 2026)

- Top: «الزبائن والموردون» + ⋮ (holds «📥 استيراد زبائن»), then a big «＋ إضافة زبون» (with «💵 دفعة من زبون» beside
  it), the search with ☰ «تصفية», the category row «الكل | 📡 ستارلينك | 👤 عام | his own | ＋ تصنيف» with counts,
  the filters (زبائني / الكل / زبائن المندوبين / each rep · الحالة: مدينون لنا / لهم رصيد / حساب متوازن), then
  «إجمالي ما لنا في الاختيار المحدد» - it follows the category and the filters - then the cards.
- 📡 ستارلينك = has devices (or was added inside «ستارلينك» before his first device); 👤 عام = no device, or store
  sales, or tagged «عام». **One account per customer** in any number of categories - categories never split his
  debts. His own categories (name + one of 8 colors) are business data `starnet_client_categories_v1` (backed
  up); deleting one only removes the tag. Logic `lib/clientCategories.ts`; tags on `Client.categories`.
- Add form: name, phone, 🏷️ categories, 🤝 rep (optional). Inside «ستارلينك» the category is ticked and
  «📡 حفظ وإضافة جهاز» opens the add-device form for him.
- His follow-up (same day): the filters are **hidden on opening**, «☰ تصفية» shows/hides them and carries a
  count when a filter differs from the default (زبائني · الكل), with «↺ مسح التصفية». «＋ إضافة زبون» opens its own
  bottom sheet (not inline between the summary and the cards): الاسم، الهاتف، two big «📡 ستارلينك / 👤 عام» buttons
  (the open category ticked, «الكل» ticks none) + his own categories, the rep, then «⚙️ خيارات أخرى» (سقف الدين،
  العملة) folded; «📡 حفظ وإضافة جهاز» shows whenever ستارلينك is ticked.

## ⏳ A charge before its invoice comes down (Oct 19 2026)

- His problem: «عندما أدفع عن الجهاز دينًا وأريد أن أشحنه شحنة جديدة أو أفعّل له ROM… لا تنزل الفاتورة في نفس
  الوقت، فأضطر إلى تثبيته إلى أن تنزل ثم أضيف المبلغ». His choices: «تسجيل فوري + تأكيد تلقائي»; he always knows
  **the customer's price only** (Starlink's cost comes from the invoice); the check = «إعادة فحص الجهاز تلقائيًا»;
  the invoice goes into D **by itself with a notice**; it starts from **both** the charge form and the browser's 📌.
- Charge form (LedgerDialog, «عليه»): «⏳ الفاتورة لم تنزل بعد» (highlighted when Starlink's bill reads 0) hides
  the cost fields; the charge is saved with an empty D `starlinkCost.awaitingBill = { since }` (status pending,
  amount empty - so it is not an open D in any sum, and its profit is «غير محسوب» until filled).
- Device browser's 📌 tab = «⏳ شحن بانتظار الفاتورة»: the customer's price + أوقية / سيفا / دولار (the last one
  remembered) → «⏳ سجّل الشحن» (staged like a read, `pinRequest.charge`; the app records it with today's rate
  and the device's rep terms, id `browser-charge-<syncId>` so a re-drain never doubles it); «📌 ثبّت فقط» keeps the
  old pin. No rate for the currency → the old pin + a message.
- The device is synced in the 🌙 background after the charge (times below) (`ScheduledSyncWorker` KIND_BILL,
  `lib/billChecks.ts`, phone-only `starnet.billChecks2`); any read after the charge whose bill exceeds the D's
  already open fills the oldest waiting D (bill currency, today's rate locked) → toast + 🔔 «⏳ نزلت فاتورة X: …
  ← سُجّلت D»; its remaining checks are dropped. A bill currency without a rate stays waiting with a message.
- **His Oct 20 2026 follow-up** (the invoice really hadn't come, but each check said «✅ تمت»): a check's
  notification / bot message says **only the result** (`BillCheckText`): «⏳ «X»: الفاتورة لم تنزل بعد - الفحص
  التالي بعد ساعة», «⏳ نزلت فاتورة «X»: 70.50 - افتح STAR NET لتُسجَّل D» (its remaining checks dropped at once), or
  «لم يُفحص (…)»; after the last one «انتهت الفحوص؛ يُملأ D في أي مزامنة عادية». **Checks at 30 min, 1 h, 2 h, 6 h
  and 12 h** after the charge (his own schedule, «فقط»; was 15 min / 1 h / 3 h).
- The card shows «⏳D» (dashed blue) while waiting; still empty after 24 h → a «⏳ … فاتورة الشحن لم تنزل» task in
  «خطة اليوم». Logic `lib/awaitingBill.ts`.
