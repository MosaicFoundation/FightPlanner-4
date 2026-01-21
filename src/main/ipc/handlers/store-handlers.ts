import { IpcMain } from 'electron';
import store from '../../store';
import {
  createErrorResponse,
  ErrorCodes,
  handleError,
} from '../../utils/error-handler';

export const storeHandlerMap = {
  'store-get': 'get',
  'store-set': 'set',
  'store-delete': 'delete',
  'store-clear': 'clear',
} as const;

export const StoreHandlers = {
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      return store.get(key) as T;
    } catch (error) {
      handleError(error, 'store-get');
      return null;
    }
  },

  set: async (key: string, value: unknown) => {
    try {
      store.set(key, value);
      return { success: true };
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },

  delete: async (key: string) => {
    try {
      store.delete(key);
      return { success: true };
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },

  clear: async () => {
    try {
      store.clear();
      return { success: true };
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  },
};

/**
 * Register all IPC handlers related to store operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerStoreHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(storeHandlerMap)) {
    ipcMain.handle(channel, (event, ...args) => {
      return StoreHandlers[storeHandlerMap[channel]].call(event, ...args);
    });
  }
}
