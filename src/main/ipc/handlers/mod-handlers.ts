import { shell, dialog, ipcMain, IpcMainInvokeEvent, app, IpcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

import ModUtils, { Mod } from '../../mod-utils';
import store from '../../store';
import downloadsStore from '../../store-downloads';
import ProtocolHandler from '../../protocol-handler';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import FppHandler from '../../fpp-handler';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';
import {
  ModScanner,
  PathData,
  ScanModResult,
} from '../../mod-utils/mod-scanner';
import {
  EchoOperationOptions,
  SlotChanger,
  SlotCustomNamesByFighter,
} from '../../mod-utils/slot-changer';

export type ModHandlers = typeof ModHandlers;

type EchoTakenName = {
  name: string;
  modName: string;
  modPath: string;
};

type EchoModEligibility = {
  isEligible: boolean;
  reason: string;
  category: string | null;
};

const MAX_ECHO_NAME_LENGTH = 10;

function normalizeEchoName(value: string): string {
  return toEchoToken(value);
}

function toEchoToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_ECHO_NAME_LENGTH);
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[\\/_.-]/g, ' ')
    .split(/\s+/g)
    .filter(Boolean);
}

function extractThemeWordCandidates(
  seedValues: string[],
  excludedTokens: Set<string>,
): string[] {
  const stopWords = new Set([
    'alt',
    'alternate',
    'anime',
    'audio',
    'bank',
    'bgm',
    'body',
    'character',
    'chara',
    'color',
    'colours',
    'colors',
    'costume',
    'def',
    'effect',
    'effects',
    'fighter',
    'fighters',
    'file',
    'files',
    'final',
    'mesh',
    'mod',
    'model',
    'mods',
    'moveset',
    'movesets',
    'music',
    'nus3audio',
    'nus3bank',
    'pack',
    'patch',
    'portrait',
    'replace',
    'reskin',
    'slot',
    'smash',
    'sound',
    'stage',
    'stages',
    'texture',
    'textures',
    'ui',
    'voice',
    'webp',
    'xmsbt',
    'xml',
    'fighter',
    'skin',
  ]);

  const words = new Set<string>();

  for (const value of seedValues) {
    for (const part of splitWords(value)) {
      if (/^\d+$/.test(part)) {
        if (part === '64') {
          words.add('retro');
          words.add('classic');
        }
        continue;
      }

      const token = toEchoToken(part);
      if (!token) continue;
      if (token.length < 3) continue;
      if (/^c\d{2,3}$/.test(token)) continue;
      if (stopWords.has(token)) continue;
      if (excludedTokens.has(token)) continue;
      words.add(token);
    }
  }

  return Array.from(words);
}

function fallbackEchoNameFromSeeds(
  seedValues: string[],
  excludedTokens: Set<string>,
): string {
  const candidates = extractThemeWordCandidates(seedValues, excludedTokens);
  if (candidates.length > 0) {
    return candidates[0];
  }

  return 'echoform';
}

function detectEchoFromScanResult(scanResult: ScanModResult): boolean {
  const hasHighSlot = scanResult.currentSlots.some((slot) => {
    if (!/^c\d{2,3}$/i.test(slot)) return false;
    return parseInt(slot.replace('c', ''), 10) > 7;
  });

  if (hasHighSlot) {
    return true;
  }

  const hasEchoMetadataInUnknown = scanResult.unknownFiles.some((filePath) => {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    return (
      normalizedPath.endsWith('ui/message/msg_name.xmsbt') ||
      normalizedPath.endsWith('ui/param/database/ui_chara_db.prcxml')
    );
  });

  return hasEchoMetadataInUnknown;
}

async function collectTakenEchoNames(modPath: string): Promise<EchoTakenName[]> {
  const modsPath = store.get('modsPath') as string | undefined;
  if (!modsPath) {
    return [];
  }

  const allMods = ModUtils.readAllMods(modsPath);
  const entries = [...allMods.activeMods, ...allMods.disabledMods];
  const takenNames: EchoTakenName[] = [];

  for (const mod of entries) {
    if (!mod.path || mod.path === modPath) {
      continue;
    }

    takenNames.push({
      name: mod.name,
      modName: mod.name,
      modPath: mod.path,
    });

    try {
      const modInfo = ModUtils.readModInfo(mod.path);
      const displayName = (modInfo?.display_name || '').trim();

      if (displayName) {
        takenNames.push({
          name: displayName,
          modName: mod.name,
          modPath: mod.path,
        });
      }
    } catch (error) {
      // Ignore read failures for individual mods and keep scanning.
    }
  }

  // De-duplicate identical name/mod combinations.
  const dedupeMap = new Map<string, EchoTakenName>();
  for (const entry of takenNames) {
    const key = `${normalizeEchoName(entry.name)}::${entry.modPath}`;
    if (!dedupeMap.has(key)) {
      dedupeMap.set(key, entry);
    }
  }

  return Array.from(dedupeMap.values());
}

function buildEchoNameSuggestions(
  baseWords: string[],
  takenNames: EchoTakenName[],
): string[] {
  const takenSet = new Set(takenNames.map((entry) => toEchoToken(entry.name)));
  const suggestionSet = new Set<string>();
  const suggestions: string[] = [];

  const addSuggestion = (candidate: string) => {
    const trimmed = toEchoToken(candidate);
    if (!trimmed) return;
    if (trimmed.length < 3) return;

    if (suggestionSet.has(trimmed)) return;

    suggestionSet.add(trimmed);
    suggestions.push(trimmed);
  };

  for (const baseWord of baseWords) {
    addSuggestion(baseWord);
  }

  for (const baseWord of baseWords) {
    addSuggestion(`${baseWord}alt`);
    addSuggestion(`${baseWord}x`);
    addSuggestion(`neo${baseWord}`);
  }

  // Push non-conflicting names first to make first-time choices easier.
  suggestions.sort((a, b) => {
    const aTaken = takenSet.has(toEchoToken(a));
    const bTaken = takenSet.has(toEchoToken(b));

    if (aTaken === bTaken) {
      return a.length - b.length;
    }
    return aTaken ? 1 : -1;
  });

  return suggestions;
}

function classifyEchoModEligibility(modPath: string): EchoModEligibility {
  const folderName = path.basename(modPath || '').toLowerCase();
  const info = ModUtils.readModInfo(modPath);
  const categoryRaw = (info?.category || '').trim();
  const category = categoryRaw ? categoryRaw.toLowerCase() : null;

  const movesetCategories = new Set(['moveset', 'movesets']);
  const fighterCategories = new Set(['fighter', 'fighters', 'skin', 'skins']);
  const nonFighterCategories = new Set([
    'stage',
    'stages',
    'effect',
    'effects',
    'ui',
    'param',
    'final smash',
    'other',
    'other/misc',
  ]);

  if (category && movesetCategories.has(category)) {
    return {
      isEligible: false,
      reason: 'moveset-category',
      category,
    };
  }

  if (folderName.includes('moveset')) {
    return {
      isEligible: false,
      reason: 'moveset-name',
      category,
    };
  }

  if (fs.existsSync(path.join(modPath, 'plugin.nro'))) {
    return {
      isEligible: false,
      reason: 'plugin-nro',
      category,
    };
  }

  if (category && nonFighterCategories.has(category)) {
    return {
      isEligible: false,
      reason: 'non-fighter-category',
      category,
    };
  }

  const hasFighterFolder = fs.existsSync(path.join(modPath, 'fighter'));

  if (category && fighterCategories.has(category) && hasFighterFolder) {
    return {
      isEligible: true,
      reason: 'fighter-category',
      category,
    };
  }

  if (hasFighterFolder) {
    return {
      isEligible: true,
      reason: 'fighter-folder',
      category,
    };
  }

  return {
    isEligible: false,
    reason: 'no-fighter-folder',
    category,
  };
}

function isMovesetMod(modPath: string): boolean {
  const folderName = path.basename(modPath || '').toLowerCase();
  const info = ModUtils.readModInfo(modPath);
  const category = (info?.category || '').toLowerCase().trim();

  if (category === 'moveset' || category === 'movesets') {
    return true;
  }

  if (folderName.includes('moveset')) {
    return true;
  }

  return fs.existsSync(path.join(modPath, 'plugin.nro'));
}

function enforceMovesetInName(name: string): string {
  const trimmed = (name || '').trim();

  if (!trimmed) {
    return 'Moveset';
  }

  if (/moveset/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed} Moveset`;
}

const ModHandlers = {
  ['read-mods-folder']: async (
    common: BaseHandlerArg,
    modsPath: string,
  ): HandlerResponse<{
    activeMods: Mod[];
    disabledMods: Mod[];
  }> => {
    try {
      return {
        success: true,
        ...ModUtils.readAllMods(modsPath),
      };
    } catch (error) {
      handleError(error, 'read-mods-folder');
      return {
        success: false,
        error: error.message,
      };
    }
  },

  ['get-preview-image']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      const previewPath = ModUtils.getPreviewImagePath(modPath);
      if (previewPath) {
        return ModUtils.pathToFileUrl(previewPath);
      }
      return null;
    } catch (error) {
      handleError(error, 'get-preview-image');
      return null;
    }
  },

  ['get-mod-info']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      return ModUtils.readModInfo(modPath);
    } catch (error) {
      handleError(error, 'get-mod-info');
      return null;
    }
  },

  ['echo-get-preview-image']: async (
    common: BaseHandlerArg,
    modPath: string,
  ) => {
    try {
      const previewPath = ModUtils.getPreviewImagePath(modPath);
      if (previewPath) {
        return ModUtils.pathToFileUrl(previewPath);
      }

      return null;
    } catch (error) {
      handleError(error, 'echo-get-preview-image');
      return null;
    }
  },

  ['echo-get-mod-info']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      return ModUtils.readModInfo(modPath);
    } catch (error) {
      handleError(error, 'echo-get-mod-info');
      return null;
    }
  },

  ['echo-classify-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse<EchoModEligibility> => {
    try {
      const result = classifyEchoModEligibility(modPath);
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      handleError(error, 'echo-classify-mod');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['save-mod-info']: async (
    common: BaseHandlerArg,
    modPath: string,
    infoData,
  ): HandlerResponse => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      let tomlContent = '';

      if (infoData.display_name)
        tomlContent += `display_name = "${infoData.display_name}"\n`;
      if (infoData.authors) tomlContent += `authors = "${infoData.authors}"\n`;
      if (infoData.version) tomlContent += `version = "${infoData.version}"\n`;
      if (infoData.category)
        tomlContent += `category = "${infoData.category}"\n`;
      if (infoData.url) tomlContent += `url = "${infoData.url}"\n`;
      if (infoData.description)
        tomlContent += `description = """\n${infoData.description}\n"""\n`;

      fs.writeFileSync(infoPath, tomlContent, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'save-mod-info');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['read-mod-info-raw']: async (common: BaseHandlerArg, modPath: string) => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      if (!fs.existsSync(infoPath)) return '';
      const content = fs.readFileSync(infoPath, 'utf8');
      return content;
    } catch (error) {
      handleError(error, 'read-mod-info-raw');
      return '';
    }
  },

  ['save-mod-info-raw']: async (
    common: BaseHandlerArg,
    modPath,
    tomlContent,
  ): HandlerResponse => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      fs.writeFileSync(infoPath, tomlContent, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'save-mod-info-raw');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['createFpp']: async (
    _common: BaseHandlerArg,
    name: string,
    fppVersion: string,
    thumbnailPath: string | null,
    modPaths: string[],
  ): HandlerResponse<{ filePath?: string }> => {
    try {
      if (!name || !modPaths || !Array.isArray(modPaths) || modPaths.length === 0) {
        return createErrorResponse(
          ErrorCodes.UNKNOWN_ERROR,
          'Name and modPaths array are required',
        );
      }

      const mainWindow = BrowserWindow.fromWebContents(_common.event.sender);
      if (!mainWindow) {
        return createErrorResponse(
          ErrorCodes.UNKNOWN_ERROR,
          'No main window found',
        );
      }

      const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: 'Save FPP File',
        defaultPath: `${safeName}.fpp`,
        filters: [{ name: 'FightPlanner Pack', extensions: ['fpp'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true };
      }

      console.log(`Creating FPP pack: ${name} (v${fppVersion}) with ${modPaths.length} mods`);

      const outputPath = saveResult.filePath;
      const result = await FppHandler.createFpp(name, fppVersion, thumbnailPath, modPaths, outputPath, mainWindow);

      return {
        success: result.success,
        filePath: result.filePath,
      };
    } catch (error) {
      handleError(error, 'create-fpp');
      return createErrorResponse(ErrorCodes.UNKNOWN_ERROR, error.message);
    }
  },

  ['rename-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
    newName: string,
  ): HandlerResponse<{
    newPath: string;
  }> => {
    try {
      const requestedName = (newName || '').trim();

      if (!requestedName) {
        return createErrorResponse(
          ErrorCodes.MOD_RENAME_ERROR,
          'Mod name cannot be empty',
        );
      }

      const finalName = isMovesetMod(modPath)
        ? enforceMovesetInName(requestedName)
        : requestedName;

      const parentDir = path.dirname(modPath);
      const newPath = path.join(parentDir, finalName);

      if (fs.existsSync(newPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_RENAME_ERROR,
          'A mod with this name already exists',
        );
      }

      fs.renameSync(modPath, newPath);
      return { success: true, newPath };
    } catch (error) {
      handleError(error, 'rename-mod');
      return createErrorResponse(ErrorCodes.MOD_RENAME_ERROR, error.message);
    }
  },

  ['delete-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse => {
    try {
      if (!fs.existsSync(modPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_NOT_FOUND,
          'Mod folder does not exist',
        );
      }
      fs.rmSync(modPath, { recursive: true, force: true });
      return { success: true };
    } catch (error) {
      handleError(error, 'delete-mod');
      return createErrorResponse(ErrorCodes.MOD_DELETE_ERROR, error.message);
    }
  },

  ['toggle-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
    modsBasePath: string,
  ): HandlerResponse<{
    newPath: string;
    isNowActive: boolean;
  }> => {
    try {
      const modName = path.basename(modPath);
      const parentDir = path.dirname(modsBasePath);
      const disabledModsPath = path.join(parentDir, '{disabled_mod}');
      const isInActiveMods =
        modPath.includes(modsBasePath) && !modPath.includes('{disabled_mods}');

      let targetPath;
      if (isInActiveMods) {
        if (!fs.existsSync(disabledModsPath)) {
          fs.mkdirSync(disabledModsPath, { recursive: true });
        }
        targetPath = path.join(disabledModsPath, modName);
      } else {
        targetPath = path.join(modsBasePath, modName);
      }

      if (fs.existsSync(targetPath)) {
        return createErrorResponse(
          ErrorCodes.MOD_RENAME_ERROR,
          'A mod with this name already exists in the target location',
        );
      }

      fs.renameSync(modPath, targetPath);

      return {
        success: true,
        newPath: targetPath,
        isNowActive: !isInActiveMods,
      };
    } catch (error) {
      handleError(error, 'toggle-mod');
      return createErrorResponse(ErrorCodes.MOD_RENAME_ERROR, error.message);
    }
  },

  ['scan-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse<{
    data: ScanModResult;
  }> => {
    try {
      const data = await ModScanner.scanModFiles(modPath);
      return { success: true, data };
    } catch (error) {
      handleError(error, 'scan-mod-slots');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['change-slots']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
    deletedSlots: Map<string, Set<string>>,
    slotCustomNamesByFighter: SlotCustomNamesByFighter = {},
    options: EchoOperationOptions = {},
  ): HandlerResponse => {
    try {
      await SlotChanger.removeSlots(modPath, deletedSlots, pathData);

      for (const [fighterName, slots] of deletedSlots) {
        for (const slot of slots) {
          const fighterAssignments = slotAssignments.get(fighterName);

          if (fighterAssignments) {
            fighterAssignments.delete(slot);
          }
        }
      }

      await SlotChanger.changeSlots(
        modPath,
        slotAssignments,
        pathData,
        slotCustomNamesByFighter,
        options,
      );

      return { success: true };
    } catch (error) {
      handleError(error, 'change-slots');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['echo-get-slot-analysis']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): HandlerResponse<{
    fighters: {
      fighterName: string;
      slots: string[];
      highestSlot: number;
      numColorSlots: number;
      suggestedName: string;
    }[];
    isEchoFighter: boolean;
    defaultEchoName: string;
    nameSuggestions: string[];
    takenNames: EchoTakenName[];
  }> => {
    try {
      const scanResult = await ModScanner.scanModFiles(modPath);
      const modInfo = ModUtils.readModInfo(modPath);
      const takenNames = await collectTakenEchoNames(modPath);

      const displayName = (modInfo?.display_name || '').trim();
      const folderName = path.basename(modPath).trim();

      const excludedNameTokens = new Set<string>();
      scanResult.fighterNames.forEach((fighterName) => {
        const token = toEchoToken(fighterName);
        if (token) excludedNameTokens.add(token);
      });

      const fighterEntries = await Promise.all(
        Object.keys(scanResult.pathData).map(async (fighterName) => {
          const defaultNames = await SlotChanger.getDefaultCustomNames(fighterName);
          const suggestedName =
            (defaultNames?.cspName || defaultNames?.vsName || fighterName || '')
              .replace(/\s+/g, ' ')
              .trim();

          const fighterToken = toEchoToken(fighterName);
          if (fighterToken) {
            excludedNameTokens.add(fighterToken);
          }

          splitWords(suggestedName).forEach((word) => {
            const token = toEchoToken(word);
            if (token) excludedNameTokens.add(token);
          });

          const slots = Object.keys(scanResult.pathData[fighterName])
            .filter((slot) => /^c\d{2,3}$/i.test(slot))
            .sort(
              (a, b) =>
                parseInt(a.replace('c', ''), 10) -
                parseInt(b.replace('c', ''), 10),
            );

          const highestSlot = slots.reduce((max, slot) => {
            const slotNumber = parseInt(slot.replace('c', ''), 10);
            return slotNumber > max ? slotNumber : max;
          }, 0);

          return {
            fighterName,
            slots,
            highestSlot,
            numColorSlots: highestSlot + 1,
            suggestedName,
          };
        }),
      );

      const namingSeeds = [
        displayName,
        folderName,
        (modInfo?.s_name || '').trim(),
        (modInfo?.description || '').trim(),
      ].filter((value) => Boolean(value));

      const nameSuggestions = buildEchoNameSuggestions(
        extractThemeWordCandidates(namingSeeds, excludedNameTokens),
        takenNames,
      );

      const takenSet = new Set(takenNames.map((entry) => toEchoToken(entry.name)));
      let defaultEchoName =
        nameSuggestions.find((candidate) => !takenSet.has(candidate)) ||
        nameSuggestions[0] ||
        fallbackEchoNameFromSeeds(namingSeeds, excludedNameTokens);

      if (takenSet.has(defaultEchoName)) {
        const fallbackCandidates = ['echoform', 'variant', 'customalt'];
        const availableFallback = fallbackCandidates.find(
          (candidate) => !takenSet.has(toEchoToken(candidate)),
        );

        defaultEchoName = toEchoToken(availableFallback || 'echoform');
      }

      const fighters = fighterEntries;

      return {
        success: true,
        fighters,
        isEchoFighter: detectEchoFromScanResult(scanResult),
        defaultEchoName,
        nameSuggestions,
        takenNames,
      };
    } catch (error) {
      handleError(error, 'echo-get-slot-analysis');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['echo-rename-c-folders']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
  ): HandlerResponse => {
    try {
      await SlotChanger.changeSlots(modPath, slotAssignments, pathData, {}, {
        renameFolders: true,
        renameFiles: false,
        applyMetadata: false,
        generateConfig: false,
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'echo-rename-c-folders');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['echo-rename-chara-files']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
  ): HandlerResponse => {
    try {
      await SlotChanger.changeSlots(modPath, slotAssignments, pathData, {}, {
        renameFolders: false,
        renameFiles: true,
        applyMetadata: false,
        generateConfig: false,
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'echo-rename-chara-files');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['echo-generate-config']: async (
    common: BaseHandlerArg,
    modPath: string,
    pathData: PathData,
    slotAssignments: Map<string, Map<string, string>>,
  ): HandlerResponse => {
    try {
      await SlotChanger.changeSlots(modPath, slotAssignments, pathData, {}, {
        renameFolders: false,
        renameFiles: false,
        applyMetadata: false,
        generateConfig: true,
      });

      return { success: true };
    } catch (error) {
      handleError(error, 'echo-generate-config');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['detect-conflicts']: async (
    common: BaseHandlerArg,
    modsPath: string,
    whitelistPatterns: string[] = [],
  ): HandlerResponse<{
    conflictGroups: {
      fighter: string;
      slot: string;
      conflicts: {
        filePath: string;
        mods: {
          name: string;
          path: string;
        }[];
      }[];
    }[];
    totalConflicts: number;
    activeModsCount: number;
  }> => {
    try {
      const result = ModUtils.readAllMods(modsPath);

      const conflictGroups = await ModUtils.detectConflicts(
        result.activeMods,
        whitelistPatterns,
      );

      // Calculate total conflicts across all groups
      const totalConflicts = conflictGroups.reduce(
        (sum, group) => sum + group.conflicts.length,
        0,
      );

      return {
        success: true,
        conflictGroups,
        totalConflicts,
        activeModsCount: result.activeMods.length,
      };
    } catch (error) {
      handleError(error, 'detect-conflicts');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['install-mod-from-path']: async (
    common: BaseHandlerArg,
    sourcePath: string,
    modsPath: string,
  ) => {
    try {
      return await ModUtils.installModFromPath(sourcePath, modsPath);
    } catch (error) {
      handleError(error, 'install-mod-from-path');
      return createErrorResponse(ErrorCodes.MOD_INSTALL_ERROR, error.message);
    }
  },

  ['handle-files-dropped']: async (common: BaseHandlerArg, filePaths) => {
    try {
      const modsPath = store.get('modsPath') as string | null;
      if (!modsPath) {
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          'Mods folder not configured. Please set it in Settings.',
        );
      }

      const results: {
        filePath: string;
        result: any;
      }[] = [];

      for (const filePath of filePaths) {
        try {
          const installResult = await ModUtils.installModFromPath(
            filePath,
            modsPath,
          );

          results.push({ filePath, result: installResult });
        } catch (error) {
          results.push({
            filePath,
            result: { success: false, error: error.message },
          });
        }
      }
      return { success: true, results };
    } catch (error) {
      handleError(error, 'handle-files-dropped');
      return createErrorResponse(ErrorCodes.MOD_INSTALL_ERROR, error.message);
    }
  },
} as const;

/**
 * Register all IPC handlers related to mod operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerModHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(ModHandlers) as Array<
    keyof typeof ModHandlers
  >) {
    const handler = ModHandlers[channel] as GenericHandler;

    ipcMain.handle(channel, (event, ...rest: unknown[]) => {
      return handler({ event }, ...rest);
    });
  }
}
