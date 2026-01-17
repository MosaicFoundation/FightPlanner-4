import { BrowserWindow, dialog, shell, ipcMain } from 'electron';
import * as fs from 'fs';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';

export function registerFileHandlers(ipcMain) {
  ipcMain.handle('select-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('select-emulator-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        { name: 'Executable Files', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('select-game-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        {
          name: 'Game Files',
          extensions: ['xci', 'nsp', 'nca', 'nsz'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('select-mod-file', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [
          {
            name: 'Archive Files',
            extensions: ['zip', 'rar', '7z', 'tar', 'gz'],
          },
          { name: 'ZIP Files', extensions: ['zip'] },
          { name: 'RAR Files', extensions: ['rar'] },
          { name: '7Z Files', extensions: ['7z'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { success: true, filePath: result.filePaths[0] };
    } catch (error) {
      handleError(error, 'select-mod-file');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  });

  ipcMain.handle('select-custom-file', async (event, fileType) => {
    try {
      const filters =
        fileType === 'css'
          ? [{ name: 'CSS Files', extensions: ['css'] }]
          : [{ name: 'JavaScript Files', extensions: ['js'] }];

      const result = await dialog.showOpenDialog({
        title: `Select Custom ${fileType.toUpperCase()} File`,
        properties: ['openFile'],
        filters: filters,
      });

      if (result.canceled) {
        return { canceled: true };
      }

      return {
        success: true,
        filePath: result.filePaths[0],
        canceled: false,
      };
    } catch (error) {
      handleError(error, 'select-custom-file');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  });

  ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
      if (fs.existsSync(folderPath)) {
        await shell.openPath(folderPath);
        return { success: true };
      } else {
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          'Folder does not exist',
        );
      }
    } catch (error) {
      handleError(error, 'open-folder');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('open-file', async (event, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        await shell.openPath(filePath);
        return { success: true };
      } else {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'File does not exist',
        );
      }
    } catch (error) {
      handleError(error, 'open-file');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('read-custom-file', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'File does not exist',
        );
      }

      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } catch (error) {
      handleError(error, 'read-custom-file');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  });

  ipcMain.handle('save-file-dialog', async (event, defaultPath, filters) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: defaultPath,
        filters: filters || [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled) {
        return { success: false, canceled: true };
      }

      return { success: true, filePath: result.filePath };
    } catch (error) {
      handleError(error, 'save-file-dialog');
      return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, error.message);
    }
  });

  ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'write-file');
      return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, error.message);
    }
  });
}
