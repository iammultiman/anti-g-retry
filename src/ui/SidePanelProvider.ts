/**
 * SidePanelProvider - WebviewViewProvider for the side panel
 */
import * as vscode from 'vscode';
import { AutoRetryService } from '../services/AutoRetryService';

export class SidePanelProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'agyRetry.mainPanel';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private readonly _autoRetryService: AutoRetryService;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
        this._autoRetryService = new AutoRetryService();
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
                    break;
            }
        });
    }

    /**
     * Try to auto-start Auto Retry (called from extension activation)
     * Only starts if CDP is available, otherwise logs error silently
     */
    public async tryAutoStartRetry(): Promise<void> {
        // Set up log callback
        this._autoRetryService.setLogCallback((msg, type) => {
            this.sendAutoRetryLog(msg, type === 'warning' ? 'info' : type);
        });

        // Check CDP status
        const cdpAvailable = await this._autoRetryService.isCDPAvailable();

        if (!cdpAvailable) {
            this.sendAutoRetryLog('Auto-start: CDP not available. Please restart IDE with CDP flag.', 'error');
            this.sendAutoRetryStatus();
            return;
        }

        // CDP available - start
        this.sendAutoRetryLog('Auto-starting Auto Retry...', 'info');
        const started = await this._autoRetryService.start();

        if (started) {
            this.sendAutoRetryStatus();
            this.sendAutoRetryLog('✅ Auto Retry auto-started!', 'success');
        } else {
            this.sendAutoRetryLog('Auto-start failed', 'error');
            this.sendAutoRetryStatus();
        }
    }

    /**
     * Handle start auto-retry from webview
     * Single button flow: check CDP -> if OK, start; if not, auto-setup
     */
    public async handleStartAutoRetry(): Promise<void> {
        this.sendAutoRetryLog('Checking CDP...', 'info');

        // Set up log callback
        this._autoRetryService.setLogCallback((msg, type) => {
            this.sendAutoRetryLog(msg, type === 'warning' ? 'info' : type);
        });

        // Check CDP status first
        const cdpAvailable = await this._autoRetryService.isCDPAvailable();

        if (!cdpAvailable) {
            // CDP not available - auto setup
            this.sendAutoRetryLog('CDP not enabled. Setting up...', 'info');
            const setupSuccess = await this._autoRetryService.setupCDP();

            if (setupSuccess) {
                // Setup done, user needs to restart - dialog already shown by Relauncher
                this.sendAutoRetryLog('Please restart IDE to enable Auto Retry', 'info');
            } else {
                this.sendAutoRetryLog('Setup failed. Check instructions above.', 'error');
            }
            this.sendAutoRetryStatus();
            return;
        }

        // CDP available - start immediately
        this.sendAutoRetryLog('CDP available! Starting...', 'success');
        const started = await this._autoRetryService.start();

        if (started) {
            this.sendAutoRetryStatus();
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
