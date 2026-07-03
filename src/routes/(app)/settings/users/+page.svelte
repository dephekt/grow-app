<script lang="ts">
  import { untrack } from 'svelte';
  import type { UserSummary } from '$lib/server/auth/users';

  let { data } = $props();

  // Seed once from load data, then manage the list locally as actions mutate it.
  let users = $state<UserSummary[]>(untrack(() => data.users));
  let error = $state<string | null>(null);

  // New-user form state.
  let newUsername = $state('');
  let newPassword = $state('');
  let newIsAdmin = $state(false);
  let creating = $state(false);

  const selfId = $derived(data.user?.id);

  async function refresh(): Promise<void> {
    const response = await fetch('/api/users');
    if (response.ok) {
      users = ((await response.json()) as { users: UserSummary[] }).users;
    }
  }

  async function createUser(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = null;
    creating = true;
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, isAdmin: newIsAdmin })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        error = body.error ?? 'Could not create user';
        return;
      }
      newUsername = '';
      newPassword = '';
      newIsAdmin = false;
      await refresh();
    } catch {
      error = 'Could not create user';
    } finally {
      creating = false;
    }
  }

  async function patchUser(id: number, patch: Record<string, unknown>): Promise<void> {
    error = null;
    try {
      const response = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        error = body.error ?? 'Action failed';
        return;
      }
      await refresh();
    } catch {
      error = 'Action failed';
    }
  }
</script>

<section class="users">
  <header>
    <a class="back" href="/">← Dashboard</a>
    <h1>Users &amp; access</h1>
  </header>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <table>
    <thead>
      <tr><th>Username</th><th>Type</th><th>Local password</th><th>Status</th><th>Actions</th></tr>
    </thead>
    <tbody>
      {#each users as u (u.id)}
        <tr class:disabled={u.disabled}>
          <td>
            {u.username}
            {#if u.isAdmin}<span class="tag">ADMIN</span>{/if}
          </td>
          <td>{u.oidcLinked ? 'OIDC' : 'Local'}</td>
          <td>{u.hasLocalPassword ? 'Set' : '—'}</td>
          <td>{u.disabled ? 'Disabled' : 'Active'}</td>
          <td class="actions">
            {#if u.disabled}
              <button onclick={() => patchUser(u.id, { disabled: false })}>Enable</button>
            {:else if u.id !== selfId}
              <button onclick={() => patchUser(u.id, { disabled: true })}>Disable</button>
            {/if}
            {#if u.hasLocalPassword}
              <button onclick={() => patchUser(u.id, { clearPassword: true })}>Clear password</button>
            {/if}
            <button onclick={() => patchUser(u.id, { revokeSessions: true })}>Revoke sessions</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <form class="new-user" onsubmit={createUser}>
    <h2>Create local user</h2>
    <div class="row">
      <label>
        Username
        <input type="text" bind:value={newUsername} autocapitalize="none" required />
      </label>
      <label>
        Password
        <input type="password" bind:value={newPassword} autocomplete="new-password" minlength="8" required />
      </label>
      <label class="admin-check">
        <input type="checkbox" bind:checked={newIsAdmin} />
        Admin
      </label>
      <button type="submit" disabled={creating}>Create</button>
    </div>
  </form>
</section>

<style>
  .users {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  .back {
    font-size: 0.72rem;
    color: var(--muted);
  }
  h1 {
    font-size: 1.1rem;
    color: var(--text);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  th,
  td {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 1px solid var(--amber-dim);
  }
  th {
    color: var(--muted);
    font-size: 0.68rem;
    letter-spacing: 0.06em;
  }
  tr.disabled {
    opacity: 0.55;
  }
  .tag {
    margin-left: 6px;
    font-size: 0.56rem;
    letter-spacing: 0.1em;
    color: var(--amber);
  }
  td.actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  td.actions button,
  .new-user button {
    min-height: var(--tap, 40px);
    padding: 6px 10px;
    font-size: 0.68rem;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--amber);
    border-radius: var(--r-control, 6px);
    cursor: pointer;
  }
  .new-user {
    margin-top: 8px;
    padding-top: 14px;
    border-top: 1px solid var(--amber-dim);
  }
  .new-user h2 {
    font-size: 0.9rem;
    margin-bottom: 10px;
  }
  .new-user .row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
  }
  .new-user label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .new-user input[type='text'],
  .new-user input[type='password'] {
    padding: 8px 10px;
    background: var(--bg, #111);
    color: var(--text);
    border: 1px solid var(--amber-dim);
    border-radius: var(--r-control, 6px);
  }
  .admin-check {
    flex-direction: row;
    align-items: center;
    gap: 6px;
  }
  .error {
    color: var(--alert, #ff6b6b);
    font-size: 0.78rem;
  }
</style>
