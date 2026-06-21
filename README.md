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

The browser never connects directly to Mosquitto. The SvelteKit server keeps the
MQTT session, caches retained/current state, streams browser updates over SSE,
and publishes commands only through discovered command topics.

## Production container

The app publishes as `codeberg.org/stackdrift/grow-app`. The container
listens on `PORT` with `HOST=0.0.0.0` by default:

```bash
docker run --rm -p 3080:3000 \
  -e MQTT_URL=mqtt://mosquitto-site:1883 \
  -e MQTT_USERNAME=grow-app-site-daniel-home \
  -e MQTT_PASSWORD_FILE=/run/secrets/MQTT_GROW_APP_SITE_PASSWORD \
  codeberg.org/stackdrift/grow-app:edge-node24-bookworm-slim
```

`MQTT_PASSWORD` is useful for local shells. `MQTT_PASSWORD_FILE` is preferred in
Docker/Compose so broker credentials can be mounted as secrets.

## Updating the deployed LAN site

The deployed site at `http://192.168.8.3:3080` is not served directly from this
git checkout. It runs from the `media-stack` Docker Compose project:

- Compose file: `/home/daniel/dev/media-stack/grow/docker-compose.yml`
- Service: `grow-app-site`
- Published image: `codeberg.org/stackdrift/grow-app:edge-node24-bookworm-slim`
- Port mapping: `3080:3000`

Pushing to `main` in this repo triggers the Forgejo workflow in
`.forgejo/workflows/build.yaml`. That workflow builds and publishes the
`edge-node24-bookworm-slim` image tag. After the workflow finishes, the media
server still needs to pull the refreshed mutable tag and recreate the container.

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
