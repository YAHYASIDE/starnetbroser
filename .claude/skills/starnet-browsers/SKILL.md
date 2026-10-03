---
name: starnet-browsers
description: How STAR NET's per-device Starlink browsers read account data (the sync) - the TypeScript page extractor, the Android sync flows, and the web merge. Use it whenever the operator reports a wrong, missing or slow Starlink read ("الطبق يظهر رمادي", "التاريخ خطأ", "الرصيد لا يظهر", "المزامنة بطيئة", "لا يقرأ البطاقة"), sends a «🧪 لقطة تشخيص» file or a screenshot of a Starlink page, or asks to read a new piece of information from Starlink - even if he just says "المتصفح" or "المزامنة". Use together with the `starnet` skill (consult, verify, ship).
---

# Starlink browsers - reading pages fast and without errors

Every device has its own isolated Starlink browser on the phone. "Sync" opens the account's pages,
runs one extractor script on each, and stores what it found on the device. Errors come from three
places - reading too early (page not finished), reading the wrong thing (a label matched in the
wrong spot), or not reading at all (a page/label the extractor doesn't know). This skill is the map
plus the rules learned from real misreads; keep it updated when you learn a new one.

## The pipeline (where to change what)

1. **Extractor (TypeScript, pure, tested)** - `packages/local-browser-plugin/src/webExtraction/`
   - `extractStarlinkFields.ts` - builds `SyncedStarlinkFields` (type in `src/definitions.ts`) from
     the page: one place that calls every reader.
   - `textFields.ts` - label lists in **English and Arabic** (`*_LABELS`) and the readers
     (`extractLabeledValue`, `extractBalance`, `extractPaymentCardLast4`, dates...).
   - `deviceStatus.ts` + `statusColor.ts` - the dish / Wi-Fi colored dots (and `dotTrace`).
   - `navigation.ts` - the taps (rail icons by aria-label, first subscription row, «الأجهزة»).
   - `language.ts` - switching the page to English (reads are most reliable in English).
   - `snapshot.ts` - «🧪 لقطة تشخيص»: the page with every personal word masked.
   - `injectedScript.ts` - exposes `__starnet*` globals; bundled by `scripts/bundleWebExtractor.mjs`
     into `android/src/main/assets/starlinkExtractor.js` **in CI** (the bundle is not committed).
2. **Android flows** - `packages/local-browser-plugin/android/src/main/java/com/starnetbroser/localbrowser/`
   - `AccountBrowserActivity.java` - the on-screen «مزامنة» in a device's browser: English first,
     then each page is **read until it settles** (`SettleTracker`), Subscriptions → subscription →
     «الأجهزة» (waits for a colored dot) → Billing → Settings → Home (banners: never final before
     3.5 s). After a tap a read only counts once the page changed.
   - `AutoSyncWorker.java` - background sync. A run over many devices reads Home only (pace +
     Starlink's 429 rate limit, `SyncPacing`), plus Billing once a week per device; a single device's
     own run does the deep walk (subscriptions, devices, billing, settings).
   - `StarlinkExtractorSupport.java` - loads the bundle, parses results, `settleKey`, `hasColoredDot`,
     `keepStoppedWithinRun` / `keepRestrictedWithinRun` (a later page never undoes "stopped" /
     "restricted" seen earlier in the same run).
   - `PendingSyncStore.java` - every read is saved to disk **before** it's announced; the web app
     drains it on open/resume, so nothing is lost if the app was closed.
3. **Web merge** - `apps/web/src/lib/starlinkSync.ts`: `mergeSyncedFields` decides what each field
   does to the device (`FIELD_INFO` gives its Arabic label/section); `apps/web/src/lib/repWorkspace.ts`
   `SYNC_FIELDS` lists the fields the sync owns (not a rep's change).

## Fixing a wrong or missing read (the reliable way)

1. Ask the operator for a **«🧪 لقطة تشخيص»** of that page (button in the device browser's top
   bar; it arrives on his Telegram bot as an `.html` file with personal words masked). A screenshot
   helps to know what *should* be read, but the snapshot is what reproduces it.
2. Save it under `packages/local-browser-plugin/src/webExtraction/fixtures/` with a descriptive name
   (`real-billing-page-card.html`). Check it: no real email, name, phone, card digits or KIT may
   remain - the masker shows them as `aaaa`/`سسس`/`0000`; if anything real survived, mask it by hand.
3. Write the failing test first in `realPage.test.ts` style (`loadRealPage(...)` then
   `extractStarlinkFields(document)`), then fix the reader. Prefer: a missing label → add both the
   English and Arabic wording to the `*_LABELS` list; a wrong match → narrow where the reader looks
   (near its label), never widen to a whole-page scan.
4. Run `npx vitest run` in `packages/local-browser-plugin` (all ~280 tests must stay green - many
   encode past real misreads).

## Adding a new piece of information (end to end)

1. Reader in `textFields.ts` (+ unit test with fake lines in `textFields.test.ts`).
2. Call it in `extractStarlinkFields.ts`; add the field with a doc comment to `SyncedStarlinkFields`
   in `src/definitions.ts` (the Java side passes fields through as JSON - no Java change needed).
3. Merge it in `starlinkSync.ts` (+ `FIELD_INFO` label, + test in `starlinkSync.test.ts`); add it to
   `StarlinkAccountSummary` in `packages/shared` if it's new on the device.
4. If it's only on a page the sync doesn't visit, add the visit (both `AccountBrowserActivity` and,
   if it matters in the background, `AutoSyncWorker`).

## Rules learned from real misreads (don't regress these)

- Read in English: the Arabic UI synced badly; `language.ts` switches each device's browser once.
- Starlink renders in the browser: right after a tap the old page is still shown, and Home's banners
  ("restricted", "scheduled to end") appear a moment later. Never trust a single early read - use
  the settled read; keep the Home minimum wait.
- Explicit booleans (`isRestricted`, `oceanMode`, `noSubscription`, `priorityDataExhausted`) are set
  true/false only when their page/section is on screen - absence is not "false".
- A gray dot is `unknown` only for a genuine dot candidate; balance is read near its label only
  (a whole-page scan once read the wrong amount); label lookahead skips buttons and other labels.
- A limited (non-admin) email has no Billing icon: no balance or card can be read from it.
- Dates: normalize digits (Arabic numerals) and never store a truncated date.
- **The renewal (billing) day is always 1-28** - the operator's rule: Starlink never bills on the
  29th-31st, so such a date is a misread (a device once showed 2026/10/31). It is rejected in the
  extractor (`isPlausibleBillingDate`, `extractBillingDueDay`) and again in the web merge.
- **Where the true day comes from, in order:** the **invoice list at the bottom of Billing: the
  latest row described «Subscription» / «اشتراك»** - never an «Order» / «طلب» row - wins over
  everything on the page; then a dated renewal line; then the cycle ("Payment due September 7").
  Real, confirmed: a stopped account's "Payment due October 1" is the failed payment's retry, not
  the billing day (24) - trusting it first showed 2026/11/01.
  Column order depends on the language: English is "Due Date, Description, Status" (date BEFORE the
  description), Arabic is status, description, date (date AFTER) - `extractSubscriptionInvoiceDueDay`
  learns the side from the rows themselves (which neighbor of each Subscription/Order cell is a
  date), the header only breaks a tie: on a real phone the header didn't come through as its own
  lines and the reader took the next Order's 9/1 (→ "2026/11/01").
- Never put real account data in tests or fixtures; fake values only.
- 🔄 A hidden WebView (`AutoSyncWorker`, never attached to a window) often doesn't render Starlink's
  SPA - the card's «تحديث من Starlink» "did nothing" for the operator. So the card button and
  «مزامنة الآن» open the device's **visible** browser with `autoSync` (EXTRA_AUTO_SYNC): wait for the
  sign-in, run the same «مزامنة», close back to the app; «مزامنة الآن» chains devices from
  `apps/web/src/lib/syncQueue.ts`: «اليوم» = today only, «3 أيام» = today + the next 2 days (3, 4, 5);
  also «الموقوفة بسبب الفوترة», «أضفناها اليوم» (`addedAt`), «كل الأجهزة». A faulty device and a
  limited (non-main) email sync **only from their own choice** - never by a day, «كل الأجهزة», a
  long-pressed calendar day, or the background list (faulty).
- 🔔 Every finished sync rings once (`AlertSound`, the phone's notification tone; silent mode stays
  silent): the device browser's «مزامنة» and every `AutoSyncWorker` run - unless its «تم التحديث»
  notification already made the sound.
- 📷 Camera / proof upload (Starlink's identity check): `CameraAccess` grants the camera only (never
  the microphone) while the visible page is Starlink; file inputs open Android's picker with the
  camera beside gallery/files (`CaptureFileProvider`, cache `starnet_capture/`). A file input's
  callback must always be answered once (null on cancel) or the page's button stops working.

## Testing the Java parts

Android classes can't compile here (no Android SDK) - CI compiles them. Keep decisions in pure Java
classes with no `android.*` import (like `SettleTracker`) and run their JUnit tests locally:

```bash
bash .claude/skills/starnet-browsers/scripts/junit.sh SettleTracker   # class name(s) under test
```
