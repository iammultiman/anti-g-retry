/**
 * QuotaManager - Singleton service managing quota state and polling
 * 
 * Detects Language Server on startup, polls quota data periodically,
 * and broadcasts updates to status bar and webview.
 */

import * as vscode from 'vscode';
import { detectAntigravityServer, ServerInfo, DetectionResult } from './server-detector';
import { fetchQuota, extractKeyModels, extractKeyModelResetTimes, QuotaSnapshot, KeyModelQuota, KeyModelResetTimes } from './quota-service';

export interface QuotaState {
    connected: boolean;
    server?: ServerInfo;
    snapshot?: QuotaSnapshot;
    keyModels?: KeyModelQuota;
    resetTimes?: KeyModelResetTimes;
    lastUpdate?: Date;
    error?: string;
}

type QuotaUpdateCallback = (state: QuotaState) => void;

export class QuotaManager {
    private static instance: QuotaManager;

    private state: QuotaState = { connected: false };
    private pollInterval: NodeJS.Timeout | null = null;
    private callbacks: Set<QuotaUpdateCallback> = new Set();
    private pollIntervalMs: number = 30000; // 30 seconds
    private retryStats = {
        totalRetries: 0,
        sessionRetries: 0,
        lastRetryTime: null as Date | null,
    };

    private constructor() { }

    public static getInstance(): QuotaManager {
        if (!QuotaManager.instance) {
            QuotaManager.instance = new QuotaManager();
        }
        return QuotaManager.instance;
    }

    /**
     * Initialize and start polling
     */
    public async start(): Promise<void> {
        console.log('[QuotaManager] Starting...');
        await this.detectServer();
        this.startPolling();
    }

    /**
     * Stop polling
     */
    public stop(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Subscribe to quota updates
     */
    public onUpdate(callback: QuotaUpdateCallback): vscode.Disposable {
        this.callbacks.add(callback);
        // Immediately send current state
        callback(this.state);
        return { dispose: () => this.callbacks.delete(callback) };
    }

    /**
     * Get current state
     */
    public getState(): QuotaState {
        return { ...this.state };
    }

    /**
     * Get retry statistics
     */
    public getRetryStats() {
        return { ...this.retryStats };
    }

    /**
     * Increment retry count (called by AutoRetryService)
     */
    public incrementRetryCount(): void {
        this.retryStats.totalRetries++;
        this.retryStats.sessionRetries++;
        this.retryStats.lastRetryTime = new Date();
        this.notifyCallbacks();
    }

    /**
     * Reset session retry count
     */
    public resetSessionRetries(): void {
        this.retryStats.sessionRetries = 0;
    }

    /**
     * Force refresh quota now
     */
    public async refresh(): Promise<void> {
        await this.fetchAndUpdateQuota();
    }

    private async detectServer(): Promise<void> {
        const result: DetectionResult = await detectAntigravityServer();

        if (result.success && result.server) {
            this.state = {
                connected: true,
                server: result.server,
                lastUpdate: new Date(),
            };
            console.log(`[QuotaManager] Connected to server on port ${result.server.port}`);
            await this.fetchAndUpdateQuota();
        } else {
            this.state = {
                connected: false,
                error: result.error,
            };
            console.log(`[QuotaManager] Server detection failed: ${result.error}`);
        }

        this.notifyCallbacks();
    }

    private startPolling(): void {
        if (this.pollInterval) return;

        this.pollInterval = setInterval(async () => {
            if (!this.state.connected) {
                // Try to reconnect
                await this.detectServer();
            } else {
                await this.fetchAndUpdateQuota();
            }
        }, this.pollIntervalMs);
    }

    private async fetchAndUpdateQuota(): Promise<void> {
        if (!this.state.server) return;

        const result = await fetchQuota(this.state.server);

        if (result.success && result.snapshot) {
            const keyModels = extractKeyModels(result.snapshot);
            const resetTimes = extractKeyModelResetTimes(result.snapshot);
            this.state = {
                ...this.state,
                snapshot: result.snapshot,
                keyModels,
                resetTimes,
                lastUpdate: new Date(),
                error: undefined,
            };
        } else {
            // Server might have disconnected, try to reconnect next poll
            if (result.error?.includes('Authentication') || result.error?.includes('fetch')) {
                this.state = {
                    ...this.state,
                    connected: false,
                    error: result.error,
                };
            }
        }

        this.notifyCallbacks();
    }

    private notifyCallbacks(): void {
        for (const callback of this.callbacks) {
            try {
                callback(this.state);
            } catch (error) {
                console.error('[QuotaManager] Callback error:', error);
            }
        }
    }
}
