const { app, ipcMain } = require('electron');

export function registerAppHandlers(ipcMain) {
  ipcMain.handle('get-app-version', () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
    };
  });
}