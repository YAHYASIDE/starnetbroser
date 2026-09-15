# Deploying the STAR NET cloud backend

This covers a single-VPS deployment with Docker Compose - the starting
point named in the task. It assumes Ubuntu 22.04/24.04 LTS.

**Before you start**: `FEATURE_CLOUD_SESSIONS` must stay `false` in any
production `.env` until you have written authorization to store encrypted
Starlink browser sessions server-side (see the compliance note in the task
description). Everything below still works with it off - accounts,
auth, devices all function; only `/browser/start` (and therefore scanning
and the remote view) will refuse with a 503 until it's turned on.

## 1. Server prerequisites

```bash
# As root or a sudo user
apt-get update && apt-get install -y docker.io docker-compose-plugin git
systemctl enable --now docker
```

Create a non-root deploy user and add it to the `docker` group if you'd
rather not run as root day to day.

## 2. Get the code

```bash
git clone https://github.com/YAHYASIDE/starnetbroser.git
cd starnetbroser
git checkout claude/cloud-remote-browser   # or main, once this PR is merged
```

## 3. Secrets

```bash
cp .env.example .env
# Generate real values - NEVER reuse the examples in .env.example:
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # -> JWT_SECRET
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"  # -> VAULT_KEY
openssl rand -base64 24                                          # -> POSTGRES_PASSWORD
```

Edit `.env` and fill in `POSTGRES_PASSWORD`, `JWT_SECRET`, `VAULT_KEY`.
Leave `FEATURE_CLOUD_SESSIONS=false` unless you have authorization (see
above).

**Secrets management**: a plain `.env` file is the minimum viable option
for a first deployment. For anything beyond a single trusted operator,
move `JWT_SECRET` and `VAULT_KEY` into a real secret manager (e.g. HashiCorp
Vault, AWS Secrets Manager, or even just `systemd`'s `LoadCredential=` with
root-only file permissions) and inject them as environment variables at
container start instead of committing them to a file on disk at all.
Whatever you use, **rotating `VAULT_KEY` re-encrypts nothing automatically**
- losing it makes all stored account secrets unrecoverable, so back it up
somewhere separate from the database backup.

## 4. Docker socket access (read this)

The backend starts/stops worker containers via the Docker Engine API, which
means it needs `/var/run/docker.sock` mounted in - see `docker-compose.yml`.
**This gives the backend container root-equivalent control of the whole
Docker daemon on the host.** For a first deployment on a dedicated,
single-purpose VPS this is a normal and accepted tradeoff (it's the same
model most CI runners and PaaS "build your own containers" products use).
If you want to reduce the blast radius later, put a
[docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) in
front that only allow-lists the specific API calls `app/browser/manager.py`
actually makes (`containers.run/stop/remove`, `volumes.create/get/remove`,
`networks.get/create`) and point `DOCKER_HOST` at that instead.

## 5. Build and start

```bash
docker compose build
docker compose up -d db backend
docker compose --profile build-only build worker   # builds the worker image the backend launches on demand
```

Check it's up:

```bash
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/config   # should show feature_cloud_sessions: false until you enable it
```

Migrations run automatically on backend container start (see
`backend/Dockerfile`'s `CMD`).

## 6. Put TLS in front of it

The backend binds to `127.0.0.1:8000` only (see `docker-compose.yml`) - it
is never meant to be reachable directly. Put a reverse proxy in front that
terminates TLS and forwards to it, including WebSocket upgrade (required
for the VNC proxy and the `/auth` endpoints alike). With Caddy (simplest -
automatic Let's Encrypt certs):

```
# /etc/caddy/Caddyfile
your-domain.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

```bash
apt-get install -y caddy
systemctl enable --now caddy
```

Point the Android app's "backend URL" field at `https://your-domain.example.com`.

Nginx works equally well but needs the WebSocket `Upgrade`/`Connection`
headers set explicitly on the `location /` block, which Caddy does by
default.

## 7. Turning cloud sessions on

Once you have written authorization to store server-side Starlink sessions:

```bash
# in .env
FEATURE_CLOUD_SESSIONS=true
```

```bash
docker compose up -d backend   # picks up the new env var
```

Confirm: `curl -s https://your-domain.example.com/config` should now show
`"feature_cloud_sessions": true`.

## 8. Backups

- **Database**: `docker compose exec db pg_dump -U starnet starnet | gzip > backup-$(date +%F).sql.gz`, on a cron job, encrypted at rest (the volume/disk should already be encrypted - see below - so a backup copied onto the same encrypted disk is covered; if you copy it off-host, encrypt that copy too, e.g. with `age` or `gpg`).
- **Browser profile volumes** (`starnet_profile_*`, one per account): these
  are what actually holds each Starlink session. Back them up with
  `docker run --rm -v starnet_profile_<id>:/data -v $(pwd)/backups:/backup alpine tar czf /backup/<id>.tar.gz -C /data .`
  if you want session-loss protection beyond "re-login once."
- **`VAULT_KEY` and `JWT_SECRET`**: back these up somewhere separate from
  the database dump - see step 3.

## 9. Disk encryption

Use LUKS (or your VPS provider's disk-encryption-at-rest option, if it
offers one) on the volume backing Docker's data root
(`/var/lib/docker`, where both the Postgres data volume and the browser
profile volumes physically live). This satisfies "تشفير القرص" for the
browser profile files, which aren't practical to field-encrypt individually
(they're Chromium's own SQLite/LevelDB files) - the sensitive
*application* fields (passwords, wifi codes, notes) are separately
encrypted at the database-row level regardless (see `app/security.py`
Vault), so that layer doesn't depend on disk encryption at all.

## 10. Monitoring resource usage

`app/browser/manager.py` enforces `MAX_CONCURRENT_WORKERS` and stops idle
workers after `WORKER_IDLE_TIMEOUT_SECONDS`, but you should still watch the
host:

```bash
docker stats                      # live CPU/RAM per container
df -h /var/lib/docker             # disk - profile volumes grow slowly over time
```

Set up basic alerting (even a cron job emailing on `df` > 80% is better
than nothing) before scaling past ~20 accounts.

---

See `docs/SERVER_SIZING.md` for how to size the VPS itself, and what to
actually go buy.
