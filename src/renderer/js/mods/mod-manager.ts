class ModManager {
  constructor() {
    this.mods = [];
    this.selectedMod = null;
    this.modListContainer = null;
    this.modsPath = null;
    this.searchQuery = '';
    this.categoryFilter = '';
    this.renderedModIds = new Set();
    this.conflicts = [];
    this.isCheckingConflicts = false;

    this.listRenderer = null;
    this.contextMenuHandler = null;
    this.operations = null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initContainer());
    } else {
      this.initContainer();
    }
  }

  initContainer() {
    this.modListContainer = document.getElementById('mod-list');
    if (!this.modListContainer) {
      console.warn('Mod list container not found - will be initialized later');
      return;
    }

    if (!this.listRenderer) {
      this.listRenderer = new window.ModListRenderer(this);
    }
    if (!this.contextMenuHandler) {
      this.contextMenuHandler = new window.ModContextMenuHandler(this);
    }
    if (!this.operations) {
      this.operations = new window.ModOperations(this);
    }
    if (!this.keybindsHandler) {
      this.keybindsHandler = new window.ModKeybindsHandler(this);
    }

    console.log('Mod Manager components initialized');
  }

  reinitialize() {
    this.initContainer();

    if (this.mods.length > 0) {
      this.renderModList(true);
    } else {
      this.restoreSelectedMod();
    }
  }

  filterMods(query) {
    this.searchQuery = query.toLowerCase();
    this.updateVisibility();
  }

  filterByCategory(category) {
    this.categoryFilter = category;
    this.updateVisibility();
  }

  updateVisibility() {
    if (!this.modListContainer) {
      this.modListContainer = document.getElementById('mod-list');
    }

    if (!this.modListContainer) {
      console.warn('Cannot update visibility: container not found');
      return;
    }

    if (!this.listRenderer) {
      console.warn('List renderer not initialized, doing full render instead');
      this.renderModList(true);
      return;
    }

    const success = this.listRenderer.updateVisibility(
      this.mods,
      this.modListContainer,
      this.searchQuery,
      this.categoryFilter,
    );

    if (!success) {
      this.renderModList(true);
    }
  }

  async loadMods(modsData) {
    this.mods = modsData;
    this.renderModList(true);

    if (window.discordRPCClient) {
      window.discordRPCClient.updateModCount(modsData.length);
    }
  }

  renderModList(forceRender = false) {
    if (!this.modListContainer) {
      this.modListContainer = document.getElementById('mod-list');
    }

    if (!this.modListContainer) {
      console.warn('Mod list container not found, skipping render');
      return;
    }

    if (!this.listRenderer) {
      console.warn('List renderer not initialized, reinitializing...');
      this.initContainer();
      if (!this.listRenderer) {
        console.error('Failed to initialize list renderer');
        return;
      }
    }

    if (this.mods.length === 0) {
      this.modListContainer.innerHTML =
        '<p style="color: #666; text-align: center; padding: 20px;">No mods available</p>';
      this.renderedModIds.clear();
      return;
    }

    const currentModIds = new Set(this.mods.map((m) => m.id));
    const needsFullRender =
      forceRender ||
      this.renderedModIds.size !== currentModIds.size ||
      ![...currentModIds].every((id) => this.renderedModIds.has(id));

    if (!needsFullRender) {
      this.updateVisibility();
      return;
    }

    this.listRenderer.renderModList(
      this.mods,
      this.modListContainer,
      this.searchQuery,
      this.categoryFilter,
    );
    this.renderedModIds = currentModIds;

    this.restoreSelectedMod();
  }

  restoreSelectedMod() {
    const savedModId = localStorage.getItem('selectedModId');
    if (savedModId && this.mods.find((m) => m.id === savedModId)) {
      setTimeout(() => {
        this.selectMod(savedModId);
      }, 100);
    }
  }

  async selectMod(modId, forceUpdate = false) {
    const mod = this.mods.find((m) => m.id === modId);
    if (!mod) return;

    const isSameMod = this.selectedMod && this.selectedMod.id === modId;

    const allModItems = this.modListContainer.querySelectorAll('.mod-item');
    allModItems.forEach((item) => {
      if (item.dataset.modId === modId) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });

    if (isSameMod && !forceUpdate) {
      return;
    }

    this.selectedMod = mod;
    localStorage.setItem('selectedModId', modId);

    this.updatePreview(mod);

    if (window.modInfoManager) {
      window.modInfoManager.showLoading();

      if (
        mod.folderPath &&
        window.electronAPI &&
        window.electronAPI.getModInfo
      ) {
        try {
          console.log('Loading mod info for:', mod.folderPath);
          const modInfo = await window.electronAPI.getModInfo(mod.folderPath);
          console.log('Received mod info from main process:', modInfo);

          if (modInfo) {
            console.log('Displaying mod info:', modInfo);
            window.modInfoManager.displayModInfo(modInfo, mod.folderPath);
          } else {
            console.log('No mod info found, showing fallback');

            const t = (key) => {
              return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
            };
            window.modInfoManager.displayModInfo(
              {
                display_name: mod.name,
                description: t('tools.modInfo.noInfoToml'),
              },
              mod.folderPath,
            );
          }
        } catch (error) {
          console.error('Error loading mod info:', error);
          const t = (key) => {
            return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
          };
          window.modInfoManager.showError(t('tools.modInfo.failedToLoad'));
        }
      } else {
        console.log('No folderPath or electronAPI, showing fallback');
        const t = (key) => {
          return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
        };
        window.modInfoManager.displayModInfo(
          {
            display_name: mod.name,
            description: t('tools.modInfo.noDetailedInfo'),
          },
          null,
        );
      }
    }
  }

  async updatePreview(mod) {
    const previewArea = document.querySelector('.preview-area');
    if (!previewArea) return;

    previewArea.classList.add('loading');

    if (
      mod.folderPath &&
      window.electronAPI &&
      window.electronAPI.getPreviewImage
    ) {
      try {
        const previewPath = await window.electronAPI.getPreviewImage(
          mod.folderPath,
        );

        if (previewPath) {
          // Animate out existing image if present
          const existingImg = previewArea.querySelector('img');
          if (existingImg) {
            existingImg.style.opacity = '0';
            await new Promise((resolve) => setTimeout(resolve, 200));
          }

          previewArea.classList.remove('no-preview');

          const img = document.createElement('img');
          img.style.opacity = '0';
          img.alt = 'Preview';

          await new Promise((resolve, reject) => {
            img.onload = () => {
              // Calculate optimal height based on image aspect ratio
              const aspectRatio = img.naturalHeight / img.naturalWidth;
              const containerWidth = previewArea.offsetWidth;
              let optimalHeight = containerWidth * aspectRatio;

              // Clamp between min and max
              optimalHeight = Math.max(150, Math.min(400, optimalHeight));

              previewArea.style.height = `${optimalHeight}px`;
              resolve();
            };
            img.onerror = reject;
            img.src = previewPath;
          });

          previewArea.innerHTML = '';
          previewArea.appendChild(img);

          setTimeout(() => {
            img.style.opacity = '1';
            previewArea.classList.remove('loading');
          }, 10);

          return;
        }
      } catch (error) {
        console.error('Error loading preview:', error);
      }
    }

    if (mod.previewImage) {
      // Animate out existing image if present
      const existingImg = previewArea.querySelector('img');
      if (existingImg) {
        existingImg.style.opacity = '0';
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      previewArea.classList.remove('no-preview');

      const img = document.createElement('img');
      img.style.opacity = '0';
      img.alt = 'Preview';

      await new Promise((resolve) => {
        img.onload = () => {
          // Calculate optimal height based on image aspect ratio
          const aspectRatio = img.naturalHeight / img.naturalWidth;
          const containerWidth = previewArea.offsetWidth;
          let optimalHeight = containerWidth * aspectRatio;

          // Clamp between min and max
          optimalHeight = Math.max(150, Math.min(400, optimalHeight));

          previewArea.style.height = `${optimalHeight}px`;
          resolve();
        };
        img.onerror = resolve;
        img.src = mod.previewImage;
      });

      previewArea.innerHTML = '';
      previewArea.appendChild(img);

      setTimeout(() => {
        img.style.opacity = '1';
        previewArea.classList.remove('loading');
      }, 10);
    } else {
      // Animate out existing image if present before showing "No preview"
      const existingImg = previewArea.querySelector('img');
      if (existingImg) {
        existingImg.classList.add('preview-exit');

        // Shrink immediately while image fades out
        previewArea.classList.add('no-preview');

        await new Promise((resolve) => setTimeout(resolve, 150));
      } else {
        // No existing image, just shrink
        previewArea.classList.add('no-preview');
      }

      previewArea.innerHTML =
        '<p style="color: #666; text-align: center;">No preview available</p>';
      previewArea.classList.remove('loading');
    }
  }

  loadExampleMods() {
    const exampleMods = [
      {
        id: '1',
        name: 'Fighter Pack v2',
        version: '2.1.0',
        author: 'FightMaster',
        description: 'Collection de nouveaux combattants',
        size: '15.2 MB',
        status: 'active',
      },
      {
        id: '2',
        name: 'Stage HD Remaster',
        version: '1.5.0',
        author: 'StageBuilder',
        description: 'Stages en haute définition',
        size: '8.7 MB',
        status: 'active',
      },
      {
        id: '3',
        name: 'Sound Pack Deluxe',
        version: '1.0.0',
        author: 'AudioMod',
        description: 'Sons et musiques améliorés',
        size: '22.4 MB',
        status: 'conflict',
      },
      {
        id: '4',
        name: 'UI Enhancement',
        version: '3.2.1',
        author: 'UITeam',
        description: 'Interface utilisateur améliorée',
        size: '4.1 MB',
        status: 'disabled',
      },
      {
        id: '5',
        name: 'Custom Animations',
        version: '1.8.0',
        author: 'AnimPro',
        description: 'Nouvelles animations de combat',
        size: '12.6 MB',
        status: 'active',
      },
      {
        id: '6',
        name: 'Balance Patch',
        version: '2.0.0',
        author: 'BalanceTeam',
        description: 'Équilibrage des personnages',
        size: '0.8 MB',
        status: 'active',
      },
    ];

    this.loadMods(exampleMods);
  }

  async loadModsFromFolder(modsPath) {
    if (!window.electronAPI || !window.electronAPI.readModsFolder) {
      console.error('Electron API not available');
      this.loadExampleMods();
      return;
    }

    this.modsPath = modsPath;

    try {
      const result = await window.electronAPI.readModsFolder(modsPath);

      if (result.error) {
        console.error('Error reading mods:', result.error);
        this.loadExampleMods();
        return;
      }

      const allMods = [];
      let idCounter = 1;

      for (const mod of result.activeMods) {
        const modData = {
          id: String(idCounter++),
          name: mod.name,
          version: 'Unknown',
          author: 'Unknown',
          description: 'Active mod',
          size: 'Unknown',
          status: 'active',
          folderPath: mod.path,
          category: null,
        };
        allMods.push(modData);
      }

      for (const mod of result.disabledMods) {
        const modData = {
          id: String(idCounter++),
          name: mod.name,
          version: 'Unknown',
          author: 'Unknown',
          description: 'Disabled mod',
          size: 'Unknown',
          status: 'disabled',
          folderPath: mod.path,
          category: null,
        };
        allMods.push(modData);
      }

      this.loadMods(allMods);

      this.loadCategoriesInBackground(allMods);

      if (
        window.settingsManager &&
        window.settingsManager.settings.conflictDetectionEnabled
      ) {
        const whitelistPatterns =
          window.settingsManager.settings.conflictWhitelistPatterns || [];
        setTimeout(() => {
          this.checkConflicts(whitelistPatterns);
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to load mods from folder:', error);
      this.loadExampleMods();
    }
  }

  async loadCategoriesInBackground(mods) {
    for (const mod of mods) {
      try {
        const modInfo = await window.electronAPI.getModInfo(mod.folderPath);
        if (modInfo && modInfo.category) {
          let category = modInfo.category;

          const categoryMap = {
            fighter: 'Fighter',
            fighters: 'Fighter',
            skin: 'Fighter',
            skins: 'Fighter',
            moveset: 'Movesets',
            movesets: 'Movesets',
            stage: 'stages',
            stages: 'stages',
            effect: 'effects',
            effects: 'effects',
            'final smash': 'final smash',
            finalsmash: 'final smash',
            ui: 'UI',
            param: 'Param',
            other: 'Other/misc',
            misc: 'Other/misc',
            'other/misc': 'Other/misc',
          };

          const normalizedCategory =
            categoryMap[category.toLowerCase()] || category;
          mod.category = normalizedCategory;
        }
      } catch (error) {}
    }

    this.updateVisibility();
  }

  async openSelectedModFolder() {
    if (!this.modsPath) {
      console.warn('No mods path set');
      return;
    }

    if (!window.electronAPI || !window.electronAPI.openFolder) {
      console.error('Electron API not available');
      return;
    }

    try {
      const result = await window.electronAPI.openFolder(this.modsPath);
      if (!result.success) {
        console.error('Failed to open folder:', result.error);
      }
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  }

  async fetchMods() {
    if (
      typeof window.settingsManager !== 'undefined' &&
      window.settingsManager
    ) {
      const modsPath = window.settingsManager.getModsPath();
      if (modsPath) {
        console.log('Loading mods from saved path:', modsPath);
        this.loadModsFromFolder(modsPath);
        return;
      }
    }

    console.log('Loading example mods');
    this.loadExampleMods();
  }

  async checkConflicts(whitelistPatterns = []) {
    if (
      !this.modsPath ||
      !window.electronAPI ||
      !window.electronAPI.detectConflicts
    ) {
      return {
        success: false,
        error: 'Conflict detection not available',
      };
    }

    this.isCheckingConflicts = true;

    if (window.statusBarManager) {
      window.statusBarManager.updateCheckingConflictsStatus();
    }

    try {
      const result = await window.electronAPI.detectConflicts(
        this.modsPath,
        whitelistPatterns,
      );
      this.conflicts = result.conflicts || [];
      this.isCheckingConflicts = false;

      if (window.statusBarManager) {
        if (result.totalConflicts > 0) {
          window.statusBarManager.updateConflictStatus(result.totalConflicts);
        } else {
          const statusRight = document.querySelector('.bottom-text-right');
          if (statusRight) {
            statusRight.innerHTML = '';
          }
        }
        if (!window.statusBarManager.checkActiveDownloads()) {
          if (window.statusBarManager.currentTab) {
            window.statusBarManager.updateStatus(
              window.statusBarManager.currentTab,
            );
          } else {
            window.statusBarManager.updateStatus('tools');
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Error checking conflicts:', error);
      this.isCheckingConflicts = false;
      if (window.statusBarManager) {
        const statusRight = document.querySelector('.bottom-text-right');
        if (statusRight) {
          statusRight.innerHTML = '';
        }
        if (!window.statusBarManager.checkActiveDownloads()) {
          if (window.statusBarManager.currentTab) {
            window.statusBarManager.updateStatus(
              window.statusBarManager.currentTab,
            );
          } else {
            window.statusBarManager.updateStatus('tools');
          }
        }
      }
      return { success: false, error: error.message };
    }
  }

  async askExportFormat() {
    return new Promise((resolve) => {
      const t = (key, params = {}) => {
        return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
      };

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'export-format-modal';
      modal.style.display = 'block';

      modal.innerHTML = `
        <div class="modal-header">
          <h3><i class="bi bi-file-earmark-text"></i> ${t('modals.exportFormat.title')}</h3>
          <button class="modal-close" id="export-format-close-btn">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="modal-body">
          <p>${t('modals.exportFormat.question')}</p>
        </div>
        <div class="modal-footer">
          <button class="modal-btn modal-btn-cancel" id="export-format-cancel-btn">
            <i class="bi bi-x-lg"></i> ${t('common.cancel')}
          </button>
          <button class="modal-btn modal-btn-primary" id="export-format-txt-btn">
            <i class="bi bi-filetype-txt"></i> ${t('modals.exportFormat.txt')}
          </button>
          <button class="modal-btn modal-btn-primary" id="export-format-md-btn">
            <i class="bi bi-filetype-md"></i> ${t('modals.exportFormat.md')}
          </button>
        </div>
      `;

      document.body.appendChild(modal);
      if (window.modalManager) {
        window.modalManager.showOverlay();
      }

      const closeModal = (format = null) => {
        modal.style.display = 'none';
        modal.remove();
        if (window.modalManager) {
          window.modalManager.hideOverlay();
        }
        resolve(format);
      };

      document
        .getElementById('export-format-close-btn')
        .addEventListener('click', () => closeModal(null));
      document
        .getElementById('export-format-cancel-btn')
        .addEventListener('click', () => closeModal(null));
      document
        .getElementById('export-format-txt-btn')
        .addEventListener('click', () => closeModal('txt'));
      document
        .getElementById('export-format-md-btn')
        .addEventListener('click', () => closeModal('md'));
    });
  }

  async exportModsList() {
    if (
      !window.electronAPI ||
      !window.electronAPI.saveFileDialog ||
      !window.electronAPI.writeFile
    ) {
      console.error('Electron API not available for file operations');
      return;
    }

    // Get all enabled mods
    const enabledMods = this.mods.filter((mod) => mod.status === 'active');

    if (enabledMods.length === 0) {
      if (window.toastManager) {
        window.toastManager.show(
          'warning',
          'toasts.noEnabledModsToExport',
          3000,
        );
      }
      return;
    }

    // Ask for export format
    const format = await this.askExportFormat();
    if (!format) {
      return; // User cancelled
    }

    // Group mods by character
    const modsByCharacter = new Map();
    const modsWithoutCharacter = [];

    for (const mod of enabledMods) {
      if (!mod.folderPath) {
        modsWithoutCharacter.push(mod);
        continue;
      }

      try {
        // Get mod info
        const modInfo = await window.electronAPI.getModInfo(mod.folderPath);
        const modName = modInfo?.display_name || mod.name;
        const modUrl = modInfo?.url || '';

        // Scan for characters
        const fighters = await window.electronAPI.scanModForFighters(
          mod.folderPath,
        );

        if (fighters && fighters.length > 0) {
          fighters.forEach((rawFighterId) => {
            const fighterId = window.resolveFolderName
              ? window.resolveFolderName(rawFighterId)
              : rawFighterId.toLowerCase();

            const charInfo = window.SSBU_CHARACTERS
              ? window.SSBU_CHARACTERS[fighterId]
              : null;
            const charName = charInfo ? charInfo.name : rawFighterId;

            if (!modsByCharacter.has(charName)) {
              modsByCharacter.set(charName, []);
            }

            modsByCharacter.get(charName).push({
              name: modName,
              url: modUrl,
            });
          });
        } else {
          // Mod doesn't have character folders, add to "Other" category
          if (!modsByCharacter.has('Other')) {
            modsByCharacter.set('Other', []);
          }
          modsByCharacter.get('Other').push({
            name: modName,
            url: modUrl,
          });
        }
      } catch (error) {
        console.error(`Error processing mod ${mod.name}:`, error);
        modsWithoutCharacter.push(mod);
      }
    }

    // Build the content based on format
    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    let content = '';
    const isMarkdown = format === 'md';

    if (isMarkdown) {
      content = `# ${t('modals.exportFormat.modsLoaded', { count: enabledMods.length })}\n\n`;
    } else {
      content = `${enabledMods.length} mods loaded\n\n`;
    }

    // Sort characters alphabetically
    const sortedCharacters = Array.from(modsByCharacter.keys()).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });

    // Write mods grouped by character
    for (const charName of sortedCharacters) {
      const mods = modsByCharacter.get(charName);

      // Format character name based on format
      if (isMarkdown) {
        content += `## ${charName}\n\n`;
      } else {
        content += `${charName}\n`;
      }

      // Remove duplicates (same mod name)
      const uniqueMods = [];
      const seenNames = new Set();
      for (const mod of mods) {
        if (!seenNames.has(mod.name)) {
          seenNames.add(mod.name);
          uniqueMods.push(mod);
        }
      }

      uniqueMods.forEach((mod) => {
        if (mod.url) {
          if (isMarkdown) {
            content += `- ${mod.name} (${mod.url})\n`;
          } else {
            content += `${mod.name} (${mod.url}),\n`;
          }
        } else {
          if (isMarkdown) {
            content += `- ${mod.name}\n`;
          } else {
            content += `${mod.name},\n`;
          }
        }
      });

      content += '\n';
    }

    // Save to file
    try {
      const extension = format === 'md' ? 'md' : 'txt';
      const fileName = `mods_list.${extension}`;
      const filters =
        format === 'md'
          ? [
              { name: 'Markdown Files', extensions: ['md'] },
              { name: 'Text Files', extensions: ['txt'] },
              { name: 'All Files', extensions: ['*'] },
            ]
          : [
              { name: 'Text Files', extensions: ['txt'] },
              { name: 'Markdown Files', extensions: ['md'] },
              { name: 'All Files', extensions: ['*'] },
            ];

      const result = await window.electronAPI.saveFileDialog(fileName, filters);

      if (result.success && result.filePath) {
        await window.electronAPI.writeFile(result.filePath, content);
        if (window.toastManager) {
          window.toastManager.show(
            'success',
            'toasts.modListExportedSuccessfully',
            4000,
            { filePath: result.filePath },
          );
        }
      }
    } catch (error) {
      console.error('Error exporting mod list:', error);
      if (window.toastManager) {
        window.toastManager.show(
          'error',
          'toasts.failedToExportModList',
          4000,
          { error: error.message },
        );
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.modManager = new ModManager();
  console.log('Mod Manager initialized');
}
