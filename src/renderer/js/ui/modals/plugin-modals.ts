export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[plugin-modals] ModalManagerClass not found'); return; }

  M.prototype.openPluginUpdateModal = function (updates, plugins) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'plugin-update-modal';

  const updatesList = updates
    .map((update) => {
      const plugin = plugins.find(
        (p) =>
          p.name === update.pluginName ||
          p.name.replace('.nro', '') === update.pluginName,
      );
      const pluginPath = plugin ? plugin.filePath : null;

      return `
        <div class="plugin-update-item" data-plugin-name="${update.pluginName}">
          <div class="plugin-update-info">
            <span class="plugin-update-name">${this.escapeHtml(update.pluginName)}</span>
            <span class="plugin-update-versions">
              ${update.currentVersion} → ${update.latestVersion}
            </span>
          </div>
          <button class="modal-btn modal-btn-primary update-plugin-btn" 
                  data-plugin-name="${update.pluginName}"
                  data-download-url="${update.downloadUrl || ''}"
                  data-plugin-path="${pluginPath || ''}"
                  data-latest-version="${update.latestVersion || ''}">
            Update
          </button>
        </div>
      `;
    })
    .join('');

  modal.innerHTML = `
    <div class="modal-header">
      <h2>Plugin Updates Available</h2>
    </div>
    <div class="modal-body">
      <p style="margin-bottom: 15px; color: #aaa;">
        The following plugins have updates available:
      </p>
      <div class="plugin-updates-list">
        ${updatesList}
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn modal-btn-primary" id="update-all-plugins-btn">
        Update All
      </button>
      <button class="modal-btn modal-btn-secondary" id="close-plugin-update-modal">
        Close
      </button>
    </div>
  `;

  const overlay = document.querySelector<HTMLElement>('#modal-overlay');
  if (!overlay) {
    const newOverlay = document.createElement('div');
    newOverlay.id = 'modal-overlay';
    document.body.appendChild(newOverlay);
  }

  document.body.appendChild(modal);
  this.showOverlay();
  modal.style.display = 'block';

  const closeBtn = modal.querySelector<HTMLButtonElement>('#close-plugin-update-modal');
  closeBtn!.addEventListener('click', () => {
    this.closePluginUpdateModal();
  });

  const updateAllBtn = modal.querySelector<HTMLButtonElement>('#update-all-plugins-btn');

  updateAllBtn!.addEventListener('click', async () => {
    const updateButtons = modal.querySelectorAll<HTMLButtonElement>(
      '.update-plugin-btn:not(:disabled)',
    );

    if (updateButtons.length === 0) {
      if (window.toastManager) {
        window.toastManager.info('No plugins to update');
      }
      return;
    }

    updateAllBtn!.disabled = true;
    updateAllBtn!.textContent = 'Updating all...';

    for (const btn of updateButtons) {
      const pluginName = btn.dataset.pluginName;
      const downloadUrl = btn.dataset.downloadUrl;
      const pluginPath = btn.dataset.pluginPath;
      const targetVersion = btn.dataset.latestVersion;

      if (!downloadUrl || !pluginPath) {
        continue;
      }

      btn.disabled = true;
      btn.textContent = 'Updating...';

      if (window.pluginManager) {
        await window.pluginManager.updatePlugin(
          pluginName,
          downloadUrl,
          pluginPath,
          targetVersion,
        );
      }

      const updateItem = modal.querySelector<HTMLElement>(
        `[data-plugin-name="${pluginName}"]`,
      );
      if (updateItem) {
        updateItem.style.opacity = '0.5';
      }
    }

    setTimeout(() => {
      this.closePluginUpdateModal();

      if (window.toastManager) {
        window.toastManager.success('All updates completed');
      }
    }, 1000);
  });

  const updateButtons = modal.querySelectorAll<HTMLButtonElement>('.update-plugin-btn');

  updateButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pluginName = btn.dataset.pluginName;
      const downloadUrl = btn.dataset.downloadUrl;
      const pluginPath = btn.dataset.pluginPath;
      const targetVersion = btn.dataset.latestVersion;

      if (!downloadUrl) {
        if (window.toastManager) {
          window.toastManager.error(
            `No download URL available for ${pluginName}`,
          );
        }
        return;
      }

      if (!pluginPath) {
        if (window.toastManager) {
          window.toastManager.error(
            `Plugin path not found for ${pluginName}`,
          );
        }
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Updating...';

      if (window.pluginManager) {
        await window.pluginManager.updatePlugin(
          pluginName,
          downloadUrl,
          pluginPath,
          targetVersion,
        );
      }

      const updateItem = modal.querySelector<HTMLElement>(
        `[data-plugin-name="${pluginName}"]`,
      );

      if (updateItem) {
        updateItem.style.opacity = '0.5';
      }

      const remainingUpdates = modal.querySelectorAll<HTMLElement>(
        ".plugin-update-item:not([style*='opacity: 0.5'])",
      );
      if (remainingUpdates.length === 0) {
        setTimeout(() => {
          this.closePluginUpdateModal();

          if (window.toastManager) {
            window.toastManager.success('All updates completed');
          }
        }, 1000);
      }
    });
  });

  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      this.closePluginUpdateModal();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
};

M.prototype.closePluginUpdateModal = function () {
  this.closeModal('plugin-update-modal');
};

M.prototype.openPluginMarketplaceModal = async function () {
  const modal = document.createElement('div');
  modal.className = 'modal modal-large modal-marketplace';
  modal.id = 'plugin-marketplace-modal';

  modal.innerHTML = `
    <div class="modal-header">
      <h2 data-i18n="plugins.marketplace">Plugin Marketplace</h2>
    </div>
    <div class="modal-body">
      <div id="marketplace-results" class="marketplace-results">
      </div>
    </div>
    <div class="modal-footer">
      <button class="modal-btn modal-btn-secondary" id="close-marketplace-modal">
        <span data-i18n="common.close">Close</span>
      </button>
    </div>
  `;

  const overlay = document.querySelector<HTMLElement>('#modal-overlay');
  if (!overlay) {
    const newOverlay = document.createElement('div');
    newOverlay.id = 'modal-overlay';
    document.body.appendChild(newOverlay);
  }

  document.body.appendChild(modal);
  this.showOverlay();
  modal.style.display = 'block';

  if (window.i18n) {
    window.i18n.updateDOM();
  }

  const resultsContainer = modal.querySelector<HTMLElement>('#marketplace-results');

  let installedRepos: string[] = [];
  if (window.electronAPI && window.electronAPI.getPluginRepoMapping) {
    try {
      const result = await window.electronAPI.getPluginRepoMapping();
      if (result.success && result.mappings) {
        installedRepos = Object.values(result.mappings) as string[];
      }
    } catch (error) {
      console.warn('[openPluginMarketplaceModal] Failed to get plugin repo mappings:', error);
    }
  }

  if (window.pluginMarketplace) {
    const plugins = window.pluginMarketplace.getPlugins();
    this.renderMarketplaceResults(plugins, resultsContainer!, installedRepos);
  }

  const closeBtn = modal.querySelector<HTMLElement>('#close-marketplace-modal');

  closeBtn!.addEventListener('click', () => {
    this.closePluginMarketplaceModal();
  });

  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      this.closePluginMarketplaceModal();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
};

M.prototype.renderMarketplaceResults = function (plugins: any[], container: HTMLElement, installedRepos: string[] = []) {
  if (!plugins || plugins.length === 0) {
    container.innerHTML = `
      <div class="marketplace-empty">
        <i class="bi bi-inbox" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i>
        <p data-i18n="plugins.marketplaceNoResults">No plugins available</p>
      </div>
    `;
    if (window.i18n) {
      window.i18n.updateDOM();
    }
    return;
  }

  const pluginsGrid = plugins
    .map((plugin) => {
      const isInstalled = installedRepos.some(
        (installedRepo) =>
          installedRepo.toLowerCase() === plugin.repo.toLowerCase(),
      );
      const buttonClass = isInstalled
        ? 'marketplace-card-install-btn installed'
        : 'marketplace-card-install-btn';
      const buttonIcon = isInstalled ? 'bi-arrow-clockwise' : 'bi-download';
      const buttonTextKey = isInstalled
        ? 'plugins.reinstall'
        : 'plugins.install';
      const buttonDefaultText = isInstalled ? 'Reinstall' : 'Install';
      const cardClass = isInstalled
        ? 'marketplace-plugin-card installed'
        : 'marketplace-plugin-card';

      return `
      <div class="${cardClass}" data-installed="${isInstalled}">
        <div class="marketplace-card-header">
          <div class="marketplace-card-title-section">
            <h3 class="marketplace-card-name">${this.escapeHtml(plugin.name)}</h3>
            <span class="marketplace-card-repo">${this.escapeHtml(plugin.repo)}</span>
          </div>
        </div>
        <div class="marketplace-card-body">
          <p class="marketplace-card-description">${this.escapeHtml(plugin.description || 'No description available')}</p>
        </div>
        <div class="marketplace-card-footer">
          <a href="${this.escapeHtml(plugin.url || `https://github.com/${plugin.repo}`)}" target="_blank" class="marketplace-card-link" rel="noopener noreferrer">
            <i class="bi bi-github"></i>
            <span data-i18n="plugins.viewOnGitHub">View on GitHub</span>
          </a>
          <button class="${buttonClass}" 
                  data-plugin-name="${this.escapeHtml(plugin.name)}"
                  data-plugin-repo="${this.escapeHtml(plugin.repo)}"
                  data-is-installed="${isInstalled}">
            <i class="bi ${buttonIcon}"></i>
            <span data-i18n="${buttonTextKey}">${buttonDefaultText}</span>
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  container.innerHTML = `<div class="marketplace-grid">${pluginsGrid}</div>`;

  if (window.i18n) {
    window.i18n.updateDOM();
  }

  const githubLinks = container.querySelectorAll<HTMLElement>('.marketplace-card-link');
  githubLinks.forEach((link) => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = link.getAttribute('href');
      if (url && window.electronAPI && window.electronAPI.openUrl) {
        await window.electronAPI.openUrl(url);
      } else if (url) {
        window.open(url, '_blank');
      }
    });
  });

  const installButtons = container.querySelectorAll<HTMLButtonElement>('.marketplace-card-install-btn');

  installButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pluginName = btn.dataset.pluginName as string;
      const pluginRepo = btn.dataset.pluginRepo as string;

      btn.disabled = true;
      btn.innerHTML =
        '<i class="bi bi-arrow-repeat" style="animation: spin 1s linear infinite;"></i> <span data-i18n="plugins.installing">Installing...</span>';
      if (window.i18n) {
        window.i18n.updateDOM();
      }

      if (window.pluginMarketplace) {
        const downloadUrl =
          await window.pluginMarketplace.getLatestReleaseDownloadUrl(pluginRepo);

        if (downloadUrl) {
          await window.pluginMarketplace.downloadAndInstallPlugin(
            pluginName,
            pluginRepo,
            downloadUrl,
          );

          const card = btn.closest('.marketplace-plugin-card');
          if (card) {
            card.classList.add('installed');
            btn.disabled = false;
            btn.innerHTML =
              '<i class="bi bi-check-circle-fill"></i> <span data-i18n="plugins.installed">Installed</span>';
            if (window.i18n) {
              window.i18n.updateDOM();
            }
          }
        } else {
          console.error(
            `[renderMarketplaceResults] Failed to get download URL for ${pluginName} from repo ${pluginRepo}`,
          );
          if (window.toastManager) {
            window.toastManager.error(
              `No .nro or .zip file found in latest release for ${pluginName}. Please check the GitHub repository.`,
            );
          }
          btn.disabled = false;
          btn.innerHTML =
            '<i class="bi bi-download"></i> <span data-i18n="plugins.install">Install</span>';
          if (window.i18n) {
            window.i18n.updateDOM();
          }
        }
      }
    });
  });
};

M.prototype.closePluginMarketplaceModal = function () {
  this.closeModal('plugin-marketplace-modal');
};

M.prototype.openPluginUpdateIntroModal = function (onEnable, onDisable) {
  const modal = document.createElement('div');

  modal.className = 'modal';
  modal.id = 'plugin-intro-modal';
  modal.style.maxWidth = '500px';
  modal.dataset.blocking = 'true';

  modal.style.transform = 'translate(-50%, -50%)';

  modal.innerHTML = `
    <div class="modal-header">
      <h3 data-i18n="modals.pluginIntro.title">Automatic Plugin Updates</h3>
    </div>
    <div class="modal-body">
      <p data-i18n="modals.pluginIntro.message">
        We detected that you have a plugins folder configured. Would you like to enable automatic plugin update checks on startup?
      </p>
    </div>
    <div class="modal-footer">
      <button class="modal-btn modal-btn-primary" id="enable-plugin-updates">
        <i class="bi bi-check-lg"></i> <span data-i18n="modals.pluginIntro.enable">Yes, Enable Auto-Updates</span>
      </button>
      <button class="modal-btn modal-btn-secondary" id="disable-plugin-updates">
        <span data-i18n="modals.pluginIntro.disable">No, thanks</span>
      </button>
    </div>
  `;

  document.body.appendChild(modal);
  this.showOverlay();
  modal.style.display = 'block';

  if (window.i18n) {
    window.i18n.updateDOM();
  }

  const enableBtn = modal.querySelector<HTMLElement>('#enable-plugin-updates');
  const disableBtn = modal.querySelector<HTMLElement>('#disable-plugin-updates');
  const overlay = document.querySelector<HTMLElement>('#modal-overlay');

  if (!document.querySelector<HTMLElement>('#shake-style')) {
    const style = document.createElement('style');
    style.id = 'shake-style';
    style.textContent = `
      @keyframes shake {
          0%, 100% { transform: translate(-50%, -50%); }
          10%, 30%, 50%, 70%, 90% { transform: translate(-50%, -50%) translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translate(-50%, -50%) translateX(5px); }
      }
      .shake-animation {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
      }
    `;
    document.head.appendChild(style);
  }

  const shakeHandler = (e) => {
    if (e.target === overlay) {
      console.log('[openPluginUpdateIntroModal] Shake handler triggered');
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      modal.classList.remove('shake-animation');
      void modal.offsetWidth;
      modal.classList.add('shake-animation');
    }
  };

  if (overlay) {
    overlay.addEventListener('click', shakeHandler, true);
  }

  enableBtn!.addEventListener('click', () => {
    if (onEnable) {
      const keepOverlay = onEnable();

      this.closeModal(modal, {
        skipHideOverlay: keepOverlay,
      });
    } else {
      this.closeModal(modal);
    }
  });

  disableBtn!.addEventListener('click', () => {
    if (onDisable) onDisable();
    this.closeModal(modal);
  });
};
})();

