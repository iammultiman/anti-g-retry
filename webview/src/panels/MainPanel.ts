/**
 * Main Panel Component - Agy Retry
 * Focused Auto Retry UI
 */
import { vscode } from '../index';

export class MainPanel {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    render(): void {
        this.container.innerHTML = `
      <div class="main-panel">
        <!-- Header -->
        <div class="header">
          <span class="codicon codicon-zap"></span>
          <h2>Agy Retry</h2>
        </div>

        <!-- Description -->
        <p class="description">
          Auto-click Retry buttons when AI coding agents encounter errors.
          Zero-babysitting automation.
        </p>

        <vscode-divider></vscode-divider>

        <!-- Status Section -->
        <section class="status-section">
          <div class="status-row">
            <span class="status-label">Status:</span>
            <span id="auto-retry-status" class="status-badge">OFF</span>
          </div>
          <div class="status-row" id="connection-row" style="display: none;">
            <span class="status-label">Connections:</span>
            <span id="connection-count">0</span>
          </div>
        </section>

        <vscode-divider></vscode-divider>

        <!-- Controls Section -->
        <section class="controls-section">
          <!-- Auto Start Checkbox -->
          <div class="checkbox-row">
            <vscode-checkbox id="chk-auto-start">Auto-start on launch</vscode-checkbox>
          </div>
          
          <!-- Toggle Button -->
          <div class="button-row">
            <vscode-button id="btn-toggle-auto-retry" appearance="primary" class="full-width">
              <span class="codicon codicon-play" id="btn-toggle-icon"></span>
              <span id="btn-toggle-text">Start</span>
            </vscode-button>
          </div>
        </section>

        <vscode-divider></vscode-divider>

        <!-- Log Section -->
        <section class="log-section">
          <div class="section-header">
            <span class="codicon codicon-terminal"></span>
            <span class="section-title">Log</span>
          </div>
          <div id="auto-retry-log" class="log-output">
            <div class="log-empty">Click Start to enable auto-retry</div>
          </div>
        </section>

        <!-- Help Section -->
        <vscode-divider></vscode-divider>
        <section class="help-section">
          <div class="help-text">
            <strong>How it works:</strong>
            <ol>
              <li>IDE must be launched with CDP flag</li>
              <li>Click Start to enable auto-retry</li>
              <li>When AI agent errors occur, Retry button is clicked automatically</li>
            </ol>
          </div>
        </section>
      </div>
    `;

        this.attachEventListeners();
        this.requestInitialStatus();
    }

    private requestInitialStatus(): void {
        vscode.postMessage({ type: 'getAutoRetryStatus' });
    }

    private attachEventListeners(): void {
        // Toggle button
        document.getElementById('btn-toggle-auto-retry')?.addEventListener('click', () => {
            const statusBadge = document.getElementById('auto-retry-status');
            const isRunning = statusBadge?.textContent === 'ON';
            if (isRunning) {
                vscode.postMessage({ type: 'stopAutoRetry' });
            } else {
                vscode.postMessage({ type: 'startAutoRetry' });
            }
        });

        // Auto-start checkbox
        document.getElementById('chk-auto-start')?.addEventListener('change', (e) => {
            const checkbox = e.target as HTMLInputElement;
            vscode.postMessage({ type: 'setAutoStart', data: { enabled: checkbox.checked } });
        });
    }
}

// Export functions to update UI from extension messages
export function updateAutoRetryStatus(running: boolean, retryCount: number, connectionCount?: number): void {
    const statusBadge = document.getElementById('auto-retry-status');
    const toggleBtn = document.getElementById('btn-toggle-auto-retry');
    const toggleIcon = document.getElementById('btn-toggle-icon');
    const toggleText = document.getElementById('btn-toggle-text');
    const connectionRow = document.getElementById('connection-row');
    const connectionCountEl = document.getElementById('connection-count');

    // Update status badge
    if (statusBadge) {
        statusBadge.textContent = running ? 'ON' : 'OFF';
        statusBadge.className = running ? 'status-badge status-on' : 'status-badge status-off';
    }

    // Update toggle button
    if (toggleBtn && toggleIcon && toggleText) {
        if (running) {
            toggleBtn.setAttribute('appearance', 'secondary');
            toggleIcon.className = 'codicon codicon-debug-stop';
            toggleText.textContent = 'Stop';
        } else {
            toggleBtn.setAttribute('appearance', 'primary');
            toggleIcon.className = 'codicon codicon-play';
            toggleText.textContent = 'Start';
        }
    }

    // Update connection count
    if (connectionRow && connectionCountEl && connectionCount !== undefined) {
        connectionRow.style.display = running ? 'flex' : 'none';
        connectionCountEl.textContent = String(connectionCount);
    }
}

export function updateAutoStartCheckbox(enabled: boolean): void {
    const checkbox = document.getElementById('chk-auto-start') as HTMLInputElement;
    if (checkbox) {
        checkbox.checked = enabled;
    }
}

export function appendAutoRetryLog(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const logOutput = document.getElementById('auto-retry-log');
    if (!logOutput) return;

    // Remove empty message
    const empty = logOutput.querySelector('.log-empty');
    if (empty) empty.remove();

    // Create new log line
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.textContent = message;

    // Add to bottom
    logOutput.appendChild(line);

    // Auto-scroll to bottom
    logOutput.scrollTop = logOutput.scrollHeight;

    // Keep only last 20 lines
    while (logOutput.children.length > 20) {
        logOutput.firstChild?.remove();
    }
}
