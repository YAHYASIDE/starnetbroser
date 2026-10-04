---
name: starnet
description: The STAR NET working method for this repo (YAHYASIDE/starnetbroser) - the Arabic-speaking operator's Starlink resale app (devices, clients, reps, store, cash register, cards, reports). Use it for ANY change or question about this app - a new feature, a fix, a UI tweak, "add a section/button/tab", "why does X show Y", reports, reps, KAST cards, settings, the Android plugin - even when the request is one short Arabic sentence or a screenshot. It covers how to consult the operator before building, where logic and tests go, how to verify at 360px, and how to ship (commit, push, CI, APK link).
---

# STAR NET - how we work

The operator runs a Starlink resale business from this Android app and speaks Arabic. He is not a
programmer: he judges the app on his phone, from the APK that CI publishes. So every task ends with
something he can install and try, explained in plain Arabic. `CLAUDE.md` at the repo root holds the
hard rules and data model - read it first; this skill is the working method around it.

## 1. Understand, then consult (before building anything non-trivial)

The operator's standing rule: «لا تفعل شي قبل ان تستشيرني وتتاكد من ماذ اريد واقترح علي شي».
He often writes one short sentence or sends a screenshot, and the obvious reading is not always
what he means.

- Look at the code first, so the questions are concrete (what exists, what it would touch).
- Then ask with **AskUserQuestion**, in Arabic, 1-4 questions, 2-4 options each, the recommended
  option first and labelled **«(مقترح)»**. Each option's description says what he will *see* in the
  app, not how it is coded. He usually picks the suggestion, so make it a good one.
- Skip the questions only for a small fix whose meaning is clear (a typo, a layout bug he showed),
  or when he already chose in an earlier answer.
- A question about the app ("why 45 vs 39?") gets an answer from the code and data, not a change.
- **His business facts and past decisions** (his money places and numbers, «الكاش» wording,
  «حسابي», what customers receive, notifications, what the rep's app has) are in
  `references/business.md` - read it before touching money, statements, messages or the rep app,
  so you don't ask again or undo a decision. **Every new decision he makes goes into that file in
  the same commit.**
- If a link can't be opened (e.g. TikTok is blocked here), say so and ask what's in it.

## 2. Build it the way the app is built

- Business logic goes in a pure module in `apps/web/src/lib/<name>.ts` with a `<name>.test.ts` next
  to it. Components only load, call and render.
- New stored business data: key `starnet_<name>_v1` (it is then in the backup automatically).
  Phone-only settings/conveniences: `starnet.<name>` (not backed up).
- Money: per currency, never mixed or silently converted; rates/percents are locked on the record
  when it's created; balances and stock are derived from records, never kept as counters. A record
  posted from another one (e.g. a cash-out from an expense) carries `sourceId`/`sourceKind` and is
  removed with it.
- UI: Arabic, RTL, must fit 360px with no horizontal scroll; signed numbers inside
  `<bdi dir="ltr">`; colors only from the CSS variables in `globals.css`; secondary content goes in a
  bottom sheet (`PartySheet` from `components/AccountsSection.tsx`), cards don't grow.
- Reuse what exists before adding: `normalizeSearchText` (homeInsights), `sumToMru`/`toMru`
  (reportsView), `recordCashEntry`/`removeLinkedCashEntries` (cashStore), `DateInput`,
  `formatAmount`, `LEDGER_CURRENCIES`/`LEDGER_CURRENCY_LABELS`.
- Anything about reading Starlink pages (sync, a wrong/missing/slow read, a «🧪 لقطة تشخيص», a new
  field from Starlink): also load the **`starnet-browsers`** skill - it has the pipeline map and the
  rules learned from real misreads.
- Native Android code lives in `packages/local-browser-plugin/android/...`. It can't be compiled in
  this container (no Android SDK) - CI compiles it, so keep native changes small and careful, and
  add the TS binding in `definitions.ts` + a stub in `web.ts`.
- Never put a real password, email, card number, phone or rep code in code, tests or commits - even
  if it appears in his screenshots. Tests use fake values (`DemoPass-1`, `demo-sender`, `1234`).
  The only exception: his own public business contacts he asked to print (see
  `references/business.md`), as code defaults (a test may check a default text containing them).
- Don't change `services/api` or `services/browser-worker`; keep `FEATURE_CLOUD_SESSIONS` false.
- There is no Prettier config: don't run Prettier over existing files (it reflows them to 80
  columns and bloats the diff). Match the surrounding style by hand.

## 3. Verify before pushing

Run the bundled check (typecheck of every workspace + both vitest suites):

```bash
bash .claude/skills/starnet/scripts/check.sh
```

Then look at the changed screens at **360px and 390px** with Playwright against the dev server - see
`references/ui-check.md` for the ready template (demo data seeding, the MRU rate the reports need,
Chromium path). Check `document.documentElement.scrollWidth` equals the width, look at the
screenshots yourself, and stop the dev server afterwards (`pkill -f "next dev"` exits 144 - that's
normal, run it as its own command).

## 4. Ship

- Commit on the working branch (`git branch --show-current`; at the time of writing
  `claude/local-isolated-browser`, PR #3). Message: an emoji + Arabic title line, then short Arabic
  bullets of what the operator will see; end with the attribution trailer lines the session gives.
  No model names in commits or code.
- `git push -u origin <branch>` (retry on network errors only). Never force-push.
- Wait for CI in the background, then report:
  ```bash
  bash .claude/skills/starnet/scripts/wait-ci.sh "$(git rev-parse HEAD)"   # run_in_background
  ```
  `Preview completed success` means the APK is published at
  https://github.com/YAHYASIDE/starnetbroser/releases/download/staging-latest/STAR-NET-Browser-debug.apk
  (the app's «تحديث التطبيق» also offers it). On failure, read the job log and fix - don't leave it red.

## 5. Report to the operator (Arabic)

Short and concrete, in what he will see and tap:
- what was added/changed, where in the app (screen → section → button);
- anything he must do (update the app, link something, register a rate);
- what is not verified on a real phone (native features like fingerprint, Gmail, KAST notifications)
  - say so plainly and ask him to try it;
- the APK link once CI is green.
No code, file names or English jargon unless he asks.
