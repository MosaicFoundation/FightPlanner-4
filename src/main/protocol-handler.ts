import { app, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { exec, execSync } from 'child_process';
import * as crypto from 'crypto';
import { RequestOptions } from 'https';

import ModUtils from './mod-utils';
import sharedStore from './store';

const packageJson = require('../../package.json');

const USER_AGENT = `FightPlanner/${packageJson.version} (Electron ${process.versions.electron}; Node ${process.versions.node}; ${process.platform})`;

export interface ProtocolHandlerEvents {
  'mod-install-confirm-request': {
    url: string;
    downloadId: string;
    modId: string | null;
    modType: string;
  };

  'mod-download-progress': {
    downloadId: string;
    progress: number;
    receivedBytes: number;
    totalBytes: number;
  };

  'mod-install-start': {
    url: string;
    downloadId: string;
    modName: string | null;
  };

  'mod-extract-start': {
    downloadId: string;
  };

  'mod-extract-complete': {
    downloadId: string;
  };

  'mod-install-success': {
    url: string;
    modName: string | null;
    downloadId: string;
    folderPath: string | null;
  };

  'mod-install-error': {
    downloadId?: string;
    error: string;
  };
}

export default class ProtocolHandler {
  mainWindow: Electron.BrowserWindow;
  downloadInProgress: boolean;
  activeDownloads: Map<
    string,
    {
      request: http.ClientRequest | null;
      file: fs.WriteStream;
      filePath: string;
      cancelled: boolean;
      paused?: boolean;
    }
  >;
  pendingInstalls: Map<
    string,
    { url: string; modId: string | null; downloadId: string; modType: string }
  >;
  processingUrls: Set<string>;

  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.downloadInProgress = false;
    this.activeDownloads = new Map(); // Map of downloadId -> {request, file, filePath, cancelled, paused}
    this.pendingInstalls = new Map();
    this.processingUrls = new Set();
  }
  static async registerProtocol() {
    // On Linux, wait for app to be ready before registering
    if (process.platform === 'linux') {
      if (!app.isReady()) {
        await app.whenReady();
      }
    }

    if (process.platform === 'win32') {
      if (process.defaultApp) {
        if (process.argv.length >= 2) {
          app.setAsDefaultProtocolClient('fightplanner', process.execPath, [
            path.resolve(process.argv[1]),
          ]);
          console.log('✓ FightPlanner protocol registered (dev mode)');
        }
      } else {
        app.setAsDefaultProtocolClient('fightplanner');
        console.log('✓ FightPlanner protocol registered (production)');
      }

      this.registerProtocolInRegistry();
    } else if (process.platform === 'darwin') {
      try {
        const before = app.isDefaultProtocolClient
          ? app.isDefaultProtocolClient('fightplanner')
          : undefined;
        console.log(
          `[protocol][${process.platform}] before registration isDefault=${before}`,
        );
        if (process.defaultApp && process.argv.length >= 2) {
          const ok = app.setAsDefaultProtocolClient(
            'fightplanner',
            process.execPath,
            [path.resolve(process.argv[1])],
          );
          console.log(
            `[protocol][${process.platform}] register dev returned=${ok}`,
          );
        } else {
          const ok = app.setAsDefaultProtocolClient('fightplanner');
          console.log(
            `[protocol][${process.platform}] register prod returned=${ok}`,
          );
        }
        const after = app.isDefaultProtocolClient
          ? app.isDefaultProtocolClient('fightplanner')
          : undefined;
        console.log(
          `[protocol][${process.platform}] after registration isDefault=${after}`,
        );
      } catch (e) {
        console.warn(
          'Protocol registration skipped (' + process.platform + '):',
          e.message,
        );
      }
    } else if (process.platform === 'linux') {
      try {
        const before = app.isDefaultProtocolClient
          ? app.isDefaultProtocolClient('fightplanner')
          : undefined;
        console.log(
          `[protocol][${process.platform}] before registration isDefault=${before}`,
        );

        // HACK: As `electron.app.setAsDefaultProtocolClient` is based on `xdg-settings set default-url-scheme-handler`
        // which is not supported on Xfce, we manually create new .desktop entry and use `xdg-mime`
        // to make it default handler for protocol URLs.
        let electronAppMainScriptPath: string | null = null;
        let execArgs: string[] = [];

        if (process.defaultApp && process.argv.length >= 2) {
          // Development mode
          electronAppMainScriptPath = path.resolve(process.argv[1]);
          execArgs = [electronAppMainScriptPath];
        } else {
          // Production mode - try to find the main script or use execPath only
          if (process.argv.length >= 2) {
            electronAppMainScriptPath = path.resolve(process.argv[1]);
            execArgs = [electronAppMainScriptPath];
          } else {
            // No script path available, use execPath only
            execArgs = [];
          }
        }

        // Always create .desktop file on Linux (both dev and prod)
        try {
          const hashInput = electronAppMainScriptPath
            ? `${process.execPath}${electronAppMainScriptPath}`
            : `${process.execPath}`;
          const electronAppDesktopFileName = `fightplanner-protocol-${crypto.createHash('md5').update(hashInput).digest('hex')}.desktop`;
          const electronAppDesktopFilePath = path.resolve(
            app.getPath('home'),
            '.local',
            'share',
            'applications',
            electronAppDesktopFileName,
          );

          fs.mkdirSync(path.dirname(electronAppDesktopFilePath), {
            recursive: true,
          });

          // Build Exec line
          let execLine = process.execPath;
          if (electronAppMainScriptPath) {
            execLine = `${process.execPath} ${electronAppMainScriptPath} %u`;
          } else {
            execLine = `${process.execPath} %u`;
          }

          const desktopFileContent = [
            `[Desktop Entry]`,
            `Name=FightPlanner`,
            `Exec=${execLine}`,
            `Type=Application`,
            `Terminal=false`,
            `MimeType=x-scheme-handler/fightplanner;`,
            `NoDisplay=true`,
          ].join('\n');

          fs.writeFileSync(electronAppDesktopFilePath, desktopFileContent);

          console.log(
            `[protocol][linux] Created .desktop file: ${electronAppDesktopFilePath}`,
          );

          try {
            execSync(
              `xdg-mime default ${electronAppDesktopFileName} x-scheme-handler/fightplanner`,
            );
            console.log(`[protocol][linux] Registered with xdg-mime`);
          } catch (xdgError) {
            console.warn(
              `[protocol][linux] xdg-mime registration failed:`,
              xdgError.message,
            );
            // Try alternative method
            try {
              execSync(
                `update-desktop-database ${path.dirname(electronAppDesktopFilePath)}`,
              );
              console.log(`[protocol][linux] Updated desktop database`);
            } catch (updateError) {
              console.warn(
                `[protocol][linux] Desktop database update failed:`,
                updateError.message,
              );
            }
          }
        } catch (desktopError) {
          console.warn(
            `[protocol][linux] Desktop file creation failed:`,
            desktopError.message,
          );
        }

        // Also try the standard Electron method as fallback
        const ok = app.setAsDefaultProtocolClient(
          'fightplanner',
          process.execPath,
          execArgs,
        );
        console.log(`[protocol][${process.platform}] register returned=${ok}`);

        const after = app.isDefaultProtocolClient
          ? app.isDefaultProtocolClient('fightplanner')
          : undefined;
        console.log(
          `[protocol][${process.platform}] after registration isDefault=${after}`,
        );
      } catch (e) {
        console.warn(
          'Protocol registration skipped (' + process.platform + '):',
          e.message,
        );
      }
    }
  }
  static registerProtocolInRegistry() {
    if (process.platform !== 'win32') return;

    try {
      let commandString;
      if (process.defaultApp) {
        const exePath = process.execPath.replace(/\\/g, '\\\\');
        const scriptPath = path.resolve(process.argv[1]).replace(/\\/g, '\\\\');
        commandString = `\\"${exePath}\\" \\"${scriptPath}\\" \\"%1\\"`;
        console.log('Registering protocol in registry (dev mode)...');
      } else {
        const exePath = process.execPath.replace(/\\/g, '\\\\');
        commandString = `\\"${exePath}\\" \\"%1\\"`;
        console.log('Registering protocol in registry (production)...');
      }

      console.log('Command string:', commandString);

      const commands = [
        `reg add "HKCU\\Software\\Classes\\fightplanner" /ve /d "URL:FightPlanner Protocol" /f`,
        `reg add "HKCU\\Software\\Classes\\fightplanner" /v "URL Protocol" /t REG_SZ /d "" /f`,
        `reg add "HKCU\\Software\\Classes\\fightplanner\\DefaultIcon" /ve /d "${process.execPath.replace(
          /\\/g,
          '\\\\',
        )},0" /f`,
        `reg add "HKCU\\Software\\Classes\\fightplanner\\shell\\open\\command" /ve /d "${commandString}" /f`,
      ];

      let commandsExecuted = 0;
      commands.forEach((cmd, index) => {
        exec(cmd, (error, _stdout, _stderr) => {
          commandsExecuted++;

          if (error) {
            console.error(
              `Registry command ${index + 1} failed:`,
              error.message,
            );
          } else {
            console.log(
              `✓ Registry command ${index + 1} executed successfully`,
            );
          }

          if (commandsExecuted === commands.length) {
            console.log('Protocol registration in registry completed!');

            exec(
              'reg query "HKCU\\Software\\Classes\\fightplanner\\shell\\open\\command"',
              (error, stdout, _stderr) => {
                if (!error) {
                  console.log('✓ Protocol verified in registry:');
                  console.log(stdout);
                }
              },
            );
          }
        });
      });
    } catch (error) {
      console.error('Registry registration failed:', error);
      console.error('You may need to run the app as Administrator once.');
    }
  }
  async handleDeepLink(url: string) {
    console.log('[protocol] Handling deep link:', url);

    try {
      const cleanUrl = url.replace('fightplanner:', '');

      if (this.processingUrls.has(cleanUrl)) {
        console.log(
          '[protocol] URL already being processed, skipping duplicate:',
          cleanUrl,
        );
        return;
      }

      this.processingUrls.add(cleanUrl);

      setTimeout(() => {
        this.processingUrls.delete(cleanUrl);
      }, 5000);

      const downloadId = `dl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const modId = this.extractModId(cleanUrl);
      const modType = this.extractModType(cleanUrl);

      const downloadUrl = this.parseGameBananaUrl(cleanUrl);

      if (!downloadUrl) {
        this.processingUrls.delete(cleanUrl);
        this.showError('Invalid URL format');
        return;
      }

      console.log('[protocol] Download URL:', downloadUrl);
      console.log('[protocol] Mod ID:', modId);
      console.log('[protocol] Mod Type:', modType);

      this.sendToRenderer('mod-install-confirm-request', {
        url: downloadUrl,
        downloadId,
        modId,
        modType,
      });

      this.pendingInstalls.set(downloadId, {
        url: downloadUrl,
        modId,
        downloadId,
        modType,
      });
    } catch (error) {
      console.error('Error handling deep link:', error);
      const cleanUrl = url.replace('fightplanner:', '');
      this.processingUrls.delete(cleanUrl);
      this.showError(`Installation failed: ${error.message}`);
      this.sendToRenderer('mod-install-error', { error: error.message });
    }
  }

  async fetchModNameFromAPI(modId, modType = 'Mod') {
    try {
      const apiUrl = `https://gamebanana.com/apiv11/${modType}/${modId}?_csvProperties=_sName`;
      const response = await this.fetchWithTimeout(apiUrl, 10000);
      const data = JSON.parse(response);
      return data._sName || null;
    } catch (error) {
      console.error('Failed to fetch mod name from API:', error.message);
      return null;
    }
  }

  async proceedWithInstall(downloadId: string) {
    const modsPath = sharedStore.get('modsPath') as string | null;
    const installData = this.pendingInstalls?.get(downloadId);

    if (!modsPath) {
      throw new Error('Mods folder not configured');
    }

    if (!installData) {
      console.error('No pending install found for:', downloadId);
      return;
    }

    const { url: downloadUrl, modId, modType = 'Mod' } = installData;

    const _handleSaveError = (error: Error) => {
      console.error('Error during installation:', error);

      this.showError(`Installation failed: ${error.message}`);
      this.sendToRenderer('mod-install-error', {
        downloadId,
        error: error.message,
      });

      this.pendingInstalls.delete(downloadId);
    };

    try {
      let modName = null;

      if (modId) {
        modName = await this.fetchModNameFromAPI(modId, modType);
      }

      this.sendToRenderer('mod-install-start', {
        url: downloadUrl,
        downloadId,
        modName: modName || null,
      });

      if (sharedStore.get('disableAllModsOnDownload')) {
        try {
          const allMods = ModUtils.readAllMods(modsPath);
          const disabledModsPath = ModUtils.getDisabledModsFolder(modsPath);

          if (!fs.existsSync(disabledModsPath)) {
            fs.mkdirSync(disabledModsPath, { recursive: true });
          }

          let disabledCount = 0;

          for (const mod of allMods.activeMods) {
            try {
              const targetPath = path.join(disabledModsPath, mod.name);
              if (!fs.existsSync(targetPath)) {
                fs.renameSync(mod.path, targetPath);
                disabledCount++;
              }
            } catch (moveError) {
              console.warn(
                `[Protocol][DisableAllOnDownload] Failed to disable ${mod.name}:`,
                moveError,
              );
            }
          }
          console.log(
            `[Protocol][DisableAllOnDownload] Disabled ${disabledCount} mods before download`,
          );
        } catch (disableError) {
          console.error(
            '[Protocol][DisableAllOnDownload] Failed to disable mods:',
            disableError,
          );
        }
      }

      const filePath = await this.downloadMod(downloadUrl, downloadId);

      if (!filePath) {
        this.showError('Download failed');
        return;
      }

      console.log('Downloaded to:', filePath);

      const modInstallResult = await ModUtils.installModFromPath(
        filePath,
        modsPath,
      );

      if (modInstallResult.success) {
        if (modId) {
          await this.fetchAndSaveModMetadata(
            modId,
            modInstallResult.modPath,
            modType,
          );
        }

        this.sendToRenderer('mod-install-success', {
          url: downloadUrl,
          modName: modInstallResult.modName,
          downloadId,
          folderPath: modInstallResult.modPath,
        });

        this.pendingInstalls.delete(downloadId);
      } else {
        _handleSaveError(new Error(modInstallResult.error));
      }
    } catch (error) {
      _handleSaveError(error);
    }
  }
  extractModId(url) {
    try {
      const mmdlMatch = url.match(/mmdl\/\d+,(?:Mod|Sound),(\d+)/);
      if (mmdlMatch && mmdlMatch[1]) {
        return mmdlMatch[1];
      }
      return null;
    } catch (error) {
      console.error('Error extracting mod ID:', error);
      return null;
    }
  }

  extractModType(url) {
    try {
      const typeMatch = url.match(/mmdl\/\d+,(Mod|Sound),/);
      if (typeMatch && typeMatch[1]) {
        return typeMatch[1];
      }
      return 'Mod';
    } catch (error) {
      console.error('Error extracting mod type:', error);
      return 'Mod';
    }
  }
  parseGameBananaUrl(url) {
    try {
      const mmdlMatch = url.match(/mmdl\/(\d+)/);
      if (mmdlMatch && mmdlMatch[1]) {
        const downloadId = mmdlMatch[1];
        return `https://gamebanana.com/dl/${downloadId}`;
      }

      if (url.includes('/dl/')) {
        return url;
      }

      return null;
    } catch (error) {
      console.error('Error parsing URL:', error);
      return null;
    }
  }

  async downloadMod(url: string, downloadId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const tempDir = path.join(app.getPath('temp'), 'fightplanner-downloads');

      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      let fileExt = '.zip';
      try {
        const urlPath = new URL(url).pathname.toLowerCase();
        if (urlPath.endsWith('.rar')) {
          fileExt = '.rar';
        } else if (urlPath.endsWith('.7z')) {
          fileExt = '.7z';
        } else if (urlPath.endsWith('.zip')) {
          fileExt = '.zip';
        }
      } catch (e) {
        console.warn(
          '[protocol][download] Could not detect extension from URL, using .zip',
        );
      }

      let fileName = `mod-${Date.now()}${fileExt}`;
      let filePath = path.join(tempDir, fileName);

      console.log('[protocol][download] to:', filePath);

      const protocol = url.startsWith('https') ? https : http;

      const file = fs.createWriteStream(filePath);
      let receivedBytes = 0;
      let totalBytes = 0;

      const requestOptions: RequestOptions = new URL(url);
      requestOptions.headers = {
        'User-Agent': USER_AGENT,
        Accept: '*/*',
      };

      // Store download info for cancel
      this.activeDownloads.set(downloadId, {
        request: null, // Will be set after request is created
        file: file,
        filePath: filePath,
        cancelled: false,
      });

      const request = protocol.get(requestOptions, (response) => {
        // Update stored request
        const download = this.activeDownloads.get(downloadId);
        if (download) {
          download.request = request;
        }

        // Check if cancelled before processing response
        if (download && download.cancelled) {
          response.destroy();
          file.close();

          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          reject(new Error('Download cancelled'));

          return;
        }

        if (response.statusCode === 301 || response.statusCode === 302) {
          console.log(
            '[protocol][download] redirect to:',
            response.headers.location,
          );
          file.close();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          this.downloadMod(response.headers.location as string, downloadId)
            .then(resolve)
            .catch(reject);

          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }

          reject(
            new Error(`Download failed with status ${response.statusCode}`),
          );
          return;
        }

        let finalFilePath = filePath;
        const contentType = response.headers['content-type'] || '';
        if (
          contentType.includes('application/x-rar-compressed') ||
          contentType.includes('application/vnd.rar')
        ) {
          if (!filePath.endsWith('.rar')) {
            finalFilePath = filePath.replace(/\.(zip|7z)$/, '.rar');
            console.log(
              '[protocol][download] Content-Type indicates RAR, will rename to:',
              finalFilePath,
            );
          }
        }

        totalBytes =
          parseInt(response.headers['content-length'] as string, 10) || 0;

        response.on('data', (chunk) => {
          // Check if cancelled during download
          const downloadCheck = this.activeDownloads.get(downloadId);
          if (downloadCheck && downloadCheck.cancelled) {
            return;
          }

          receivedBytes += chunk.length;

          if (totalBytes > 0) {
            const progress = Math.round((receivedBytes / totalBytes) * 100);

            this.sendToRenderer('mod-download-progress', {
              downloadId,
              progress,
              receivedBytes,
              totalBytes,
            });
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          // Check if download was cancelled before finishing
          const downloadCheck = this.activeDownloads.get(downloadId);
          if (downloadCheck && downloadCheck.cancelled) {
            console.log('[protocol][download] cancelled during transfer');
            this.activeDownloads.delete(downloadId);
            reject(new Error('Download cancelled'));
            return;
          }

          file.close(() => {
            if (finalFilePath !== filePath && fs.existsSync(filePath)) {
              try {
                fs.renameSync(filePath, finalFilePath);
                console.log('[protocol][download] renamed to:', finalFilePath);
                filePath = finalFilePath;
                if (downloadCheck) {
                  downloadCheck.filePath = finalFilePath;
                }
              } catch (renameError) {
                console.warn(
                  '[protocol][download] failed to rename file:',
                  renameError.message,
                );
              }
            }

            console.log('[protocol][download] complete');
            this.activeDownloads.delete(downloadId);
            resolve(filePath);
          });
        });
      });

      request.on('error', (err) => {
        this.activeDownloads.delete(downloadId);
        file.close();
        fs.unlinkSync(filePath);

        reject(err);
      });

      file.on('error', (err) => {
        this.activeDownloads.delete(downloadId);
        file.close();
        fs.unlinkSync(filePath);

        reject(err);
      });
    });
  }

  async fetchAndSaveModMetadata(modId, modFolderPath, modType = 'Mod') {
    try {
      console.log(`Fetching metadata for ${modType} ${modId}...`);

      const hasPreview = this.hasPreviewImage(modFolderPath);
      const hasInfoToml = fs.existsSync(path.join(modFolderPath, 'info.toml'));

      if (hasPreview && hasInfoToml) {
        console.log(
          'Mod already has preview and info.toml, skipping metadata fetch',
        );
        return;
      }

      const apiUrl = `https://gamebanana.com/apiv11/${modType}/${modId}?_csvProperties=%40gbprofile`;
      console.log('API URL:', apiUrl);

      const response = await this.fetchWithTimeout(apiUrl, 10000);
      const data = JSON.parse(response);

      if (
        !hasPreview &&
        data._aPreviewMedia &&
        data._aPreviewMedia._aImages &&
        data._aPreviewMedia._aImages.length > 0
      ) {
        const firstImage = data._aPreviewMedia._aImages[0];
        if (firstImage._sBaseUrl && firstImage._sFile) {
          const imageUrl = firstImage._sBaseUrl + '/' + firstImage._sFile;
          console.log('Downloading preview from:', imageUrl);
          await this.downloadPreviewImage(imageUrl, modFolderPath);
        }
      }

      if (!hasInfoToml) {
        const category =
          data._aSuperCategory && data._aSuperCategory._sName
            ? data._aSuperCategory._sName
            : '';
        const author =
          data._aSubmitter && data._aSubmitter._sName
            ? data._aSubmitter._sName
            : '';
        const version =
          data._aAdditionalInfo && data._aAdditionalInfo._sVersion
            ? data._aAdditionalInfo._sVersion
            : '';

        if (category || author || version) {
          console.log('Creating info.toml...');
          this.createInfoToml(modFolderPath, category, author, version);
        }
      }

      console.log('✓ Metadata saved successfully');
    } catch (error) {
      console.error('Failed to fetch mod metadata:', error.message);
    }
  }

  hasPreviewImage(modFolderPath) {
    try {
      const files = fs.readdirSync(modFolderPath);
      return files.some((file) => file.toLowerCase().startsWith('preview.'));
    } catch {
      return false;
    }
  }

  fetchWithTimeout(url: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      const requestOptions: RequestOptions = new URL(url);
      requestOptions.headers = {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, */*;q=0.1',
      };

      const req = protocol.get(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  async downloadPreviewImage(imageUrl, modFolderPath) {
    return new Promise<void>((resolve, reject) => {
      const protocol = imageUrl.startsWith('https') ? https : http;
      const previewPath = path.join(modFolderPath, 'preview.webp');
      const file = fs.createWriteStream(previewPath);

      const requestOptions: RequestOptions = new URL(imageUrl);
      requestOptions.headers = {
        'User-Agent': USER_AGENT,
        Accept: 'image/webp,image/*;q=0.8,*/*;q=0.5',
      };

      const request = protocol.get(requestOptions, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            console.log('✓ Preview image saved');
            resolve();
          });
        } else {
          file.close();
          fs.unlinkSync(previewPath);
          reject(new Error(`Failed to download image: ${response.statusCode}`));
        }
      });

      request.on('error', (err) => {
        file.close();
        if (fs.existsSync(previewPath)) {
          fs.unlinkSync(previewPath);
        }
        reject(err);
      });
    });
  }

  createInfoToml(modFolderPath, category, author, version) {
    const tomlPath = path.join(modFolderPath, 'info.toml');
    let content = '';

    if (author) {
      content += `authors = "${author}"\n`;
    }
    if (version) {
      content += `version = "${version}"\n`;
    }
    if (category) {
      content += `category = "${category}"\n`;
    }

    fs.writeFileSync(tomlPath, content, 'utf8');
    console.log('✓ info.toml created');
  }

  sendToRenderer(
    channel: keyof ProtocolHandlerEvents,
    data: ProtocolHandlerEvents[typeof channel],
  ) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  showError(message) {
    dialog.showErrorBox('FightPlanner - Installation Error', message);
  }

  cancelDownload(downloadId: string) {
    const download = this.activeDownloads.get(downloadId);
    if (!download) {
      return { success: false, error: 'Download not found' };
    }

    if (download.cancelled) {
      return { success: false, error: 'Download already cancelled' };
    }

    download.cancelled = true;

    // Destroy the request to stop data flow
    if (download.request) {
      download.request.destroy();
      download.request = null;
    }

    // Close and delete the file
    if (download.file) {
      // Ensure file is properly closed
      const filePath = download.filePath;
      try {
        download.file.destroy(); // Force close
      } catch (err) {
        console.warn('Error destroying file stream:', err);
      }

      // Try to delete the file
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log('[protocol] Deleted cancelled download file:', filePath);
        } catch (err) {
          console.warn('Failed to delete cancelled download file:', err);
        }
      }
    }

    // Keep entry for a short time to catch finish event, then clean up
    setTimeout(() => {
      this.activeDownloads.delete(downloadId);
    }, 1000);

    // Notify renderer immediately
    this.sendToRenderer('mod-install-error', {
      downloadId,
      error: 'Download cancelled by user',
    });

    return { success: true };
  }
}
