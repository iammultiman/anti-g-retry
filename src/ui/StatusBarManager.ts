/**
 * StatusBarManager - VS Code status bar item for quick model usage display
 * 
 * Shows: ⚡ Claude 80% | Pro 60% | Flash 40%
 */

import * as vscode from 'vscode';
import { QuotaManager, QuotaState } from '../services/QuotaManager';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;
    private disposable: vscode.Disposable;

    constructor(quotaManager: QuotaManager) {
        // Create status bar item with high priority (shows on left side)
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );

        this.statusBarItem.command = 'agyRetry.openPanel';
        this.statusBarItem.tooltip = 'Click to open Anti-g Retry panel';

        // Subscribe to quota updates
        this.disposable = quotaManager.onUpdate((state) => {
            this.updateDisplay(state);
        });

        this.statusBarItem.show();
    }

    private updateDisplay(state: QuotaState): void {
        if (!state.connected || !state.keyModels) {
            this.statusBarItem.text = '$(zap) Anti-g: Offline';
            this.statusBarItem.backgroundColor = undefined;
            return;
        }

        const models = state.keyModels;
        const parts: string[] = [];

        // Build display string
        if (models.claude >= 0) {
            parts.push(`C:${models.claude}%`);
        }
        if (models.geminiPro >= 0) {
            parts.push(`P:${models.geminiPro}%`);
        }
        if (models.geminiFlash >= 0) {
            parts.push(`F:${models.geminiFlash}%`);
        }

        if (parts.length === 0) {
            this.statusBarItem.text = '$(zap) Anti-g: Connected';
        } else {
            this.statusBarItem.text = `$(zap) ${parts.join(' | ')}`;
        }

        // Color based on lowest percentage
        const values = [models.claude, models.geminiPro, models.geminiFlash].filter(v => v >= 0);
        const lowestValue = values.length > 0 ? Math.min(...values) : 100;

        if (lowestValue < 20) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (lowestValue < 40) {
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.statusBarItem.backgroundColor = undefined;
        }

        // Detailed tooltip with reset times
        const tooltipLines = ['Antigravity Model Usage'];
        const resetTimes = state.resetTimes;
        if (models.claude >= 0) {
            const resetInfo = resetTimes?.claude ? ` (reset: ${resetTimes.claude})` : '';
            tooltipLines.push(`Claude: ${models.claude}% remaining${resetInfo}`);
        }
        if (models.geminiPro >= 0) {
            const resetInfo = resetTimes?.geminiPro ? ` (reset: ${resetTimes.geminiPro})` : '';
            tooltipLines.push(`Gemini Pro: ${models.geminiPro}% remaining${resetInfo}`);
        }
        if (models.geminiFlash >= 0) {
            const resetInfo = resetTimes?.geminiFlash ? ` (reset: ${resetTimes.geminiFlash})` : '';
            tooltipLines.push(`Gemini Flash: ${models.geminiFlash}% remaining${resetInfo}`);
        }
        if (state.lastUpdate) {
            tooltipLines.push(`Last updated: ${state.lastUpdate.toLocaleTimeString()}`);
        }
        tooltipLines.push('Click to open Anti-g Retry panel');

        this.statusBarItem.tooltip = tooltipLines.join('\n');
    }

    public dispose(): void {
        this.disposable.dispose();
        this.statusBarItem.dispose();
    }
}
