# Agy Retry

Auto-retry for AI coding agents. Zero-babysitting automation.

[![Version](https://img.shields.io/visual-studio-marketplace/v/paean-ai.agy-retry)](https://marketplace.visualstudio.com/items?itemName=paean-ai.agy-retry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Auto-click Retry buttons** when AI coding agents encounter errors
- **Zero babysitting** - let your AI agent keep working while you're away
- **CDP-based** - works with Cursor, VS Code, Antigravity, and other Electron-based IDEs
- **Safety first** - blocks dangerous commands (rm -rf, format c:, etc.)
- **Cross-platform** - macOS, Windows, and Linux support

## How It Works

1. IDE must be launched with CDP (Chrome DevTools Protocol) flag
2. Extension connects via WebSocket to the IDE's debug port
3. Monitors for error dialogs and automatically clicks "Retry" buttons
4. Only clicks Retry when in an error context (error, failed, terminated)

## Quick Start

1. Install the extension
2. Open the Agy Retry panel from the sidebar
3. Click **Start** - extension will guide you through CDP setup
4. After restarting IDE with CDP flag, click **Start** again
5. Done! Auto-retry is now active

## CDP Setup

The extension needs CDP (Chrome DevTools Protocol) enabled to interact with the IDE UI.

### Automatic Setup

Click **Start** and follow the prompts. The extension will:
- Create a wrapper script (macOS) or modify shortcuts (Windows/Linux)
- Guide you to restart the IDE

### Manual Setup

Launch your IDE with the `--remote-debugging-port=31905` flag:

**macOS:**
```bash
open -a "Cursor" --args --remote-debugging-port=31905
```

**Windows:**
```cmd
"C:\Path\To\Cursor.exe" --remote-debugging-port=31905
```

**Linux:**
```bash
cursor --remote-debugging-port=31905
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `agyRetry.enabled` | `false` | Enable auto-retry |
| `agyRetry.autoStart` | `false` | Start automatically on IDE launch |
| `agyRetry.cdpPort` | `31905` | CDP port number |
| `agyRetry.cdpPortRange` | `3` | Port scan range (±) |
| `agyRetry.intervalSeconds` | `3` | Check interval |
| `agyRetry.maxRetries` | `50` | Maximum retries |
| `agyRetry.cooldownSeconds` | `5` | Cooldown after click |

## Commands

- `Agy Retry: Start Auto Retry` - Start the auto-retry service
- `Agy Retry: Stop Auto Retry` - Stop the auto-retry service
- `Agy Retry: Open Panel` - Open the side panel

## Safety

The extension automatically blocks dangerous commands:
- `rm -rf /`, `rm -rf ~`, `rm -rf *`
- `format c:`, `del /f /s /q`
- Fork bombs, dd commands, etc.

## Requirements

- VS Code 1.85.0 or higher (or compatible IDE: Cursor, Antigravity)
- IDE must be launched with CDP flag

## License

MIT License - see [LICENSE](LICENSE) file.

## Credits

Developed by [paean-ai](https://github.com/paean-ai)

Based on the auto-retry functionality from [antigravity-sync](https://github.com/mrd9999/antigravity-sync)
