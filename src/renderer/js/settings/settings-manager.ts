class SettingsManager {
  settings: any;
  initialized: boolean;
  tabSwitchingAttached: boolean;
  drivesLoaded: boolean;
  switchTabTimeout: any;
  readyPromise: Promise<void>;
  lastModsPathWarningPath: string | null;

  constructor() {
    this.settings = {
      modsPath: null,
      pluginsPath: null,
      emulatorType: 'yuzu',
      emulatorPath: null,
      gamePath: null,
      emulatorFullscreen: false,
      switchIp: null,
      switchPort: '5000',
      switchFtpUser: null,
      switchFtpPassword: null,
      switchFtpPath: null,
      switchFtpModsPath: null,
      switchFtpPluginsPath: null,
      switchTransferMethod: 'none',
      switchDriveLetter: null,
      conflictDetectionEnabled: true,
      conflictWhitelistPatterns: [],
      autoCheckPluginUpdates: false,
      pluginUpdateIntroShown: false,
      autoDisableNewMods: false,
      disableAllModsOnDownload: false,
      devMode: false,
      devShowModHash: false,
      theme: 'dark',
      enhancedStatusBar: true,
      startupSplashEnabled: true,
      startupSplashSoundEnabled: true,
      startupSplashSoundPath: null,
      appSoundPaths: {},
      appSoundEnabled: {},
    };
    this.initialized = false;
    this.tabSwitchingAttached = false;
    this.drivesLoaded = false;
    this.lastModsPathWarningPath = null;
    this.readyPromise = this.initSettings();
    this.initializeUI();
  }

  async initSettings() {
    this.settings = await this.loadSettings();
    this.applyTheme(this.settings.theme);
    this.applyAppSoundSettings();
    this.initialized = true;
    this.setupEventListeners();
  }

  initializeUI() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.setupEventListeners();
      });
    } else {
      this.setupEventListeners();
    }
  }

  setupEventListeners() {
    if (!this.tabSwitchingAttached) {
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (target.classList.contains('settings-tab-btn')) {
          const tabName = target.dataset.settingsTab;
          this.switchSettingsTab(tabName);

          if (tabName === 'logs' && window.logsManager) {
            setTimeout(() => {
              window.logsManager.reinitialize();
            }, 200);
          }

          if (tabName === 'customization' && window.customizationManager) {
            setTimeout(() => {
              window.customizationManager.setupEventListeners();
            }, 200);
          }
        }
      });
      this.tabSwitchingAttached = true;
    }

    const animationSelector = document.querySelector<HTMLElement>(
      '#animation-preference',
    );
    if (animationSelector && !animationSelector.dataset.listenerAttached) {
      animationSelector
        .querySelectorAll<HTMLElement>('.animation-option')
        .forEach((option) => {
          option.addEventListener('click', () => {
            const value = option.dataset.value;
            this.setAnimationPreference(value);

            animationSelector
              .querySelectorAll<HTMLElement>('.animation-option')
              .forEach((opt) => {
                opt.classList.remove('active');
              });
            option.classList.add('active');
          });
        });
      animationSelector.dataset.listenerAttached = 'true';
      this.loadAnimationPreference();
      this.loadAnimationPreference();
    }

    const startupSplashToggle = document.querySelector<HTMLInputElement>(
      '#startup-splash-enabled',
    );
    if (startupSplashToggle && !startupSplashToggle.dataset.listenerAttached) {
      startupSplashToggle.addEventListener('change', () => {
        this.settings.startupSplashEnabled = startupSplashToggle.checked;
        this.saveSettings();
        this.updateStartupSplashSoundUI();
      });
      startupSplashToggle.dataset.listenerAttached = 'true';
    }

    const startupSplashSoundToggle = document.querySelector<HTMLInputElement>(
      '#startup-splash-sound-enabled',
    );
    if (
      startupSplashSoundToggle &&
      !startupSplashSoundToggle.dataset.listenerAttached
    ) {
      startupSplashSoundToggle.addEventListener('change', () => {
        this.settings.startupSplashSoundEnabled =
          startupSplashSoundToggle.checked;
        this.saveSettings();
        this.updateStartupSplashSoundUI();
      });
      startupSplashSoundToggle.dataset.listenerAttached = 'true';
    }

    const startupSplashSoundFile = document.querySelector<HTMLInputElement>(
      '#startup-splash-sound-file',
    );
    const browseStartupSplashSound = document.querySelector<HTMLElement>(
      '#browse-startup-splash-sound',
    );
    if (
      startupSplashSoundFile &&
      browseStartupSplashSound &&
      !browseStartupSplashSound.dataset.listenerAttached
    ) {
      browseStartupSplashSound.addEventListener('click', () => {
        startupSplashSoundFile.value = '';
        startupSplashSoundFile.click();
      });
      browseStartupSplashSound.dataset.listenerAttached = 'true';
    }

    if (
      startupSplashSoundFile &&
      !startupSplashSoundFile.dataset.listenerAttached
    ) {
      startupSplashSoundFile.addEventListener('change', () => {
        const file = startupSplashSoundFile.files?.[0];
        if (!file) {
          return;
        }

        const filePath = window.electronAPI?.getPathForFile?.(file);
        if (!filePath) {
          window.toastManager?.error?.(
            'Unable to read the selected audio path',
          );
          return;
        }

        this.settings.startupSplashSoundPath = filePath;
        this.settings.startupSplashSoundEnabled = true;
        this.saveSettings();
        this.updateStartupSplashSoundUI();
      });
      startupSplashSoundFile.dataset.listenerAttached = 'true';
    }

    const resetStartupSplashSound = document.querySelector<HTMLElement>(
      '#reset-startup-splash-sound',
    );
    if (
      resetStartupSplashSound &&
      !resetStartupSplashSound.dataset.listenerAttached
    ) {
      resetStartupSplashSound.addEventListener('click', () => {
        this.settings.startupSplashSoundPath = null;
        this.saveSettings();
        this.updateStartupSplashSoundUI();
      });
      resetStartupSplashSound.dataset.listenerAttached = 'true';
    }

    document
      .querySelectorAll<HTMLElement>('.app-sound-browse')
      .forEach((button) => {
        if (button.dataset.listenerAttached) {
          return;
        }

        button.addEventListener('click', () => {
          const soundName = button.dataset.soundName;
          if (!soundName) {
            return;
          }

          const fileInput = document.querySelector<HTMLInputElement>(
            `#app-sound-file-${soundName}`,
          );
          if (!fileInput) {
            return;
          }

          fileInput.value = '';
          fileInput.click();
        });
        button.dataset.listenerAttached = 'true';
      });

    document
      .querySelectorAll<HTMLInputElement>('input[id^="app-sound-file-"]')
      .forEach((input) => {
        if (input.dataset.listenerAttached) {
          return;
        }

        input.addEventListener('change', () => {
          const soundName = input.dataset.soundName;
          const file = input.files?.[0];
          if (!soundName || !file) {
            return;
          }

          const filePath = window.electronAPI?.getPathForFile?.(file);
          if (!filePath) {
            window.toastManager?.error?.(
              'Unable to read the selected audio path',
            );
            return;
          }

          this.settings.appSoundPaths = {
            ...(this.settings.appSoundPaths || {}),
            [soundName]: filePath,
          };
          window.appSoundManager?.setCustomSound?.(soundName as any, filePath);
          this.saveSettings();
          this.updateAppSoundsUI();
        });
        input.dataset.listenerAttached = 'true';
      });

    document
      .querySelectorAll<HTMLElement>('.app-sound-reset')
      .forEach((button) => {
        if (button.dataset.listenerAttached) {
          return;
        }

        button.addEventListener('click', () => {
          const soundName = button.dataset.soundName;
          if (!soundName) {
            return;
          }

          const nextSoundPaths = { ...(this.settings.appSoundPaths || {}) };
          delete nextSoundPaths[soundName];
          this.settings.appSoundPaths = nextSoundPaths;
          window.appSoundManager?.setCustomSound?.(soundName as any, null);
          this.saveSettings();
          this.updateAppSoundsUI();
        });
        button.dataset.listenerAttached = 'true';
      });

    document
      .querySelectorAll<HTMLInputElement>('.app-sound-enabled')
      .forEach((input) => {
        if (input.dataset.listenerAttached) {
          return;
        }

        input.addEventListener('change', () => {
          const soundName = input.dataset.soundName;
          if (!soundName) {
            return;
          }

          this.settings.appSoundEnabled = {
            ...(this.settings.appSoundEnabled || {}),
            [soundName]: input.checked,
          };
          window.appSoundManager?.setSoundEnabled?.(
            soundName as any,
            input.checked,
          );
          this.saveSettings();
        });
        input.dataset.listenerAttached = 'true';
      });

    const enhancedStatusBarToggle = document.querySelector<HTMLInputElement>(
      '#enhanced-status-bar-enabled',
    );
    if (
      enhancedStatusBarToggle &&
      !enhancedStatusBarToggle.dataset.listenerAttached
    ) {
      enhancedStatusBarToggle.addEventListener('change', () => {
        this.settings.enhancedStatusBar = enhancedStatusBarToggle.checked;
        this.saveSettings();
        if (window.statusBarManager) {
          // Refresh logic if needed
        }
      });
      enhancedStatusBarToggle.dataset.listenerAttached = 'true';
    }

    const browseMods = document.querySelector<HTMLElement>(
      '#browse-mods-folder',
    );
    if (browseMods && !browseMods.dataset.listenerAttached) {
      browseMods.addEventListener('click', () => this.browseModsFolder());
      browseMods.dataset.listenerAttached = 'true';
      console.log('Browse mods button listener attached');
    }

    const browsePlugins = document.querySelector<HTMLElement>(
      '#browse-plugins-folder',
    );
    if (browsePlugins && !browsePlugins.dataset.listenerAttached) {
      browsePlugins.addEventListener('click', () => this.browsePluginsFolder());
      browsePlugins.dataset.listenerAttached = 'true';
      console.log('Browse plugins button listener attached');
    }

    const exportModsListBtn = document.querySelector<HTMLElement>(
      '#export-mods-list-btn',
    );
    if (exportModsListBtn && !exportModsListBtn.dataset.listenerAttached) {
      exportModsListBtn.addEventListener('click', async () => {
        if (window.modManager) {
          await window.modManager.exportModsList();
        }
      });
      exportModsListBtn.dataset.listenerAttached = 'true';
      console.log('Export mods list button listener attached');
    }

    const bulkEnableModsBtn = document.querySelector<HTMLElement>(
      '#bulk-enable-mods-btn',
    );
    if (bulkEnableModsBtn && !bulkEnableModsBtn.dataset.listenerAttached) {
      bulkEnableModsBtn.addEventListener('click', async () => {
        if (window.modManager) {
          await window.modManager.setAllModsEnabled(true);
        }
      });
      bulkEnableModsBtn.dataset.listenerAttached = 'true';
      console.log('Bulk enable mods button listener attached');
    }

    const bulkDisableModsBtn = document.querySelector<HTMLElement>(
      '#bulk-disable-mods-btn',
    );
    if (bulkDisableModsBtn && !bulkDisableModsBtn.dataset.listenerAttached) {
      bulkDisableModsBtn.addEventListener('click', async () => {
        if (window.modManager) {
          await window.modManager.setAllModsEnabled(false);
        }
      });
      bulkDisableModsBtn.dataset.listenerAttached = 'true';
      console.log('Bulk disable mods button listener attached');
    }

    const batchTestingBtn =
      document.querySelector<HTMLElement>('#batch-testing-btn');
    if (batchTestingBtn && !batchTestingBtn.dataset.listenerAttached) {
      batchTestingBtn.addEventListener('click', async () => {
        if ((window as any).batchTestingManager) {
          await (window as any).batchTestingManager.openStartModal();
        }
      });
      batchTestingBtn.dataset.listenerAttached = 'true';
      console.log('Batch testing button listener attached');
    }

    const batchTestingResumeBtn = document.querySelector<HTMLElement>(
      '#batch-testing-resume-btn',
    );
    if (
      batchTestingResumeBtn &&
      !batchTestingResumeBtn.dataset.listenerAttached
    ) {
      batchTestingResumeBtn.addEventListener('click', async () => {
        if ((window as any).batchTestingManager) {
          await (window as any).batchTestingManager.resumeSession();
        }
      });
      batchTestingResumeBtn.dataset.listenerAttached = 'true';
      console.log('Batch testing resume button listener attached');
    }

    const batchTestingCancelBtn = document.querySelector<HTMLElement>(
      '#batch-testing-cancel-btn',
    );
    if (
      batchTestingCancelBtn &&
      !batchTestingCancelBtn.dataset.listenerAttached
    ) {
      batchTestingCancelBtn.addEventListener('click', async () => {
        if ((window as any).batchTestingManager) {
          await (window as any).batchTestingManager.cancelSession();
        }
      });
      batchTestingCancelBtn.dataset.listenerAttached = 'true';
      console.log('Batch testing cancel button listener attached');
    }

    if ((window as any).batchTestingManager?.refreshControlState) {
      (window as any).batchTestingManager.refreshControlState();
    }

    const browseEmulator = document.querySelector<HTMLElement>(
      '#browse-emulator-path',
    );
    if (browseEmulator && !browseEmulator.dataset.listenerAttached) {
      browseEmulator.addEventListener('click', () => this.browseEmulatorPath());
      browseEmulator.dataset.listenerAttached = 'true';
      console.log('Browse emulator button listener attached');
    }

    const browseGame = document.querySelector<HTMLElement>('#browse-game-path');
    if (browseGame && !browseGame.dataset.listenerAttached) {
      browseGame.addEventListener('click', () => this.browseGamePath());
      browseGame.dataset.listenerAttached = 'true';
      console.log('Browse game button listener attached');
    }

    const restartTutorialBtn = document.querySelector<HTMLElement>(
      '#restart-tutorial-btn',
    );
    if (restartTutorialBtn && !restartTutorialBtn.dataset.listenerAttached) {
      restartTutorialBtn.addEventListener('click', async () => {
        if (window.tutorial) {
          window.tutorial.show();
        }
      });
      restartTutorialBtn.dataset.listenerAttached = 'true';
      console.log('Restart tutorial button listener attached');
    }

    const restartTutorialModsBtn = document.querySelector<HTMLElement>(
      '#restart-tutorial-mods-btn',
    );
    if (
      restartTutorialModsBtn &&
      !restartTutorialModsBtn.dataset.listenerAttached
    ) {
      restartTutorialModsBtn.addEventListener('click', async () => {
        const modsTabBtn = document.querySelector<HTMLElement>(
          '.sidebar-btn[data-tab="tools"]',
        );
        if (modsTabBtn) {
          modsTabBtn.click();
        }
        if (window.tutorial) {
          window.tutorial.show();
        }
      });
      restartTutorialModsBtn.dataset.listenerAttached = 'true';
      console.log('Restart tutorial + mods redirect button listener attached');
    }

    const clearTempFilesBtn = document.querySelector<HTMLElement>(
      '#clear-temp-files-btn',
    );
    if (clearTempFilesBtn && !clearTempFilesBtn.dataset.listenerAttached) {
      clearTempFilesBtn.addEventListener('click', async () => {
        await this.clearTempFiles();
      });
      clearTempFilesBtn.dataset.listenerAttached = 'true';
      console.log('Clear temp files button listener attached');
    }

    const installConfirmToggle = document.querySelector<HTMLInputElement>(
      '#install-confirm-enabled',
    );
    if (
      installConfirmToggle &&
      !installConfirmToggle.dataset.listenerAttached
    ) {
      installConfirmToggle.addEventListener('change', async () => {
        console.log('Install confirm toggle changed!');
        const enabled = installConfirmToggle.checked;
        console.log('New value:', enabled);

        try {
          await window.electronAPI.store.set('installConfirmEnabled', enabled);
          console.log('Setting saved successfully');

          if (window.toastManager) {
            window.toastManager.success('toasts.settingSaved');
          } else {
            console.warn('Toast manager not available');
          }
        } catch (error) {
          console.error('Failed to save install confirm setting:', error);
          if (window.toastManager) {
            window.toastManager.error('toasts.failedToSaveSetting');
          }
        }
      });
      installConfirmToggle.dataset.listenerAttached = 'true';
      console.log('Install confirm toggle listener attached');

      this.loadInstallConfirmSetting();
    } else {
      console.log(
        'Install confirm toggle:',
        installConfirmToggle ? 'already has listener' : 'not found',
      );
    }

    const switchIp = document.querySelector<HTMLInputElement>('#switch-ip');
    if (switchIp && !switchIp.dataset.listenerAttached) {
      switchIp.addEventListener('change', () => {
        this.settings.switchIp = switchIp.value;
        this.saveSettings();
      });
      switchIp.dataset.listenerAttached = 'true';
    }

    const switchPort = document.querySelector<HTMLInputElement>('#switch-port');
    if (switchPort && !switchPort.dataset.listenerAttached) {
      switchPort.addEventListener('change', () => {
        this.settings.switchPort = switchPort.value || '5000';
        this.saveSettings();
      });
      switchPort.dataset.listenerAttached = 'true';
    }

    const switchFtpUser =
      document.querySelector<HTMLInputElement>('#switch-ftp-user');
    if (switchFtpUser && !switchFtpUser.dataset.listenerAttached) {
      switchFtpUser.addEventListener('change', () => {
        this.settings.switchFtpUser = switchFtpUser.value.trim() || null;
        this.saveSettings();
      });
      switchFtpUser.dataset.listenerAttached = 'true';
    }

    const switchFtpPassword = document.querySelector<HTMLInputElement>(
      '#switch-ftp-password',
    );
    if (switchFtpPassword && !switchFtpPassword.dataset.listenerAttached) {
      switchFtpPassword.addEventListener('change', () => {
        this.settings.switchFtpPassword = switchFtpPassword.value || null;
        this.saveSettings();
      });
      switchFtpPassword.dataset.listenerAttached = 'true';
    }

    const switchFtpPath =
      document.querySelector<HTMLInputElement>('#switch-ftp-path');
    if (switchFtpPath && !switchFtpPath.dataset.listenerAttached) {
      switchFtpPath.addEventListener('change', () => {
        this.settings.switchFtpModsPath = switchFtpPath.value.trim() || null;
        this.saveSettings();
      });
      switchFtpPath.dataset.listenerAttached = 'true';
    }

    const switchFtpPluginsPath = document.querySelector<HTMLInputElement>(
      '#switch-ftp-plugins-path',
    );
    if (
      switchFtpPluginsPath &&
      !switchFtpPluginsPath.dataset.listenerAttached
    ) {
      switchFtpPluginsPath.addEventListener('change', () => {
        this.settings.switchFtpPluginsPath =
          switchFtpPluginsPath.value.trim() || null;
        this.saveSettings();
      });
      switchFtpPluginsPath.dataset.listenerAttached = 'true';
    }

    const switchTransferMethodSelect = document.querySelector<HTMLElement>(
      '#switch-transfer-method-select',
    );
    if (
      switchTransferMethodSelect &&
      !switchTransferMethodSelect.dataset.listenerAttached
    ) {
      const trigger = switchTransferMethodSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = switchTransferMethodSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        switchTransferMethodSelect.querySelector<HTMLElement>(
          '.selected-value',
        );

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          switchTransferMethodSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!switchTransferMethodSelect.contains(target)) {
          switchTransferMethodSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          const value = option.dataset.value;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          switchTransferMethodSelect.classList.remove('open');

          this.settings.switchTransferMethod = value;
          this.saveSettings();
          this.updateSwitchTransferMethodUI();
        });
      });

      switchTransferMethodSelect.dataset.listenerAttached = 'true';
    }

    const switchDriveLetterSelect = document.querySelector<HTMLElement>(
      '#switch-drive-letter-select',
    );
    if (
      switchDriveLetterSelect &&
      !switchDriveLetterSelect.dataset.listenerAttached
    ) {
      const trigger = switchDriveLetterSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const optionsContainer = document.querySelector<HTMLElement>(
        '#switch-drive-letter-options',
      );
      const selectedValue =
        switchDriveLetterSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', async (e) => {
          e.stopPropagation();
          switchDriveLetterSelect.classList.toggle('open');

          if (
            switchDriveLetterSelect.classList.contains('open') &&
            optionsContainer
          ) {
            if (!this.drivesLoaded) {
              await this.loadAvailableDrives();
              this.drivesLoaded = true;
            }
          }
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!switchDriveLetterSelect.contains(target)) {
          switchDriveLetterSelect.classList.remove('open');
        }
      });

      switchDriveLetterSelect.dataset.listenerAttached = 'true';
    }

    const conflictDetectionEnabled = document.querySelector<HTMLInputElement>(
      '#conflict-detection-enabled',
    );
    if (
      conflictDetectionEnabled &&
      !conflictDetectionEnabled.dataset.listenerAttached
    ) {
      conflictDetectionEnabled.addEventListener('change', () => {
        this.settings.conflictDetectionEnabled =
          conflictDetectionEnabled.checked;
        this.saveSettings();
      });
      conflictDetectionEnabled.dataset.listenerAttached = 'true';
    }

    const autoCheckPluginUpdates = document.querySelector<HTMLInputElement>(
      '#auto-check-plugin-updates-enabled',
    );
    if (
      autoCheckPluginUpdates &&
      !autoCheckPluginUpdates.dataset.listenerAttached
    ) {
      autoCheckPluginUpdates.addEventListener('change', () => {
        this.settings.autoCheckPluginUpdates = autoCheckPluginUpdates.checked;
        this.saveSettings();
      });
      autoCheckPluginUpdates.dataset.listenerAttached = 'true';
    }

    const autoDisableMods = document.querySelector<HTMLInputElement>(
      '#auto-disable-mods-enabled',
    );
    if (autoDisableMods && !autoDisableMods.dataset.listenerAttached) {
      autoDisableMods.addEventListener('change', () => {
        this.settings.autoDisableNewMods = autoDisableMods.checked;
        this.saveSettings();
      });
      autoDisableMods.dataset.listenerAttached = 'true';
    }

    const disableAllOnDownload = document.querySelector<HTMLInputElement>(
      '#disable-all-mods-on-download-enabled',
    );
    if (
      disableAllOnDownload &&
      !disableAllOnDownload.dataset.listenerAttached
    ) {
      disableAllOnDownload.addEventListener('change', () => {
        this.settings.disableAllModsOnDownload = disableAllOnDownload.checked;
        this.saveSettings();
      });
      disableAllOnDownload.dataset.listenerAttached = 'true';
    }

    const checkUpdatesBtn =
      document.querySelector<HTMLElement>('#check-updates-btn');
    if (checkUpdatesBtn && !checkUpdatesBtn.dataset.listenerAttached) {
      checkUpdatesBtn.addEventListener('click', async () => {
        if (window.updateManager) {
          await window.updateManager.checkForUpdatesManually();
        }
      });
      checkUpdatesBtn.dataset.listenerAttached = 'true';
      console.log('Check updates button listener attached');
    }

    this.updateAppVersionUI();

    const updateChannelSelect = document.querySelector<HTMLElement>(
      '#update-channel-select',
    );
    if (updateChannelSelect && !updateChannelSelect.dataset.listenerAttached) {
      const trigger = updateChannelSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = updateChannelSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        updateChannelSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          updateChannelSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!updateChannelSelect.contains(target)) {
          updateChannelSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', async () => {
          const value = option.dataset.value!;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          updateChannelSelect.classList.remove('open');

          if (window.electronAPI && window.electronAPI.setUpdateChannel) {
            await window.electronAPI.setUpdateChannel(value);
            await window.electronAPI.store.set('updateChannel', value);
            console.log('Update channel set to:', value);

            if (window.toastManager) {
              window.toastManager.success('toasts.settingSaved');
            }
          }
        });
      });

      updateChannelSelect.dataset.listenerAttached = 'true';
      this.updateChannelUI();
    }

    const languageTypeSelect = document.querySelector<HTMLElement>(
      '#language-type-select',
    );
    if (languageTypeSelect && !languageTypeSelect.dataset.listenerAttached) {
      const trigger = languageTypeSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = languageTypeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        languageTypeSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          languageTypeSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!languageTypeSelect.contains(target)) {
          languageTypeSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', async () => {
          const value = option.dataset.value;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          languageTypeSelect.classList.remove('open');

          if (window.i18n) {
            await window.i18n.changeLocale(value);
          }
        });
      });

      languageTypeSelect.dataset.listenerAttached = 'true';
      this.updateLanguageTypeUI();

      window.addEventListener('localeChanged', () => {
        this.updateLanguageTypeUI();
      });
    }

    const themeSelect = document.querySelector<HTMLElement>('#theme-select');
    if (themeSelect && !themeSelect.dataset.listenerAttached) {
      const trigger = themeSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = themeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        themeSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          themeSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!themeSelect.contains(target)) {
          themeSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          const value = option.dataset.value;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          themeSelect.classList.remove('open');

          this.setTheme(value);
        });
      });

      themeSelect.dataset.listenerAttached = 'true';
      this.updateThemeUI();
    }

    const emulatorTypeSelect = document.querySelector<HTMLElement>(
      '#emulator-type-select',
    );
    if (emulatorTypeSelect && !emulatorTypeSelect.dataset.listenerAttached) {
      const trigger = emulatorTypeSelect.querySelector<HTMLElement>(
        '.custom-select-trigger',
      );
      const options = emulatorTypeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const selectedValue =
        emulatorTypeSelect.querySelector<HTMLElement>('.selected-value');

      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          emulatorTypeSelect.classList.toggle('open');
        });
      }

      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (!emulatorTypeSelect.contains(target)) {
          emulatorTypeSelect.classList.remove('open');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          const value = option.dataset.value;
          const text = option.querySelector<HTMLElement>('span')!.textContent;

          if (selectedValue) {
            selectedValue.textContent = text;
          }

          options.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');

          emulatorTypeSelect.classList.remove('open');

          this.settings.emulatorType = value;
          this.saveSettings();
          this.updateFullscreenVisibility();
        });
      });

      emulatorTypeSelect.dataset.listenerAttached = 'true';
    }

    const emulatorFullscreenToggle = document.querySelector<HTMLInputElement>(
      '#emulator-fullscreen-enabled',
    );
    if (
      emulatorFullscreenToggle &&
      !emulatorFullscreenToggle.dataset.listenerAttached
    ) {
      emulatorFullscreenToggle.addEventListener('change', () => {
        this.settings.emulatorFullscreen = emulatorFullscreenToggle.checked;
        this.saveSettings();
      });
      emulatorFullscreenToggle.dataset.listenerAttached = 'true';
    }

    this.updateModsFolderUI();
    this.updatePluginsFolderUI();
    this.updateLanguageTypeUI();
    this.updateEmulatorTypeUI();
    this.updateEmulatorPathUI();
    this.updateGamePathUI();
    this.updateEmulatorFullscreenUI();
    this.updateFullscreenVisibility();
    this.updateSwitchSettingsUI();
    this.updateSwitchTransferMethodUI();
    this.updateConflictDetectionUI();
    this.updateAutoCheckPluginUpdatesUI();
    this.updateAutoDisableModsUI();
    this.updateDisableAllModsOnDownloadUI();
    this.updateEnhancedStatusBarUI();
    this.updateStartupSplashUI();
    this.updateStartupSplashSoundUI();
    this.updateAppSoundsUI();
    this.updateDeveloperModeUI();

    // Analytics toggle
    const analyticsToggle =
      document.querySelector<HTMLInputElement>('#analytics-enabled');
    if (analyticsToggle && !analyticsToggle.dataset.listenerAttached) {
      // Load current value
      if (window.electronAPI && window.electronAPI.getAnalyticsEnabled) {
        window.electronAPI.getAnalyticsEnabled().then((enabled: boolean) => {
          analyticsToggle.checked = enabled;
        });
      }

      analyticsToggle.addEventListener('change', async () => {
        if (window.electronAPI && window.electronAPI.setAnalyticsEnabled) {
          await window.electronAPI.setAnalyticsEnabled(analyticsToggle.checked);
          this.showToast(this.translate('toasts.settingSaved'), 'success');
        }
      });
      analyticsToggle.dataset.listenerAttached = 'true';
    }

    const devModeToggle = document.querySelector<HTMLInputElement>(
      '#developer-mode-enabled',
    );
    if (devModeToggle) {
      devModeToggle.addEventListener('change', (e) => {
        this.settings.devMode = devModeToggle.checked;
        this.saveSettings();
        this.updateDeveloperModeUI();
      });
    }

    const devShowModHashToggle = document.querySelector<HTMLInputElement>(
      '#developer-show-mod-hash',
    );
    if (devShowModHashToggle) {
      devShowModHashToggle.addEventListener('change', (e) => {
        this.settings.devShowModHash = devShowModHashToggle.checked;
        this.saveSettings();
        if (window.modManager) {
          window.modManager.renderModList();
        }
      });
    }

    const fakeVersionInput = document.querySelector<HTMLInputElement>(
      '#fake-version-input',
    );
    const saveDevSettingsBtn = document.querySelector<HTMLElement>(
      '#save-dev-settings-btn',
    );
    const resetDevSettingsBtn = document.querySelector<HTMLElement>(
      '#reset-dev-settings-btn',
    );

    if (fakeVersionInput && saveDevSettingsBtn) {
      // Load current fake version
      window.electronAPI.store
        .get('developer.fakeVersion')
        .then((fakeVersion: string | null) => {
          if (fakeVersion) {
            fakeVersionInput.value = fakeVersion;
          }
        });

      saveDevSettingsBtn.addEventListener('click', () => {
        const fakeVersion = fakeVersionInput.value.trim();
        window.electronAPI.store.set('developer.fakeVersion', fakeVersion);
        this.showToast(this.translate('devSettingsSaved'), 'success');
      });

      if (resetDevSettingsBtn) {
        resetDevSettingsBtn.addEventListener('click', () => {
          fakeVersionInput.value = '';
          window.electronAPI.store.set('developer.fakeVersion', '');
          this.showToast(this.translate('settingSaved'), 'success');
        });
      }

      const simulateUpdateBtn = document.querySelector<HTMLElement>(
        '#simulate-update-btn',
      );
      if (simulateUpdateBtn) {
        simulateUpdateBtn.addEventListener('click', async () => {
          if (window.electronAPI && window.electronAPI.simulateUpdate) {
            await window.electronAPI.simulateUpdate();
            this.showToast('Update simulation started', 'success');
          }
        });
      }

      const openConfigBtn =
        document.querySelector<HTMLElement>('#open-config-btn');
      if (openConfigBtn) {
        openConfigBtn.addEventListener('click', async () => {
          if (window.electronAPI && window.electronAPI.openConfigFile) {
            await window.electronAPI.openConfigFile();
          }
        });
      }

      const forceUpdateToggle = document.querySelector<HTMLInputElement>(
        '#force-update-enabled',
      );
      if (
        forceUpdateToggle &&
        window.electronAPI &&
        window.electronAPI.getForceUpdate
      ) {
        // Load initial state
        window.electronAPI.getForceUpdate().then((isEnabled) => {
          forceUpdateToggle.checked = isEnabled;
        });

        // Add listener
        forceUpdateToggle.addEventListener('change', async (e) => {
          if (window.electronAPI) {
            await window.electronAPI.setForceUpdate(forceUpdateToggle.checked);
            this.showToast('Force update setting saved', 'success');
          }
        });
      }
    }

    // PostHog test buttons
    const posthogTestEventBtn = document.querySelector<HTMLElement>(
      '#posthog-test-event-btn',
    );
    const posthogTestErrorBtn = document.querySelector<HTMLElement>(
      '#posthog-test-error-btn',
    );
    const posthogTestStatus = document.querySelector<HTMLElement>(
      '#posthog-test-status',
    );

    if (posthogTestEventBtn && !posthogTestEventBtn.dataset.listenerAttached) {
      posthogTestEventBtn.addEventListener('click', async () => {
        try {
          if (window.electronAPI && window.electronAPI.testPosthogEvent) {
            const result = await window.electronAPI.testPosthogEvent();
            if (result?.success) {
              this.showToast('Test event sent to PostHog', 'success');
              if (posthogTestStatus) {
                const span = posthogTestStatus.querySelector('span');
                if (span) span.textContent = 'Test event sent successfully!';
                posthogTestStatus.style.display = 'flex';
              }
            }
          }
        } catch (err) {
          this.showToast('Failed to send test event', 'error');
          console.error('PostHog test event failed:', err);
        }
      });
      posthogTestEventBtn.dataset.listenerAttached = 'true';
    }

    if (posthogTestErrorBtn && !posthogTestErrorBtn.dataset.listenerAttached) {
      posthogTestErrorBtn.addEventListener('click', async () => {
        try {
          if (window.electronAPI && window.electronAPI.testPosthogError) {
            const result = await window.electronAPI.testPosthogError();
            if (result?.success) {
              this.showToast('Test error sent to PostHog', 'success');
              if (posthogTestStatus) {
                const span = posthogTestStatus.querySelector('span');
                if (span) span.textContent = 'Test error sent successfully!';
                posthogTestStatus.style.display = 'flex';
              }
            }
          }
        } catch (err) {
          this.showToast('Failed to send test error', 'error');
          console.error('PostHog test error failed:', err);
        }
      });
      posthogTestErrorBtn.dataset.listenerAttached = 'true';
    }

    const logRetentionInput = document.querySelector<HTMLInputElement>(
      '#log-retention-days',
    );
    if (logRetentionInput && !logRetentionInput.dataset.listenerAttached) {
      window.electronAPI.store.get('logRetentionDays').then((value: number) => {
        logRetentionInput.value = String(value || 7);
      });

      logRetentionInput.addEventListener('change', async () => {
        const value = parseInt(logRetentionInput.value, 10);
        if (value >= 1 && value <= 365) {
          await window.electronAPI.store.set('logRetentionDays', value);
          this.showToast(this.translate('toasts.settingSaved'), 'success');
        }
      });
      logRetentionInput.dataset.listenerAttached = 'true';
    }

    // Reset Electron Store button
    const resetStoreBtn = document.querySelector<HTMLElement>(
      '#reset-electron-store-btn',
    );
    if (resetStoreBtn && !resetStoreBtn.dataset.listenerAttached) {
      resetStoreBtn.addEventListener('click', () => {
        this.showResetStoreConfirmModal();
      });
      resetStoreBtn.dataset.listenerAttached = 'true';
    }

    // FightPlanner Social Settings
    this.setupSocialSettings();
  }

  async setupSocialSettings() {
    const autoDownloadToggle = document.querySelector<HTMLInputElement>(
      '#settings-social-auto-download-enabled',
    );
    const intervalInput = document.querySelector<HTMLInputElement>(
      '#settings-social-auto-download-interval',
    );
    const statusSpan = document.querySelector<HTMLElement>(
      '#settings-social-status',
    );
    const usernameSpan = document.querySelector<HTMLElement>(
      '#settings-social-username',
    );
    const goToSocialBtn = document.querySelector<HTMLElement>(
      '#settings-go-to-social-btn',
    );

    // Load current values from store
    if (autoDownloadToggle && !autoDownloadToggle.dataset.listenerAttached) {
      const enabled = await window.electronAPI.store.get(
        'social.autoDownloadEnabled',
      );
      autoDownloadToggle.checked = enabled !== false; // Default to true

      autoDownloadToggle.addEventListener('change', async () => {
        await window.electronAPI.store.set(
          'social.autoDownloadEnabled',
          autoDownloadToggle.checked,
        );

        // Sync with social manager if available
        if (window.socialManager) {
          window.socialManager.autoDownloadEnabled = autoDownloadToggle.checked;
          if (autoDownloadToggle.checked) {
            window.socialManager.startAutoDownloadCheck();
          } else {
            window.socialManager.stopAutoDownloadCheck();
          }
        }

        // Also sync the checkbox in social tab
        const socialTabToggle = document.querySelector<HTMLInputElement>(
          '#social-auto-download-enabled',
        );
        if (socialTabToggle) {
          socialTabToggle.checked = autoDownloadToggle.checked;
        }

        this.showToast(this.translate('toasts.settingSaved'), 'success');
      });
      autoDownloadToggle.dataset.listenerAttached = 'true';
    }

    if (intervalInput && !intervalInput.dataset.listenerAttached) {
      const interval = await window.electronAPI.store.get(
        'social.autoDownloadInterval',
      );
      intervalInput.value = String(interval || 5);

      intervalInput.addEventListener('change', async () => {
        const value = parseInt(intervalInput.value, 10);
        if (value >= 1 && value <= 60) {
          await window.electronAPI.store.set(
            'social.autoDownloadInterval',
            value,
          );

          // Sync with social manager if available
          if (window.socialManager) {
            window.socialManager.autoDownloadIntervalMs = value * 60 * 1000;
            if (window.socialManager.autoDownloadEnabled) {
              window.socialManager.stopAutoDownloadCheck();
              window.socialManager.startAutoDownloadCheck();
            }
          }

          // Also sync the input in social tab
          const socialTabInput = document.querySelector<HTMLInputElement>(
            '#social-auto-download-interval',
          );
          if (socialTabInput) {
            socialTabInput.value = String(value);
          }

          this.showToast(this.translate('toasts.settingSaved'), 'success');
        }
      });
      intervalInput.dataset.listenerAttached = 'true';
    }

    // Update account status display
    if (statusSpan && usernameSpan) {
      const userData = (await window.electronAPI.store.get(
        'social.userData',
      )) as { displayName?: string } | null;
      if (userData && userData.displayName) {
        statusSpan.textContent =
          this.translate('settings.socialConnected') || 'Connected';
        statusSpan.style.color = 'var(--success-color)';
        usernameSpan.textContent = userData.displayName;
      } else {
        statusSpan.textContent =
          this.translate('settings.socialNotConnected') || 'Not connected';
        statusSpan.style.color = 'var(--text-muted)';
        usernameSpan.textContent = '-';
      }
    }

    // Go to Social tab button
    if (goToSocialBtn && !goToSocialBtn.dataset.listenerAttached) {
      goToSocialBtn.addEventListener('click', () => {
        // Switch to Social tab
        const socialTab = document.querySelector<HTMLElement>(
          '[data-tab="social"]',
        );
        if (socialTab) {
          socialTab.click();
        }
      });
      goToSocialBtn.dataset.listenerAttached = 'true';
    }
  }

  updateDeveloperModeUI() {
    const devTabBtn = document.querySelector<HTMLElement>(
      '#settings-tab-developer',
    );
    const devModeToggle = document.querySelector<HTMLInputElement>(
      '#developer-mode-enabled',
    );

    if (devModeToggle) {
      devModeToggle.checked = this.settings.devMode;
    }

    const devShowModHashToggle = document.querySelector<HTMLInputElement>(
      '#developer-show-mod-hash',
    );
    if (devShowModHashToggle) {
      devShowModHashToggle.checked = this.settings.devShowModHash || false;
    }

    if (devTabBtn) {
      devTabBtn.style.display = this.settings.devMode ? 'block' : 'none';

      // If we are on the developer tab and disable dev mode, switch to general
      if (!this.settings.devMode && devTabBtn.classList.contains('active')) {
        const generalBtn = document.querySelector<HTMLButtonElement>(
          '[data-settings-tab="general"]',
        );
        if (generalBtn) generalBtn.click();
      }
    }
  }

  updateAutoDisableModsUI() {
    const toggle = document.querySelector<HTMLInputElement>(
      '#auto-disable-mods-enabled',
    );
    if (toggle) {
      toggle.checked = this.settings.autoDisableNewMods || false;
    }
  }

  updateDisableAllModsOnDownloadUI() {
    const toggle = document.querySelector<HTMLInputElement>(
      '#disable-all-mods-on-download-enabled',
    );
    if (toggle) {
      toggle.checked = this.settings.disableAllModsOnDownload || false;
    }
  }

  updateEnhancedStatusBarUI() {
    const toggle = document.querySelector<HTMLInputElement>(
      '#enhanced-status-bar-enabled',
    );
    if (toggle) {
      toggle.checked = this.settings.enhancedStatusBar !== false;
    }
  }

  switchSettingsTab(tabName) {
    const newActive = document.querySelector<HTMLElement>(
      `#settings-${tabName}`,
    );
    if (!newActive) return;

    const currentActive = document.querySelector<HTMLElement>(
      '.settings-tab-content.active:not(.fade-out)',
    );

    if (this.switchTabTimeout) {
      clearTimeout(this.switchTabTimeout);
      this.switchTabTimeout = null;
    }

    if (currentActive && currentActive !== newActive) {
      currentActive.classList.add('fade-out');

      this.switchTabTimeout = setTimeout(() => {
        document
          .querySelectorAll<HTMLElement>('.settings-tab-content')
          .forEach((content) => {
            content.classList.remove('active', 'fade-out');
          });

        document
          .querySelectorAll<HTMLElement>('.settings-tab-btn')
          .forEach((btn) => {
            btn.classList.remove('active');
          });

        const activeBtn = document.querySelector<HTMLElement>(
          `[data-settings-tab="${tabName}"]`,
        );
        if (activeBtn) {
          activeBtn.classList.add('active');
        }

        newActive.classList.add('active');

        const contentArea = document.querySelector<HTMLElement>(
          '.settings-content-area',
        );
        if (contentArea) {
          contentArea.scrollTop = 0;
        }

        this.maybeWarnForCurrentModsPath();
        this.switchTabTimeout = null;
      }, 200);
    } else {
      document
        .querySelectorAll<HTMLElement>('.settings-tab-content')
        .forEach((content) => {
          content.classList.remove('active', 'fade-out');
        });

      document
        .querySelectorAll<HTMLElement>('.settings-tab-btn')
        .forEach((btn) => {
          btn.classList.remove('active');
        });

      const activeBtn = document.querySelector<HTMLElement>(
        `[data-settings-tab="${tabName}"]`,
      );
      if (activeBtn) {
        activeBtn.classList.add('active');
      }

      newActive.classList.add('active');

      const contentArea = document.querySelector<HTMLElement>(
        '.settings-content-area',
      );
      if (contentArea) {
        contentArea.scrollTop = 0;
      }

      this.maybeWarnForCurrentModsPath();
    }
  }

  async browseModsFolder() {
    if (!window.electronAPI || !window.electronAPI.selectFolder) {
      console.error('Electron API not available');
      return;
    }

    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      this.settings.modsPath = folder;
      this.saveSettings();
      this.updateModsFolderUI();
      await this.refreshModsListForPath(folder);
      this.checkModsPath(folder, { force: true });
    }
  }

  async refreshModsListForPath(modsPath) {
    if (!modsPath || !window.modManager?.loadModsFromFolder) {
      return;
    }

    try {
      await window.modManager.loadModsFromFolder(modsPath);
    } catch (error) {
      console.error('Failed to refresh mods after path change:', error);
    }
  }

  maybeWarnForCurrentModsPath() {
    const libraryTab = document.querySelector<HTMLElement>('#settings-library');
    if (!libraryTab?.classList.contains('active')) {
      return;
    }

    if (this.settings.modsPath) {
      this.checkModsPath(this.settings.modsPath);
    }
  }

  hasExpectedModsPathStructure(path) {
    const normalizedPath = path.toLowerCase().replace(/\\/g, '/');
    return (
      normalizedPath.includes('ultimate/mods') ||
      normalizedPath.includes('ultimate\\mods')
    );
  }

  checkModsPath(path, options: { force?: boolean } = {}) {
    if (!path || this.hasExpectedModsPathStructure(path)) return;

    if (!options.force && this.lastModsPathWarningPath === path) {
      return;
    }

    if (document.querySelector('.mods-path-warning-modal')) {
      return;
    }

    this.lastModsPathWarningPath = path;
    this.showPathWarningModal(path);
  }

  showPathWarningModal(path) {
    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    const escapeHtml = (text) => {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    const modal = document.createElement('div');
    modal.className = 'modal-overlay mods-path-warning-modal';
    modal.style.display = 'block';
    modal.innerHTML = `
<div class="modal" style="display: block">
<div class="modal-header">
<i class="bi bi-exclamation-triangle" style="color: #f59e0b; font-size: 24px; margin-right: 10px;"></i>
<h2>${t('settings.pathWarning')}</h2>
</div>
<div class="modal-body">
<p style="margin-bottom: 15px;">${t('settings.pathWarningText')}</p>
<code style="display: block; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-bottom: 15px; word-break: break-all;">${escapeHtml(path)}</code>
<p style="margin-bottom: 10px;">${t('settings.expectedPath')}</p>
<ul style="margin-left: 20px; margin-bottom: 15px; color: #aaa;">
<li><strong>ultimate/mods</strong></li>
</ul>
<p style="color: #888;">${t('settings.example')} <code>sd:/ultimate/mods</code></p>
<p style="margin-top: 15px; color: #f59e0b;">${t('settings.incorrectPathWarning')}</p>
</div>
<div class="modal-footer">
<button class="modal-btn modal-btn-primary" id="path-warning-ok">
<i class="bi bi-check-lg"></i>
${t('settings.okUnderstand')}
</button>
</div>
</div>
`;

    document.body.appendChild(modal);

    const okBtn = modal.querySelector<HTMLButtonElement>('#path-warning-ok');
    okBtn!.addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  async browsePluginsFolder() {
    if (!window.electronAPI || !window.electronAPI.selectFolder) {
      console.error('Electron API not available');
      return;
    }

    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      this.settings.pluginsPath = folder;
      this.saveSettings();
      this.updatePluginsFolderUI();
    }
  }

  async browseEmulatorPath() {
    if (!window.electronAPI || !window.electronAPI.selectEmulatorFile) {
      console.error('Electron API not available');
      return;
    }

    const file = await window.electronAPI.selectEmulatorFile();
    if (file) {
      this.settings.emulatorPath = file;
      this.saveSettings();
      this.updateEmulatorPathUI();
    }
  }

  async browseGamePath() {
    if (!window.electronAPI || !window.electronAPI.selectGameFile) {
      console.error('Electron API not available');
      return;
    }

    const file = await window.electronAPI.selectGameFile();
    if (file) {
      this.settings.gamePath = file;
      this.saveSettings();
      this.updateGamePathUI();
    }
  }

  updateModsFolderUI() {
    const input = document.querySelector<HTMLInputElement>('#mods-folder-path');
    if (input && this.settings.modsPath) {
      input.value = this.settings.modsPath;
    }
    this.maybeWarnForCurrentModsPath();
  }

  updatePluginsFolderUI() {
    const input = document.querySelector<HTMLInputElement>(
      '#plugins-folder-path',
    );
    if (input && this.settings.pluginsPath) {
      input.value = this.settings.pluginsPath;
    }
  }

  updateLanguageTypeUI() {
    const languageTypeSelect = document.querySelector<HTMLElement>(
      '#language-type-select',
    );
    if (languageTypeSelect && window.i18n) {
      const selectedValue =
        languageTypeSelect.querySelector<HTMLElement>('.selected-value');
      const options = languageTypeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const currentLocale = window.i18n.getCurrentLocale() || 'en';

      options.forEach((option) => {
        if (option.dataset.value === currentLocale) {
          option.classList.add('active');
          if (selectedValue) {
            selectedValue.textContent =
              option.querySelector<HTMLElement>('span')!.textContent;
          }
        } else {
          option.classList.remove('active');
        }
      });
    }
  }

  updateEmulatorTypeUI() {
    const emulatorTypeSelect = document.querySelector<HTMLElement>(
      '#emulator-type-select',
    );
    if (emulatorTypeSelect) {
      const selectedValue =
        emulatorTypeSelect.querySelector<HTMLElement>('.selected-value');
      const options = emulatorTypeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const currentType = this.settings.emulatorType || 'yuzu';

      options.forEach((option) => {
        if (option.dataset.value === currentType) {
          option.classList.add('active');
          if (selectedValue) {
            selectedValue.textContent =
              option.querySelector<HTMLElement>('span')!.textContent;
          }
        } else {
          option.classList.remove('active');
        }
      });
    }
  }

  updateEmulatorPathUI() {
    const input = document.querySelector<HTMLInputElement>('#emulator-path');
    if (input && this.settings.emulatorPath) {
      input.value = this.settings.emulatorPath;
    }
  }

  updateGamePathUI() {
    const input = document.querySelector<HTMLInputElement>('#game-path');
    if (input && this.settings.gamePath) {
      input.value = this.settings.gamePath;
    }
  }

  updateEmulatorFullscreenUI() {
    const toggle = document.querySelector<HTMLInputElement>(
      '#emulator-fullscreen-enabled',
    );
    if (toggle) {
      toggle.checked = this.settings.emulatorFullscreen || false;
    }
  }

  updateFullscreenVisibility() {
    const fullscreenToggle = document.querySelector<HTMLElement>(
      '#emulator-fullscreen-enabled',
    );
    if (!fullscreenToggle) return;

    const fullscreenSection = fullscreenToggle.closest(
      '.settings-section',
    ) as HTMLElement;
    if (fullscreenSection) {
      if (this.settings.emulatorType === 'ryujinx') {
        fullscreenSection.style.display = 'none';
      } else {
        fullscreenSection.style.display = 'block';
      }
    }
  }

  updateSwitchSettingsUI() {
    const switchIpInput =
      document.querySelector<HTMLInputElement>('#switch-ip');
    if (switchIpInput && this.settings.switchIp) {
      switchIpInput.value = this.settings.switchIp;
    }

    const switchPortInput =
      document.querySelector<HTMLInputElement>('#switch-port');
    if (switchPortInput && this.settings.switchPort) {
      switchPortInput.value = this.settings.switchPort;
    }

    const switchFtpUserInput =
      document.querySelector<HTMLInputElement>('#switch-ftp-user');
    if (switchFtpUserInput) {
      switchFtpUserInput.value = this.settings.switchFtpUser || '';
    }

    const switchFtpPasswordInput = document.querySelector<HTMLInputElement>(
      '#switch-ftp-password',
    );
    if (switchFtpPasswordInput) {
      switchFtpPasswordInput.value = this.settings.switchFtpPassword || '';
    }

    const switchFtpPathInput =
      document.querySelector<HTMLInputElement>('#switch-ftp-path');
    if (switchFtpPathInput) {
      switchFtpPathInput.value =
        this.settings.switchFtpModsPath || this.settings.switchFtpPath || '';
    }

    const switchFtpPluginsPathInput = document.querySelector<HTMLInputElement>(
      '#switch-ftp-plugins-path',
    );
    if (switchFtpPluginsPathInput) {
      switchFtpPluginsPathInput.value =
        this.settings.switchFtpPluginsPath || '';
    }
  }

  updateSwitchTransferMethodUI() {
    const transferMethod = this.settings.switchTransferMethod || 'none';
    const transferMethodSelect = document.querySelector<HTMLElement>(
      '#switch-transfer-method-select',
    );
    const ftpSettings = document.querySelector<HTMLElement>(
      '#switch-ftp-settings',
    );
    const driveSettings = document.querySelector<HTMLElement>(
      '#switch-drive-settings',
    );

    if (transferMethodSelect) {
      const selectedValue =
        transferMethodSelect.querySelector<HTMLElement>('.selected-value');
      const options = transferMethodSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );

      let foundOption = false;
      options.forEach((option) => {
        if (option.dataset.value === transferMethod) {
          option.classList.add('active');
          if (selectedValue) {
            selectedValue.textContent =
              option.querySelector<HTMLElement>('span')!.textContent;
          }
          foundOption = true;
        } else {
          option.classList.remove('active');
        }
      });

      if (!foundOption && selectedValue && transferMethod === 'none') {
        selectedValue.textContent = 'Select method...';
      }
    }

    if (ftpSettings) {
      ftpSettings.style.display = transferMethod === 'ftp' ? 'block' : 'none';
    }
    if (driveSettings) {
      driveSettings.style.display =
        transferMethod === 'drive' ? 'block' : 'none';
    }

    if (transferMethod === 'drive') {
      this.updateSwitchDriveLetterUI();
    }
  }

  async loadAvailableDrives(forceReload = false) {
    if (!window.electronAPI || !window.electronAPI.getAvailableDrives) {
      console.error('Electron API not available');
      return;
    }

    const optionsContainer = document.querySelector<HTMLElement>(
      '#switch-drive-letter-options',
    );
    const selectedValue = document.querySelector<HTMLElement>(
      '#switch-drive-letter-select .selected-value',
    );

    if (!optionsContainer) return;

    if (forceReload || !this.drivesLoaded) {
      optionsContainer.innerHTML =
        '<div class="custom-select-option" style="pointer-events: none; opacity: 0.6;"><span><i class="bi bi-arrow-clockwise" style="animation: spin 1s linear infinite;"></i> Searching for drives...</span></div>';
      if (selectedValue && forceReload) {
        const currentText = selectedValue.textContent;
        if (!currentText.includes('Searching')) {
          selectedValue.textContent = 'Searching for drives...';
        }
      }
    }

    try {
      const result = await window.electronAPI.getAvailableDrives();
      if (result.success && result.drives) {
        optionsContainer.innerHTML = '';

        if (result.drives.length === 0) {
          optionsContainer.innerHTML =
            '<div class="custom-select-option" style="pointer-events: none; opacity: 0.6;"><span>No drives found</span></div>';
          if (selectedValue && forceReload) {
            selectedValue.textContent = 'No drives found';
          }
          this.drivesLoaded = true;
          return;
        }

        result.drives.forEach((drive) => {
          const option = document.createElement('div');
          option.className = 'custom-select-option';
          option.dataset.value = drive.letter;
          if (drive.path) {
            option.dataset.path = drive.path;
          }

          let displayText;
          if (drive.path && drive.path.includes(':\\')) {
            displayText = `${drive.letter}: (${drive.label || 'Unknown'})`;
          } else if (drive.path && drive.path.startsWith('/')) {
            displayText = `${drive.path} (${drive.label || 'Unknown'})`;
          } else {
            displayText = `${drive.letter} (${drive.label || 'Unknown'})`;
          }

          option.innerHTML = `<span>${displayText}</span>`;

          option.addEventListener('click', () => {
            const selectedValue = document.querySelector<HTMLElement>(
              '#switch-drive-letter-select .selected-value',
            );
            if (selectedValue) {
              selectedValue.textContent = displayText;
            }

            optionsContainer
              .querySelectorAll<HTMLElement>('.custom-select-option')
              .forEach((opt) => {
                opt.classList.remove('active');
              });
            option.classList.add('active');

            document
              .querySelector<HTMLElement>('#switch-drive-letter-select')!
              .classList.remove('open');

            if (drive.path && drive.path.startsWith('/')) {
              this.settings.switchDriveLetter = drive.path;
            } else {
              this.settings.switchDriveLetter = drive.letter;
            }
            this.saveSettings();
          });

          optionsContainer.appendChild(option);
        });

        const refreshBtn = document.createElement('div');
        refreshBtn.className = 'custom-select-option';
        refreshBtn.style.cssText =
          'border-top: 1px solid var(--border-color); margin-top: 4px; padding-top: 8px; cursor: pointer;';
        refreshBtn.innerHTML =
          '<span><i class="bi bi-arrow-clockwise"></i> Refresh drives</span>';
        refreshBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          this.drivesLoaded = false;
          await this.loadAvailableDrives(true);
          this.drivesLoaded = true;
        });
        optionsContainer.appendChild(refreshBtn);

        this.updateSwitchDriveLetterUI();
        this.drivesLoaded = true;
      } else {
        optionsContainer.innerHTML =
          '<div class="custom-select-option" style="pointer-events: none; opacity: 0.6;"><span>Failed to load drives</span></div>';
        if (selectedValue && forceReload) {
          selectedValue.textContent = 'Failed to load drives';
        }
        this.drivesLoaded = true;
      }
    } catch (error) {
      console.error('Failed to load drives:', error);
      if (optionsContainer) {
        optionsContainer.innerHTML =
          '<div class="custom-select-option" style="pointer-events: none; opacity: 0.6;"><span>Error loading drives</span></div>';
      }
      if (selectedValue && forceReload) {
        selectedValue.textContent = 'Error loading drives';
      }
      this.drivesLoaded = true;
    }
  }

  updateSwitchDriveLetterUI() {
    const driveIdentifier = this.settings.switchDriveLetter;
    if (!driveIdentifier) return;

    const driveLetterSelect = document.querySelector<HTMLElement>(
      '#switch-drive-letter-select',
    );
    if (driveLetterSelect) {
      const selectedValue =
        driveLetterSelect.querySelector<HTMLElement>('.selected-value');
      const optionsContainer = document.querySelector<HTMLElement>(
        '#switch-drive-letter-options',
      );

      if (optionsContainer) {
        const options = optionsContainer.querySelectorAll<HTMLElement>(
          '.custom-select-option',
        );

        options.forEach((option) => {
          const optionValue = option.dataset.value;
          const optionPath = option.dataset.path;
          let matches = false;

          if (
            driveIdentifier.includes(':\\') ||
            driveIdentifier.startsWith('/')
          ) {
            matches = optionPath === driveIdentifier;
          } else {
            matches = optionValue === driveIdentifier;
          }

          if (matches) {
            option.classList.add('active');
            if (selectedValue) {
              selectedValue.textContent =
                option.querySelector<HTMLElement>('span')!.textContent;
            }
          } else {
            option.classList.remove('active');
          }
        });
      } else if (selectedValue) {
        if (
          driveIdentifier.includes(':\\') ||
          driveIdentifier.startsWith('/')
        ) {
          selectedValue.textContent = driveIdentifier;
        } else {
          selectedValue.textContent = `${driveIdentifier}:`;
        }
      }
    }
  }

  updateConflictDetectionUI() {
    const conflictDetectionCheckbox = document.querySelector<HTMLInputElement>(
      '#conflict-detection-enabled',
    );
    if (conflictDetectionCheckbox) {
      conflictDetectionCheckbox.checked =
        this.settings.conflictDetectionEnabled !== false;
    }
  }

  updateAutoCheckPluginUpdatesUI() {
    const autoCheckPluginUpdatesCheckbox =
      document.querySelector<HTMLInputElement>(
        '#auto-check-plugin-updates-enabled',
      );
    if (autoCheckPluginUpdatesCheckbox) {
      autoCheckPluginUpdatesCheckbox.checked =
        this.settings.autoCheckPluginUpdates || false;
    }
  }

  updateStartupSplashUI() {
    const startupSplashCheckbox = document.querySelector<HTMLInputElement>(
      '#startup-splash-enabled',
    );
    if (startupSplashCheckbox) {
      startupSplashCheckbox.checked =
        this.settings.startupSplashEnabled !== false;
    }
  }

  updateStartupSplashSoundUI() {
    const startupSplashSoundCheckbox = document.querySelector<HTMLInputElement>(
      '#startup-splash-sound-enabled',
    );
    if (startupSplashSoundCheckbox) {
      const splashEnabled = this.settings.startupSplashEnabled !== false;
      startupSplashSoundCheckbox.checked =
        splashEnabled && this.settings.startupSplashSoundEnabled !== false;
      startupSplashSoundCheckbox.disabled = !splashEnabled;
      startupSplashSoundCheckbox
        .closest('.settings-switch')
        ?.classList.toggle('disabled', !splashEnabled);
    }

    const splashSoundLabel = document.querySelector<HTMLElement>(
      '#startup-splash-sound-label',
    );
    if (splashSoundLabel) {
      splashSoundLabel.style.opacity =
        this.settings.startupSplashEnabled !== false ? '1' : '0.55';
    }

    const splashSoundPathInput = document.querySelector<HTMLInputElement>(
      '#startup-splash-sound-path',
    );
    if (splashSoundPathInput) {
      const defaultSoundLabel =
        window.i18n?.t?.('settings.startupSplashSoundPathPlaceholder') ||
        'Default FightPlanner sound';
      splashSoundPathInput.value =
        this.settings.startupSplashSoundPath || defaultSoundLabel;
      splashSoundPathInput.disabled =
        this.settings.startupSplashEnabled === false;
    }

    const browseStartupSplashSound = document.querySelector<HTMLButtonElement>(
      '#browse-startup-splash-sound',
    );
    if (browseStartupSplashSound) {
      browseStartupSplashSound.disabled =
        this.settings.startupSplashEnabled === false;
    }

    const resetStartupSplashSound = document.querySelector<HTMLButtonElement>(
      '#reset-startup-splash-sound',
    );
    if (resetStartupSplashSound) {
      resetStartupSplashSound.disabled =
        this.settings.startupSplashEnabled === false ||
        !this.settings.startupSplashSoundPath;
    }
  }

  updateAppSoundsUI() {
    const defaultSoundLabel =
      window.i18n?.t?.('settings.defaultSoundPath') || 'Default sound';
    const appSoundPaths = this.settings.appSoundPaths || {};
    const appSoundEnabled = this.settings.appSoundEnabled || {};

    this.getAppSoundNames().forEach((soundName) => {
      const enabledInput = document.querySelector<HTMLInputElement>(
        `#app-sound-enabled-${soundName}`,
      );
      if (enabledInput) {
        enabledInput.checked = appSoundEnabled[soundName] !== false;
      }

      const pathInput = document.querySelector<HTMLInputElement>(
        `#app-sound-path-${soundName}`,
      );
      if (pathInput) {
        pathInput.value = appSoundPaths[soundName] || defaultSoundLabel;
      }

      const resetButton = document.querySelector<HTMLButtonElement>(
        `.app-sound-reset[data-sound-name="${soundName}"]`,
      );
      if (resetButton) {
        resetButton.disabled = !appSoundPaths[soundName];
      }
    });
  }

  applyAppSoundSettings() {
    if (!window.appSoundManager) {
      return;
    }

    const appSoundPaths = this.settings.appSoundPaths || {};
    const appSoundEnabled = this.settings.appSoundEnabled || {};
    this.getAppSoundNames().forEach((soundName) => {
      window.appSoundManager.setCustomSound(
        soundName as any,
        appSoundPaths[soundName] || null,
      );
      window.appSoundManager.setSoundEnabled(
        soundName as any,
        appSoundEnabled[soundName] !== false,
      );
    });
  }

  getAppSoundNames() {
    return [
      'notification',
      'error',
      'complete',
      'downloading',
      'loading',
      'switchTab',
    ];
  }

  async updateAppVersionUI() {
    const appVersionEl = document.querySelector<HTMLElement>('#app-version');
    if (
      appVersionEl &&
      window.electronAPI &&
      window.electronAPI.getAppVersion
    ) {
      try {
        appVersionEl.textContent = (
          await window.electronAPI.getAppVersion()
        ).version;
      } catch (error) {
        console.error('Failed to get app version:', error);
      }
    }
  }

  async updateChannelUI() {
    const updateChannelSelect = document.querySelector<HTMLElement>(
      '#update-channel-select',
    );
    if (
      updateChannelSelect &&
      window.electronAPI &&
      window.electronAPI.getUpdateChannel
    ) {
      try {
        const channel = await window.electronAPI.getUpdateChannel();
        const selectedValue =
          updateChannelSelect.querySelector<HTMLElement>('.selected-value');
        const options = updateChannelSelect.querySelectorAll<HTMLElement>(
          '.custom-select-option',
        );

        options.forEach((option) => {
          if (option.dataset.value === channel) {
            option.classList.add('active');
            if (selectedValue) {
              selectedValue.textContent =
                option.querySelector<HTMLElement>('span')!.textContent;
            }
          } else {
            option.classList.remove('active');
          }
        });
      } catch (error) {
        console.error('Failed to get update channel:', error);
      }
    }
  }

  updateThemeUI() {
    const themeSelect = document.querySelector<HTMLElement>('#theme-select');
    if (themeSelect) {
      const selectedValue =
        themeSelect.querySelector<HTMLElement>('.selected-value');
      const options = themeSelect.querySelectorAll<HTMLElement>(
        '.custom-select-option',
      );
      const currentTheme = this.settings.theme || 'dark';

      options.forEach((option) => {
        if (option.dataset.value === currentTheme) {
          option.classList.add('active');
          if (selectedValue) {
            selectedValue.textContent =
              option.querySelector<HTMLElement>('span')!.textContent;
          }
        } else {
          option.classList.remove('active');
        }
      });
    }
  }

  async setTheme(theme) {
    this.settings.theme = theme;
    this.applyTheme(theme);
    await window.electronAPI.store.set('theme', theme);
  }

  applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  async loadSettings() {
    try {
      const modsPath = await window.electronAPI.store.get('modsPath');
      const pluginsPath = await window.electronAPI.store.get('pluginsPath');
      const emulatorType = await window.electronAPI.store.get('emulatorType');
      const emulatorPath = await window.electronAPI.store.get('emulatorPath');
      const gamePath = await window.electronAPI.store.get('gamePath');
      const emulatorFullscreen =
        await window.electronAPI.store.get('emulatorFullscreen');
      const switchIp = await window.electronAPI.store.get('switchIp');
      const switchPort = await window.electronAPI.store.get('switchPort');
      const switchFtpUser = await window.electronAPI.store.get('switchFtpUser');
      const switchFtpPassword =
        await window.electronAPI.store.get('switchFtpPassword');
      const switchFtpPath = await window.electronAPI.store.get('switchFtpPath');
      const switchFtpModsPath =
        await window.electronAPI.store.get('switchFtpModsPath');
      const switchFtpPluginsPath = await window.electronAPI.store.get(
        'switchFtpPluginsPath',
      );
      const switchTransferMethod = await window.electronAPI.store.get(
        'switchTransferMethod',
      );
      const switchDriveLetter =
        await window.electronAPI.store.get('switchDriveLetter');
      const conflictDetectionEnabled = await window.electronAPI.store.get(
        'conflictDetectionEnabled',
      );
      const autoCheckPluginUpdates = await window.electronAPI.store.get(
        'autoCheckPluginUpdates',
      );
      const pluginUpdateIntroShown = await window.electronAPI.store.get(
        'pluginUpdateIntroShown',
      );
      const theme = await window.electronAPI.store.get('theme');
      const autoDisableNewMods =
        await window.electronAPI.store.get('autoDisableNewMods');
      const disableAllModsOnDownload = await window.electronAPI.store.get(
        'disableAllModsOnDownload',
      );
      const startupSplashEnabled = await window.electronAPI.store.get(
        'startupSplashEnabled',
      );
      const startupSplashSoundEnabled = await window.electronAPI.store.get(
        'startupSplashSoundEnabled',
      );
      const startupSplashSoundPath = await window.electronAPI.store.get(
        'startupSplashSoundPath',
      );
      const appSoundPaths = await window.electronAPI.store.get('appSoundPaths');
      const appSoundEnabled =
        await window.electronAPI.store.get('appSoundEnabled');
      return {
        modsPath: modsPath || null,
        pluginsPath: pluginsPath || null,
        emulatorType: emulatorType || 'yuzu',
        emulatorPath: emulatorPath || null,
        gamePath: gamePath || null,
        emulatorFullscreen: emulatorFullscreen || false,
        switchIp: switchIp || null,
        switchPort: switchPort || '5000',
        switchFtpUser: switchFtpUser || null,
        switchFtpPassword: switchFtpPassword || null,
        switchFtpPath: switchFtpPath || null,
        switchFtpModsPath: switchFtpModsPath || switchFtpPath || null,
        switchFtpPluginsPath: switchFtpPluginsPath || null,
        switchTransferMethod: switchTransferMethod || 'none',
        switchDriveLetter: switchDriveLetter || null,
        conflictDetectionEnabled: conflictDetectionEnabled !== false,
        autoCheckPluginUpdates: autoCheckPluginUpdates || false,
        pluginUpdateIntroShown: pluginUpdateIntroShown || false,
        theme: theme || 'dark',
        autoDisableNewMods: autoDisableNewMods || false,
        disableAllModsOnDownload: disableAllModsOnDownload || false,
        startupSplashEnabled: startupSplashEnabled !== false,
        startupSplashSoundEnabled: startupSplashSoundEnabled !== false,
        startupSplashSoundPath:
          typeof startupSplashSoundPath === 'string' &&
          startupSplashSoundPath.trim()
            ? startupSplashSoundPath
            : null,
        appSoundPaths:
          appSoundPaths && typeof appSoundPaths === 'object'
            ? appSoundPaths
            : {},
        appSoundEnabled:
          appSoundEnabled && typeof appSoundEnabled === 'object'
            ? appSoundEnabled
            : {},
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      return {
        modsPath: null,
        pluginsPath: null,
        emulatorType: 'yuzu',
        emulatorPath: null,
        gamePath: null,
        emulatorFullscreen: false,
        switchIp: null,
        switchPort: '5000',
        switchFtpUser: null,
        switchFtpPassword: null,
        switchFtpPath: null,
        switchFtpModsPath: null,
        switchFtpPluginsPath: null,
        switchTransferMethod: 'none',
        switchDriveLetter: null,
        conflictDetectionEnabled: true,
        autoCheckPluginUpdates: false,
        pluginUpdateIntroShown: false,
        theme: 'dark',
        autoDisableNewMods: false,
        disableAllModsOnDownload: false,
        startupSplashEnabled: true,
        startupSplashSoundEnabled: true,
        startupSplashSoundPath: null,
        appSoundPaths: {},
        appSoundEnabled: {},
      };
    }
  }

  async saveSettings() {
    if (!this.initialized) {
      console.warn('Skipping settings save before stored settings are loaded');
      return;
    }

    try {
      await window.electronAPI.store.set('modsPath', this.settings.modsPath);
      await window.electronAPI.store.set(
        'pluginsPath',
        this.settings.pluginsPath,
      );
      await window.electronAPI.store.set(
        'emulatorType',
        this.settings.emulatorType,
      );
      await window.electronAPI.store.set(
        'emulatorPath',
        this.settings.emulatorPath,
      );
      await window.electronAPI.store.set('gamePath', this.settings.gamePath);
      await window.electronAPI.store.set(
        'emulatorFullscreen',
        this.settings.emulatorFullscreen,
      );
      await window.electronAPI.store.set('switchIp', this.settings.switchIp);
      await window.electronAPI.store.set(
        'switchPort',
        this.settings.switchPort,
      );
      await window.electronAPI.store.set(
        'switchFtpUser',
        this.settings.switchFtpUser,
      );
      await window.electronAPI.store.set(
        'switchFtpPassword',
        this.settings.switchFtpPassword,
      );
      await window.electronAPI.store.set(
        'switchFtpPath',
        this.settings.switchFtpModsPath || this.settings.switchFtpPath,
      );
      await window.electronAPI.store.set(
        'switchFtpModsPath',
        this.settings.switchFtpModsPath,
      );
      await window.electronAPI.store.set(
        'switchFtpPluginsPath',
        this.settings.switchFtpPluginsPath,
      );
      await window.electronAPI.store.set(
        'switchTransferMethod',
        this.settings.switchTransferMethod,
      );
      await window.electronAPI.store.set(
        'switchDriveLetter',
        this.settings.switchDriveLetter,
      );
      await window.electronAPI.store.set(
        'conflictDetectionEnabled',
        this.settings.conflictDetectionEnabled,
      );
      await window.electronAPI.store.set(
        'autoCheckPluginUpdates',
        this.settings.autoCheckPluginUpdates,
      );
      await window.electronAPI.store.set(
        'pluginUpdateIntroShown',
        this.settings.pluginUpdateIntroShown,
      );
      await window.electronAPI.store.set('theme', this.settings.theme);
      await window.electronAPI.store.set(
        'autoDisableNewMods',
        this.settings.autoDisableNewMods,
      );
      await window.electronAPI.store.set(
        'disableAllModsOnDownload',
        this.settings.disableAllModsOnDownload,
      );
      await window.electronAPI.store.set(
        'startupSplashEnabled',
        this.settings.startupSplashEnabled,
      );
      await window.electronAPI.store.set(
        'startupSplashSoundEnabled',
        this.settings.startupSplashSoundEnabled,
      );
      await window.electronAPI.store.set(
        'startupSplashSoundPath',
        this.settings.startupSplashSoundPath,
      );
      await window.electronAPI.store.set(
        'appSoundPaths',
        this.settings.appSoundPaths || {},
      );
      await window.electronAPI.store.set(
        'appSoundEnabled',
        this.settings.appSoundEnabled || {},
      );
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  async setSetting(key, value) {
    this.settings[key] = value;
    if (key === 'autoCheckPluginUpdates') {
      this.updateAutoCheckPluginUpdatesUI();
    }
    await this.saveSettings();
  }

  getModsPath() {
    return this.settings.modsPath || null;
  }

  getPluginsPath() {
    return this.settings.pluginsPath || null;
  }

  hasModsPath() {
    return !!this.settings.modsPath;
  }

  hasPluginsPath() {
    return !!this.settings.pluginsPath;
  }

  getEmulatorPath() {
    return this.settings.emulatorPath || null;
  }

  getGamePath() {
    return this.settings.gamePath || null;
  }

  hasEmulatorConfig() {
    return !!(this.settings.emulatorPath && this.settings.gamePath);
  }

  getEmulatorType() {
    return this.settings.emulatorType || 'yuzu';
  }

  getEmulatorFullscreen() {
    return this.settings.emulatorFullscreen || false;
  }

  getSwitchIp() {
    return this.settings.switchIp || null;
  }

  getSwitchPort() {
    return this.settings.switchPort || '5000';
  }

  getSwitchFtpUser() {
    return this.settings.switchFtpUser || null;
  }

  getSwitchFtpPassword() {
    return this.settings.switchFtpPassword || null;
  }

  getSwitchFtpPath() {
    return (
      this.settings.switchFtpModsPath || this.settings.switchFtpPath || null
    );
  }

  getSwitchFtpModsPath() {
    return (
      this.settings.switchFtpModsPath || this.settings.switchFtpPath || null
    );
  }

  getSwitchFtpPluginsPath() {
    return this.settings.switchFtpPluginsPath || null;
  }

  hasSwitchConfig() {
    const method = this.settings.switchTransferMethod || 'none';
    if (method === 'none') {
      return false;
    }
    if (method === 'drive') {
      return !!this.settings.switchDriveLetter;
    }
    return !!(this.settings.switchIp && this.settings.switchPort);
  }

  getSwitchTransferMethod() {
    return this.settings.switchTransferMethod || 'none';
  }

  getSwitchDriveLetter() {
    return this.settings.switchDriveLetter || null;
  }

  async setAnimationPreference(preference) {
    try {
      const currentPreference =
        ((await window.electronAPI.store.get('animationPreference')) as
          | string
          | null) || 'full';

      if (currentPreference === preference) {
        this.applyAnimationPreference(preference);
        return;
      }

      await window.electronAPI.store.set('animationPreference', preference);
      this.applyAnimationPreference(preference);
      this.showAnimationPreferenceRestartToast();
    } catch (error) {
      console.error('Failed to save animation preference:', error);
    }
  }

  async loadAnimationPreference() {
    try {
      const preference =
        ((await window.electronAPI.store.get('animationPreference')) as
          | string
          | null) || 'full';

      const animationSelector = document.querySelector<HTMLElement>(
        '#animation-preference',
      );

      if (animationSelector) {
        animationSelector
          .querySelectorAll<HTMLElement>('.animation-option')
          .forEach((option) => {
            if (option.dataset.value === preference) {
              option.classList.add('active');
            } else {
              option.classList.remove('active');
            }
          });
      }

      this.applyAnimationPreference(preference);
    } catch (error) {
      console.error('Failed to load animation preference:', error);
      this.applyAnimationPreference('full');
    }
  }

  applyAnimationPreference(preference: string) {
    document.body.classList.remove('reduced-animations', 'no-animations');

    if (preference === 'reduced') {
      document.body.classList.add('reduced-animations');
    } else if (preference === 'none') {
      document.body.classList.add('no-animations');
      document.body.classList.add('reduced-animations');
    }
  }

  showAnimationPreferenceRestartToast() {
    if (!window.toastManager) {
      return;
    }

    const restartLabel = window.i18n?.t?.('common.restart') || 'Restart';

    window.toastManager.info(
      'toasts.animationPreferenceRestartRequired',
      8000,
      {},
      {
        actionButton: {
          text: restartLabel,
          onClick: async () => {
            try {
              await window.electronAPI?.relaunchApp?.();
            } catch (error) {
              console.error(
                'Failed to relaunch app after animation preference change:',
                error,
              );
              window.toastManager?.error('toasts.failedToRestartApp');
            }
          },
        },
      },
    );
  }

  async loadInstallConfirmSetting() {
    try {
      const installConfirmEnabled = await window.electronAPI.store.get(
        'installConfirmEnabled',
      );
      const installConfirmToggle = document.querySelector<HTMLInputElement>(
        '#install-confirm-enabled',
      );
      if (installConfirmToggle) {
        installConfirmToggle.checked = installConfirmEnabled !== false;
      }
      console.log('Loaded install confirm setting:', installConfirmEnabled);
    } catch (error) {
      console.error('Failed to load install confirm setting:', error);
    }
  }

  async clearTempFiles() {
    if (!window.electronAPI || !window.electronAPI.clearTempFiles) {
      if (window.toastManager) {
        window.toastManager.error('toasts.clearTempFilesNotAvailable');
      }
      return;
    }

    const btn = document.querySelector<HTMLButtonElement>(
      '#clear-temp-files-btn',
    );
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.6';
    }

    try {
      if (window.toastManager) {
        window.toastManager.info('toasts.clearingTempFiles');
      }

      const result = await window.electronAPI.clearTempFiles();

      if (result.success) {
        if (window.toastManager) {
          window.toastManager.success('toasts.tempFilesCleared');
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToClearTempFiles', 3000, {
            error: result.error,
          });
        }
      }
    } catch (error) {
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToClearTempFiles', 3000, {
          error: error.message,
        });
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }
  }

  translate(key, params = {}) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key, params);
    }
    return key;
  }

  showToast(message, type = 'info') {
    if (window.toastManager) {
      if (type === 'success') {
        window.toastManager.success(message);
      } else if (type === 'error') {
        window.toastManager.error(message);
      } else {
        window.toastManager.info(message);
      }
    } else {
      console.log(`[Toast] ${type}: ${message}`);
    }
  }

  showResetStoreConfirmModal() {
    const t = (key: string) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };

    const confirmed = confirm(t('settings.resetStoreConfirmMessage'));

    if (confirmed) {
      window.electronAPI.store
        .clear()
        .then(() => {
          this.showToast(
            this.translate('toasts.electronStoreReset'),
            'success',
          );
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        })
        .catch((error: Error) => {
          console.error('Failed to reset electron store:', error);
          this.showToast(this.translate('toasts.failedToResetStore'), 'error');
        });
    }
  }
}

if (typeof window !== 'undefined') {
  window.settingsManager = new SettingsManager();
  console.log('Settings Manager initialized');

  if (window.electronAPI && window.electronAPI.store) {
    window.electronAPI.store
      .get('animationPreference')
      .then((preference: string | null) => {
        if (window.settingsManager && preference) {
          window.settingsManager.applyAnimationPreference(preference);
        }
      });

    window.electronAPI.store.get('theme').then((theme) => {
      if (window.settingsManager && theme) {
        window.settingsManager.applyTheme(theme);
      }
    });
  }
}

export { type SettingsManager };
