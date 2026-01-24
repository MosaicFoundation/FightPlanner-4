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
import { FileExtractor } from './utils/file-extractor';

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
  async handleDeepLink(url) {
    console.log('[protocol] Handling deep link:', url);

    try {
      let cleanUrl = url.replace('fightplanner:', '');

      if (cleanUrl.includes(',Mod,')) {
        cleanUrl = cleanUrl.replace(',Mod,', ',Sound,');
        console.log("[protocol] Replaced 'Mod' with 'Sound' in URL");
      }

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
    const installData = this.pendingInstalls?.get(downloadId);

    if (!installData) {
      console.error('No pending install found for:', downloadId);
      return;
    }

    const { url: downloadUrl, modId, modType = 'Mod' } = installData;

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

      const filePath = await this.downloadMod(downloadUrl, downloadId);

      if (!filePath) {
        this.showError('Download failed');
        return;
      }

      console.log('Downloaded to:', filePath);

      const installedModName = await this.installMod(
        filePath,
        downloadId,
        modId,
        modName,
        modType,
      );

      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn('Failed to delete temp file:', err);
      }

      let modFolderPath: string | null = null;

      if (modId && installedModName) {
        const modsPath = sharedStore.get('modsPath') as string | null;

        if (modsPath) {
          modFolderPath = path.join(modsPath, installedModName);
          await this.fetchAndSaveModMetadata(modId, modFolderPath, modType);
        }
      }

      // Auto-disable mod if setting is enabled
      if (installedModName && sharedStore.get('autoDisableNewMods')) {
        try {
          const modsPath = sharedStore.get('modsPath') as string | null;

          if (modsPath) {
            const currentModPath = path.join(modsPath, installedModName);
            const parentDir = path.dirname(modsPath);
            const disabledModsPath = path.join(parentDir, '{disabled_mod}');

            if (!fs.existsSync(disabledModsPath)) {
              fs.mkdirSync(disabledModsPath, { recursive: true });
            }

            const targetPath = path.join(disabledModsPath, installedModName);
            if (!fs.existsSync(targetPath)) {
              fs.renameSync(currentModPath, targetPath);
              console.log(
                `[Protocol][AutoDisable] Moved ${installedModName} to disabled mods folder`,
              );
              // Update modFolderPath to point to the new location so renderer gets correct path
              modFolderPath = targetPath;
            } else {
              console.warn(
                `[Protocol][AutoDisable] Cannot move ${installedModName}, target already exists: ${targetPath}`,
              );
            }
          }
        } catch (disableError) {
          console.error(
            '[Protocol][AutoDisable] Failed to disable mod:',
            disableError,
          );
        }
      }

      this.sendToRenderer('mod-install-success', {
        url: downloadUrl,
        modName: installedModName,
        downloadId,
        folderPath: modFolderPath,
      });

      this.pendingInstalls.delete(downloadId);
    } catch (error) {
      console.error('Error during installation:', error);
      this.showError(`Installation failed: ${error.message}`);
      this.sendToRenderer('mod-install-error', {
        downloadId,
        error: error.message,
      });

      this.pendingInstalls.delete(downloadId);
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
  async installMod(
    zipPath,
    downloadId,
    modId: string | null = null,
    modNameFromAPI = null,
    modType = 'Mod',
  ) {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`Archive file does not exist: ${zipPath}`);
    }

    const modsPath = sharedStore.get('modsPath') as string | null;

    if (!modsPath) {
      throw new Error('Mods folder not configured. Please set it in Settings.');
    }

    if (!fs.existsSync(modsPath)) {
      throw new Error('Mods folder does not exist');
    }

    console.log('Installing mod to:', modsPath);

    const tempExtractDir = path.join(
      app.getPath('temp'),
      'fightplanner-extract',
      `mod-${Date.now()}`,
    );
    if (!fs.existsSync(tempExtractDir)) {
      fs.mkdirSync(tempExtractDir, { recursive: true });
    }

    this.sendToRenderer('mod-extract-start', { downloadId });
    await FileExtractor.extractArchive(zipPath, tempExtractDir);
    this.sendToRenderer('mod-extract-complete', { downloadId });

    await this.verifyFptStructure(tempExtractDir);

    const extractedItems = fs.readdirSync(tempExtractDir);
    console.log('Extracted items:', extractedItems);

    let installedModName;
    if (
      extractedItems.length === 1 &&
      fs.statSync(path.join(tempExtractDir, extractedItems[0])).isDirectory()
    ) {
      const modFolderName = extractedItems[0];
      const tempModPath = path.join(tempExtractDir, modFolderName);
      const finalModPath = path.join(modsPath, modFolderName);

      if (fs.existsSync(finalModPath)) {
        console.log('Mod already exists, removing old version');
        fs.rmSync(finalModPath, { recursive: true, force: true });
      }

      console.log('Copying mod from temp to mods folder...');
      this.copyRecursiveSync(tempModPath, finalModPath);
      console.log('Mod installed to:', finalModPath);
      installedModName = modFolderName;
    } else {
      const modFolderName = `mod-${Date.now()}`;
      const finalModPath = path.join(modsPath, modFolderName);
      console.log('Copying multiple items to mods folder...');
      this.copyRecursiveSync(tempExtractDir, finalModPath);
      console.log('Mod installed to:', finalModPath);
      installedModName = modFolderName;
    }

    try {
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn('Failed to cleanup temp directory:', err.message);
    }

    const installedModPath = path.join(modsPath, installedModName);
    if (/^mod-\d+$/.test(installedModName) && fs.existsSync(installedModPath)) {
      let newName: string | null = null;

      if (modNameFromAPI) {
        newName = modNameFromAPI;
      } else if (modId) {
        newName = await this.fetchModNameFromAPI(modId, modType);
      }

      if (!newName) {
        const modInfo = ModUtils.readModInfo(installedModPath);
        if (modInfo) {
          newName = modInfo.s_name || modInfo.display_name;
        }
      }

      if (newName) {
        const sanitizedName = newName.replace(/[<>:"/\\|?*]/g, '_').trim();
        if (sanitizedName && sanitizedName !== installedModName) {
          const newModPath = path.join(modsPath, sanitizedName);
          if (!fs.existsSync(newModPath)) {
            try {
              fs.renameSync(installedModPath, newModPath);
              console.log(
                `Mod renamed from ${installedModName} to ${sanitizedName}`,
              );
              installedModName = sanitizedName;
            } catch (renameErr) {
              console.warn(`Failed to rename mod: ${renameErr.message}`);
            }
          }
        }
      }
    }

    console.log('Mod installed successfully');
    return installedModName;
  }
  copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = stats && stats.isDirectory();

    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }

      fs.readdirSync(src).forEach((childItemName) => {
        this.copyRecursiveSync(
          path.join(src, childItemName),
          path.join(dest, childItemName),
        );
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  findFptFile(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isFile() && item.endsWith('.fpt')) {
          console.log('[FPT] Found .fpt file:', item);
          return itemPath;
        } else if (stat.isDirectory()) {
          const found = this.findFptFile(itemPath);
          if (found) return found;
        }
      }

      return null;
    } catch (error) {
      console.error('[FPT] Error searching for .fpt file:', error);
      return null;
    }
  }

  parseFptFile(fptPath) {
    try {
      const content = fs.readFileSync(fptPath, 'utf-8');
      console.log('[FPT] Raw file content:');
      console.log(content);

      const lines = content.split('\n');
      const structure = {};
      const pathStack: { name: string; indent: number }[] = [];

      console.log('[FPT] Parsing with indentation awareness...');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;

        const indentMatch = line.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1].length : 0;
        const name = line.trim();

        if (!name) continue;

        const isDirectory = name.endsWith('/');
        const cleanName = name.replace(/\/$/, '');

        while (
          pathStack.length > 0 &&
          pathStack[pathStack.length - 1].indent >= indent
        ) {
          pathStack.pop();
        }

        let currentPath = '';
        if (pathStack.length > 0) {
          currentPath = pathStack.map((p) => p.name).join('/') + '/';
        }

        const fullPath = currentPath + cleanName;

        if (isDirectory) {
          pathStack.push({ name: cleanName, indent });
          structure[fullPath + '/'] = 'directory';
        } else {
          structure[fullPath] = 'file';
        }

        console.log(`[FPT]   ${fullPath} (${isDirectory ? 'dir' : 'file'})`);
      }

      console.log('[FPT] Parsed structure:', Object.keys(structure));
      return structure;
    } catch (error) {
      console.error('[FPT] Error parsing .fpt file:', error);
      return {};
    }
  }

  getActualStructure(dirPath, basePath = dirPath) {
    const structure: string[] = [];

    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        if (item.endsWith('.fpt')) continue;

        const itemPath = path.join(dirPath, item);
        const relativePath = path.relative(basePath, itemPath);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          structure.push(relativePath + '/');
          const subStructure = this.getActualStructure(itemPath, basePath);
          structure.push(...subStructure);
        } else {
          structure.push(relativePath);
        }
      }
    } catch (error) {
      console.error('[FPT] Error getting actual structure:', error);
    }

    return structure;
  }

  async verifyFptStructure(extractDir) {
    try {
      console.log('[FPT] ========== STARTING FPT VERIFICATION ==========');
      console.log('[FPT] Extract directory:', extractDir);

      console.log('[FPT] Listing contents of extract directory:');
      const extractContents = fs.readdirSync(extractDir);
      extractContents.forEach((item) => {
        const itemPath = path.join(extractDir, item);
        const isDir = fs.statSync(itemPath).isDirectory();
        console.log('[FPT]   -', item, isDir ? '(directory)' : '(file)');
      });

      const fptPath = this.findFptFile(extractDir);

      if (!fptPath) {
        console.log(
          '[FPT] No .fpt file found, skipping structure verification',
        );
        return;
      }

      console.log('[FPT] Found .fpt file at:', fptPath);
      const expectedStructure = this.parseFptFile(fptPath);

      if (Object.keys(expectedStructure).length === 0) {
        console.warn('[FPT] Empty or invalid .fpt file, skipping verification');
        return;
      }

      const fptDir = path.dirname(fptPath);
      console.log('[FPT] FPT directory:', fptDir);
      console.log('[FPT] Extract dir === FPT dir:', extractDir === fptDir);

      const firstExpectedFile = Object.keys(expectedStructure).find(
        (f) => expectedStructure[f] === 'file',
      );
      if (!firstExpectedFile) {
        console.warn('[FPT] No files found in .fpt structure, skipping');
        return;
      }

      console.log('[FPT] First expected file:', firstExpectedFile);
      const expectedFilePath = path.join(fptDir, firstExpectedFile);
      console.log('[FPT] Looking for file at:', expectedFilePath);
      const fileExists = fs.existsSync(expectedFilePath);

      console.log('[FPT] File exists at FPT dir root:', fileExists);

      if (fileExists && fptDir !== extractDir) {
        console.log('[FPT] Files are correct but .fpt is in subdirectory');
        console.log(
          '[FPT] Need to reorganize files according to .fpt structure',
        );

        await this.reorganizeByFptStructure(fptDir, expectedStructure);
        console.log('[FPT] ✓ Files reorganized according to .fpt structure');

        const relativePath = path.relative(extractDir, fptDir);
        const pathParts = relativePath.split(path.sep);

        if (pathParts.length === 2) {
          const firstLevel = path.join(extractDir, pathParts[0]);
          console.log('[FPT] Moving reorganized files from:', fptDir);
          console.log('[FPT] Moving to:', firstLevel);
          await this.reorganizeToRoot(fptDir, firstLevel);
          console.log('[FPT] ✓ Files moved up one level');
        }

        if (fs.existsSync(fptPath)) {
          fs.unlinkSync(fptPath);
          console.log('[FPT] ✓ Removed .fpt file');
        }
      } else if (fileExists && fptDir === extractDir) {
        console.log('[FPT] Files at correct location, reorganizing structure');
        await this.reorganizeByFptStructure(fptDir, expectedStructure);
        console.log('[FPT] ✓ Files reorganized according to .fpt structure');

        if (fs.existsSync(fptPath)) {
          fs.unlinkSync(fptPath);
          console.log('[FPT] ✓ Removed .fpt file');
        }
      } else if (!fileExists) {
        console.log('[FPT] Files not at root, searching in subdirectories...');

        const items = fs.readdirSync(fptDir);
        console.log('[FPT] Items in FPT dir:', items);
        let foundSubdir: string | null = null;

        for (const item of items) {
          console.log('[FPT] Checking item:', item);
          if (
            item.endsWith('.fpt') ||
            item === 'info.toml' ||
            item === 'preview.webp'
          ) {
            console.log('[FPT]   -> Skipping (ignored file)');
            continue;
          }

          const itemPath = path.join(fptDir, item);
          const stat = fs.statSync(itemPath);

          if (stat.isDirectory()) {
            console.log(
              '[FPT]   -> Is directory, checking for:',
              firstExpectedFile,
            );
            const testPath = path.join(itemPath, firstExpectedFile);
            console.log('[FPT]   -> Test path:', testPath);
            const exists = fs.existsSync(testPath);
            console.log('[FPT]   -> Exists:', exists);

            if (exists) {
              foundSubdir = itemPath;
              console.log('[FPT] ✓ Found files in subdirectory:', item);
              break;
            }
          } else {
            console.log('[FPT]   -> Is file, skipping');
          }
        }

        if (foundSubdir) {
          console.log('[FPT] Starting reorganization...');
          console.log('[FPT] Source:', foundSubdir);
          console.log('[FPT] Target:', fptDir);
          await this.reorganizeToRoot(foundSubdir, fptDir);
          console.log('[FPT] ✓ Files reorganized successfully');

          if (fs.existsSync(fptPath)) {
            fs.unlinkSync(fptPath);
            console.log('[FPT] ✓ Removed .fpt file');
          }
        } else {
          console.warn('[FPT] ⚠ Could not find expected files anywhere');
          console.warn('[FPT] Searched in:', fptDir);
          console.warn('[FPT] Looking for:', firstExpectedFile);
        }
      }

      console.log('[FPT] ========== FPT VERIFICATION COMPLETE ==========');
    } catch (error) {
      console.error('[FPT] Error during structure verification:', error);
      console.error('[FPT] Stack trace:', error.stack);
    }
  }

  async reorganizeByFptStructure(baseDir, fptStructure) {
    try {
      console.log('[FPT] [RESTRUCTURE] ========== START ==========');
      console.log('[FPT] [RESTRUCTURE] Base directory:', baseDir);

      const filesToMove: Record<string, string> = {};

      for (const [fptPath, type] of Object.entries(fptStructure)) {
        if (type === 'file') {
          const fileName = path.basename(fptPath);
          const targetPath = path.join(baseDir, fptPath);

          const foundPath = this.findFileRecursive(baseDir, fileName);

          if (foundPath && foundPath !== targetPath) {
            filesToMove[foundPath] = targetPath;
            console.log('[FPT] [RESTRUCTURE] Need to move:', fileName);
            console.log('[FPT] [RESTRUCTURE]   From:', foundPath);
            console.log('[FPT] [RESTRUCTURE]   To:', targetPath);
          }
        }
      }

      for (const [sourcePath, targetPath] of Object.entries(filesToMove)) {
        try {
          const targetDirPath = path.dirname(targetPath);
          if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true });
            console.log(
              '[FPT] [RESTRUCTURE] Created directory:',
              targetDirPath,
            );
          }

          if (fs.existsSync(targetPath)) {
            fs.unlinkSync(targetPath);
          }

          this.copyRecursiveSync(sourcePath, targetPath);
          fs.unlinkSync(sourcePath);

          console.log(
            '[FPT] [RESTRUCTURE] ✓ Moved:',
            path.basename(sourcePath),
          );
        } catch (error) {
          console.error('[FPT] [RESTRUCTURE] ✗ Failed to move:', sourcePath);
          console.error('[FPT] [RESTRUCTURE] Error:', error.message);
        }
      }

      console.log('[FPT] [RESTRUCTURE] ========== COMPLETE ==========');
    } catch (error) {
      console.error('[FPT] [RESTRUCTURE] Fatal error:', error.message);
      console.error('[FPT] [RESTRUCTURE] Stack:', error.stack);
    }
  }

  findFileRecursive(dirPath, fileName) {
    try {
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        if (item.endsWith('.fpt')) continue;

        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);

        if (stat.isFile() && item === fileName) {
          return itemPath;
        } else if (stat.isDirectory()) {
          const found = this.findFileRecursive(itemPath, fileName);
          if (found) return found;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async reorganizeToRoot(sourceDir, targetDir) {
    try {
      console.log('[FPT] [REORGANIZE] ========== START ==========');
      console.log('[FPT] [REORGANIZE] Source:', sourceDir);
      console.log('[FPT] [REORGANIZE] Target:', targetDir);

      if (!fs.existsSync(sourceDir)) {
        console.error('[FPT] [REORGANIZE] Source directory does not exist!');
        return;
      }

      if (!fs.existsSync(targetDir)) {
        console.error('[FPT] [REORGANIZE] Target directory does not exist!');
        return;
      }

      const items = fs.readdirSync(sourceDir);
      console.log('[FPT] [REORGANIZE] Total items to move:', items.length);
      console.log('[FPT] [REORGANIZE] Items:', items);

      for (const item of items) {
        try {
          const sourcePath = path.join(sourceDir, item);
          const targetPath = path.join(targetDir, item);

          console.log(
            '[FPT] [REORGANIZE] ----------------------------------------',
          );
          console.log('[FPT] [REORGANIZE] Processing:', item);
          console.log('[FPT] [REORGANIZE]   Source:', sourcePath);
          console.log('[FPT] [REORGANIZE]   Target:', targetPath);

          const sourceStats = fs.statSync(sourcePath);
          console.log(
            '[FPT] [REORGANIZE]   Type:',
            sourceStats.isDirectory() ? 'DIRECTORY' : 'FILE',
          );

          if (fs.existsSync(targetPath)) {
            console.log(
              '[FPT] [REORGANIZE]   Target already exists, removing...',
            );
            try {
              if (fs.statSync(targetPath).isDirectory()) {
                fs.rmSync(targetPath, {
                  recursive: true,
                  force: true,
                });
                console.log(
                  '[FPT] [REORGANIZE]   ✓ Removed existing directory',
                );
              } else {
                fs.unlinkSync(targetPath);
                console.log('[FPT] [REORGANIZE]   ✓ Removed existing file');
              }
            } catch (removeError) {
              console.error(
                '[FPT] [REORGANIZE]   ✗ Failed to remove existing:',
                removeError.message,
              );
            }
          }

          console.log('[FPT] [REORGANIZE]   Copying to target...');
          this.copyRecursiveSync(sourcePath, targetPath);
          console.log('[FPT] [REORGANIZE]   ✓ Copied successfully');

          console.log('[FPT] [REORGANIZE]   Removing source...');
          if (sourceStats.isDirectory()) {
            fs.rmSync(sourcePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(sourcePath);
          }
          console.log('[FPT] [REORGANIZE]   ✓ Removed source');
        } catch (itemError) {
          console.error('[FPT] [REORGANIZE]   ✗ Failed to process item:', item);
          console.error('[FPT] [REORGANIZE]   Error:', itemError.message);
          console.error('[FPT] [REORGANIZE]   Stack:', itemError.stack);
        }
      }

      console.log(
        '[FPT] [REORGANIZE] ----------------------------------------',
      );
      console.log('[FPT] [REORGANIZE] Checking source directory...');
      if (fs.existsSync(sourceDir)) {
        const remaining = fs.readdirSync(sourceDir);
        console.log(
          '[FPT] [REORGANIZE] Remaining items in source:',
          remaining.length,
        );

        if (remaining.length === 0) {
          console.log('[FPT] [REORGANIZE] Removing empty source directory...');
          fs.rmdirSync(sourceDir);
          console.log('[FPT] [REORGANIZE] ✓ Removed empty directory');
        } else {
          console.log(
            '[FPT] [REORGANIZE] Source directory not empty:',
            remaining,
          );
        }
      } else {
        console.log('[FPT] [REORGANIZE] Source directory already removed');
      }

      console.log('[FPT] [REORGANIZE] ========== COMPLETE ==========');
    } catch (error) {
      console.error('[FPT] [REORGANIZE] ========== ERROR ==========');
      console.error(
        '[FPT] [REORGANIZE] Fatal error during reorganization:',
        error.message,
      );
      console.error('[FPT] [REORGANIZE] Stack trace:', error.stack);
      throw error;
    }
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
