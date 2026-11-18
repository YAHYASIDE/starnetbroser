# 🧭 مسارات العمل (his Nov 18 2026 ask)

His words: «احفظ المهام المعلّقة والمواضيع والأفكار والميزات في ملف، وأعطني برومت لأفتح شات جديدًا… أريد أن أفرّق
العمل: مكان لتطوير المشروع، ومكان للأجهزة أو الزبائن، ومكان لدراسات جديدة، ومكان للمهارات (skills)». To save
tokens each chat starts fresh and reads ONLY its own section here + `followups.md` (the to-do list) + `business.md`
(his decisions) when it touches money / messages / reps.

## Rules every chat follows

- One branch for all of them: `claude/app-control-wnkqnh` (CI builds the APK / EXE only from it). Before starting:
  `git fetch origin claude/app-control-wnkqnh && git merge --ff-only FETCH_HEAD` (or a merge if needed). On a rejected
  push: fetch + merge, never force-push. Only ONE chat writes app code at a time; «دراسات» and «المهارات» chats
  change only `.claude/` files unless he asks.
- When a chat finishes something: remove it from `followups.md` / this file in the same commit; a new decision goes in
  `business.md`; a new open item goes HERE under its chat's section.
- Reply to him in Arabic, short. Customer data, codes, keys and tokens never in chat or commits.

## 1. 🛠️ تطوير التطبيق (code, bugs, speed, security)

- 🔐 **Security & data-safety audit** (his Nov 18 ask: «تأكّد من قواعد البيانات ونظام بناء التطبيق أنه آمن، لا يخسر
  البيانات ولا يطيح تلقائيًا ولا يُخترق»). Known so far (from the work, not yet a full audit):
  - All business data lives in the phone (localStorage). Loss risks: uninstall / «مسح البيانات» / a full storage.
    Guards that exist: daily file backup, Google Drive copy, team link copy, the encrypted export. To check: the
    restore really works end to end, a warning when no backup for N days, storage near full (`storageGuard.ts`).
  - Team Firebase (live link, reps, chat, flags): everything is sealed with AES-256 before it leaves the phone
    (deviceSyncCrypto / backupCrypto) - Firebase sees ciphertext. BUT its rules allow ANY anonymous user of that project
    to read / write / delete `/starnet/**` → someone with the project's apiKey could delete or junk the synced copies
    (not the phone's own data). Candidate fix: rules locked to the team's uids (as done for «رابط الزبائن»), or App
    Check. Needs his OK (every team phone must sign in once more).
  - Freezes: fixed Nov 18 (base64 + backups after 2 min) + 🛟 safe mode; confirm with him the main phone is fine.
  - Secrets: Claude key `starnet.claudeKey`, bot tokens, Drive tokens are `starnet.*` (phone-only, not backed up). To
    check: none leak into backups, logs, error reports, notifications or rep copies.
  - Build: CI (preview.yml) runs typecheck + all tests before the APK; the APK is a debug build signed with the CI
    key. To check: dependency audit (`npm audit`), the update check (`appUpdate.ts`) only trusts the release.
  - Deliver: a report (Artifact, Arabic) with each risk = how likely, what it costs him, the fix; then fix in order.
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

## 3. 🔬 دراسات وأفكار جديدة (think first, build later)

- 👷 «رئيس العمّال» + 🤖 WhatsApp worker on 22227268 (followups 🛠️ 10, council report
  https://claude.ai/artifact/XMTLT5AE2wDQ4MRgXHBC79): waits for the Claude key, his OK to keep customers' facts
  encrypted on his server, a Meta System User token, Firebase Blaze, and «ابدأ».
- 📣 Ads: he asked «ماذا تقترح للإعلانات» - first idea is the «رابط الزبائن» link in every ad; budget not given yet.
- 🌍 Global roaming as profit (customers who travel), the IP / local-service question, opening more to customers.
- 🔑 Claude key payment refused (cards only - empty tax id, exact KAST billing address, 3DS, or another card).
- Use the `council` skill for any big idea before building.

## 4. 🧩 المهارات (skills)

- The skills live in `.claude/skills/`: `starnet` (working method + references), `starnet-browsers` (Starlink reads),
  `council`. Keep them true and short: a lesson learned in another chat is added here.
- Ideas: a skill for the security audit checklist; a skill for «رابط الزبائن» setup / support; trimming
  `business.md` (3,600+ lines) into topic files so each chat reads less.
