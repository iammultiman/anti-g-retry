# Agy Retry

Auto-retry for AI coding agents (Cursor, Antigravity, VS Code). Zero-babysitting automation.

[![OpenVSX](https://img.shields.io/open-vsx/v/paean-ai/agy-retry)](https://open-vsx.org/extension/paean-ai/agy-retry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-paean--ai%2Fagy--retry-blue?logo=github)](https://github.com/paean-ai/agy-retry)

## Features

- 🔄 **Auto-click Retry** when AI agents encounter errors
- 📊 **Usage Monitoring** - Real-time Antigravity model quota tracking
- ⏱️ **Recovery Time** - Know exactly when your quota resets
- 🚀 **Zero babysitting** - AI keeps working while you're away
- 🔌 **CDP-based** - Cursor, VS Code, Antigravity, Windsurf support
- 🛡️ **Safety first** - blocks dangerous commands
- 💻 **Cross-platform** - macOS, Windows, Linux
- 💡 **Smart offline mode** - Friendly guidance when CDP unavailable

## CDP Status

When Antigravity runs without CDP support, the extension shows a helpful message:

> 🚀 **No CDP? Try `ragy`!**
> Run `ragy` in terminal to launch Agy with CDP enabled.
> If it works, retry lives on. If not, maybe Google fixed it. Happy vibe coding! ✨

This may indicate:
- Antigravity was not launched with CDP flags → use `ragy` command
- Google has officially fixed the retry issue → the plugin's retry mission is complete! 🎉

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

## Usage Monitoring Interface

Real-time quota tracking and recovery estimates directly in your IDE.

### Status Bar

Quick glance at your model availability:

```text
⚡ C:80% | P:60% | F:100%
```

**Tooltip details:**
```text
Antigravity Model Usage
Claude: 80% remaining (reset: 1h 30m)
Gemini Pro: 60% remaining (reset: 45m)
Gemini Flash: 100% remaining
```

### Side Panel

Rich visualization with recovery times and stats:

```text
+------------------------------+
|  ⚡ Agy Retry                |
|  Zero-babysitting auto       |
+------------------------------+
|                              |
|  [📊] Model Usage            |
|                              |
|   ( 80% )  ( 60% )  ( 100% ) |
|    Claude   Gemini   Flash   |
|   ↻ 1h30m   ↻ 45m            |
|                              |
+------------------------------+
|                              |
|  [History] Retry Statistics  |
|                              |
|      128          45         |
|     Total       Session      |
|                              |
+------------------------------+
```

## Launch Command

After setup, use the `ragy` command to start your IDE with CDP:

```bash
ragy
```

## License

MIT © [paean-ai](https://github.com/paean-ai)
