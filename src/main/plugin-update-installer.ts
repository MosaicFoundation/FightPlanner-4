const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class PluginUpdateInstaller {
  static async downloadFile(url, targetPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(targetPath);

      https
        .get(
          url,
          {
            headers: {
              'User-Agent': 'FightPlanner-Plugin-Updater',
            },
          },
          (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              file.close();
              fs.unlinkSync(targetPath);
              return this.downloadFile(res.headers.location, targetPath)
                .then(resolve)
                .catch(reject);
            }

            if (res.statusCode !== 200) {
              file.close();
              fs.unlinkSync(targetPath);
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }

            res.pipe(file);

            file.on('finish', () => {
              file.close();
              resolve(targetPath);
            });
          },
        )
        .on('error', (err) => {
          file.close();
          if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }
          reject(err);
        });
    });
  }

  static findNroFile(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && file.toLowerCase().endsWith('.nro')) {
        return filePath;
      }

      if (stat.isDirectory()) {
        const found = this.findNroFile(filePath);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  static async extractZip(zipPath, targetPath) {
    try {
      if (!fs.existsSync(zipPath)) {
        throw new Error('ZIP file does not exist: ' + zipPath);
      }

      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      let extracted = false;
      let lastError = null;

      const bundled7z = path.join(__dirname, '..', '..', 'tools', '7za.exe');
      const has7z = fs.existsSync(bundled7z);

      if (has7z || process.platform === 'win32') {
        try {
          const command = has7z
            ? `"${bundled7z}" x "${zipPath}" -o"${targetPath}" -y`
            : `7z x "${zipPath}" -o"${targetPath}" -y`;

          await execAsync(command);
          extracted = true;
        } catch (err) {
          lastError = err;
        }
      }

      if (!extracted && process.platform !== 'win32') {
        try {
          const command = `unzip -o "${zipPath}" -d "${targetPath}"`;
          await execAsync(command);
          extracted = true;
        } catch (err) {
          lastError = err;
        }
      }

      if (!extracted) {
        try {
          const zip = new AdmZip(zipPath);
          zip.extractAllTo(targetPath, true);
          extracted = true;
        } catch (err) {
          lastError = err;
        }
      }

      if (!extracted) {
        throw lastError || new Error('All extraction methods failed');
      }

      const extractedFiles = fs.readdirSync(targetPath);
      if (extractedFiles.length === 0) {
        throw new Error('ZIP extraction resulted in no files');
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to extract ZIP: ${error.message}`);
    }
  }

  static async installUpdate(downloadUrl, pluginPath) {
    try {
      if (!downloadUrl) {
        return {
          success: false,
          error: 'No download URL available',
        };
      }

      const tempDir = os.tmpdir();
      const isZip =
        downloadUrl.toLowerCase().endsWith('.zip') ||
        downloadUrl.toLowerCase().includes('.zip');

      let downloadedFilePath;
      let nroFilePath;

      let actualFileName;

      if (isZip) {
        const tempZipName = `plugin-download-${Date.now()}.zip`;
        downloadedFilePath = path.join(tempDir, tempZipName);

        await this.downloadFile(downloadUrl, downloadedFilePath);

        if (!fs.existsSync(downloadedFilePath)) {
          return {
            success: false,
            error: 'Downloaded ZIP file not found',
          };
        }

        const extractDir = path.join(tempDir, `plugin-extract-${Date.now()}`);
        await this.extractZip(downloadedFilePath, extractDir);

        nroFilePath = this.findNroFile(extractDir);

        if (!nroFilePath) {
          if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
          }
          if (fs.existsSync(downloadedFilePath)) {
            fs.unlinkSync(downloadedFilePath);
          }
          return {
            success: false,
            error: 'No .nro file found in the ZIP archive',
          };
        }
        actualFileName = path.basename(nroFilePath);
      } else {
        // Try to determine filename from URL
        try {
          const urlUrl = new URL(downloadUrl);
          const urlFilename = path.basename(urlUrl.pathname);
          if (urlFilename && urlFilename.toLowerCase().endsWith('.nro')) {
            actualFileName = decodeURIComponent(urlFilename);
          }
        } catch (e) {
          console.error('Error parsing filename from URL:', e);
        }

        // Fallback to pluginPath basename if URL parsing failed
        if (!actualFileName) {
          actualFileName = path.basename(pluginPath);
        }

        const tempFileName = `plugin-update-${Date.now()}.nro`;
        downloadedFilePath = path.join(tempDir, tempFileName);
        await this.downloadFile(downloadUrl, downloadedFilePath);
        nroFilePath = downloadedFilePath;
      }

      if (!fs.existsSync(nroFilePath)) {
        return {
          success: false,
          error: 'Downloaded file not found',
        };
      }

      // actualFileName is already set correctly above
      const pluginDir = path.dirname(pluginPath);
      const finalPluginPath = path.join(pluginDir, actualFileName);

      if (!fs.existsSync(pluginDir)) {
        fs.mkdirSync(pluginDir, { recursive: true });
      }

      if (fs.existsSync(finalPluginPath)) {
        const backupPath = finalPluginPath + '.backup';
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.copyFileSync(finalPluginPath, backupPath);
        fs.unlinkSync(finalPluginPath);
      }

      fs.copyFileSync(nroFilePath, finalPluginPath);

      if (fs.existsSync(downloadedFilePath)) {
        fs.unlinkSync(downloadedFilePath);
      }

      if (isZip && nroFilePath !== downloadedFilePath) {
        const extractDir = path.dirname(nroFilePath);
        if (fs.existsSync(extractDir)) {
          fs.rmSync(extractDir, { recursive: true, force: true });
        }
      }

      return {
        success: true,
        pluginPath: finalPluginPath,
        actualFileName: actualFileName,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = PluginUpdateInstaller;
