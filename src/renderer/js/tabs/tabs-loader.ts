const tabConfigs = {
  tools: 'tabs/tools.html',
  plugins: 'tabs/plugins.html',
  characters: 'tabs/characters.html',
  stages: 'tabs/stages.html',
  social: 'tabs/social.html',
  downloads: 'tabs/downloads.html',
  settings: 'tabs/settings.html',
  fightplanner: 'tabs/fightplanner.html',
};

// Track document click listeners to prevent duplicates
let categoryFilterDocumentListener = null;

function initializeTabFeatures(tabName) {
  console.log(`Initializing features for tab: ${tabName}`);

  if (tabName === 'tools') {
    const searchInput = document.getElementById('search-mods-input');
    const savedSearchValue = searchInput ? searchInput.value : '';

    if (searchInput) {
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);

      const finalSearchInput = document.getElementById('search-mods-input');
      if (finalSearchInput) {
        finalSearchInput.addEventListener('input', (e) => {
          const value = e.target.value;
          if (window.modManager) {
            window.modManager.filterMods(value);
          }
        });

        finalSearchInput.addEventListener('paste', (e) => {
          setTimeout(() => {
            const value = e.target.value;
            if (window.modManager) {
              window.modManager.filterMods(value);
            }
          }, 10);
        });
      }
    }

    const refreshBtn = document.getElementById('refresh-mods-btn');
    if (refreshBtn) {
      const newRefreshBtn = refreshBtn.cloneNode(true);
      refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);

      newRefreshBtn.addEventListener('click', () => {
        if (window.modManager) {
          window.modManager.fetchMods();
        }
      });
    }

    const openFolderBtn = document.getElementById('open-folder-btn');
    if (openFolderBtn) {
      const newOpenFolderBtn = openFolderBtn.cloneNode(true);
      openFolderBtn.parentNode.replaceChild(newOpenFolderBtn, openFolderBtn);

      newOpenFolderBtn.addEventListener('click', () => {
        if (window.modManager) {
          window.modManager.openSelectedModFolder();
        }
      });
    }

    const editInfoBtn = document.getElementById('edit-info-btn');
    if (editInfoBtn && window.modInfoEditor) {
      editInfoBtn.addEventListener('click', () => {
        window.modInfoEditor.handleClick();
      });
    }

    const actionButtons = document.querySelectorAll('.action-btn');
    actionButtons.forEach((btn) => {
      const title = btn.getAttribute('title');
      if (title === 'Add' && !btn.dataset.listenerAttached) {
        btn.dataset.listenerAttached = 'true';
        btn.addEventListener('click', async () => {
          try {
            if (!window.electronAPI || !window.electronAPI.selectModFile) {
              console.error('electronAPI.selectModFile not available');
              if (window.toastManager) {
                window.toastManager.error('toasts.functionNotAvailable');
              }
              return;
            }

            const result = await window.electronAPI.selectModFile();

            if (result.canceled) {
              return;
            }

            if (!result.success || !result.filePath) {
              if (window.toastManager) {
                window.toastManager.error(
                  result.error || 'Failed to select file',
                );
              }
              return;
            }

            const modsPath = await window.electronAPI.store.get('modsPath');
            if (!modsPath) {
              if (window.toastManager) {
                window.toastManager.error('toasts.modsFolderNotConfigured');
              }
              return;
            }

            if (window.toastManager) {
              window.toastManager.info('toasts.installingMod');
            }

            const installResult = await window.electronAPI.installModFromPath(
              result.filePath,
              modsPath,
            );

            if (installResult && installResult.success) {
              if (window.toastManager) {
                window.toastManager.success(
                  'toasts.modInstalledSuccessfully',
                  3000,
                  { name: installResult.modName },
                );
              }
              setTimeout(() => {
                if (window.modManager) {
                  window.modManager.fetchMods();
                }
              }, 500);
            } else {
              if (window.toastManager) {
                window.toastManager.error('toasts.installationError', 3000, {
                  error: installResult?.error || 'Unknown error',
                });
              }
            }
          } catch (error) {
            console.error('Error installing mod:', error);
            if (window.toastManager) {
              window.toastManager.error('toasts.errorInstallingMod', 3000, {
                error: error.message,
              });
            }
          }
        });
      }

      if (title === 'Play' && !btn.dataset.listenerAttached) {
        btn.dataset.listenerAttached = 'true';
        btn.addEventListener('click', async () => {
          try {
            if (!window.settingsManager) {
              if (window.toastManager) {
                window.toastManager.error('toasts.settingsManagerNotAvailable');
              }
              return;
            }

            const emulatorType = window.settingsManager.getEmulatorType();
            const emulatorPath = window.settingsManager.getEmulatorPath();
            const gamePath = window.settingsManager.getGamePath();
            const fullscreen = window.settingsManager.getEmulatorFullscreen();

            if (!emulatorPath || !gamePath) {
              if (window.toastManager) {
                window.toastManager.warning('toasts.configureEmulatorPaths');
              }
              return;
            }

            if (window.toastManager) {
              window.toastManager.info('toasts.launchingEmulator');
            }

            const result = await window.electronAPI.launchEmulator(
              emulatorType,
              emulatorPath,
              gamePath,
              fullscreen,
            );

            if (result.success) {
              if (window.toastManager) {
                window.toastManager.success(
                  'toasts.emulatorLaunchedSuccessfully',
                );
              }
            } else {
              if (window.toastManager) {
                window.toastManager.error(
                  'toasts.failedToLaunchEmulator',
                  3000,
                  { error: result.error },
                );
              }
            }
          } catch (error) {
            console.error('Error launching emulator:', error);
            if (window.toastManager) {
              window.toastManager.error(`Error: ${error.message}`);
            }
          }
        });
      }
    });

    const categoryFilter = document.getElementById('category-filter');
    if (categoryFilter) {
      const newCategoryFilter = categoryFilter.cloneNode(true);
      categoryFilter.parentNode.replaceChild(newCategoryFilter, categoryFilter);

      const finalCategoryFilter = document.getElementById('category-filter');
      if (finalCategoryFilter) {
        const trigger = finalCategoryFilter.querySelector(
          '.custom-select-trigger',
        );
        const options = finalCategoryFilter.querySelectorAll(
          '.custom-select-option',
        );
        const selectedValue =
          finalCategoryFilter.querySelector('.selected-value');

        if (trigger) {
          trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            finalCategoryFilter.classList.toggle('open');
          });
        }

        // Remove any existing document click listener before adding a new one
        if (categoryFilterDocumentListener) {
          document.removeEventListener('click', categoryFilterDocumentListener);
        }

        // Create and add new document click listener
        categoryFilterDocumentListener = (e) => {
          if (!finalCategoryFilter.contains(e.target)) {
            finalCategoryFilter.classList.remove('open');
          }
        };
        document.addEventListener('click', categoryFilterDocumentListener);

        options.forEach((option) => {
          option.addEventListener('click', () => {
            const value = option.dataset.value;
            const text = option.querySelector('span').textContent;

            if (selectedValue) {
              selectedValue.textContent = text;
            }

            options.forEach((opt) => opt.classList.remove('active'));
            option.classList.add('active');

            finalCategoryFilter.classList.remove('open');

            if (window.modManager) {
              window.modManager.filterByCategory(value);
            }
          });
        });
      }
    }

    if (window.resizeHandler) {
      window.resizeHandler.setupResizeHandlers();
    }

    if (window.modManager) {
      window.modManager.reinitialize();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }

    // Delay fetching mods to ensure everything is loaded
    setTimeout(() => {
      if (window.modManager) {
        window.modManager.fetchMods();
      }
    }, 150);

    if (window.modManager) {
      const currentInput = document.getElementById('search-mods-input');
      const currentValue = currentInput ? currentInput.value : '';

      window.modManager.searchQuery = currentValue.toLowerCase();

      if (currentValue) {
        setTimeout(() => {
          if (window.modManager) {
            window.modManager.updateVisibility();
          }
        }, 100);
      }
    }
  }

  if (tabName === 'plugins') {
    if (window.pluginManager) {
      window.pluginManager.reinitialize();
    }

    if (window.pluginManager) {
      console.log('Fetching plugins...');
      window.pluginManager.fetchPlugins();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }

  if (tabName === 'settings' && window.settingsManager) {
    window.settingsManager.setupEventListeners();

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }

  if (tabName === 'fightplanner') {
    if (window.fightPlannerManager) {
      console.log('Initializing FightPlanner tab...');
      window.fightPlannerManager.initialize();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }

  if (tabName === 'social') {
    if (window.socialManager) {
      console.log('Initializing Social tab...');
      window.socialManager.initialize();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }
  if (tabName === 'characters') {
    if (window.charactersManager) {
      console.log('Initializing Characters tab...');
      window.charactersManager.initialize();
    }

    const refreshBtn = document.getElementById('refresh-characters-btn');
    if (refreshBtn) {
      const newRefreshBtn = refreshBtn.cloneNode(true);
      refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);

      newRefreshBtn.addEventListener('click', () => {
        if (window.charactersManager) {
          window.charactersManager.refresh();
        }
      });
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }

  if (tabName === 'downloads') {
    if (window.downloadManager) {
      console.log('Initializing Downloads tab...');
      window.downloadManager.initialize();
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }
  }
}

async function loadTabContent(tabName) {
  const tabElement = document.getElementById(`tab-${tabName}`);
  if (!tabElement) {
    console.warn(`Tab element not found: tab-${tabName}`);
    return;
  }

  if (tabElement.dataset.loaded === 'true') {
    console.log(`Tab already loaded: ${tabName} - reinitializing features`);
    // Reapply theme when reinitializing tab
    if (window.settingsManager) {
      const currentTheme = window.settingsManager.settings.theme || 'dark';
      window.settingsManager.applyTheme(currentTheme);
    }
    if (window.i18n) {
      window.i18n.updateDOM();
    }
    initializeTabFeatures(tabName);
    return;
  }

  const htmlFile = tabConfigs[tabName];
  if (!htmlFile) {
    console.warn(`No HTML file configured for tab: ${tabName}`);
    return;
  }

  try {
    console.log(`Loading tab content for: ${tabName} from ${htmlFile}`);
    const response = await fetch(htmlFile);
    const html = await response.text();
    tabElement.innerHTML = html;
    tabElement.dataset.loaded = 'true';
    console.log(`✓ Successfully loaded content for tab: ${tabName}`);

    // Wait a bit for DOM to be ready before initializing features
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Reapply theme after loading tab content
    if (window.settingsManager) {
      const currentTheme = window.settingsManager.settings.theme || 'dark';
      window.settingsManager.applyTheme(currentTheme);
    }

    if (window.i18n) {
      window.i18n.updateDOM();
    }

    initializeTabFeatures(tabName);
  } catch (error) {
    console.error(`Error loading tab ${tabName}:`, error);
    tabElement.innerHTML = `
            <div class="content-box">
                <h2>Error</h2>
                <p>Could not load content for ${tabName}</p>
            </div>
        `;
  }
}

async function initializeTabs() {
  await loadTabContent('tools');
}

window.addEventListener('localeChanged', () => {
  if (window.i18n) {
    window.i18n.updateDOM();
  }
});

window.tabLoader = {
  loadTabContent,
  initializeTabs,
};
