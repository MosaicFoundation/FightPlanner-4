const { ipcMain } = require('electron');
const { getMigrationStatus } = require('../../migration');
const {
  handleError,
  createErrorResponse,
  ErrorCodes,
} = require('../../utils/error-handler');

export function registerMigrationHandlers(ipcMain) {
  ipcMain.handle('get-migration-status', async () => {
    try {
      const status = await getMigrationStatus();
      return { success: true, ...status };
    } catch (error) {
      handleError(error, 'get-migration-status');
      return createErrorResponse(ErrorCodes.MIGRATION_ERROR, error.message);
    }
  });
}