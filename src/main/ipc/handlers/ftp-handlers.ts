const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const FTPClient = require('../../ftp-client');
const {
  handleError,
  createErrorResponse,
  ErrorCodes,
} = require('../../utils/error-handler');

/**
 * Copy directory recursively
 */
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
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
async function sendModsToDrive(config) {
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
          let localModPath = null;
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

            copyRecursiveSync(localModPath, targetModPath);

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

            copyRecursiveSync(localModPath, targetModPath);

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
      `Successfully transferred ${transferredCount} files to drive ${driveLetter}:`,
    );
    return { success: true, transferredCount };
  } catch (error) {
    handleError(error, 'send-mods-to-drive');
    return createErrorResponse(ErrorCodes.FILE_WRITE_ERROR, error.message);
  }
}

function registerFtpHandlers(ipcMain) {
  ipcMain.handle('send-mods-to-switch', async (event, config) => {
    const transferMethod = config.switchTransferMethod || 'ftp';

    if (transferMethod === 'drive') {
      return await sendModsToDrive(config);
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
            let localModPath = null;
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
  });
}

module.exports = { registerFtpHandlers };
