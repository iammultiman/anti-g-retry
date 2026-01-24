# Agy Retry - Project Wiki

## Overview

**Agy Retry** is a VS Code extension that provides auto-retry automation for AI coding agents like Cursor and Antigravity. It uses Chrome DevTools Protocol (CDP) to monitor and click retry buttons in the IDE.

| Property | Value |
|----------|-------|
| **Type** | VS Code Extension |
| **Language** | TypeScript |
| **Bundler** | Webpack |
| **Package Manager** | Bun |

## Core Features

- Auto-retry failed AI agent requests
- CDP-based button monitoring
- Configurable retry behavior
- Works with Cursor, Antigravity

## Project Structure

```
agy-retry/
├── src/                        # Extension source (5 files)
│   ├── extension.ts            # Extension entry
│   └── ...
├── webview/                    # Webview UI (4 files)
├── resources/                  # Icons and assets
├── dist/                       # Build output
├── package.json                # Extension manifest
├── webpack.config.js           # Webpack bundler config
└── tsconfig.json
```

## Key Files

| File | Purpose |
|------|---------|
| `LOCAL_INSTALL.md` | Local installation guide |
| `INSTALL_COMPLETE.md` | Post-install instructions |
| `install.sh` | Installation script |
| `agy-retry-0.1.2.vsix` | Built extension package |

## Build Commands

```bash
# Install dependencies
bun install

# Build extension
bun run build
# or
node build-all.js

# Package extension
vsce package

# Install locally
code --install-extension agy-retry-*.vsix
```
