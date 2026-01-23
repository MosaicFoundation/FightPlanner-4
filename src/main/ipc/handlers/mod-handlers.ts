import { IpcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import ModUtils, { Mod, Slot } from '../../mod-utils';
import store from '../../store';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { ModInstallResult } from '../../plugin-update-installer';
import { HandlerResponse } from '../../types/common';
import { BaseHandlerArg, GenericHandler } from '../../types/common';

export type ModHandlers = typeof ModHandlers;

const ModHandlers = {
  ['read-mods-folder']: async (
    common: BaseHandlerArg,
    modsPath: string,
  ): Promise<
    HandlerResponse<{
      activeMods: Mod[];
      disabledMods: Mod[];
    }>
  > => {
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

  ['save-mod-info']: async (
    common: BaseHandlerArg,
    modPath: string,
    infoData,
  ): Promise<HandlerResponse> => {
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
  ): Promise<HandlerResponse> => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      fs.writeFileSync(infoPath, tomlContent, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'save-mod-info-raw');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['scan-mod-for-fighters']: async (
    common: BaseHandlerArg,
    modPath: string,
  ) => {
    try {
      const fighters: string[] = [];
      const fighterPath = path.join(modPath, 'fighter');
      if (fs.existsSync(fighterPath)) {
        const fighterDirs = fs.readdirSync(fighterPath, {
          withFileTypes: true,
        });
        for (const dirent of fighterDirs) {
          if (dirent.isDirectory()) {
            fighters.push(dirent.name);
          }
        }
      }
      return fighters;
    } catch (error) {
      handleError(error, 'scan-mod-for-fighters');
      return [];
    }
  },

  ['rename-mod']: async (
    common: BaseHandlerArg,
    modPath: string,
    newName: string,
  ): Promise<
    HandlerResponse<{
      newPath: string;
    }>
  > => {
    try {
      const parentDir = path.dirname(modPath);
      const newPath = path.join(parentDir, newName);
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
  ): Promise<HandlerResponse> => {
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
  ): Promise<
    HandlerResponse<{
      newPath: string;
      isNowActive: boolean;
    }>
  > => {
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

  ['scan-mod-slots']: async (
    common: BaseHandlerArg,
    modPath: string,
  ): Promise<
    HandlerResponse<{
      slots: {
        slot: number;
        files: Slot[];
      }[];
    }>
  > => {
    try {
      const slots = ModUtils.scanModForSlots(modPath);
      return { success: true, slots };
    } catch (error) {
      handleError(error, 'scan-mod-slots');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['get-used-slots-for-fighter']: async (
    common: BaseHandlerArg,
    modsPath: string,
    fighterId: string,
    excludeModPath: string | null = null,
  ): Promise<
    HandlerResponse<{
      usedSlots: number[];
    }>
  > => {
    try {
      const usedSlots = ModUtils.getUsedSlotsForFighter(
        modsPath,
        fighterId,
        excludeModPath,
      );

      return { success: true, usedSlots };
    } catch (error) {
      handleError(error, 'get-used-slots-for-fighter');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['scan-mod-slots-by-fighter']: async (
    common: BaseHandlerArg,
    modPath: string,
    fighterId: string,
  ): Promise<
    HandlerResponse<{
      slots: number[];
    }>
  > => {
    try {
      const slots = ModUtils.scanModForSlotsByFighter(modPath, fighterId);
      return { success: true, slots };
    } catch (error) {
      handleError(error, 'scan-mod-slots-by-fighter');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['apply-slot-changes']: async (common: BaseHandlerArg, modPath, changes) => {
    try {
      return ModUtils.applySlotChanges(modPath, changes);
    } catch (error) {
      handleError(error, 'apply-slot-changes');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  },

  ['detect-conflicts']: async (
    common: BaseHandlerArg,
    modsPath: string,
    whitelistPatterns: string[] = [],
  ): Promise<
    HandlerResponse<{
      conflicts: {
        filePath: string;
        mods: {
          name: string;
          path: string;
        }[];
      }[];
      totalConflicts: number;
      activeModsCount: number;
    }>
  > => {
    try {
      const result = ModUtils.readAllMods(modsPath);
      const conflicts = await ModUtils.detectConflicts(
        result.activeMods,
        whitelistPatterns,
      );

      return {
        success: true,
        conflicts: conflicts,
        totalConflicts: conflicts.length,
        activeModsCount: result.activeMods.length,
      };
    } catch (error) {
      handleError(error, 'detect-conflicts');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  },

  ['install-mod-from-path']: async (
    common: BaseHandlerArg,
    sourcePath,
    modsPath,
  ) => {
    try {
      const result = await ModUtils.installModFromPath(sourcePath, modsPath);

      if (result.success && store.get('autoDisableNewMods')) {
        try {
          const modName = path.basename(result.modPath);
          const parentDir = path.dirname(modsPath);
          const disabledModsPath = path.join(parentDir, '{disabled_mod}');

          if (!fs.existsSync(disabledModsPath)) {
            fs.mkdirSync(disabledModsPath, { recursive: true });
          }

          const targetPath = path.join(disabledModsPath, modName);
          if (!fs.existsSync(targetPath)) {
            fs.renameSync(result.modPath, targetPath);
            console.log(
              `[AutoDisable] Moved ${modName} to disabled mods folder`,
            );
            result.modPath = targetPath;
            result.autoDisabled = true;
          } else {
            console.warn(
              `[AutoDisable] Cannot move ${modName}, target already exists`,
            );
          }
        } catch (disableError) {
          console.error('[AutoDisable] Failed to disable mod:', disableError);
        }
      }

      return result;
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
        result: ModInstallResult;
      }[] = [];

      for (const filePath of filePaths) {
        try {
          const installResult = await ModUtils.installModFromPath(
            filePath,
            modsPath,
          );

          if (installResult.success && store.get('autoDisableNewMods')) {
            try {
              const modName = path.basename(installResult.modPath);
              const parentDir = path.dirname(modsPath);
              const disabledModsPath = path.join(parentDir, '{disabled_mod}');

              if (!fs.existsSync(disabledModsPath)) {
                fs.mkdirSync(disabledModsPath, {
                  recursive: true,
                });
              }

              const targetPath = path.join(disabledModsPath, modName);
              if (!fs.existsSync(targetPath)) {
                fs.renameSync(installResult.modPath, targetPath);
                console.log(
                  `[AutoDisable] Moved ${modName} to disabled mods folder (drag-drop)`,
                );
                installResult.modPath = targetPath;
                installResult.autoDisabled = true;
              }
            } catch (disableError) {
              console.error(
                '[AutoDisable] Failed to disable mod in drag-drop:',
                disableError,
              );
            }
          }

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
