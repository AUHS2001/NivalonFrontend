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
    serverUrl: 'http://localhost:8000',
    name: 'Local Development',
  },
  production: {
    serverUrl: 'https://your-production-api.amazonaws.com',
    name: 'Production',
  },
};

/**
 * Detects the current environment based on hostname
 */
const detectEnvironment = (): Environment => {
  // Check for environment variable first (set during build)
  if (typeof process !== 'undefined' && process.env?.REACT_APP_ENV) {
    return process.env.REACT_APP_ENV as Environment;
  }

  // Fallback to hostname detection
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'local';
    }
  }

  // Default to production for any other hostname
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
