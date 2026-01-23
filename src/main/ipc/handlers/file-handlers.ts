import { BrowserWindow, dialog, shell, IpcMain } from 'electron';
import * as fs from 'fs';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type FileHandlers = typeof FileHandlers;

const FileHandlers = {
  ['select-folder']: async (common: BaseHandlerArg) => {
    const win = BrowserWindow.fromWebContents(common.event.sender)!;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });

    return result.canceled ? null : result.filePaths[0];
  },

  ['select-emulator-file']: async (common: BaseHandlerArg) => {
    const win = BrowserWindow.fromWebContents(common.event.sender)!;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'Executable Files', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  },

  ['select-game-file']: async (common: BaseHandlerArg) => {
    const win = BrowserWindow.fromWebContents(common.event.sender)!;
    const result = await dialog.showOpenDialog(win, {
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
  },

  ['select-mod-file']: async (
    common: BaseHandlerArg,
  ): Promise<
    HandlerResponse<{
      filePath: string;
    }>
  > => {
    try {
      const win = BrowserWindow.fromWebContents(common.event.sender)!;
      const result = await dialog.showOpenDialog(win, {
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
  },

  ['select-custom-file']: async (
    common: BaseHandlerArg,
    fileType: string,
  ): Promise<
    HandlerResponse<{
      filePath: string;
    }>
  > => {
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
        return { success: false, canceled: true };
      }

      return {
        success: true,
        filePath: result.filePaths[0],
      };
    } catch (error) {
      handleError(error, 'select-custom-file');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['open-folder']: async (
    common: BaseHandlerArg,
    folderPath: string,
  ): Promise<HandlerResponse> => {
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
  },

  ['open-file']: async (common: BaseHandlerArg, filePath: string) => {
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
  },

  ['read-custom-file']: async (
    common: BaseHandlerArg,
    filePath: string,
  ): Promise<
    HandlerResponse<{
      content: string;
    }>
  > => {
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
  },

  ['save-file-dialog']: async (
    common: BaseHandlerArg,
    defaultPath: string,
    filters: any,
  ) => {
    try {
      const win = BrowserWindow.fromWebContents(common.event.sender)!;
      const result = await dialog.showSaveDialog(win, {
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
  },

  ['write-file']: async (
    common: BaseHandlerArg,
    filePath: string,
    content: string,
  ) => {
    try {
      fs.writeFileSync(filePath, content, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'write-file');
      return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, error.message);
    }
  },
} as const;

/**
 * Register all IPC handlers related to file operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerFileHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(FileHandlers) as Array<
    keyof typeof FileHandlers
  >) {
    const handler = FileHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
