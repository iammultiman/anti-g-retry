/**
 * Antigravity Language Server Detection
 * 
 * Detects running Antigravity Language Server processes and extracts
 * connection parameters (port, CSRF token) for API communication.
 * 
 * Ported from agy-top for VS Code extension context
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ServerInfo {
    pid: number;
    port: number;
    csrfToken: string;
    workspaceId?: string;
}

export interface DetectionResult {
    success: boolean;
    server?: ServerInfo;
    error?: string;
    tip?: string;
}

/**
 * Detect Antigravity Language Server process
 */
export async function detectAntigravityServer(): Promise<DetectionResult> {
    const platform = process.platform;

    try {
        if (platform === 'win32') {
            return await detectWindows();
        } else {
            return await detectUnix();
        }
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Detection failed',
            tip: getTroubleshootingTip(platform),
        };
    }
}

interface ProcessCandidate {
    pid: number;
    extensionPort: number;
    csrfToken: string;
    workspaceId?: string;
}

/**
 * Unix (macOS/Linux) detection
 */
async function detectUnix(): Promise<DetectionResult> {
    try {
        const { stdout } = await execAsync(
            `ps -A -ww -o pid,ppid,args | grep language_server | grep -v grep`,
            { timeout: 5000 }
        );

        const candidates = parseUnixOutput(stdout);

        if (candidates.length === 0) {
            return {
                success: false,
                error: 'No Antigravity Language Server found',
                tip: 'Make sure Antigravity IDE (VS Code/Cursor with Antigravity) is running',
            };
        }

        // For each candidate, find WORKING port by testing the API
        for (const candidate of candidates) {
            const ports = await getAllListeningPorts(candidate.pid);

            for (const port of ports) {
                const isWorking = await testPort(port, candidate.csrfToken);
                if (isWorking) {
                    return {
                        success: true,
                        server: {
                            pid: candidate.pid,
                            port,
                            csrfToken: candidate.csrfToken,
                            workspaceId: candidate.workspaceId,
                        },
                    };
                }
            }
        }

        return {
            success: false,
            error: 'Language Server found but no port responds to API',
            tip: 'The server may still be starting up. Try again in a few seconds.',
        };
    } catch (error) {
        const err = error as NodeJS.ErrnoException & { killed?: boolean };
        if (err.killed || err.message?.includes('Command failed')) {
            return {
                success: false,
                error: 'No Antigravity Language Server process found',
                tip: 'Start VS Code/Cursor with Antigravity extension active',
            };
        }
        throw error;
    }
}

function parseUnixOutput(stdout: string): ProcessCandidate[] {
    const lines = stdout.trim().split('\n');
    const results: ProcessCandidate[] = [];

    for (const line of lines) {
        if (!line.trim()) continue;

        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (!match) continue;

        const pid = parseInt(match[1], 10);
        const cmd = match[3];

        if (!cmd.includes('--extension_server_port')) continue;
        if (!cmd.includes('--app_data_dir') || !/app_data_dir\s+["']?antigravity/i.test(cmd)) continue;

        const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
        const tokenMatch = cmd.match(/--csrf_token[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);
        const wsMatch = cmd.match(/--workspace_id[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);

        if (tokenMatch) {
            results.push({
                pid,
                extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
                csrfToken: tokenMatch[1],
                workspaceId: wsMatch?.[1],
            });
        }
    }

    return results;
}

async function getAllListeningPorts(pid: number): Promise<number[]> {
    const platform = process.platform;

    try {
        if (platform === 'darwin') {
            const { stdout } = await execAsync(
                `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null`,
                { timeout: 5000 }
            );
            return parseLsofPorts(stdout, pid);
        } else if (platform === 'linux') {
            try {
                const { stdout } = await execAsync(
                    `ss -tlnp 2>/dev/null | grep "pid=${pid},"`,
                    { timeout: 5000 }
                );
                return parseSsPorts(stdout);
            } catch {
                const { stdout } = await execAsync(
                    `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null`,
                    { timeout: 5000 }
                );
                return parseLsofPorts(stdout, pid);
            }
        }
        return [];
    } catch {
        return [];
    }
}

async function testPort(port: number, csrfToken: string): Promise<boolean> {
    try {
        const url = `http://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/GetUserStatus`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': csrfToken,
            },
            body: JSON.stringify({ wrapper_data: {} }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.status === 200;
    } catch {
        return false;
    }
}

function parseLsofPorts(stdout: string, pid: number): number[] {
    const ports: number[] = [];
    const pidStr = String(pid);
    const lines = stdout.split('\n');

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2 && parts[1] === pidStr) {
            const portMatch = line.match(/(?:TCP|UDP)\s+(?:\*|[\d.]+|\[[\da-f:]+\]):(\d+)\s+\(LISTEN\)/i);
            if (portMatch) {
                const port = parseInt(portMatch[1], 10);
                if (!ports.includes(port)) {
                    ports.push(port);
                }
            }
        }
    }

    return ports.sort((a, b) => a - b);
}

function parseSsPorts(stdout: string): number[] {
    const ports: number[] = [];
    const regex = /LISTEN\s+\d+\s+\d+\s+(?:\*|[\d.]+|\[[\da-f:]*\]):(\d+)/gi;
    let match;

    while ((match = regex.exec(stdout)) !== null) {
        const port = parseInt(match[1], 10);
        if (!ports.includes(port)) {
            ports.push(port);
        }
    }

    return ports.sort((a, b) => a - b);
}

async function detectWindows(): Promise<DetectionResult> {
    try {
        const script = `
      [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
      $n = 'language_server';
      $f = 'name like ''%' + $n + '%''';
      $p = Get-CimInstance Win32_Process -Filter $f -ErrorAction SilentlyContinue;
      if ($p) { @($p) | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress } else { '[]' }
    `.replace(/\n\s+/g, ' ').trim();

        const { stdout } = await execAsync(
            `chcp 65001 >nul && powershell -ExecutionPolicy Bypass -NoProfile -Command "${script}"`,
            { timeout: 10000 }
        );

        const candidates = parseWindowsOutput(stdout);

        if (candidates.length === 0) {
            return {
                success: false,
                error: 'No Antigravity Language Server found',
                tip: 'Make sure Antigravity IDE is running',
            };
        }

        for (const candidate of candidates) {
            const port = await findWindowsListeningPort(candidate.pid, candidate.extensionPort);
            if (port) {
                return {
                    success: true,
                    server: {
                        pid: candidate.pid,
                        port,
                        csrfToken: candidate.csrfToken,
                        workspaceId: candidate.workspaceId,
                    },
                };
            }
        }

        return {
            success: false,
            error: 'Language Server found but cannot find listening port',
            tip: 'The server may still be starting up.',
        };
    } catch (error) {
        throw error;
    }
}

async function findWindowsListeningPort(pid: number, extensionPort: number): Promise<number | null> {
    try {
        const { stdout } = await execAsync(
            `netstat -ano | findstr "${pid}" | findstr "LISTENING"`,
            { timeout: 5000 }
        );

        const portRegex = /(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)\s+\S+\s+LISTENING/gi;
        const ports: number[] = [];
        let match;

        while ((match = portRegex.exec(stdout)) !== null) {
            const port = parseInt(match[1], 10);
            if (!ports.includes(port)) {
                ports.push(port);
            }
        }

        if (extensionPort > 0 && ports.includes(extensionPort)) {
            return extensionPort;
        }

        return ports[0] || (extensionPort > 0 ? extensionPort : null);
    } catch {
        return extensionPort > 0 ? extensionPort : null;
    }
}

function parseWindowsOutput(stdout: string): ProcessCandidate[] {
    try {
        const trimmed = stdout.trim();
        if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
            return [];
        }

        const data = JSON.parse(trimmed);
        const processList = Array.isArray(data) ? data : [data];
        const results: ProcessCandidate[] = [];

        for (const item of processList) {
            const cmd = item.CommandLine || '';
            const pid = item.ProcessId;

            if (!pid || !cmd.includes('--extension_server_port')) continue;
            if (!cmd.includes('--app_data_dir') || !/app_data_dir\s+["']?antigravity/i.test(cmd)) continue;

            const portMatch = cmd.match(/--extension_server_port[=\s]+(\d+)/);
            const tokenMatch = cmd.match(/--csrf_token[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);
            const wsMatch = cmd.match(/--workspace_id[=\s]+(?:["']?)([a-zA-Z0-9\-_.]+)(?:["']?)/);

            if (tokenMatch) {
                results.push({
                    pid,
                    extensionPort: portMatch ? parseInt(portMatch[1], 10) : 0,
                    csrfToken: tokenMatch[1],
                    workspaceId: wsMatch?.[1],
                });
            }
        }

        return results;
    } catch {
        return [];
    }
}

function getTroubleshootingTip(platform: string): string {
    if (platform === 'win32') {
        return 'Ensure Antigravity IDE is running. Check Task Manager for language_server_windows_x64.exe';
    } else if (platform === 'darwin') {
        return 'Ensure Antigravity IDE is running. Check: ps aux | grep language_server';
    } else {
        return 'Ensure Antigravity IDE is running. Check: ps aux | grep language_server';
    }
}
