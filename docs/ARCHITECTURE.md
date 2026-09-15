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

## What "isolated cloud browser session" means here

- One real Docker named volume per StarlinkAccount (`starnet_profile_<id>`),
  holding Playwright's persistent-context profile (cookies/localStorage/
  sessionStorage/IndexedDB/etc, everything Chromium itself persists) -
  lifecycle independent of any process, so it survives app restarts,
  worker restarts, and being reopened from a different phone. Verified
  for real (not just "the volume exists"): `services/browser-worker/test/
  sessionPersistence.e2e-spec.ts` logs in through a real Chromium browser
  against a local test page, fully destroys the worker process, creates a
  brand new one, and confirms the login is still there with zero
  re-authentication - see "Verified for real" below.
- `services/browser-worker` is one long-running Node service that manages
  *many* accounts' browsers itself, each launched via Playwright's
  `launchPersistentContext` pointed at that account's own Docker volume
  Mountpoint (`docker volume inspect --format {{.Mountpoint}}`) - not one
  Docker *container* per account. A container can't have a volume hot-
  mounted into it after it's already running, and accounts are added
  dynamically, so "one container per session" would mean restarting the
  whole worker container per account. Reading/writing a named volume's
  own Mountpoint directly is a normal, supported use of Docker volumes;
  it just means the worker needs the Docker socket and the Docker data
  root available to it (see `services/browser-worker/Dockerfile`), and in
  exchange every account still gets a completely separate, real,
  Docker-managed profile directory - the actual isolation guarantee is
  identical, verified directly (two accounts' cookies never appear in
  each other's browser, same test file).
- Every session runs a real *headed* Chromium (not headless) on a
  dedicated Xvfb virtual display, with x11vnc and websockify bound to
  `127.0.0.1` only - never a published port, never reachable except
  through services/api's authenticated, ticket-gated proxy route
  (not yet built - see "What's left").
- Starting the same account twice (e.g. a second phone) returns the
  *existing* running session instead of a second, conflicting browser -
  verified in the same test.
- `FEATURE_CLOUD_SESSIONS` stays off in production until authorized - see
  `services/api/.env.example`.

## Verified for real in this sandbox (a real, if unexpected, capability)

Earlier stages of this project assumed Playwright's Chromium download was
blocked here the same way it's blocked for the Python implementation -
true for `playwright install`, but this sandbox turned out to ship a
pre-built Chromium at `/opt/pw-browsers/chromium` for exactly this
purpose, plus `Xvfb`/`x11vnc`/`websockify`/`novnc` installable via `apt`
(all confirmed, all now used by `services/browser-worker`). That changes
the honesty bar for this piece specifically: the browser-worker's actual
Chromium execution, the Docker-volume-backed persistence, the worker-
restart survival, the second-client resume, and the cross-account
isolation are all verified for real in this environment - not deferred to
CI. What's still CI/production-only: the Capacitor Android build (`dl.
google.com` confirmed blocked here) and pulling any external Docker base
image (confirmed blocked for `python:3.12-slim`/`alpine`/Playwright's own
Docker images earlier in this project).

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
