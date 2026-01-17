import { ipcMain } from 'electron';
import store from '../../store';
import { createErrorResponse, ErrorCodes } from '../../utils/error-handler';

export function registerStoreHandlers(ipcMain) {
  ipcMain.handle('store-get', (event, key) => {
    try {
      return store.get(key);
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  });

  ipcMain.handle('store-set', (event, key, value) => {
    try {
      store.set(key, value);
      return { success: true };
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  });

  ipcMain.handle('store-delete', (event, key) => {
    try {
      store.delete(key);
      return { success: true };
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  });

  ipcMain.handle('store-clear', () => {
    try {
      store.clear();
      return { success: true };
    } catch (error) {
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  });
}
