# STAR NET - project rules

Android app (Capacitor + Next.js static export) for running a Starlink resale business: devices
(accounts), clients, suppliers, representatives, store/invoices, cash register, reports. The
operator speaks Arabic; the whole UI is Arabic/RTL. Reply to the operator in Arabic.

## Hard rules

- Work only in this repo (`YAHYASIDE/starnetbroser`). Never touch `YAHYASIDE/starnetcloud`.
- Never force-push, never rewrite pushed history, never merge or delete the working branch/PR
  unless the operator asks.
- Never log or commit passwords, tokens, cookies, or any other secret.
- `FEATURE_CLOUD_SESSIONS` stays `false` in production.
- Do not change application code in `services/api` or `services/browser-worker`.
  `packages/shared` may change (types used by the web app).
- Ask the operator clarifying questions before building a large, ambiguous feature.

## Layout

- `apps/web` - the Next.js app (all UI and business logic). Pages in `src/app/*`
  (home = `components/HomeView.tsx`, `clients`, `store`, `representatives`, `reports`,
  `reminders`, `settings`, `currencies`, `archive`, `trash`).
- `apps/web/src/lib` - pure business logic, one module per store, each with a `*.test.ts`.
- `apps/android` - Capacitor shell; the native project is regenerated in CI, not committed.
- `packages/local-browser-plugin` - native isolated Starlink WebView per account + sync.
- `packages/shared` - shared types (`StarlinkAccountSummary`, ...).

## Data model rules (apps/web)

- All data lives in the phone's localStorage. Business data keys are `starnet_<name>_v1`; the
  full backup (`accountBackup.ts`) captures every `starnet_` key automatically, so any new store
  must use that prefix. Settings/tokens/PIN use `starnet.<name>` and are NOT backed up.
- Balances are per currency and never mixed or converted implicitly.
- Rates and percentages are locked onto the record when it's created (exchange rates, Starlink
  cost, representative percent and loss-sharing) - changing a setting later never rewrites history.
- Derive, don't store: balances, stock, and the till are computed from records, never kept as
  mutable counters. Every financial change is a reviewable, deletable record.
- Records auto-posted from another record carry `sourceId`/`sourceKind` (cash entries) or
  `invoiceId`, and are removed together with their source.
- Keep logic in pure functions in `src/lib` (unit-tested); components only wire state.

## UI rules

- Arabic, RTL, mobile-first; must fit 360px width with no horizontal scroll.
- Numbers with signs inside RTL text go in `<bdi dir="ltr">`.
- Cards must not grow: secondary content opens in a bottom sheet (`PartySheet`).
- Colors come from the CSS variables in `globals.css` (light + dark).

## Workflow

1. Implement, with unit tests for new `src/lib` logic.
2. `npm run typecheck` (repo root - builds packages then typechecks every workspace).
3. `npx vitest run` in `apps/web`.
4. Verify the UI with Playwright at 360/390px against `npm run dev -- -p 3100` in `apps/web`
   (Chromium at `/opt/pw-browsers/chromium`; stop the dev server afterwards).
5. Commit, push the working branch, watch CI (`.github/workflows/preview.yml`).
6. CI publishes the APK to the `staging-latest` release:
   https://github.com/YAHYASIDE/starnetbroser/releases/download/staging-latest/STAR-NET-Browser-debug.apk
   The app compares its build commit with that release to offer updates (`appUpdate.ts`).
