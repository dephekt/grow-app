# grow-app — "Mission Control" design

## Overview
A redesign of the grow-app HMI (Dashboard + Device Settings) in a dark, instrument-panel
visual language. It replaces the earlier auto-generated UI with a deliberate system:
glanceable telemetry on the dashboard, and **purpose-built ("curated") UIs for high-value
settings sections with a graceful fallback to a raw entity list** everywhere else.

This bundle is a **design reference, not production code.**

## About the design files
- `MissionControl.dc.html` — an interactive HTML prototype. Open it in a browser (keep
  `support.js` in the same folder) to click through both screens live: nav, trends range
  selector, controller selector, settings tabs, section collapse, OTA, curated Alerts, and
  the guided Calibration flow with its live-stabilization simulation.
- It is a reference for **look + behavior**, authored in HTML. **Do not ship this HTML.**
  Recreate the screens in the grow-app SvelteKit / Svelte 5 codebase using its existing
  components, stores, and patterns.
- `support.js` — the runtime that renders the prototype. Needed only to open the `.html`;
  irrelevant to the Svelte implementation.
- `reference/` — source screenshots: the current grow-app dashboard & device-settings, and
  the Atlas Scientific pH/EC calibration guides that informed the guided-calibration flow.

## Fidelity
**High-fidelity.** Colors, typography, spacing, layout, and interactions are the intended
target — recreate pixel-close using the codebase's libraries, then bind to live data.

## Intended fonts (important)
**IBM Plex Sans** for UI, **IBM Plex Mono** for all numeric readings / IDs / status. The
current deployed app falls back to an all-monospace UI because its requested font isn't
loading — that is a bug to fix, not the design intent.

## Screens

### 1. Dashboard  →  `src/routes/+page.svelte`
Full-width command bar (site, broker status, device/entity counts, clock, DASHBOARD/SETTINGS
nav — SETTINGS shows an amber dot when any controller has an update). 12-col grid:
- **Trends** (span 8): multi-series line chart (pH / air °C / CO₂) with an interactive range
  selector (1h / 3h / 6h / 12h / 24h). Back it with InfluxDB history.
- **Circuits + Thermal** (span 4, stacked): pump status rows (irrigation / runoff — state,
  power, runtime) and the thermal-camera tile.
- **Water · Climate · Substrate** (span 4 each): compact readout tables (label · value ·
  status dot). **Substrate** is dashed + "PLANNED" (VWC, pwEC, bulk EC, substrate temp),
  pending the future VWC probe — gate it on the device existing.

### 2. Settings  →  `src/routes/device-settings/+page.svelte`
Left = controller selector (the fleet, with online LED + update dot). Right = category tabs
(Controls, Updates, Alerts, Calibration, Maintenance, Diagnostics, Other, with entity counts)
+ content. The active item in every selector highlights in amber.

## Core principle: curate, else fall back
For each settings category, **if the device's entity shape is recognized, render a
purpose-built UI; otherwise render the generic collapsible entity list.** Implement as a
registry of curated renderers keyed by recognized shapes, with the entity list as default.
Curated so far:
- **Updates** (OTA) — per controller: channel (Stable/Edge), Installed / Latest / State /
  SHA, Check + Apply (Apply gated on an available update & online). → `src/lib/FirmwareUpdatesPanel.svelte`
- **Alerts** — threshold entities grouped by metric into **rule cards** (armed band low→high,
  live-value marker, high/low alert state). Pump Relay's non-threshold alerts
  (overcurrent / leak / stall / dry-run) intentionally fall back to the plain list to
  demonstrate the pattern.
- **Calibration** — a guided, ordered flow (below).

## Guided Calibration (has a hard live-data requirement)
Per probe (pH / EC / RTD / ORP): an ordered step sequence with plain instructions —
- **pH:** Mid → Low → High
- **EC:** confirm probe K-type → Dry → Low → High
- **RTD:** single reference temp (rarely used)
- **ORP:** single point
**Hard requirement:** the calibration screen MUST subscribe to and display the **live sensor
value for the probe being calibrated**, with a stability indicator (recent-readings sparkline
+ STABILIZING / STABLE), and MUST keep the Calibrate command **disabled until the reading is
stable.** This mirrors the physical workflow — you watch the buffer reading settle before
committing. In the prototype this is simulated; in the app, wire it to the live MQTT value
for that probe. Calibrating a point advances to the next; any completed point can be re-armed
to recalibrate. Maps onto the Atlas EZO `Cal,*` commands (see `reference/`).

## Interactions & state
- App-level: `screen` (dashboard | settings), selected `node` (controller), settings `tab`,
  trends `range`.
- Settings: per-section open/close; OTA channel override + "install requested" per node;
  calibration: selected probe, per-step "done" map, live-reading buffer + stability flag.
- Status semantics throughout: **green** = ok / online, **amber** = warn / active / attention,
  **red** = alert / offline.

## Design tokens
- Background `#0a0b0d`; panel `#101216`; hairline border `rgba(255,255,255,.08)`.
- Text `#e6e8ec`; muted `#8a9099`; faint `#565c66`.
- Amber (primary/active) `#ffb000`; cyan `#38d6c8`; ok-green `#3fb950`; alert-red `#f0563a`.
- Radii: panels 6px, controls 5px, small 4px, pills/badges 999px. Borders 1px (amber 1px for
  active/primary).
- Layout: 1280px canvas, 12-col grid, 14px gaps; panel padding ~18–22px; min tap target ~36–40px.
- Numerals: IBM Plex Mono, tabular.

## Map to the codebase
| Design | Source |
|---|---|
| Dashboard | `src/routes/+page.svelte` |
| Device Settings | `src/routes/device-settings/+page.svelte` |
| Entity rows / controls | `src/lib/EntityRow.svelte` |
| OTA / Updates | `src/lib/FirmwareUpdatesPanel.svelte` |
| Entity grouping & presentation | `src/lib/device-presentation.ts` |
| Live snapshot / MQTT | `src/lib/live-snapshot.svelte.ts`, `src/lib/server/mqtt/*` |
| Types | `src/lib/server/mqtt/types.ts` |

## Caveats
- All values in the prototype are representative **mock data**; trends and calibration
  readings are **simulated**. Wire to live MQTT (and InfluxDB for history).
- The fleet (5 controllers) and several settings entities beyond the two real devices
  (atlas-hydro-kit, atoms3u-sensor-rig) are plausible **placeholders** — reconcile against
  real discovery.
- Substrate is a planned sensor shown for layout only.

## Files
- `README.md` — this spec
- `MissionControl.dc.html` — interactive prototype (open with `support.js` alongside)
- `support.js` — prototype runtime
- `reference/` — source screenshots + Atlas Scientific calibration guides
