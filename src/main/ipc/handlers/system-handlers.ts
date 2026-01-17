const { app, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { getProtocolHandler } = require('../../main-protocol-setup');
const {
  handleError,
  createErrorResponse,
  ErrorCodes,
} = require('../../utils/error-handler');
const { PATHS, TEMP_FOLDERS } = require('../../config');

function registerSystemHandlers(ipcMain) {
  ipcMain.handle('open-url', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      handleError(error, 'open-url');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('open-fightplanner-link', async (event, url) => {
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
  });

  ipcMain.handle('cancel-download', async (event, downloadId) => {
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
  });

  ipcMain.handle('get-logs-path', () => {
    return PATHS.logsDir();
  });

  ipcMain.handle('read-log-file', async (event, filePath) => {
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
  });

  ipcMain.handle('clear-temp-files', async () => {
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
  });

  ipcMain.handle(
    'launch-emulator',
    async (event, emulatorType, emulatorPath, gamePath, fullscreen) => {
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
  );

  ipcMain.handle('load-locale', async (event, locale) => {
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
  });

  ipcMain.handle('get-available-drives', async () => {
    try {
      const { detectDrives } = require('../../utils/drive-detector');
      const drives = await detectDrives();
      return { success: true, drives };
    } catch (error) {
      handleError(error, 'get-available-drives');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });
}

module.exports = { registerSystemHandlers };
