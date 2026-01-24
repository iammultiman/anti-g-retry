/**
 * Webview Entry Point - Agy Retry
 * With Antigravity usage statistics integration
 */
import {
    provideVSCodeDesignSystem,
    vsCodeButton,
    vsCodeCheckbox,
    vsCodeDivider
} from '@vscode/webview-ui-toolkit';

// Register VS Code UI Toolkit components
provideVSCodeDesignSystem().register(
    vsCodeButton(),
    vsCodeCheckbox(),
    vsCodeDivider()
);

import {
    MainPanel,
    updateAutoRetryStatus,
    appendAutoRetryLog,
    updateAutoStartCheckbox,
    updateQuotaData,
    updateRetryStats,
    updateBatchStatus,
    updateBatchProgress,
    appendBatchLog,
    updateCDPStatus,
    restoreBatchState
} from './panels/MainPanel';

// Declare vscode API type
interface VsCodeApi {
    postMessage: (message: unknown) => void;
    getState: () => unknown;
    setState: (state: unknown) => void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// Export vscode API for use in components
export const vscode: VsCodeApi = acquireVsCodeApi();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = document.getElementById('app');
    if (app) {
        const mainPanel = new MainPanel(app);
        mainPanel.render();
    }
});

// Handle messages from extension
interface AutoRetryStatusMessage {
    type: 'autoRetryStatus';
    data: { running: boolean; retryCount: number; connectionCount?: number };
}

interface AutoRetryLogMessage {
    type: 'autoRetryLog';
    data: { message: string; logType: 'success' | 'error' | 'info' };
}

interface AutoStartSettingMessage {
    type: 'autoStartSetting';
    data: { enabled: boolean };
}

interface QuotaUpdateMessage {
    type: 'quotaUpdate';
    data: {
        connected: boolean;
        keyModels?: {
            claude: number;
            geminiPro: number;
            geminiFlash: number;
        };
        resetTimes?: {
            claude: string;
            geminiPro: string;
            geminiFlash: string;
        };
        promptCredits?: {
            available: number;
            monthly: number;
            remainingPercentage: number;
        };
        userInfo?: {
            name?: string;
            tier?: string;
            planName?: string;
        };
        lastUpdate?: string;
        error?: string;
    };
}

interface RetryStatsMessage {
    type: 'retryStats';
    data: {
        totalRetries: number;
        sessionRetries: number;
        lastRetryTime: string | null;
    };
}

interface BatchStatusMessage {
    type: 'batchStatus';
    data: { status: string };
}

interface BatchProgressMessage {
    type: 'batchProgress';
    data: { current: number; total: number };
}

interface BatchLogMessage {
    type: 'batchLog';
    data: { message: string; logType: 'success' | 'error' | 'info' | 'warning' };
}

interface CDPStatusMessage {
    type: 'cdpStatus';
    data: { connected: boolean };
}

interface RestoreBatchStateMessage {
    type: 'restoreBatchState';
    data: { prompt: string; repeatCount: number };
}

type ExtensionMessage =
    | AutoRetryStatusMessage
    | AutoRetryLogMessage
    | AutoStartSettingMessage
    | QuotaUpdateMessage
    | RetryStatsMessage
    | BatchStatusMessage
    | BatchProgressMessage
    | BatchLogMessage
    | CDPStatusMessage
    | RestoreBatchStateMessage;

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
    const message = event.data;

    switch (message.type) {
        case 'autoRetryStatus':
            updateAutoRetryStatus(message.data.running, message.data.retryCount, message.data.connectionCount);
            break;
        case 'autoRetryLog':
            appendAutoRetryLog(message.data.message, message.data.logType);
            break;
        case 'autoStartSetting':
            updateAutoStartCheckbox(message.data.enabled);
            break;
        case 'quotaUpdate':
            updateQuotaData(message.data);
            break;
        case 'retryStats':
            updateRetryStats(message.data);
            break;
        case 'batchStatus':
            updateBatchStatus(message.data.status);
            break;
        case 'batchProgress':
            updateBatchProgress(message.data.current, message.data.total);
            break;
        case 'batchLog':
            appendBatchLog(message.data.message, message.data.logType);
            break;
        case 'cdpStatus':
            updateCDPStatus(message.data.connected);
            break;
        case 'restoreBatchState':
            restoreBatchState(message.data.prompt, message.data.repeatCount);
            break;
    }
});
