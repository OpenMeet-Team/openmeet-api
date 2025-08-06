/**
 * Shared cookie configuration utility for OIDC session cookies
 * Ensures consistent cookie domain handling across all auth controllers
 */

export interface CookieOptions {
  domain?: string;
  secure: boolean;
  sameSite: 'lax' | 'none';
  httpOnly: boolean;
  maxAge: number;
}

/**
 * Extract the domain from a URL for cookie configuration
 */
function extractDomainFromUrl(url: string): string | undefined {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // For localhost, return undefined (no domain restriction)
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return undefined;
    }

    // For ngrok domains, don't set domain due to Public Suffix List restrictions
    // ngrok.app is on the Public Suffix List, so browsers ignore domain settings
    // Instead, use sameSite: 'none' to allow cross-origin cookie sharing
    // This should work for requests between different ngrok subdomains
    if (hostname.includes('ngrok.app')) {
      return undefined;
    }

    // For subdomains, extract the root domain for cross-subdomain sharing
    // e.g., api-dev.openmeet.net -> .openmeet.net
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // Take the last two parts for the root domain
      const rootDomain = parts.slice(-2).join('.');
      return `.${rootDomain}`;
    }

    return undefined;
  } catch {
    // If URL parsing fails, return undefined (no domain restriction)
    return undefined;
  }
}

/**
 * Get cookie options for OIDC session cookies based on environment
 * Dynamically determines domain from BACKEND_DOMAIN environment variable
 */
export function getOidcCookieOptions(): CookieOptions {
  const backendDomain = process.env.BACKEND_DOMAIN || '';
  const isSecure = backendDomain.startsWith('https://');
  const cookieDomain = extractDomainFromUrl(backendDomain);

  // Determine if this is an ngrok domain that needs cross-site cookie sharing
  const isNgrokDomain = backendDomain.includes('ngrok.app');

  return {
    domain: cookieDomain, // Dynamically determined from BACKEND_DOMAIN
    secure: isSecure, // Use HTTPS if backend domain uses HTTPS
    sameSite: isNgrokDomain ? 'none' : 'lax', // Use 'none' for ngrok cross-site sharing
    httpOnly: true, // Security
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  };
}
