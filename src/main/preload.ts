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
import { WindowHandlers } from './ipc/handlers/window-handlers';
import { DiscordHandlers } from './ipc/handlers/discord-handlers';
import { ProtocolHandlerEvents } from './protocol-handler';
import { MainEvents } from './main';
import { AnimationEvents } from './animations/animation-handler';
import { UpdateEvents } from './auto-updater';

/**
 * Wraps an IPC invoke call for a specific channel and handler, ensuring the
 * resulting function matches the expected handler signature.
 *
 * @returns A curried function that first accepts a channel, then returns a function
 * that invokes the IPC channel with the correct parameters and return type as defined by the handler.
 *
 * @example
 * const invoke = wrapInvoke<MyHandlers>();
 * const myHandler = invoke('my-channel');
 * const result = await myHandler(arg1, arg2);
 */
function wrapInvoke<
  Handlers extends Record<string, (...args: any[]) => any>,
>() {
  return <K extends keyof Handlers>(channel: K) => {
    return ((...args: any[]) =>
      ipcRenderer.invoke(channel as string, ...args)) as (
      ...args: ParamsWithoutFirstArg<Handlers[K]>
    ) => ReturnType<Handlers[K]>;
  };
}

/**
 * Wraps an IPC on call for a specific channel and handler, ensuring the
 * resulting function matches the expected handler signature.
 *
 * @returns A curried function that first accepts a channel, then returns a function
 * that sets up an IPC listener for that channel with the correct parameters as defined by the handler.
 *
 * @example
 * const wrap = wrapEventCallback<MyHandlers>();
 * const myHandler = wrap('my-channel');
 * myHandler((arg1, arg2) => { ... });
 */
function wrapEventCallback<Events extends Record<string, any>>() {
  return <K extends keyof Events>(channel: K) => {
    return (callback: (data: Events[typeof channel]) => any) =>
      ipcRenderer.on(channel as string, (event, data: Events[typeof channel]) =>
        callback(data),
      );
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
const invokeWindowHandler = wrapInvoke<WindowHandlers>();
const invokeDiscordHandler = wrapInvoke<DiscordHandlers>();

const registerProtocolCallback = wrapEventCallback<ProtocolHandlerEvents>();
const registerMainCallback = wrapEventCallback<MainEvents>();
const registerAnimationCallback = wrapEventCallback<AnimationEvents>();
const registerRendererCallback = wrapEventCallback<UpdateEvents>();

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
  scanMod: invokeModHandler('scan-mod'),
  changeSlots: invokeModHandler('change-slots'),
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
  minimize: invokeWindowHandler('minimize-window'),
  maximize: invokeWindowHandler('maximize-window'),
  close: invokeWindowHandler('close-window'),
  updateDiscordRPC: invokeDiscordHandler('discord-rpc-update'),

  store: {
    get: invokeStoreHandler('store-get'),
    set: invokeStoreHandler('store-set'),
    delete: invokeStoreHandler('store-delete'),
    clear: invokeStoreHandler('store-clear'),
  },

  getPathForFile(file: File) {
    return webUtils.getPathForFile(file);
  },

  onModInstallStart: registerProtocolCallback('mod-install-start'),
  onModDownloadProgress: registerProtocolCallback('mod-download-progress'),
  onModExtractStart: registerProtocolCallback('mod-extract-start'),
  onModExtractComplete: registerProtocolCallback('mod-extract-complete'),
  onModInstallSuccess: registerProtocolCallback('mod-install-success'),
  onModInstallError: registerProtocolCallback('mod-install-error'),

  onMainLog: registerMainCallback('main-log'),

  onModInstallConfirmRequest: registerProtocolCallback(
    'mod-install-confirm-request',
  ),

  onStartIntroAnimation: registerAnimationCallback('start-intro-animation'),

  onUpdateChecking: registerRendererCallback('update-checking'),
  onUpdateAvailable: registerRendererCallback('update-available'),
  onUpdateNotAvailable: registerRendererCallback('update-not-available'),
  onUpdateDownloadProgress: registerRendererCallback(
    'update-download-progress',
  ),

  onUpdateDownloaded: registerRendererCallback('update-downloaded'),
  onUpdateError: registerRendererCallback('update-error'),
} as const;

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

  closeTutorial: invokeTutorialHandler('close-tutorial-window'),
  skipTutorial: invokeTutorialHandler('skip-tutorial'),
  getMigrationStatus: invokeMigrationHandler('get-migration-status'),
} as const;

export type ElectronAPI = typeof electronAPI;
export type TutorialAPI = typeof tutorialAPI;

const windowType = process.argv
  .find((arg) => arg.startsWith('--window-type='))
  ?.split('=')[1];

if (windowType === 'main') {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
}

if (windowType === 'tutorial') {
  console.log('Tutorial preload.js loaded!');
  contextBridge.exposeInMainWorld('tutorialAPI', tutorialAPI);
  console.log('tutorialAPI exposed to window');
}
