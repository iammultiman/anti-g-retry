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
    lastError?: string;
}

export class BatchPromptService {
    private cdpHandler: CDPHandler;
    private state: BatchState;
    private selectors?: DOMSelectors;
    private chatPageConnId?: string;  // Cached CDP connection for chat page
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
     * Reset cached connection and selectors
     * Call when CDP connections change or webview reloads
     */
    public resetConnection(): void {
        this.chatPageConnId = undefined;
        this.selectors = undefined;
        this.log('Connection cache reset', 'info');
    }

    /**
     * Discover DOM selectors for Antigravity UI
     */
    async discoverSelectors(): Promise<DOMSelectors | null> {
        this.log('Discovering Antigravity DOM structure...', 'info');

        try {
            // Use getChatPageConnectionId to find the correct chat page, not just any connection
            const connId = await this.cdpHandler.getChatPageConnectionId();
            if (!connId) {
                this.log('No CDP connection with chat interface found', 'error');
                // Log available connections for debugging
                const allConns = this.cdpHandler.getConnectionCount?.() || 0;
                this.log(`Total CDP connections available: ${allConns}`, 'warning');
                return null;
            }

            // Cache this for later use
            this.chatPageConnId = connId;
            this.log(`Using CDP connection: ${connId.substring(connId.indexOf(':') + 1, connId.indexOf(':') + 9)}...`, 'info');

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
                    this.log(`Iframes found: ${debug.iframeCount || 0}, Docs searched: ${debug.docsSearched || 1}`, 'info');

                    if (debug.textareas?.length > 0) {
                        this.log(`Found ${debug.textareas.length} textarea(s):`, 'info');
                        for (const ta of debug.textareas.slice(0, 5)) {
                            this.log(`  [${ta.inIframe ? 'iframe' : 'main'}] id="${ta.id}" placeholder="${ta.placeholder}"`, 'info');
                        }
                    } else {
                        this.log(`No textareas found`, 'warning');
                    }

                    if (debug.contentEditables?.length > 0) {
                        this.log(`Found ${debug.contentEditables.length} contenteditable(s):`, 'info');
                        for (const ce of debug.contentEditables.slice(0, 5)) {
                            this.log(`  [${ce.inIframe ? 'iframe' : 'main'}] <${ce.tagName}> role="${ce.role}" aria="${ce.ariaLabel}"`, 'info');
                        }
                    } else {
                        this.log(`No contenteditable elements found`, 'warning');
                    }

                    if (debug.buttons?.length > 0) {
                        this.log(`Found ${debug.buttons.length} button(s):`, 'info');
                        for (const btn of debug.buttons.slice(0, 10)) {
                            this.log(`  [${btn.inIframe ? 'iframe' : 'main'}] "${btn.text}" tooltip="${btn.tooltipId || 'none'}"`, 'info');
                        }
                    } else {
                        this.log(`No buttons found`, 'warning');
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
    var selectors = {
        promptTextarea: null,
        sendButton: null,
        stopButton: null,
        newSessionButton: null,
        retryButton: null
    };

    // Debug info collector
    var debug = {
        textareas: [],
        contentEditables: [],
        buttons: [],
        iframeCount: 0,
        docsSearched: 0
    };

    // Helper: Get all accessible documents (main + iframes)
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            debug.iframeCount = iframes.length;
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) {
                        docs.push(iframeDoc);
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }

    var allDocs = getAllDocs();
    debug.docsSearched = allDocs.length;
    // Find prompt textarea or contenteditable in all documents
    for (var docIdx = 0; docIdx < allDocs.length && !selectors.promptTextarea; docIdx++) {
        var doc = allDocs[docIdx];
        var inIframe = docIdx > 0;
        
        // Check textareas
        var textareas = doc.querySelectorAll('textarea');
        for (var i = 0; i < textareas.length; i++) {
            var ta = textareas[i];
            var placeholder = (ta.placeholder || '').toLowerCase();
            var label = (ta.getAttribute('aria-label') || '').toLowerCase();
            var id = ta.id || '';
            var classes = ta.className || '';
            
            // Collect debug info
            debug.textareas.push({
                id: id,
                classes: (classes + '').substring(0, 100),
                placeholder: (ta.placeholder || '').substring(0, 50),
                ariaLabel: (ta.getAttribute('aria-label') || '').substring(0, 50),
                inIframe: inIframe
            });
            
            if (placeholder.indexOf('prompt') >= 0 || placeholder.indexOf('message') >= 0 || placeholder.indexOf('ask') >= 0 ||
                label.indexOf('prompt') >= 0 || label.indexOf('input') >= 0 || label.indexOf('message') >= 0 ||
                id.toLowerCase().indexOf('prompt') >= 0 || id.toLowerCase().indexOf('input') >= 0) {
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
        if (selectors.promptTextarea) break;
        
        // Check contenteditable elements (for Lexical editor)
        var editables = doc.querySelectorAll('[contenteditable="true"]');
        for (var i = 0; i < editables.length; i++) {
            var el = editables[i];
            var role = (el.getAttribute('role') || '').toLowerCase();
            var label = (el.getAttribute('aria-label') || '').toLowerCase();
            var id = el.id || '';
            var classes = el.className || '';
            
            // Collect debug info
            debug.contentEditables.push({
                id: id,
                tagName: el.tagName.toLowerCase(),
                role: role,
                classes: (classes + '').substring(0, 100),
                ariaLabel: label.substring(0, 50),
                inIframe: inIframe
            });
            
            // Look for textbox role (used by Lexical)
            if (role === 'textbox' || label.indexOf('prompt') >= 0 || label.indexOf('message') >= 0 || label.indexOf('input') >= 0) {
                if (id) {
                    selectors.promptTextarea = '#' + id;
                } else if (role === 'textbox') {
                    selectors.promptTextarea = '[contenteditable="true"][role="textbox"]';
                } else {
                    selectors.promptTextarea = '[contenteditable="true"]';
                }
                break;
            }
        }
    }
    
    // Fallback: try first visible textarea or contenteditable
    if (!selectors.promptTextarea) {
        for (var docIdx = 0; docIdx < allDocs.length && !selectors.promptTextarea; docIdx++) {
            var doc = allDocs[docIdx];
            
            var textareas = doc.querySelectorAll('textarea');
            for (var i = 0; i < textareas.length; i++) {
                var ta = textareas[i];
                if (ta.offsetParent !== null) {
                    var id = ta.id;
                    var classes = ta.className;
                    if (id) {
                        selectors.promptTextarea = '#' + id;
                    } else if (classes) {
                        selectors.promptTextarea = 'textarea.' + classes.split(' ')[0];
                    }
                    break;
                }
            }
            if (selectors.promptTextarea) break;
            
            var editables = doc.querySelectorAll('[contenteditable="true"]');
            for (var i = 0; i < editables.length; i++) {
                var el = editables[i];
                if (el.offsetParent !== null) {
                    var role = el.getAttribute('role') || '';
                    if (role === 'textbox') {
                        selectors.promptTextarea = '[contenteditable="true"][role="textbox"]';
                        break;
                    }
                }
            }
        }
    }


    // Find buttons in all documents
    for (var docIdx = 0; docIdx < allDocs.length; docIdx++) {
        var doc = allDocs[docIdx];
        var inIframe = docIdx > 0;
        var buttons = doc.querySelectorAll('button');
        
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var text = (btn.textContent || '').trim().toLowerCase();
            var label = (btn.getAttribute('aria-label') || '').toLowerCase();
            var title = (btn.getAttribute('title') || '').toLowerCase();
            var tooltipId = btn.getAttribute('data-tooltip-id') || '';
            var id = btn.id || '';
            var classes = btn.className || '';
            
            // Collect debug info (first 30 buttons only)
            if (debug.buttons.length < 30) {
                debug.buttons.push({
                    id: id,
                    classes: (classes + '').substring(0, 80),
                    text: text.substring(0, 30),
                    ariaLabel: label.substring(0, 30),
                    title: title.substring(0, 30),
                    tooltipId: tooltipId,
                    inIframe: inIframe
                });
            }
            
            // Match send button (tooltip: input-send-button-send-tooltip)
            if (!selectors.sendButton) {
                if (tooltipId === 'input-send-button-send-tooltip' ||
                    text === 'send' || text.indexOf('send') >= 0 || 
                    label.indexOf('send') >= 0 || title.indexOf('send') >= 0 ||
                    (classes + '').toLowerCase().indexOf('send') >= 0 || 
                    id.toLowerCase().indexOf('send') >= 0) {
                    if (tooltipId) {
                        selectors.sendButton = '[data-tooltip-id="' + tooltipId + '"]';
                    } else if (id) {
                        selectors.sendButton = '#' + id;
                    } else if (classes && (classes + '').trim()) {
                        selectors.sendButton = 'button.' + classes.split(' ')[0];
                    } else {
                        selectors.sendButton = 'button[title="Send"]';
                    }
                }
            }
            
            // Match stop/cancel button (tooltip: stop-button-tooltip)
            if (!selectors.stopButton) {
                if (tooltipId === 'stop-button-tooltip' ||
                    text === 'stop' || text === 'cancel' || 
                    text.indexOf('stop') >= 0 || text.indexOf('cancel') >= 0 ||
                    label.indexOf('stop') >= 0 || label.indexOf('cancel') >= 0 || 
                    title.indexOf('stop') >= 0 || title.indexOf('cancel') >= 0 ||
                    (classes + '').toLowerCase().indexOf('stop') >= 0 || 
                    (classes + '').toLowerCase().indexOf('cancel') >= 0) {
                    if (tooltipId) {
                        selectors.stopButton = '[data-tooltip-id="' + tooltipId + '"]';
                    } else if (id) {
                        selectors.stopButton = '#' + id;
                    } else if (classes && (classes + '').trim()) {
                        selectors.stopButton = 'button.' + classes.split(' ')[0];
                    } else {
                        selectors.stopButton = 'button[aria-label*="cancel" i], button[title*="cancel" i]';
                    }
                }
            }
            
            // Match new session button (tooltip: new-conversation-tooltip)
            if (!selectors.newSessionButton) {
                if (tooltipId === 'new-conversation-tooltip' ||
                    (text.indexOf('new') >= 0 && (text.indexOf('chat') >= 0 || text.indexOf('session') >= 0 || text.indexOf('conversation') >= 0)) ||
                    (label.indexOf('new') >= 0 && (label.indexOf('chat') >= 0 || label.indexOf('session') >= 0 || label.indexOf('conversation') >= 0)) ||
                    (title.indexOf('new') >= 0 && title.indexOf('conversation') >= 0) ||
                    title.indexOf('start a new conversation') >= 0) {
                    if (tooltipId) {
                        selectors.newSessionButton = '[data-tooltip-id="' + tooltipId + '"]';
                    } else if (id) {
                        selectors.newSessionButton = '#' + id;
                    } else if (classes && (classes + '').trim()) {
                        selectors.newSessionButton = 'button.' + classes.split(' ')[0];
                    } else {
                        selectors.newSessionButton = 'button[title*="New Conversation" i]';
                    }
                }
            }
            
            // Match retry button
            if (!selectors.retryButton) {
                if (text === 'retry' || text.indexOf('retry') >= 0 || 
                    label.indexOf('retry') >= 0 || title.indexOf('retry') >= 0) {
                    if (id) {
                        selectors.retryButton = '#' + id;
                    } else if (classes && (classes + '').trim()) {
                        selectors.retryButton = 'button.' + classes.split(' ')[0];
                    } else {
                        selectors.retryButton = 'button[aria-label*="retry" i], button[title*="retry" i]';
                    }
                }
            }
        }
    }

    // Include debug info in output
    return JSON.stringify({ selectors: selectors, debug: debug });
})();
`;
    }

    /**
     * Get the connection ID for the chat page (prefer cached, fallback to first)
     * Validates cached connection is still active
     */
    private getConnectionId(): string | null {
        // Prefer the cached chat page connection, but verify it's still valid
        if (this.chatPageConnId) {
            // Check if we still have connections
            if (this.cdpHandler.getConnectionCount() > 0) {
                return this.chatPageConnId;
            }
            // Connection is no longer valid, clear cache
            this.chatPageConnId = undefined;
            this.log('Cached connection invalidated', 'warning');
        }
        // Fallback to first available
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

        // ALWAYS force fresh discovery at batch start to avoid stale CDP connections
        this.selectors = undefined;
        this.chatPageConnId = undefined;
        this.log('Discovering Antigravity DOM structure...', 'info');

        const discovered = await this.discoverSelectors();
        if (!discovered) {
            this.log('Cannot start: selectors not discovered', 'error');
            this.updateStatus('error');
            return false;
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
     * Fill prompt into textarea or contenteditable
     * Uses CDP Input.insertText for Lexical/React compatibility
     * Enhanced with fill-then-verify retry loop for resilience (v0.4.5)
     */
    private async fillPrompt(prompt: string): Promise<boolean> {
        if (!this.selectors?.promptTextarea) {
            this.log('No textarea selector found', 'error');
            return false;
        }

        const connId = this.getConnectionId();
        if (!connId) {
            this.log('No CDP connection available', 'error');
            return false;
        }

        // Fill-then-verify retry loop: up to 3 fill attempts
        const maxFillAttempts = 3;
        for (let fillAttempt = 1; fillAttempt <= maxFillAttempts; fillAttempt++) {
            try {
                // Step 1: Focus and clear the element
                const focusScript = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }

    var el = null;
    var docs = getAllDocs();
    var foundInDoc = -1;
    
    for (var i = 0; i < docs.length; i++) {
        el = docs[i].querySelector('${this.selectors.promptTextarea}');
        if (el) {
            foundInDoc = i;
            break;
        }
    }

    if (!el) {
        var allContentEditable = [];
        for (var i = 0; i < docs.length; i++) {
            var ces = docs[i].querySelectorAll('[contenteditable="true"]');
            for (var j = 0; j < ces.length; j++) {
                allContentEditable.push({
                    doc: i,
                    role: ces[j].getAttribute('role'),
                    tag: ces[j].tagName,
                    visible: ces[j].offsetParent !== null
                });
            }
        }
        return { 
            success: false, 
            error: 'Element not found', 
            docsSearched: docs.length,
            selector: '${this.selectors.promptTextarea}',
            allContentEditable: allContentEditable
        };
    }

    var rect = el.getBoundingClientRect();
    var isVisible = rect.width > 0 && rect.height > 0;
    if (!isVisible) {
        return { success: false, error: 'Element found but not visible', foundInDoc: foundInDoc };
    }

    el.focus();
    
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
        var doc = el.ownerDocument;
        var win = doc.defaultView || window;
        var selection = win.getSelection();
        if (selection) {
            var range = doc.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
            doc.execCommand('delete', false, null);
        }
        if (el.textContent) el.textContent = '';
    } else {
        el.value = '';
    }

    return { success: true, foundInDoc: foundInDoc, isContentEditable: el.getAttribute('contenteditable') === 'true' };
})();
`;
                const focusResult = await this.cdpHandler.evaluate(connId, focusScript);
                const focusData = focusResult?.result?.value;

                if (!focusData?.success) {
                    if (fillAttempt < maxFillAttempts) {
                        this.log(`Focus failed (attempt ${fillAttempt}/${maxFillAttempts}): ${focusData?.error || 'unknown'}`, 'warning');
                        // Re-discover selectors if element not found
                        if (focusData?.error === 'Element not found') {
                            this.log('Re-discovering selectors...', 'info');
                            await this.discoverSelectors();
                        }
                        await this.sleep(800);
                        continue;
                    }
                    this.log(`Focus failed: ${focusData?.error || 'unknown'}`, 'error');
                    if (focusData?.allContentEditable) {
                        this.log(`Found ${focusData.allContentEditable.length} contenteditable(s)`, 'warning');
                    }
                    return false;
                }

                if (fillAttempt === 1) {
                    this.log(`Input found in doc ${focusData.foundInDoc}, contentEditable=${focusData.isContentEditable}`, 'info');
                }

                // Step 2: Use CDP Input.insertText to type the text
                const inserted = await this.cdpHandler.insertText(connId, prompt);

                if (!inserted) {
                    if (fillAttempt < maxFillAttempts) {
                        this.log(`CDP insertText failed (attempt ${fillAttempt}/${maxFillAttempts})`, 'warning');
                        await this.sleep(500);
                        continue;
                    }
                    this.log('CDP insertText returned false', 'error');
                    return false;
                }

                // Step 3: Send-First Verification (v0.4.6)
                // Primary signal: If Send button is clickable, text is ready
                // This bypasses unreliable textContent checks for Lexical editors
                await this.sleep(400); // Brief wait for React state sync

                const sendCheckScript = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }

    var docs = getAllDocs();
    var sendBtn = null;
    
    // Find Send button
    for (var i = 0; i < docs.length; i++) {
        sendBtn = docs[i].querySelector('[data-tooltip-id="input-send-button-send-tooltip"]');
        if (!sendBtn) {
            sendBtn = docs[i].querySelector('button[aria-label*="send" i]');
        }
        if (sendBtn) break;
    }
    
    if (!sendBtn) {
        return { sendClickable: false, reason: 'not-found' };
    }
    
    var rect = sendBtn.getBoundingClientRect();
    var style = window.getComputedStyle(sendBtn);
    var isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    var isDisabled = sendBtn.disabled || 
                     sendBtn.getAttribute('disabled') !== null ||
                     sendBtn.getAttribute('aria-disabled') === 'true' ||
                     style.pointerEvents === 'none' ||
                     style.opacity === '0';
    
    return { 
        sendClickable: isVisible && !isDisabled, 
        isVisible: isVisible, 
        isDisabled: isDisabled 
    };
})();
`;
                const sendCheckResult = await this.cdpHandler.evaluate(connId, sendCheckScript);
                const sendData = sendCheckResult?.result?.value;

                if (sendData?.sendClickable) {
                    this.log('Text ready (Send button clickable)', 'success');
                    return true;
                }

                // Send button not clickable yet - retry with increasing delays
                const maxSendRetries = 3;
                for (let sendRetry = 1; sendRetry <= maxSendRetries; sendRetry++) {
                    await this.sleep(300 * sendRetry); // 300ms, 600ms, 900ms

                    const retryResult = await this.cdpHandler.evaluate(connId, sendCheckScript);
                    const retryData = retryResult?.result?.value;

                    if (retryData?.sendClickable) {
                        this.log('Text ready (Send button clickable)', 'success');
                        return true;
                    }
                }

                // v0.4.7: Check if task has already started running
                // This happens when the agent reads and processes the prompt immediately
                // after text insertion - the Send button becomes hidden/Stop button appears
                const runningCheck = await this.checkAgentState();
                if (runningCheck.hasStopButton) {
                    this.log('Task already started (Stop button visible)', 'success');
                    return true;
                }
                if (!runningCheck.hasSendButtonVisible && !runningCheck.hasRetryButton) {
                    // Send button disappeared but no Retry button = agent is processing
                    this.log('Task already started (Send button hidden)', 'success');
                    return true;
                }

                // Fallback: check textContent as diagnostic (not blocking)
                const textCheckScript = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }

    var el = null;
    var docs = getAllDocs();
    for (var i = 0; i < docs.length; i++) {
        el = docs[i].querySelector('${this.selectors?.promptTextarea}');
        if (el) break;
    }
    
    if (!el) return { hasText: false, error: 'element-gone' };
    
    var content = el.textContent || el.innerText || el.value || '';
    return { hasText: content.length > 0, contentLength: content.length };
})();
`;
                const textResult = await this.cdpHandler.evaluate(connId, textCheckScript);
                const textData = textResult?.result?.value;

                // Handle element-gone: re-discover and retry fill
                if (textData?.error === 'element-gone') {
                    if (fillAttempt < maxFillAttempts) {
                        this.log('Input element disappeared - re-discovering selectors...', 'warning');
                        await this.discoverSelectors();
                    }
                    continue; // Retry fill
                }

                // If textContent exists but Send still disabled, proceed anyway
                // Lexical internal state may be correct even if DOM doesn't reflect it
                if (textData?.hasText) {
                    this.log(`Text inserted (${textData.contentLength} chars), Send not ready yet`, 'warning');
                    return true; // Proceed to clickSend which has its own retry
                }

                // Neither Send clickable nor text visible - retry fill
                if (fillAttempt < maxFillAttempts) {
                    this.log(`Fill verification inconclusive, retrying (${fillAttempt}/${maxFillAttempts})...`, 'warning');
                    await this.sleep(500);
                    continue;
                }

                this.log('Fill verification failed after all attempts', 'error');
                return false;

            } catch (error: any) {
                if (fillAttempt < maxFillAttempts) {
                    this.log(`fillPrompt error (attempt ${fillAttempt}/${maxFillAttempts}): ${error.message}`, 'warning');
                    await this.sleep(500);
                    continue;
                }
                this.log(`fillPrompt error: ${error.message}`, 'error');
                return false;
            }
        }

        return false;
    }

    /**
     * Click send button with retry mechanism
     * Handles React state update delays after text insertion
     */
    private async clickSend(): Promise<boolean> {
        if (!this.selectors?.sendButton) {
            this.log('No send button selector', 'error');
            return false;
        }

        const connId = this.getConnectionId();
        if (!connId) {
            this.log('No CDP connection for send', 'error');
            return false;
        }

        // Retry up to 5 times with increasing delays to handle React state updates
        const maxRetries = 5;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const script = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }
    
    var btn = null;
    var docs = getAllDocs();
    
    // Try primary selector first
    for (var i = 0; i < docs.length; i++) {
        btn = docs[i].querySelector('${this.selectors?.sendButton}');
        if (btn) break;
    }
    
    // Fallback: try additional send button selectors
    if (!btn) {
        var fallbackSelectors = [
            '[data-tooltip-id="input-send-button-send-tooltip"]',
            'button[aria-label*="send" i]',
            'button[title*="send" i]',
            '[class*="send-button"]',
            '[class*="sendButton"]'
        ];
        for (var i = 0; i < docs.length && !btn; i++) {
            for (var s = 0; s < fallbackSelectors.length && !btn; s++) {
                try {
                    btn = docs[i].querySelector(fallbackSelectors[s]);
                } catch (e) {}
            }
        }
    }
    
    if (!btn) {
        return { success: false, reason: 'not-found', docs: docs.length };
    }
    
    // Check visibility
    var rect = btn.getBoundingClientRect();
    var style = window.getComputedStyle(btn);
    var isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    if (!isVisible) {
        return { success: false, reason: 'not-visible' };
    }
    
    // Check disabled state (multiple ways to detect)
    var isDisabled = btn.disabled || 
                     btn.getAttribute('disabled') !== null ||
                     btn.getAttribute('aria-disabled') === 'true' ||
                     style.pointerEvents === 'none' ||
                     style.opacity === '0';
    if (isDisabled) {
        return { success: false, reason: 'disabled' };
    }
    
    // Click the button
    btn.click();
    return { success: true };
})();
`;
                const result = await this.cdpHandler.evaluate(connId, script);
                const data = result?.result?.value;

                if (data?.success === true) {
                    return true;
                }

                // Log the failure reason for debugging
                const reason = data?.reason || 'unknown';

                if (reason === 'disabled' && attempt < maxRetries) {
                    // Button is disabled, wait for React to update state and retry
                    await this.sleep(300 * attempt); // Increasing delay: 300, 600, 900, 1200ms
                    continue;
                }

                if (reason === 'not-found') {
                    this.log(`Send button not found (searched ${data?.docs || 0} docs)`, 'warning');
                } else if (reason === 'not-visible') {
                    this.log('Send button not visible', 'warning');
                } else if (reason === 'disabled') {
                    this.log('Send button still disabled after retries', 'warning');
                }

                if (attempt === maxRetries) {
                    return false;
                }

                await this.sleep(200);
            } catch (error) {
                if (attempt === maxRetries) {
                    return false;
                }
                await this.sleep(200);
            }
        }

        return false;
    }

    /**
     * Monitor for completion (stop button disappears)
     */
    private monitorCompletion(): void {
        let checkCount = 0;
        const maxChecks = 18000; // 5 hours max (18000 * 1s)

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
     * Check if agent is still running (task not complete)
     * Uses Send button visibility as primary indicator with TRIPLE-CHECK verification
     * Balanced approach: not too strict, not too loose
     */
    private async isAgentRunning(): Promise<boolean> {
        // Check 1: Initial state
        const check1 = await this.checkAgentState();

        // If retry button visible, let auto-retry handle
        if (check1.hasRetryButton) {
            return true;
        }

        // If Stop button is visible, agent is definitely running
        if (check1.hasStopButton) {
            return true;
        }

        // If Send button NOT visible, agent is running
        if (!check1.hasSendButtonVisible) {
            return true;
        }

        // Send button appeared - verify with 2 more checks (1s intervals)
        // This catches brief UI transitions but isn't overly strict
        await this.sleep(1000);
        const check2 = await this.checkAgentState();

        if (check2.hasRetryButton || check2.hasStopButton || !check2.hasSendButtonVisible) {
            return true; // Still running or interrupted
        }

        // Final check after another 1s
        await this.sleep(1000);
        const check3 = await this.checkAgentState();

        if (check3.hasRetryButton || check3.hasStopButton || !check3.hasSendButtonVisible) {
            return true; // Still running or interrupted
        }

        // All 3 checks (over ~2s) confirm Send button visible, no Stop button
        // This is a stable COMPLETE state
        this.log(`Completion verified after 3 checks`, 'info');
        return false;
    }

    /**
     * Check current agent state (send/stop/retry buttons)
     * Focused on button visibility - removed broad text pattern matching
     */
    private async checkAgentState(): Promise<{ hasSendButtonVisible: boolean; hasRetryButton: boolean; hasStopButton: boolean; debug?: string }> {
        const connId = this.getConnectionId();
        if (!connId) return { hasSendButtonVisible: false, hasRetryButton: false, hasStopButton: false, debug: 'no connection' };

        try {
            const script = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }

    var docs = getAllDocs();
    var hasSendButtonVisible = false;
    var hasRetryButton = false;
    var hasStopButton = false;
    var debugInfo = 'docs:' + docs.length;
    
    for (var d = 0; d < docs.length; d++) {
        var doc = docs[d];
        
        // CHECK 1: Stop/Cancel button (primary running indicator)
        var stopBtn = doc.querySelector('[data-tooltip-id="stop-button-tooltip"]');
        if (stopBtn) {
            var stopRect = stopBtn.getBoundingClientRect();
            var stopStyle = window.getComputedStyle(stopBtn);
            if (stopRect.width > 0 && stopRect.height > 0 && 
                stopStyle.display !== 'none' && stopStyle.visibility !== 'hidden') {
                hasStopButton = true;
                debugInfo += ',stop';
            }
        }
        
        // CHECK 2: Send button visibility (primary completion indicator)
        var sendBtn = doc.querySelector('[data-tooltip-id="input-send-button-send-tooltip"]');
        if (sendBtn) {
            var rect = sendBtn.getBoundingClientRect();
            var style = window.getComputedStyle(sendBtn);
            var isVisible = rect.width > 0 && rect.height > 0 && 
                            style.display !== 'none' && 
                            style.visibility !== 'hidden' &&
                            style.opacity !== '0';
            if (isVisible) {
                hasSendButtonVisible = true;
                debugInfo += ',send';
            }
        }
        
        // CHECK 3: Retry button (interruption indicator)
        var allButtons = doc.querySelectorAll('button');
        for (var i = 0; i < allButtons.length; i++) {
            var btn = allButtons[i];
            if (btn.offsetParent === null) continue;
            var text = (btn.textContent || '').trim().toLowerCase();
            var ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (text === 'retry' || text.indexOf('retry') >= 0 || ariaLabel.indexOf('retry') >= 0) {
                hasRetryButton = true;
                debugInfo += ',retry';
                break;
            }
        }
    }
    
    return { 
        hasSendButtonVisible: hasSendButtonVisible, 
        hasRetryButton: hasRetryButton, 
        hasStopButton: hasStopButton,
        debug: debugInfo 
    };
})();
`;
            const result = await this.cdpHandler.evaluate(connId, script);
            const data = result?.result?.value;

            if (data && typeof data === 'object') {
                return {
                    hasSendButtonVisible: data.hasSendButtonVisible === true,
                    hasRetryButton: data.hasRetryButton === true,
                    hasStopButton: data.hasStopButton === true,
                    debug: data.debug
                };
            }
            return { hasSendButtonVisible: false, hasRetryButton: false, hasStopButton: false, debug: 'no data' };
        } catch (error) {
            return { hasSendButtonVisible: false, hasRetryButton: false, hasStopButton: false, debug: 'error: ' + error };
        }
    }

    /**
     * Check if Retry button is visible (indicates task was interrupted)
     */
    private async isRetryButtonVisible(): Promise<boolean> {
        const connId = this.getConnectionId();
        if (!connId) return false;

        try {
            const script = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }
    
    var docs = getAllDocs();
    for (var d = 0; d < docs.length; d++) {
        var buttons = docs[d].querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var text = (btn.textContent || '').trim().toLowerCase();
            var label = (btn.getAttribute('aria-label') || '').toLowerCase();
            var title = (btn.getAttribute('title') || '').toLowerCase();
            
            if (text === 'retry' || text.indexOf('retry') >= 0 || 
                label.indexOf('retry') >= 0 || title.indexOf('retry') >= 0) {
                return btn.offsetParent !== null;
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
     * Click Retry button when task was interrupted
     */
    private async clickRetryButton(): Promise<boolean> {
        const connId = this.getConnectionId();
        if (!connId) return false;

        try {
            const script = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }
    
    var docs = getAllDocs();
    for (var d = 0; d < docs.length; d++) {
        var buttons = docs[d].querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var text = (btn.textContent || '').trim().toLowerCase();
            var label = (btn.getAttribute('aria-label') || '').toLowerCase();
            var title = (btn.getAttribute('title') || '').toLowerCase();
            
            if (text === 'retry' || text.indexOf('retry') >= 0 || 
                label.indexOf('retry') >= 0 || title.indexOf('retry') >= 0) {
                if (btn.offsetParent !== null) {
                    btn.click();
                    return true;
                }
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
     * Create new session with multiple fallback strategies
     * Enhanced with post-click stabilization to prevent DOM race conditions
     */
    private async createNewSession(): Promise<boolean> {
        const connId = this.getConnectionId();
        if (!connId) {
            this.log('No CDP connection for new session', 'error');
            return false;
        }

        try {
            // Strategy 1 & 2: Search for new session button with flexible matching
            const searchScript = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }

    var docs = getAllDocs();
    
    // Try by tooltip ID first (most reliable)
    for (var d = 0; d < docs.length; d++) {
        var btn = docs[d].querySelector('[data-tooltip-id="new-conversation-tooltip"]');
        if (btn) {
            btn.click();
            return { success: true, method: 'tooltip' };
        }
    }
    
    // Try by title attribute (exact and partial matches)
    // Support multi-language: "Start a New Conversation", "开始新对话", etc.
    var selectors = [
        'button[title*="Start" i][title*="New" i][title*="Conversation" i]',
        'button[title*="New" i][title*="Conversation" i]',
        'button[title*="New" i][title*="Chat" i]',
        '[title*="Start" i][title*="New" i][title*="Conversation" i]',
        '[title*="New" i][title*="Conversation" i]',
        'button[aria-label*="New" i][aria-label*="Chat" i]',
        'button[aria-label*="New" i][aria-label*="Conversation" i]',
        '[class*="new-conversation"]',
        '[class*="new-chat"]',
        '[class*="newConversation"]',
        '[class*="newChat"]'
    ];
    
    for (var d = 0; d < docs.length; d++) {
        for (var s = 0; s < selectors.length; s++) {
            try {
                var btn = docs[d].querySelector(selectors[s]);
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                    return { success: true, method: 'css-selector', selector: selectors[s] };
                }
            } catch (e) {}
        }
    }
    
    // Try by button text/title content - also look for "+" buttons in title area
    for (var d = 0; d < docs.length; d++) {
        var buttons = docs[d].querySelectorAll('button');
        for (var i = 0; i < buttons.length; i++) {
            var text = (buttons[i].textContent || '').trim();
            var title = (buttons[i].getAttribute('title') || '').toLowerCase();
            var ariaLabel = (buttons[i].getAttribute('aria-label') || '').toLowerCase();
            
            // Check for "+" button which is common for new conversation
            if (text === '+' || text === '＋') {
                // Verify it's likely the new conversation button (check title/aria)
                if (title.indexOf('new') >= 0 || title.indexOf('conversation') >= 0 ||
                    ariaLabel.indexOf('new') >= 0 || ariaLabel.indexOf('conversation') >= 0 ||
                    title.indexOf('start') >= 0) {
                    if (buttons[i].offsetParent !== null) {
                        buttons[i].click();
                        return { success: true, method: 'plus-button' };
                    }
                }
            }
            
            // Check text content
            var textLower = text.toLowerCase();
            if ((textLower.indexOf('new') >= 0 && (textLower.indexOf('chat') >= 0 || textLower.indexOf('conversation') >= 0)) ||
                (title.indexOf('new') >= 0 && title.indexOf('conversation') >= 0) ||
                (title.indexOf('start') >= 0 && title.indexOf('new') >= 0)) {
                if (buttons[i].offsetParent !== null) {
                    buttons[i].click();
                    return { success: true, method: 'text-match' };
                }
            }
        }
    }
    
    return { success: false, searched: docs.length };
})();
`;
            const searchResult = await this.cdpHandler.evaluate(connId, searchScript);
            if (!searchResult?.result?.value?.success) {
                const searched = searchResult?.result?.value?.searched || 0;
                this.log(`New session button not found (searched ${searched} docs)`, 'error');
                return false;
            }

            this.log(`New session clicked via ${searchResult.result.value.method}`, 'info');

            // POST-CLICK STABILIZATION: Extended wait for DOM to settle after new session click (v0.4.5)
            // This prevents race conditions where we try to fill prompt before UI is ready
            await this.sleep(3000);

            // Verify chat input is ready and empty (with extended retry - v0.4.5)
            const maxRetries = 5; // Extended from 3 for slower UI mounts
            for (let retry = 0; retry < maxRetries; retry++) {
                const verifyScript = `
(function() {
    function getAllDocs() {
        var docs = [document];
        try {
            var iframes = document.querySelectorAll('iframe');
            for (var i = 0; i < iframes.length; i++) {
                try {
                    var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                    if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
                } catch (e) {}
            }
        } catch (e) {}
        return docs;
    }

    var docs = getAllDocs();
    for (var d = 0; d < docs.length; d++) {
        var input = docs[d].querySelector('[contenteditable="true"][role="textbox"]');
        if (input) {
            var rect = input.getBoundingClientRect();
            var style = window.getComputedStyle(input);
            var isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none';
            var isEmpty = !input.textContent || input.textContent.trim() === '';
            return { ready: isVisible, empty: isEmpty };
        }
    }
    return { ready: false, empty: false };
})();
`;
                const verifyResult = await this.cdpHandler.evaluate(connId, verifyScript);
                const verifyData = verifyResult?.result?.value;

                if (verifyData?.ready && verifyData?.empty) {
                    this.log('New session ready', 'success');
                    return true;
                }

                // Input not ready yet, wait and retry
                if (retry < maxRetries - 1) {
                    await this.sleep(1500); // Extended from 1000ms for slower mounts
                }
            }

            // Input verification failed but button was clicked - proceed anyway
            this.log('New session created (input verification skipped)', 'warning');
            return true;
        } catch (error: any) {
            this.log(`Create new session error: ${error.message}`, 'error');
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
     * Get last error message for copy functionality
     */
    getLastError(): string | undefined {
        return this.state.lastError;
    }

    /**
     * Shared helper script for iframe-aware DOM queries
     * This is injected into all scripts to avoid duplication
     */
    private getAllDocsScript(): string {
        return `
function getAllDocs() {
    var docs = [document];
    try {
        var iframes = document.querySelectorAll('iframe');
        for (var i = 0; i < iframes.length; i++) {
            try {
                var iframeDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                if (iframeDoc && iframeDoc.body) docs.push(iframeDoc);
            } catch (e) {}
        }
    } catch (e) {}
    return docs;
}
function findElement(selector) {
    var docs = getAllDocs();
    for (var i = 0; i < docs.length; i++) {
        var el = docs[i].querySelector(selector);
        if (el) return el;
    }
    return null;
}
`;
    }

    /**
     * Get DOM debug info for troubleshooting
     */
    async getDOMDebugInfo(): Promise<string> {
        const connId = this.getConnectionId();
        if (!connId) {
            return 'No CDP connection available';
        }

        try {
            const script = `
(function() {
    ${this.getAllDocsScript()}
    
    var info = { 
        url: window.location.href, 
        timestamp: new Date().toISOString(),
        iframeCount: document.querySelectorAll('iframe').length,
        accessibleIframes: getAllDocs().length - 1,
        textareas: [],
        buttons: [],
        contentEditables: []
    };
    
    var docs = getAllDocs();
    for (var d = 0; d < docs.length; d++) {
        var doc = docs[d];
        
        // Collect textareas
        var textareas = doc.querySelectorAll('textarea');
        for (var i = 0; i < textareas.length; i++) {
            var ta = textareas[i];
            info.textareas.push({
                id: ta.id || '',
                placeholder: ta.placeholder || '',
                visible: ta.offsetParent !== null
            });
        }
        
        // Collect buttons
        var buttons = doc.querySelectorAll('button, [role="button"]');
        for (var i = 0; i < Math.min(buttons.length, 30); i++) {
            var btn = buttons[i];
            info.buttons.push({
                text: (btn.textContent || '').trim().substring(0, 40),
                title: btn.getAttribute('title') || '',
                tooltipId: btn.getAttribute('data-tooltip-id') || '',
                visible: btn.offsetParent !== null
            });
        }

        // Collect contentEditables
        var editables = doc.querySelectorAll('[contenteditable="true"]');
        for (var i = 0; i < editables.length; i++) {
            var ce = editables[i];
            info.contentEditables.push({
                role: ce.getAttribute('role') || '',
                tag: ce.tagName,
                visible: ce.offsetParent !== null
            });
        }
    }
    
    return JSON.stringify(info);
})();
`;
            const result = await this.cdpHandler.evaluate(connId, script);
            const rawData = result?.result?.value;
            if (!rawData) return 'Failed to retrieve DOM info';

            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;

            const lines: string[] = [];
            lines.push('=== DOM Debug Info ===');
            lines.push('URL: ' + data.url);
            lines.push('Iframes: ' + data.iframeCount + ' total, ' + data.accessibleIframes + ' accessible');
            lines.push('');
            lines.push('--- TEXTAREAS (' + data.textareas.length + ') ---');
            for (const ta of data.textareas) {
                lines.push('  [' + (ta.visible ? 'visible' : 'hidden') + '] id="' + ta.id + '" placeholder="' + ta.placeholder + '"');
            }
            lines.push('');
            lines.push('--- CONTENTEDITABLES (' + data.contentEditables.length + ') ---');
            for (const ce of data.contentEditables) {
                lines.push('  [' + (ce.visible ? 'visible' : 'hidden') + '] role="' + ce.role + '" tag=' + ce.tag);
            }
            lines.push('');
            lines.push('--- BUTTONS (first 30) ---');
            for (const btn of data.buttons) {
                lines.push('  [' + (btn.visible ? 'visible' : 'hidden') + '] "' + btn.text + '" tooltip="' + btn.tooltipId + '"');
            }

            return lines.join('\n');
        } catch (error: any) {
            return 'Error: ' + error.message;
        }
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
