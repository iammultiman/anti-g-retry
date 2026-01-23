/**
 * BatchPromptService - Batch Prompt Automation
 * 
 * Manages automated batch execution of prompts with session management
 * Leverages CDP to interact with Antigravity UI
 */
import { CDPHandler } from './CDPHandler';

export type BatchLogCallback = (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;
export type BatchProgressCallback = (current: number, total: number) => void;
export type BatchStatusCallback = (status: BatchStatus) => void;

export type BatchStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error' | 'stopped';

export interface DOMSelectors {
    promptTextarea: string;
    sendButton: string;
    stopButton: string;
    newSessionButton: string;
    retryButton: string;  // Indicates task was interrupted
}

export interface BatchState {
    prompt: string;
    repeatCount: number;
    currentRun: number;
    status: BatchStatus;
    isRunning: boolean;
    error?: string;
}

export class BatchPromptService {
    private cdpHandler: CDPHandler;
    private state: BatchState;
    private selectors?: DOMSelectors;
    private logCallback?: BatchLogCallback;
    private progressCallback?: BatchProgressCallback;
    private statusCallback?: BatchStatusCallback;
    private monitorTimer?: ReturnType<typeof setInterval>;
    private isPaused: boolean = false;

    constructor(cdpHandler: CDPHandler) {
        this.cdpHandler = cdpHandler;
        this.state = {
            prompt: '',
            repeatCount: 0,
            currentRun: 0,
            status: 'idle',
            isRunning: false
        };
    }

    /**
     * Set log callback for UI updates
     */
    setLogCallback(callback: BatchLogCallback): void {
        this.logCallback = callback;
    }

    /**
     * Set progress callback for UI updates
     */
    setProgressCallback(callback: BatchProgressCallback): void {
        this.progressCallback = callback;
    }

    /**
     * Set status callback for UI updates
     */
    setStatusCallback(callback: BatchStatusCallback): void {
        this.statusCallback = callback;
    }

    /**
     * Log message to callback
     */
    private log(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
        console.log(`[BatchPrompt] ${message}`);
        this.logCallback?.(message, type);
    }

    /**
     * Update status
     */
    private updateStatus(status: BatchStatus): void {
        this.state.status = status;
        this.statusCallback?.(status);
    }

    /**
     * Update progress
     */
    private updateProgress(): void {
        this.progressCallback?.(this.state.currentRun, this.state.repeatCount);
    }

    /**
     * Discover DOM selectors for Antigravity UI
     */
    async discoverSelectors(): Promise<DOMSelectors | null> {
        this.log('Discovering Antigravity DOM structure...', 'info');

        try {
            const connId = this.getFirstConnectionId();
            if (!connId) {
                this.log('No CDP connection available', 'error');
                return null;
            }

            const result = await this.cdpHandler.evaluate(
                connId,
                this.getDiscoveryScript()
            );

            if (result?.result?.value) {
                const parsed = JSON.parse(result.result.value);
                const discovered = parsed.selectors;
                const debug = parsed.debug;

                this.selectors = discovered;
                this.log(`✅ Selectors discovered!`, 'success');
                this.log(`Textarea: ${discovered.promptTextarea}`, 'info');
                this.log(`Send: ${discovered.sendButton}`, 'info');
                this.log(`Stop: ${discovered.stopButton}`, 'info');
                this.log(`New Session: ${discovered.newSessionButton}`, 'info');

                // Log debug info if any selectors are null
                const hasNullSelectors = !discovered.promptTextarea || !discovered.sendButton;
                if (hasNullSelectors && debug) {
                    this.log(`--- DOM Debug Info ---`, 'warning');
                    if (debug.textareas?.length > 0) {
                        this.log(`Found ${debug.textareas.length} textarea(s):`, 'info');
                        for (const ta of debug.textareas.slice(0, 5)) {
                            this.log(`  id="${ta.id}" placeholder="${ta.placeholder}" classes="${ta.classes}"`, 'info');
                        }
                    } else {
                        this.log(`No textareas found in DOM`, 'warning');
                    }
                    if (debug.buttons?.length > 0) {
                        this.log(`Found ${debug.buttons.length} button(s):`, 'info');
                        for (const btn of debug.buttons.slice(0, 10)) {
                            this.log(`  "${btn.text}" id="${btn.id}" aria="${btn.ariaLabel}"`, 'info');
                        }
                    } else {
                        this.log(`No buttons found in DOM`, 'warning');
                    }
                }

                return discovered;
            }

            this.log('Failed to discover selectors', 'error');
            return null;
        } catch (error: any) {
            this.log(`Discovery error: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Get discovery script for DOM scanning
     */
    private getDiscoveryScript(): string {
        return `
(function() {
    const selectors = {
        promptTextarea: null,
        sendButton: null,
        stopButton: null,
        newSessionButton: null,
        retryButton: null
    };

    // Debug info collector
    const debug = {
        textareas: [],
        buttons: []
    };

    // Find prompt textarea
    const textareas = Array.from(document.querySelectorAll('textarea'));
    for (const ta of textareas) {
        const placeholder = ta.placeholder?.toLowerCase() || '';
        const label = ta.getAttribute('aria-label')?.toLowerCase() || '';
        const id = ta.id || '';
        const classes = ta.className || '';
        
        // Collect debug info
        debug.textareas.push({
            id: id,
            classes: classes.substring(0, 100),
            placeholder: (ta.placeholder || '').substring(0, 50),
            ariaLabel: (ta.getAttribute('aria-label') || '').substring(0, 50)
        });
        
        if (placeholder.includes('prompt') || placeholder.includes('message') || placeholder.includes('ask') ||
            label.includes('prompt') || label.includes('input') || label.includes('message') ||
            id.toLowerCase().includes('prompt') || id.toLowerCase().includes('input')) {
            if (id) {
                selectors.promptTextarea = '#' + id;
            } else if (classes) {
                selectors.promptTextarea = 'textarea.' + classes.split(' ')[0];
            } else {
                selectors.promptTextarea = 'textarea[placeholder="' + ta.placeholder + '"]';
            }
            break;
        }
    }
    
    // If no specific match, try first visible textarea
    if (!selectors.promptTextarea && textareas.length > 0) {
        for (const ta of textareas) {
            if (ta.offsetParent !== null) { // is visible
                const id = ta.id;
                const classes = ta.className;
                if (id) {
                    selectors.promptTextarea = '#' + id;
                } else if (classes) {
                    selectors.promptTextarea = 'textarea.' + classes.split(' ')[0];
                }
                break;
            }
        }
    }

    // Find buttons
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || '';
        const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
        const title = btn.getAttribute('title')?.toLowerCase() || '';
        const id = btn.id || '';
        const classes = btn.className || '';
        
        // Collect debug info (first 30 buttons only)
        if (debug.buttons.length < 30) {
            debug.buttons.push({
                id: id,
                classes: classes.substring(0, 80),
                text: text.substring(0, 30),
                ariaLabel: (btn.getAttribute('aria-label') || '').substring(0, 30),
                title: (btn.getAttribute('title') || '').substring(0, 30)
            });
        }
        
        // Match send button (title="Send" tooltip)
        if (!selectors.sendButton) {
            if (text === 'send' || text.includes('send') || label.includes('send') || title.includes('send') || title === 'send' ||
                btn.querySelector('[class*="send"]') || btn.querySelector('[class*="submit"]') ||
                classes.toLowerCase().includes('send') || id.toLowerCase().includes('send')) {
                if (id) {
                    selectors.sendButton = '#' + id;
                } else if (classes && classes.trim()) {
                    selectors.sendButton = 'button.' + classes.split(' ')[0];
                } else {
                    // Fallback: use title selector
                    selectors.sendButton = 'button[title="Send"]';
                }
            }
        }
        
        // Match stop/cancel button (red button during execution)
        if (!selectors.stopButton) {
            if (text === 'stop' || text === 'cancel' || text.includes('stop') || text.includes('cancel') ||
                label.includes('stop') || label.includes('cancel') || 
                title.includes('stop') || title.includes('cancel') ||
                classes.toLowerCase().includes('stop') || classes.toLowerCase().includes('cancel') ||
                id.toLowerCase().includes('stop') || id.toLowerCase().includes('cancel')) {
                if (id) {
                    selectors.stopButton = '#' + id;
                } else if (classes && classes.trim()) {
                    selectors.stopButton = 'button.' + classes.split(' ')[0];
                } else {
                    // Fallback: use aria-label or title selector
                    selectors.stopButton = 'button[aria-label*=\"cancel\" i], button[title*=\"cancel\" i]';
                }
            }
        }
        
        // Match new session button (title="Start a New Conversation" tooltip)
        if (!selectors.newSessionButton) {
            if ((text.includes('new') && (text.includes('chat') || text.includes('session') || text.includes('conversation'))) ||
                (label.includes('new') && (label.includes('chat') || label.includes('session') || label.includes('conversation'))) ||
                (title.includes('new') && title.includes('conversation')) ||
                title.includes('start a new conversation') ||
                classes.toLowerCase().includes('new-session') || classes.toLowerCase().includes('new-chat') ||
                id.toLowerCase().includes('new')) {
                if (id) {
                    selectors.newSessionButton = '#' + id;
                } else if (classes && classes.trim()) {
                    selectors.newSessionButton = 'button.' + classes.split(' ')[0];
                } else {
                    // Fallback: use title selector
                    selectors.newSessionButton = 'button[title*="New Conversation" i]';
                }
            }
        }
        
        // Match retry button (indicates task was interrupted, not completed)
        if (!selectors.retryButton) {
            if (text === 'retry' || text.includes('retry') || 
                label.includes('retry') || title.includes('retry') ||
                classes.toLowerCase().includes('retry') || id.toLowerCase().includes('retry')) {
                if (id) {
                    selectors.retryButton = '#' + id;
                } else if (classes && classes.trim()) {
                    selectors.retryButton = 'button.' + classes.split(' ')[0];
                } else {
                    // Fallback
                    selectors.retryButton = 'button[aria-label*="retry" i], button[title*="retry" i]';
                }
            }
        }
    }

    // Include debug info in output
    return JSON.stringify({ selectors, debug });
})();
`;
    }

    /**
     * Get first available connection ID
     */
    private getFirstConnectionId(): string | null {
        return this.cdpHandler.getFirstConnectionId();
    }

    /**
     * Start batch execution
     */
    async startBatch(prompt: string, repeatCount: number): Promise<boolean> {
        if (this.state.isRunning) {
            this.log('Batch already running', 'warning');
            return false;
        }

        if (!prompt || repeatCount < 1 || repeatCount > 100) {
            this.log('Invalid parameters', 'error');
            return false;
        }

        // Discover selectors if not already done
        if (!this.selectors) {
            const discovered = await this.discoverSelectors();
            if (!discovered) {
                this.log('Cannot start: selectors not discovered', 'error');
                this.updateStatus('error');
                return false;
            }
        }

        this.state = {
            prompt,
            repeatCount,
            currentRun: 0,
            status: 'running',
            isRunning: true
        };

        this.isPaused = false;
        this.updateStatus('running');
        this.updateProgress();
        this.log(`Starting batch: ${repeatCount} runs`, 'success');

        // Start execution loop
        this.executeNextRun();

        return true;
    }

    /**
     * Execute next run in the batch
     */
    private async executeNextRun(): Promise<void> {
        if (this.isPaused) {
            this.log('Execution paused', 'info');
            return;
        }

        if (!this.state.isRunning) {
            return;
        }

        // Check if we're done
        if (this.state.currentRun >= this.state.repeatCount) {
            this.completeBatch();
            return;
        }

        // Increment run counter
        this.state.currentRun++;
        this.updateProgress();
        this.log(`Starting run ${this.state.currentRun}/${this.state.repeatCount}`, 'info');

        try {
            // Step 1: Fill prompt
            const filled = await this.fillPrompt(this.state.prompt);
            if (!filled) {
                this.log('Failed to fill prompt', 'error');
                this.handleError('Failed to fill prompt');
                return;
            }

            // Step 2: Click send
            await this.sleep(500); // Brief delay for UI stability
            const sent = await this.clickSend();
            if (!sent) {
                this.log('Failed to click send', 'error');
                this.handleError('Failed to send prompt');
                return;
            }

            // Step 3: Monitor for completion
            this.log('Waiting for completion...', 'info');
            this.monitorCompletion();

        } catch (error: any) {
            this.log(`Error during execution: ${error.message}`, 'error');
            this.handleError(error.message);
        }
    }

    /**
     * Fill prompt into textarea
     */
    private async fillPrompt(prompt: string): Promise<boolean> {
        if (!this.selectors?.promptTextarea) return false;

        const connId = this.getFirstConnectionId();
        if (!connId) return false;

        try {
            const script = `
(function() {
    const textarea = document.querySelector('${this.selectors.promptTextarea}');
    if (!textarea) return false;
    
    textarea.value = ${JSON.stringify(prompt)};
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
})();
`;
            const result = await this.cdpHandler.evaluate(connId, script);
            return result?.result?.value === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Click send button
     */
    private async clickSend(): Promise<boolean> {
        if (!this.selectors?.sendButton) return false;

        const connId = this.getFirstConnectionId();
        if (!connId) return false;

        try {
            const script = `
(function() {
    const btn = document.querySelector('${this.selectors.sendButton}');
    if (!btn || btn.disabled) return false;
    
    btn.click();
    return true;
})();
`;
            const result = await this.cdpHandler.evaluate(connId, script);
            return result?.result?.value === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Monitor for completion (stop button disappears)
     */
    private monitorCompletion(): void {
        let checkCount = 0;
        const maxChecks = 600; // 10 minutes max (600 * 1s)

        this.monitorTimer = setInterval(async () => {
            checkCount++;

            if (!this.state.isRunning || this.isPaused) {
                this.stopMonitoring();
                return;
            }

            if (checkCount > maxChecks) {
                this.log('Timeout waiting for completion', 'warning');
                this.stopMonitoring();
                this.handleError('Execution timeout');
                return;
            }

            const isRunning = await this.isAgentRunning();

            if (!isRunning) {
                // Check if Retry button is visible (task was interrupted)
                const hasRetryButton = await this.isRetryButtonVisible();

                if (hasRetryButton) {
                    // Task was interrupted, click Retry
                    this.log('Task interrupted, clicking Retry...', 'warning');
                    const retried = await this.clickRetryButton();
                    if (retried) {
                        this.log('Retry clicked, continuing...', 'info');
                        // Continue monitoring, don't stop
                        return;
                    } else {
                        this.log('Failed to click Retry', 'error');
                        this.stopMonitoring();
                        this.handleError('Task interrupted, failed to retry');
                        return;
                    }
                }

                // Agent completed successfully!
                this.stopMonitoring();
                this.log(`Run ${this.state.currentRun} completed!`, 'success');

                // Wait a bit before next run
                await this.sleep(2000);

                // If not last run, create new session
                if (this.state.currentRun < this.state.repeatCount) {
                    const created = await this.createNewSession();
                    if (created) {
                        await this.sleep(1000);
                        this.executeNextRun();
                    } else {
                        this.log('Failed to create new session', 'error');
                        this.handleError('Failed to create new session');
                    }
                } else {
                    this.executeNextRun(); // Will complete the batch
                }
            }
        }, 1000); // Check every second
    }

    /**
     * Check if agent is still running
     */
    private async isAgentRunning(): Promise<boolean> {
        if (!this.selectors?.stopButton) return false;

        const connId = this.getFirstConnectionId();
        if (!connId) return false;

        try {
            const script = `
(function() {
    const btn = document.querySelector('${this.selectors.stopButton}');
    return btn && !btn.disabled && btn.offsetParent !== null;
})();
`;
            const result = await this.cdpHandler.evaluate(connId, script);
            return result?.result?.value === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if Retry button is visible (indicates task was interrupted)
     */
    private async isRetryButtonVisible(): Promise<boolean> {
        const connId = this.getFirstConnectionId();
        if (!connId) return false;

        try {
            const script = `
(function() {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || '';
        const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
        const title = btn.getAttribute('title')?.toLowerCase() || '';
        
        if (text === 'retry' || text.includes('retry') || 
            label.includes('retry') || title.includes('retry')) {
            return btn.offsetParent !== null;
        }
    }
    return false;
})();
`;
            const result = await this.cdpHandler.evaluate(connId, script);
            return result?.result?.value === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Click Retry button when task was interrupted
     */
    private async clickRetryButton(): Promise<boolean> {
        const connId = this.getFirstConnectionId();
        if (!connId) return false;

        try {
            const script = `
(function() {
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
        const text = btn.textContent?.trim().toLowerCase() || '';
        const label = btn.getAttribute('aria-label')?.toLowerCase() || '';
        const title = btn.getAttribute('title')?.toLowerCase() || '';
        
        if (text === 'retry' || text.includes('retry') || 
            label.includes('retry') || title.includes('retry')) {
            if (btn.offsetParent !== null) {
                btn.click();
                return true;
            }
        }
    }
    return false;
})();
`;
            const result = await this.cdpHandler.evaluate(connId, script);
            return result?.result?.value === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Create new session
     */
    private async createNewSession(): Promise<boolean> {
        if (!this.selectors?.newSessionButton) return false;

        const connId = this.getFirstConnectionId();
        if (!connId) return false;

        try {
            const script = `
(function() {
    const btn = document.querySelector('${this.selectors.newSessionButton}');
    if (!btn) return false;
    
    btn.click();
    return true;
})();
`;
            const result = await this.cdpHandler.evaluate(connId, script);
            this.log('New session created', 'info');
            return result?.result?.value === true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Stop monitoring timer
     */
    private stopMonitoring(): void {
        if (this.monitorTimer) {
            clearInterval(this.monitorTimer);
            this.monitorTimer = undefined;
        }
    }

    /**
     * Pause batch execution
     */
    pauseBatch(): void {
        if (!this.state.isRunning) return;

        this.isPaused = true;
        this.updateStatus('paused');
        this.stopMonitoring();
        this.log('Batch paused', 'info');
    }

    /**
     * Resume batch execution
     */
    resumeBatch(): void {
        if (!this.state.isRunning || !this.isPaused) return;

        this.isPaused = false;
        this.updateStatus('running');
        this.log('Batch resumed', 'info');
        this.executeNextRun();
    }

    /**
     * Stop batch execution
     */
    stopBatch(): void {
        this.state.isRunning = false;
        this.isPaused = false;
        this.stopMonitoring();
        this.updateStatus('stopped');
        this.log('Batch stopped', 'warning');
    }

    /**
     * Complete batch execution
     */
    private completeBatch(): void {
        this.state.isRunning = false;
        this.stopMonitoring();
        this.updateStatus('completed');
        this.log(`✅ Batch completed! ${this.state.repeatCount}/${this.state.repeatCount} runs`, 'success');
    }

    /**
     * Handle error during execution
     */
    private handleError(errorMessage: string): void {
        this.state.isRunning = false;
        this.state.error = errorMessage;
        this.stopMonitoring();
        this.updateStatus('error');
    }

    /**
     * Get current batch status
     */
    getBatchStatus(): BatchState {
        return { ...this.state };
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
