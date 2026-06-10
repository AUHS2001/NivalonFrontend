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

// Debug: log resolved config on startup
console.log(`[server config] env=${CURRENT_ENV} SERVER_URL=${SERVER_URL}`);

// Export helper to check environment
export const isDevelopment = (): boolean => CURRENT_ENV === 'local';
export const isProduction = (): boolean => CURRENT_ENV === 'production';

// CloudFront raw domain → custom CDN domain (same parent domain as cookies)
const CLOUDFRONT_RAW = 'https://d3d2u901ogi7fa.cloudfront.net';
const CDN_DOMAIN = 'https://cdn.nivalonmedical.com';
const DEV_S3_DOMAIN = 'https://nivalon-dev-medical-data.s3.us-east-2.amazonaws.com';

/**
 * Fetch a file URL with credentials included on ALL requests.
 * Rewrites legacy raw CloudFront URLs to the CDN domain.
 */
export function fetchFile(url: string, extra?: RequestInit): Promise<Response> {
  let finalUrl = url;

  if (isDevelopment()) {
    // In local dev, rewrite CDN/CloudFront URLs to the dev S3 bucket
    if (url.startsWith(CDN_DOMAIN)) {
      finalUrl = url.replace(CDN_DOMAIN, DEV_S3_DOMAIN);
    } else if (url.startsWith(CLOUDFRONT_RAW)) {
      finalUrl = url.replace(CLOUDFRONT_RAW, DEV_S3_DOMAIN);
    }
    return fetch(finalUrl, extra);
  }

  // Production: rewrite raw CloudFront URLs to CDN domain for cookie auth
  const opts: RequestInit = { ...extra, credentials: 'include' };
  if (url.startsWith(CLOUDFRONT_RAW)) {
    finalUrl = url.replace(CLOUDFRONT_RAW, CDN_DOMAIN);
  }
  return fetch(finalUrl, opts);
}

