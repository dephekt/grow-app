# Provisioning a grow-app site

grow-app is deployed **once per site** (decision 8): each instance is its own
confidential OIDC client with its own local auth database. This is the current
**manual** process for standing up a new site's authentication. It is written to
be automated later — every step maps to an API call, an LDIF entry, or a
templated env var (see [Automating this](#automating-this)).

For the design rationale see `docs/briefs/grow-control-system.md` §6 in the
agent-planning repo; this file is the operational runbook.

## What a site needs

| Input | Example (`daniel-home`) | Used for |
|---|---|---|
| Site slug | `daniel-home` | `GROW_SITE`; the group name `/grow-site-<slug>` |
| Public URL | `https://daniel.grow.dephekt.net` | redirect URI + `GROW_AUTH_ORIGINS` |
| LAN origin(s) | `http://192.168.8.3:3080` | redirect URI + `GROW_AUTH_ORIGINS` |
| OIDC issuer | `https://auth.dephekt.net/realms/home` | `GROW_OIDC_ISSUER` |
| OIDC client id | `grow-site-daniel-home` | `GROW_OIDC_CLIENT_ID` |
| OIDC client secret | *(generated)* | `GROW_OIDC_CLIENT_SECRET` |
| Bootstrap admin secret | *(chosen)* | `GROW_AUTH_ADMIN_PASSWORD[_HASH]` |

Access is granted by **OIDC group claim** (decision 28), matched as a full path by
`authorizeFromGroups` in `src/lib/server/auth/oidc.ts`:

- `/grow-admin` — global admin across all sites (also grants `is_admin`).
- `/grow-site-<slug>` — access to that one site.

Names are **flat** (not a nested `/grow/...` tree) because the reference IdP
federates groups from a flat LDAP `groupOfNames` directory — see step 3.

## Steps

### 1. Keycloak — create the confidential client

In the site's realm, create an OpenID Connect client:

- **Client ID** `grow-site-<slug>`, **Client authentication ON** (confidential),
  **Standard flow** on (all other flows off), **PKCE method S256**.
- **Valid redirect URIs**: `<origin>/auth/oidc/callback` for **every** origin the
  app serves on (public + each LAN origin). These must match exactly — a mismatch
  fails the login.
- Copy the generated **client secret** (Credentials tab) → `GROW_OIDC_CLIENT_SECRET`.

### 2. Keycloak — put the group claim in the ID token

grow-app reads groups from the **ID token** (`tokens.claims()`), so add a
**Group Membership** protocol mapper on the client's *dedicated* scope:

- Token Claim Name `groups`, **Full group path ON**, **Add to ID token ON**.

> If the realm has a shared `groups` client scope assigned to the client that emits
> **leaf** names (Full group path OFF — common default), remove it *from this
> client only* so the token doesn't carry two conflicting `groups` claims. Do not
> flip the shared scope's mapper — other clients depend on its format.

### 3. Directory — create the groups and add members

The reference realm federates groups from LDAP with the group mapper in
**`LDAP_ONLY`** mode (Groups Path `/`), so groups must exist in LDAP — a
Keycloak-local group can't be assigned to an LDAP-backed user. Create them as flat
`groupOfNames` and add each authorized user as a `member`:

```ldif
dn: cn=grow-admin,ou=groups,dc=dephekt,dc=net
objectClass: groupOfNames
cn: grow-admin
member: uid=<admin-user>,ou=users,dc=dephekt,dc=net

dn: cn=grow-site-<slug>,ou=groups,dc=dephekt,dc=net
objectClass: groupOfNames
cn: grow-site-<slug>
member: uid=<site-user>,ou=users,dc=dephekt,dc=net
```

`cn=grow-admin` is created once and reused across sites; `cn=grow-site-<slug>` is
per site. A user in either group can sign in to that site.

### 4. App — deployment env

Set on the grow-app deployment (secret via the `_FILE` docker-secret convention is
preferred). SSO turns on only when issuer + client id + client secret + ≥1 origin
are all present (`isSsoEnabled()`):

```
GROW_SITE=<slug>
GROW_OIDC_ISSUER=https://auth.dephekt.net/realms/<realm>
GROW_OIDC_CLIENT_ID=grow-site-<slug>
GROW_OIDC_CLIENT_SECRET_FILE=/run/secrets/GROW_OIDC_CLIENT_SECRET
GROW_AUTH_ORIGINS=https://<public-host>,http://<lan-host>:<port>
# Bootstrap the local admin so an IdP outage can't lock the site out:
GROW_AUTH_ADMIN_USERNAME=admin
GROW_AUTH_ADMIN_PASSWORD_FILE=/run/secrets/GROW_AUTH_ADMIN_PASSWORD
```

`GROW_OIDC_ALLOW_INSECURE_ISSUER=true` exists only for a plain-HTTP issuer
(tests / a trusted LAN-only IdP); leave it unset for a real HTTPS issuer. See
`.env.example` for the full list and defaults.

### 5. Proxy — routing only

Point the tunnel/proxy (Pangolin/Newt or equivalent) at the app and **disable its
SSO** for the grow resource (decision 19) — grow-app enforces auth itself; the
proxy only terminates TLS and routes.

### 6. Verify

1. The login page shows **Sign in with SSO**.
2. A user in `/grow-site-<slug>` (or `/grow-admin`) → signs in → dashboard.
3. A user in neither group → bounced to `/login?error=forbidden`.
4. Stop the IdP: an existing session keeps working (per-request validation never
   calls the IdP); a *new* SSO login fails cleanly to `/login?error=sso`; the
   bootstrap admin can still log in locally.

## Automating this

Everything above is API-driven and safe to script per slug:

- **Client + mapper (step 1–2)** — Keycloak Admin REST API: `POST
  /admin/realms/<realm>/clients`, then `POST .../clients/<id>/protocol-mappers/models`
  for the Group Membership mapper; read the secret from `GET .../clients/<id>/client-secret`.
- **Groups + membership (step 3)** — emit the LDIF above per site, or use your
  directory tooling. (If a site ever moves off `LDAP_ONLY`, these can be plain
  Keycloak groups instead.)
- **Env (step 4)** — template the `GROW_*` block from the site's inputs table.

The two things that are easy to get subtly wrong: the **redirect URIs** must match
the app's origins exactly, and the `groups` claim must be **full path in the ID
token**. A generator should assert both.
