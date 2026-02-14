import fs from 'fs';
import path from 'path';
import { PATHS } from '../config';
import { ModFileOperations } from '../mod-file-operations';

/**
 * The full scan mod result for a given mod path.
 *
 * @property pathData - An object containing the paths and files to be modified, organized by fighter and slot.
 * @property currentSlots - An array of the current slots detected in the mod.
 * @property unknownFiles - An array of file paths that could not be categorized into a fighter or slot.
 * @property fighterNames - All detected internal fighter names for the mod files.
 */
export interface ScanModResult {
  pathData: PathData;
  currentSlots: string[];
  unknownFiles: string[];
  fighterNames: string[];
}

export interface PathDataForSlot {
  pathsToBeModified: PathDataEntry[];
  filesToBeModified: PathDataEntry[];
}

export type PathData = Record<string, Record<string, PathDataForSlot>>;

export interface PathDataEntry {
  original: string;
  normalized: string | null;
  type: 'file' | 'directory';
}

export const ModScanner = {
  /**
   * Scans the mod directory for files and folders to be modified.
   * If a fighter name is detected, it organizes the data accordingly.
   *
   * Sample structure of returned pathData:
   * {
   *   "mario": {
   *     "c01": {
   *       pathsToBeModified: [ { original: 'fighter/mario/c01', normalized: 'fighter/mario/c###' } ],
   *       filesToBeModified: [ { original: 'fighter/mario/tex_mario_c01.nutexb', normalized: 'fighter/mario/tex_mario_c###.nutexb' } ]
   *     },
   *     "c02": {
   *       pathsToBeModified: [ ... ],
   *       filesToBeModified: [ ... ]
   *     }
   *   },
   *   "link": {
   *     "c01": { ... },
   *     ...
   *   }
   * }
   *
   * @param modPath
   */
  async scanModFiles(modPath: string): Promise<ScanModResult> {
    try {
      const files = await fs.promises.readdir(modPath, {
        recursive: true,
        withFileTypes: true,
      });

      const pathData: PathData = {};
      const unknownFiles: string[] = [];

      const slots = new Set<string>();
      const fighterNames = new Set<string>();

      await Promise.all(
        files.map(async (fileOrDirectory) => {
          function _createPathDataEntry(fighterName: string, slot: string) {
            if (!pathData[fighterName]) {
              pathData[fighterName] = {};
            }

            if (!pathData[fighterName][slot]) {
              pathData[fighterName][slot] = {
                pathsToBeModified: [],
                filesToBeModified: [],
              };
            }
          }

          // Construct the relative path from the mod folder
          const absolutePath = path.join(
            fileOrDirectory.parentPath,
            fileOrDirectory.name,
          );

          const relativePath = path.relative(modPath, absolutePath);

          if (fileOrDirectory.name.startsWith('.')) {
            // Ignore hidden files and folders (like .DS_Store or .git)
            return;
          }

          const {
            slot,
            fighterName,
            normalizedPath,
            isFighterSlotFolder,
            includesFighterSlotFolder,
          } = await ModScanner.extractFighterAndSlotInfo(relativePath);

          if (fighterName) {
            fighterNames.add(fighterName);

            const slotKey = slot || 'unknown';
            const isFile = fileOrDirectory.isFile();

            // Ignore unknown slots unless we are working with the full file path
            if (slotKey === 'unknown' && !isFile) {
              return;
            }

            slots.add(slotKey);
            _createPathDataEntry(fighterName, slotKey);

            if (isFile) {
              pathData[fighterName][slotKey].filesToBeModified.push({
                original: relativePath,
                normalized: normalizedPath,
                type: 'file',
              });
            }

            // Do not add any subfolders or files within a fighter slot folder to pathsToBeModified, only
            // the fighter slot folder itself
            if (includesFighterSlotFolder && !isFighterSlotFolder) {
              return;
            }

            pathData[fighterName][slotKey].pathsToBeModified.push({
              original: relativePath,
              normalized: normalizedPath,
              type: isFile ? 'file' : 'directory',
            });
          } else if (fileOrDirectory.isFile()) {
            unknownFiles.push(relativePath);
          }
        }),
      );

      const currentSlots = Array.from(slots).sort((a, b) => {
        const numA = parseInt(a.replace('c', ''));
        const numB = parseInt(b.replace('c', ''));

        return numA - numB;
      });

      return {
        pathData,
        currentSlots,
        unknownFiles,
        fighterNames: Array.from(fighterNames),
      };
    } catch (error) {
      console.error('Error scanning for slots:', error);
      throw error;
    }
  },

  /**
   * Extracts fighter name and slot information from a given file path.
   */
  async extractFighterAndSlotInfo(filePath: string): Promise<{
    slot: string | null;
    fighterName: string | null;
    normalizedPath: string | null;
    isFighterSlotFolder: boolean;
    includesFighterSlotFolder: boolean;
  }> {
    let detectedFighterName: string | null = null;
    let isFighterSlotFolder = false;
    let includesFighterSlotFolder = false;

    const pathParts = filePath.split(/[/\\]/);
    const fighterIndex = pathParts.indexOf('fighter');
    const includesFighterFolder = fighterIndex !== -1;

    if (includesFighterFolder && pathParts.length > fighterIndex + 1) {
      detectedFighterName = pathParts[fighterIndex + 1];

      // Search for slot folder at any position after 'fighter'
      for (let i = fighterIndex + 1; i < pathParts.length; i++) {
        const part = pathParts[i];

        if (/c\d{2,3}$/i.test(part)) {
          includesFighterSlotFolder = true;
          isFighterSlotFolder = i === pathParts.length - 1;

          break;
        }
      }
    }

    // Match cXX or cXXX in filename
    const cXXMatchRegex = /(c)(\d{2,3})/i;
    // Match XX or XXX before file extension
    const dotXXMatchRegex = /_([a-z]+)_(c)?(\d{2,3})(\.[^.]+)$/i;

    const cMatch = filePath.match(cXXMatchRegex);
    const dotMatch = filePath.match(dotXXMatchRegex);

    if (!detectedFighterName && dotMatch) {
      detectedFighterName = dotMatch[1];
    }

    const slot = cMatch
      ? cMatch[0].toLowerCase()
      : dotMatch
        ? 'c' + dotMatch[3]
        : null;

    const normalizedPath = cMatch
      ? filePath.replace(cXXMatchRegex, '$1###')
      : dotMatch
        ? filePath.replace(dotXXMatchRegex, `_$1_${dotMatch[2] || ''}###$4`)
        : null;

    // Useful for debugging specific files
    // if (filePath.includes('tex_ganon_sword1.nutexb')) {
    //   console.log(
    //     '{\n' +
    //       '      slot,\n' +
    //       '      fighterName,\n' +
    //       '      normalizedPath,\n' +
    //       '      isFighterSlotFolder,\n' +
    //       '      includesFighterSlotFolder,\n' +
    //       '    } :: ',
    //     {
    //       slot,
    //       filePath,
    //       pathParts,
    //       fighterName,
    //       fighterIndex,
    //       normalizedPath,
    //       isFighterSlotFolder,
    //       includesFighterFolder,
    //       includesFighterSlotFolder,
    //       ['pathParts.length > fighterIndex']: pathParts.length > fighterIndex,
    //     },
    //   );
    // }

    return {
      slot,
      normalizedPath,
      isFighterSlotFolder,
      includesFighterSlotFolder,
      fighterName: await ModScanner.getAccurateFighterName(
        detectedFighterName,
        normalizedPath,
      ),
    };
  },

  async getAccurateFighterName(
    detectedFighterName: string | null,
    filePath: string | null,
  ) {
    if (!detectedFighterName || !filePath) {
      return null;
    }

    const namesDataPath = path.join(PATHS.dataDir(), 'names.data');
    const namesData = await ModFileOperations.readModFile(namesDataPath);
    const validFighterNames = namesData.split('\n').map((s) => s.split(',')[0]);

    if (!validFighterNames.includes(detectedFighterName)) {
      return null;
    }

    if (detectedFighterName !== 'kirby') {
      return detectedFighterName;
    }

    // Check original files
    const kirbyCopyMatch = /kirby[\/\\]model[\/\\]copy_(\w+)_/.exec(filePath);

    if (!kirbyCopyMatch) {
      return 'kirby';
    }

    return kirbyCopyMatch[1];
  },
};
