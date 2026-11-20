# 🧭 مسارات العمل (his Nov 18 2026 ask)

His words: «احفظ المهام المعلّقة والمواضيع والأفكار والميزات في ملف، وأعطني برومت لأفتح شات جديدًا… أريد أن أفرّق
العمل: مكان لتطوير المشروع، ومكان للأجهزة أو الزبائن، ومكان لدراسات جديدة، ومكان للمهارات (skills)». To save
tokens each chat starts fresh and reads ONLY its own section here + `followups.md` (the to-do list) + `business.md`
(his decisions) when it touches money / messages / reps.

## Rules every chat follows

- His Nov 20 2026 rule: «عندما أطرح عليك أي تعديل، دلّني دائمًا في أي محادثة أرسله لكي يعدّلها». A request that
  belongs to another chat's section → don't build it here: name that chat («تطوير التطبيق»، «الأجهزة وزباين
  والمندوب»، «تسويق وإعلانات»، «دراسات وأفكار»، «ملفات المهارات») and give him a ready message to paste there.

- FIRST: `git fetch origin claude/app-control-wnkqnh && git checkout claude/app-control-wnkqnh` - this file and
  every decision live on that branch only (the default branch does not have them).

- One branch for all of them: `claude/app-control-wnkqnh` (CI builds the APK / EXE only from it). Before starting:
  `git fetch origin claude/app-control-wnkqnh && git merge --ff-only FETCH_HEAD` (or a merge if needed). On a rejected
  push: fetch + merge, never force-push. Only ONE chat writes app code at a time; «الدراسات» and «المهارات» chats
  change only `.claude/` files unless he asks; «التسويق» only the message texts (section 3).
- When a chat finishes something: remove it from `followups.md` / this file in the same commit; a new decision goes in
  `business.md`; a new open item goes HERE under its chat's section.
- Reply to him in Arabic, short. Customer data, codes, keys and tokens never in chat or commits.

## 1. 🛠️ تطوير التطبيق (code, bugs, speed, security)

- 🔗 Nov 20 2026 «المسؤولون يعدّلون أو يزيلون D ولا يظهر عندي، وما أفعله لا يظهر عندهم أحيانًا» - FIXED: a
  send-only round (the member busy: a sheet open / touched < 15 s ago) wrote the batch but not the head, and a later
  full round re-wrote the head only when cursors / counts moved - so an edit (counts unchanged) made while busy was
  never announced: the others read only up to the head's seq and listen to the head. Now every round announces new
  batches (`LinkState.headSeq`; an older phone announces once after the update). Test in deviceLink.test.ts. Still to
  confirm with his screenshots of «🔗 ربط الأجهزة» on his phone + an admin's after EVERY phone has the new build.
  Remember: on YAHYA another member's deletions wait in «🗑️ حذف من الفريق بانتظار موافقتك» by design (Nov 6 choice);
  while he is busy his phone only sends - the others' changes land after 15 s without touching.

- Done Nov 19 2026: team link - a paid D wins over an unpaid copy (`preferPaidD`), batchGet reads, a full phone
  said aloud and no half-applied round; the browser balance strip shows $ / أوقية / سيفا. Still open below.

- 🔐 **Security audit** - report done Nov 20 2026 (https://claude.ai/artifact/F9EwuFvy3pR2n1yyvU8Gf4), his answers in
  `business.md` «🔐 Security audit». Capacitor 6.2.3 done. Still open, in order:
  - 💳 Cards in the team link (`starnet_card_fill_v1` travels to every linked phone): clarify his «كل مندوب» first.
  - 💾 Backup gaps: Drive uploads don't count for «لا نسخة احتياطية منذ أيام»; the home banner only warns at 95 %
    (add 80 %). He tries a Drive restore on a spare phone (not the main one) and writes the backup password on paper.
  - 🔑 Private signing key in GitHub secrets + release build (not debuggable) - only after that restore test, and
    after he has the reinstall steps (every phone: backup → uninstall → install → restore).
  - 🔒 Team Firebase rules locked to the team's uids (approved) - every team phone signs in once more.
  - 🧹 Remove customer data (e.g. a customer's e-mail) from `.claude/` files; repo stays public, no history rewrite.
- 📊 Usage counter + remove dead code (followups 11).
- 🔴 Unread count on «💬 الدردشة» (followups 🛠️ 2); chat brief items (followups 🛠️ 3).
- 🤖 Bot buttons «🤲 سلّمت» / «🤝 وعودي» / «💰 ديون زبائني» (offered, not chosen).

## 2. 📡 الأجهزة والزبائن والمندوبين (daily operations)

- 🌐 «رابط الزبائن» (built Nov 18): he must create the separate Firebase project and try it (followups 👤 5); then
  his feedback; later ideas: pay / renew request from the page.
- 🔑 Sessions arriving signed out - waiting for his «🔍 تقرير الجلسة» (followups 🛠️ 8).
- 🧾 «كشف الفوترة» - waits for a Billing «لقطة تشخيص» (followups 🛠️ 0, 👤 3).
- 💬 Starlink support auto-reply #89 - waits for a ticket-page snapshot + the Claude key.
- 💬 WhatsApp: confirm notifications are read and «رد» works; welcome / quick-reply texts (offered).
- 🌍 Outside-the-country devices: daily check, alerts 5 / 2 days before restriction, «فرص التجوال العالمي» (offered).
- 💰 Open money questions he hasn't answered: the 44,000 gap in سيدي بوبكر's statement (left the totals after 10:27 -
  trash / move / deleted op?) and whether the two 88,000 «له» on Nov 12 are a duplicate.
- 🤝 Rep options left by the council: wholesale price per device, debt ceiling per rep, «استلمت لحساب المندوب».
- Use the `starnet` skill (+ `starnet-browsers` for anything the Starlink sync reads).

## 3. 📣 التسويق والرسائل (his Nov 20 2026 addition)

His words: «أضف شات لتطوير حالات الواتس وصور إعلانات مثل تيك توك أو الفيسبوك وتطوير رسائل للزبائن».
- Scope: WhatsApp statuses (text + picture ideas, a weekly plan), ad pictures / short videos for TikTok and Facebook,
  the texts customers receive (reminders, activation, statements, «رسالة الترحيب» and «الردود السريعة» of WhatsApp
  Business - followups 🛠️ 5), and every ad carrying the «🌐 رابط الزبائن» request link.
- Arabic first (Mauritanian customers), French when he asks; his business name STAR NET, his public numbers from
  «بيانات النشاط». No customer names, numbers or real account data in any ad or picture.
- Pictures / videos: the session's image / video tools cost credits - say the price and get his OK before each
  generation. Never claim what Starlink does not do (no «change your country», no fake speeds or prices).
- App code: only the message texts (`lib/customerMessages.ts`, `lib/whatsapp.ts` wording, `lib/activationMessage.ts`)
  with their tests; anything else goes to chat 1. Ads budget: not given yet - ask.
- Open: his ads question «ماذا تقترح للإعلانات» (first idea: the customer link in every ad), the welcome / quick-reply
  texts, a status plan.

## 4. 🔬 دراسات وأفكار جديدة (think first, build later)

- 👷 «رئيس العمّال» + 🤖 WhatsApp worker on 22227268 (followups 🛠️ 10, council report
  https://claude.ai/artifact/XMTLT5AE2wDQ4MRgXHBC79): waits for the Claude key, his OK to keep customers' facts
  encrypted on his server, a Meta System User token, Firebase Blaze, and «ابدأ».
- 📣 Ads: he asked «ماذا تقترح للإعلانات» - first idea is the «رابط الزبائن» link in every ad; budget not given yet.
- 🌍 Global roaming as profit (customers who travel), the IP / local-service question, opening more to customers.
- 🔑 Claude key payment refused (cards only - empty tax id, exact KAST billing address, 3DS, or another card).
- Use the `council` skill for any big idea before building.

- 🧭 Control Center report 1 (https://claude.ai/artifact/A6bVVqGXqKEF7Z295UzXVR): his 4 answers are pending
  (MikroTik / Wi-Fi cards, team roles, telemetry through the session on one device, USDT). Research clones were in
  /home/user/research (gone with the container - re-clone if needed).

## 5. 🧩 المهارات (skills)

- The skills live in `.claude/skills/`: `starnet` (working method + references), `starnet-browsers` (Starlink reads),
  `council`. Keep them true and short: a lesson learned in another chat is added here.
- Ideas: a skill for the security audit checklist; a skill for «رابط الزبائن» setup / support; trimming
  `business.md` (3,600+ lines) into topic files so each chat reads less.

## 📝 The prompts he pastes to open each chat (Nov 20 2026)

1. 🛠️ «اقرأ `.claude/skills/starnet/references/workstreams.md` القسم 1 (التطوير والأمان) واعمل على الفرع
   `claude/app-control-wnkqnh`. ذكّرني بالمفتوح فيه باختصار، ثم ابدأ بما أختاره. لا تغيّر شيئًا قبل موافقتي.»
2. 📡 «اقرأ `.claude/skills/starnet/references/workstreams.md` القسم 2 (الأجهزة والزبائن والمندوبون والحسابات)
   و`followups.md`، واعمل على الفرع `claude/app-control-wnkqnh`. ذكّرني بالمعلّق باختصار، ثم انتظر طلبي.»
3. 📣 «اقرأ `.claude/skills/starnet/references/workstreams.md` القسم 3 (التسويق والرسائل) على الفرع
   `claude/app-control-wnkqnh`. ساعدني في حالات واتساب
   وصور إعلانات تيك توك وفيسبوك ونصوص رسائل الزبائن. قل لي السعر قبل أي صورة أو فيديو.»
4. 🔬 «اقرأ `.claude/skills/starnet/references/workstreams.md` القسم 4 (الدراسات والأفكار) على الفرع
   `claude/app-control-wnkqnh`. لا تعدّل كود التطبيق.
   ذكّرني بالأفكار المفتوحة، واستعمل المجلس للأفكار الكبيرة.»
5. 🧩 «اقرأ `.claude/skills/starnet/references/workstreams.md` القسم 5 (المهارات) على الفرع `claude/app-control-wnkqnh`. حسّن ملفات `.claude/skills` فقط،
   واقترح أولًا ما ستغيّره وانتظر موافقتي.»

