/**
 * SidePanelProvider - WebviewViewProvider for the side panel
 * With Antigravity usage statistics integration
 */
import * as vscode from 'vscode';
import { AutoRetryService } from '../services/AutoRetryService';
import { QuotaManager, QuotaState } from '../services/QuotaManager';
import { BatchPromptService, BatchStatus } from '../services/BatchPromptService';

// State keys for persistence
const BATCH_STATE_KEY = 'agyRetry.batchState';

interface BatchPersistentState {
    prompt: string;
    repeatCount: number;
}

export class SidePanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'agyRetry.mainPanel';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private readonly _context: vscode.ExtensionContext;
    private readonly _autoRetryService: AutoRetryService;
    private readonly _quotaManager: QuotaManager;
    private _quotaDisposable?: vscode.Disposable;
    private _batchPromptService?: BatchPromptService;

    constructor(extensionUri: vscode.Uri, quotaManager: QuotaManager, context: vscode.ExtensionContext) {
        this._extensionUri = extensionUri;
        this._context = context;
        this._autoRetryService = new AutoRetryService();
        this._quotaManager = quotaManager;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
                vscode.Uri.joinPath(this._extensionUri, 'webview', 'media')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'startAutoRetry':
                    await this.handleStartAutoRetry();
                    break;
                case 'stopAutoRetry':
                    await this.handleStopAutoRetry();
                    break;
                case 'setAutoStart':
                    await this.handleSetAutoStart(message.data?.enabled ?? false);
                    break;
                case 'setCooldown':
                    await this.handleSetCooldown(message.data?.seconds ?? 5);
                    break;
                case 'getAutoRetryStatus':
                    this.sendAutoRetryStatus();
                    this.sendAutoStartSetting();
                    this.sendCooldownSetting();
                    this.sendQuotaUpdate(this._quotaManager.getState());
                    this.sendRetryStats();
                    this.checkAndSendCDPStatus();
                    this.restoreBatchState(); // Restore saved batch state
                    break;
                case 'refreshQuota':
                    await this._quotaManager.refresh();
                    break;
                case 'startBatch':
                    await this.handleStartBatch(message.data?.prompt, message.data?.repeatCount);
                    break;
                case 'pauseBatch':
                    this.handlePauseBatch();
                    break;
                case 'stopBatch':
                    this.handleStopBatch();
                    break;
                case 'copyDOMInfo':
                    await this.handleCopyDOMInfo();
                    break;
                case 'copyLastError':
                    await this.handleCopyLastError();
                    break;
                case 'openCDPSettings':
                    await this.handleOpenCDPSettings();
                    break;
            }
        });

        // Subscribe to quota updates
        this._quotaDisposable = this._quotaManager.onUpdate((state) => {
            this.sendQuotaUpdate(state);
            this.sendRetryStats();
        });

        // Cleanup on dispose
        webviewView.onDidDispose(() => {
            this._quotaDisposable?.dispose();
        });
    }

    /**
     * Try to auto-start Auto Retry (called from extension activation)
     */
    public async tryAutoStartRetry(): Promise<void> {
        this._autoRetryService.setLogCallback((msg, type) => {
            this.sendAutoRetryLog(msg, type === 'warning' ? 'info' : type);
        });

        // Set up retry count callback (same as handleStartAutoRetry)
        this._autoRetryService.setRetryCallback(() => {
            this._quotaManager.incrementRetryCount();
            this.sendRetryStats();
        });

        const cdpAvailable = await this._autoRetryService.isCDPAvailable();

        if (!cdpAvailable) {
            this.sendAutoRetryLog('Auto-start: CDP not available. Please restart IDE with CDP flag.', 'error');
            this.sendAutoRetryStatus();
            return;
        }

        this.sendAutoRetryLog('Auto-starting Auto Retry...', 'info');
        const started = await this._autoRetryService.start();

        if (started) {
            this._quotaManager.resetSessionRetries();
            this.sendAutoRetryStatus();
            this.sendRetryStats();
            this.sendAutoRetryLog('✅ Auto Retry auto-started!', 'success');
        } else {
            this.sendAutoRetryLog('Auto-start failed', 'error');
            this.sendAutoRetryStatus();
        }
    }

    /**
     * Handle start auto-retry from webview
     */
    public async handleStartAutoRetry(): Promise<void> {
        this.sendAutoRetryLog('Checking CDP...', 'info');

        this._autoRetryService.setLogCallback((msg, type) => {
            this.sendAutoRetryLog(msg, type === 'warning' ? 'info' : type);
        });

        // Set up retry count callback
        this._autoRetryService.setRetryCallback(() => {
            this._quotaManager.incrementRetryCount();
            this.sendRetryStats();
        });

        const cdpAvailable = await this._autoRetryService.isCDPAvailable();

        if (!cdpAvailable) {
            this.sendAutoRetryLog('CDP not enabled. Setting up...', 'info');
            const setupSuccess = await this._autoRetryService.setupCDP();

            if (setupSuccess) {
                this.sendAutoRetryLog('Please restart IDE to enable Auto Retry', 'info');
            } else {
                this.sendAutoRetryLog('Setup failed. Check instructions above.', 'error');
            }
            this.sendAutoRetryStatus();
            return;
        }

        this.sendAutoRetryLog('CDP available! Starting...', 'success');
        const started = await this._autoRetryService.start();

        if (started) {
            this._quotaManager.resetSessionRetries();
            this.sendAutoRetryStatus();
            this.sendRetryStats();
            vscode.window.showInformationMessage('Auto Retry started - auto-clicking Retry buttons');
        } else {
            this.sendAutoRetryStatus();
        }
    }

    /**
     * Handle stop auto-retry from webview
     */
    public async handleStopAutoRetry(): Promise<void> {
        await this._autoRetryService.stop();
        this.sendAutoRetryStatus();
        this.sendAutoRetryLog('Auto Retry stopped', 'info');
    }

    /**
     * Send auto-retry status to webview
     */
    private sendAutoRetryStatus(): void {
        if (!this._view) return;
        const status = this._autoRetryService.getStatus();
        this._view.webview.postMessage({
            type: 'autoRetryStatus',
            data: {
                running: status.running,
                retryCount: status.retryCount,
                connectionCount: status.connectionCount
            }
        });
    }

    /**
     * Send quota update to webview
     */
    private sendQuotaUpdate(state: QuotaState): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            type: 'quotaUpdate',
            data: {
                connected: state.connected,
                keyModels: state.keyModels,
                resetTimes: state.resetTimes,
                promptCredits: state.snapshot?.promptCredits,
                userInfo: state.snapshot?.userInfo,
                lastUpdate: state.lastUpdate?.toISOString(),
                error: state.error
            }
        });
    }

    /**
     * Send retry stats to webview
     */
    private sendRetryStats(): void {
        if (!this._view) return;
        const stats = this._quotaManager.getRetryStats();
        this._view.webview.postMessage({
            type: 'retryStats',
            data: stats
        });
    }

    /**
     * Send auto-retry log message to webview
     */
    private sendAutoRetryLog(message: string, logType: 'success' | 'error' | 'info'): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            type: 'autoRetryLog',
            data: { message, logType }
        });
    }

    /**
     * Handle set auto-start setting from webview
     */
    private async handleSetAutoStart(enabled: boolean): Promise<void> {
        const config = vscode.workspace.getConfiguration('agyRetry');
        await config.update('autoStart', enabled, vscode.ConfigurationTarget.Global);
        this.sendAutoRetryLog(enabled ? 'Auto-start enabled' : 'Auto-start disabled', 'info');
    }

    /**
     * Send auto-start setting to webview
     */
    private sendAutoStartSetting(): void {
        if (!this._view) return;
        const config = vscode.workspace.getConfiguration('agyRetry');
        const enabled = config.get('autoStart', false);
        this._view.webview.postMessage({
            type: 'autoStartSetting',
            data: { enabled }
        });
    }

    /**
     * Handle set cooldown setting from webview
     */
    private async handleSetCooldown(seconds: number): Promise<void> {
        const config = vscode.workspace.getConfiguration('agyRetry');
        await config.update('cooldownSeconds', seconds, vscode.ConfigurationTarget.Global);
        this.sendAutoRetryLog(`Cooldown set to ${seconds}s`, 'info');
    }

    /**
     * Send cooldown setting to webview
     */
    private sendCooldownSetting(): void {
        if (!this._view) return;
        const config = vscode.workspace.getConfiguration('agyRetry');
        const seconds = config.get('cooldownSeconds', 5);
        this._view.webview.postMessage({
            type: 'cooldownSetting',
            data: { seconds }
        });
    }

    /**
     * Check CDP availability and send status to webview
     */
    private async checkAndSendCDPStatus(): Promise<void> {
        if (!this._view) return;
        const cdpAvailable = await this._autoRetryService.isCDPAvailable();
        this._view.webview.postMessage({
            type: 'cdpStatus',
            data: { connected: cdpAvailable }
        });
    }

    /**
     * Handle start batch automation
     */
    private async handleStartBatch(prompt: string, repeatCount: number): Promise<void> {
        if (!prompt || repeatCount < 1) {
            this.sendBatchLog('Invalid batch parameters', 'error');
            return;
        }

        // Save batch state for persistence across tab switches
        this.saveBatchState(prompt, repeatCount);

        // Initialize batch service if needed
        if (!this._batchPromptService) {
            this._batchPromptService = new BatchPromptService(this._autoRetryService['cdpHandler']);

            // Set up callbacks
            this._batchPromptService.setLogCallback((msg, type) => {
                this.sendBatchLog(msg, type);
            });

            this._batchPromptService.setProgressCallback((current, total) => {
                this.sendBatchProgress(current, total);
            });

            this._batchPromptService.setStatusCallback((status) => {
                this.sendBatchStatus(status);
            });
        }

        this.sendBatchLog(`Starting batch: ${repeatCount} runs`, 'info');
        const started = await this._batchPromptService.startBatch(prompt, repeatCount);

        if (started) {
            this.sendBatchStatus('running');
        } else {
            this.sendBatchStatus('error');
        }
    }

    /**
     * Handle pause batch
     */
    private handlePauseBatch(): void {
        if (this._batchPromptService) {
            this._batchPromptService.pauseBatch();
        }
    }

    /**
     * Handle stop batch
     */
    private handleStopBatch(): void {
        if (this._batchPromptService) {
            this._batchPromptService.stopBatch();
        }
    }

    /**
     * Send batch status to webview
     */
    private sendBatchStatus(status: BatchStatus): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            type: 'batchStatus',
            data: { status }
        });
    }

    /**
     * Send batch progress to webview
     */
    private sendBatchProgress(current: number, total: number): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            type: 'batchProgress',
            data: { current, total }
        });
    }

    /**
     * Send batch log to webview
     */
    private sendBatchLog(message: string, logType: 'success' | 'error' | 'info' | 'warning'): void {
        if (!this._view) return;
        this._view.webview.postMessage({
            type: 'batchLog',
            data: { message, logType }
        });
    }

    /**
     * Handle copy DOM info for debugging
     */
    private async handleCopyDOMInfo(): Promise<void> {
        try {
            // Initialize batch service if needed (to access CDP)
            if (!this._batchPromptService) {
                this._batchPromptService = new BatchPromptService(this._autoRetryService['cdpHandler']);
            }

            const domInfo = await this._batchPromptService.getDOMDebugInfo();
            await vscode.env.clipboard.writeText(domInfo);
            vscode.window.showInformationMessage('DOM info copied to clipboard');
            this.sendBatchLog('DOM info copied!', 'success');
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.sendBatchLog(`Failed to get DOM info: ${msg}`, 'error');
        }
    }

    /**
     * Handle copy last error for debugging
     */
    private async handleCopyLastError(): Promise<void> {
        if (!this._batchPromptService) {
            this.sendBatchLog('No batch service initialized', 'warning');
            return;
        }

        const lastError = this._batchPromptService.getLastError();
        if (lastError) {
            await vscode.env.clipboard.writeText(lastError);
            vscode.window.showInformationMessage('Last error copied to clipboard');
            this.sendBatchLog('Last error copied!', 'success');
        } else {
            this.sendBatchLog('No error to copy', 'info');
        }
    }

    /**
     * Handle opening CDP settings and showing setup guide
     * Improved flow: Auto-create script in ~/bin with complete PATH guidance
     */
    private async handleOpenCDPSettings(): Promise<void> {
        const config = vscode.workspace.getConfiguration('agyRetry');
        const cdpPort = config.get<number>('cdpPort', 31905);
        const os = require('os');
        const fs = require('fs');
        const path = require('path');

        // Detect IDE type and find app path for macOS
        const appName = vscode.env.appName.toLowerCase();
        let ideName: string;
        let ideCommand: string;

        if (appName.includes('cursor')) {
            ideName = 'Cursor';
            ideCommand = 'cursor';
        } else if (appName.includes('antigravity')) {
            ideName = 'Antigravity';
            ideCommand = 'antigravity';
        } else {
            ideName = 'VS Code';
            ideCommand = 'code';
        }

        // For macOS, find the actual .app path
        let macAppPath = '';
        if (os.platform() === 'darwin') {
            const locations = ['/Applications', path.join(os.homedir(), 'Applications')];
            const appNames = [`${ideName}.app`, 'Antigravity.app', 'Cursor.app', 'Visual Studio Code.app'];
            for (const loc of locations) {
                for (const name of appNames) {
                    const p = path.join(loc, name);
                    if (fs.existsSync(p)) { macAppPath = p; break; }
                }
                if (macAppPath) break;
            }
        }

        // Show QuickPick with setup options
        const selection = await vscode.window.showQuickPick([
            {
                label: '$(rocket) Auto-Create antig Script',
                description: 'Automatically create ~/bin/antig now',
                detail: `Creates the script instantly - just restart IDE using 'antig' command`,
                action: 'auto-create'
            },
            {
                label: '$(terminal) Copy Script Content',
                description: 'Manual installation via terminal',
                detail: 'For advanced users who want to customize the script',
                action: 'create-script'
            },
            {
                label: '$(copy) Copy Launch Command',
                description: `${ideCommand} --remote-debugging-port=${cdpPort}`,
                detail: 'One-time launch command (no script install)',
                action: 'copy-command'
            },
            {
                label: '$(gear) Open CDP Settings',
                description: `Current port: ${cdpPort}`,
                detail: 'Configure CDP port and other settings',
                action: 'open-settings'
            },
            {
                label: '$(book) View Full Guide',
                description: 'Show detailed setup instructions',
                action: 'show-guide'
            }
        ], {
            title: '🚀 CDP Setup Guide - Enable antig Command',
            placeHolder: 'Select an option to enable auto-retry features'
        });

        if (!selection) return;

        switch (selection.action) {
            case 'auto-create': {
                // Auto-create the antig script in ~/bin
                const binDir = path.join(os.homedir(), 'bin');
                const wrapperPath = path.join(binDir, 'antig');

                try {
                    fs.mkdirSync(binDir, { recursive: true });

                    // Generate script based on platform
                    let scriptContent: string;
                    if (os.platform() === 'darwin' && macAppPath) {
                        scriptContent = `#!/bin/bash
# antig - Launch ${ideName} with CDP enabled for Anti-g Retry
# Auto-generated by Anti-g Retry plugin

PORT=${cdpPort}
echo "🚀 Launching ${ideName} with CDP on port $PORT..."
open -a "${macAppPath}" --args --remote-debugging-port=$PORT "$@"
`;
                    } else {
                        scriptContent = `#!/bin/bash
# antig - Launch ${ideName} with CDP enabled for Anti-g Retry
# Auto-generated by Anti-g Retry plugin

PORT=${cdpPort}
echo "🚀 Launching ${ideName} with CDP on port $PORT..."
${ideCommand} --remote-debugging-port=$PORT "$@"
`;
                    }

                    fs.writeFileSync(wrapperPath, scriptContent, { mode: 0o755 });

                    // Check if ~/bin is in PATH
                    const pathEnv = process.env.PATH || '';
                    const binInPath = pathEnv.split(':').some(p =>
                        p === binDir || p === '$HOME/bin' || p === '~/bin'
                    );

                    if (binInPath) {
                        // PATH already includes ~/bin
                        const nextStep = await vscode.window.showInformationMessage(
                            `✅ Script created at ${wrapperPath}\n\nNext: Quit ${ideName} (Cmd+Q) and run 'antig' in terminal`,
                            'Copy: antig'
                        );
                        if (nextStep === 'Copy: antig') {
                            await vscode.env.clipboard.writeText('antig');
                            vscode.window.showInformationMessage('Copied! Now quit IDE and run antig in terminal.');
                        }
                    } else {
                        // Need to add ~/bin to PATH
                        const addPath = await vscode.window.showWarningMessage(
                            `✅ Script created at ${wrapperPath}\n\n⚠️ ~/bin is not in your PATH. Add it to use 'antig' command.`,
                            'Copy PATH Setup',
                            'Skip (I\'ll handle it)'
                        );

                        if (addPath === 'Copy PATH Setup') {
                            const shell = process.env.SHELL || '/bin/zsh';
                            const rcFile = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc';
                            const pathCommand = `echo 'export PATH="$HOME/bin:$PATH"' >> ${rcFile} && source ${rcFile}`;
                            await vscode.env.clipboard.writeText(pathCommand);
                            vscode.window.showInformationMessage(
                                `PATH setup copied! After running it:\n1. Quit ${ideName} (Cmd+Q)\n2. Run 'antig' in terminal`
                            );
                        } else {
                            vscode.window.showInformationMessage(
                                `Script ready! Add ~/bin to PATH, then run 'antig' to start.`
                            );
                        }
                    }
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to create script: ${e.message}`);
                }
                break;
            }
            case 'create-script': {
                // Generate script based on platform
                let scriptContent: string;
                if (os.platform() === 'darwin' && macAppPath) {
                    scriptContent = `#!/bin/bash
# antig - Launch ${ideName} with CDP enabled for Anti-g Retry
# Install: mkdir -p ~/bin && pbpaste > ~/bin/antig && chmod +x ~/bin/antig

PORT=${cdpPort}
echo "🚀 Launching ${ideName} with CDP on port $PORT..."
open -a "${macAppPath}" --args --remote-debugging-port=$PORT "$@"
`;
                } else {
                    scriptContent = `#!/bin/bash
# antig - Launch ${ideName} with CDP enabled for Anti-g Retry
# Install: mkdir -p ~/bin && pbpaste > ~/bin/antig && chmod +x ~/bin/antig

PORT=${cdpPort}
echo "🚀 Launching ${ideName} with CDP on port $PORT..."
${ideCommand} --remote-debugging-port=$PORT "$@"
`;
                }
                await vscode.env.clipboard.writeText(scriptContent);

                const nextAction = await vscode.window.showInformationMessage(
                    'Script copied! Next steps:\n\n1. Copy the install command\n2. Paste in terminal\n3. Add ~/bin to PATH if needed',
                    'Copy Install Command',
                    'Copy PATH Setup'
                );

                if (nextAction === 'Copy Install Command') {
                    await vscode.env.clipboard.writeText('mkdir -p ~/bin && pbpaste > ~/bin/antig && chmod +x ~/bin/antig');
                    vscode.window.showInformationMessage('Install command copied! Paste in terminal.');
                } else if (nextAction === 'Copy PATH Setup') {
                    const shell = process.env.SHELL || '/bin/zsh';
                    const rcFile = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc';
                    await vscode.env.clipboard.writeText(`echo 'export PATH="$HOME/bin:$PATH"' >> ${rcFile}`);
                    vscode.window.showInformationMessage(`PATH setup copied! Add to ${rcFile}, then restart terminal.`);
                }
                break;
            }
            case 'copy-command': {
                const launchCommand = `${ideCommand} --remote-debugging-port=${cdpPort}`;
                await vscode.env.clipboard.writeText(launchCommand);
                vscode.window.showInformationMessage(`Copied: ${launchCommand}`);
                break;
            }
            case 'open-settings':
                await vscode.commands.executeCommand('workbench.action.openSettings', 'agyRetry.cdpPort');
                break;
            case 'show-guide': {
                const shell = process.env.SHELL || '/bin/zsh';
                const rcFile = shell.includes('zsh') ? '~/.zshrc' : '~/.bashrc';
                const guideContent = `# Anti-g Retry CDP Setup Guide

## Quick Setup (Recommended)

Click **"Auto-Create antig Script"** in the Setup menu. This will:
1. Create \`~/bin/antig\` script automatically
2. Guide you to add \`~/bin\` to your PATH if needed

## Manual Installation

### Step 1: Create the script

\`\`\`bash
mkdir -p ~/bin
cat > ~/bin/antig << 'EOF'
#!/bin/bash
PORT=${cdpPort}
echo "🚀 Launching ${ideName} with CDP on port $PORT..."
${ideCommand} --remote-debugging-port=$PORT "$@"
EOF
chmod +x ~/bin/antig
\`\`\`

### Step 2: Add ~/bin to PATH (if not already)

\`\`\`bash
echo 'export PATH="$HOME/bin:$PATH"' >> ${rcFile}
source ${rcFile}
\`\`\`

### Step 3: Use antig

\`\`\`bash
# Quit your current IDE first (Cmd+Q on macOS)
antig
\`\`\`

## Verify Connection

After launching with \`antig\`:
- The "CDP Not Connected" notice should disappear
- Auto Retry and Batch Automation features will become available

## Configure Port

Current CDP Port: ${cdpPort}
Change in: Settings > Extensions > Anti-g Retry > CDP Port

## Troubleshooting

**"antig: command not found"**
- Ensure \`~/bin\` is in your PATH
- Run: \`echo $PATH | grep -o '$HOME/bin'\`
- Restart your terminal after modifying ${rcFile}

**CDP still not connected**
- Fully quit the IDE (Cmd+Q), not just close the window
- Run \`antig\` from a fresh terminal
- Check if port ${cdpPort} is available: \`lsof -i :${cdpPort}\`
`;
                const doc = await vscode.workspace.openTextDocument({
                    content: guideContent,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, { preview: true });
                break;
            }
        }
    }

    /**
     * Save batch state for persistence across tab switches
     */
    private saveBatchState(prompt: string, repeatCount: number): void {
        const state: BatchPersistentState = { prompt, repeatCount };
        this._context.workspaceState.update(BATCH_STATE_KEY, state);
    }

    /**
     * Restore batch state and send to webview
     */
    private restoreBatchState(): void {
        if (!this._view) return;
        const state = this._context.workspaceState.get<BatchPersistentState>(BATCH_STATE_KEY);
        if (state && state.prompt) {
            this._view.webview.postMessage({
                type: 'restoreBatchState',
                data: state
            });
        }
    }

    /**
     * Generate HTML for the webview
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'main.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'media', 'styles.css')
        );

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src https://microsoft.github.io; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Anti-g Retry</title>
</head>
<body>
    <div id="app"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
