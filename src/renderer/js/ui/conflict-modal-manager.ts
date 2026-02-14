import { SimpleMod } from '../mods/mod-manager';

export class ConflictModalManager {
  currentConflictFile: string | null;
  currentConflictingMods: Array<{ name: string; path: string }>;
  autoSlotChangeMods: Array<SimpleMod>;

  constructor() {
    this.currentConflictFile = null;
    this.currentConflictingMods = [];
    this.autoSlotChangeMods = [];
  }

  async showConflictModal() {
    if (
      !window.modManager ||
      !window.modManager.conflicts ||
      window.modManager.conflicts.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noConflictsDetected');
      }
      return;
    }

    const modal = document.querySelector<HTMLElement>('#conflict-modal');
    const summaryEl = document.querySelector<HTMLElement>('#conflict-summary');
    const container = document.querySelector<HTMLElement>(
      '#conflict-list-container',
    );
    const headerBadge = document.querySelector<HTMLElement>(
      '#conflict-header-badge',
    );

    if (!modal || !summaryEl || !container) return;

    if (window.statusBarManager) {
      window.statusBarManager.preserveCurrentStatus();
    }

    const conflicts = window.modManager.conflicts;

    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    if (headerBadge) {
      headerBadge.textContent = t('modals.conflict.badge', {
        count: conflicts.length,
      });
    }

    summaryEl.textContent = t('modals.conflict.summary');

    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'conflict-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const thFile = document.createElement('th');
    thFile.className = 'conflict-th-file';
    const fileHeaderIcon = document.createElement('i');
    fileHeaderIcon.className = 'bi bi-file-earmark';
    thFile.appendChild(fileHeaderIcon);
    thFile.appendChild(
      document.createTextNode(` ${t('modals.conflict.fileHeader')}`),
    );

    const thMods = document.createElement('th');
    thMods.className = 'conflict-th-mods';
    const modsHeaderIcon = document.createElement('i');
    modsHeaderIcon.className = 'bi bi-people-fill';
    thMods.appendChild(modsHeaderIcon);
    thMods.appendChild(
      document.createTextNode(` ${t('modals.conflict.conflictingModsHeader')}`),
    );

    headerRow.appendChild(thFile);
    headerRow.appendChild(thMods);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    conflicts.forEach((conflict) => {
      const row = document.createElement('tr');
      row.className = 'conflict-table-row';

      const tdFile = document.createElement('td');
      tdFile.className = 'conflict-td-file';
      const filePath = document.createElement('span');
      filePath.className = 'conflict-file-path-text';
      filePath.textContent = conflict.filePath;
      tdFile.appendChild(filePath);

      const tdMods = document.createElement('td');
      tdMods.className = 'conflict-td-mods';
      const modsList = document.createElement('div');
      modsList.className = 'conflict-mods-list';
      conflict.mods.forEach((mod) => {
        const modItem = document.createElement('div');
        modItem.className = 'conflict-mod-item';
        const modWarningIcon = document.createElement('i');
        modWarningIcon.className = 'bi bi-exclamation-circle-fill';
        const modName = document.createElement('span');
        modName.textContent = mod.name;
        modItem.appendChild(modWarningIcon);
        modItem.appendChild(modName);
        modsList.appendChild(modItem);
      });
      tdMods.appendChild(modsList);

      row.appendChild(tdFile);
      row.appendChild(tdMods);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);

    const listWrapper = document.createElement('div');
    listWrapper.className = 'conflict-list';
    listWrapper.appendChild(table);
    container.appendChild(listWrapper);

    modal.classList.remove('closing');
    if (window.modalManager) {
      window.modalManager.showOverlay();
    }
    modal.style.display = 'block';

    if (window.i18n && window.i18n.updateDOM) {
      window.i18n.updateDOM();
    }
  }

  closeConflictModal(keepOverlay = false) {
    const modal = document.querySelector<HTMLElement>('#conflict-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    if (window.modalManager && !keepOverlay) {
      window.modalManager.hideOverlay();
    }
    if (window.statusBarManager && !keepOverlay) {
      setTimeout(() => {
        if (!window.statusBarManager.hasModalOpen()) {
          window.statusBarManager.restorePreservedStatus();
        }
      }, 350);
    }
  }

  closeSlotChangeModal() {
    const modal = document.querySelector<HTMLElement>('#conflict-slot-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    if (window.modalManager) {
      window.modalManager.hideOverlay();
    }
    this.currentConflictFile = null;
    this.currentConflictingMods = [];
  }

  async selectModForSlotChange(selectedMod) {
    this.closeSlotChangeModal();

    if (!window.modManager || !window.modManager.operations) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotChangeSlot');
      }
      return;
    }

    await window.modManager.operations.startChangeSlotsFlow(selectedMod);
  }

  _getModsMap() {
    const modsMap: Map<string, SimpleMod> = new Map();

    window.modManager.conflicts.forEach((conflict) => {
      conflict.mods.forEach((mod) => {
        if (!modsMap.has(mod.path)) {
          const fullMod = window.modManager.mods.find(
            (m) => m.path === mod.path,
          );

          modsMap.set(mod.path, {
            name: mod.name,
            path: mod.path,
            category: fullMod ? fullMod.category : null,
          });
        }
      });
    });

    return modsMap;
  }

  openGlobalSlotChange() {
    if (
      !window.modManager ||
      !window.modManager.conflicts ||
      window.modManager.conflicts.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noConflictsDetected');
      }
      return;
    }

    const modal = document.querySelector<HTMLElement>('#conflict-slot-modal');
    const container = document.querySelector<HTMLElement>(
      '#conflict-mod-select-container',
    );

    if (!modal || !container) return;

    const modsMap = this._getModsMap();
    const uniqueMods = Array.from(modsMap.values());

    if (uniqueMods.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noModsFoundInConflicts');
      }
      return;
    }

    container.innerHTML = '';

    uniqueMods.forEach((mod) => {
      const selectItem = document.createElement('div');
      selectItem.className = 'conflict-mod-select-item';
      selectItem.addEventListener('click', () => {
        this.selectModForSlotChange(mod);
      });

      const icon = document.createElement('i');
      icon.className = 'bi bi-folder-fill';

      const name = document.createElement('div');
      name.className = 'conflict-mod-select-item-name';
      name.textContent = mod.name;

      selectItem.appendChild(icon);
      selectItem.appendChild(name);
      container.appendChild(selectItem);
    });

    this.closeConflictModal(true);

    if (window.modalManager) {
      window.modalManager.showOverlay();
    }

    setTimeout(() => {
      modal.classList.remove('closing');
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }
    }, 100);
  }

  openAutoSlotChangeModal() {
    if (
      !window.modManager ||
      !window.modManager.conflicts ||
      window.modManager.conflicts.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noConflictsDetected');
      }
      return;
    }

    const modal = document.querySelector<HTMLElement>(
      '#conflict-auto-slot-modal',
    );
    const container = document.querySelector<HTMLElement>(
      '#conflict-auto-slot-mod-list',
    );

    if (!modal || !container) return;

    const modsMap = this._getModsMap();

    this.autoSlotChangeMods = Array.from(modsMap.values());

    if (this.autoSlotChangeMods.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noModsFoundInConflicts');
      }

      return;
    }

    container.innerHTML = '';

    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    this.autoSlotChangeMods.forEach((mod, index) => {
      const modItem = document.createElement('div');
      modItem.className = 'conflict-auto-slot-mod-item';

      const isStage = mod.category && mod.category.toLowerCase() === 'stages';
      if (isStage) {
        modItem.classList.add('conflict-auto-slot-mod-item-stage');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `auto-slot-mod-${index}`;
      checkbox.className = 'conflict-auto-slot-checkbox';
      checkbox.checked = !!isStage;
      checkbox.dataset.modPath = mod.path;

      const label = document.createElement('label');
      label.htmlFor = `auto-slot-mod-${index}`;
      label.className = 'conflict-auto-slot-label';

      const icon = document.createElement('i');
      icon.className = isStage ? 'bi bi-image-fill' : 'bi bi-folder-fill';

      const name = document.createElement('span');
      name.className = 'conflict-auto-slot-mod-name';
      name.textContent = mod.name;

      if (isStage) {
        const stageBadge = document.createElement('span');
        stageBadge.className = 'conflict-auto-slot-stage-badge';
        stageBadge.textContent = t('modals.autoSlotChange.stageMod');
        label.appendChild(icon);
        label.appendChild(name);
        label.appendChild(stageBadge);
      } else {
        label.appendChild(icon);
        label.appendChild(name);
      }

      modItem.appendChild(checkbox);
      modItem.appendChild(label);
      container.appendChild(modItem);
    });

    this.closeConflictModal(true);

    if (window.modalManager) {
      window.modalManager.showOverlay();
    }

    setTimeout(() => {
      modal.classList.remove('closing');
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }
    }, 100);
  }

  closeAutoSlotChangeModal() {
    const modal = document.querySelector<HTMLElement>(
      '#conflict-auto-slot-modal',
    );

    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }

    if (window.modalManager) {
      window.modalManager.hideOverlay();
    }

    this.autoSlotChangeMods = [];
  }

  async applyAutoSlotChanges() {
    if (!window.modManager || !window.modManager.modsPath) {
      if (window.toastManager) {
        window.toastManager.error('toasts.cannotChangeSlot');
      }
      return;
    }

    const excludedModPaths = new Set();
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      '.conflict-auto-slot-checkbox:checked',
    );

    checkboxes.forEach((checkbox) => {
      excludedModPaths.add(checkbox.dataset.modPath);
    });

    const modsToChange = this.autoSlotChangeMods.filter(
      (mod) => !excludedModPaths.has(mod.path),
    );

    if (modsToChange.length === 0) {
      if (window.toastManager) {
        window.toastManager.error('toasts.noModsToChange');
      }

      return;
    }

    this.closeAutoSlotChangeModal();

    if (window.toastManager) {
      window.toastManager.info('toasts.processingSlotChanges');
    }

    let successCount = 0;
    let errorCount = 0;

    const errors: string[] = [];

    for (const mod of modsToChange) {
      try {
        if (!window.electronAPI || !window.electronAPI.scanMod) {
          errors.push(`${mod.name}: API not available`);
          errorCount++;
          continue;
        }

        const scanModResult = await window.electronAPI.scanMod(mod.path);

        if (
          !scanModResult.success ||
          !(Object.keys(scanModResult.data.pathData).length > 0)
        ) {
          continue;
        }

        if (scanModResult.data.currentSlots.length === 0) {
          continue;
        }

        let availableSlotName: string | null = null;

        for (let i = 0; i <= 7; i++) {
          const slotName = `c${i.toString().padStart(2, '0')}`;
          let hasUnusedSlotForAllFighters = true;

          for (const fighterId of Object.keys(scanModResult.data.pathData)) {
            const usedSlots = Object.keys(
              scanModResult.data.pathData[fighterId],
            );

            if (usedSlots.includes(slotName)) {
              hasUnusedSlotForAllFighters = false;
              break;
            }
          }

          if (hasUnusedSlotForAllFighters) {
            availableSlotName = slotName;
            break;
          }
        }

        if (availableSlotName === null) {
          errors.push(`${mod.name}: No available slot for all fighters`);
          errorCount++;
          continue;
        }

        const slotAssignments = new Map<string, string>();

        Array.from(scanModResult.data.currentSlots).forEach((originalSlot) => {
          slotAssignments.set(originalSlot, availableSlotName);
        });

        if (slotAssignments.size > 0) {
          if (window.electronAPI && window.electronAPI.changeSlots) {
            const applyResult = await window.electronAPI.changeSlots(
              mod.path,
              scanModResult.data.pathData,
              slotAssignments,
              new Set(),
            );

            if (applyResult.success) {
              successCount++;
            } else {
              errors.push(
                `${mod.name}: ${applyResult.error || 'Failed to apply changes'}`,
              );
              errorCount++;
            }
          } else {
            errors.push(`${mod.name}: Cannot apply slot changes`);
            errorCount++;
          }
        }
      } catch (error) {
        console.error(`Error processing mod ${mod.name}:`, error);
        errors.push(`${mod.name}: ${error.message}`);
        errorCount++;
      }
    }

    if (successCount > 0) {
      await window.modManager.fetchMods();

      if (
        window.settingsManager &&
        window.settingsManager.settings.conflictDetectionEnabled
      ) {
        const whitelistPatterns =
          window.settingsManager.settings.conflictWhitelistPatterns || [];

        setTimeout(() => {
          window.modManager.checkConflicts(whitelistPatterns);
        }, 500);
      }
    }

    if (window.toastManager) {
      if (errorCount === 0) {
        window.toastManager.success('toasts.slotChangesSuccess', 3000, {
          count: successCount,
        });
      } else if (successCount > 0) {
        window.toastManager.warning('toasts.slotChangesPartialSuccess', 5000, {
          success: successCount,
          error: errorCount,
        });
      } else {
        const t = (key, params = {}) => {
          return window.i18n && window.i18n.t
            ? window.i18n.t(key, params)
            : key;
        };

        window.toastManager.error(
          'toasts.slotChangesFailed',
          5000,
          { count: errorCount },
          {
            actionButton: {
              text: t('toasts.viewLogs'),
              onClick: () => {
                const settingsBtn = document.querySelector<HTMLElement>(
                  '[data-tab="settings"]',
                );
                if (settingsBtn) {
                  settingsBtn.click();
                }

                setTimeout(() => {
                  if (window.settingsManager) {
                    window.settingsManager.switchSettingsTab('logs');
                    if (window.logsManager) {
                      setTimeout(() => {
                        window.logsManager.reinitialize();
                      }, 250);
                    }
                  }
                }, 500);
              },
            },
          },
        );
      }
    }

    if (errors.length > 0) {
      console.error('Auto slot change errors:', errors);
    }
  }
}

if (typeof window !== 'undefined') {
  window.conflictModalManager = new ConflictModalManager();
}
