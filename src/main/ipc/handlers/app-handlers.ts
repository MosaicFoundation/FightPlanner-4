import { app, IpcMain } from 'electron';

export const appHandlerMap = {
  'get-app-version': 'getAppVersion',
} as const;

export const AppHandlers = {
  getAppVersion: async () => {
    return {
      version: app.getVersion(),
      name: app.getName(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
    };
  },
};

/**
 * Register all IPC handlers related to app operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerAppHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(appHandlerMap)) {
    ipcMain.handle(channel, (event, ...args) => {
      return AppHandlers[appHandlerMap[channel]].call(event, ...args);
    });
  }
}
