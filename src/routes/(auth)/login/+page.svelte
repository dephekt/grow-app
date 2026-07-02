<script lang="ts">
  let { data } = $props();

  let username = $state('');
  let password = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  const ssoHref = $derived(`/auth/oidc?next=${encodeURIComponent(data.next)}`);

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = null;
    submitting = true;
    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        error = body.error ?? 'Login failed';
        return;
      }
      // Hard navigation so the new session cookie is applied on the next load.
      window.location.href = data.next;
    } catch {
      error = 'Login failed';
    } finally {
      submitting = false;
    }
  }
</script>

<main class="login">
  <div class="card">
    <div class="brand mono">GROW · SITE ACCESS</div>
    <h1>Sign in</h1>

    <form onsubmit={submit}>
      <label>
        Username
        <input type="text" bind:value={username} autocomplete="username" autocapitalize="none" required />
      </label>
      <label>
        Password
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>

    {#if data.ssoEnabled}
      <div class="divider"><span>or</span></div>
      <a class="sso" href={ssoHref}>Sign in with SSO</a>
    {/if}
  </div>
</main>

<style>
  .login {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 360px;
    padding: 28px;
    background: var(--panel);
    border: 1px solid var(--amber);
    border-radius: var(--r-control, 8px);
  }
  .brand {
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    color: var(--amber);
  }
  h1 {
    margin: 6px 0 20px;
    font-size: 1.2rem;
    color: var(--text);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  input {
    padding: 10px 12px;
    background: var(--bg, #111);
    color: var(--text);
    border: 1px solid var(--amber-dim);
    border-radius: var(--r-control, 8px);
    font-size: 0.9rem;
  }
  button[type='submit'] {
    margin-top: 4px;
    min-height: var(--tap, 44px);
    padding: 11px;
    background: var(--amber-dim);
    color: var(--text);
    border: 1px solid var(--amber);
    border-radius: var(--r-control, 8px);
    font-weight: 600;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  button[disabled] {
    opacity: 0.6;
    cursor: default;
  }
  .error {
    margin: 0;
    color: var(--alert, #ff6b6b);
    font-size: 0.76rem;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 18px 0 12px;
    color: var(--faint, #666);
    font-size: 0.68rem;
  }
  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--amber-dim);
  }
  .sso {
    display: block;
    text-align: center;
    min-height: var(--tap, 44px);
    padding: 11px;
    border: 1px solid var(--amber);
    border-radius: var(--r-control, 8px);
    color: var(--text);
    letter-spacing: 0.06em;
  }
</style>
