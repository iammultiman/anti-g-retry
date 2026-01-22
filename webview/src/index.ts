/**
 * Webview Entry Point - Agy Retry
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

import { MainPanel, updateAutoRetryStatus, appendAutoRetryLog, updateAutoStartCheckbox } from './panels/MainPanel';

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

type ExtensionMessage = AutoRetryStatusMessage | AutoRetryLogMessage | AutoStartSettingMessage;

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
    }
});
