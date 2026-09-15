# Architecture

## Stack and why

The requested stack is used as specified, plus two implementation-detail
choices within it (ORM, queue library) that weren't specified - justified
below since the task asked for reasoning on any technology choice.

| Layer | Choice | Why |
|---|---|---|
| Web/PWA | Next.js 15 (App Router) + React 19 + TypeScript | Server + client components in one framework, built-in PWA-friendly asset/caching pipeline, file-based routing keeps the day-grouped account list / account detail / login flow easy to navigate as the codebase grows into accounting later. |
| API | NestJS 10 + TypeScript | Opinionated module/service/controller structure maps directly onto the requested "Service Layer" and "Permission System" - modules (`auth`, `customers`, `accounts`, `browser`, later `billing`) are isolated by construction, not by convention, which is what "قابل للتوسع دون إعادة بناء" actually requires in practice. |
| ORM | Prisma | Type-safe queries generated from one schema file, first-class migrations (`prisma migrate`), and a schema that reads as documentation - a good fit for a data model that's explicitly going to grow (customers -> multiple devices -> later invoices/payments) without becoming unreadable. |
| Browser worker | Playwright for Node.js + a small Fastify control API | Same engine as before, now in the same language as the rest of the stack (no Python/Node boundary to maintain), still isolated in its own container per docs below. |
| Database | PostgreSQL 16 | As specified - relational integrity matters here (a StarlinkAccount belongs to exactly one Customer belongs to exactly one operator account; a future Invoice belongs to exactly one Customer), and Postgres is the safe default for that shape. |
| Queue | BullMQ (Redis-backed) | As specified (Redis + Queue) for scan operations - `@nestjs/bullmq` integrates directly with Nest's module system, and BullMQ's per-job concurrency limits are exactly the mechanism `MAX_CONCURRENT_WORKERS` and the per-account lock need. |
| Android | Capacitor wrapping the Next.js PWA build | One UI codebase (the web app) instead of a second native UI to maintain in parallel - Capacitor gives a real installable APK, secure storage, and native shell behavior (splash screen, status bar) without hand-rolling networking/auth/UI a second time in Kotlin. |
| Reverse proxy | Caddy | As specified - automatic Let's Encrypt TLS with a two-line Caddyfile, versus hand-rolled certbot timers for Nginx. |
| Monorepo tooling | npm workspaces | No extra global tool to install (pnpm/yarn would need to be installed first); workspaces resolve `packages/shared` as a normal dependency of `services/api` and `apps/web` with zero extra config. |

## Repository layout

```
apps/
  web/              Next.js PWA - the UI everyone actually uses
  android/          Capacitor wrapper around apps/web's build output
services/
  api/              NestJS - auth, customers, accounts, browser orchestration
  browser-worker/   Playwright (Node) - one container per running session
packages/
  shared/           Types and pure logic shared by api, web, and browser-worker
infra/
  docker-compose.yml, Caddyfile, deploy scripts
docs/
  this file, deployment, sizing
```

## Domain model, built for accounting later without a rebuild

Per the task's explicit constraint (no accounting features yet, but the
schema must not need a rebuild to add them):

- **Customer** and **StarlinkAccount** are separate entities from day one.
  A Customer can own N StarlinkAccounts (one-to-many now; the FK lives on
  StarlinkAccount, so this needs zero migration to later support a
  Customer having a billing profile, multiple contacts, etc.).
- Every entity uses a stable UUID primary key, never a mutable natural key
  (email, name) - so a customer's email changing later never cascades into
  foreign keys.
- `services/api/src/customers` and `services/api/src/accounts` are
  separate Nest modules with their own service classes - no controller
  calls Prisma directly, and no page in `apps/web` embeds business logic
  (validation, isolation rules, status derivation all live in the API,
  never in a React component). This is what makes adding
  `services/api/src/billing` later additive rather than a refactor.
- No God table: `StarlinkAccount` holds only account/device fields.
  Auth (`User`, `Device`, `RefreshToken`), browser session state
  (`BrowserSession`), and audit (`AuditLog`) are already separate tables in
  `services/api/prisma/schema.prisma` - the same separation a future
  `Invoice`/`Payment`/`Currency` set of tables will follow.

## What "isolated cloud browser session" means here (same guarantees as
before, ported)

- One Docker named volume per StarlinkAccount, holding Playwright's
  persistent-context profile (cookies/localStorage/sessionStorage/
  IndexedDB) - lifecycle independent of any container, so it survives app
  restarts, backend restarts, and being reopened from a different phone.
- One container per running session, on an internal-only Docker network,
  no published ports - reachable only from the API.
- A Postgres row lock (`SELECT ... FOR UPDATE`-equivalent via Prisma's
  interactive transactions) gates start/stop per account, so two phones
  opening the same account at once can't race two browser processes.
- `FEATURE_CLOUD_SESSIONS` stays off in production until authorized,
  exactly as before - see `services/api/src/config`.

## What still needs a real server/device to verify (same honest caveat as
the previous implementation)

This sandbox's network policy blocks pulling Docker base images and
downloading Playwright's Chromium binary (confirmed for both the Python
and Node Playwright packages), and blocks `dl.google.com` (Android SDK
components - confirmed with a direct request) - so the browser-worker's
actual Playwright+Chromium execution, and the Capacitor Android build,
are verified by GitHub Actions CI (which has normal internet access) and,
ultimately, by the acceptance tests on a real VPS/device - never claimed
as proven by this sandbox alone. Everything that COULD be verified here
(API logic, Prisma migrations, isolation/locking against real Postgres,
shared parsing logic) was verified for real, not mocked - see each
service's own test suite.

## Known dependency findings (tracked, not silently ignored)

`npm audit` at the repo root currently reports findings against
transitive **dev/build-time only** tooling - none of them reachable at
runtime by a real user of the API or the web/Android app:

- `@nestjs/cli`, `vitest`/`vite`, `tmp`, `glob`, `picomatch`,
  `@mapbox/node-pre-gyp` -> `tar` (via `bcrypt`'s native build step),
  `@capacitor/cli` -> `tar` (its Android template extraction step):
  all local dev-only tools, never deployed.
- `@nestjs/platform-express` -> `express`/`body-parser`/`multer`: real
  runtime dependencies, currently only fixable by an `@nestjs` v11
  major upgrade. Tracked for Stage 11 (tests, security, docs) rather
  than done as a drive-by change here, since a Nest major bump needs
  its own regression pass against the full auth/customers/accounts
  test suite.

The one *production*, internet-facing finding (Next.js, critical) was
fixed immediately when found - see the commit pinning `apps/web` to
`next@15.5.25`.
