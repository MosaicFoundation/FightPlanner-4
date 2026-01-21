import { IpcMain } from 'electron';
import { getMigrationStatus } from '../../migration';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';

export const migrationHandlerMap = {
  'get-migration-status': 'getMigrationStatus',
} as const;

export const MigrationHandlers = {
  getMigrationStatus: async (): HandlerResponse<{
    completed: boolean | null;
    from: string | null;
    date: string | null;
  }> => {
    try {
      const status = await getMigrationStatus();
      return { success: true, ...status };
    } catch (error) {
      handleError(error, 'get-migration-status');
      return createErrorResponse(ErrorCodes.MIGRATION_ERROR, error.message);
    }
  },
};

/**
 * Register all IPC handlers related to migration operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerMigrationHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(migrationHandlerMap)) {
    ipcMain.handle(channel, (event, ...args) => {
      return MigrationHandlers[migrationHandlerMap[channel]].bind(event)(
        ...args,
      );
    });
  }
}
