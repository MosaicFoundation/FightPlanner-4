import fs from 'fs';
import path from 'path';

export interface ScanModResult {
  pathData: PathData;
  currentSlots: string[];
  unknownFiles: string[];
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

      files.forEach((fileOrDirectory) => {
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
        } = ModScanner.extractFighterAndSlotInfo(relativePath);

        if (fighterName) {
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
      });

      const currentSlots = Array.from(slots).sort((a, b) => {
        const numA = parseInt(a.replace('c', ''));
        const numB = parseInt(b.replace('c', ''));

        return numA - numB;
      });

      return { pathData, currentSlots, unknownFiles };
    } catch (error) {
      console.error('Error scanning for slots:', error);
      throw error;
    }
  },

  /**
   * Extracts fighter name and slot information from a given file path.
   */
  extractFighterAndSlotInfo(filePath: string): {
    slot: string | null;
    fighterName: string | null;
    normalizedPath: string | null;
    isFighterSlotFolder: boolean;
    includesFighterSlotFolder: boolean;
  } {
    let fighterName: string | null = null;
    let isFighterSlotFolder = false;
    let includesFighterSlotFolder = false;

    const pathParts = filePath.split(/[/\\]/);
    const fighterIndex = pathParts.indexOf('fighter');
    const includesFighterFolder = fighterIndex !== -1;

    if (includesFighterFolder && pathParts.length > fighterIndex + 1) {
      fighterName = pathParts[fighterIndex + 1];

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

    if (!fighterName && dotMatch) {
      fighterName = dotMatch[1];
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
      fighterName,
      normalizedPath,
      isFighterSlotFolder,
      includesFighterSlotFolder,
    };
  },

  getInternalFighterName(pathData: PathData) {
    if (!pathData || typeof pathData !== 'object') {
      return null;
    }

    // Filter out kirby if it only has copy files
    const fighterNames = Object.keys(pathData).filter((fighterName) => {
      // If it's not kirby, keep it
      if (fighterName !== 'kirby') {
        return true;
      }

      // For kirby, check if any files are NOT copy files
      const kirbySlots = pathData[fighterName];

      for (const slot in kirbySlots) {
        const slotData = kirbySlots[slot];

        // Check original files
        if (slotData.filesToBeModified?.length > 0) {
          const hasNonCopyFiles = slotData.filesToBeModified.some(
            (file) =>
              !file.original.includes('kirby\\model\\copy_') &&
              !file.original.includes('kirby/model/copy_'),
          );

          if (hasNonCopyFiles) {
            return true; // Keep kirby since it has non-copy files
          }
        }

        // Check pathsToBeModified
        if (slotData.pathsToBeModified) {
          const hasNonCopyPaths = slotData.pathsToBeModified.some(
            (path) =>
              !path.original.includes('kirby\\model\\copy_') &&
              !path.original.includes('kirby/model/copy_'),
          );

          if (hasNonCopyPaths) {
            return true; // Keep kirby since it has non-copy paths
          }
        }
      }

      // All kirby files are copy files, filter it out
      return false;
    });

    // Return the fighter name only if there's exactly one
    return fighterNames.length === 1 ? fighterNames[0] : null;
  },
};
