const { BrowserWindow, ipcMain, dialog } = require('electron');
const {
  createTutorialWindow,
  closeTutorialWindow,
} = require('../../tutorial-window');
const {
  handleError,
  createErrorResponse,
  ErrorCodes,
} = require('../../utils/error-handler');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  detectWindowsDrives,
  isSwitchSdCard,
} = require('../../utils/drive-detector');
const {
  getLatestArcropolisRelease,
  getLatestSkylineRelease,
  downloadArcropolis,
  extractAndInstallArcropolis,
  extractAndInstallSkyline,
  checkArcropolisInstalled,
  checkArcropolisFolder,
  createDirectory,
} = require('../../utils/arcropolis-installer');

function registerTutorialHandlers(ipcMain) {
  ipcMain.handle('open-tutorial-window', async () => {
    try {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows[0];
      createTutorialWindow(mainWindow || null);
      return { success: true };
    } catch (error) {
      handleError(error, 'open-tutorial-window');
      return createErrorResponse(
        ErrorCodes.TUTORIAL_WINDOW_ERROR,
        error.message,
      );
    }
  });

  ipcMain.on('close-tutorial-window', () => {
    console.log('Received close-tutorial-window event');
    closeTutorialWindow();
  });

  ipcMain.on('skip-tutorial', () => {
    console.log('Received skip-tutorial event');
    closeTutorialWindow();
  });

  // ARCropolis installation handlers
  ipcMain.handle('detect-sd-drives', async () => {
    try {
      const drives = await detectWindowsDrives();
      return { success: true, drives };
    } catch (error) {
      handleError(error, 'detect-sd-drives');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('detect-yuzu-path', async () => {
    try {
      const homeDir = os.homedir();
      const yuzuPath = path.join(homeDir, 'AppData', 'Roaming', 'yuzu');

      if (fs.existsSync(yuzuPath)) {
        return { success: true, path: yuzuPath };
      }

      return { success: false, path: null };
    } catch (error) {
      handleError(error, 'detect-yuzu-path');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('detect-ryujinx-path', async () => {
    try {
      const homeDir = os.homedir();
      const ryujinxPath = path.join(homeDir, 'AppData', 'Roaming', 'Ryujinx');

      if (fs.existsSync(ryujinxPath)) {
        return { success: true, path: ryujinxPath };
      }

      return { success: false, path: null };
    } catch (error) {
      handleError(error, 'detect-ryujinx-path');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle(
    'get-github-release',
    async (event, repo = 'Raytwo/ARCropolis') => {
      try {
        let release;
        if (repo === 'skyline-dev/skyline') {
          release = await getLatestSkylineRelease();
        } else {
          release = await getLatestArcropolisRelease();
        }
        return { success: true, ...release };
      } catch (error) {
        handleError(error, 'get-github-release');
        return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
      }
    },
  );

  ipcMain.handle('get-skyline-release', async () => {
    try {
      const release = await getLatestSkylineRelease();
      return { success: true, ...release };
    } catch (error) {
      handleError(error, 'get-skyline-release');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('extract-skyline', async (event, zipPath, targetDir) => {
    try {
      const result = await extractAndInstallSkyline(zipPath, targetDir);
      return { success: true, ...result };
    } catch (error) {
      handleError(error, 'extract-skyline');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle(
    'download-arcropolis',
    async (event, downloadUrl, targetPath) => {
      try {
        const downloadedPath = await downloadArcropolis(
          downloadUrl,
          targetPath,
        );
        return { success: true, path: downloadedPath };
      } catch (error) {
        handleError(error, 'download-arcropolis');
        return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
      }
    },
  );

  ipcMain.handle('extract-arcropolis', async (event, zipPath, targetDir) => {
    try {
      const result = await extractAndInstallArcropolis(zipPath, targetDir);
      return { success: true, ...result };
    } catch (error) {
      handleError(error, 'extract-arcropolis');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('create-directory', async (event, dirPath) => {
    try {
      await createDirectory(dirPath);
      return { success: true };
    } catch (error) {
      handleError(error, 'create-directory');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('check-arcropolis-installed', async (event, targetDir) => {
    try {
      const installed = checkArcropolisInstalled(targetDir);
      return { success: true, installed };
    } catch (error) {
      handleError(error, 'check-arcropolis-installed');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('check-arcropolis-folder', async (event, ultimatePath) => {
    try {
      const exists = checkArcropolisFolder(ultimatePath);
      return { success: true, exists };
    } catch (error) {
      handleError(error, 'check-arcropolis-folder');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('join-path', async (event, ...parts) => {
    try {
      const path = require('path');
      return { success: true, path: path.join(...parts) };
    } catch (error) {
      handleError(error, 'join-path');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('get-temp-dir', async () => {
    try {
      const os = require('os');
      return { success: true, path: os.tmpdir() };
    } catch (error) {
      handleError(error, 'get-temp-dir');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });

  ipcMain.handle('select-drive', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const drives = await detectWindowsDrives();

      // Show custom dialog or use file picker
      const result = await dialog.showOpenDialog(win, {
        title: 'Select SD Card Drive',
        properties: ['openDirectory'],
        message: 'Please select your Nintendo Switch SD card drive',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const selectedPath = result.filePaths[0];
      const isSwitch = isSwitchSdCard(selectedPath);

      return {
        success: true,
        path: selectedPath,
        isSwitchCard: isSwitch,
      };
    } catch (error) {
      handleError(error, 'select-drive');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  });
}

module.exports = { registerTutorialHandlers };
