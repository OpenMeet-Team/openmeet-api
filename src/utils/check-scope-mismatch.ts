/**
 * Checks which configured scopes are missing from the granted scopes.
 *
 * @param configuredScopes - Space-delimited string of scopes the app requests
 * @param grantedScopes - Space-delimited string of scopes actually granted by the auth server
 * @returns Array of scopes present in configuredScopes but missing from grantedScopes
 */
export function checkScopeMismatch(
  configuredScopes: string,
  grantedScopes: string,
): string[] {
  const configured = new Set(
    configuredScopes.split(/\s+/).filter((s) => s.length > 0),
  );
  const granted = new Set(
    grantedScopes.split(/\s+/).filter((s) => s.length > 0),
  );

  return [...configured].filter((scope) => !granted.has(scope));
}

/**
 * The scopes a session for this identity is expected to carry.
 *
 * Most configured scopes apply to every identity. `identity:handle` does not.
 * It authorizes com.atproto.identity.updateHandle, and updateHandle rejects
 * any identity that is not on our PDS. Measuring an external identity against
 * it reports a gap that can never close, and asks that user to grant a handle
 * rename permission we never use for them.
 *
 * The scope stays in the configured list and in the OAuth client metadata.
 * Users who take ownership of an account on our PDS sign in over OAuth, and
 * they do need it.
 *
 * Build the yardstick with this before comparing against granted scopes,
 * rather than filtering the comparison afterwards. A scope that turns on some
 * other condition adds a field to `identity` and a case here.
 *
 * @param configuredScopes - Space-delimited scopes the app is configured with
 * @param identity.isOurPds - Whether the identity is hosted on OpenMeet's PDS
 * @returns Space-delimited scopes required for this identity
 */
export function getRequiredScopesForIdentity(
  configuredScopes: string,
  identity: { isOurPds: boolean },
): string {
  return configuredScopes
    .split(/\s+/)
    .filter((scope) => scope.length > 0)
    .filter((scope) => (scope === 'identity:handle' ? identity.isOurPds : true))
    .join(' ');
}
