import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import store from './store';
import { initializeProtocol } from './main-protocol-setup';
import { createTutorialWindow } from './tutorial-window';
import { migrateFromV3 } from './migration';
import DiscordRPCManager from './discord-rpc';
import { registerAllHandlers } from './ipc';
import { PATHS } from './config';
import autoUpdater from './auto-updater';
import { initPosthog, identifyUser, shutdownPosthog } from './posthog';

import AnimationHandler from './animations/animation-handler';

const logsDir = PATHS.logsDir();
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function cleanOldLogs(retentionDays: number) {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (!file.startsWith('app-') || !file.endsWith('.log')) continue;

      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtime.getTime();

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old log file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Failed to clean old logs:', error);
  }
}

const logRetentionDays = (store.get('logRetentionDays') as number) || 7;
cleanOldLogs(logRetentionDays);

const logFilePath = path.join(
  logsDir,
  `app-${new Date().toISOString().split('T')[0]}.log`,
);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

let mainWindow: BrowserWindow | null = null;
let discordRPC: DiscordRPCManager | null = null;

const animationHandler = new AnimationHandler();

export interface MainEvents {
  'main-log': { level: string; message: string; timestamp: string };
}

function sendToRenderer(
  channel: keyof MainEvents,
  data: MainEvents[typeof channel],
) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function writeLog(level, args) {
  const timestamp = new Date().toISOString();
  const message = args
    .map((arg) => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');

  const logLine = `[${timestamp}] [${level.toUpperCase()}] [MAIN] ${message}\n`;
  logStream.write(logLine);

  if (mainWindow && !mainWindow.isDestroyed()) {
    sendToRenderer('main-log', {
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

console.log = (...args) => {
  writeLog('log', args);
  originalConsoleLog.apply(console, args);
};

console.warn = (...args) => {
  writeLog('warn', args);
  originalConsoleWarn.apply(console, args);
};

console.error = (...args) => {
  writeLog('error', args);
  originalConsoleError.apply(console, args);
};

interface CreateWindowOptions {
  animate?: boolean;
}

function createWindow(options: CreateWindowOptions = {}) {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 800,
    icon: path.join(app.getAppPath(), 'assets', 'app-icons', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: ['--window-type=main'],
    },
    backgroundColor: '#1a1a1a',
    frame: false,
    transparent: false,
    hasShadow: true,
    show: false,
  });

  mainWindow.webContents.on('will-navigate', (event, _url) => {
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.webContents.on(
    'will-attach-webview',
    (event, webPreferences, _params) => {
      webPreferences.nodeIntegration = false;
    },
  );

  let windowShown = false;

  const showWindow = () => {
    if (!windowShown && mainWindow && !mainWindow.isDestroyed()) {
      windowShown = true;
      mainWindow.show();

      animationHandler.initialize(mainWindow);

      if (options.animate) {
        // Give the renderer a moment to fully initialize before sending the animation signal
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('start-intro-animation');
          }
        }, 500);
      }
    }
  };

  const showTimeout = setTimeout(
    () => {
      if (!windowShown && mainWindow && !mainWindow.isDestroyed()) {
        console.log('[linux] Force showing window after timeout');
        showWindow();
      }
    },
    process.platform === 'linux' ? 2000 : 5000,
  );

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showTimeout);
    showWindow();
  });

  mainWindow.webContents.once('did-finish-load', () => {
    if (!windowShown && process.platform === 'linux') {
      console.log(
        '[linux] Window not shown yet, showing after did-finish-load',
      );
      clearTimeout(showTimeout);
      showWindow();
    }
  });

  mainWindow.webContents.on('dom-ready', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`
        document.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
        document.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
        }, false);
      `);
    }
  });

  const loadPath = path.join(app.getAppPath(), 'assets', 'pages', 'index.html');

  if (options.animate) {
    mainWindow.loadFile(loadPath, { query: { animate: 'true' } });
  } else {
    mainWindow.loadFile(loadPath);
  }

  if (!discordRPC) {
    discordRPC = new DiscordRPCManager();
    discordRPC.connect().catch((err) => {
      console.warn('Could not connect to Discord:', err.message);
    });
  }

  mainWindow.on('closed', () => {
    if (discordRPC) {
      discordRPC.disconnect();
      discordRPC = null;
    }
  });

  initializeProtocol(mainWindow);

  autoUpdater.setMainWindow(mainWindow);
  autoUpdater.checkForUpdatesOnStartup();

  return mainWindow;
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    registerAllHandlers(ipcMain, discordRPC);

    // Initialize PostHog analytics
    initPosthog();
    identifyUser();

    console.log('Checking for FightPlanner 3 settings...');
    const migrationResult = await migrateFromV3();

    if (migrationResult.migrated) {
      console.log('Settings migrated from FightPlanner 3');
      console.log(
        'Migrated:',
        Object.keys(migrationResult.settings || {}).join(', '),
      );
    }

    const hasLaunchedBefore = await store.get('hasLaunchedBefore');

    if (!hasLaunchedBefore) {
      console.log('First launch - opening tutorial only');
      await store.set('hasLaunchedBefore', true);

      const tempWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
        },
      });

      const tutWindow = createTutorialWindow(tempWindow);

      tutWindow.on('closed', () => {
        tempWindow.close();

        console.log('omg he finish the tutorial lets gooo, go to the main app');
        createWindow({ animate: true });
      });
    } else {
      createWindow();
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', function () {
    if (discordRPC) {
      discordRPC.disconnect();
      discordRPC = null;
    }
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('quit', async () => {
    if (discordRPC) {
      discordRPC.disconnect();
      discordRPC = null;
    }
    await shutdownPosthog();
  });
}
