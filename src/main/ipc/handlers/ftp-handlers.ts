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
  localPath: string;
  itemName: string;
  kind: 'directory' | 'file';
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

function _collectModDirectories(modsPath?: string | null): TransferItem[] {
  if (!modsPath || !fs.existsSync(modsPath)) {
    return [];
  }

  const items: TransferItem[] = [];
  for (const file of fs.readdirSync(modsPath)) {
    const localPath = path.join(modsPath, file);

    if (!fs.statSync(localPath).isDirectory()) {
      continue;
    }

    items.push({
      localPath,
      itemName: file,
      kind: 'directory',
      fileCount: _countFilesRecursive(localPath),
    });
  }

  return items;
}

function _collectPluginFiles(pluginsPath?: string | null): TransferItem[] {
  if (!pluginsPath || !fs.existsSync(pluginsPath)) {
    return [];
  }

  const items: TransferItem[] = [];
  for (const file of fs.readdirSync(pluginsPath)) {
    const localPath = path.join(pluginsPath, file);
    const stats = fs.statSync(localPath);

    if (!stats.isFile() || path.extname(file).toLowerCase() !== '.nro') {
      continue;
    }

    items.push({
      localPath,
      itemName: file,
      kind: 'file',
      fileCount: 1,
    });
  }

  return items;
}

function _normalizeRemotePath(
  remotePath: string | null | undefined,
  defaultPath: string,
): string {
  let normalized = (remotePath || defaultPath).trim().replace(/\\/g, '/');

  if (!normalized || normalized === '/' || normalized === '/switch') {
    normalized = defaultPath;
  }

  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  normalized = normalized.replace(/\/+$/g, '');

  return normalized;
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

    const targetModsPath = path.join(drivePath, 'ultimate', 'mods');
    const targetPluginsPath = path.join(
      drivePath,
      'ultimate',
      'contents',
      '01006A800016E000',
      'romfs',
      'skyline',
      'plugins',
    );

    if (!fs.existsSync(targetModsPath)) {
      fs.mkdirSync(targetModsPath, { recursive: true });
      console.log(`Created directory: ${targetModsPath}`);
    }

    let transferredCount = 0;

    for (const item of _collectModDirectories(config.modsPath)) {
      const targetModPath = path.join(targetModsPath, item.itemName);

      if (fs.existsSync(targetModPath)) {
        fs.rmSync(targetModPath, {
          recursive: true,
          force: true,
        });
      }

      _copyRecursiveSync(item.localPath, targetModPath);
      transferredCount += item.fileCount;
      console.log(
        `Successfully copied mod: ${item.itemName} (${item.fileCount} files)`,
      );
    }

    const pluginItems = _collectPluginFiles(config.pluginsPath);
    if (pluginItems.length > 0 && !fs.existsSync(targetPluginsPath)) {
      fs.mkdirSync(targetPluginsPath, { recursive: true });
      console.log(`Created directory: ${targetPluginsPath}`);
    }

    for (const item of pluginItems) {
      const targetPluginPath = path.join(targetPluginsPath, item.itemName);
      fs.copyFileSync(item.localPath, targetPluginPath);
      transferredCount += item.fileCount;
      console.log(`Successfully copied plugin: ${item.itemName}`);
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
  switchFtpUser?: string | null;
  switchFtpPassword?: string | null;
  switchFtpPath?: string | null;
  switchFtpModsPath?: string | null;
  switchFtpPluginsPath?: string | null;
  switchDriveLetter: string;
  switchTransferMethod: 'ftp' | 'drive';
  modsPath: string;
  pluginsPath?: string | null;
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
      const remoteModsPath = _normalizeRemotePath(
        config.switchFtpModsPath || config.switchFtpPath,
        '/ultimate/mods',
      );
      const remotePluginsPath = _normalizeRemotePath(
        config.switchFtpPluginsPath,
        '/ultimate/contents/01006A800016E000/romfs/skyline/plugins',
      );
      const transferItems = [
        ..._collectModDirectories(config.modsPath).map((item) => ({
          ...item,
          remoteBasePath: remoteModsPath,
        })),
        ..._collectPluginFiles(config.pluginsPath).map((item) => ({
          ...item,
          remoteBasePath: remotePluginsPath,
        })),
      ];

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
        user: config.switchFtpUser || 'ftp',
        remoteModsPath,
        remotePluginsPath,
      });

      await ftpClient.connect(
        config.switchIp,
        config.switchPort,
        config.switchFtpUser || 'ftp',
        config.switchFtpPassword || 'ftp',
      );

      if (totalMods > 0) {
        sendProgress({
          status: 'uploading',
          currentMod: 1,
          totalMods,
          transferredCount: 0,
          totalFiles,
          progress: 0,
          currentModName: transferItems[0].itemName,
        });
      }

      for (const [index, item] of transferItems.entries()) {
        try {
          const remoteItemPath = `${item.remoteBasePath}/${item.itemName}`;

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
            currentModName: item.itemName,
          });

          let count = 0;
          if (item.kind === 'directory') {
            count = await ftpClient.uploadDirectory(
              item.localPath,
              remoteItemPath,
              {
                baseTransferredCount: transferredCount,
                totalFiles,
                currentModIndex: index + 1,
                totalMods,
                currentModName: item.itemName,
                onFileUploaded: (progressUpdate) => {
                  sendProgress({
                    status: 'uploading',
                    currentMod: progressUpdate.currentModIndex || index + 1,
                    totalMods: progressUpdate.totalMods || totalMods,
                    transferredCount: progressUpdate.transferredCount,
                    totalFiles: progressUpdate.totalFiles || totalFiles,
                    progress: progressUpdate.progress,
                    currentModName:
                      progressUpdate.currentModName || item.itemName,
                    currentFileName: progressUpdate.currentFileName,
                  });
                },
              },
            );
          } else {
            await ftpClient.uploadFile(item.localPath, remoteItemPath);
            count = 1;
            const nextTransferredCount = transferredCount + count;
            sendProgress({
              status: 'uploading',
              currentMod: index + 1,
              totalMods,
              transferredCount: nextTransferredCount,
              totalFiles,
              progress:
                totalFiles > 0
                  ? Math.min(
                      100,
                      Math.round((nextTransferredCount / totalFiles) * 100),
                    )
                  : 0,
              currentModName: item.itemName,
              currentFileName: item.itemName,
            });
          }

          transferredCount += count;
          console.log(
            `Successfully sent ${item.kind}: ${item.itemName} (${count} files)`,
          );
        } catch (modError) {
          console.error(`Error sending ${item.itemName}:`, modError);
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
          currentModName: transferItems[totalMods - 1].itemName,
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
