/**
 * SidePanelProvider - WebviewViewProvider for the side panel
 * With Antigravity usage statistics integration
 */
import * as vscode from 'vscode';
import { AutoRetryService } from '../services/AutoRetryService';
import { QuotaManager, QuotaState } from '../services/QuotaManager';

export class SidePanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'agyRetry.mainPanel';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private readonly _autoRetryService: AutoRetryService;
    private readonly _quotaManager: QuotaManager;
    private _quotaDisposable?: vscode.Disposable;

    constructor(extensionUri: vscode.Uri, quotaManager: QuotaManager) {
        this._extensionUri = extensionUri;
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
                    break;
                case 'refreshQuota':
                    await this._quotaManager.refresh();
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
