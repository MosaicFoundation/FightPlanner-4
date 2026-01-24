import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

import { CONFLICT_WHITELIST_PATTERNS } from './config';
import { ModInstallResult } from './plugin-update-installer';
import { FileExtractor } from './utils/file-extractor';

interface ModInfo {
  display_name: string;
  description: string;
  s_name?: string;
  authors?: string;
  version?: string;
  category?: string;
  url?: string;
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

  /**
   * Scan a mod folder for slot patterns (c00-c07)
   * @param {string} modFolderPath - Path to the mod folder
   * @returns {Array<Object>} Array of slot objects with slot number and files
   */
  static scanModForSlots(modFolderPath: string): {
    slot: number;
    files: Slot[];
  }[] {
    const slots: Record<number, Slot[]> = {};

    try {
      const slotPattern = /c0[0-7]/gi;

      const scanDirectory = (dirPath, relativePath = '') => {
        if (!fs.existsSync(dirPath)) return;

        const entries = fs.readdirSync(dirPath, {
          withFileTypes: true,
        });

        entries.forEach((entry) => {
          const fullPath = path.join(dirPath, entry.name);
          const relPath = relativePath
            ? path.join(relativePath, entry.name)
            : entry.name;

          if (entry.isDirectory()) {
            const matches = entry.name.match(slotPattern);
            if (matches) {
              const uniqueSlots: Set<number> = new Set();

              matches.forEach((match) => {
                const slotNum = parseInt(match.toLowerCase().charAt(2));
                uniqueSlots.add(slotNum);
              });

              uniqueSlots.forEach((slotNum) => {
                if (!slots[slotNum]) {
                  slots[slotNum] = [];
                }

                const exists = slots[slotNum].some(
                  (item) => item.path === relPath,
                );

                if (!exists) {
                  slots[slotNum].push({
                    path: relPath,
                    type: 'directory',
                    name: entry.name,
                    parent: relativePath || '(root)',
                  });
                }
              });
            }

            try {
              scanDirectory(fullPath, relPath);
            } catch (err) {
              console.warn(`Cannot scan subdirectory ${relPath}:`, err.message);
            }
          } else if (entry.isFile()) {
            const matches = entry.name.match(slotPattern);

            if (matches) {
              const uniqueSlots: Set<number> = new Set();

              matches.forEach((match) => {
                const slotNum = parseInt(match.toLowerCase().charAt(2));
                uniqueSlots.add(slotNum);
              });

              uniqueSlots.forEach((slotNum) => {
                if (!slots[slotNum]) {
                  slots[slotNum] = [];
                }
                const exists = slots[slotNum].some(
                  (item) => item.path === relPath,
                );

                if (!exists) {
                  slots[slotNum].push({
                    path: relPath,
                    type: 'file',
                    name: entry.name,
                    parent: relativePath || '(root)',
                  });
                }
              });
            }
          }
        });
      };

      console.log(`Scanning mod folder for slots: ${modFolderPath}`);
      scanDirectory(modFolderPath);

      const slotsArray = Object.keys(slots)
        .map((slotNum) => ({
          slot: parseInt(slotNum),
          files: slots[slotNum].sort((a, b) => {
            if (a.type !== b.type) {
              return a.type === 'directory' ? -1 : 1;
            }

            return a.path.localeCompare(b.path);
          }),
        }))
        .sort((a, b) => a.slot - b.slot);

      console.log(
        `Found ${slotsArray.length} different slot(s):`,
        slotsArray
          .map((s) => `c0${s.slot} (${s.files.length} items)`)
          .join(', '),
      );

      return slotsArray;
    } catch (error) {
      console.error('Error scanning mod for slots:', error);
      return [];
    }
  }

  /**
   * Get all used slots for a specific fighter across all active mods
   * @param {string} modsPath - Path to the mods directory
   * @param {string} fighterId - Fighter ID to check
   * @param {string|null} excludeModPath - Optional mod path to exclude from check
   * @returns {Array<number>} Array of used slot numbers (0-7)
   */
  static getUsedSlotsForFighter(
    modsPath,
    fighterId,
    excludeModPath: string | null = null,
  ) {
    const usedSlots: Set<number> = new Set();
    const slotPattern = /c0[0-7]/gi;

    try {
      const allMods = this.readAllMods(modsPath);
      const activeMods = allMods.activeMods;

      activeMods.forEach((mod) => {
        if (excludeModPath && mod.path === excludeModPath) {
          return;
        }
        const fighterPath = path.join(mod.path, 'fighter', fighterId);

        if (!fs.existsSync(fighterPath)) {
          return;
        }

        const scanFighterDirectory = (dirPath) => {
          if (!fs.existsSync(dirPath)) return;

          try {
            const entries = fs.readdirSync(dirPath, {
              withFileTypes: true,
            });

            entries.forEach((entry) => {
              const fullPath = path.join(dirPath, entry.name);

              if (entry.isDirectory()) {
                const matches = entry.name.match(slotPattern);
                if (matches) {
                  matches.forEach((match) => {
                    const slotNum = parseInt(match.toLowerCase().charAt(2));
                    usedSlots.add(slotNum);
                  });
                }
                scanFighterDirectory(fullPath);
              } else if (entry.isFile()) {
                const matches = entry.name.match(slotPattern);
                if (matches) {
                  matches.forEach((match) => {
                    const slotNum = parseInt(match.toLowerCase().charAt(2));
                    usedSlots.add(slotNum);
                  });
                }
              }
            });
          } catch (err) {
            console.warn(
              `Error scanning fighter directory ${dirPath}:`,
              err.message,
            );
          }
        };

        scanFighterDirectory(fighterPath);
      });

      return Array.from(usedSlots).sort((a, b) => a - b);
    } catch (error) {
      console.error('Error getting used slots for fighter:', error);
      return [];
    }
  }

  /**
   * Find the first available slot number
   * @param {Array<number>} usedSlots - Array of used slot numbers
   * @returns {number|null} Available slot number or null if all slots are used
   */
  static findAvailableSlot(usedSlots) {
    for (let i = 0; i <= 7; i++) {
      if (!usedSlots.includes(i)) {
        return i;
      }
    }
    return null;
  }

  /**
   * Scan a mod folder for slot patterns for a specific fighter
   * @param {string} modFolderPath - Path to the mod folder
   * @param {string} fighterId - Fighter ID to scan
   * @returns {Array<number>} Array of slot numbers used by this fighter
   */
  static scanModForSlotsByFighter(modFolderPath: string, fighterId: string) {
    const slots: Set<number> = new Set();
    const slotPattern = /c0[0-7]/gi;

    try {
      const fighterPath = path.join(modFolderPath, 'fighter', fighterId);

      if (!fs.existsSync(fighterPath)) {
        return [];
      }

      const scanFighterDirectory = (dirPath) => {
        if (!fs.existsSync(dirPath)) return;

        try {
          const entries = fs.readdirSync(dirPath, {
            withFileTypes: true,
          });

          entries.forEach((entry) => {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
              const matches = entry.name.match(slotPattern);
              if (matches) {
                matches.forEach((match) => {
                  const slotNum = parseInt(match.toLowerCase().charAt(2));
                  slots.add(slotNum);
                });
              }
              scanFighterDirectory(fullPath);
            } else if (entry.isFile()) {
              const matches = entry.name.match(slotPattern);
              if (matches) {
                matches.forEach((match) => {
                  const slotNum = parseInt(match.toLowerCase().charAt(2));
                  slots.add(slotNum);
                });
              }
            }
          });
        } catch (err) {
          console.warn(
            `Error scanning fighter directory ${dirPath}:`,
            err.message,
          );
        }
      };

      scanFighterDirectory(fighterPath);

      return Array.from(slots).sort((a, b) => a - b);
    } catch (error) {
      console.error('Error scanning mod slots for fighter:', error);
      return [];
    }
  }

  /**
   * Apply slot changes to a mod (rename files/folders with slot patterns)
   * @param {string} modFolderPath - Path to the mod folder
   * @param {Object} changes - Changes object with modifications array
   * @returns {Object} Result object with success status
   */
  static applySlotChanges(modFolderPath, changes) {
    try {
      const modificationsMap = new Map();

      changes.modifications.forEach((mod) => {
        if (mod.type === 'change') {
          modificationsMap.set(mod.originalSlot, mod.newSlot);
        }
      });

      const tempPrefix = 'TMPSLOT';
      const renamedPaths: { new: string; old: string; type: string }[] = [];

      modificationsMap.forEach((newSlot, originalSlot) => {
        const tempName = `${tempPrefix}_${originalSlot}`;
        const result = this.renameSlotInMod(
          modFolderPath,
          `c0${originalSlot}`,
          tempName,
        );

        renamedPaths.push(...result);
      });

      modificationsMap.forEach((newSlot, originalSlot) => {
        const tempName = `${tempPrefix}_${originalSlot}`;
        this.renameSlotInMod(modFolderPath, tempName, `c0${newSlot}`);
      });

      this.updateConfigJsonSlots(modFolderPath, modificationsMap);

      return { success: true };
    } catch (error) {
      console.error('Error applying slot changes:', error);
      return { success: false, error: error.message };
    }
  }

  static renameSlotInMod(
    modFolderPath: string,
    oldPattern: string,
    newPattern: string,
  ) {
    const renamedPaths: { old: string; new: string; type: string }[] = [];

    const escapedPattern = oldPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const oldRegex = new RegExp(escapedPattern, 'gi');

    const renameInDirectory = (dirPath) => {
      if (!fs.existsSync(dirPath)) return;

      let entries;
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (err) {
        console.warn(`Cannot read directory ${dirPath}:`, err.message);
        return;
      }

      const itemsToRename: {
        oldPath: string;
        oldName: string;
        isDirectory: boolean;
      }[] = [];

      entries.forEach((entry) => {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          try {
            renameInDirectory(fullPath);
          } catch (err) {
            console.warn(
              `Error processing subdirectory ${fullPath}:`,
              err.message,
            );
          }

          if (entry.name.match(oldRegex)) {
            itemsToRename.push({
              oldPath: fullPath,
              oldName: entry.name,
              isDirectory: true,
            });
          }
        } else if (entry.isFile()) {
          if (entry.name.match(oldRegex)) {
            itemsToRename.push({
              oldPath: fullPath,
              oldName: entry.name,
              isDirectory: false,
            });
          }
        }
      });

      itemsToRename.forEach((item) => {
        let newName = item.oldName.replace(oldRegex, newPattern);
        const newPath = path.join(dirPath, newName);

        if (!fs.existsSync(newPath)) {
          try {
            fs.renameSync(item.oldPath, newPath);
            renamedPaths.push({
              old: item.oldPath,
              new: newPath,
              type: item.isDirectory ? 'directory' : 'file',
            });

            console.log(
              `Renamed ${item.isDirectory ? 'folder' : 'file'}: ${item.oldName} -> ${newName}`,
            );
          } catch (err) {
            console.error(`Failed to rename ${item.oldPath}:`, err.message);
          }
        } else {
          console.warn(
            `Cannot rename ${item.oldName} to ${newName}: target already exists`,
          );
        }
      });
    };

    console.log(
      `Renaming pattern "${oldPattern}" to "${newPattern}" in ${modFolderPath}`,
    );
    renameInDirectory(modFolderPath);
    console.log(`Renamed ${renamedPaths.length} item(s)`);
    return renamedPaths;
  }

  static updateConfigJsonSlots(modFolderPath, modificationsMap) {
    const configPath = path.join(modFolderPath, 'config.json');

    if (!fs.existsSync(configPath)) {
      console.log('No config.json found - skipping');
      return;
    }

    try {
      console.log('Updating config.json slot references...');
      const configContent = fs.readFileSync(configPath, 'utf8');
      let updatedContent = configContent;

      modificationsMap.forEach((newSlot, originalSlot) => {
        const oldPattern = `c0${originalSlot}`;
        const newPattern = `c0${newSlot}`;

        updatedContent = updatedContent.replace(
          new RegExp(oldPattern, 'gi'),
          newPattern,
        );
        updatedContent = updatedContent.replace(
          new RegExp(oldPattern.toUpperCase(), 'g'),
          newPattern.toUpperCase(),
        );
      });

      fs.writeFileSync(configPath, updatedContent, 'utf8');
      console.log('config.json updated successfully');
    } catch (error) {
      console.error('Error updating config.json:', error);
    }
  }

  /**
   * @param {Array<Object>} activeMods - Array of active mod objects
   * @param {Array<string>} whitelistPatterns - Patterns to exclude from conflict detection
   * @returns {Promise<Array<Object>>} Array of conflict objects with filePath and mods
   */
  static async detectConflicts(
    activeMods: Mod[],
    whitelistPatterns: string[] = [],
  ) {
    const conflicts: {
      filePath: string;
      mods: { name: string; path: string }[];
    }[] = [];
    const fileToMods = new Map();

    const allPatterns = [...CONFLICT_WHITELIST_PATTERNS, ...whitelistPatterns];

    const scanMod = async (
      dirPath,
      relativePath = '',
      modIndex,
      modName,
      modPath,
    ) => {
      if (!fs.existsSync(dirPath)) return;

      try {
        const entries = await fs.promises.readdir(dirPath, {
          withFileTypes: true,
        });

        const tasks = entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          const relPath = relativePath
            ? path.join(relativePath, entry.name)
            : entry.name;

          if (
            allPatterns.some((pattern) => {
              if (typeof pattern === 'string') {
                return relPath.includes(pattern);
              }
              return false;
            })
          ) {
            return;
          }

          if (entry.isDirectory()) {
            await scanMod(fullPath, relPath, modIndex, modName, modPath);
          } else if (entry.isFile()) {
            const normalizedPath = relPath.replace(/\\/g, '/');

            if (!fileToMods.has(normalizedPath)) {
              fileToMods.set(normalizedPath, []);
            }
            fileToMods.get(normalizedPath).push({
              modIndex,
              modName,
              modPath,
              filePath: normalizedPath,
            });
          }
        });

        await Promise.all(tasks);
      } catch (error) {
        console.warn(`Error scanning directory ${dirPath}:`, error.message);
      }
    };

    await Promise.all(
      activeMods.map(async (mod, modIndex) => {
        if (mod.path && fs.existsSync(mod.path)) {
          await scanMod(mod.path, '', modIndex, mod.name, mod.path);
        }
      }),
    );

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

      let tempExtractDir: string | null = null;
      let extractedItems: string[] = [];
      let modFolderName: string | null = null;

      if (isArchive) {
        console.log('Installing mod from archive:', sourcePath);

        tempExtractDir = path.join(
          app.getPath('temp'),
          'fightplanner-extract',
          `mod-${Date.now()}`,
        );

        if (!fs.existsSync(tempExtractDir)) {
          fs.mkdirSync(tempExtractDir, { recursive: true });
        }

        await FileExtractor.extractArchive(sourcePath, tempExtractDir);
        extractedItems = fs.readdirSync(tempExtractDir);
        console.log('Extracted items:', extractedItems);

        if (
          extractedItems.length === 1 &&
          fs
            .statSync(path.join(tempExtractDir, extractedItems[0]))
            .isDirectory()
        ) {
          modFolderName = extractedItems[0];
        } else {
          modFolderName = path.basename(sourcePath, ext);
        }
      } else if (isDirectory) {
        console.log('Installing mod from directory:', sourcePath);
        modFolderName = path.basename(sourcePath);
      } else {
        throw new Error(
          'Source path must be an archive file (.zip, .rar, .7z, etc.) or a directory',
        );
      }

      let finalModPath = path.join(modsPath, modFolderName);

      if (fs.existsSync(finalModPath)) {
        console.log('Mod already exists, removing old version');
        fs.rmSync(finalModPath, { recursive: true, force: true });
      }

      if (isArchive) {
        const sourceModPath = path.join(tempExtractDir!, modFolderName);
        if (fs.existsSync(sourceModPath)) {
          console.log('Copying mod from temp to mods folder...');
          this.copyRecursiveSync(sourceModPath, finalModPath);
        } else {
          console.log('Copying multiple items to mods folder...');
          this.copyRecursiveSync(tempExtractDir, finalModPath);
        }
      } else {
        console.log('Moving mod directory to mods folder...');
        fs.renameSync(sourcePath, finalModPath);
      }

      if (tempExtractDir && fs.existsSync(tempExtractDir)) {
        try {
          fs.rmSync(tempExtractDir, { recursive: true, force: true });
        } catch (err) {
          console.warn('Failed to cleanup temp directory:', err.message);
        }
      }

      if (isArchive && fs.existsSync(sourcePath)) {
        try {
          fs.unlinkSync(sourcePath);
          console.log('Deleted original archive file');
        } catch (err) {
          console.warn('Failed to delete original archive:', err.message);
        }
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
