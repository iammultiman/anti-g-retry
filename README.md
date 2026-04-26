# Anti-g Retry

Auto-retry for AI coding agents (Cursor, Antigravity, VS Code). Zero-babysitting automation.

> **Note**: This is a fork of [agy-retry](https://github.com/paean-ai/agy-retry). Modifications and improvements were done by Matthew Anorkplim Loh.

[![OpenVSX](https://img.shields.io/open-vsx/v/iammultiman/anti-g-retry)](https://open-vsx.org/extension/iammultiman/anti-g-retry)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-iammultiman%2Fanti--g--retry-blue?logo=github)](https://github.com/iammultiman/anti-g-retry)

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

> 🚀 **No CDP? Try `antig`!**
> Run `antig` in terminal to launch Agy with CDP enabled.
> If it works, retry lives on. If not, maybe Google fixed it. Happy vibe coding! ✨

This may indicate:
- Antigravity was not launched with CDP flags → use `antig` command
- Google has officially fixed the retry issue → the plugin's retry mission is complete! 🎉

## Quick Start

1. Install the extension
2. Click the **Anti-g Retry** icon in sidebar
3. Click **Start** → follow CDP setup prompts
4. After IDE restart, click **Start** again
5. ✅ Auto-retry is active!

## How It Works

```
IDE (with CDP flag) ←→ WebSocket ←→ Anti-g Retry
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
|  ⚡ Anti-g Retry              |
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

After setup, use the `antig` command to start your IDE with CDP:

```bash
antig
```

## Batch Automation

Run prompts automatically in a loop for complex, iterative tasks.

### Iterative Loop Pattern

The batch automation feature is designed for tasks that may not complete in a single run due to context limits. Use this pattern:

```text
1. Check pending.md for unfinished items
2. Complete tasks A, B, C, D, E in sequence
3. Mark completed tasks, save incomplete ones
4. Repeat until pending.md is empty
```

**Why this works:**
- Each batch run starts fresh with full context
- Tasks track their own progress in files (e.g., `pending.md`)
- Incomplete work is automatically picked up in the next iteration
- Complex multi-step workflows complete reliably over multiple runs

### Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| Repeat Count | 5 | Number of times to run the prompt in batch mode |
| Timeout | 5 hours | Maximum wait time per run in batch mode |
| Cooldown | 5 seconds | Minimum time to wait after an auto-retry before attempting again |

### Tips

- ✅ Design prompts that check and update state files
- ✅ Use meaningful progress markers your prompt can detect
- ✅ Set repeat count high enough to allow completion
- ❌ Don't rely on in-memory state between runs

## CoolDown Period

The **Cooldown Period** is a protective mechanism that defines the minimum waiting time (in seconds) between consecutive automated retry attempts. This ensures that the IDE is not overwhelmed with retry commands, and provides a buffer for the underlying AI language models to recover from rate limits or transient errors. You can adjust the default (5 seconds) directly in the extension's side panel settings to suit your workflow.

## Security & Stability Improvements

Recent updates have significantly enhanced the extension's stability and security:
- **Hardened Executions**: Migrated all local process invocations to use direct execution bypassing the system shell, completely eliminating any risk of command injection paths.
- **Robust Port Detection**: Integrated precise process ID matching to accurately locate the Antigravity Language Server across Windows and Unix.
- **Zero XSS Vectors**: Webview panels utilize strict text interpolation instead of direct inner HTML to securely display logs and statuses.

## License

MIT © [iammultiman](https://github.com/iammultiman)
