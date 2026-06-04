/**
 * Server Configuration
 * Centralized configuration for backend server URL
 * Supports two environments: local and production
 */

import axios from 'axios';

// Enable cookies on all axios requests globally
axios.defaults.withCredentials = true;

/**
 * Fetch wrapper that retries once on 403 by calling a refresh function.
 * Use this for CloudFront URLs that may need cookie renewal.
 */
export async function fetchWithCookieRefresh(
  url: string,
  refreshFn: () => Promise<void>,
  init?: RequestInit
): Promise<Response> {
  const opts: RequestInit = { ...init, credentials: 'include' };
  let res = await fetch(url, opts);
  if (res.status === 403) {
    await refreshFn();
    res = await fetch(url, opts);
  }
  return res;
}

type Environment = 'local' | 'production';

interface EnvironmentConfig {
  serverUrl: string;
  name: string;
}

const ENV_CONFIG: Record<Environment, EnvironmentConfig> = {
  local: {
    serverUrl: process.env.SERVER_URL_LOCAL || 'http://localhost:8000',
    name: 'Local Development',
  },
  production: {
    serverUrl: process.env.SERVER_URL_PRODUCTION || '',
    name: 'Production',
  },
};

/**
 * Detects the current environment.
 * Set APP_ENV=local or APP_ENV=production in the .env file to control this.
 */
const detectEnvironment = (): Environment => {
  const envValue = process.env.APP_ENV;
  if (envValue === 'local' || envValue === 'production') {
    return envValue;
  }

  // Fallback to hostname detection if APP_ENV is not set
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'local';
    }
  }

  return 'production';
};

// Current environment
export const CURRENT_ENV: Environment = detectEnvironment();

// Export the server URL for the current environment
export const SERVER_URL: string = ENV_CONFIG[CURRENT_ENV].serverUrl;

// Export environment name (useful for debugging/display)
export const ENV_NAME: string = ENV_CONFIG[CURRENT_ENV].name;

// Export helper to check environment
export const isDevelopment = (): boolean => CURRENT_ENV === 'local';
export const isProduction = (): boolean => CURRENT_ENV === 'production';

// CloudFront domain → custom domain rewriter
// Cookies are set on the custom domain, so file URLs must use it too.
// Only rewrite in production where the page is served from the custom domain (same-origin).
// On localhost the CloudFront URLs work directly without cookies.
const CLOUDFRONT_RAW_DOMAIN = 'https://d3d2u901ogi7fa.cloudfront.net';
const CUSTOM_DOMAIN = SERVER_URL.replace(/\/api$/, ''); // e.g. https://planning.nivalonmedical.com

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export function rewriteFileUrl(url: string): string {
  if (!isLocalhost && url.startsWith(CLOUDFRONT_RAW_DOMAIN)) {
    return url.replace(CLOUDFRONT_RAW_DOMAIN, CUSTOM_DOMAIN);
  }
  return url;
}

/**
 * Fetch a file URL with the correct credentials strategy.
 * Production: rewrites CloudFront → custom domain (same-origin), sends cookies.
 * Localhost: keeps original CloudFront URL (cross-origin), no cookies (avoids CORS).
 */
export function fetchFile(url: string, extra?: RequestInit): Promise<Response> {
  const fileUrl = rewriteFileUrl(url);
  const opts: RequestInit = { ...extra };
  if (!isLocalhost) {
    opts.credentials = 'include';
  }
  return fetch(fileUrl, opts);
}

