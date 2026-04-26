/**
 * Anti-g Retry - VS Code Extension
 * Auto-retry for AI coding agents. Zero-babysitting automation.
 * With Antigravity usage statistics integration.
 */
import * as vscode from 'vscode';
import { SidePanelProvider } from './ui/SidePanelProvider';
import { StatusBarManager } from './ui/StatusBarManager';
import { QuotaManager } from './services/QuotaManager';

let sidePanelProvider: SidePanelProvider | undefined;
let statusBarManager: StatusBarManager | undefined;
let quotaManager: QuotaManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Anti-g Retry is activating...');

    // Initialize QuotaManager singleton
    quotaManager = QuotaManager.getInstance();

    // Initialize StatusBarManager (shows model usage in status bar)
    statusBarManager = new StatusBarManager(quotaManager);
    context.subscriptions.push(statusBarManager);

    // Register side panel with QuotaManager
    sidePanelProvider = new SidePanelProvider(context.extensionUri, quotaManager, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidePanelProvider.viewType,
            sidePanelProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('agyRetry.start', async () => {
            await sidePanelProvider?.handleStartAutoRetry();
        }),

        vscode.commands.registerCommand('agyRetry.stop', async () => {
            await sidePanelProvider?.handleStopAutoRetry();
        }),

        vscode.commands.registerCommand('agyRetry.openPanel', () => {
            vscode.commands.executeCommand('agyRetry.mainPanel.focus');
        }),

        vscode.commands.registerCommand('agyRetry.refreshQuota', async () => {
            await quotaManager?.refresh();
        })
    );

    // Start quota monitoring
    await quotaManager.start();

    // Auto-start Auto Retry if enabled
    const config = vscode.workspace.getConfiguration('agyRetry');
    if (config.get('autoStart', false)) {
        // Delay auto-start to let UI initialize
        setTimeout(async () => {
            try {
                console.log('[Anti-g Retry] Auto-starting...');
                await sidePanelProvider?.tryAutoStartRetry();
            } catch (error) {
                console.error('[Anti-g Retry] Auto-start failed:', error);
            }
        }, 3000);
    }

    console.log('Anti-g Retry activated!');
}

export function deactivate(): void {
    quotaManager?.stop();
    console.log('Anti-g Retry deactivated');
}
