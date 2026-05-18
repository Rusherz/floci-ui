# Implementation Plan for Floci Desktop Application

This document outlines the implementation of the desktop solution as described in the original plan. We have made significant progress in establishing the basic structure, but there's still work to complete.

## Status Overview

### Completed
- Created `desktop/` directory structure
- Set up Rust Tauri project in `desktop/src-tauri/`
- Implemented core Rust application logic for API bridge
- Created initial build script (`desktop/build.sh`)
- Updated documentation with desktop inclusion

### Work in Progress
- Implementing proper filesystem access in Tauri for Lambda source code
- Completing the complete desktop build process
- Updating all API calls in the Next.js UI to point to the desktop bridge instead of server routes
- Adding proper configuration management and UI for desktop settings

## Key Components Implemented

### 1. Tauri Desktop Application Structure
- Rust backend with Tauri integration
- Cargo.toml dependencies including `reqwest` for HTTP requests
- `main.rs` file with API endpoints for:
  * Health check proxy (`/healthz`)
  * Version manifest fetch (`/version-manifest`)
  * Lambda source code retrieval (`/lambda-source/:name`)
  * Floci proxy (`/floci/*`)

### 2. API Bridge Endpoints

#### Health Check Proxy
```rust
#[tauri::command]
async fn health_check(config: Config) -> Result<HealthResponse, String> {
    // Proxies to backend /healthz endpoint
}
```

#### Version Manifest Fetch
```rust
#[tauri::command]
async fn get_version_manifest(config: Config) -> Result<VersionManifestResponse, String> {
    // Fetches version manifest from backend
}
```

#### Floci Proxy
```rust
#[tauri::command]
async fn proxy_request(
    config: Config,
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,
) -> Result<ProxyResponse, String> {
    // Proxies any request from UI to backend
}
```

### 3. Desktop Build Process

#### build.sh Script
```bash
#!/bin/bash
# Builds Next.js app as static export
# Copies assets to desktop/dist/
```

## Next Steps and Implementation Details

### 1. Update UI Codebase

The UI needs to be updated to use the Tauri desktop bridge instead of the current server-side routes. This involves:

- In UI components that make API requests, replace server routes with Tauri API calls
- Update the base URL used for API calls from `/api/*` to the Tauri bridge endpoints
- Ensure request/response shapes are maintained for backward compatibility

### 2. Complete Lambda Source File System Access

The current placeholder implementation of `get_lambda_source` needs to be fully implemented to read actual filesystem paths:

```rust
#[tauri::command]
async fn get_lambda_source(config: Config, function_name: String) -> Result<LambdaSourceResponse, String> {
    // Actually implement filesystem reading here
}
```

### 3. Desktop Configuration Management

Implement desktop-specific configuration that:
- Stores backend origin URL (equivalent to `FLOCI_ORIGIN`)
- Stores enabled services (similar to `FLOCI_ENABLED_SERVICES`)
- Stores version manifest URL
- Stores lambda source path (like `FLOCI_LOCAL_DATA_PATH`)

### 4. Final Desktop Build Integration

Complete the integration with Tauri's build process:
- Ensure the `dist` directory structure is correct for Tauri's expectations
- Verify that the Next.js static export properly serves within the Tauri context
- Test that all the API endpoints work correctly through the bridge

## Technical Approach

### Frontend Updates (Next.js UI)
In the existing UI components, we need to:
1. Inject a bridge client that utilizes Tauri `invoke` calls
2. Replace all current API calls to:
   - `/healthz` → Tauri `health_check` command
   - `/api/version-manifest` → Tauri `get_version_manifest` command  
   - `/api/lambda-source/:name` → Tauri `get_lambda_source` command
   - `/floci/*` → Tauri `proxy_request` command

### Backend Updates (Tauri Rust)
1. Implement full file system access for lambda source code
2. Add error handling and response normalization
3. Implement proper configuration management
4. Add local config persistence

## Testing Strategy

### Unit Tests for Rust Bridge
- Test request forwarding (method, headers, body)
- Test error handling for upstream failures
- Test lambda source path resolution
- Test config loading and validation

### Integration Tests
- Ensure desktop app launches correctly
- Verify static UI loads properly in Tauri webview
- Test Tauri API bridge endpoints are reachable
- Test that UI service pages can interact with the bridge

### E2E Scenarios
- Backend available: Full happy-path flows for all services
- Backend unavailable: Clear error states and reporting
- Misconfigured backend origin: Clear failure and recovery flow

## Implementation Order

1. **Complete the Lambda filesystem functionality** in Rust (current placeholder)
2. **Implement proper configuration** management and persistence
3. **Update UI components** to utilize Tauri invoke calls instead of server routes
4. **Integrate with the Tauri build system** properly for final packaging
5. **Testing and validation** of all flows with mock backend

## Files and Directories Created

```
desktop/
├── README.md                   # Desktop application documentation
├── build.sh                    # Build script for static export 
├── src-tauri/
│   ├── Cargo.toml              # Rust project dependencies
│   ├── src/
│   │   └── main.rs             # Main Tauri application logic
│   └── tauri.conf.json         # Tauri configuration
```

This implementation follows the plan in `docs/desktop/PLAN.md` with:
- Backend model: Connect Only
- UI hosting: Static Export + API Bridge  
- Packaging target: Internal unsigned builds
- Desktop app with webview frontend and Rust native backend
- Refactored data access contract from Next route handlers
- Moved current server-side behaviors into bridge services
- Introduced desktop runtime config surface