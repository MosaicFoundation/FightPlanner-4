import { BrowserWindow, IpcMain, dialog } from 'electron';
import {
  createTutorialWindow,
  closeTutorialWindow,
} from '../../tutorial-window';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import {
  detectWindowsDrives,
  isSwitchSdCard,
} from '../../utils/drive-detector';
import {
  getLatestArcropolisRelease,
  getLatestSkylineRelease,
  downloadArcropolis,
  extractAndInstallArcropolis,
  extractAndInstallSkyline,
  checkArcropolisInstalled,
  checkArcropolisFolder,
  createDirectory,
} from '../../utils/arcropolis-installer';

import IpcMainEvent = Electron.IpcMainEvent;
import { HandlerResponse } from '../../types/common';

export const tutorialHandlerMap = {
  'open-tutorial-window': 'openTutorialWindow',
  'detect-sd-drives': 'detectSdDrives',
  'detect-yuzu-path': 'detectYuzuPath',
  'detect-ryujinx-path': 'detectRyujinxPath',
  'get-github-release': 'getGithubRelease',
  'get-skyline-release': 'getSkylineRelease',
  'extract-skyline': 'extractSkyline',
  'download-arcropolis': 'downloadArcropolis',
  'extract-arcropolis': 'extractArcropolis',
  'create-directory': 'createDirectory',
  'check-arcropolis-installed': 'checkArcropolisInstalled',
  'check-arcropolis-folder': 'checkArcropolisFolder',
  'join-path': 'joinPath',
  'get-temp-dir': 'getTempDir',
  'select-drive': 'selectDrive',
} as const;

export const tutorialEventMap = {
  'close-tutorial-window': 'closeTutorialWindow',
  'skip-tutorial': 'skipTutorial',
} as const;

export const TutorialHandlers = {
  async openTutorialWindow() {
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
  },

  async detectSdDrives() {
    try {
      const drives = await detectWindowsDrives();
      return { success: true, drives };
    } catch (error) {
      handleError(error, 'detect-sd-drives');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async detectYuzuPath() {
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
  },

  async detectRyujinxPath() {
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
  },

  async getGithubRelease(repo = 'Raytwo/ARCropolis') {
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

  async getSkylineRelease(): HandlerResponse<{
    tag: string;
    downloadUrl: string;
    version: string;
    name: string;
  }> {
    try {
      return { success: true, ...(await getLatestSkylineRelease()) };
    } catch (error) {
      handleError(error, 'get-skyline-release');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async extractSkyline(zipPath: string, targetDir: string) {
    try {
      return await extractAndInstallSkyline(zipPath, targetDir);
    } catch (error) {
      handleError(error, 'extract-skyline');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async downloadArcropolis(
    downloadUrl: string,
    targetPath: string,
  ): HandlerResponse<{ path: string }> {
    try {
      const downloadedPath = await downloadArcropolis(downloadUrl, targetPath);
      return { success: true, path: downloadedPath };
    } catch (error) {
      handleError(error, 'download-arcropolis');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async extractArcropolis(zipPath: string, targetDir: string) {
    try {
      return await extractAndInstallArcropolis(zipPath, targetDir);
    } catch (error) {
      handleError(error, 'extract-arcropolis');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async createDirectory(dirPath: string): HandlerResponse {
    try {
      await createDirectory(dirPath);
      return { success: true };
    } catch (error) {
      handleError(error, 'create-directory');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async checkArcropolisInstalled(targetDir: string) {
    try {
      const installed = checkArcropolisInstalled(targetDir);
      return { success: true, installed };
    } catch (error) {
      handleError(error, 'check-arcropolis-installed');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async checkArcropolisFolder(ultimatePath: string) {
    try {
      const exists = checkArcropolisFolder(ultimatePath);
      return { success: true, exists };
    } catch (error) {
      handleError(error, 'check-arcropolis-folder');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async joinPath(...parts: string[]): HandlerResponse<{
    path: string;
  }> {
    try {
      const path = require('path');
      return { success: true, path: path.join(...parts) };
    } catch (error) {
      handleError(error, 'join-path');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async getTempDir(): HandlerResponse<{
    path: string;
  }> {
    try {
      const os = require('os');
      return { success: true, path: os.tmpdir() };
    } catch (error) {
      handleError(error, 'get-temp-dir');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  async selectDrive() {
    try {
      const win = BrowserWindow.fromWebContents(this.sender)!;

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
  },
};

export const TutorialEvents = {
  closeTutorialWindow: (_event: IpcMainEvent) => {
    console.log('Received close-tutorial-window event');
    closeTutorialWindow();
  },

  skipTutorial: (_event: IpcMainEvent) => {
    console.log('Received skip-tutorial event');
    closeTutorialWindow();
  },
};

/**
 * Register all IPC handlers related to tutorial operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerTutorialHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(tutorialHandlerMap)) {
    ipcMain.handle(channel, (event, ...args) => {
      return TutorialHandlers[tutorialHandlerMap[channel]](event, ...args);
    });
  }

  for (const channel of Object.keys(tutorialEventMap)) {
    ipcMain.on(channel, (event, ...args) => {
      TutorialEvents[tutorialEventMap[channel]].call(event, ...args);
    });
  }
}
