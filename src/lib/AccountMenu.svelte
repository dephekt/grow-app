<script lang="ts">
  import { untrack } from 'svelte';
  import type { AuthenticatedUser } from '$lib/server/auth/users';

  let { user }: { user: AuthenticatedUser } = $props();

  // Track locally: `user` comes from load data (a plain, non-reactive object), so
  // mutating user.hasLocalPassword would not re-render the dialog's mode. Seed
  // once from the prop, then this drives the "set" vs "change" password UI.
  let hasLocalPassword = $state(untrack(() => user.hasLocalPassword));

  // Re-sync when load data legitimately refreshes the prop — e.g. an admin clears
  // their own local password on the users page and navigates back, so the (app)
  // layout reruns and passes hasLocalPassword=false. Without this the dialog would
  // stay stuck in "change" mode, demanding a current password that no longer exists.
  $effect(() => {
    hasLocalPassword = user.hasLocalPassword;
  });

  let menuOpen = $state(false);
  let dialog = $state<HTMLDialogElement | null>(null);
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);

  const passwordAction = $derived(hasLocalPassword ? 'Change local password' : 'Set local password');

  function openPasswordDialog(): void {
    menuOpen = false;
    error = null;
    saved = false;
    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
    dialog?.showModal();
  }

  async function savePassword(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = null;
    if (newPassword !== confirmPassword) {
      error = 'Passwords do not match';
      return;
    }
    saving = true;
    try {
      const response = await fetch('/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        error = body.error ?? 'Could not save password';
        return;
      }
      saved = true;
      hasLocalPassword = true;
      setTimeout(() => dialog?.close(), 900);
    } catch {
      error = 'Could not save password';
    } finally {
      saving = false;
    }
  }

  async function signOut(): Promise<void> {
    menuOpen = false;
    try {
      await fetch('/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' } });
    } catch {
      // ignore — we redirect regardless
    }
    window.location.href = '/login';
  }
</script>

<div class="account">
  <button
    class="account-chip mono"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    aria-label="Account menu"
    onclick={() => (menuOpen = !menuOpen)}
  >
    <span class="who">{user.username}</span>
    {#if user.isAdmin}<span class="admin-tag">ADMIN</span>{/if}
  </button>

  {#if menuOpen}
    <div class="menu" role="menu">
      <button class="menu-item" role="menuitem" onclick={openPasswordDialog}>{passwordAction}</button>
      {#if user.isAdmin}
        <a class="menu-item" role="menuitem" href="/settings/users" onclick={() => (menuOpen = false)}>Manage users</a>
      {/if}
      <button class="menu-item danger" role="menuitem" onclick={signOut}>Sign out</button>
    </div>
  {/if}
</div>

<dialog bind:this={dialog} class="pw-dialog">
  <form method="dialog" onsubmit={savePassword}>
    <h2>{passwordAction}</h2>
    {#if !hasLocalPassword}
      <p class="hint">Set a local password to sign in without SSO — useful when the identity provider is unreachable.</p>
    {/if}
    {#if hasLocalPassword}
      <label>
        Current password
        <input type="password" bind:value={currentPassword} autocomplete="current-password" />
      </label>
    {/if}
    <label>
      New password
      <input type="password" bind:value={newPassword} autocomplete="new-password" required minlength="8" />
    </label>
    <label>
      Confirm new password
      <input type="password" bind:value={confirmPassword} autocomplete="new-password" required minlength="8" />
    </label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if saved}<p class="ok" role="status">Password saved</p>{/if}
    <div class="actions">
      <button type="button" class="ghost" onclick={() => dialog?.close()}>Cancel</button>
      <button type="submit" disabled={saving}>Save password</button>
    </div>
  </form>
</dialog>

<style>
  .account {
    position: relative;
  }
  .account-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--tap);
    padding: 6px 12px;
    font-size: 0.68rem;
    letter-spacing: 0.06em;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--amber);
    border-radius: var(--r-control);
    cursor: pointer;
  }
  .admin-tag {
    font-size: 0.56rem;
    letter-spacing: 0.1em;
    color: var(--amber);
  }
  .menu {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    background: var(--panel);
    border: 1px solid var(--amber);
    border-radius: var(--r-control);
    overflow: hidden;
  }
  .menu-item {
    padding: 10px 14px;
    min-height: var(--tap);
    font-size: 0.72rem;
    text-align: left;
    color: var(--text);
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .menu-item:hover {
    background: var(--amber-dim);
  }
  .menu-item.danger {
    color: var(--alert, #ff6b6b);
    border-top: 1px solid var(--amber-dim);
  }
  .pw-dialog {
    border: 1px solid var(--amber);
    border-radius: var(--r-control);
    background: var(--panel);
    color: var(--text);
    padding: 20px;
    max-width: 360px;
  }
  .pw-dialog::backdrop {
    background: rgb(0 0 0 / 0.6);
  }
  .pw-dialog h2 {
    margin: 0 0 12px;
    font-size: 0.95rem;
  }
  .pw-dialog .hint {
    margin: 0 0 12px;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .pw-dialog label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
    font-size: 0.72rem;
    color: var(--muted);
  }
  .pw-dialog input {
    padding: 8px 10px;
    background: var(--bg, #111);
    color: var(--text);
    border: 1px solid var(--amber-dim);
    border-radius: var(--r-control);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }
  .actions button {
    min-height: var(--tap);
    padding: 8px 14px;
    border-radius: var(--r-control);
    border: 1px solid var(--amber);
    background: var(--amber-dim);
    color: var(--text);
    cursor: pointer;
  }
  .actions .ghost {
    background: transparent;
  }
  .error {
    color: var(--alert, #ff6b6b);
    font-size: 0.72rem;
  }
  .ok {
    color: var(--ok, #5fd08a);
    font-size: 0.72rem;
  }
</style>
