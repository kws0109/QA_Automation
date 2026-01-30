import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ProcessManager, ServerState, PortSettings } from './processManager';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let processManager: ProcessManager | null = null;

// Settings file path
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

interface Settings {
  projectPath: string;
  startOnBoot: boolean;
  autoStartServers: boolean;
  ports: PortSettings;
}

function loadSettings(): Settings {
  const defaultSettings: Settings = {
    projectPath: path.resolve(__dirname, '..', '..'),
    startOnBoot: false,
    autoStartServers: false,
    ports: ProcessManager.DEFAULT_PORTS
  };

  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }

  return defaultSettings;
}

function saveSettings(settings: Settings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'public', 'icon.png'),
    title: 'QA Server Manager',
    show: false
  });

  // Development: Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load built files
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    // Minimize to tray instead of closing
    if (tray) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  // Create a simple 16x16 icon
  const iconPath = path.join(__dirname, '..', 'public', 'tray-icon.png');
  let icon: nativeImage;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    // Create a simple colored icon if file doesn't exist
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('QA Server Manager');

  updateTrayMenu();

  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function updateTrayMenu(): void {
  if (!tray) return;

  const states = processManager?.getAllStates() || [];
  const allRunning = states.every(s => s.status === 'running');
  const anyRunning = states.some(s => s.status === 'running' || s.status === 'starting');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Start All',
      enabled: !allRunning,
      click: () => processManager?.startAll()
    },
    {
      label: 'Stop All',
      enabled: anyRunning,
      click: () => processManager?.stopAll()
    },
    { type: 'separator' },
    ...states.map(state => ({
      label: `${state.name}: ${state.status}`,
      enabled: false
    })),
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        processManager?.cleanup();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function setupIPC(): void {
  let settings = loadSettings();
  processManager = new ProcessManager(settings.projectPath, settings.ports);

  // Forward events to renderer
  processManager.on('stateChange', (data: { name: string; state: ServerState }) => {
    mainWindow?.webContents.send('server:stateChange', data);
    updateTrayMenu();
  });

  processManager.on('log', (data: { name: string; message: string }) => {
    mainWindow?.webContents.send('server:log', data);
  });

  processManager.on('logsCleared', (data: { name: string }) => {
    mainWindow?.webContents.send('server:logsCleared', data);
  });

  // IPC handlers
  ipcMain.handle('server:start', async (_, name: string) => {
    return processManager?.start(name);
  });

  ipcMain.handle('server:stop', async (_, name: string) => {
    return processManager?.stop(name);
  });

  ipcMain.handle('server:restart', async (_, name: string) => {
    return processManager?.restart(name);
  });

  ipcMain.handle('server:startAll', async () => {
    return processManager?.startAll();
  });

  ipcMain.handle('server:stopAll', async () => {
    return processManager?.stopAll();
  });

  ipcMain.handle('server:getStates', () => {
    return processManager?.getAllStates() || [];
  });

  ipcMain.on('server:clearLogs', (_, name: string) => {
    processManager?.clearLogs(name);
  });

  ipcMain.on('window:minimizeToTray', () => {
    mainWindow?.hide();
  });

  ipcMain.handle('settings:getProjectPath', () => {
    return settings.projectPath;
  });

  ipcMain.handle('settings:setProjectPath', (_, newPath: string) => {
    settings.projectPath = newPath;
    saveSettings(settings);
    // Recreate process manager with new path
    processManager?.cleanup();
    processManager = new ProcessManager(newPath, settings.ports);
  });

  ipcMain.handle('settings:getPorts', () => {
    return processManager?.getPortSettings() || ProcessManager.DEFAULT_PORTS;
  });

  ipcMain.handle('settings:setPorts', (_, ports: PortSettings) => {
    settings.ports = ports;
    saveSettings(settings);
    processManager?.updatePorts(ports);
    return true;
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep app running in tray on Windows/Linux
  if (process.platform === 'darwin') {
    // On macOS, keep the app in dock
  }
});

app.on('before-quit', () => {
  processManager?.cleanup();
  tray?.destroy();
});

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
