import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as net from 'net';
import * as fs from 'fs';

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface ServerConfig {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  port: number;
  shell?: boolean;
}

export interface PortSettings {
  backend: number;
  frontend: number;
  appium: number;
}

export interface ServerState {
  name: string;
  status: ServerStatus;
  pid: number | null;
  port: number;
  logs: string[];
}

export class ProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private states: Map<string, ServerState> = new Map();
  private projectRoot: string;
  private configs: ServerConfig[];
  private portSettings: PortSettings;

  // ANSI escape code regex
  private static ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

  static readonly DEFAULT_PORTS: PortSettings = {
    backend: 3001,
    frontend: 5173,
    appium: 4900
  };

  constructor(projectRoot: string, portSettings?: PortSettings) {
    super();
    this.projectRoot = projectRoot;
    this.portSettings = portSettings || ProcessManager.DEFAULT_PORTS;
    this.configs = this.buildConfigs();
    this.initializeStates();
  }

  private buildConfigs(): ServerConfig[] {
    // Windows에서는 .cmd 확장자 필요
    const isWin = process.platform === 'win32';
    const npm = isWin ? 'npm.cmd' : 'npm';
    const appium = isWin ? 'appium.cmd' : 'appium';

    return [
      {
        name: 'Backend',
        command: npm,
        args: ['run', 'dev'],
        cwd: path.join(this.projectRoot, 'backend'),
        port: this.portSettings.backend,
        shell: false
      },
      {
        name: 'Frontend',
        command: npm,
        args: ['run', 'dev', '--', '--host', '0.0.0.0'],
        cwd: path.join(this.projectRoot, 'frontend'),
        port: this.portSettings.frontend,
        shell: false
      },
      {
        name: 'Appium',
        command: appium,
        args: ['--port', String(this.portSettings.appium), '--allow-insecure=uiautomator2:adb_shell'],
        cwd: this.projectRoot,
        port: this.portSettings.appium,
        shell: false
      }
    ];
  }

  private initializeStates(): void {
    for (const config of this.configs) {
      this.states.set(config.name, {
        name: config.name,
        status: 'stopped',
        pid: null,
        port: config.port,
        logs: []
      });
    }
  }

  updatePorts(portSettings: PortSettings): void {
    this.portSettings = portSettings;
    this.configs = this.buildConfigs();
    // Update port in states
    for (const config of this.configs) {
      const state = this.states.get(config.name);
      if (state) {
        state.port = config.port;
        this.emit('stateChange', { name: config.name, state: { ...state } });
      }
    }
    // Write .env files
    this.writeEnvFiles();
  }

  getPortSettings(): PortSettings {
    return { ...this.portSettings };
  }

  private writeEnvFiles(): void {
    try {
      // Backend .env - update or create PORT and APPIUM_PORT
      this.updateBackendEnv();
      // Frontend .env - update or create VITE_BACKEND_PORT
      this.updateFrontendEnv();
      this.addLog('Backend', `Environment files updated: PORT=${this.portSettings.backend}, APPIUM_PORT=${this.portSettings.appium}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.addLog('Backend', `Failed to write .env files: ${message}`);
    }
  }

  private updateBackendEnv(): void {
    const envPath = path.join(this.projectRoot, 'backend', '.env');
    let content = '';

    // Read existing .env if exists
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf-8');
    }

    // Update or add PORT
    if (content.match(/^PORT=/m)) {
      content = content.replace(/^PORT=.*/m, `PORT=${this.portSettings.backend}`);
    } else {
      content = `PORT=${this.portSettings.backend}\n` + content;
    }

    // Update or add APPIUM_PORT
    if (content.match(/^APPIUM_PORT=/m)) {
      content = content.replace(/^APPIUM_PORT=.*/m, `APPIUM_PORT=${this.portSettings.appium}`);
    } else {
      content = content.replace(/^PORT=.*/m, `PORT=${this.portSettings.backend}\nAPPIUM_PORT=${this.portSettings.appium}`);
    }

    fs.writeFileSync(envPath, content);
  }

  private updateFrontendEnv(): void {
    const envPath = path.join(this.projectRoot, 'frontend', '.env');
    let content = '';

    // Read existing .env if exists
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf-8');
    }

    // Update or add VITE_BACKEND_PORT
    if (content.match(/^VITE_BACKEND_PORT=/m)) {
      content = content.replace(/^VITE_BACKEND_PORT=.*/m, `VITE_BACKEND_PORT=${this.portSettings.backend}`);
    } else {
      content = `VITE_BACKEND_PORT=${this.portSettings.backend}\n` + content;
    }

    fs.writeFileSync(envPath, content);
  }

  getConfigs(): ServerConfig[] {
    return this.configs;
  }

  getState(name: string): ServerState | undefined {
    return this.states.get(name);
  }

  getAllStates(): ServerState[] {
    return Array.from(this.states.values());
  }

  private stripAnsi(text: string): string {
    return text.replace(ProcessManager.ANSI_REGEX, '');
  }

  private async isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(true));
      server.once('listening', () => {
        server.close();
        resolve(false);
      });
      server.listen(port, '127.0.0.1');
    });
  }

  private addLog(name: string, message: string): void {
    const state = this.states.get(name);
    if (state) {
      // Strip ANSI escape codes
      const cleanMessage = this.stripAnsi(message).trim();
      if (!cleanMessage) return;

      const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
      const logEntry = `[${timestamp}] ${cleanMessage}`;
      state.logs.push(logEntry);
      // Keep only last 500 logs
      if (state.logs.length > 500) {
        state.logs = state.logs.slice(-500);
      }
      this.emit('log', { name, message: logEntry });
    }
  }

  private updateState(name: string, updates: Partial<ServerState>): void {
    const state = this.states.get(name);
    if (state) {
      Object.assign(state, updates);
      this.emit('stateChange', { name, state: { ...state } });
    }
  }

  async start(name: string): Promise<boolean> {
    const config = this.configs.find(c => c.name === name);
    if (!config) {
      this.addLog(name, `Unknown server: ${name}`);
      return false;
    }

    const state = this.states.get(name);
    if (state?.status === 'running' || state?.status === 'starting') {
      this.addLog(name, 'Server is already running or starting');
      return false;
    }

    // Check if port is in use
    const portInUse = await this.isPortInUse(config.port);
    if (portInUse) {
      this.addLog(name, `Port ${config.port} is already in use`);
      this.updateState(name, { status: 'error' });
      return false;
    }

    this.updateState(name, { status: 'starting' });
    this.addLog(name, `Starting ${name}...`);

    try {
      const proc = spawn(config.command, config.args, {
        cwd: config.cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          NO_COLOR: '1'
        }
      });

      this.processes.set(name, proc);
      this.updateState(name, { pid: proc.pid || null });

      proc.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          this.addLog(name, line);
        }

        // Detect when server is ready
        const output = data.toString();
        if (name === 'Backend' && output.includes('Server listening')) {
          this.updateState(name, { status: 'running' });
        } else if (name === 'Frontend' && output.includes('Local:')) {
          this.updateState(name, { status: 'running' });
        } else if (name === 'Appium' && output.includes('Appium REST http interface listener started')) {
          this.updateState(name, { status: 'running' });
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          this.addLog(name, `[stderr] ${line}`);
        }
      });

      proc.on('error', (err) => {
        this.addLog(name, `Error: ${err.message}`);
        this.updateState(name, { status: 'error', pid: null });
        this.processes.delete(name);
      });

      proc.on('exit', (code) => {
        this.addLog(name, `Process exited with code ${code}`);
        this.updateState(name, { status: 'stopped', pid: null });
        this.processes.delete(name);
      });

      // Set timeout to check if server started
      setTimeout(() => {
        const currentState = this.states.get(name);
        if (currentState?.status === 'starting') {
          // Still starting after timeout, assume running
          this.updateState(name, { status: 'running' });
        }
      }, 10000);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.addLog(name, `Failed to start: ${message}`);
      this.updateState(name, { status: 'error' });
      return false;
    }
  }

  async stop(name: string): Promise<boolean> {
    const proc = this.processes.get(name);
    const state = this.states.get(name);

    if (!proc || !state || state.status === 'stopped') {
      this.addLog(name, 'Server is not running');
      return false;
    }

    this.updateState(name, { status: 'stopping' });
    this.addLog(name, `Stopping ${name}...`);

    return new Promise((resolve) => {
      const pid = proc.pid;

      if (!pid) {
        this.updateState(name, { status: 'stopped', pid: null });
        this.processes.delete(name);
        resolve(true);
        return;
      }

      // Windows: kill process tree
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
        } else {
          proc.kill('SIGTERM');
          // Force kill after 5 seconds
          setTimeout(() => {
            if (this.processes.has(name)) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }
      } catch (err) {
        // Process might already be dead
      }

      // Wait for process to exit
      const checkInterval = setInterval(() => {
        if (!this.processes.has(name) || this.states.get(name)?.status === 'stopped') {
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 100);

      // Force resolve after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        this.updateState(name, { status: 'stopped', pid: null });
        this.processes.delete(name);
        resolve(true);
      }, 10000);
    });
  }

  async restart(name: string): Promise<boolean> {
    await this.stop(name);
    // Wait a bit for port to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
    return this.start(name);
  }

  async startAll(): Promise<void> {
    // Start in order: Backend -> Appium -> Frontend
    const order = ['Backend', 'Appium', 'Frontend'];
    for (const name of order) {
      await this.start(name);
      // Wait for server to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async stopAll(): Promise<void> {
    const promises = this.configs.map(config => this.stop(config.name));
    await Promise.all(promises);
  }

  clearLogs(name: string): void {
    const state = this.states.get(name);
    if (state) {
      state.logs = [];
      this.emit('logsCleared', { name });
    }
  }

  cleanup(): void {
    for (const [name, proc] of this.processes) {
      try {
        if (proc.pid && process.platform === 'win32') {
          execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
        } else {
          proc.kill('SIGKILL');
        }
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.processes.clear();
  }
}
