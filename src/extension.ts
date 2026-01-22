/**
 * Agy Retry - VS Code Extension
 * Auto-retry for AI coding agents. Zero-babysitting automation.
 */
import * as vscode from 'vscode';
import { SidePanelProvider } from './ui/SidePanelProvider';

let sidePanelProvider: SidePanelProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Agy Retry is activating...');

    // Register side panel
    sidePanelProvider = new SidePanelProvider(context.extensionUri);
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
            vscode.commands.executeCommand('agy-retry.focus');
        })
    );

    // Auto-start Auto Retry if enabled
    const config = vscode.workspace.getConfiguration('agyRetry');
    if (config.get('autoStart', false)) {
        // Delay auto-start to let UI initialize
        setTimeout(async () => {
            try {
                console.log('[Agy Retry] Auto-starting...');
                await sidePanelProvider?.tryAutoStartRetry();
            } catch (error) {
                console.error('[Agy Retry] Auto-start failed:', error);
            }
        }, 3000);
    }

    console.log('Agy Retry activated!');
}

export function deactivate(): void {
    console.log('Agy Retry deactivated');
}
