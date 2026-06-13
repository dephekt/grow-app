# grow-app Agent Notes

## Svelte 5 guardrail

**Svelte 5 (runes mode) + SvelteKit only. Never mix Svelte 4 idioms.**
Before writing any component, confirm `svelte@^5` in `package.json`. Use only
the right-hand column:

| Concern | Svelte 5 | Svelte 4 (never) |
|---|---|---|
| Local reactive state | `let n = $state(0)` | bare `let n = 0` treated as reactive |
| Derived value | `let d = $derived(n * 2)` | `$: d = n * 2` |
| Side effect | `$effect(() => { ... })` | `$: { ... }` reactive block |
| Props | `let { foo } = $props()` | `export let foo` |
| Two-way prop | `$bindable()` | implicit `export let` binding |
| Event handler | `onclick={fn}` | `on:click={fn}` |
| Child content | `{#snippet}` + `{@render children()}` | `<slot />` |
| Component events | callback props | `createEventDispatcher` |

- Shared cross-component state: runes in a `.svelte.js` / `.svelte.ts` module,
  not ad-hoc stores. `svelte/store` stays valid where a store is genuinely the
  right tool; reach for runes first.
- If you catch yourself typing `$:` or `export let`, stop. That is Svelte 4.
- Canonical syntax source: the official Svelte 5 docs (`svelte.dev/docs`;
  `svelte.dev/llms.txt` for an LLM-oriented dump), not pre-2024 blog posts or
  training memory.
- Pin `svelte` to a `^5` major; never float it backward.

## Phase 1 boundaries

- Site mode only: Daniel's local `grow/daniel-home/#` broker namespace.
- Browser clients use HTTP and SSE only; MQTT.js stays server-side.
- Do not add Keycloak, central mode, multi-site tenancy, InfluxDB, AC Infinity,
  Pulse, or `grow-rules` in Phase 1.
- App command publishes are not retained in Phase 1.
