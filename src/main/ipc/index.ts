const { registerWindowHandlers } = require('./handlers/window-handlers');
const { registerFileHandlers } = require('./handlers/file-handlers');
const { registerModHandlers } = require('./handlers/mod-handlers');
const { registerPluginHandlers } = require('./handlers/plugin-handlers');
const { registerStoreHandlers } = require('./handlers/store-handlers');
const { registerSystemHandlers } = require('./handlers/system-handlers');
const { registerProtocolHandlers } = require('./handlers/protocol-handlers');
const { registerTutorialHandlers } = require('./handlers/tutorial-handlers');
const { registerMigrationHandlers } = require('./handlers/migration-handlers');
const { registerFtpHandlers } = require('./handlers/ftp-handlers');
const { registerDiscordHandlers } = require('./handlers/discord-handlers');
const { registerAppHandlers } = require('./handlers/app-handlers');
const { registerUpdateHandlers } = require('./handlers/update-handlers');

/**
 * Register all IPC handlers for the application
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 * @param {Object|null} discordRPC - Discord RPC manager instance (optional)
 */
function registerAllHandlers(ipcMain, discordRPC = null) {
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

module.exports = { registerAllHandlers };
