import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } from 'electron';
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

function getDefaultProjectPath(): string {
  if (app.isPackaged) {
    // 패키징된 앱: exe 위치 기준 (release/../.. = game-automation-tool)
    return path.resolve(path.dirname(process.execPath), '..', '..');
  } else {
    // 개발 모드: __dirname 기준 (electron/../.. = game-automation-tool)
    return path.resolve(__dirname, '..', '..');
  }
}

function loadSettings(): Settings {
  const defaultSettings: Settings = {
    projectPath: getDefaultProjectPath(),
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

  mainWindow.on('close', async (event) => {
    // Show dialog to ask user what to do
    event.preventDefault();

    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['트레이로 최소화', '종료', '취소'],
      defaultId: 0,
      cancelId: 2,
      title: 'QA Server Manager',
      message: '프로그램을 어떻게 처리할까요?',
      detail: '트레이로 최소화하면 백그라운드에서 계속 실행됩니다.'
    });

    if (response === 0) {
      // Minimize to tray
      mainWindow?.hide();
    } else if (response === 1) {
      // Exit completely - use async cleanup for non-blocking shutdown
      await processManager?.cleanupAsync();
      tray?.destroy();
      tray = null;
      mainWindow?.destroy();
      app.quit();
    }
    // response === 2 (Cancel) - do nothing
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
      click: async () => {
        await processManager?.cleanupAsync();
        tray?.destroy();
        tray = null;
        mainWindow?.destroy();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// Helper function to setup ProcessManager event listeners
function setupProcessManagerEvents(pm: ProcessManager): void {
  pm.on('stateChange', (data: { name: string; state: ServerState }) => {
    mainWindow?.webContents.send('server:stateChange', data);
    updateTrayMenu();
  });
  pm.on('log', (data: { name: string; message: string }) => {
    mainWindow?.webContents.send('server:log', data);
  });
  pm.on('logsCleared', (data: { name: string }) => {
    mainWindow?.webContents.send('server:logsCleared', data);
  });
}

// Validate project path contains required folders
function validateProjectPath(projectPath: string): { valid: boolean; error?: string } {
  if (!fs.existsSync(projectPath)) {
    return { valid: false, error: '경로가 존재하지 않습니다' };
  }

  const backendPath = path.join(projectPath, 'backend');
  const frontendPath = path.join(projectPath, 'frontend');

  if (!fs.existsSync(backendPath)) {
    return { valid: false, error: 'backend 폴더가 없습니다' };
  }

  if (!fs.existsSync(frontendPath)) {
    return { valid: false, error: 'frontend 폴더가 없습니다' };
  }

  return { valid: true };
}

function setupIPC(): void {
  let settings = loadSettings();
  processManager = new ProcessManager(settings.projectPath, settings.ports);

  // Forward events to renderer
  setupProcessManagerEvents(processManager);

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
    // Validate the new path
    const validation = validateProjectPath(newPath);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    settings.projectPath = newPath;
    saveSettings(settings);
    // Recreate process manager with new path
    processManager?.cleanup();
    processManager = new ProcessManager(newPath, settings.ports);
    // Re-setup event forwarding using helper function
    setupProcessManagerEvents(processManager);
    return { success: true };
  });

  ipcMain.handle('settings:selectProjectPath', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select Project Folder (game-automation-tool)',
      properties: ['openDirectory'],
      defaultPath: settings.projectPath
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
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
