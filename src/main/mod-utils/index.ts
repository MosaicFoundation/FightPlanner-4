import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

import { ModInstallResult } from '../plugin-update-installer';
import { FileExtractor } from '../utils/file-extractor';
import { ModScanner } from './mod-scanner';
import { CONFLICT_WHITELIST_PATTERNS } from '../config';
import sharedStore from '../store';

interface ModInfo {
  display_name: string;
  description: string;
  s_name?: string;
  authors?: string;
  version?: string;
  category?: string;
  url?: string;
}

export interface SlotChanges {
  modifications?: Array<{
    type: string;
    originalSlot?: string | null;
    newSlot?: string;
    files?: Array<any>;
    targetSlot?: string;
  }>;
}

export interface Slot {
  path: string;
  type: 'file' | 'directory';
  name: string;
  parent: string;
}

export interface Mod {
  name: string;
  path: string;
  status: 'active' | 'disabled';
}

export default class ModUtils {
  // Add this helper method to the ModUtils class
  private static _findDirWithModFiles(rootDir: string): string | undefined {
    const checkIfModDir = (dir: string): boolean => {
      return (
        fs.existsSync(path.join(dir, 'config.json')) ||
        fs.existsSync(path.join(dir, 'ui')) ||
        fs.existsSync(path.join(dir, 'stage')) ||
        fs.existsSync(path.join(dir, 'sound')) ||
        fs.existsSync(path.join(dir, 'fighter'))
      );
    };

    if (checkIfModDir(rootDir)) {
      return rootDir;
    }

    const items = fs.readdirSync(rootDir);

    for (const item of items) {
      const itemPath = path.join(rootDir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        if (checkIfModDir(itemPath)) {
          return itemPath;
        }

        const nested = this._findDirWithModFiles(itemPath);

        if (nested) {
          return nested;
        }
      }
    }
  }

  /**
   * Get the path to the disabled mods folder
   * @param {string} activeModsPath - Path to the active mods folder
   * @returns {string} Path to the disabled mods folder
   */
  static getDisabledModsFolder(activeModsPath) {
    const parentDir = path.dirname(activeModsPath);
    return path.join(parentDir, '{disabled_mod}');
  }

  /**
   * Read all mods from a folder
   * @param {string} folderPath - Path to the folder containing mods
   * @param {string} status - Status of the mods ('active' or 'disabled')
   * @returns {Array<Object>} Array of mod objects with name, path, and status
   */
  static readModsFromFolder(
    folderPath: string,
    status: 'active' | 'disabled' = 'active',
  ) {
    const mods: Mod[] = [];

    if (!fs.existsSync(folderPath)) {
      console.log(`Folder does not exist: ${folderPath}`);
      return mods;
    }

    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true });

      entries.forEach((entry) => {
        if (entry.isDirectory()) {
          const modPath = path.join(folderPath, entry.name);
          mods.push({
            name: entry.name,
            path: modPath,
            status: status,
          });
        }
      });
    } catch (error) {
      console.error(`Error reading folder ${folderPath}:`, error);
    }

    return mods;
  }

  /**
   * Get the path to the preview image for a mod
   * @param {string} modFolderPath - Path to the mod folder
   * @returns {string|null} Path to the preview image or null if not found
   */
  static getPreviewImagePath(modFolderPath) {
    try {
      const previewPath = path.join(modFolderPath, 'preview.webp');

      if (fs.existsSync(previewPath)) {
        return previewPath;
      }

      return null;
    } catch (error) {
      console.error('Error getting preview path:', error);
      return null;
    }
  }

  /**
   * Convert a file path to a file:// URL
   * @param {string} filePath - File path to convert
   * @returns {string|null} File URL or null if path is invalid
   */
  static pathToFileUrl(filePath) {
    if (!filePath) return null;

    const normalizedPath = filePath.replace(/\\/g, '/');
    return 'file://' + normalizedPath;
  }

  /**
   * Read mod information from info.toml file
   * @param {string} modFolderPath - Path to the mod folder
   * @returns {Object|null} Mod info object or null if not found/error
   */
  static readModInfo(modFolderPath: string): ModInfo | null {
    try {
      const infoPath = path.join(modFolderPath, 'info.toml');

      if (!fs.existsSync(infoPath)) {
        return null;
      }

      const content = fs.readFileSync(infoPath, 'utf8');

      const info: Partial<ModInfo> = {};
      const lines = content.split('\n');

      let currentKey: string | null = null;
      let multilineValue = '';
      let inMultiline = false;

      lines.forEach((line: string) => {
        const originalLine = line;
        line = line.trim();

        if (!inMultiline && (!line || line.startsWith('#'))) return;

        const tripleQuoteCount = (line.match(/"""/g) || []).length;

        if (tripleQuoteCount > 0) {
          if (!inMultiline) {
            const equalsIndex = line.indexOf('=');

            if (equalsIndex !== -1) {
              currentKey = line.substring(0, equalsIndex).trim();
              inMultiline = true;

              const afterEquals = line.substring(equalsIndex + 1).trim();

              if (afterEquals === '"""') {
              } else if (tripleQuoteCount === 2) {
                const startQuote = afterEquals.indexOf('"""');
                const endQuote = afterEquals.lastIndexOf('"""');
                if (
                  startQuote !== -1 &&
                  endQuote !== -1 &&
                  startQuote !== endQuote
                ) {
                  info[currentKey] = afterEquals.substring(
                    startQuote + 3,
                    endQuote,
                  );
                  inMultiline = false;
                  currentKey = null;
                }
              }
            }
          } else {
            if (currentKey && (line === '"""' || line.endsWith('"""'))) {
              info[currentKey] = multilineValue.trim();
              multilineValue = '';
              inMultiline = false;
              currentKey = null;
            }
          }
        } else if (inMultiline) {
          multilineValue += originalLine + '\n';
        } else if (line.includes('=')) {
          const equalsIndex = line.indexOf('=');
          const key = line.substring(0, equalsIndex).trim();
          let value = line.substring(equalsIndex + 1).trim();

          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }

          info[key] = value;
        }
      });

      return info as ModInfo;
    } catch (error) {
      console.error('Error reading mod info:', error);
      return null;
    }
  }

  /**
   * Read all mods (active and disabled) from a mods directory
   * @param {string} activeModsPath - Path to the active mods folder
   * @returns {Object} Object with activeMods and disabledMods arrays
   */
  static readAllMods(activeModsPath: string) {
    const activeMods = this.readModsFromFolder(activeModsPath, 'active');

    const disabledModsPath = this.getDisabledModsFolder(activeModsPath);
    const disabledMods = this.readModsFromFolder(disabledModsPath, 'disabled');

    console.log(`Found ${activeMods.length} active mods`);
    console.log(`Found ${disabledMods.length} disabled mods`);

    return {
      activeMods,
      disabledMods,
    };
  }

  static async detectConflicts(
    activeMods: Mod[],
    whitelistPatterns: string[] = [],
  ) {
    const conflicts: {
      filePath: string;
      mods: { name: string; path: string }[];
    }[] = [];
    const fileToMods = new Map();

    const allWhitelistPatterns = [
      ...CONFLICT_WHITELIST_PATTERNS,
      ...whitelistPatterns,
    ];
    const scanResults = await Promise.all(
      activeMods.map(async (mod, modIndex) => {
        if (mod.path && fs.existsSync(mod.path)) {
          return ModScanner.scanModFiles(mod.path);
        }
      }),
    );

    function _addToFileMap(modIndex: number, filePath: string) {
      if (
        allWhitelistPatterns.some((pattern) => {
          const regex = new RegExp(pattern);
          return regex.test(filePath);
        })
      ) {
        return;
      }

      if (!fileToMods.has(filePath)) {
        fileToMods.set(filePath, []);
      }

      fileToMods.get(filePath).push({
        modIndex,
        modName: activeMods[modIndex].name,
        modPath: activeMods[modIndex].path,
        filePath: filePath,
      });
    }

    for (const [index, scanResult] of scanResults.entries()) {
      if (scanResult) {
        for (const unknownFile of scanResult.unknownFiles) {
          _addToFileMap(index, unknownFile);
        }

        for (const fighter of Object.keys(scanResult.pathData)) {
          for (const slot of Object.keys(scanResult.pathData[fighter])) {
            const slotData = scanResult.pathData[fighter][slot];

            for (const { original } of slotData.filesToBeModified) {
              _addToFileMap(index, original);
            }
          }
        }
      }
    }

    fileToMods.forEach((modsList, filePath) => {
      if (modsList.length > 1) {
        conflicts.push({
          filePath: filePath,
          mods: modsList.map((m) => ({
            name: m.modName,
            path: m.modPath,
          })),
        });
      }
    });

    return conflicts;
  }

  static copyRecursiveSync(src, dest) {
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

  static async installFromArchive(sourceArchivePath: string, modsPath: string) {
    let tempExtractDir: string | null;
    let extractedItems: string[];

    console.log('Installing mod from archive:', sourceArchivePath);

    tempExtractDir = path.join(
      app.getPath('temp'),
      'fightplanner-extract',
      `mod-${Date.now()}`,
    );

    if (!fs.existsSync(tempExtractDir)) {
      fs.mkdirSync(tempExtractDir, { recursive: true });
    }

    await FileExtractor.extractArchive(sourceArchivePath, tempExtractDir);

    extractedItems = fs.readdirSync(tempExtractDir);
    let isSingleFolderExtract = false;

    if (
      extractedItems.length === 1 &&
      fs.statSync(path.join(tempExtractDir, extractedItems[0])).isDirectory()
    ) {
      isSingleFolderExtract = true;
    }

    // Determine the top-level directory of the downloaded mod
    const topLevelModDir = isSingleFolderExtract
      ? path.join(tempExtractDir, extractedItems[0])
      : tempExtractDir;

    // Find a directory that contains actual mod files (sometimes there is some additional nesting)
    const dirWithModFiles =
      this._findDirWithModFiles(tempExtractDir) || tempExtractDir;

    const finalModFolderName = path.basename(dirWithModFiles);
    const finalModPath = path.join(modsPath, finalModFolderName);

    if (fs.existsSync(finalModPath)) {
      console.log('Mod already exists, removing old version');
      fs.rmSync(finalModPath, { recursive: true, force: true });
    }

    if (fs.existsSync(dirWithModFiles)) {
      console.log('Copying mod files from temp to mods folder...');
      this.copyRecursiveSync(dirWithModFiles, finalModPath);
    } else {
      console.log('Copying multiple items to mods folder...');
      this.copyRecursiveSync(tempExtractDir, finalModPath);
    }

    // If the mod files were found in a nested directory, copy info.toml and preview.webp
    if (dirWithModFiles !== topLevelModDir) {
      const infoTomlSource = path.join(topLevelModDir, 'info.toml');
      const infoTomlDest = path.join(finalModPath, 'info.toml');

      if (fs.existsSync(infoTomlSource) && !fs.existsSync(infoTomlDest)) {
        try {
          fs.copyFileSync(infoTomlSource, infoTomlDest);
          console.log('Copied info.toml from top level directory');
        } catch (err) {
          console.warn('Failed to copy info.toml:', err.message);
        }
      }

      const previewSource = path.join(topLevelModDir, 'preview.webp');
      const previewDest = path.join(finalModPath, 'preview.webp');

      if (fs.existsSync(previewSource) && !fs.existsSync(previewDest)) {
        try {
          fs.copyFileSync(previewSource, previewDest);
          console.log('Copied preview.webp from top level directory');
        } catch (err) {
          console.warn('Failed to copy preview.webp:', err.message);
        }
      }
    }

    if (tempExtractDir && fs.existsSync(tempExtractDir)) {
      try {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      } catch (err) {
        console.warn('Failed to cleanup temp directory:', err.message);
      }
    }

    if (fs.existsSync(sourceArchivePath)) {
      try {
        fs.unlinkSync(sourceArchivePath);
        console.log('Deleted original archive file');
      } catch (err) {
        console.warn('Failed to delete original archive:', err.message);
      }
    }

    return {
      modFolderName: finalModFolderName,
      finalModPath,
    };
  }

  static async installFromDirectory(sourceDirPath: string, modsPath: string) {
    console.log('Installing mod from directory:', sourceDirPath);
    const modFolderName = path.basename(sourceDirPath);

    let finalModPath = path.join(modsPath, modFolderName);

    if (fs.existsSync(finalModPath)) {
      console.log('Mod already exists, removing old version');
      fs.rmSync(finalModPath, { recursive: true, force: true });
    }

    console.log('Moving mod directory to mods folder...');
    fs.renameSync(sourceDirPath, finalModPath);

    return { modFolderName, finalModPath };
  }

  /**
   * Install a mod from a source path (archive or directory) to the mods directory
   * @param {string} sourcePath - Source path (archive file or directory)
   * @param {string} modsPath - Destination mods directory
   * @returns {Promise<Object>} Result object with success status, modPath, and modName
   */
  static async installModFromPath(
    sourcePath: string,
    modsPath: string,
  ): Promise<ModInstallResult> {
    try {
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source path does not exist: ${sourcePath}`);
      }

      if (!modsPath) {
        throw new Error(
          'Mods folder not configured. Please set it in Settings.',
        );
      }

      if (!fs.existsSync(modsPath)) {
        throw new Error('Mods folder does not exist');
      }

      const stats = fs.statSync(sourcePath);
      const isDirectory = stats.isDirectory();
      const ext = path.extname(sourcePath).toLowerCase();
      const isArchive = ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext);

      let modFolderName: string;
      let finalModPath: string;

      if (isArchive) {
        ({ modFolderName, finalModPath } = await this.installFromArchive(
          sourcePath,
          modsPath,
        ));
      } else if (isDirectory) {
        ({ modFolderName, finalModPath } = await this.installFromDirectory(
          sourcePath,
          modsPath,
        ));
      } else {
        throw new Error(
          'Source path must be an archive file (.zip, .rar, .7z, etc.) or a directory',
        );
      }

      if (/^mod-\d+$/.test(modFolderName) && fs.existsSync(finalModPath)) {
        const modInfo = this.readModInfo(finalModPath);
        if (modInfo) {
          const newName = modInfo.s_name || modInfo.display_name;

          if (newName) {
            const sanitizedName = newName.replace(/[<>:"/\\|?*]/g, '_').trim();

            if (sanitizedName && sanitizedName !== modFolderName) {
              const newModPath = path.join(modsPath, sanitizedName);

              if (!fs.existsSync(newModPath)) {
                try {
                  fs.renameSync(finalModPath, newModPath);

                  console.log(
                    `Mod renamed from ${modFolderName} to ${sanitizedName}`,
                  );

                  modFolderName = sanitizedName;
                  finalModPath = newModPath;
                } catch (renameErr) {
                  console.warn(`Failed to rename mod: ${renameErr.message}`);
                }
              }
            }
          }
        }
      }

      console.log('Mod installed successfully to:', finalModPath);

      if (sharedStore.get('autoDisableNewMods')) {
        try {
          const modName = path.basename(finalModPath);
          const parentDir = path.dirname(modsPath);
          const disabledModsPath = path.join(parentDir, '{disabled_mod}');

          if (!fs.existsSync(disabledModsPath)) {
            fs.mkdirSync(disabledModsPath, { recursive: true });
          }

          const targetPath = path.join(disabledModsPath, modName);
          if (!fs.existsSync(targetPath)) {
            fs.renameSync(finalModPath, targetPath);

            console.log(
              `[AutoDisable] Moved ${modName} to disabled mods folder`,
            );

            finalModPath = targetPath;
          } else {
            console.warn(
              `[AutoDisable] Cannot move ${modName}, target already exists`,
            );
          }
        } catch (disableError) {
          console.error('[AutoDisable] Failed to disable mod:', disableError);
        }
      }

      return {
        success: true,
        modPath: finalModPath,
        modName: modFolderName,
      };
    } catch (error) {
      console.error('Error installing mod from path:', error);
      return { success: false, error: error.message };
    }
  }
}
