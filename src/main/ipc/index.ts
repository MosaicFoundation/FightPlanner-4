import { IpcMain } from 'electron';
import { registerWindowHandlers } from './handlers/window-handlers';
import { registerFileHandlers } from './handlers/file-handlers';
import { registerModHandlers } from './handlers/mod-handlers';
import { registerPluginHandlers } from './handlers/plugin-handlers';
import { registerStoreHandlers } from './handlers/store-handlers';
import { registerSystemHandlers } from './handlers/system-handlers';
import { registerProtocolHandlers } from './handlers/protocol-handlers';
import { registerTutorialHandlers } from './handlers/tutorial-handlers';
import { registerMigrationHandlers } from './handlers/migration-handlers';
import { registerFtpHandlers } from './handlers/ftp-handlers';
import { registerDiscordHandlers } from './handlers/discord-handlers';
import { registerAppHandlers } from './handlers/app-handlers';
import { registerUpdateHandlers } from './handlers/update-handlers';
import DiscordRPCManager from '../discord-rpc';

/**
 * Register all IPC handlers for the application
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 * @param {Object|null} discordRPC - Discord RPC manager instance (optional)
 */
export function registerAllHandlers(
  ipcMain: IpcMain,
  discordRPC: DiscordRPCManager | null = null,
) {
  registerWindowHandlers(ipcMain);
  registerFileHandlers(ipcMain);
  registerModHandlers(ipcMain);
  registerPluginHandlers(ipcMain);
  registerStoreHandlers(ipcMain);
  registerSystemHandlers(ipcMain);
  registerProtocolHandlers(ipcMain);
  registerTutorialHandlers(ipcMain);
  registerMigrationHandlers(ipcMain);
  registerFtpHandlers(ipcMain);
  registerDiscordHandlers(ipcMain, discordRPC);
  registerAppHandlers(ipcMain);
  registerUpdateHandlers(ipcMain);
}
