import { contextBridge, ipcRenderer, webUtils } from 'electron';

import { FileHandlers } from './ipc/handlers/file-handlers';
import { ModHandlers } from './ipc/handlers/mod-handlers';
import { PluginHandlers } from './ipc/handlers/plugin-handlers';
import { StoreHandlers } from './ipc/handlers/store-handlers';
import { AppHandlers } from './ipc/handlers/app-handlers';
import { SystemHandlers } from './ipc/handlers/system-handlers';
import { ProtocolHandlers } from './ipc/handlers/protocol-handlers';
import { FtpHandlers } from './ipc/handlers/ftp-handlers';
import { UpdateHandlers } from './ipc/handlers/update-handlers';
import { TutorialHandlers } from './ipc/handlers/tutorial-handlers';
import { MigrationHandlers } from './ipc/handlers/migration-handlers';
import { ParamsWithoutFirstArg } from './types/common';

/**
 * Wraps an IPC invoke call for a specific channel and handler, ensuring the
 * resulting function matches the expected handler signature (minus the first BaseHandlerArg parameter).
 * @returns A curried function that first accepts a channel, then returns a function
 * that invokes the IPC channel with the correct parameters and return type as defined by the handler.
 *
 * @example
 * const invoke = wrapInvoke<MyHandlers>();
 * const myHandler = invoke('my-channel');
 * const result = await myHandler(arg1, arg2);
 */
export function wrapInvoke<
  Handlers extends Record<string, (...args: any[]) => any>,
>() {
  return <K extends keyof Handlers>(channel: K) => {
    return ((...args: any[]) =>
      ipcRenderer.invoke(channel as string, ...args)) as (
      ...args: ParamsWithoutFirstArg<Handlers[K]>
    ) => ReturnType<Handlers[K]>;
  };
}

const invokeFileHandler = wrapInvoke<FileHandlers>();
const invokeModHandler = wrapInvoke<ModHandlers>();
const invokePluginHandler = wrapInvoke<PluginHandlers>();
const invokeStoreHandler = wrapInvoke<StoreHandlers>();
const invokeAppHandler = wrapInvoke<AppHandlers>();
const invokeSystemHandler = wrapInvoke<SystemHandlers>();
const invokeProtocolHandler = wrapInvoke<ProtocolHandlers>();
const invokeFtpHandler = wrapInvoke<FtpHandlers>();
const invokeUpdateHandler = wrapInvoke<UpdateHandlers>();
const invokeTutorialHandler = wrapInvoke<TutorialHandlers>();
const invokeMigrationHandler = wrapInvoke<MigrationHandlers>();

const windowType = process.argv
  .find((arg) => arg.startsWith('--window-type='))
  ?.split('=')[1];

const electronAPI = {
  selectGameFile: invokeFileHandler('select-game-file'),
  selectFolder: invokeFileHandler('select-folder'),
  selectEmulatorFile: invokeFileHandler('select-emulator-file'),
  readModsFolder: invokeModHandler('read-mods-folder'),
  getPreviewImage: invokeModHandler('get-preview-image'),
  getModInfo: invokeModHandler('get-mod-info'),
  saveModInfo: invokeModHandler('save-mod-info'),
  readModInfoRaw: invokeModHandler('read-mod-info-raw'),
  saveModInfoRaw: invokeModHandler('save-mod-info-raw'),
  openFolder: invokeFileHandler('open-folder'),
  openFile: invokeFileHandler('open-file'),
  openUrl: invokeSystemHandler('open-url'),
  openFightPlannerLink: invokeSystemHandler('open-fightplanner-link'),
  renameMod: invokeModHandler('rename-mod'),
  deleteMod: invokeModHandler('delete-mod'),
  toggleMod: invokeModHandler('toggle-mod'),
  readPluginsFolder: invokePluginHandler('read-plugins-folder'),
  selectPluginFile: invokePluginHandler('select-plugin-file'),
  togglePlugin: invokePluginHandler('toggle-plugin'),
  deletePlugin: invokePluginHandler('delete-plugin'),
  checkPluginUpdates: invokePluginHandler('check-plugin-updates'),
  updatePlugin: invokePluginHandler('update-plugin'),
  getPluginRepoMapping: invokePluginHandler('get-plugin-repo-mapping'),
  setPluginRepoMapping: invokePluginHandler('set-plugin-repo-mapping'),
  getAppVersion: invokeAppHandler('get-app-version'),
  scanModForFighters: invokeModHandler('scan-mod-for-fighters'),
  scanModSlots: invokeModHandler('scan-mod-slots'),
  scanModSlotsByFighter: invokeModHandler('scan-mod-slots-by-fighter'),
  getUsedSlotsForFighter: invokeModHandler('get-used-slots-for-fighter'),
  applySlotChanges: invokeModHandler('apply-slot-changes'),
  detectConflicts: invokeModHandler('detect-conflicts'),
  openTutorialWindow: invokeTutorialHandler('open-tutorial-window'),
  cancelDownload: invokeSystemHandler('cancel-download'),
  sendModsToSwitch: invokeFtpHandler('send-mods-to-switch'),
  installModFromPath: invokeModHandler('install-mod-from-path'),
  selectModFile: invokeFileHandler('select-mod-file'),
  handleFilesDropped: invokeModHandler('handle-files-dropped'),
  getLogsPath: invokeSystemHandler('get-logs-path'),
  readLogFile: invokeSystemHandler('read-log-file'),
  selectCustomFile: invokeFileHandler('select-custom-file'),
  readCustomFile: invokeFileHandler('read-custom-file'),
  clearTempFiles: invokeSystemHandler('clear-temp-files'),
  confirmProtocolInstall: invokeProtocolHandler('confirm-protocol-install'),
  cancelProtocolInstall: invokeProtocolHandler('cancel-protocol-install'),
  fetchGameBananaPreview: invokeProtocolHandler('fetch-gamebanana-preview'),
  launchEmulator: invokeSystemHandler('launch-emulator'),
  loadLocale: invokeSystemHandler('load-locale'),
  getAvailableDrives: invokeSystemHandler('get-available-drives'),
  saveFileDialog: invokeFileHandler('save-file-dialog'),
  writeFile: invokeFileHandler('write-file'),
  checkForUpdates: invokeUpdateHandler('check-for-updates'),
  downloadUpdate: invokeUpdateHandler('download-update'),
  installUpdate: invokeUpdateHandler('install-update'),
  getUpdateInfo: invokeUpdateHandler('get-update-info'),
  setAutoCheckEnabled: invokeUpdateHandler('set-auto-check-enabled'),
  setUpdateChannel: invokeUpdateHandler('set-update-channel'),
  getUpdateChannel: invokeUpdateHandler('get-update-channel'),
  setForceUpdate: invokeUpdateHandler('set-force-update'),
  getForceUpdate: invokeUpdateHandler('get-force-update'),
  simulateUpdate: invokeUpdateHandler('simulate-update'),
  store: {
    get: invokeStoreHandler('store-get'),
    set: invokeStoreHandler('store-set'),
    delete: invokeStoreHandler('store-delete'),
    clear: invokeStoreHandler('store-clear'),
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
  updateDiscordRPC: (data) => ipcRenderer.send('discord-rpc-update', data),

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

const tutorialAPI = {
  // Settings & File System
  selectFolder: invokeFileHandler('select-folder'),
  saveSetting: invokeStoreHandler('store-set'),
  getSetting: invokeStoreHandler('store-get'),

  // ARCropolis Installation
  detectSdDrives: invokeTutorialHandler('detect-sd-drives'),
  detectYuzuPath: invokeTutorialHandler('detect-yuzu-path'),
  detectRyujinxPath: invokeTutorialHandler('detect-ryujinx-path'),
  getGithubRelease: invokeTutorialHandler('get-github-release'),
  getSkylineRelease: invokeTutorialHandler('get-skyline-release'),
  downloadArcropolis: invokeTutorialHandler('download-arcropolis'),
  extractArcropolis: invokeTutorialHandler('extract-arcropolis'),
  extractSkyline: invokeTutorialHandler('extract-skyline'),
  createDirectory: invokeTutorialHandler('create-directory'),
  checkArcropolisInstalled: invokeTutorialHandler('check-arcropolis-installed'),
  checkArcropolisFolder: invokeTutorialHandler('check-arcropolis-folder'),
  selectDrive: invokeTutorialHandler('select-drive'),
  joinPath: invokeTutorialHandler('join-path'),
  getTempDir: invokeTutorialHandler('get-temp-dir'),
  openUrl: invokeSystemHandler('open-url'),

  store: {
    get: invokeStoreHandler('store-get'),
    set: invokeStoreHandler('store-set'),
    delete: invokeStoreHandler('store-delete'),
    clear: invokeStoreHandler('store-clear'),
  },

  closeTutorial: () => {
    console.log('tutorialAPI.closeTutorial() called from renderer');
    ipcRenderer.send('close-tutorial-window');
    console.log('IPC event "close-tutorial-window" sent');
  },

  skipTutorial: () => {
    console.log('tutorialAPI.skipTutorial() called from renderer');
    ipcRenderer.send('skip-tutorial');
    console.log('IPC event "skip-tutorial" sent');
  },

  getMigrationStatus: invokeMigrationHandler('get-migration-status'),
  onAnimationComplete: (callback) =>
    ipcRenderer.on('animation-complete', callback),
};

export type ElectronAPI = typeof electronAPI;
export type TutorialAPI = typeof tutorialAPI;

if (windowType === 'main') {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
}

if (windowType === 'tutorial') {
  console.log('Tutorial preload.js loaded!');
  contextBridge.exposeInMainWorld('tutorialAPI', tutorialAPI);
  console.log('tutorialAPI exposed to window');
}
