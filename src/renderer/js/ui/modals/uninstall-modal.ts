export {};
(function () {
  const M = (window as any).ModalManagerClass;
  if (!M) { console.error('[uninstall-modal] ModalManagerClass not found'); return; }

  M.prototype.openUninstallModal = function (mod, callback) {
    this.currentMod = mod;
    this.uninstallCallback = callback;

    const modal = document.querySelector<HTMLElement>('#uninstall-modal');
    const modNameEl = document.querySelector<HTMLElement>('#uninstall-mod-name');

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
  };

  M.prototype.closeUninstallModal = function () {
    this.closeModal('uninstall-modal');
    this.currentMod = null;
    this.uninstallCallback = null;
  };

  M.prototype.confirmUninstall = function () {
    if (this.uninstallCallback) {
      this.uninstallCallback();
    }

    this.closeUninstallModal();
  };
})();
