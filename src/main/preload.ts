import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { modHandlerMap, ModHandlers } from './ipc/handlers/mod-handlers';
import { appHandlerMap, AppHandlers } from './ipc/handlers/app-handlers';
import { storeHandlerMap, StoreHandlers } from './ipc/handlers/store-handlers';
import { fileHandlerMap, FileHandlers } from './ipc/handlers/file-handlers';
import {
  pluginHandlerMap,
  PluginHandlers,
} from './ipc/handlers/plugin-handlers';
import {
  systemHandlerMap,
  SystemHandlers,
} from './ipc/handlers/system-handlers';
import { ftpHandlerMap, FtpHandlers } from './ipc/handlers/ftp-handlers';
import {
  protocolHandlerMap,
  ProtocolHandlers,
} from './ipc/handlers/protocol-handlers';
import {
  updateHandlerMap,
  UpdateHandlers,
} from './ipc/handlers/update-handlers';
import {
  tutorialHandlerMap,
  TutorialHandlers,
} from './ipc/handlers/tutorial-handlers';
import { wrapAllInvokes } from './utils/ipc-wrappers';
import {
  discordEventMap,
  DiscordHandlers,
} from './ipc/handlers/discord-handlers';

export type ElectronAPI = typeof electronAPI;

console.log('Preload script LOADING.');
const electronAPI = {
  ...wrapAllInvokes(modHandlerMap, ModHandlers),
  ...wrapAllInvokes(appHandlerMap, AppHandlers),
  ...wrapAllInvokes(fileHandlerMap, FileHandlers),
  ...wrapAllInvokes(pluginHandlerMap, PluginHandlers),
  ...wrapAllInvokes(systemHandlerMap, SystemHandlers),
  ...wrapAllInvokes(ftpHandlerMap, FtpHandlers),
  ...wrapAllInvokes(protocolHandlerMap, ProtocolHandlers),
  ...wrapAllInvokes(updateHandlerMap, UpdateHandlers),
  ...wrapAllInvokes(tutorialHandlerMap, TutorialHandlers),
  ...wrapAllInvokes(discordEventMap, DiscordHandlers),

  // Store handlers with nested structure
  store: {
    ...wrapAllInvokes(storeHandlerMap, StoreHandlers),
  },

  getPathForFile: (file) => webUtils.getPathForFile(file),

  minimize: () => ipcRenderer.send('minimize-window'),

  maximize: () => ipcRenderer.send('maximize-window'),

  close: () => ipcRenderer.send('close-window'),

  onModInstallStart: (callback) =>
    ipcRenderer.on('mod-install-start', (event, data) => callback(data)),

  onModDownloadProgress: (callback) =>
    ipcRenderer.on('mod-download-progress', (event, data) => callback(data)),

  onModExtractStart: (callback) =>
    ipcRenderer.on('mod-extract-start', (event, data) => callback(data)),

  onModExtractComplete: (callback) =>
    ipcRenderer.on('mod-extract-complete', (event, data) => callback(data)),

  onModInstallSuccess: (callback) =>
    ipcRenderer.on('mod-install-success', (event, data) => callback(data)),

  onModInstallError: (callback) =>
    ipcRenderer.on('mod-install-error', (event, data) => callback(data)),

  updateToolsTabStatus: (status) =>
    ipcRenderer.send('update-tools-tab-status', status),

  onWindowDropFiles: (callback) =>
    ipcRenderer.on('window-drop-files', (event, filePaths) =>
      callback(filePaths),
    ),

  onDropResult: (callback) =>
    ipcRenderer.on('drop-result', (event, data) => callback(data)),

  onDropError: (callback) =>
    ipcRenderer.on('drop-error', (event, error) => callback(error)),

  onMainLog: (callback) =>
    ipcRenderer.on('main-log', (event, logData) => callback(logData)),

  onModInstallConfirmRequest: (callback) => {
    ipcRenderer.on('mod-install-confirm-request', (event, data) =>
      callback(data),
    );
  },

  onStartIntroAnimation: (callback) =>
    ipcRenderer.on('start-intro-animation', (event, data) => callback(data)),

  onUpdateChecking: (callback) =>
    ipcRenderer.on('update-checking', (event, data) => callback(data)),

  onUpdateAvailable: (callback) =>
    ipcRenderer.on('update-available', (event, data) => callback(data)),

  onUpdateNotAvailable: (callback) =>
    ipcRenderer.on('update-not-available', (event, data) => callback(data)),

  onUpdateDownloadProgress: (callback) =>
    ipcRenderer.on('update-download-progress', (event, data) => callback(data)),

  onUpdateDownloaded: (callback) =>
    ipcRenderer.on('update-downloaded', (event, data) => callback(data)),

  onUpdateError: (callback) =>
    ipcRenderer.on('update-error', (event, data) => callback(data)),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
