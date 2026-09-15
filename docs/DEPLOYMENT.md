# Deployment: what to buy and how to run it for real

This is written for the exact point the project is at: `services/api`,
`services/browser-worker`, and `apps/web` all have real Dockerfiles and a
real `infra/docker-compose.yml` wiring them together with Caddy, but
**none of it has been run on a real VPS yet** - building the Docker
images needs pulling `node:20-bookworm-slim` from Docker Hub, which this
development sandbox's network policy blocks (the same documented
limitation as everywhere else in this project - see
`docs/ARCHITECTURE.md`). A real server has normal internet access and
this will just work; it is not something this sandbox can prove for you.

## What to buy - exactly this, nothing else

1. **One VPS** (Ubuntu 22.04/24.04, x86_64), sized by how many browser
   sessions run *at the same time* (`MAX_CONCURRENT_WORKERS`), not by how
   many Starlink accounts you manage in total - accounts that aren't
   currently open cost disk space only (each account's Chromium profile
   is roughly 200-400MB), not CPU/RAM.

   | Concurrent sessions | vCPU | RAM | SSD | Rough monthly cost |
   |---|---|---|---|---|
   | Up to 4 (small operation) | 2 | 4 GB | 60 GB | ~$20-24 |
   | Up to 10 | 4 | 8 GB | 120 GB | ~$40-48 |
   | Up to 20 | 8 | 16 GB | 240 GB | ~$80-96 |

   (A real headed Chromium + Xvfb + x11vnc session costs roughly
   400-700MB RAM and a meaningful CPU share while a phone is actively
   viewing it - budget per-session, not per-account.) Any mainstream
   provider works (Hetzner, DigitalOcean, Linode/Akamai, OVH, Contabo) -
   pick one with a public IPv4 address.

2. **One domain name** you control DNS for (any registrar). You need two
   subdomains pointed at the VPS's IP as `A` records, e.g.:
   - `app.yourdomain.com` -> the web app
   - `api.yourdomain.com` -> the backend

   Nothing else needs buying - Caddy (already wired in
   `infra/docker-compose.yml`) gets TLS certificates from Let's Encrypt
   automatically and for free once those two `A` records exist and ports
   80/443 are reachable.

## One-time server setup

```bash
# On the fresh VPS:
curl -fsSL https://get.docker.com | sh   # installs Docker + Compose plugin
git clone https://github.com/YAHYASIDE/starnetbroser.git
cd starnetbroser
git checkout claude/cloud-remote-browser   # or main, once merged

cp infra/.env.example infra/.env
# edit infra/.env: set WEB_DOMAIN, API_DOMAIN to your real subdomains,
# and generate real values for POSTGRES_PASSWORD, JWT_SECRET, VAULT_KEY,
# WORKER_INTERNAL_TOKEN (e.g. `openssl rand -base64 32` for each).

# Confirm this matches your VPS - most providers use the default:
docker info --format '{{.DockerRootDir}}'
# if it isn't /var/lib/docker, set DOCKER_DATA_ROOT in infra/.env to match.

cd infra
docker compose build
docker compose up -d
```

Point your domain's DNS `A` records at the VPS's IP before or right after
this - Caddy will keep retrying the certificate request until DNS
resolves.

## After it's running

- Open `https://app.yourdomain.com`, go to **الإعدادات (Settings)**, and
  enter `https://api.yourdomain.com` as the API address, then register
  the first account. This is the same runtime-configurable address used
  in every environment (dev, GitHub Pages preview, this VPS) - nothing
  about the backend URL is baked into the build.
- `FEATURE_CLOUD_SESSIONS` stays `false` until you have written
  authorization to run real cloud browser sessions in production - flip
  it in `infra/.env` and `docker compose up -d api` when that's in place.
- Back up `postgres_data` (the named volume) regularly - it holds every
  customer, account, and encrypted secret. The per-account Chromium
  profile volumes (`starnet_profile_<id>`) are also worth backing up if
  you want sessions to survive a full server rebuild, not just a restart.

## What's still unverified until this actually runs on a VPS

Per the same honesty standard as the rest of this project: the compose
file, both Dockerfiles, and the Caddy config are written correctly and
reviewed, but pulling `node:20-bookworm-slim` and building these images
has not been exercised anywhere yet (not this sandbox, not CI). The
first real `docker compose build` on a VPS is the first time these exact
image builds run - budget time for that as part of the first deployment,
and report back anything that doesn't match this document so it can be
fixed for the next person.
