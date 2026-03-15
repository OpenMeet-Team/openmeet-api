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
