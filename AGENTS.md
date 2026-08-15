# grow-app Agent Notes

## Svelte 5 guardrail

**Svelte 5 (runes mode) + SvelteKit only. Never mix Svelte 4 idioms.**
Before writing any component, confirm `svelte@^5` in `package.json`. Use only
the right-hand column:

| Concern              | Svelte 5                              | Svelte 4 (never)                     |
| -------------------- | ------------------------------------- | ------------------------------------ |
| Local reactive state | `let n = $state(0)`                   | bare `let n = 0` treated as reactive |
| Derived value        | `let d = $derived(n * 2)`             | `$: d = n * 2`                       |
| Side effect          | `$effect(() => { ... })`              | `$: { ... }` reactive block          |
| Props                | `let { foo } = $props()`              | `export let foo`                     |
| Two-way prop         | `$bindable()`                         | implicit `export let` binding        |
| Event handler        | `onclick={fn}`                        | `on:click={fn}`                      |
| Child content        | `{#snippet}` + `{@render children()}` | `<slot />`                           |
| Component events     | callback props                        | `createEventDispatcher`              |

- Shared cross-component state: runes in a `.svelte.js` / `.svelte.ts` module,
  not ad-hoc stores. `svelte/store` stays valid where a store is genuinely the
  right tool; reach for runes first.
- If you catch yourself typing `$:` or `export let`, stop. That is Svelte 4.
- **The one rule the linter cannot hold for you:** an `async` function bound as
  `onclick={fn}` is a floating promise. `no-misused-promises` sees the
  `setInterval(async …)` form and none of the attribute bindings, so nothing
  will fail. The handler has to deal with its own rejection — `void fn()`
  satisfies a type checker and still leaves the rejection unhandled.
- Canonical syntax source: the official Svelte 5 docs (`svelte.dev/docs`;
  `svelte.dev/llms.txt` for an LLM-oriented dump), not pre-2024 blog posts or
  training memory.
- Pin `svelte` to a `^5` major; never float it backward.

## Derived measurements — don't recompute them

Substrate VWC and pwEC are _derived_ from raw sensor counts, never stored.
InfluxDB holds only `substrate_raw_counts`, `substrate_bulk_ec` and
`substrate_temperature`.

- Canonical implementation: `src/lib/substrate.ts` (`deriveReadings`,
  `substrateCalibrationFor`). Calibration is per-zone, resolved from the zone's
  medium — see [docs/substrate-calibration.md](docs/substrate-calibration.md).
- History: `GET /api/history?domain=substrate&range=<1h..30d>` already applies
  the zone calibration per probe, returning `<node>:vwc` (%) and `<node>:pwec`
  (mS/cm) alongside the raw series.
- Never reimplement the TEROS curves or the Hilhorst intercept in a script or a
  Flux query. A second implementation drifts from the UI without anyone noticing.

Reading a dryback out of that history:

- Dryback is **relative to field capacity**, not percentage points. A 30–40%
  dryback (Homegrower Handbook p.57, veg week 1) from FC 54% is 32–38% VWC; read
  as points it would be 14–24%, which is bone dry and would read as a plausible
  answer.
- Field capacity is the peak _after the most recent `irrigation_events` row_ —
  join to that event rather than taking the maximum of the window.
- **A probe whose series begins after that irrigation has no baseline.** Report
  no dryback for it. A percentage computed off a false peak looks authoritative
  and means nothing.
- Bulk EC falls as the substrate dries even while pwEC concentrates. pwEC is the
  steering signal; reading bulk EC alone inverts the conclusion.

## Scope boundaries

- Site mode only: Daniel's local `grow/daniel-home/#` broker namespace. One
  codebase deployed per site — there is no central/multi-tenant grow-app.
- Browser clients use HTTP and SSE only; MQTT.js stays server-side.
- App-owned auth is in scope: local accounts and per-site OIDC (Keycloak) with an
  app-owned session. The app enforces login itself; a proxy only routes. Do not
  add central mode, multi-site tenancy, AC Infinity, Pulse, or `grow-rules`.
- App command publishes are not retained.
