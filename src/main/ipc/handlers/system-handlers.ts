import { shell, IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getProtocolHandler } from '../../main-protocol-setup';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { PATHS, TEMP_FOLDERS } from '../../config';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type SystemHandlers = typeof SystemHandlers;

const SystemHandlers = {
  ['open-url']: async (common: BaseHandlerArg, url: string) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      handleError(error, 'open-url');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['open-fightplanner-link']: async (common: BaseHandlerArg, url: string) => {
    try {
      if (!url || !url.startsWith('fightplanner:')) {
        return createErrorResponse(
          ErrorCodes.INVALID_PROTOCOL_LINK,
          'Invalid fightplanner link',
        );
      }
      const handler = getProtocolHandler();
      if (handler) {
        handler.handleDeepLink(url);
        return { success: true };
      } else {
        return createErrorResponse(
          ErrorCodes.PROTOCOL_HANDLER_NOT_INITIALIZED,
          'Protocol handler not initialized',
        );
      }
    } catch (error) {
      handleError(error, 'open-fightplanner-link');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['cancel-download']: async (common: BaseHandlerArg, downloadId: string) => {
    try {
      const handler = getProtocolHandler();
      if (handler) {
        return handler.cancelDownload(downloadId);
      } else {
        return createErrorResponse(
          ErrorCodes.PROTOCOL_HANDLER_NOT_INITIALIZED,
          'Protocol handler not initialized',
        );
      }
    } catch (error) {
      handleError(error, 'cancel-download');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['get-logs-path']: async (common: BaseHandlerArg) => {
    return PATHS.logsDir();
  },

  ['read-log-file']: async (common: BaseHandlerArg, filePath: string) => {
    try {
      const logsDir = PATHS.logsDir();
      if (!filePath.startsWith(logsDir)) {
        throw new Error('Invalid log file path');
      }
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } catch (error) {
      handleError(error, 'read-log-file');
      return createErrorResponse(ErrorCodes.FILE_READ_ERROR, error.message);
    }
  },

  ['clear-temp-files']: async (
    common: BaseHandlerArg,
  ): HandlerResponse<{
    deletedFiles: number;
    deletedFolders: number;
    totalSize: string;
  }> => {
    try {
      const tempPath = PATHS.tempDir();
      const foldersToClean = TEMP_FOLDERS;

      let deletedFiles = 0;
      let deletedFolders = 0;
      let totalSize = 0;

      for (const folderName of foldersToClean) {
        const folderPath = path.join(tempPath, folderName);

        if (fs.existsSync(folderPath)) {
          const calculateSize = (dirPath) => {
            let size = 0;
            try {
              const items = fs.readdirSync(dirPath);
              for (const item of items) {
                const itemPath = path.join(dirPath, item);
                const stats = fs.statSync(itemPath);
                if (stats.isDirectory()) {
                  size += calculateSize(itemPath);
                  deletedFolders++;
                } else {
                  size += stats.size;
                  deletedFiles++;
                }
              }
            } catch (err) {
              console.warn('Error calculating size:', err);
            }
            return size;
          };

          totalSize += calculateSize(folderPath);

          try {
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`Cleaned temporary folder: ${folderPath}`);
          } catch (err) {
            console.warn(`Failed to delete ${folderPath}:`, err.message);
          }
        }
      }

      const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

      return {
        success: true,
        deletedFiles,
        deletedFolders,
        totalSize: sizeMB,
      };
    } catch (error) {
      handleError(error, 'clear-temp-files');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['launch-emulator']: async (
    common: BaseHandlerArg,
    emulatorType: string,
    emulatorPath: string,
    gamePath: string,
    fullscreen: boolean,
  ): HandlerResponse => {
    try {
      if (!fs.existsSync(emulatorPath)) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'Emulator not found at specified path',
        );
      }

      if (!fs.existsSync(gamePath)) {
        return createErrorResponse(
          ErrorCodes.FILE_NOT_FOUND,
          'Game file not found at specified path',
        );
      }

      console.log('Launching emulator:', emulatorType);
      console.log('Emulator path:', emulatorPath);
      console.log('With game:', gamePath);
      console.log('Fullscreen:', fullscreen);

      let args;
      if (emulatorType === 'yuzu') {
        args = fullscreen ? ['-f', '-g', gamePath] : ['-g', gamePath];
      } else {
        args = ['-g', gamePath];
      }

      const emulatorProcess = spawn(emulatorPath, args, {
        detached: true,
        stdio: 'ignore',
      });

      emulatorProcess.unref();

      console.log('Emulator launched successfully with args:', args);
      return { success: true };
    } catch (error) {
      handleError(error, 'launch-emulator');
      return createErrorResponse(
        ErrorCodes.EMULATOR_LAUNCH_ERROR,
        error.message,
      );
    }
  },

  ['load-locale']: async (
    common: BaseHandlerArg,
    locale: string,
  ): HandlerResponse<{
    translations: Record<string, string>;
  }> => {
    try {
      const localesPath = PATHS.localesDir();
      const localePath = path.join(localesPath, `${locale}.json`);

      if (!fs.existsSync(localePath)) {
        console.warn(
          `Locale file not found: ${localePath}, falling back to English`,
        );
        const enPath = path.join(localesPath, 'en.json');
        if (fs.existsSync(enPath)) {
          const content = fs.readFileSync(enPath, 'utf8');
          return { success: true, translations: JSON.parse(content) };
        }
        return createErrorResponse(
          ErrorCodes.LOCALE_LOAD_ERROR,
          'Locale file not found',
        );
      }

      const content = fs.readFileSync(localePath, 'utf8');
      const translations = JSON.parse(content);
      console.log(`Locale loaded successfully: ${locale}`);
      return { success: true, translations };
    } catch (error) {
      handleError(error, 'load-locale');
      return createErrorResponse(ErrorCodes.LOCALE_LOAD_ERROR, error.message);
    }
  },

  ['get-available-drives']: async (common: BaseHandlerArg) => {
    try {
      const { detectDrives } = require('../../utils/drive-detector');
      const drives = await detectDrives();
      return { success: true, drives };
    } catch (error) {
      handleError(error, 'get-available-drives');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },
} as const;

/**
 * Register all IPC handlers related to system operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerSystemHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(SystemHandlers)) {
    const handler = SystemHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
