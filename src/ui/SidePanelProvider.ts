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
                case 'getAutoRetryStatus':
                    this.sendAutoRetryStatus();
                    this.sendAutoStartSetting();
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
    <title>Agy Retry</title>
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
