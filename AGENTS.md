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

## Scope boundaries

- Site mode only: Daniel's local `grow/daniel-home/#` broker namespace. One
  codebase deployed per site — there is no central/multi-tenant grow-app.
- Browser clients use HTTP and SSE only; MQTT.js stays server-side.
- App-owned auth is in scope: local accounts and per-site OIDC (Keycloak) with an
  app-owned session. The app enforces login itself; a proxy only routes. Do not
  add central mode, multi-site tenancy, AC Infinity, Pulse, or `grow-rules`.
- App command publishes are not retained.

## Codebase knowledge graph

A committed `understand-anything` knowledge graph maps this codebase — every
file, function, import, and a 6-layer architecture (MQTT & State Core, Firmware
OTA Server, Client Presentation & State, Routes & API Surface, Test Suites,
Build/Infra/Docs) plus a 13-step guided tour. Use it to orient before changing
code instead of re-deriving structure by hand.

- Graph: `.understand-anything/knowledge-graph.json`. Read it directly, ask
  questions with `/understand-anything:understand-chat`, or explore visually with
  `/understand-anything:understand-dashboard`.
- It is kept fresh automatically (`autoUpdate: true` in
  `.understand-anything/config.json`): a commit triggers an incremental refresh
  and session start flags a stale graph. Incremental updates spend no LLM tokens
  on cosmetic changes — only on structural ones (new/removed
  functions/classes/imports/exports).
- If you make structural changes and the auto-update hook does not fire, run
  `/understand-anything:understand` to refresh; it updates only changed files.
- Tracked: the graph, `meta.json`, `fingerprints.json`, `config.json`,
  `.understandignore`, and `intermediate/scan-result.json`. Regenerable scratch
  is gitignored — do not commit it.
