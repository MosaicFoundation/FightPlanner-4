import { IpcMain } from 'electron';
import autoUpdater from '../../auto-updater';

export const updateHandlerMap = {
  'check-for-updates': 'checkForUpdates',
  'download-update': 'downloadUpdate',
  'install-update': 'installUpdate',
  'get-update-info': 'getUpdateInfo',
  'set-auto-check-enabled': 'setAutoCheckEnabled',
  'set-update-channel': 'setUpdateChannel',
  'get-update-channel': 'getUpdateChannel',
  'set-force-update': 'setForceUpdate',
  'get-force-update': 'getForceUpdate',
  'simulate-update': 'simulateUpdate',
} as const;

export const UpdateHandlers = {
  checkForUpdates: async () => {
    return await autoUpdater.checkForUpdates();
  },

  downloadUpdate: async () => {
    return await autoUpdater.downloadUpdate();
  },

  installUpdate: async () => {
    autoUpdater.quitAndInstall();
    return { success: true };
  },

  getUpdateInfo: async () => {
    return autoUpdater.getUpdateInfo();
  },

  setAutoCheckEnabled: async (enabled: boolean) => {
    autoUpdater.setAutoCheckEnabled(enabled);
    return { success: true };
  },

  setUpdateChannel: async (channel: string) => {
    autoUpdater.setUpdateChannel(channel);
    return { success: true };
  },

  getUpdateChannel: async () => {
    return autoUpdater.getUpdateChannel();
  },

  setForceUpdate: async (enabled: boolean) => {
    autoUpdater.setForceUpdateAvailable(enabled);
    return { success: true };
  },

  getForceUpdate: async () => {
    return autoUpdater.getForceUpdateAvailable();
  },

  simulateUpdate: async () => {
    return autoUpdater.simulateUpdate();
  },
};

/**
 * Register all IPC handlers related to update operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerUpdateHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(updateHandlerMap)) {
    ipcMain.handle(channel, (event, ...args) => {
      return UpdateHandlers[updateHandlerMap[channel]].call(event, ...args);
    });
  }
}
