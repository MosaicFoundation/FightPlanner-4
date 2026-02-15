import type { MarketplacePlugin } from '../mods/plugin-marketplace';
import { Mod } from '../mods/mod-manager';
import { PathData, ScanModResult } from '../../../main/mod-utils/mod-scanner';

function slotStringToNumber(slot: string): number {
  return parseInt(slot.substring(1));
}

function slotNumberToString(slotNumber: number): string {
  return `c${slotNumber.toString().padStart(2, '0')}`;
}

type SlotAssignments = Map<string, string>;

class ModalManager {
  currentMod: any | null;
  renameCallback: ((newName: string) => void) | null;
  uninstallCallback: (() => void) | null;
  deletePluginCallback: (() => void) | null;
  currentPlugin: any | null;
  editInfoCallback: ((info: any) => void) | null;
  advancedInfoCallback: (() => void) | null;
  currentModPath: string | null;
  fighterPathData: PathData[string];
  pendingInstallData: {
    url: string;
    downloadId: string;
    modId: string;
    modType: string;
  } | null;

  slotAssignments: SlotAssignments;
  deletedSlots: Set<string> = new Set();

  changeSlotCallback?:
    | ((slotAssignments: SlotAssignments, deletedSlots: Set<string>) => void)
    | null;

  constructor() {
    this.currentMod = null;
    this.renameCallback = null;
    this.uninstallCallback = null;
    this.deletePluginCallback = null;
    this.currentPlugin = null;
    this.editInfoCallback = null;
    this.advancedInfoCallback = null;
    this.currentModPath = null;
    this.pendingInstallData = null;
    this.slotAssignments = new Map();
    this.fighterPathData = {};
  }

  showOverlay() {
    const overlay = document.querySelector<HTMLElement>('#modal-overlay');
    if (overlay) {
      overlay.classList.remove('closing');
      overlay.style.display = 'block';
      // Ensure overlay is visible and reset any potential interference
      overlay.style.opacity = '1';
      overlay.style.zIndex = '9999';
    }
  }

  hideOverlay() {
    // Check if any modal is displayed (block) and NOT closing
    const visibleModals = Array.from(
      document.querySelectorAll<HTMLElement>('.modal'),
    ).filter(
      (m) => m.style.display === 'block' && !m.classList.contains('closing'),
    );

    if (visibleModals.length > 0) {
      // Don't hide overlay if there are visible modals
      return;
    }

    const overlay = document.querySelector<HTMLElement>('#modal-overlay');
    if (overlay) {
      overlay.classList.add('closing');
      setTimeout(() => {
        // Re-check before hiding
        const stillVisibleModals = Array.from(
          document.querySelectorAll<HTMLElement>('.modal'),
        ).filter(
          (m) =>
            m.style.display === 'block' && !m.classList.contains('closing'),
        );

        if (stillVisibleModals.length === 0) {
          overlay.style.display = 'none';
          overlay.classList.remove('closing');
        } else {
          // Restore overlay if a modal appeared
          overlay.classList.remove('closing');
          overlay.style.display = 'block';
          overlay.style.opacity = '1';
        }
      }, 250);
    }
  }

  openRenameModal(mod, callback) {
    this.currentMod = mod;
    this.renameCallback = callback;

    const modal = document.querySelector<HTMLElement>('#rename-modal');
    const input = document.querySelector<HTMLInputElement>('#rename-input');

    if (modal && input) {
      modal.classList.remove('closing');
      input.value = mod.name;
      this.showOverlay();
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }

      setTimeout(() => {
        input.focus();
        input.select();
      }, 100);

      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          this.confirmRename();
        } else if (e.key === 'Escape') {
          this.closeRenameModal();
        }
      };
    }
  }

  closeRenameModal() {
    const modal = document.querySelector<HTMLElement>('#rename-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    this.hideOverlay();
    this.currentMod = null;
    this.renameCallback = null;
  }

  confirmRename() {
    const input = document.querySelector<HTMLInputElement>('#rename-input');
    const newName = input!.value.trim();

    if (!newName) {
      this.showAlert('error', 'Error', 'Mod name cannot be empty');
      return;
    }

    if (newName === this.currentMod.name) {
      this.closeRenameModal();
      return;
    }

    if (this.renameCallback) {
      this.renameCallback(newName);
    }

    this.closeRenameModal();
  }

  openUninstallModal(mod, callback) {
    this.currentMod = mod;
    this.uninstallCallback = callback;

    const modal = document.querySelector<HTMLElement>('#uninstall-modal');
    const modNameEl = document.querySelector<HTMLElement>(
      '#uninstall-mod-name',
    );

    if (modal && modNameEl) {
      modal.classList.remove('closing');
      modNameEl.textContent = mod.name;
      this.showOverlay();
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }

      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.removeEventListener('keydown', keyHandler);
          this.confirmUninstall();
        } else if (e.key === 'Escape') {
          document.removeEventListener('keydown', keyHandler);
          this.closeUninstallModal();
        }
      };
      document.addEventListener('keydown', keyHandler);
    }
  }

  closeUninstallModal() {
    const modal = document.querySelector<HTMLElement>('#uninstall-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    this.hideOverlay();
    this.currentMod = null;
    this.uninstallCallback = null;
  }

  confirmUninstall() {
    if (this.uninstallCallback) {
      this.uninstallCallback();
    }
    this.closeUninstallModal();
  }

  showAlert(type, title, message, params = {}) {
    const modal = document.querySelector<HTMLElement>('#alert-modal');
    const header = document.querySelector<HTMLElement>('#alert-modal-header');
    const titleEl = document.querySelector<HTMLElement>('#alert-modal-title');
    const messageEl = document.querySelector<HTMLElement>(
      '#alert-modal-message',
    );

    if (!modal || !header || !titleEl || !messageEl) return;

    const t = (key, p = {}) => {
      if (window.i18n && window.i18n.t) {
        return window.i18n.t(key, p);
      }
      return key;
    };

    modal.classList.remove('closing');
    let icon = 'bi-info-circle';
    header.className = 'modal-header';

    if (type === 'success') {
      icon = 'bi-check-circle';
    } else if (type === 'error') {
      icon = 'bi-x-circle';
      header.classList.add('modal-header-danger');
    } else if (type === 'warning') {
      icon = 'bi-exclamation-triangle';
    }

    const translatedTitle =
      title &&
      (title.startsWith('modals.') ||
        title.startsWith('common.') ||
        title.startsWith('toasts.'))
        ? t(title, params)
        : title || '';
    const translatedMessage =
      message &&
      (message.startsWith('modals.') ||
        message.startsWith('common.') ||
        message.startsWith('toasts.'))
        ? t(message, params)
        : message || '';

    titleEl.innerHTML = `<i class="bi ${icon}"></i> ${this.escapeHtml(translatedTitle)}`;
    messageEl.textContent = translatedMessage;

    this.showOverlay();
    modal.style.display = 'block';

    if (window.i18n && window.i18n.updateDOM) {
      window.i18n.updateDOM();
    }
  }

  closeAlertModal() {
    const modal = document.querySelector<HTMLElement>('#alert-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    this.hideOverlay();
  }

  openDeletePluginModal(plugin, callback) {
    this.currentPlugin = plugin;
    this.deletePluginCallback = callback;

    const modal = document.querySelector<HTMLElement>('#delete-plugin-modal');
    const pluginNameEl = document.querySelector<HTMLElement>(
      '#delete-plugin-name',
    );

    if (modal && pluginNameEl) {
      modal.classList.remove('closing');
      pluginNameEl.textContent = plugin.name;
      this.showOverlay();
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }

      const keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.removeEventListener('keydown', keyHandler);
          this.confirmDeletePlugin();
        } else if (e.key === 'Escape') {
          document.removeEventListener('keydown', keyHandler);
          this.closeDeletePluginModal();
        }
      };
      document.addEventListener('keydown', keyHandler);
    }
  }

  closeDeletePluginModal() {
    const modal = document.querySelector<HTMLElement>('#delete-plugin-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    this.hideOverlay();
    this.currentPlugin = null;
    this.deletePluginCallback = null;
  }

  confirmDeletePlugin() {
    if (this.deletePluginCallback) {
      this.deletePluginCallback();
    }
    this.closeDeletePluginModal();
  }

  openChangeSlotModal(
    mod: Mod,
    modData: ScanModResult,
    callback: (
      slotAssignments: SlotAssignments,
      deletedSlots: Set<string>,
    ) => void,
  ) {
    this.currentMod = mod;
    this.changeSlotCallback = callback;

    if (modData.fighterNames.length !== 1) {
      throw new Error(
        'Cannot change slots for mods with multiple or unknown fighters.',
      );
    }

    this.slotAssignments = modData.currentSlots.reduce<SlotAssignments>(
      (acc, slot) => {
        acc.set(slot, slot);
        return acc;
      },
      new Map(),
    );

    this.fighterPathData = modData.pathData[modData.fighterNames[0]];

    const modal = document.querySelector<HTMLElement>('#change-slot-modal');
    const container = document.querySelector<HTMLElement>(
      '#slot-list-container',
    );

    if (modal && container) {
      modal.classList.remove('closing');
      this.renderSlotList();
      this.showOverlay();
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }
    }
  }

  closeChangeSlotModal() {
    const modal = document.querySelector<HTMLElement>('#change-slot-modal');

    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }

    this.hideOverlay();

    this.currentMod = null;
    this.changeSlotCallback = null;
    this.slotAssignments = new Map();
  }

  renderSlotList() {
    const container = document.querySelector<HTMLElement>(
      '#slot-list-container',
    );

    if (!container || !this.slotAssignments) return;

    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    container.innerHTML = '';

    for (const [index, [originalSlotString, selectedSlotString]] of Array.from(
      this.slotAssignments,
    ).entries()) {
      const slotItem = document.createElement('div');

      slotItem.className = 'slot-item';
      slotItem.dataset.index = `${index}`;

      const content = document.createElement('div');
      content.className = 'slot-item-content';

      const info = document.createElement('div');
      info.className = 'slot-item-info';

      const label = document.createElement('span');

      label.className = 'slot-item-label';
      label.textContent = t('modals.changeSlot.currentSlot', {
        slot: originalSlotString,
      });

      const arrow = document.createElement('i');
      arrow.className = 'bi bi-arrow-right slot-arrow';

      // Create custom select structure
      const selectContainer = document.createElement('div');
      selectContainer.className = 'custom-select slot-select-custom';
      selectContainer.dataset.index = `${index}`;

      const selectTrigger = document.createElement('div');
      selectTrigger.className = 'custom-select-trigger';

      const selectedValueSpan = document.createElement('span');
      selectedValueSpan.className = 'selected-value';
      selectedValueSpan.textContent = t('modals.changeSlot.slotOption', {
        slot: selectedSlotString,
      });

      const triggerIcon = document.createElement('i');
      triggerIcon.className = 'bi bi-chevron-down';

      selectTrigger.appendChild(selectedValueSpan);
      selectTrigger.appendChild(triggerIcon);

      const selectDropdown = document.createElement('div');
      selectDropdown.className = 'custom-select-dropdown';

      for (let slotNumber = 0; slotNumber <= 16; slotNumber++) {
        const slotString = slotNumberToString(slotNumber);
        const option = document.createElement('div');
        option.className = 'custom-select-option';

        const selectedSlotNumber = slotStringToNumber(selectedSlotString);

        if (slotNumber === selectedSlotNumber) {
          option.classList.add('active');
        }

        option.dataset.value = `${slotNumber}`;

        const optionText = document.createElement('span');

        optionText.textContent = t('modals.changeSlot.slotOption', {
          slot: slotString,
        });

        option.appendChild(optionText);

        option.addEventListener('click', (e) => {
          e.stopPropagation();
          // Update data

          this.slotAssignments.set(originalSlotString, slotString);

          // Update UI
          selectedValueSpan.textContent = t('modals.changeSlot.slotOption', {
            slot: slotString,
          });

          // Close and restore
          selectContainer.classList.remove('open');
          selectDropdown.style.transition = 'none'; // Disable transition
          selectContainer.appendChild(selectDropdown);
          selectDropdown.style.cssText = '';

          void selectDropdown.offsetWidth; // Force reflow
          delete selectDropdown.dataset.parentId;

          // Update active state in dropdown
          const allOptions = selectDropdown.querySelectorAll<HTMLElement>(
            '.custom-select-option',
          );
          allOptions.forEach((opt) => opt.classList.remove('active'));
          option.classList.add('active');
        });

        selectDropdown.appendChild(option);
      }

      selectContainer.appendChild(selectTrigger);
      selectContainer.appendChild(selectDropdown);

      // Toggle dropdown
      selectTrigger.addEventListener('click', (e) => {
        e.stopPropagation();

        const wasOpen = selectContainer.classList.contains('open');

        // Close other open selects and restore them
        document
          .querySelectorAll<HTMLElement>('.custom-select.open')
          .forEach((el) => {
            if (el !== selectContainer) {
              el.classList.remove('open');
              const drop = document.body.querySelector<HTMLElement>(
                `.custom-select-dropdown[data-parent-id="${el.dataset.index}"]`,
              );

              if (drop) {
                drop.style.transition = 'none'; // Disable transition
                el.appendChild(drop);
                drop.style.cssText = '';
                void drop.offsetWidth; // Force reflow
                delete drop.dataset.parentId;
              } else {
                // Fallback for non-portaled ones or if already moved back
                const internalDrop = el.querySelector<HTMLElement>(
                  '.custom-select-dropdown',
                );
                if (internalDrop) internalDrop.style.cssText = '';
              }
            }
          });

        if (!wasOpen) {
          selectContainer.classList.add('open');

          // Portal logic: Move to body and position fixed
          selectDropdown.dataset.parentId = `${index}`;

          // CRITICAL: Disable transition before appending to body to prevent "flying from bottom"
          selectDropdown.style.transition = 'none';

          document.body.appendChild(selectDropdown);

          const rect = selectContainer.getBoundingClientRect();
          selectDropdown.style.position = 'fixed';
          selectDropdown.style.top = `${rect.bottom + 5}px`;
          selectDropdown.style.left = `${rect.left}px`;
          selectDropdown.style.width = `${rect.width}px`;
          selectDropdown.style.zIndex = '100005';

          // Set start state for animation
          selectDropdown.style.opacity = '0';
          selectDropdown.style.transform = 'translateY(-10px)';
          selectDropdown.style.pointerEvents = 'all';

          // Force reflow
          void selectDropdown.offsetWidth;

          // Enable transition for entrance animation
          selectDropdown.style.transition =
            'opacity 0.2s ease, transform 0.2s ease';

          // Trigger animation
          requestAnimationFrame(() => {
            selectDropdown.style.opacity = '1';
            selectDropdown.style.transform = 'translateY(0)';
          });
        } else {
          selectContainer.classList.remove('open');
          // Disable transition temporarily to avoid "flying" animation when reparenting
          selectDropdown.style.transition = 'none';
          selectContainer.appendChild(selectDropdown);
          selectDropdown.style.cssText = '';
          // Restore transition after a frame if needed (though cssText="" restores class styles which include transition)
          // The browser needs a reflow to apply the new position without animating from the old one
          void selectDropdown.offsetWidth;
          delete selectDropdown.dataset.parentId;
        }
      });

      // Close when clicking outside
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (
          !selectContainer.contains(target) &&
          !selectDropdown.contains(target)
        ) {
          if (selectContainer.classList.contains('open')) {
            selectContainer.classList.remove('open');
            // Move dropdown back to container
            selectDropdown.style.transition = 'none'; // Disable transition
            selectContainer.appendChild(selectDropdown);
            selectDropdown.style.cssText = ''; // Clear fixed positioning styles
            void selectDropdown.offsetWidth; // Force reflow
            delete selectDropdown.dataset.parentId;
          }
        }
      });

      info.appendChild(label);
      info.appendChild(arrow);
      info.appendChild(selectContainer);

      const filesInfo = document.createElement('div');
      filesInfo.className = 'slot-item-files';

      const pathDataForSlot = this.fighterPathData[originalSlotString];

      if (pathDataForSlot.pathsToBeModified.length > 0) {
        const filesList = document.createElement('details');

        const summary = document.createElement('summary');
        summary.textContent = t('modals.changeSlot.filesWillBeModified', {
          count: pathDataForSlot.pathsToBeModified.length,
        });

        const fileListContainer = document.createElement('div');
        fileListContainer.className = 'slot-file-list';

        pathDataForSlot.pathsToBeModified.forEach((pathDataEntry) => {
          const fileItem = document.createElement('div');
          fileItem.className = 'slot-file-item';

          const icon = pathDataEntry.type === 'directory' ? '📁' : '📄';
          const typeLabel =
            pathDataEntry.type === 'directory'
              ? t('modals.changeSlot.directory')
              : t('modals.changeSlot.file');

          fileItem.textContent = `${icon} ${typeLabel} ${pathDataEntry.original}`;
          fileListContainer.appendChild(fileItem);
        });

        filesList.appendChild(summary);
        filesList.appendChild(fileListContainer);
        filesInfo.appendChild(filesList);
      } else {
        filesInfo.innerHTML = `<span style="color: #555; font-style: italic;">${t('modals.changeSlot.newSlotNoFiles')}</span>`;
      }

      content.appendChild(info);
      content.appendChild(filesInfo);

      const actions = document.createElement('div');
      actions.className = 'slot-item-actions';

      const deleteBtn = document.createElement('button');

      deleteBtn.className = 'slot-action-btn slot-action-delete';
      deleteBtn.innerHTML = `<i class="bi bi-trash3"></i> ${t('modals.changeSlot.delete')}`;

      deleteBtn.addEventListener('click', () => {
        this.toggleDeleteSlot(content, originalSlotString);
      });

      actions.appendChild(deleteBtn);

      slotItem.appendChild(content);
      slotItem.appendChild(actions);

      container.appendChild(slotItem);
    }
  }

  toggleDeleteSlot(content: HTMLDivElement, slot: string) {
    if (!this.deletedSlots) return;

    if (this.deletedSlots.has(slot)) {
      this.deletedSlots.delete(slot);
      content.classList.remove('deleted');
    } else {
      this.deletedSlots.add(slot);
      content.classList.add('deleted');
    }
  }

  confirmChangeSlots() {
    if (!this.changeSlotCallback || !this.slotAssignments) return;

    this.changeSlotCallback(this.slotAssignments, this.deletedSlots);
    this.closeChangeSlotModal();
  }

  openEditInfoModal(modPath, currentInfo, callback) {
    this.editInfoCallback = callback;

    const modal = document.querySelector<HTMLDivElement>('#edit-info-modal');
    const displayNameInput = document.querySelector<HTMLInputElement>(
      '#edit-info-display-name',
    );
    const authorsInput =
      document.querySelector<HTMLInputElement>('#edit-info-authors');
    const versionInput =
      document.querySelector<HTMLInputElement>('#edit-info-version');
    const categorySelect = document.querySelector<HTMLInputElement>(
      '#edit-info-category',
    );
    const urlInput = document.querySelector<HTMLInputElement>('#edit-info-url');
    const descriptionTextarea = document.querySelector<HTMLInputElement>(
      '#edit-info-description',
    );

    if (modal) {
      modal.classList.remove('closing');

      if (displayNameInput)
        displayNameInput.value = currentInfo?.display_name || '';
      if (authorsInput) authorsInput.value = currentInfo?.authors || '';
      if (versionInput) versionInput.value = currentInfo?.version || '';
      if (categorySelect) categorySelect.value = currentInfo?.category || '';
      if (urlInput) urlInput.value = currentInfo?.url || '';
      if (descriptionTextarea)
        descriptionTextarea.value = currentInfo?.description || '';

      this.showOverlay();
      modal.style.display = 'block';
    }
  }

  closeEditInfoModal() {
    const modal = document.querySelector<HTMLElement>('#edit-info-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    this.hideOverlay();
    this.editInfoCallback = null;
  }

  confirmEditInfo() {
    const form = document.querySelector<HTMLFormElement>('#mod-info-form');
    if (!form) return;

    const formData = new FormData(form);
    const info = {};

    formData.forEach((value, key) => {
      if (typeof value === 'string' && value.trim()) {
        info[key] = value.trim();
      }
    });

    if (this.editInfoCallback) {
      this.editInfoCallback(info);
    }

    this.closeEditInfoModal();
  }

  openAdvancedInfoModal(modPath, currentTomlContent) {
    this.currentModPath = modPath;

    const modal = document.querySelector<HTMLElement>('#advanced-info-modal');
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '#advanced-info-textarea',
    );

    if (modal && textarea) {
      modal.classList.remove('closing');
      textarea.value = currentTomlContent || '';

      this.showOverlay();
      modal.style.display = 'block';
    }
  }

  closeAdvancedInfoModal() {
    const modal = document.querySelector<HTMLElement>('#advanced-info-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
      }, 300);
    }
    this.hideOverlay();
    this.advancedInfoCallback = null;
    this.currentModPath = null;
  }

  async confirmAdvancedInfo() {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      '#advanced-info-textarea',
    );

    if (!textarea || !this.currentModPath) return;

    const tomlContent = textarea.value;

    try {
      const result = await window.electronAPI.saveModInfoRaw(
        this.currentModPath,
        tomlContent,
      );

      if (result.success) {
        if (window.toastManager) {
          window.toastManager.success('toasts.infoTomlSaved');
        }
        this.closeAdvancedInfoModal();

        if (window.modManager && window.modManager.selectedMod) {
          window.modManager.selectMod(window.modManager.selectedMod.id);
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToSaveInfoToml', 3000, {
            error: result.error,
          });
        }
      }
    } catch (error) {
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToSaveInfoToml', 3000, {
          error: '',
        });
      }
    }
  }

  async openInstallConfirmModal(url, downloadId, modId, modType = 'Mod') {
    this.pendingInstallData = { url, downloadId, modId, modType };

    const urlDisplay = document.querySelector<HTMLElement>(
      '#install-url-display',
    );
    if (urlDisplay) {
      urlDisplay.textContent = url;
    }

    const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
    if (modal) {
      modal.classList.remove('closing');
      this.showOverlay();
      modal.style.display = 'block';
    }

    const previewContainer = document.querySelector<HTMLElement>(
      '#install-preview-container',
    );
    if (previewContainer) {
      if (modType === 'Sound') {
        previewContainer.style.display = 'none';
      } else {
        previewContainer.style.display = 'flex';
      }
    }

    if (
      modId &&
      modType !== 'Sound' &&
      window.electronAPI?.fetchGameBananaPreview
    ) {
      const previewImage = document.querySelector<HTMLImageElement>(
        '#install-preview-image',
      );

      const previewLoading = document.querySelector<HTMLElement>(
        '.install-preview-loading',
      );

      try {
        const result = await window.electronAPI.fetchGameBananaPreview(modId);

        if (result.success && result.imageUrl) {
          previewImage!.onload = () => {
            previewImage!.classList.add('loaded');
            if (previewLoading) previewLoading.style.display = 'none';
          };
          previewImage!.src = result.imageUrl;
          previewImage!.style.display = 'block';
        } else {
          if (previewLoading) previewLoading.style.display = 'none';
        }
      } catch (error) {
        console.error('Failed to fetch preview:', error);
        if (previewLoading) previewLoading.style.display = 'none';
      }
    } else if (modType === 'Sound') {
      const previewLoading = document.querySelector<HTMLElement>(
        '.install-preview-loading',
      );
      if (previewLoading) previewLoading.style.display = 'none';
    }
  }

  closeInstallConfirmModal() {
    const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');

        const previewContainer = document.querySelector<HTMLElement>(
          '#install-preview-container',
        );
        const previewImage = document.querySelector<HTMLImageElement>(
          '#install-preview-image',
        );
        const previewLoading = document.querySelector<HTMLElement>(
          '.install-preview-loading',
        );
        if (previewContainer) {
          previewContainer.style.display = 'flex';
        }
        if (previewImage) {
          previewImage.src = '';
          previewImage.style.display = 'none';
          previewImage.classList.remove('loaded');
        }
        if (previewLoading) {
          previewLoading.style.display = 'flex';
        }
      }, 300);
    }
    this.hideOverlay();
    this.pendingInstallData = null;
  }

  async confirmInstall() {
    if (this.pendingInstallData && window.electronAPI?.confirmProtocolInstall) {
      const { url, downloadId } = this.pendingInstallData;
      this.closeInstallConfirmModal();

      try {
        await window.electronAPI.confirmProtocolInstall(url, downloadId);
      } catch (error) {
        console.error('Error confirming install:', error);
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToStartInstallation');
        }
      }
    }
  }

  cancelInstallConfirm() {
    if (this.pendingInstallData && window.electronAPI?.cancelProtocolInstall) {
      const { downloadId } = this.pendingInstallData;
      window.electronAPI.cancelProtocolInstall(downloadId);
    }
    this.closeInstallConfirmModal();
  }

  openPluginUpdateModal(updates, plugins) {
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

    const closeBtn = modal.querySelector<HTMLButtonElement>(
      '#close-plugin-update-modal',
    );
    closeBtn!.addEventListener('click', () => {
      this.closePluginUpdateModal();
    });

    const updateAllBtn = modal.querySelector<HTMLButtonElement>(
      '#update-all-plugins-btn',
    );

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

    const updateButtons =
      modal.querySelectorAll<HTMLButtonElement>('.update-plugin-btn');

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
  }

  closePluginUpdateModal() {
    const modal = document.querySelector<HTMLElement>('#plugin-update-modal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.remove();
      }, 300);
    }
    this.hideOverlay();
  }

  async openPluginMarketplaceModal() {
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

    const resultsContainer = modal.querySelector<HTMLElement>(
      '#marketplace-results',
    );

    // Get installed plugins mappings to detect which plugins are already installed
    let installedRepos: string[] = [];
    if (window.electronAPI && window.electronAPI.getPluginRepoMapping) {
      try {
        const result = await window.electronAPI.getPluginRepoMapping();
        if (result.success && result.mappings) {
          installedRepos = Object.values(result.mappings) as string[];
        }
      } catch (error) {
        console.warn('Failed to get plugin repo mappings:', error);
      }
    }

    if (window.pluginMarketplace) {
      const plugins = window.pluginMarketplace.getPlugins();
      this.renderMarketplaceResults(plugins, resultsContainer!, installedRepos);
    }

    const closeBtn = modal.querySelector<HTMLElement>(
      '#close-marketplace-modal',
    );

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
  }

  renderMarketplaceResults(
    plugins: MarketplacePlugin[],
    container: HTMLElement,
    installedRepos: string[] = [],
  ) {
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
        // Check if plugin is already installed by comparing repo
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

    const githubLinks = container.querySelectorAll<HTMLElement>(
      '.marketplace-card-link',
    );
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

    const installButtons = container.querySelectorAll<HTMLButtonElement>(
      '.marketplace-card-install-btn',
    );

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
            await window.pluginMarketplace.getLatestReleaseDownloadUrl(
              pluginRepo,
            );

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
              `Failed to get download URL for ${pluginName} from repo ${pluginRepo}`,
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
  }

  closePluginMarketplaceModal() {
    const modal = document.querySelector<HTMLElement>(
      '#plugin-marketplace-modal',
    );
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.remove();
      }, 300);
    }
    this.hideOverlay();
  }

  openPluginUpdateIntroModal(onEnable, onDisable) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'plugin-intro-modal';
    modal.style.maxWidth = '500px';
    modal.dataset.blocking = 'true'; // Mark as blocking to prevent global overlay click close

    // Ensure modal has transform for shake animation centering
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

    const enableBtn = modal.querySelector<HTMLElement>(
      '#enable-plugin-updates',
    );
    const disableBtn = modal.querySelector<HTMLElement>(
      '#disable-plugin-updates',
    );
    const overlay = document.querySelector<HTMLElement>('#modal-overlay');

    // Inject shake style dynamically to ensure it's present
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
        console.log('Shake handler triggered');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        modal.classList.remove('shake-animation');
        void modal.offsetWidth; // Trigger reflow
        modal.classList.add('shake-animation');
      }
    };

    if (overlay) {
      // Use capture to try to intercept before other handlers
      overlay.addEventListener('click', shakeHandler, true);
    }

    const close = (keepOverlay = false) => {
      if (overlay) {
        overlay.removeEventListener('click', shakeHandler, true);
      }
      modal.classList.add('closing');
      setTimeout(() => {
        modal.remove();
      }, 300);
      if (!keepOverlay) {
        this.hideOverlay();
      }
    };

    enableBtn!.addEventListener('click', () => {
      if (onEnable) {
        // Pass close function to callback so it can control closure/overlay
        // Or just call it with keepOverlay = true if we know we are opening another modal?
        // Let's change the contract: onEnable returns true if it wants to keep overlay
        const keepOverlay = onEnable();
        close(keepOverlay === true);
      } else {
        close();
      }
    });

    disableBtn!.addEventListener('click', () => {
      if (onDisable) onDisable();
      close();
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  const modalManager = (window.modalManager = new ModalManager());
  console.log('Modal Manager initialized');

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.querySelector<HTMLElement>('#modal-overlay');

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        // Check for blocking modals
        const blockingModal = document.querySelector<HTMLElement>(
          '.modal[data-blocking="true"]',
        );

        if (
          blockingModal &&
          blockingModal.style.display !== 'none' &&
          !blockingModal.classList.contains('closing')
        ) {
          return; // Do not close other modals if a blocking modal is active
        }

        modalManager.closeRenameModal();
        modalManager.closeUninstallModal();
        modalManager.closeAlertModal();
        modalManager.closeChangeSlotModal();
        modalManager.closeEditInfoModal();
        modalManager.closeAdvancedInfoModal();
        modalManager.closeInstallConfirmModal();
        modalManager.closePluginUpdateModal();
        modalManager.closePluginMarketplaceModal();

        if (window.conflictModalManager) {
          window.conflictModalManager.closeConflictModal();
          window.conflictModalManager.closeSlotChangeModal();
          window.conflictModalManager.closeAutoSlotChangeModal();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        modalManager.closeRenameModal();
        modalManager.closeUninstallModal();
        modalManager.closeAlertModal();
        modalManager.closeDeletePluginModal();
        modalManager.closeChangeSlotModal();
        modalManager.closeEditInfoModal();
        modalManager.closeAdvancedInfoModal();
        modalManager.closeInstallConfirmModal();

        if (window.conflictModalManager) {
          window.conflictModalManager.closeConflictModal();
          window.conflictModalManager.closeSlotChangeModal();
          window.conflictModalManager.closeAutoSlotChangeModal();
        }
      }
    });
  });
}

export { type ModalManager };
