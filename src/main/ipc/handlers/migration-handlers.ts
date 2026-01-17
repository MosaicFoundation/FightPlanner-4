import { ipcMain } from 'electron';
import { getMigrationStatus } from '../../migration';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';

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
