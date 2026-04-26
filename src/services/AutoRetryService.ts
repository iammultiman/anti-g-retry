/**
 * AutoRetryService - CDP-based Auto Retry
 * 
 * Uses Chrome DevTools Protocol to auto-click Retry buttons
 * Requires IDE to be launched with: --remote-debugging-port=31905
 */
import * as vscode from 'vscode';
import { CDPHandler, CDPLogCallback, CDPStats } from './CDPHandler';
import { Relauncher } from './Relauncher';

export type AutoRetryLogCallback = (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;

export interface AutoRetryConfig {
    enabled: boolean;
    intervalSeconds: number;
    maxRetries: number;
    cooldownSeconds: number;
}

export class AutoRetryService {
    private isRunning = false;
    private cdpHandler: CDPHandler;
    private relauncher: Relauncher;
    private logCallback?: AutoRetryLogCallback;
    private retryCallback?: () => void;
    private lastKnownClicks: number = 0;
    private pollTimer?: ReturnType<typeof setInterval>;
    private config: AutoRetryConfig;

    constructor() {
        this.config = this.getConfig();
        this.cdpHandler = new CDPHandler();
        this.relauncher = new Relauncher();
    }

    /**
     * Get configuration from VS Code settings
     */
    private getConfig(): AutoRetryConfig {
        const config = vscode.workspace.getConfiguration('agyRetry');
        return {
            enabled: config.get<boolean>('enabled', false),
            intervalSeconds: config.get<number>('intervalSeconds', 3),
            maxRetries: config.get<number>('maxRetries', 50),
            cooldownSeconds: config.get<number>('cooldownSeconds', 5)
        };
    }

    /**
     * Set log callback for UI updates
     */
    public setLogCallback(callback: AutoRetryLogCallback): void {
        this.logCallback = callback;
        this.cdpHandler.setLogCallback(callback as CDPLogCallback);
        this.relauncher.setLogCallback(callback);
    }

    /**
     * Set retry callback (called when a retry button is clicked)
     */
    public setRetryCallback(callback: () => void): void {
        this.retryCallback = callback;
        this.cdpHandler.setRetryCallback(callback);
    }

    /**
     * Log message to callback
     */
    private log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
        console.log(`[AutoRetry] ${message}`);
        this.logCallback?.(message, type);
    }

    /**
     * Check if CDP is available (IDE launched with correct flag)
     */
    public async isCDPAvailable(): Promise<boolean> {
        return await this.cdpHandler.isCDPAvailable();
    }

    /**
     * Get the configured CDP port
     */
    public getCDPPort(): number {
        return this.relauncher.getCDPPort();
    }

    /**
     * Get the CDP flag for launching IDE
     */
    public getCDPFlag(): string {
        return this.relauncher.getCDPFlag();
    }

    /**
     * Check if current process was launched with CDP flag
     */
    public checkCurrentProcessHasFlag(): boolean {
        return this.relauncher.checkCurrentProcessHasFlag();
    }

    /**
     * Start the auto-retry service
     * Note: CDP availability should be checked by caller before calling start()
     */
    public async start(): Promise<boolean> {
        this.log('Starting Auto Retry...', 'info');

        // Start CDP handler
        this.config = this.getConfig();
        const connected = await this.cdpHandler.start({
            pollInterval: this.config.intervalSeconds * 1000,
            bannedCommands: this.getDefaultBannedCommands(),
            cooldownSeconds: this.config.cooldownSeconds
        });

        if (!connected) {
            this.log('Failed to connect to CDP', 'error');
            return false;
        }

        this.isRunning = true;
        this.lastKnownClicks = 0;
        this.log(`✅ Auto Retry started!`, 'success');
        this.log(`Connected to ${this.cdpHandler.getConnectionCount()} page(s)`, 'info');

        // Start polling to maintain connection and check for retry clicks
        this.pollTimer = setInterval(async () => {
            if (!this.isRunning) return;

            // Reconnect/maintain CDP connections
            await this.cdpHandler.start({
                pollInterval: this.config.intervalSeconds * 1000,
                bannedCommands: this.getDefaultBannedCommands(),
                cooldownSeconds: this.config.cooldownSeconds
            });

            // Poll stats to detect new retry clicks
            await this.checkForNewRetries();
        }, 3000);

        return true;
    }

    /**
     * Check for new retry clicks by polling stats
     */
    private async checkForNewRetries(): Promise<void> {
        try {
            const stats = await this.cdpHandler.getStats();
            const currentClicks = stats.clicks;

            if (currentClicks > this.lastKnownClicks) {
                const newClicks = currentClicks - this.lastKnownClicks;
                this.log(`🔄 Detected ${newClicks} new retry click(s)`, 'success');

                // Call the retry callback for each new click
                for (let i = 0; i < newClicks; i++) {
                    this.retryCallback?.();
                }

                this.lastKnownClicks = currentClicks;
            }
        } catch (error) {
            // Ignore errors during stats polling
        }
    }

    /**
     * Stop the auto-retry service
     */
    public async stop(): Promise<void> {
        this.isRunning = false;

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }

        await this.cdpHandler.stop();
        this.log('Auto Retry stopped', 'info');
    }

    /**
     * Setup CDP by modifying shortcuts
     */
    public async setupCDP(): Promise<boolean> {
        const result = await this.relauncher.ensureCDPAndPrompt();
        return result.success;
    }

    /**
     * Get service status
     */
    public getStatus(): { running: boolean; retryCount: number; connectionCount: number } {
        return {
            running: this.isRunning && this.cdpHandler.isRunning(),
            retryCount: 0, // CDP handles this internally
            connectionCount: this.cdpHandler.getConnectionCount()
        };
    }

    /**
     * Get stats from CDP handler
     */
    public async getStats(): Promise<CDPStats> {
        return await this.cdpHandler.getStats();
    }

    /**
     * Reset stats
     */
    public async resetStats(): Promise<CDPStats> {
        return await this.cdpHandler.resetStats();
    }

    /**
     * Default list of dangerous commands to block
     */
    private getDefaultBannedCommands(): string[] {
        return [
            'rm -rf /',
            'rm -rf ~',
            'rm -rf *',
            'format c:',
            'del /f /s /q',
            'rmdir /s /q',
            ':(){:|:&};:',
            'dd if=',
            'mkfs.',
            '> /dev/sda',
            'chmod -R 777 /'
        ];
    }

    /**
     * Check if platform is supported
     */
    public isSupported(): boolean {
        return true; // CDP works on all platforms
    }

    /**
     * Get platform name
     */
    public getPlatformName(): string {
        const platform = process.platform;
        const names: Record<string, string> = {
            darwin: 'macOS',
            win32: 'Windows',
            linux: 'Linux'
        };
        return names[platform] || 'Unknown';
    }

    /**
     * Trigger a manual retry check
     */
    public async triggerRetryCheck(): Promise<boolean> {
        if (!this.isRunning) {
            return false;
        }
        // Force a sync
        await this.cdpHandler.start();
        return true;
    }
}
