import { BrowserWindow, IpcMain } from 'electron';
import IpcMainEvent = Electron.IpcMainEvent;

export const windowEventMap = {
  'minimize-window': 'minimizeWindow',
  'maximize-window': 'maximizeWindow',
  'close-window': 'closeWindow',
} as const;

export const WindowEvents = {
  minimizeWindow: (event: IpcMainEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    if (win) win.minimize();
  },

  maximizeWindow: (event: IpcMainEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  },

  closeWindow: (event: IpcMainEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)!;
    if (win) win.close();
  },
};

/**
 * Register all IPC event handlers related to window operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerWindowHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(windowEventMap)) {
    ipcMain.on(channel, (event) => {
      WindowEvents[windowEventMap[channel]](event);
    });
  }
}
