const { BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const PluginUtils = require('../../plugin-utils');
const PluginUpdateChecker = require('../../plugin-update-checker');
const PluginUpdateInstaller = require('../../plugin-update-installer');
const store = require('../../store');
const {
  handleError,
  createErrorResponse,
  ErrorCodes,
} = require('../../utils/error-handler');

/**
 * Register all IPC handlers related to plugin operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
function registerPluginHandlers(ipcMain) {
  ipcMain.handle('read-plugins-folder', async (event, pluginsPath) => {
    try {
      const result = PluginUtils.readAllPlugins(pluginsPath);
      return result;
    } catch (error) {
      handleError(error, 'read-plugins-folder');
      return {
        activePlugins: [],
        disabledPlugins: [],
        error: error.message,
      };
    }
  });

  ipcMain.handle('select-plugin-file', async (event, pluginsPath) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [
          { name: 'NRO Files', extensions: ['nro'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
      }

      const sourcePath = result.filePaths[0];
      return PluginUtils.copyPlugin(sourcePath, pluginsPath);
    } catch (error) {
      handleError(error, 'select-plugin-file');
      return createErrorResponse(
        ErrorCodes.PLUGIN_INSTALL_FAILED,
        error.message,
      );
    }
  });

  ipcMain.handle(
    'toggle-plugin',
    async (event, pluginPath, pluginsBasePath) => {
      try {
        return PluginUtils.togglePlugin(pluginPath, pluginsBasePath);
      } catch (error) {
        handleError(error, 'toggle-plugin');
        return createErrorResponse(ErrorCodes.PLUGIN_READ_ERROR, error.message);
      }
    },
  );

  ipcMain.handle('delete-plugin', async (event, pluginPath) => {
    try {
      return PluginUtils.deletePlugin(pluginPath);
    } catch (error) {
      handleError(error, 'delete-plugin');
      return createErrorResponse(ErrorCodes.PLUGIN_READ_ERROR, error.message);
    }
  });

  ipcMain.handle('check-plugin-updates', async (event) => {
    try {
      const pluginMappings = store.get('pluginRepoMappings') || {};
      const pluginVersions = store.get('pluginVersions') || {};

      const results = await PluginUpdateChecker.checkAllPlugins(
        pluginMappings,
        pluginVersions,
      );
      return { success: true, results };
    } catch (error) {
      handleError(error, 'check-plugin-updates');
      return createErrorResponse(
        ErrorCodes.PLUGIN_UPDATE_FAILED,
        error.message,
      );
    }
  });

  ipcMain.handle(
    'update-plugin',
    async (event, pluginName, downloadUrl, pluginPath, targetVersion) => {
      try {
        const result = await PluginUpdateInstaller.installUpdate(
          downloadUrl,
          pluginPath,
        );

        if (result.success) {
          const actualFileName =
            result.actualFileName || path.basename(result.pluginPath);
          const fileNameWithoutExt = actualFileName.replace(/\.nro$/i, '');

          if (targetVersion) {
            const pluginVersions = store.get('pluginVersions') || {};
            pluginVersions[fileNameWithoutExt] = targetVersion;
            store.set('pluginVersions', pluginVersions);
          } else {
            const mappings = store.get('pluginRepoMappings') || {};
            const repo = mappings[pluginName] || mappings[fileNameWithoutExt];
            if (repo) {
              try {
                const updateInfo = await PluginUpdateChecker.checkPluginUpdate(
                  fileNameWithoutExt,
                  repo,
                  null,
                );
                if (updateInfo.success && updateInfo.latestVersion) {
                  const pluginVersions = store.get('pluginVersions') || {};
                  pluginVersions[fileNameWithoutExt] = updateInfo.latestVersion;
                  store.set('pluginVersions', pluginVersions);
                }
              } catch (e) {
                handleError(e, 'update-plugin-version-fetch');
              }
            }
          }

          if (pluginName !== fileNameWithoutExt) {
            const pluginMappings = store.get('pluginRepoMappings') || {};
            const repoInput = pluginMappings[pluginName];

            if (repoInput) {
              pluginMappings[fileNameWithoutExt] = repoInput;
              delete pluginMappings[pluginName];
              store.set('pluginRepoMappings', pluginMappings);
            }
          }
        }

        return result;
      } catch (error) {
        handleError(error, 'update-plugin');
        return createErrorResponse(
          ErrorCodes.PLUGIN_UPDATE_FAILED,
          error.message,
        );
      }
    },
  );

  ipcMain.handle('get-plugin-repo-mapping', async (event) => {
    try {
      const mappings = store.get('pluginRepoMappings') || {};
      return { success: true, mappings };
    } catch (error) {
      handleError(error, 'get-plugin-repo-mapping');
      return createErrorResponse(
        ErrorCodes.STORE_OPERATION_ERROR,
        error.message,
      );
    }
  });

  ipcMain.handle(
    'set-plugin-repo-mapping',
    async (event, pluginName, repoInput) => {
      try {
        const mappings = store.get('pluginRepoMappings') || {};

        if (repoInput) {
          const normalized = PluginUpdateChecker.normalizeRepoUrl(repoInput);
          if (normalized) {
            mappings[pluginName] = normalized;
          } else {
            return createErrorResponse(
              ErrorCodes.INVALID_PATH,
              'Invalid repository format',
            );
          }
        } else {
          delete mappings[pluginName];
        }

        store.set('pluginRepoMappings', mappings);
        return { success: true };
      } catch (error) {
        handleError(error, 'set-plugin-repo-mapping');
        return createErrorResponse(
          ErrorCodes.STORE_OPERATION_ERROR,
          error.message,
        );
      }
    },
  );
}

module.exports = { registerPluginHandlers };
