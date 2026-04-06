/**
 * Server Configuration
 * Centralized configuration for backend server URL
 * Supports two environments: local and production
 */

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
