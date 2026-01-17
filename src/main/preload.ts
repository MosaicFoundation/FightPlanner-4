const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  minimize: () => ipcRenderer.send('minimize-window'),
  maximize: () => ipcRenderer.send('maximize-window'),
  close: () => ipcRenderer.send('close-window'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectEmulatorFile: () => ipcRenderer.invoke('select-emulator-file'),
  selectGameFile: () => ipcRenderer.invoke('select-game-file'),
  readModsFolder: (path) => ipcRenderer.invoke('read-mods-folder', path),
  getPreviewImage: (modPath) =>
    ipcRenderer.invoke('get-preview-image', modPath),
  getModInfo: (modPath) => ipcRenderer.invoke('get-mod-info', modPath),
  saveModInfo: (modPath, infoData) =>
    ipcRenderer.invoke('save-mod-info', modPath, infoData),
  readModInfoRaw: (modPath) => ipcRenderer.invoke('read-mod-info-raw', modPath),
  saveModInfoRaw: (modPath, tomlContent) =>
    ipcRenderer.invoke('save-mod-info-raw', modPath, tomlContent),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openFightPlannerLink: (url) =>
    ipcRenderer.invoke('open-fightplanner-link', url),
  renameMod: (modPath, newName) =>
    ipcRenderer.invoke('rename-mod', modPath, newName),
  deleteMod: (modPath) => ipcRenderer.invoke('delete-mod', modPath),
  toggleMod: (modPath, modsBasePath) =>
    ipcRenderer.invoke('toggle-mod', modPath, modsBasePath),

  readPluginsFolder: (path) => ipcRenderer.invoke('read-plugins-folder', path),
  selectPluginFile: (pluginsPath) =>
    ipcRenderer.invoke('select-plugin-file', pluginsPath),
  togglePlugin: (pluginPath, pluginsBasePath) =>
    ipcRenderer.invoke('toggle-plugin', pluginPath, pluginsBasePath),
  deletePlugin: (pluginPath) => ipcRenderer.invoke('delete-plugin', pluginPath),
  checkPluginUpdates: () => ipcRenderer.invoke('check-plugin-updates'),
  updatePlugin: (pluginName, downloadUrl, pluginPath, targetVersion) =>
    ipcRenderer.invoke(
      'update-plugin',
      pluginName,
      downloadUrl,
      pluginPath,
      targetVersion,
    ),
  getPluginRepoMapping: () => ipcRenderer.invoke('get-plugin-repo-mapping'),
  setPluginRepoMapping: (pluginName, repoInput) =>
    ipcRenderer.invoke('set-plugin-repo-mapping', pluginName, repoInput),
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key),
    clear: () => ipcRenderer.invoke('store-clear'),
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  scanModForFighters: (modPath) =>
    ipcRenderer.invoke('scan-mod-for-fighters', modPath),

  scanModSlots: (modPath) => ipcRenderer.invoke('scan-mod-slots', modPath),
  scanModSlotsByFighter: (modPath, fighterId) =>
    ipcRenderer.invoke('scan-mod-slots-by-fighter', modPath, fighterId),
  getUsedSlotsForFighter: (modsPath, fighterId, excludeModPath = null) =>
    ipcRenderer.invoke(
      'get-used-slots-for-fighter',
      modsPath,
      fighterId,
      excludeModPath,
    ),
  applySlotChanges: (modPath, changes) =>
    ipcRenderer.invoke('apply-slot-changes', modPath, changes),
  detectConflicts: (modsPath, whitelistPatterns) =>
    ipcRenderer.invoke('detect-conflicts', modsPath, whitelistPatterns),

  openTutorialWindow: () => ipcRenderer.invoke('open-tutorial-window'),

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

  cancelDownload: (downloadId) =>
    ipcRenderer.invoke('cancel-download', downloadId),

  sendModsToSwitch: (config) =>
    ipcRenderer.invoke('send-mods-to-switch', config),

  installModFromPath: (sourcePath, modsPath) =>
    ipcRenderer.invoke('install-mod-from-path', sourcePath, modsPath),
  selectModFile: () => ipcRenderer.invoke('select-mod-file'),

  handleFilesDropped: (filePaths) =>
    ipcRenderer.invoke('handle-files-dropped', filePaths),

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
  getLogsPath: () => ipcRenderer.invoke('get-logs-path'),
  readLogFile: (filePath) => ipcRenderer.invoke('read-log-file', filePath),

  selectCustomFile: (fileType) =>
    ipcRenderer.invoke('select-custom-file', fileType),
  readCustomFile: (filePath) =>
    ipcRenderer.invoke('read-custom-file', filePath),

  clearTempFiles: () => ipcRenderer.invoke('clear-temp-files'),

  updateDiscordRPC: (data) => ipcRenderer.send('discord-rpc-update', data),

  confirmProtocolInstall: (url, downloadId) =>
    ipcRenderer.invoke('confirm-protocol-install', url, downloadId),
  cancelProtocolInstall: (downloadId) =>
    ipcRenderer.invoke('cancel-protocol-install', downloadId),

  fetchGameBananaPreview: (modId) =>
    ipcRenderer.invoke('fetch-gamebanana-preview', modId),

  onModInstallConfirmRequest: (callback) => {
    ipcRenderer.on('mod-install-confirm-request', (event, data) =>
      callback(data),
    );
  },

  launchEmulator: (emulatorType, emulatorPath, gamePath, fullscreen) =>
    ipcRenderer.invoke(
      'launch-emulator',
      emulatorType,
      emulatorPath,
      gamePath,
      fullscreen,
    ),

  loadLocale: (locale) => ipcRenderer.invoke('load-locale', locale),

  onStartIntroAnimation: (callback) =>
    ipcRenderer.on('start-intro-animation', (event, data) => callback(data)),

  getAvailableDrives: () => ipcRenderer.invoke('get-available-drives'),

  saveFileDialog: (defaultPath, filters) =>
    ipcRenderer.invoke('save-file-dialog', defaultPath, filters),
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('write-file', filePath, content),

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getUpdateInfo: () => ipcRenderer.invoke('get-update-info'),
  setAutoCheckEnabled: (enabled) =>
    ipcRenderer.invoke('set-auto-check-enabled', enabled),
  setUpdateChannel: (channel) =>
    ipcRenderer.invoke('set-update-channel', channel),
  getUpdateChannel: () => ipcRenderer.invoke('get-update-channel'),
  setForceUpdate: (enabled) => ipcRenderer.invoke('set-force-update', enabled),
  getForceUpdate: () => ipcRenderer.invoke('get-force-update'),
  simulateUpdate: () => ipcRenderer.invoke('simulate-update'),

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
});
