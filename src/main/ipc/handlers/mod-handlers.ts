const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const ModUtils = require('../../mod-utils');
const store = require('../../store');
const {
  handleError,
  createErrorResponse,
  ErrorCodes,
} = require('../../utils/error-handler');

/**
 * Register all IPC handlers related to mod operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
function registerModHandlers(ipcMain) {
  ipcMain.handle('read-mods-folder', async (event, modsPath) => {
    try {
      const result = ModUtils.readAllMods(modsPath);
      return result;
    } catch (error) {
      handleError(error, 'read-mods-folder');
      return {
        activeMods: [],
        disabledMods: [],
        error: error.message,
      };
    }
  });

  ipcMain.handle('get-preview-image', async (event, modPath) => {
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
  });

  ipcMain.handle('get-mod-info', async (event, modPath) => {
    try {
      const modInfo = ModUtils.readModInfo(modPath);
      return modInfo;
    } catch (error) {
      handleError(error, 'get-mod-info');
      return null;
    }
  });

  ipcMain.handle('save-mod-info', async (event, modPath, infoData) => {
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
  });

  ipcMain.handle('read-mod-info-raw', async (event, modPath) => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      if (!fs.existsSync(infoPath)) return '';
      const content = fs.readFileSync(infoPath, 'utf8');
      return content;
    } catch (error) {
      handleError(error, 'read-mod-info-raw');
      return '';
    }
  });

  ipcMain.handle('save-mod-info-raw', async (event, modPath, tomlContent) => {
    try {
      const infoPath = path.join(modPath, 'info.toml');
      fs.writeFileSync(infoPath, tomlContent, 'utf8');
      return { success: true };
    } catch (error) {
      handleError(error, 'save-mod-info-raw');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  });

  ipcMain.handle('scan-mod-for-fighters', async (event, modPath) => {
    try {
      const fighters = [];
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
  });

  ipcMain.handle('rename-mod', async (event, modPath, newName) => {
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
  });

  ipcMain.handle('delete-mod', async (event, modPath) => {
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
  });

  ipcMain.handle('toggle-mod', async (event, modPath, modsBasePath) => {
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
  });

  ipcMain.handle('scan-mod-slots', async (event, modPath) => {
    try {
      const slots = ModUtils.scanModForSlots(modPath);
      return { success: true, slots };
    } catch (error) {
      handleError(error, 'scan-mod-slots');
      return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
    }
  });

  ipcMain.handle(
    'get-used-slots-for-fighter',
    async (event, modsPath, fighterId, excludeModPath = null) => {
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
  );

  ipcMain.handle(
    'scan-mod-slots-by-fighter',
    async (event, modPath, fighterId) => {
      try {
        const slots = ModUtils.scanModForSlotsByFighter(modPath, fighterId);
        return { success: true, slots };
      } catch (error) {
        handleError(error, 'scan-mod-slots-by-fighter');
        return createErrorResponse(ErrorCodes.MOD_READ_ERROR, error.message);
      }
    },
  );

  ipcMain.handle('apply-slot-changes', async (event, modPath, changes) => {
    try {
      return ModUtils.applySlotChanges(modPath, changes);
    } catch (error) {
      handleError(error, 'apply-slot-changes');
      return createErrorResponse(ErrorCodes.MOD_SAVE_ERROR, error.message);
    }
  });

  ipcMain.handle(
    'detect-conflicts',
    async (event, modsPath, whitelistPatterns = []) => {
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
  );

  ipcMain.handle(
    'install-mod-from-path',
    async (event, sourcePath, modsPath) => {
      try {
        const result = await ModUtils.installModFromPath(sourcePath, modsPath);

        // Auto-disable mod if setting is enabled
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
              // Update result info so renderer knows
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
  );

  ipcMain.handle('handle-files-dropped', async (event, filePaths) => {
    try {
      const modsPath = store.get('modsPath');
      if (!modsPath) {
        return createErrorResponse(
          ErrorCodes.FOLDER_NOT_FOUND,
          'Mods folder not configured. Please set it in Settings.',
        );
      }

      const results = [];
      for (const filePath of filePaths) {
        try {
          const installResult = await ModUtils.installModFromPath(
            filePath,
            modsPath,
          );

          // Auto-disable mod if setting is enabled
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
  });
}

module.exports = { registerModHandlers };
