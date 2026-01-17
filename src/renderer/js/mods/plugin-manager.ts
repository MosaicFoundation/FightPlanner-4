class PluginManager {
  constructor() {
    this.plugins = [];
    this.pluginListContainer = null;
    this.pluginsPath = null;
    this.searchQuery = '';

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initContainer());
    } else {
      this.initContainer();
    }
  }

  initContainer() {
    this.pluginListContainer = document.getElementById('plugin-list');
    if (!this.pluginListContainer) {
      console.warn(
        'Plugin list container not found - will be initialized later',
      );
      return;
    }

    console.log('Plugin Manager initialized');
    this.setupEventListeners();
  }

  setupEventListeners() {
    const searchInput = document.getElementById('plugin-search');
    if (searchInput && !searchInput.dataset.listenerAttached) {
      searchInput.addEventListener('input', (e) =>
        this.filterPlugins(e.target.value),
      );
      searchInput.dataset.listenerAttached = 'true';
    }

    const addBtn = document.getElementById('add-plugin-btn');
    if (addBtn && !addBtn.dataset.listenerAttached) {
      addBtn.addEventListener('click', () => this.addPlugin());
      addBtn.dataset.listenerAttached = 'true';
    }

    const refreshBtn = document.getElementById('refresh-plugin-btn');
    if (refreshBtn && !refreshBtn.dataset.listenerAttached) {
      refreshBtn.addEventListener('click', () => this.refreshPlugins());
      refreshBtn.dataset.listenerAttached = 'true';
    }

    const openFolderBtn = document.getElementById('open-plugin-folder-btn');
    if (openFolderBtn && !openFolderBtn.dataset.listenerAttached) {
      openFolderBtn.addEventListener('click', () => this.openPluginFolder());
      openFolderBtn.dataset.listenerAttached = 'true';
    }

    const checkUpdatesBtn = document.getElementById('check-plugin-updates-btn');
    if (checkUpdatesBtn && !checkUpdatesBtn.dataset.listenerAttached) {
      checkUpdatesBtn.addEventListener('click', () => this.checkForUpdates());
      checkUpdatesBtn.dataset.listenerAttached = 'true';
    }

    const marketplaceBtn = document.getElementById('plugin-marketplace-btn');
    if (marketplaceBtn && !marketplaceBtn.dataset.listenerAttached) {
      marketplaceBtn.addEventListener('click', () => this.openMarketplace());
      marketplaceBtn.dataset.listenerAttached = 'true';
    }
  }

  reinitialize() {
    console.log('Reinitializing Plugin Manager...');
    this.initContainer();

    if (this.plugins.length > 0) {
      this.renderPluginList();
    }
  }

  filterPlugins(query) {
    this.searchQuery = query.toLowerCase();
    this.updateVisibility();
  }

  updateVisibility() {
    if (!this.pluginListContainer) {
      this.pluginListContainer = document.getElementById('plugin-list');
    }

    if (!this.pluginListContainer) {
      console.warn('Cannot update visibility: container not found');
      return;
    }

    const pluginItems =
      this.pluginListContainer.querySelectorAll('.plugin-item');
    let visibleCount = 0;

    pluginItems.forEach((item) => {
      const pluginName =
        item.querySelector('.plugin-name')?.textContent.toLowerCase() || '';
      const matches = pluginName.includes(this.searchQuery);

      if (matches) {
        item.style.display = '';
        visibleCount++;
      } else {
        item.style.display = 'none';
      }
    });

    this.updatePluginCount(visibleCount);
  }

  async loadPlugins(pluginsData) {
    console.log('Loading plugins:', pluginsData);
    this.plugins = pluginsData;
    this.renderPluginList();
  }

  renderPluginList() {
    if (!this.pluginListContainer) {
      this.pluginListContainer = document.getElementById('plugin-list');
    }

    if (!this.pluginListContainer) {
      console.warn('Plugin list container not found, skipping render');
      return;
    }

    console.log('Rendering plugins, count:', this.plugins.length);

    if (this.plugins.length === 0) {
      this.pluginListContainer.innerHTML =
        '<p style="color: #666; text-align: center; padding: 20px;">No plugins available</p>';
      this.updatePluginCount(0);
      return;
    }

    this.pluginListContainer.innerHTML = '';

    this.plugins.forEach((plugin, index) => {
      console.log(`Creating element for plugin ${index}:`, plugin);
      const pluginElement = this.createPluginElement(plugin);
      this.pluginListContainer.appendChild(pluginElement);
    });

    console.log(
      'Plugin list rendered, total items:',
      this.pluginListContainer.children.length,
    );
    this.updatePluginCount(this.plugins.length);
  }

  createPluginElement(plugin) {
    const div = document.createElement('div');
    div.className = 'plugin-item';
    div.dataset.pluginId = plugin.id;

    const statusClass =
      plugin.status === 'active' ? 'status-active' : 'status-disabled';

    div.innerHTML = `
<div class="plugin-status ${statusClass}"></div>
<div class="plugin-item-content">
<span class="plugin-name">${this.escapeHtml(plugin.name)}</span>
<span class="plugin-size">${plugin.size}</span>
</div>
<div class="plugin-actions">
${
  plugin.status === 'active'
    ? `<button class="action-btn-small toggle-plugin-btn" data-plugin-id="${plugin.id}" title="Disable">
<i class="bi bi-toggle-on"></i>
</button>`
    : `<button class="action-btn-small toggle-plugin-btn" data-plugin-id="${plugin.id}" title="Enable">
<i class="bi bi-toggle-off"></i>
</button>`
}
<button class="action-btn-small delete-plugin-btn" data-plugin-id="${
      plugin.id
    }" title="Delete">
<i class="bi bi-trash"></i>
</button>
</div>
`;

    const toggleBtn = div.querySelector('.toggle-plugin-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlugin(plugin.id);
      });
    }

    const deleteBtn = div.querySelector('.delete-plugin-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePlugin(plugin.id);
      });
    }

    return div;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  updatePluginCount(count) {}

  async addPlugin() {
    if (!this.pluginsPath) {
      console.warn('No plugins path set');
      if (typeof alert !== 'undefined') {
        alert('Please set the plugins folder path in Settings first');
      }
      return;
    }

    if (!window.electronAPI || !window.electronAPI.selectPluginFile) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.selectPluginFile(
        this.pluginsPath,
      );

      if (result.success) {
        console.log('Plugin added successfully');
        if (window.toastManager) {
          window.toastManager.success('toasts.pluginAddedSuccessfully');
        }
        this.refreshPlugins();
      } else if (result.error) {
        console.error('Error adding plugin:', result.error);
        if (window.toastManager) {
          window.toastManager.error(`Failed to add plugin: ${result.error}`);
        } else if (typeof alert !== 'undefined') {
          alert(`Error: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error adding plugin:', error);
    }
  }

  async togglePlugin(pluginId) {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    if (!window.electronAPI || !window.electronAPI.togglePlugin) {
      console.error('Electron API not available');
      return;
    }

    const pluginElement = this.pluginListContainer.querySelector(
      `[data-plugin-id="${pluginId}"]`,
    );
    if (pluginElement) {
      pluginElement.classList.add('plugin-toggling');
    }

    try {
      const result = await window.electronAPI.togglePlugin(
        plugin.filePath,
        this.pluginsPath,
      );

      if (result.success) {
        console.log('Plugin toggled successfully');

        const wasActive = plugin.status === 'active';
        if (window.toastManager) {
          window.toastManager.success(
            wasActive ? 'Plugin disabled' : 'Plugin enabled',
          );
        }

        setTimeout(() => {
          this.refreshPlugins();
        }, 300);
      } else {
        console.error('Error toggling plugin:', result.error);
        if (pluginElement) {
          pluginElement.classList.remove('plugin-toggling');
        }
        if (window.toastManager) {
          window.toastManager.error(`Failed to toggle plugin: ${result.error}`);
        } else if (typeof alert !== 'undefined') {
          alert(`Error: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error toggling plugin:', error);
      if (pluginElement) {
        pluginElement.classList.remove('plugin-toggling');
      }
    }
  }

  async deletePlugin(pluginId) {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin) return;

    if (window.modalManager) {
      window.modalManager.openDeletePluginModal(plugin, async () => {
        await this.executeDeletePlugin(plugin);
      });
    } else {
      if (!confirm(`Are you sure you want to delete "${plugin.name}"?`)) {
        return;
      }
      await this.executeDeletePlugin(plugin);
    }
  }

  async executeDeletePlugin(plugin) {
    if (!window.electronAPI || !window.electronAPI.deletePlugin) {
      console.error('Electron API not available');
      return;
    }

    const pluginElement = this.pluginListContainer.querySelector(
      `[data-plugin-id="${plugin.id}"]`,
    );
    if (pluginElement) {
      pluginElement.classList.add('plugin-deleting');
    }

    try {
      const result = await window.electronAPI.deletePlugin(plugin.filePath);

      if (result.success) {
        console.log('Plugin deleted successfully');

        setTimeout(() => {
          if (window.toastManager) {
            window.toastManager.success(
              `Plugin "${plugin.name}" has been deleted`,
            );
          }
          this.refreshPlugins();
        }, 300);
      } else {
        console.error('Error deleting plugin:', result.error);
        if (pluginElement) {
          pluginElement.classList.remove('plugin-deleting');
        }
        if (window.toastManager) {
          window.toastManager.error(`Failed to delete plugin: ${result.error}`);
        } else if (window.modalManager) {
          window.modalManager.showAlert(
            'error',
            'Error',
            `Failed to delete plugin: ${result.error}`,
          );
        } else if (typeof alert !== 'undefined') {
          alert(`Error: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Error deleting plugin:', error);
      if (pluginElement) {
        pluginElement.classList.remove('plugin-deleting');
      }
      if (window.modalManager) {
        window.modalManager.showAlert(
          'error',
          'Error',
          `An error occurred: ${error.message}`,
        );
      }
    }
  }

  async loadPluginsFromFolder(pluginsPath) {
    if (!window.electronAPI || !window.electronAPI.readPluginsFolder) {
      console.error('Electron API not available');
      return;
    }

    this.pluginsPath = pluginsPath;

    try {
      const result = await window.electronAPI.readPluginsFolder(pluginsPath);

      if (result.error) {
        console.error('Error reading plugins:', result.error);
        this.loadPlugins([]);
        return;
      }

      const allPlugins = [];
      let idCounter = 1;

      for (const plugin of result.activePlugins) {
        allPlugins.push({
          id: String(idCounter++),
          name: plugin.name,
          size: plugin.size,
          status: 'active',
          filePath: plugin.path,
        });
      }

      for (const plugin of result.disabledPlugins) {
        allPlugins.push({
          id: String(idCounter++),
          name: plugin.name,
          size: plugin.size,
          status: 'disabled',
          filePath: plugin.path,
        });
      }

      this.loadPlugins(allPlugins);
    } catch (error) {
      console.error('Failed to load plugins from folder:', error);
      this.loadPlugins([]);
    }
  }

  async refreshPlugins() {
    if (
      typeof window.settingsManager !== 'undefined' &&
      window.settingsManager
    ) {
      const pluginsPath = window.settingsManager.getPluginsPath();
      if (pluginsPath) {
        console.log('Refreshing plugins from saved path:', pluginsPath);
        this.loadPluginsFromFolder(pluginsPath);
        return;
      }
    }

    console.log('No plugins path set');
  }

  async fetchPlugins() {
    if (
      typeof window.settingsManager !== 'undefined' &&
      window.settingsManager
    ) {
      const pluginsPath = window.settingsManager.getPluginsPath();
      if (pluginsPath) {
        console.log('Loading plugins from saved path:', pluginsPath);
        this.loadPluginsFromFolder(pluginsPath);
        return;
      }
    }

    console.log('No plugins path configured');
  }

  async openPluginFolder() {
    if (!this.pluginsPath) {
      console.warn('No plugins path set');
      return;
    }

    if (!window.electronAPI || !window.electronAPI.openFolder) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.openFolder(this.pluginsPath);
      if (!result.success) {
        console.error('Failed to open folder:', result.error);
      }
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  }

  async checkForUpdates() {
    if (!window.electronAPI || !window.electronAPI.checkPluginUpdates) {
      console.error('Electron API not available');
      return;
    }

    const checkBtn = document.getElementById('check-plugin-updates-btn');
    if (checkBtn) {
      checkBtn.disabled = true;
      checkBtn.style.opacity = '0.6';
    }

    try {
      if (window.toastManager) {
        window.toastManager.info('Checking for plugin updates...');
      }

      const result = await window.electronAPI.checkPluginUpdates();

      if (result.success) {
        const updatesAvailable = result.results.filter(
          (r) => r.success && r.hasUpdate,
        );

        if (updatesAvailable.length > 0) {
          if (window.modalManager) {
            window.modalManager.openPluginUpdateModal(
              updatesAvailable,
              this.plugins,
            );
          } else {
            const pluginNames = updatesAvailable
              .map((u) => u.pluginName)
              .join(', ');
            if (window.toastManager) {
              window.toastManager.info(
                `${updatesAvailable.length} plugin(s) have updates available: ${pluginNames}`,
              );
            }
          }
        } else {
          if (window.toastManager) {
            window.toastManager.success('All plugins are up to date');
          }
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error(
            `Failed to check updates: ${result.error || 'Unknown error'}`,
          );
        }
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      if (window.toastManager) {
        window.toastManager.error(`Error checking updates: ${error.message}`);
      }
    } finally {
      if (checkBtn) {
        checkBtn.disabled = false;
        checkBtn.style.opacity = '1';
      }
    }
  }

  async updatePlugin(pluginName, downloadUrl, pluginPath, targetVersion) {
    if (!window.electronAPI || !window.electronAPI.updatePlugin) {
      console.error('Electron API not available');
      return;
    }

    try {
      if (window.toastManager) {
        window.toastManager.info(`Updating ${pluginName}...`);
      }

      const result = await window.electronAPI.updatePlugin(
        pluginName,
        downloadUrl,
        pluginPath,
        targetVersion,
      );

      if (result.success) {
        if (window.toastManager) {
          window.toastManager.success(`${pluginName} updated successfully`);
        }
        setTimeout(() => {
          this.refreshPlugins();
        }, 500);
      } else {
        if (window.toastManager) {
          window.toastManager.error(
            `Failed to update ${pluginName}: ${result.error}`,
          );
        }
      }
    } catch (error) {
      console.error('Error updating plugin:', error);
      if (window.toastManager) {
        window.toastManager.error(`Error updating plugin: ${error.message}`);
      }
    }
  }

  async checkForUpdatesOnStartup() {
    if (!window.settingsManager) {
      console.log('Settings manager not available for auto-check');
      return;
    }

    await window.settingsManager.initSettings();
    const settings = window.settingsManager.settings;
    const autoCheck = settings.autoCheckPluginUpdates;
    const introShown = settings.pluginUpdateIntroShown;
    const pluginsPath = settings.pluginsPath;

    if (!autoCheck) {
      console.log(
        'Auto-check plugin updates is disabled. Checking discovery conditions...',
      );
      console.log(`introShown: ${introShown}, pluginsPath: ${pluginsPath}`);

      // Check if we should propose to enable it
      if (!introShown && pluginsPath) {
        try {
          // We removed the check for !hasVersions to allow users with existing plugins to see the intro
          console.log('Triggering Plugin Update Intro Modal');
          if (
            window.modalManager &&
            window.modalManager.openPluginUpdateIntroModal
          ) {
            window.modalManager.openPluginUpdateIntroModal(
              async () => {
                // On Enable
                await window.settingsManager.setSetting(
                  'autoCheckPluginUpdates',
                  true,
                );
                await window.settingsManager.setSetting(
                  'pluginUpdateIntroShown',
                  true,
                );

                // Open Marketplace so user can reinstall plugins
                console.log('Opening marketplace from intro...');
                this.openMarketplace();

                // Force overlay to stay visible
                setTimeout(() => {
                  if (window.modalManager) {
                    window.modalManager.showOverlay();
                  }
                }, 50);

                if (window.toastManager) {
                  window.toastManager.success('Automatic updates enabled');
                }
                return true; // Keep overlay open for marketplace
              },
              async () => {
                // On Disable
                await window.settingsManager.setSetting(
                  'pluginUpdateIntroShown',
                  true,
                );
              },
            );
          }
        } catch (e) {
          console.error('Error checking plugin versions for intro:', e);
        }
      }
      return;
    }

    console.log('Auto-checking plugin updates on startup...');
    setTimeout(() => {
      this.checkForUpdates();
    }, 5000); // Increased delay to ensure everything is loaded
  }

  openMarketplace() {
    console.log(
      'openMarketplace called',
      window.modalManager ? 'ModalManager OK' : 'ModalManager MISSING',
    );
    if (window.modalManager) {
      window.modalManager.openPluginMarketplaceModal();
    }
  }
}

if (typeof window !== 'undefined') {
  window.pluginManager = new PluginManager();
  console.log('Plugin Manager initialized');
}
