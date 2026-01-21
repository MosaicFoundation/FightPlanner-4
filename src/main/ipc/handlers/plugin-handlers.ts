import { BrowserWindow, dialog, IpcMain } from 'electron';
import * as path from 'path';
import PluginUtils, { SimplePlugin } from '../../plugin-utils';
import PluginUpdateChecker, {
  PluginUpdateResult,
} from '../../plugin-update-checker';
import PluginUpdateInstaller from '../../plugin-update-installer';
import store from '../../store';
import {
  handleError,
  createErrorResponse,
  ErrorCodes,
} from '../../utils/error-handler';
import { HandlerResponse } from '../../types/common';

export const pluginHandlerMap = {
  'read-plugins-folder': 'readPluginsFolder',
  'select-plugin-file': 'selectPluginFile',
  'toggle-plugin': 'togglePlugin',
  'delete-plugin': 'deletePlugin',
  'check-plugin-updates': 'checkPluginUpdates',
  'update-plugin': 'updatePlugin',
  'get-plugin-repo-mapping': 'getPluginRepoMapping',
  'set-plugin-repo-mapping': 'setPluginRepoMapping',
} as const;

export const PluginHandlers = {
  readPluginsFolder: async (
    pluginsPath: string,
  ): HandlerResponse<{
    activePlugins: SimplePlugin[];
    disabledPlugins: SimplePlugin[];
  }> => {
    try {
      return { success: true, ...PluginUtils.readAllPlugins(pluginsPath) };
    } catch (error) {
      handleError(error, 'read-plugins-folder');
      return {
        success: false,
        error: error.message,
      };
    }
  },

  async selectPluginFile(pluginsPath: string): HandlerResponse {
    try {
      const win = BrowserWindow.fromWebContents(this.sender)!;
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
  },

  async togglePlugin(pluginPath: string, pluginsBasePath: string) {
    try {
      return PluginUtils.togglePlugin(pluginPath, pluginsBasePath);
    } catch (error) {
      handleError(error, 'toggle-plugin');
      return createErrorResponse(ErrorCodes.PLUGIN_READ_ERROR, error.message);
    }
  },

  async deletePlugin(pluginPath: string) {
    try {
      return PluginUtils.deletePlugin(pluginPath);
    } catch (error) {
      handleError(error, 'delete-plugin');
      return createErrorResponse(ErrorCodes.PLUGIN_READ_ERROR, error.message);
    }
  },

  async checkPluginUpdates(): HandlerResponse<{
    results: (PluginUpdateResult & {
      pluginName: string;
    })[];
  }> {
    try {
      const pluginMappings = (store.get('pluginRepoMappings') || {}) as Record<
        string,
        string
      >;
      const pluginVersions = (store.get('pluginVersions') || {}) as Record<
        string,
        string
      >;

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
  },

  async updatePlugin(
    pluginName: string,
    downloadUrl: string,
    pluginPath: string,
    targetVersion: string | null,
  ) {
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

  async getPluginRepoMapping() {
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
  },

  async setPluginRepoMapping(pluginName: string, repoInput: string) {
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
};

/**
 * Register all IPC handlers related to plugin operations
 * @param {Electron.IpcMain} ipcMain - Electron IPC main instance
 */
export function registerPluginHandlers(ipcMain: IpcMain) {
  for (const channel of Object.keys(pluginHandlerMap)) {
    ipcMain.handle(channel, (event, ...args) => {
      return PluginHandlers[pluginHandlerMap[channel]](event, ...args);
    });
  }
}
