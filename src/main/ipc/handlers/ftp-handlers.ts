import { IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import FTPClient from '../../ftp-client';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';
import { AppHandlers } from './app-handlers';

interface TransferItem {
  localModPath: string;
  modName: string;
  fileCount: number;
}

interface FtpTransferProgressPayload {
  status: 'uploading';
  currentMod: number;
  totalMods: number;
  transferredCount: number;
  totalFiles: number;
  progress: number;
  currentModName?: string;
  currentFileName?: string;
}

/**
 * Copy directory recursively
 */
function _copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = stats && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    fs.readdirSync(src).forEach((childItemName) => {
      _copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function _countFilesRecursive(dirPath: string): number {
  let count = 0;
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    if (fs.statSync(itemPath).isDirectory()) {
      count += _countFilesRecursive(itemPath);
    } else {
      count++;
    }
  }

  return count;
}

/**
 * Send mods to Switch via local drive.
 */
async function _sendModsToDrive(config: Config) {
  try {
    const driveIdentifier = config.switchDriveLetter;
    if (!driveIdentifier) {
      throw new Error('Drive not specified');
    }

    let drivePath;
    if (
      driveIdentifier.includes(':\\') ||
      (driveIdentifier.length === 1 && /^[A-Z]$/i.test(driveIdentifier))
    ) {
      if (driveIdentifier.length === 1) {
        drivePath = `${driveIdentifier}:\\`;
      } else {
        drivePath = driveIdentifier;
      }
    } else if (driveIdentifier.startsWith('/')) {
      drivePath = driveIdentifier;
    } else {
      if (process.platform === 'linux') {
        drivePath = `/media/${process.env.USER || 'user'}/${driveIdentifier}`;
      } else if (process.platform === 'darwin') {
        drivePath = `/Volumes/${driveIdentifier}`;
      } else {
        drivePath = driveIdentifier;
      }
    }

    if (!fs.existsSync(drivePath)) {
      throw new Error(`Drive path ${drivePath} not found or not accessible`);
    }

    const targetBasePath = path.join(drivePath, 'ultimate', 'mods');

    if (!fs.existsSync(targetBasePath)) {
      fs.mkdirSync(targetBasePath, { recursive: true });
      console.log(`Created directory: ${targetBasePath}`);
    }

    let transferredCount = 0;

    if (config.recentDownloads && config.recentDownloads.length > 0) {
      for (const download of config.recentDownloads) {
        try {
          let localModPath: string | null = null;

          if (download.folderPath && fs.existsSync(download.folderPath)) {
            localModPath = download.folderPath;
          } else {
            const modFolderName = download.modName || download.id;
            localModPath = path.join(config.modsPath, modFolderName);
          }

          if (
            localModPath &&
            fs.existsSync(localModPath) &&
            fs.statSync(localModPath).isDirectory()
          ) {
            const targetModPath = path.join(
              targetBasePath,
              path.basename(localModPath),
            );

            if (fs.existsSync(targetModPath)) {
              fs.rmSync(targetModPath, {
                recursive: true,
                force: true,
              });
            }

            _copyRecursiveSync(localModPath, targetModPath);

            // Count files transferred
            const countFiles = (dir) => {
              let count = 0;
              const items = fs.readdirSync(dir);
              for (const item of items) {
                const itemPath = path.join(dir, item);
                if (fs.statSync(itemPath).isDirectory()) {
                  count += countFiles(itemPath);
                } else {
                  count++;
                }
              }
              return count;
            };

            const fileCount = countFiles(targetModPath);
            transferredCount += fileCount;
            console.log(
              `Successfully copied mod: ${path.basename(localModPath)} (${fileCount} files)`,
            );
          } else {
            console.warn(`Mod folder not found: ${localModPath}`);
          }
        } catch (modError) {
          console.error(`Error copying mod ${download.modName}:`, modError);
        }
      }
    } else {
      if (fs.existsSync(config.modsPath)) {
        const files = fs.readdirSync(config.modsPath);

        for (const file of files) {
          const localModPath = path.join(config.modsPath, file);

          if (fs.statSync(localModPath).isDirectory()) {
            const targetModPath = path.join(targetBasePath, file);

            if (fs.existsSync(targetModPath)) {
              fs.rmSync(targetModPath, {
                recursive: true,
                force: true,
              });
            }

            _copyRecursiveSync(localModPath, targetModPath);

            const countFiles = (dir) => {
              let count = 0;
              const items = fs.readdirSync(dir);
              for (const item of items) {
                const itemPath = path.join(dir, item);
                if (fs.statSync(itemPath).isDirectory()) {
                  count += countFiles(itemPath);
                } else {
                  count++;
                }
              }
              return count;
            };

            const fileCount = countFiles(targetModPath);
            transferredCount += fileCount;
            console.log(
              `Successfully copied mod: ${file} (${fileCount} files)`,
            );
          }
        }
      }
    }

    console.log(
      `Successfully transferred ${transferredCount} files to drive ${config.switchDriveLetter}:`,
    );
    return { success: true, transferredCount };
  } catch (error) {
    handleError(error, 'send-mods-to-drive');
    return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, error.message);
  }
}

export type FtpHandlers = typeof FtpHandlers;

export interface Config {
  switchIp: string;
  switchPort: number;
  switchFtpPath: string;
  switchDriveLetter: string;
  switchTransferMethod: 'ftp' | 'drive';
  modsPath: string;
  recentDownloads: Array<{
    id: string;
    modName: string;
    folderPath: string | null;
  }>;
}

const FtpHandlers = {
  ['send-mods-to-switch']: async (
    common: BaseHandlerArg,
    config: Config,
  ): HandlerResponse<{
    transferredCount: number;
  }> => {
    const transferMethod = config.switchTransferMethod || 'ftp';

    if (transferMethod === 'drive') {
      return await _sendModsToDrive(config);
    }

    const ftpClient = new FTPClient();
    let transferredCount = 0;

    try {
      let remoteBasePath = (config.switchFtpPath || '/switch').replace(
        /\\/g,
        '/',
      );
      if (!remoteBasePath.startsWith('/')) {
        remoteBasePath = '/' + remoteBasePath;
      }

      const transferItems: TransferItem[] = [];

      if (config.recentDownloads && config.recentDownloads.length > 0) {
        for (const download of config.recentDownloads) {
          let localModPath: string | null = null;

          if (download.folderPath && fs.existsSync(download.folderPath)) {
            localModPath = download.folderPath;
          } else {
            const modFolderName = download.modName || download.id;
            localModPath = path.join(config.modsPath, modFolderName);
          }

          if (
            localModPath &&
            fs.existsSync(localModPath) &&
            fs.statSync(localModPath).isDirectory()
          ) {
            transferItems.push({
              localModPath,
              modName: path.basename(localModPath),
              fileCount: _countFilesRecursive(localModPath),
            });
          } else {
            console.warn(`Mod folder not found: ${localModPath}`);
          }
        }
      } else if (fs.existsSync(config.modsPath)) {
        const files = fs.readdirSync(config.modsPath);
        for (const file of files) {
          const localModPath = path.join(config.modsPath, file);
          if (fs.statSync(localModPath).isDirectory()) {
            transferItems.push({
              localModPath,
              modName: file,
              fileCount: _countFilesRecursive(localModPath),
            });
          }
        }
      }

      const totalMods = transferItems.length;
      const totalFiles = transferItems.reduce(
        (sum, item) => sum + item.fileCount,
        0,
      );
      const sendProgress = (payload: FtpTransferProgressPayload) => {
        common.event.sender.send('ftp-transfer-progress', payload);
      };

      console.log('Starting FTP transfer to Switch:', {
        ip: config.switchIp,
        port: config.switchPort,
        remotePath: remoteBasePath,
      });

      await ftpClient.connect(config.switchIp, config.switchPort);

      if (totalMods > 0) {
        sendProgress({
          status: 'uploading',
          currentMod: 1,
          totalMods,
          transferredCount: 0,
          totalFiles,
          progress: 0,
          currentModName: transferItems[0].modName,
        });
      }

      for (const [index, item] of transferItems.entries()) {
        try {
          const remoteModPath = `${remoteBasePath}/${path.basename(item.localModPath)}`;

          sendProgress({
            status: 'uploading',
            currentMod: index + 1,
            totalMods,
            transferredCount,
            totalFiles,
            progress:
              totalFiles > 0
                ? Math.min(
                    100,
                    Math.round((transferredCount / totalFiles) * 100),
                  )
                : 0,
            currentModName: item.modName,
          });

          const count = await ftpClient.uploadDirectory(
            item.localModPath,
            remoteModPath,
            {
              baseTransferredCount: transferredCount,
              totalFiles,
              currentModIndex: index + 1,
              totalMods,
              currentModName: item.modName,
              onFileUploaded: (progressUpdate) => {
                sendProgress({
                  status: 'uploading',
                  currentMod: progressUpdate.currentModIndex || index + 1,
                  totalMods: progressUpdate.totalMods || totalMods,
                  transferredCount: progressUpdate.transferredCount,
                  totalFiles: progressUpdate.totalFiles || totalFiles,
                  progress: progressUpdate.progress,
                  currentModName: progressUpdate.currentModName || item.modName,
                  currentFileName: progressUpdate.currentFileName,
                });
              },
            },
          );

          transferredCount += count;
          console.log(
            `Successfully sent mod: ${path.basename(item.localModPath)} (${count} files)`,
          );
        } catch (modError) {
          console.error(`Error sending mod ${item.modName}:`, modError);
        }
      }

      if (totalMods > 0) {
        sendProgress({
          status: 'uploading',
          currentMod: totalMods,
          totalMods,
          transferredCount,
          totalFiles,
          progress: totalFiles > 0 ? 100 : 0,
          currentModName: transferItems[totalMods - 1].modName,
        });
      }

      await ftpClient.disconnect();

      console.log(
        `Successfully transferred ${transferredCount} files to Switch`,
      );
      return { success: true, transferredCount };
    } catch (error) {
      handleError(error, 'send-mods-to-switch');
      try {
        await ftpClient.disconnect();
      } catch (disconnectError) {}
      return createErrorResponse(ErrorCodes.FTP_TRANSFER_ERROR, error.message);
    }
  },
} as const;

/**
 * Register all IPC handlers related to FTP operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerFtpHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(FtpHandlers) as Array<
    keyof typeof FtpHandlers
  >) {
    const handler = FtpHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
