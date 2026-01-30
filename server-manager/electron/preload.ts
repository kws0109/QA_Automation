import { contextBridge, ipcRenderer } from 'electron';

export interface ServerState {
  name: string;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  pid: number | null;
  port: number;
  logs: string[];
}

export interface PortSettings {
  backend: number;
  frontend: number;
  appium: number;
}

export interface ElectronAPI {
  // Server controls
  startServer: (name: string) => Promise<boolean>;
  stopServer: (name: string) => Promise<boolean>;
  restartServer: (name: string) => Promise<boolean>;
  startAll: () => Promise<void>;
  stopAll: () => Promise<void>;

  // State
  getStates: () => Promise<ServerState[]>;
  clearLogs: (name: string) => void;

  // Events
  onStateChange: (callback: (data: { name: string; state: ServerState }) => void) => () => void;
  onLog: (callback: (data: { name: string; message: string }) => void) => () => void;
  onLogsCleared: (callback: (data: { name: string }) => void) => () => void;

  // Window controls
  minimizeToTray: () => void;

  // Settings
  getProjectPath: () => Promise<string>;
  setProjectPath: (path: string) => Promise<void>;
  getPorts: () => Promise<PortSettings>;
  setPorts: (ports: PortSettings) => Promise<boolean>;
}

const electronAPI: ElectronAPI = {
  // Server controls
  startServer: (name: string) => ipcRenderer.invoke('server:start', name),
  stopServer: (name: string) => ipcRenderer.invoke('server:stop', name),
  restartServer: (name: string) => ipcRenderer.invoke('server:restart', name),
  startAll: () => ipcRenderer.invoke('server:startAll'),
  stopAll: () => ipcRenderer.invoke('server:stopAll'),

  // State
  getStates: () => ipcRenderer.invoke('server:getStates'),
  clearLogs: (name: string) => ipcRenderer.send('server:clearLogs', name),

  // Events
  onStateChange: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { name: string; state: ServerState }) => callback(data);
    ipcRenderer.on('server:stateChange', handler);
    return () => ipcRenderer.removeListener('server:stateChange', handler);
  },
  onLog: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { name: string; message: string }) => callback(data);
    ipcRenderer.on('server:log', handler);
    return () => ipcRenderer.removeListener('server:log', handler);
  },
  onLogsCleared: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { name: string }) => callback(data);
    ipcRenderer.on('server:logsCleared', handler);
    return () => ipcRenderer.removeListener('server:logsCleared', handler);
  },

  // Window controls
  minimizeToTray: () => ipcRenderer.send('window:minimizeToTray'),

  // Settings
  getProjectPath: () => ipcRenderer.invoke('settings:getProjectPath'),
  setProjectPath: (path: string) => ipcRenderer.invoke('settings:setProjectPath', path),
  getPorts: () => ipcRenderer.invoke('settings:getPorts'),
  setPorts: (ports: PortSettings) => ipcRenderer.invoke('settings:setPorts', ports)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
