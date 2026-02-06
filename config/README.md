# Configuration

This folder contains centralized configuration files for the Nivalon application.

## Server Configuration (`server.ts`)

The `server.ts` file manages backend server URLs for different environments.

### Environments

| Environment | Server URL | Auto-Detection |
|-------------|------------|----------------|
| **Local** | `http://localhost:8000` | `localhost` or `127.0.0.1` |
| **Production** | Your AWS URL | Any other hostname |

### Setup

1. **Update Production URL**

   Open `config/server.ts` and update the production server URL:

   ```typescript
   production: {
     serverUrl: 'https://your-production-api.amazonaws.com',
     name: 'Production',
   },
   ```

2. **Environment Detection**

   The configuration automatically detects the environment based on:
   - Environment variable `REACT_APP_ENV` (if set during build)
   - Browser hostname (fallback)

### Usage

Import the server URL in your components:

```typescript
import { SERVER_URL } from '../config/server';

// Use in API calls
fetch(`${SERVER_URL}/api/endpoint`);
```

### Available Exports

| Export | Type | Description |
|--------|------|-------------|
| `SERVER_URL` | `string` | The backend server URL for the current environment |
| `CURRENT_ENV` | `'local' \| 'production'` | The detected environment |
| `ENV_NAME` | `string` | Human-readable environment name |
| `isDevelopment()` | `() => boolean` | Returns `true` if running locally |
| `isProduction()` | `() => boolean` | Returns `true` if running in production |

### Examples

```typescript
import { SERVER_URL, isDevelopment, ENV_NAME } from '../config/server';

// API call
const response = await fetch(`${SERVER_URL}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(credentials),
});

// Conditional logic based on environment
if (isDevelopment()) {
  console.log('Running in development mode');
}

// Display current environment
console.log(`Environment: ${ENV_NAME}`);
```

### Override Environment via Build

You can force a specific environment during build:

```bash
# Force production environment
REACT_APP_ENV=production npm run build

# Force local environment
REACT_APP_ENV=local npm run build
```

### Files Using This Configuration

The following files import and use `SERVER_URL`:

- `platform/app/src/pages/ComparisonPage.tsx`
- `platform/app/src/pages/DicomUploadPage.tsx`
- `platform/app/src/pages/Main.tsx`
- `platform/app/src/components/StudyListTable/StudyList.tsx`
- `extensions/stl-extention/src/SingleSpinalCord.tsx`
- `extensions/stl-extention/src/SpinalCordViewer.tsx`
- `extensions/stl-extention/src/StlComparison.tsx`
- `extensions/stl-extention/src/components/SeriesSelectionPopup.tsx`
- `extensions/stl-extention/src/components/ComparisonViewerContainer.tsx`
- `extensions/stl-extention/src/hooks/useVersionHistory.ts`
