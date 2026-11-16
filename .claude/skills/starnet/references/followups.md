# 📋 قائمة المتابعة (his list - kept HERE, not in the app)

His Nov 10 2026 rule: «قائمة المتابعة تكون هنا عندك أنت، تذكّرني بها مرات، وأضف لها كل ما كنا سنفعله ونسيناه أو
أجّلناه». Keep this file true: remove a line in the same commit that finishes it, add every new
agreed-but-not-built item or step he must do. Remind him of it in Arabic from time to time (a routine fires
into the working session) and whenever a task closes - short, the open lines only.

## 👤 عليك أنت

0. 💶 Correct the EUR rate in «💱 العملات» («1 USD = 0.86 €» or today's real one) - it sat at ~1.01, every euro bill
   was ~15 % under its cost. Then decide whether past euro records (locked at the wrong rate) get corrected.
1. 🔑 تفعيل مساعد Claude - Claude payment page refused («Vos informations n'ont pas pu être enregistrées», a made-up
   tax number «Mrt001» was typed): leave the tax field empty → G Pay; else «Carte»; else «Ignorer pour le moment» and
   later Billing → Add credits (5$) with an international card (KAST) → API Keys → Create Key → paste in
   الإعدادات ← البوتات ← «🤖 مساعد Claude» ← حفظ ← 🧪 اختبار. Never send the key in chat.
   Nov 16: platform.claude.com still refused («unable to authenticate your payment method», with a fake tax id
   12345678 typed). Told him: empty the tax id, the KAST card's exact billing address/country, approve 3D Secure in
   KAST; else another card, or someone abroad pays once. Anthropic takes cards only (no USDT / Binance).
2. 🧪 «لقطة تشخيص» of a Starlink support-ticket page (unblocks the auto-reply).
3. 🧾 «لقطة تشخيص» of a device's Starlink **Billing** page with a balance due (his example: 282.62 BBD) - unblocks
   «كشف الفوترة» below.
4. 📧 Gmail filter for his domain mail (postponed during the «بريد على نطاقي» setup): To `@starnet-om.com` →
   Create filter → ✓ Never send it to Spam.

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
1b. 🤖 WhatsApp agent (his agent 5, built Nov 15 2026): once his Claude key works, he turns it on with his test numbers
   and tells me how the answers read; then «كل من يراسلني».
2. 🔴 Unread count on «💬 الدردشة» in «المزيد» (said «لم يُبنَ بعد» when the chat shipped; only inside the chat page).
3. Chat brief (SADAGHA, in his order): 🧾 rep statement period/type + Excel · ⚖️ disputes centre · 👥 member-to-member
   chats · 📎 Excel/Word/video files · ✏️ edit message + reactions · 🗂️ conversation tabs (المالية / الملفات /
   المهام / الأجهزة) · ⚡ quick replies · ⏰ scheduled statements.
4. 🤖 Bot bottom buttons «🤲 سلّمت» / «🤝 وعودي» / «💰 ديون زبائني» (offered «إذا أردت لاحقًا», not chosen yet).
5. 💬 WhatsApp Business «رسالة الترحيب» + «الردود السريعة» texts (offered to write them).
6. 🤝 Rep options the council left (need his agreement with the rep): wholesale price per device tied to cost, debt
   ceiling per rep, «استلمت لحساب المندوب».
7. 🌍 Opening the app to customers (his «أفكر أن أوسّع التطبيق ليشمل الزبائن») - big idea, council first.
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
