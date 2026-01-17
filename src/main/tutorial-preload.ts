const { contextBridge, ipcRenderer } = require('electron');

console.log('Tutorial preload.js loaded!');

contextBridge.exposeInMainWorld('tutorialAPI', {
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
  getMigrationStatus: () => ipcRenderer.invoke('get-migration-status'),
  onAnimationComplete: (callback) =>
    ipcRenderer.on('animation-complete', callback),

  // Settings & File System
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveSetting: (key, value) => ipcRenderer.invoke('store-set', key, value),
  getSetting: (key) => ipcRenderer.invoke('store-get', key),

  // ARCropolis Installation
  detectSdDrives: () => ipcRenderer.invoke('detect-sd-drives'),
  detectYuzuPath: () => ipcRenderer.invoke('detect-yuzu-path'),
  detectRyujinxPath: () => ipcRenderer.invoke('detect-ryujinx-path'),
  getGithubRelease: (repo) => ipcRenderer.invoke('get-github-release', repo),
  getSkylineRelease: () => ipcRenderer.invoke('get-skyline-release'),
  downloadArcropolis: (url, targetPath) =>
    ipcRenderer.invoke('download-arcropolis', url, targetPath),
  extractArcropolis: (zipPath, targetDir) =>
    ipcRenderer.invoke('extract-arcropolis', zipPath, targetDir),
  extractSkyline: (zipPath, targetDir) =>
    ipcRenderer.invoke('extract-skyline', zipPath, targetDir),
  createDirectory: (dirPath) => ipcRenderer.invoke('create-directory', dirPath),
  checkArcropolisInstalled: (targetDir) =>
    ipcRenderer.invoke('check-arcropolis-installed', targetDir),
  checkArcropolisFolder: (ultimatePath) =>
    ipcRenderer.invoke('check-arcropolis-folder', ultimatePath),
  selectDrive: () => ipcRenderer.invoke('select-drive'),
  joinPath: (...parts) => ipcRenderer.invoke('join-path', ...parts),
  getTempDir: () => ipcRenderer.invoke('get-temp-dir'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
});

console.log('tutorialAPI exposed to window');
