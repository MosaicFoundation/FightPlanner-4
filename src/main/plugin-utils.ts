const fs = require('fs');
const path = require('path');

class PluginUtils {
  /**
   * Read all plugins from a folder (active and disabled)
   * @param {string} pluginsPath - Path to the plugins folder
   * @returns {object} Object with activePlugins and disabledPlugins arrays
   */
  static readAllPlugins(pluginsPath) {
    const result = {
      activePlugins: [],
      disabledPlugins: [],
    };

    try {
      if (fs.existsSync(pluginsPath)) {
        const files = fs.readdirSync(pluginsPath);

        files.forEach((file) => {
          const filePath = path.join(pluginsPath, file);
          const stats = fs.statSync(filePath);

          if (stats.isFile() && path.extname(file).toLowerCase() === '.nro') {
            result.activePlugins.push({
              name: file,
              path: filePath,
              size: this.formatFileSize(stats.size),
            });
          }
        });
      }

      const parentDir = path.dirname(pluginsPath);
      const disabledPluginsPath = path.join(parentDir, 'disabled_plugins');

      if (fs.existsSync(disabledPluginsPath)) {
        const files = fs.readdirSync(disabledPluginsPath);

        files.forEach((file) => {
          const filePath = path.join(disabledPluginsPath, file);
          const stats = fs.statSync(filePath);

          if (stats.isFile() && path.extname(file).toLowerCase() === '.nro') {
            result.disabledPlugins.push({
              name: file,
              path: filePath,
              size: this.formatFileSize(stats.size),
            });
          }
        });
      }

      return result;
    } catch (error) {
      console.error('Error reading plugins:', error);
      throw error;
    }
  }

  /**
   * Format file size in human readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Toggle plugin status (enable/disable)
   * @param {string} pluginPath - Full path to the plugin file
   * @param {string} pluginsBasePath - Base path of the plugins folder
   * @returns {object} Result with success status
   */
  static togglePlugin(pluginPath, pluginsBasePath) {
    try {
      const pluginName = path.basename(pluginPath);
      const parentDir = path.dirname(pluginsBasePath);
      const disabledPluginsPath = path.join(parentDir, 'disabled_plugins');

      const isActive = pluginPath.startsWith(pluginsBasePath);

      let targetPath;
      if (isActive) {
        if (!fs.existsSync(disabledPluginsPath)) {
          fs.mkdirSync(disabledPluginsPath, { recursive: true });
        }
        targetPath = path.join(disabledPluginsPath, pluginName);
      } else {
        targetPath = path.join(pluginsBasePath, pluginName);
      }

      if (fs.existsSync(targetPath)) {
        return {
          success: false,
          error:
            'A plugin with this name already exists in the target location',
        };
      }

      fs.renameSync(pluginPath, targetPath);
      return {
        success: true,
        newPath: targetPath,
        isNowActive: !isActive,
      };
    } catch (error) {
      console.error('Error toggling plugin:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a plugin file
   * @param {string} pluginPath - Full path to the plugin file
   * @returns {object} Result with success status
   */
  static deletePlugin(pluginPath) {
    try {
      if (!fs.existsSync(pluginPath)) {
        return { success: false, error: 'Plugin file does not exist' };
      }

      fs.unlinkSync(pluginPath);
      return { success: true };
    } catch (error) {
      console.error('Error deleting plugin:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Copy a plugin file to the plugins folder
   * @param {string} sourcePath - Source file path
   * @param {string} targetFolder - Target plugins folder
   * @returns {object} Result with success status
   */
  static copyPlugin(sourcePath, targetFolder) {
    try {
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: 'Source file does not exist' };
      }

      if (path.extname(sourcePath).toLowerCase() !== '.nro') {
        return {
          success: false,
          error: 'Only .nro files are supported',
        };
      }

      const fileName = path.basename(sourcePath);
      const targetPath = path.join(targetFolder, fileName);

      if (fs.existsSync(targetPath)) {
        return {
          success: false,
          error: 'A plugin with this name already exists',
        };
      }

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      fs.copyFileSync(sourcePath, targetPath);
      return { success: true, targetPath };
    } catch (error) {
      console.error('Error copying plugin:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = PluginUtils;
