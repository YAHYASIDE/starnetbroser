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
- **📱 The rep's copy carries devices only - no customers either way** (Oct 2026: «النسخ التي أرسلها
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
- **📋 The rep's copy is sent by hand** (his choice «لا، أرسلها بيدي» - no automatic copy). Devices he
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
