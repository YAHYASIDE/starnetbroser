# Server sizing and what to buy

## What actually drives cost

Not the number of Starlink accounts you manage - the number of browser
workers running **at the same time**, which `MAX_CONCURRENT_WORKERS` caps
(see `.env`). A worker only runs while an account is open/being scanned;
`app/browser/manager.py` stops it after `WORKER_IDLE_TIMEOUT_SECONDS` of
inactivity and keeps only the (small) profile volume around. 200 accounts
with `MAX_CONCURRENT_WORKERS=4` costs about the same to run as 20 accounts
with the same setting - it just takes longer to get through all 200
sequentially/queued.

Per-worker cost (one headful Chromium + Xvfb + x11vnc, from real-world
Playwright-in-Docker numbers - not measured in this sandbox, which
couldn't run a worker at all, see the PR description):

- RAM: ~500-700 MB while a page is actively loading/rendering, ~250-400 MB
  once idle-but-connected.
- CPU: up to ~1 vCPU while a page is loading; near-idle once settled.
- Disk: a fresh profile volume is a few MB; expect it to grow to
  50-150 MB per account over months of use (cache, IndexedDB, service
  worker storage) - occasionally worth clearing if disk gets tight.

Backend + Postgres together: modest at this scale, budget ~1 GB RAM and
1 vCPU as a fixed floor regardless of account count.

## Recommended tiers

| Accounts | `MAX_CONCURRENT_WORKERS` | vCPU | RAM | SSD | Example VPS |
|---|---|---|---|---|---|
| ~20 | 4 | 4 | 8 GB | 80 GB | Hetzner CX32 / DigitalOcean 8GB Premium |
| ~50 | 8 | 6-8 | 16 GB | 160 GB | Hetzner CX42 / DO 16GB Premium |
| ~200 | 15-20 | 12-16 | 32 GB | 400-500 GB | Hetzner CCX43 / dedicated box |

Notes:
- These assume operators mostly open accounts one/few at a time rather
  than mass-scanning all of them simultaneously. If you want to regularly
  batch-scan e.g. all 200 accounts back-to-back overnight, size RAM/CPU for
  your actual `MAX_CONCURRENT_WORKERS`, not the account total - raising
  that setting is the real cost lever, not adding accounts.
- SSD, not spinning disk - Chromium profile I/O is latency-sensitive.
- The 200-account tier is close to where a single VPS starts being the
  wrong shape: `app/browser/manager.py` already separates "how many
  workers" from "where they run" (it just calls the Docker Engine API), so
  the natural next step past one box is a small fleet of worker hosts
  behind the same backend rather than one bigger box - not implemented in
  this PR, flagged here so it's not a surprise later.

## What to actually go buy

1. **A VPS** matching a tier above. Any provider with a Docker-friendly
   Ubuntu image works (Hetzner, DigitalOcean, Vultr, OVH, etc.) - pick one
   with a datacenter close to your operators for lower VNC latency, since
   that's the most latency-sensitive part of this system.
2. **A domain name** (or subdomain of one you own) to point at the VPS, so
   TLS/Let's Encrypt works and the Android app has a stable
   `https://...` URL to talk to instead of a bare IP. A few dollars/year
   from any registrar.
3. **Nothing else for TLS** - `docs/DEPLOYMENT.md` step 6 uses Caddy, which
   gets a free Let's Encrypt certificate automatically; no certificate
   purchase needed.
4. **Object storage for backups (optional but recommended)** - e.g. a small
   S3-compatible bucket (Backblaze B2, Hetzner Object Storage, AWS S3) to
   push the encrypted Postgres/profile-volume backups from
   `docs/DEPLOYMENT.md` step 8 to, off the VPS itself. A few dollars/month
   at this scale.
5. **A secret manager (optional, recommended past ~1 trusted operator)** -
   see `docs/DEPLOYMENT.md` step 3. Free tier of most managed options
   (Vault OSS self-hosted, cloud providers' secret managers) is enough at
   this scale.

Nothing here requires GPU, specialized hardware, or a CDN - this is a
plain compute + storage + bandwidth workload.
