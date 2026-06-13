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
| `MQTT_TOPIC_PREFIX` | `grow/daniel-home` |
| `MQTT_DISCOVERY_PREFIX` | `grow/daniel-home/_discovery` |

The browser never connects directly to Mosquitto. The SvelteKit server keeps the
MQTT session, caches retained/current state, streams browser updates over SSE,
and publishes commands only through discovered command topics.
