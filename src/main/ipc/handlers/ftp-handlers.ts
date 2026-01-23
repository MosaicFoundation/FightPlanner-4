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

/**
 * Send mods to Switch via local drive.
 */
async function _sendModsToDrive(config) {
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

    if (config.recentMods && config.recentMods.length > 0) {
      for (const mod of config.recentMods) {
        try {
          let localModPath: string | null = null;
          if (mod.folderPath && fs.existsSync(mod.folderPath)) {
            localModPath = mod.folderPath;
          } else {
            const modFolderName = mod.modName || mod.id;
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
          console.error(`Error copying mod ${mod.modName}:`, modError);
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

const FtpHandlers = {
  ['send-mods-to-switch']: async (
    common: BaseHandlerArg,
    config: {
      switchIp: string;
      switchPort: number;
      switchFtpPath: string;
      switchDriveLetter: string;
      switchTransferMethod: 'ftp' | 'drive';
      modsPath: string;
      recentMods: Array<{
        id: string;
        modName?: string;
        folderPath?: string;
      }>;
    },
  ): Promise<
    HandlerResponse<{
      transferredCount: number;
    }>
  > => {
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

      console.log('Starting FTP transfer to Switch:', {
        ip: config.switchIp,
        port: config.switchPort,
        remotePath: remoteBasePath,
      });

      await ftpClient.connect(config.switchIp, config.switchPort);

      if (config.recentMods && config.recentMods.length > 0) {
        for (const mod of config.recentMods) {
          try {
            let localModPath: string | null = null;
            if (mod.folderPath && fs.existsSync(mod.folderPath)) {
              localModPath = mod.folderPath;
            } else {
              const modFolderName = mod.modName || mod.id;
              localModPath = path.join(config.modsPath, modFolderName);
            }

            if (
              localModPath &&
              fs.existsSync(localModPath) &&
              fs.statSync(localModPath).isDirectory()
            ) {
              const remoteModPath = `${remoteBasePath}/${path.basename(localModPath)}`;
              const count = await ftpClient.uploadDirectory(
                localModPath,
                remoteModPath,
              );
              transferredCount += count;
              console.log(
                `Successfully sent mod: ${path.basename(localModPath)} (${count} files)`,
              );
            } else {
              console.warn(`Mod folder not found: ${localModPath}`);
            }
          } catch (modError) {
            console.error(`Error sending mod ${mod.modName}:`, modError);
          }
        }
      } else {
        if (fs.existsSync(config.modsPath)) {
          const files = fs.readdirSync(config.modsPath);
          for (const file of files) {
            const localModPath = path.join(config.modsPath, file);
            if (fs.statSync(localModPath).isDirectory()) {
              const remoteModPath = `${remoteBasePath}/${file}`;
              const count = await ftpClient.uploadDirectory(
                localModPath,
                remoteModPath,
              );
              transferredCount += count;
            }
          }
        }
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
