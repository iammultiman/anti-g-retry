/**
 * Main Panel Component - Agy Retry
 * Modern premium UI with usage statistics and retry tracking
 */
import { vscode } from '../index';

// State types
interface KeyModels {
  claude: number;
  geminiPro: number;
  geminiFlash: number;
}

interface ResetTimes {
  claude: string;
  geminiPro: string;
  geminiFlash: string;
}

interface QuotaData {
  connected: boolean;
  keyModels?: KeyModels;
  resetTimes?: ResetTimes;
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
}

interface RetryStatsData {
  totalRetries: number;
  sessionRetries: number;
  lastRetryTime: string | null;
}

// Global state
let currentQuota: QuotaData = { connected: false };
let currentRetryStats: RetryStatsData = { totalRetries: 0, sessionRetries: 0, lastRetryTime: null };

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
          <div class="header-content">
            <span class="codicon codicon-zap header-icon"></span>
            <div class="header-text">
              <h2>Agy Retry</h2>
              <span class="subtitle">Zero-babysitting automation</span>
            </div>
          </div>
          <div class="connection-badge" id="connection-badge">
            <span class="dot"></span>
            <span class="text">Offline</span>
          </div>
        </div>

        <!-- Usage Stats Section -->
        <section class="usage-section" id="usage-section">
          <div class="section-header">
            <span class="codicon codicon-dashboard"></span>
            <span class="section-title">Model Usage</span>
            <button class="refresh-btn" id="btn-refresh-quota" title="Refresh quota">
              <span class="codicon codicon-refresh"></span>
            </button>
          </div>
          <div class="model-cards" id="model-cards">
            <div class="model-card" data-model="claude">
              <div class="model-ring">
                <svg viewBox="0 0 36 36" class="circular-chart">
                  <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                  <path class="circle" id="ring-claude" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                </svg>
                <span class="percentage" id="pct-claude">--%</span>
              </div>
              <span class="model-name">Claude</span>
              <span class="reset-time" id="reset-claude"></span>
            </div>
            <div class="model-card" data-model="gemini-pro">
              <div class="model-ring">
                <svg viewBox="0 0 36 36" class="circular-chart">
                  <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                  <path class="circle" id="ring-pro" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                </svg>
                <span class="percentage" id="pct-pro">--%</span>
              </div>
              <span class="model-name">Gemini Pro</span>
              <span class="reset-time" id="reset-pro"></span>
            </div>
            <div class="model-card" data-model="gemini-flash">
              <div class="model-ring">
                <svg viewBox="0 0 36 36" class="circular-chart">
                  <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                  <path class="circle" id="ring-flash" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                </svg>
                <span class="percentage" id="pct-flash">--%</span>
              </div>
              <span class="model-name">Gemini Flash</span>
              <span class="reset-time" id="reset-flash"></span>
            </div>
          </div>
        </section>

        <vscode-divider></vscode-divider>

        <!-- Retry Stats Section -->
        <section class="stats-section">
          <div class="section-header">
            <span class="codicon codicon-history"></span>
            <span class="section-title">Retry Statistics</span>
          </div>
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value" id="stat-session">0</span>
              <span class="stat-label">Session</span>
            </div>
            <div class="stat-card">
              <span class="stat-value" id="stat-total">0</span>
              <span class="stat-label">Total</span>
            </div>
          </div>
        </section>

        <vscode-divider></vscode-divider>

        <!-- Status Section -->
        <section class="status-section">
          <div class="status-row">
            <span class="status-label">Auto Retry:</span>
            <span id="auto-retry-status" class="status-badge status-off">OFF</span>
          </div>
          <div class="status-row" id="connection-row" style="display: none;">
            <span class="status-label">CDP Connections:</span>
            <span id="connection-count">0</span>
          </div>
        </section>

        <vscode-divider></vscode-divider>

        <!-- Controls Section -->
        <section class="controls-section">
          <div class="checkbox-row">
            <vscode-checkbox id="chk-auto-start">Auto-start on launch</vscode-checkbox>
          </div>
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

    // Refresh quota button
    document.getElementById('btn-refresh-quota')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'refreshQuota' });
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

export function updateQuotaData(data: QuotaData): void {
  currentQuota = data;

  const badge = document.getElementById('connection-badge');
  if (badge) {
    const dot = badge.querySelector('.dot');
    const text = badge.querySelector('.text');
    if (data.connected) {
      badge.classList.add('connected');
      badge.classList.remove('offline');
      if (dot) dot.className = 'dot connected';
      if (text) text.textContent = data.userInfo?.planName || 'Connected';
    } else {
      badge.classList.remove('connected');
      badge.classList.add('offline');
      if (dot) dot.className = 'dot offline';
      if (text) text.textContent = data.error || 'Offline';
    }
  }

  // Update model cards
  if (data.keyModels) {
    updateModelRing('claude', data.keyModels.claude, data.resetTimes?.claude);
    updateModelRing('pro', data.keyModels.geminiPro, data.resetTimes?.geminiPro);
    updateModelRing('flash', data.keyModels.geminiFlash, data.resetTimes?.geminiFlash);
  }
}

function updateModelRing(modelId: string, percentage: number, resetTime?: string): void {
  const ring = document.getElementById(`ring-${modelId}`);
  const pct = document.getElementById(`pct-${modelId}`);
  const resetEl = document.getElementById(`reset-${modelId}`);

  if (percentage < 0) {
    if (ring) ring.setAttribute('stroke-dasharray', '0, 100');
    if (pct) pct.textContent = '--';
    if (resetEl) resetEl.textContent = '';
    return;
  }

  if (ring) {
    ring.setAttribute('stroke-dasharray', `${percentage}, 100`);
    // Color based on percentage
    if (percentage >= 60) {
      ring.style.stroke = 'var(--color-success)';
    } else if (percentage >= 30) {
      ring.style.stroke = 'var(--color-warning)';
    } else {
      ring.style.stroke = 'var(--color-error)';
    }
  }
  if (pct) {
    pct.textContent = `${percentage}%`;
  }
  // Show reset time if available and not at 100%
  if (resetEl) {
    if (resetTime && percentage < 100) {
      resetEl.textContent = `↻ ${resetTime}`;
    } else {
      resetEl.textContent = '';
    }
  }
}

export function updateRetryStats(data: RetryStatsData): void {
  currentRetryStats = data;

  const sessionEl = document.getElementById('stat-session');
  const totalEl = document.getElementById('stat-total');

  if (sessionEl) sessionEl.textContent = String(data.sessionRetries);
  if (totalEl) totalEl.textContent = String(data.totalRetries);
}
