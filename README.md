# Agy Retry

Auto-retry for AI coding agents (Cursor, Antigravity, VS Code). Zero-babysitting automation.

[![OpenVSX](https://img.shields.io/open-vsx/v/paean-ai/agy-retry)](https://open-vsx.org/extension/paean-ai/agy-retry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-paean--ai%2Fagy--retry-blue?logo=github)](https://github.com/paean-ai/agy-retry)

## Features

- 🔄 **Auto-click Retry** when AI agents encounter errors
- 🚀 **Zero babysitting** - AI keeps working while you're away
- 🔌 **CDP-based** - Cursor, VS Code, Antigravity, Windsurf support
- 🛡️ **Safety first** - blocks dangerous commands
- 💻 **Cross-platform** - macOS, Windows, Linux

## Quick Start

1. Install the extension
2. Click the **Agy Retry** icon in sidebar
3. Click **Start** → follow CDP setup prompts
4. After IDE restart, click **Start** again
5. ✅ Auto-retry is active!

## How It Works

```
IDE (with CDP flag) ←→ WebSocket ←→ Agy Retry
                                      ↓
                              Monitor UI → Click "Retry"
```

The extension connects via Chrome DevTools Protocol to detect and auto-click Retry buttons.

## Launch Command

After setup, use the `ragy` command to start your IDE with CDP:

```bash
ragy
```

## License

MIT © [paean-ai](https://github.com/paean-ai)
