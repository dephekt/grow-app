# grow-app

SvelteKit/Svelte 5 site-mode HMI for Daniel's local grow broker.

## Svelte 5 only

This app uses Svelte 5 runes mode. Do not introduce Svelte 4 idioms such as
`export let`, `$:` reactive blocks, `on:click`, or `<slot />`; see `AGENTS.md`
before editing components.

## Local development

```bash
pnpm install
pnpm dev
```

For UI work without local broker credentials, run against a static snapshot from
the deployed LAN site:

```bash
pnpm dev:live-snapshot
```

That sets `GROW_DEV_SNAPSHOT_URL` to `http://192.168.8.3:3080/api/snapshot`.
The dev server returns that snapshot from `/api/snapshot`, seeds `/api/events`
with the same snapshot, and validates entity commands without publishing them.
Override the source with `GROW_DEV_SNAPSHOT_URL=... pnpm dev` or use a saved JSON
snapshot with `GROW_DEV_SNAPSHOT_FILE=/path/to/snapshot.json pnpm dev`.

Default site-mode broker settings:

| Variable | Default |
|---|---|
| `GROW_SITE` | `daniel-home` |
| `MQTT_URL` | `mqtt://localhost:1883` |
| `MQTT_USERNAME` | `grow-app-site-daniel-home` |
| `MQTT_PASSWORD` | empty |
| `MQTT_PASSWORD_FILE` | empty |
| `MQTT_TOPIC_PREFIX` | `grow/daniel-home` |
| `MQTT_DISCOVERY_PREFIX` | `grow/daniel-home/_discovery` |

Time-series history (optional — the app degrades gracefully without it):

| Variable | Default |
|---|---|
| `INFLUX_URL` | empty (history disabled) |
| `INFLUX_TOKEN` / `INFLUX_TOKEN_FILE` | empty |
| `INFLUX_ORG` | `grow` |
| `INFLUX_BUCKET` | `GROW_SITE` value, else `daniel-home` |

When `INFLUX_URL` + token are set, `/api/history` serves trend series and the
`grow-history-recorder` sidecar (`node build-recorder/recorder.js`, same image)
writes numeric/binary readings from MQTT into InfluxDB. The browser never
connects directly to InfluxDB — history is queried server-side, same as MQTT.

The browser never connects directly to Mosquitto. The SvelteKit server keeps the
MQTT session, caches retained/current state, streams browser updates over SSE,
and publishes commands only through discovered command topics.

## Authentication

The app enforces its own login for every request (LAN and remote alike); only
`/health`, `/favicon.ico`, the login page, and the firmware device-token
endpoints are public. Auth is owned by the app, not the reverse proxy, so it
keeps working when the proxy or identity provider is unavailable.

- **Local accounts.** Username/password stored in a SQLite auth DB
  (`GROW_AUTH_DB`), hashed with scrypt. A bootstrap admin is created on first
  boot from `GROW_AUTH_ADMIN_PASSWORD[_FILE]` (or `..._HASH[_FILE]`); the secret
  is inert after that first boot and a later password change is never reset by
  it. Admins can create more local accounts and disable/enable users from
  **Users & access** (`/settings/users`).
- **Sessions.** An `HttpOnly`, `SameSite=Lax` cookie holds an opaque token; only
  its SHA-256 is stored. Sessions roll a 30-day window and survive restarts (the
  DB is on a persistent volume). The cookie is marked `Secure` only when the
  request arrived with `x-forwarded-proto: https` (TLS always terminates at the
  proxy), so it also works on the plain-HTTP LAN origin where that header is
  absent.
- **OIDC / SSO.** Wired in a follow-up. When `GROW_OIDC_ISSUER` and client
  credentials are set, the login page adds a "Sign in with SSO" button and
  authorizes users by OIDC group membership. With no OIDC env the app runs
  local-auth-only.

The auth DB needs a writable path. The container defaults `GROW_AUTH_DB` to
`/data/auth.db` and declares `/data` as a volume; mount a named volume there so
users and sessions persist across deploys. A daily maintenance timer purges
expired sessions and bounds the audit log — rows older than
`GROW_AUTH_AUDIT_RETENTION_DAYS` (default 90) are pruned and the table is capped
at the newest `GROW_AUTH_AUDIT_MAX_ROWS` (default 50000), so the public login
endpoint can't grow it without bound. See `.env.example` for the full list.

## Production container

The app publishes as `ghcr.io/dephekt/grow-app`. The container
listens on `PORT` with `HOST=0.0.0.0` by default:

```bash
docker run --rm -p 3080:3000 \
  -e MQTT_URL=mqtt://mosquitto-site:1883 \
  -e MQTT_USERNAME=grow-app-site-daniel-home \
  -e MQTT_PASSWORD_FILE=/run/secrets/MQTT_GROW_APP_SITE_PASSWORD \
  ghcr.io/dephekt/grow-app:edge-node24-bookworm-slim
```

`MQTT_PASSWORD` is useful for local shells. `MQTT_PASSWORD_FILE` is preferred in
Docker/Compose so broker credentials can be mounted as secrets.

## Updating the deployed LAN site

The deployed site at `http://192.168.8.3:3080` is not served directly from this
git checkout. It runs from the `media-stack` Docker Compose project:

- Compose file: `/home/daniel/dev/media-stack/grow/docker-compose.yml`
- Service: `grow-app-site`
- Published image: `ghcr.io/dephekt/grow-app:edge-node24-bookworm-slim`
- Port mapping: `3080:3000`

Pushing to `main` in this repo triggers the GitHub Actions workflow in
`.github/workflows/build.yaml`. That workflow builds and publishes the
`edge-node24-bookworm-slim` image tag. After the workflow finishes, the media
server still needs to pull the refreshed mutable tag and recreate the container.

Firmware packages default to the legacy Codeberg provider for compatibility.
Set `FIRMWARE_PACKAGE_PROVIDER=ghcr-oci`, `FIRMWARE_OCI_OWNER=dephekt`,
`FIRMWARE_OCI_PACKAGE_PREFIX=grow-fleet`, and
`FIRMWARE_OCI_TOKEN_FILE=/run/secrets/FIRMWARE_OCI_TOKEN` to fetch private
GHCR OCI firmware artifacts server-side.

From `/home/daniel/dev/media-stack`:

```bash
make grow-pull
make grow-app-site-up

curl http://192.168.8.3:3080/health
```

`make grow-pull` explicitly refreshes the already-present mutable `edge-*` image
tag. `make grow-app-site-up` recreates only the running grow-app service through
the remote `media-server` Docker context. Use `make grow-up` instead when the
grow Compose file or secrets need to be synced first.

If a change also edits `grow-fleet` device UI metadata, deploy the app first,
then update or republish the affected device discovery/UI config so the retained
MQTT metadata matches the new layout.
