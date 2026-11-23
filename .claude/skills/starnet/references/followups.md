# 📋 قائمة المتابعة (his list - kept HERE, not in the app)

His Nov 10 2026 rule: «قائمة المتابعة تكون هنا عندك أنت، تذكّرني بها مرات، وأضف لها كل ما كنا سنفعله ونسيناه أو
أجّلناه». Keep this file true: remove a line in the same commit that finishes it, add every new
agreed-but-not-built item or step he must do. Remind him of it in Arabic from time to time (a routine fires
into the working session) and whenever a task closes - short, the open lines only.

## 👤 عليك أنت

- 🔍 Nov 23 2026: a rep's profit jump - open the rep's «🔍 فحص حساب الربح» from 21/11 21:50 on the main phone, «📤 أرسل القائمة»
  to me; then he decides what to delete / fix (nothing touched before his OK).

- ☁️ WhatsApp Cloud API (Nov 22 2026): a new SIM for the agent → Meta app + number → Cloudflare token + GitHub secrets
  (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, WA_PACK_KEY) → paste Meta's ids in «☁️ واتساب الرسمي» → webhook in Meta.

- 🔑 Nov 21 2026: type the activation password in الإعدادات ← «🔑 كلمة سر التفعيل», activate one new KIT device and
  say whether the session stays after the activation finishes (if not: «🔍 تقرير الجلسة» from that device).

0. 💶 Correct the EUR rate in «💱 العملات» - Nov 21 2026 it was PINNED at 1$ = 0.27 € (his screenshot: 9.98 € paid
   11.45 $ was flagged «−25.86 $»). Steps given: «🔓 أزل التثبيت» ← «تعديل السعر» 1$ = 0.87 € ← «📌 ثبّت». Then
   decide whether past euro records (locked at a wrong rate) get corrected.
1. 🤖 Claude key WORKS (Nov 21 2026: key «STAR NET» created, saved, 🧪 «✓ يعمل - قال: جاهز»). Next for him: end
   «🛟 الوضع الآمن» (it was on - background parts, the WhatsApp agent included, don't run), switch on «🤖 وكيل واتساب»
   with 1-2 test numbers and tell me how the answers read; send his 10 daily commands for the foreman. If the key was
   left at 30 days it expires Dec 21 2026 - remind him a few days before.
2. 🧪 «لقطة تشخيص» of a Starlink support-ticket page (unblocks the auto-reply).
3. 🧾 «لقطة تشخيص» of a device's Starlink **Billing** page with a balance due (his example: 282.62 BBD) - unblocks
   «كشف الفوترة» below.
4. 📧 Gmail filter for his domain mail (postponed during the «بريد على نطاقي» setup): To `@starnet-om.com` →
   Create filter → ✓ Never send it to Spam.
5. 🌐 «رابط الزبائن» (built Nov 18 2026): create the separate Firebase project (Firestore + Anonymous), paste its
   firebaseConfig in settings ← البوتات ← «🌐 رابط الزبائن», publish the rules it shows, «✅ جرّب», then share the
   link and send a first customer his «🔗 رابط حسابه»; tell me how it reads.
6. 🔗 Install the Nov 19 2026 version on EVERY linked device (phone, laptop, المسؤول 2) - the paid-D fix only works
   when both sides have it; then set «🔐 رمز العملات» and pin the currencies he wants («📌 ثبّت»).
7. 🧭 Answer the 4 questions of the first Control Center report (https://claude.ai/artifact/A6bVVqGXqKEF7Z295UzXVR):
   MikroTik / Wi-Fi cards? who else uses the app and with what rights? try reading the dish status through the
   session on one device? USDT its own currency or as the dollar? Nothing of that plan is built before.

## 🛠️ لم يكتمل في التطبيق

- 💬 WhatsApp: confirm on his phone that WhatsApp Business notifications are read and the «رد» works (native, only CI
  compiled it); later, if needed, the official Meta Cloud API (he chose notifications first).

0. 🧾 «كشف الفوترة» (his Nov 10 2026 ask: «أريد منك فهم هذه الفوترة وكيفية الدفع عنها، لكي تضع لي زر اسمه كشف
   الفوترة… مثال: هذا الجهاز عليه 282.62 BBD»): read the Billing page's invoice list (date, description, amount,
   status) per device, explain what makes up the balance and how to pay it. He left the choices to me («لا تفضيل»)
   → defaults: the invoices (date, subscription / order, amount, paid or not) + the balance in Starlink's currency and
   in USD / سيفا, a «💳 ادفع الآن» that opens the device's payment page with his card filled; the button on the device
   card (sheet). Waits only for the Billing snapshot.
1. 💬 Auto-reply on the Starlink support page (#89, his agent 4) - waits for 1 + 2 above. Auto-send only when
   `safe_to_send`.
1b. 🤖 WhatsApp agent (his agent 5): WORKS since Nov 21 2026 on «المسؤول 2» with his test number (his screenshot: it
   answered «ماذا تتيحون» and gave a device's end date, out-of-country days left and «ما عليك أي دين»). Next: he reads
   more answers on the test number, then decides «كل من يراسلني».
   Nov 21 2026: «🎓 تدريب الوكيل», Haiku + «💰 استهلاك تقديري», and a fresh Starlink read before answering - all
   built (business.md). Waiting for his test on «المسؤول 2».
2. 🔴 Unread count on «💬 الدردشة» in «المزيد» (said «لم يُبنَ بعد» when the chat shipped; only inside the chat page).
3. Chat brief (SADAGHA, in his order): 🧾 rep statement period/type + Excel · ⚖️ disputes centre · 👥 member-to-member
   chats · 📎 Excel/Word/video files · ✏️ edit message + reactions · 🗂️ conversation tabs (المالية / الملفات /
   المهام / الأجهزة) · ⚡ quick replies · ⏰ scheduled statements.
4. 🤖 Bot bottom buttons «🤲 سلّمت» / «🤝 وعودي» / «💰 ديون زبائني» (offered «إذا أردت لاحقًا», not chosen yet).
5. 💬 WhatsApp Business «رسالة الترحيب» + «الردود السريعة» texts (offered to write them).
6. 🤝 Rep options the council left (need his agreement with the rep): wholesale price per device tied to cost, debt
   ceiling per rep, «استلمت لحساب المندوب».
7. 🌍 Opening the app to customers: the first step is built («🌐 رابط الزبائن» + «حسابي», Nov 18 2026); more (paying
   from the page, renewal requests) only after he tries it.
8. 🔑 Sessions from the team / reps arriving signed out (Nov 15 2026): two causes fixed (ticket test for reps' files,
   more cookie addresses). Waiting for his «🔍 تقرير الجلسة» from the phone that signed in and the one that received
   it - if the 🔑 ticket travels and the device is still signed out, Starlink keeps the sign-in outside the cookies
   (page storage) and the session copy must carry it too.
9. 🌍 Outside-the-country devices: offered (not chosen yet) a daily check of the devices outside their country, bot
   alerts 5 and 2 days before the restriction, «⚠️ مشبوه» when the days left jump back up, «🎯 فرص التجوال العالمي»,
   and the account's country («🇺🇦») read from «موقع الخدمة» on each card.
10. 👷 «رئيس العمّال» + 🤖 WhatsApp worker on his own number (council Nov 16 2026, report
   https://claude.ai/artifact/XMTLT5AE2wDQ4MRgXHBC79). He chose «لا الآن» for building, then talked it through:
   he writes to the foreman in Arabic (Telegram); a WhatsApp worker that really understands (Claude), learns his
   style from his corrections, and the foreman sees the conversations. His number 22227268 is «تم الربط» in WhatsApp
   Manager (business «YAHYA - ETS SADAGHA», his dev app «ETS SADGHA STOR») AND still works in his WhatsApp Business
   app = coexistence → the worker can read customers' messages and his own replies. He **approved a small server on
   his Firebase** (webhook). Still open: his OK to keep the customers' needed facts (devices, renewal, debt, prices)
   encrypted on that server; then his steps: Claude key → a Meta System User token (never in chat) → Firebase Blaze →
   turn off any old auto-reply / Meta AI. Shadow mode 2 weeks first. Nothing built before he says «ابدأ».
11. 📊 «عدّاد الاستعمال» (Nov 17 2026, offered with the weak-internet mode; he said «نعم ابنه» - the weak mode went first):
   count on the phone which pages / sections / big buttons he opens for two weeks, then list what he never used, he
   chooses what hides in «المزيد» or goes. Plus remove the dead code found: TodayPanel, idle LiveSyncRunner.
