# Auth

How to authenticate against the OpenMeet API — for frontend clients and for
unattended automation (bots, scripts, integrations).

## Table of Contents <!-- omit in toc -->

- [Auth methods](#auth-methods)
- [The tenant header](#the-tenant-header)
- [Email sign-in](#email-sign-in)
- [Refresh token flow](#refresh-token-flow)
- [Programmatic / automation access](#programmatic--automation-access)
- [ATProto service auth (bot-friendly)](#atproto-service-auth-bot-friendly)
- [Social / OAuth sign-in](#social--oauth-sign-in)
- [About the JWT strategy](#about-the-jwt-strategy)
- [Configure auth secrets](#configure-auth-secrets)
- [Logout](#logout)

---

## Auth methods

Every method ends the same way: you get an **OpenMeet JWT** (`token` +
`refreshToken`) and use it as a `Bearer` token on subsequent requests. There
are currently **no API keys, personal access tokens, or service accounts** — to
automate, you authenticate as a user (ideally a dedicated bot account).

| Method | Endpoint | Interactive? | Good for |
|--------|----------|-------------|----------|
| Email + password | `POST /api/v1/auth/email/login` | No | Bots, scripts, frontends |
| ATProto service auth | `POST /api/v1/auth/atproto/service-auth` | No | Bots/automation with any AT Protocol account (Bluesky or a self-hosted PDS) |
| Bluesky OAuth | `GET /api/v1/auth/bluesky/authorize` | Yes (browser) | Members signing in with their Bluesky handle |
| Google OAuth | `POST /api/v1/auth/google/login` | Yes (browser) | Members |
| GitHub OAuth | `POST /api/v1/auth/github/login` | Yes (browser) | Members |
| Facebook OAuth | `POST /api/v1/auth/facebook/login` | Yes (browser) | Members |

For unattended automation, use **email + password** or **ATProto service auth**.
The OAuth flows require a browser redirect (and DPoP-bound tokens for Bluesky),
so they can't be driven from `curl`.

---

## The tenant header

OpenMeet is multi-tenant. **Almost every request — including login and refresh —
requires the `x-tenant-id` header.** Omitting it returns
`401 Tenant ID is required`.

```
x-tenant-id: <your-tenant-id>
```

(For local dev the seeded tenant is `lsdfaopkljdfs`.)

---

## Email sign-in

```bash
curl -X POST https://api.openmeet.net/api/v1/auth/email/login \
  -H "x-tenant-id: <tenant-id>" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "..."}'
```

Response:

```jsonc
{
  "token": "eyJ...",          // access token (JWT)
  "refreshToken": "eyJ...",   // refresh token (JWT)
  "tokenExpires": 1738359000000, // ms epoch when `token` expires
  "user": { ... },
  "sessionId": "..."
}
```

Use the access token on every other request:

```bash
curl https://api.openmeet.net/api/v1/auth/me \
  -H "x-tenant-id: <tenant-id>" \
  -H "Authorization: Bearer <token>"
```

---

## Refresh token flow

1. On sign-in you receive `token`, `tokenExpires`, and `refreshToken`.
2. Send `token` in the `Authorization` header on each request.
3. When `token` is expired (compare `tokenExpires` against the current time),
   send the **refresh token** in the `Authorization` header to
   `POST /api/v1/auth/refresh` to get a fresh set:

   ```bash
   curl -X POST https://api.openmeet.net/api/v1/auth/refresh \
     -H "x-tenant-id: <tenant-id>" \
     -H "Authorization: Bearer <refreshToken>"
   ```

   You receive a new `token`, `tokenExpires`, and `refreshToken`.

> **Refresh tokens are single-use and rotate.** Each successful refresh
> invalidates the token you just used and returns a *new* `refreshToken` — you
> must store and use the new one next time. Replaying a spent refresh token
> returns `401`. (See `test/user/auth.e2e-spec.ts`.)

Token lifetimes are configurable per environment
(`AUTH_JWT_TOKEN_EXPIRES_IN`, default `15m`; `AUTH_REFRESH_TOKEN_EXPIRES_IN`).
Don't hardcode them — drive refresh off the `tokenExpires` value in the response.

---

## Programmatic / automation access

There's no dedicated machine credential yet, so a bot authenticates as a user.
The robust, self-healing pattern:

1. **Use a dedicated bot account** (not a real person's login), so token
   rotation and revocation don't disrupt anyone.
2. Store the bot's credentials in a secret manager / env var — never in code.
3. On startup (or first 401), `POST /auth/email/login` to get tokens.
4. Before/around each call, if `tokenExpires` has passed, refresh — and **persist
   the new `refreshToken`** (it rotates; see above).
5. If a refresh returns `401` (refresh token expired or already spent),
   fall back to a fresh `email/login`.

```text
login ──► use token ──► 401 / expired? ──► refresh
                                  │              │
                                  │         refresh 401?
                                  └──────────────┴──► login again
```

Every request carries both headers:

```bash
curl https://api.openmeet.net/api/v1/events \
  -H "x-tenant-id: <tenant-id>" \
  -H "Authorization: Bearer <token>"
```

---

## ATProto service auth (bot-friendly)

This path works for **any AT Protocol account**, not just Bluesky. The bot can
live on `bsky.social`, on a self-hosted PDS, or anywhere else on the network —
OpenMeet verifies the token against the caller's DID document, so it never
assumes a particular host. If your bot has an ATProto account you can skip
storing an OpenMeet password and exchange a **PDS-signed service-auth token** for
OpenMeet tokens. This is non-interactive (no browser, no DPoP), and yields the
**same OpenMeet JWTs** as every other path. Unknown DIDs are auto-provisioned as
users, and the account is portable — the same DID later signing in via ATProto
(Bluesky) OAuth resolves to the same OpenMeet account.

The one requirement: the bot's PDS must implement
`com.atproto.server.getServiceAuth` with the `lxm` (lexicon-method) parameter,
which the reference PDS and `bsky.social` both do.

### Finding the bot's PDS

Don't hardcode `bsky.social` — discover where the account actually lives. The
example below uses a handle on a self-hosted PDS (`alice.example.com`). Resolve
the handle to a DID, then the DID to its DID document, and read the PDS service
endpoint from it:

```bash
HANDLE="alice.example.com"   # the bot's ATProto handle (any PDS)

# Resolve the handle to a DID. Every ATProto handle publishes its DID here
# (some setups use a DNS TXT record at _atproto.$HANDLE instead).
DID=$(curl -s "https://$HANDLE/.well-known/atproto-did")

# Resolve the DID to its DID document.
#   did:plc lives in the PLC directory; did:web serves its own doc over HTTPS.
case "$DID" in
  did:plc:*) DID_DOC=$(curl -s "https://plc.directory/$DID") ;;
  did:web:*) DID_DOC=$(curl -s "https://${DID#did:web:}/.well-known/did.json") ;;
esac

# The PDS is the service entry whose id ends in #atproto_pds.
PDS_URL=$(echo "$DID_DOC" \
  | jq -r '.service[] | select(.id | endswith("#atproto_pds")) | .serviceEndpoint')
# → e.g. https://pds.example.com (whatever hosts the account)
```

### Exchanging for OpenMeet tokens

```bash
SERVICE_DID="did:web:api.openmeet.net"   # OpenMeet's identity (the audience)

# 1. Open a PDS session with the bot's app password
ACCESS_JWT=$(curl -s -X POST "$PDS_URL/xrpc/com.atproto.server.createSession" \
  -H "Content-Type: application/json" \
  -d "{\"identifier\":\"$HANDLE\",\"password\":\"<app-password>\"}" \
  | jq -r '.accessJwt')

# 2. Ask the PDS for a service-auth token scoped to OpenMeet
SERVICE_TOKEN=$(curl -s -G "$PDS_URL/xrpc/com.atproto.server.getServiceAuth" \
  -H "Authorization: Bearer $ACCESS_JWT" \
  --data-urlencode "aud=$SERVICE_DID" \
  --data-urlencode "lxm=net.openmeet.auth" \
  | jq -r '.token')

# 3. Exchange it for OpenMeet tokens
curl -s -X POST https://api.openmeet.net/api/v1/auth/atproto/service-auth \
  -H "x-tenant-id: lsdfaopkljdfs" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$SERVICE_TOKEN\"}"
# → { token, refreshToken, tokenExpires, user }
```

The API resolves the caller's DID document, pulls the signing key from it (so any
PDS works), verifies the JWT signature, and enforces:

- `aud` = OpenMeet's service DID (`did:web:api.openmeet.net`, with or without an
  `#openmeet` fragment). Confirm the live value at
  `https://api.openmeet.net/.well-known/did.json`.
- `lxm` = `net.openmeet.auth`
- `exp` within 5 minutes (generate a fresh token per exchange — don't cache it)
- `jti` present (replay-protected)

From here, use the returned `token` / `refreshToken` exactly like any other user.
See `test/auth/atproto-service-auth.e2e-spec.ts` for the end-to-end flow.

---

## Social / OAuth sign-in

For members (browser-based), OpenMeet supports:

- **Bluesky / ATProto** — `GET /api/v1/auth/bluesky/authorize?handle=<handle>`
  starts the OAuth redirect; the callback returns to the configured frontend
  with OpenMeet tokens. Uses PAR + DPoP-bound tokens (browser only).
- **Google** — `POST /api/v1/auth/google/login` with an access token obtained in
  the frontend.
- **GitHub** — `POST /api/v1/auth/github/login`.
- **Facebook** — `POST /api/v1/auth/facebook/login`.

Each resolves to the same OpenMeet JWT as email sign-in.

---

## About the JWT strategy

In `src/auth/strategies/jwt.strategy.ts`, the `validate` method does not re-load
the user from the database — that would negate the performance benefit of JWTs.
The token payload carries `id`, `role`, `slug`, `sessionId`, and `tenantId`.

```typescript
// src/auth/strategies/jwt.strategy.ts
public validate(payload: JwtPayloadType): JwtPayloadType {
  if (!payload.id) {
    throw new UnauthorizedException('JWT payload missing user ID');
  }
  return payload;
}
```

If you need full user info, load it in a service.

---

## Configure auth secrets

When standing up an instance, generate signing secrets:

```bash
node -e "console.log('\nAUTH_JWT_SECRET=' + require('crypto').randomBytes(256).toString('base64') + '\n\nAUTH_REFRESH_SECRET=' + require('crypto').randomBytes(256).toString('base64') + '\n\nAUTH_FORGOT_SECRET=' + require('crypto').randomBytes(256).toString('base64') + '\n\nAUTH_CONFIRM_EMAIL_SECRET=' + require('crypto').randomBytes(256).toString('base64'));"
```

Set `AUTH_JWT_SECRET` and `AUTH_REFRESH_SECRET` (plus the forgot/confirm secrets)
in your environment from the output.

---

## Logout

```text
POST /api/v1/auth/logout
```

Then drop the access and refresh tokens from client storage.

---

Previous: [Working with database](database.md)

Next: [Serialization](serialization.md)
