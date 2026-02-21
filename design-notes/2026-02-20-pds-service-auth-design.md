# PDS Service Auth for Roomy-OpenMeet Integration

**Date:** 2026-02-20
**Beads:** om-fvtn (did:web endpoint), om-2372 (service auth token exchange)
**Status:** Approved

## Problem

Roomy users must separately OAuth into OpenMeet to access its features. This creates a double-login UX problem. AT Protocol has a built-in cross-service authentication mechanism (`com.atproto.server.getServiceAuth`) that eliminates this by having the user's PDS sign a short-lived JWT addressed to the target service.

## Solution

Two new endpoints that allow any AT Protocol service to authenticate users against OpenMeet without shared secrets — trust is cryptographic via the DID chain.

### 1. did:web Endpoint (om-fvtn)

**Path:** `GET /.well-known/did.json`

Serves a static DID document identifying OpenMeet as a service. This is how other services discover OpenMeet's service DID.

**DID document:**
```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:api.openmeet.net",
  "service": [{
    "id": "#openmeet",
    "type": "OpenMeetService",
    "serviceEndpoint": "https://api.openmeet.net"
  }]
}
```

**Configuration:**
- `SERVICE_DID` env var, defaults to `did:web:api.openmeet.net`
- `SERVICE_ENDPOINT` env var (or derived from `BACKEND_DOMAIN`)
- `@Public()` + `@TenantPublic()` — no auth or tenant context needed

**Implementation:** New `DidWebController` at path `.well-known`.

### 2. Service Auth Token Exchange (om-2372)

**Path:** `POST /api/v1/auth/atproto/service-auth`

Accepts a PDS-signed JWT, verifies it cryptographically against the user's DID document, and returns OpenMeet access/refresh tokens.

**Request body:**
```json
{
  "token": "<PDS-signed JWT>"
}
```

**Response (success):**
```json
{
  "token": "<OpenMeet JWT>",
  "refreshToken": "<OpenMeet refresh JWT>",
  "tokenExpires": 1234567890,
  "user": { ... }
}
```

**Verification flow:**
1. Split JWT into header.payload.signature parts
2. Base64-decode claims, extract `aud`, `iss`, `lxm`, `exp`
3. Verify `exp` is in the future (token not expired)
4. Verify `aud` matches our service DID (`SERVICE_DID` env var)
5. Verify `lxm` matches `net.openmeet.auth` (lexicon method)
6. Extract `iss` (user's DID)
7. Use `@atproto/identity` `IdResolver.did.resolveAtprotoData(iss)` to get signing key
8. Use `@atproto/crypto` `verifySignature(signingKey, headerPayloadBytes, signatureBytes)` to verify JWT
9. Look up user via `userAtprotoIdentityService.findByDid(tenantId, iss)`
10. If no user found, return 404 (don't auto-create)
11. Create session via `authService.createLoginSession(user, 'atproto-service', null, tenantId)`

**Error responses:**
- 400: Malformed JWT, missing claims
- 401: Invalid signature, wrong audience, wrong lxm, expired token
- 404: DID not associated with any OpenMeet user

**Implementation:** New `ServiceAuthService` + endpoint on `AuthController`.

## Key References

- **Leaf server JWT verification (Rust):** `~/openmeet/leaf/leaf-server/src/http.rs:146-215`
- **`@atproto/identity` IdResolver:** Has `resolveAtprotoData()` returning `{ did, signingKey, handle, pds }`
- **`@atproto/crypto` verifySignature:** `verifySignature(didKey, data, sig)` returns `Promise<boolean>`
- **`AuthService.createLoginSession()`:** Line 379 — handles session creation + JWT issuance for identified users
- **`UserAtprotoIdentityService.findByDid()`:** Line 58 — looks up users by DID

## Dependencies

- `@atproto/identity` — already a direct dep (v0.4.7)
- `@atproto/crypto` — transitive dep (v0.4.4), add as direct dep

## Security Considerations

- Service auth tokens are short-lived (typically 60s) — verify expiration
- The `lxm` claim scopes what the token can do — verify it matches `net.openmeet.auth`
- The `aud` claim prevents replay attacks against different services
- DID resolution goes to the PLC directory (decentralized trust, not shared secrets)
- No user auto-creation — prevents unauthorized account creation
