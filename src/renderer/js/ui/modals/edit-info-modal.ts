export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[edit-info-modal] ModalManagerClass not found'); return; }

  M.prototype.openEditInfoModal = function (modPath, currentInfo, callback) {
    this.editInfoCallback = callback;

    const modal = document.querySelector<HTMLDivElement>('#edit-info-modal');
    const displayNameInput = document.querySelector<HTMLInputElement>('#edit-info-display-name');
    const authorsInput = document.querySelector<HTMLInputElement>('#edit-info-authors');
    const versionInput = document.querySelector<HTMLInputElement>('#edit-info-version');
    const categorySelect = document.querySelector<HTMLInputElement>('#edit-info-category');
    const urlInput = document.querySelector<HTMLInputElement>('#edit-info-url');
    const descriptionTextarea = document.querySelector<HTMLInputElement>('#edit-info-description');

    if (modal) {
      modal.classList.remove('closing');

      if (displayNameInput) displayNameInput.value = currentInfo?.display_name || '';
      if (authorsInput) authorsInput.value = currentInfo?.authors || '';
      if (versionInput) versionInput.value = currentInfo?.version || '';
      if (categorySelect) categorySelect.value = currentInfo?.category || '';
      if (urlInput) urlInput.value = currentInfo?.url || '';
      if (descriptionTextarea) descriptionTextarea.value = currentInfo?.description || '';

      this.showOverlay();
      modal.style.display = 'block';
    }
  };

  M.prototype.closeEditInfoModal = function () {
    this.closeModal('edit-info-modal');
    this.editInfoCallback = null;
  };

  M.prototype.confirmEditInfo = function () {
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
  };

  M.prototype.openAdvancedInfoModal = function (modPath, currentTomlContent) {
    this.currentModPath = modPath;

    const modal = document.querySelector<HTMLElement>('#advanced-info-modal');
    const textarea = document.querySelector<HTMLTextAreaElement>('#advanced-info-textarea');

    if (modal && textarea) {
      modal.classList.remove('closing');
      textarea.value = currentTomlContent || '';

      this.showOverlay();
      modal.style.display = 'block';
    }
  };

  M.prototype.closeAdvancedInfoModal = function () {
    this.closeModal('advanced-info-modal');
    this.advancedInfoCallback = null;
    this.currentModPath = null;
  };

  M.prototype.confirmAdvancedInfo = async function () {
    const textarea = document.querySelector<HTMLTextAreaElement>('#advanced-info-textarea');

    if (!textarea || !this.currentModPath) return;

    const tomlContent = textarea.value;

    try {
      const result = await window.electronAPI.saveModInfoRaw(this.currentModPath, tomlContent);

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
  };
})();
