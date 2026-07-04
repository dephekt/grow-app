<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import type { LiveSnapshot } from '$lib/live-snapshot-context';
  import type { EntityConfig } from '$lib/server/mqtt/types';
  import type { AuthenticatedUser } from '$lib/server/auth/users';
  import AccountMenu from '$lib/AccountMenu.svelte';

  let { live, user }: { live: LiveSnapshot; user: AuthenticatedUser } = $props();

  const snapshot = $derived(live.snapshot);
  const broker = $derived(snapshot.broker);
  const brokerLabel = $derived(broker.connected ? 'ONLINE' : broker.connecting ? 'CONNECTING' : 'OFFLINE');
  const brokerClass = $derived(broker.connected ? 'ok pulse' : broker.connecting ? 'warn' : 'alert');
  const site = $derived((snapshot.site || 'grow').toUpperCase());
  const sseDown = $derived(Boolean(live.error));

  function updateAvailable(entity: EntityConfig, value: string | null): boolean {
    if (entity.component !== 'update' || !value) return false;
    try {
      const parsed = JSON.parse(value) as { installed_version?: string; latest_version?: string };
      return Boolean(parsed.latest_version && parsed.latest_version !== parsed.installed_version);
    } catch {
      return false;
    }
  }
  const hasUpdates = $derived(snapshot.entities.some((e) => updateAvailable(e, snapshot.states[e.id]?.value ?? null)));

  let now = $state(new Date());
  onMount(() => {
    const timer = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(timer);
  });
  const clock = $derived(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  const pathname = $derived(page.url.pathname);
  const onDashboard = $derived(pathname === '/');
  const onIrrigation = $derived(pathname.startsWith('/irrigation'));
  const onSettings = $derived(pathname.startsWith('/device-settings'));
</script>

<header class="command-bar">
  <div class="identity">
    <span class="site mono">{site}</span>
    <span class="mode mono">SITE MODE · LOCAL BROKER</span>
  </div>

  <nav class="nav">
    <a class="tab" class:active={onDashboard} href="/">DASHBOARD</a>
    <a class="tab" class:active={onIrrigation} href="/irrigation">IRRIGATION</a>
    <a class="tab" class:active={onSettings} href="/device-settings">
      <span>SETTINGS</span>
      {#if hasUpdates}<span class="update-dot" title="Update available"></span>{/if}
    </a>
  </nav>

  <div class="status">
    <span class="broker" title={sseDown ? live.error ?? undefined : undefined}>
      <span class="dot {sseDown ? 'warn' : brokerClass}"></span>
      <span class="mono">{sseDown ? 'STALE' : brokerLabel}</span>
    </span>
    <span class="counts mono">{snapshot.devices.length} DEV · {snapshot.entities.length} ENT</span>
    <span class="clock mono">{clock}</span>
    <AccountMenu {user} />
  </div>
</header>

<style>
  .command-bar {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 10px 18px;
    background: var(--panel);
    border-bottom: 1px solid var(--amber);
  }
  .identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .site {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--text);
  }
  .mode {
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    color: var(--faint);
  }
  .nav {
    display: flex;
    gap: 6px;
    margin-left: 8px;
  }
  .tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    min-height: var(--tap);
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--muted);
    border: 1px solid transparent;
    border-radius: var(--r-control);
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.active {
    color: var(--amber);
    border-color: var(--amber);
    background: var(--amber-dim);
  }
  .update-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--amber);
  }
  .status {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .broker {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--ok);
  }
  .broker .mono,
  .counts {
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .clock {
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    color: var(--text);
  }
  @media (max-width: 720px) {
    .mode,
    .counts {
      display: none;
    }
    .command-bar {
      gap: 12px;
      /* Wrap instead of overflowing: the account chip would otherwise push the
         narrow header past the viewport and collapse the site identity to zero. */
      flex-wrap: wrap;
      row-gap: 8px;
    }
    .identity {
      flex-shrink: 0;
    }
  }
</style>
