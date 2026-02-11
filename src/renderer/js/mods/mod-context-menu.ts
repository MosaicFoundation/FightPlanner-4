import type { ModManager } from './mod-manager';

class ModContextMenuHandler {
  modManager: ModManager;

  constructor(modManager: ModManager) {
    this.modManager = modManager;
    this.setupContextMenu();
  }

  setupContextMenu() {
    document.addEventListener('click', (e) => {
      const contextMenu =
        document.querySelector<HTMLElement>('#mod-context-menu');

      const target = e.target as HTMLElement;

      if (
        contextMenu &&
        !contextMenu.contains(target) &&
        contextMenu.style.display !== 'none'
      ) {
        this.closeContextMenu();
      }
    });

    const contextMenu =
      document.querySelector<HTMLElement>('#mod-context-menu');

    if (contextMenu) {
      contextMenu.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest('.context-menu-item') as HTMLElement;

        if (!item) return;

        const action = item.dataset.action;
        const modId = contextMenu.dataset.modId;
        const mod = this.modManager.mods.find((m) => m.id === modId);

        if (!mod) return;

        this.closeContextMenu();

        if (this.modManager.operations) {
          switch (action) {
            case 'rename':
              await this.modManager.operations.renameMod(mod);
              break;
            case 'change-slot':
              await this.modManager.operations.startChangeSlotsFlow(mod);
              break;
            case 'toggle':
              await this.modManager.operations.toggleModStatus(mod);
              break;
            case 'open-folder':
              await this.modManager.operations.openModFolder(mod);
              break;
            case 'uninstall':
              await this.modManager.operations.uninstallMod(mod);
              break;
          }
        }
      });
    }
  }

  closeContextMenu() {
    const contextMenu =
      document.querySelector<HTMLElement>('#mod-context-menu');
    if (!contextMenu) return;

    const noAnimations = document.body.classList.contains('no-animations');

    if (noAnimations) {
      contextMenu.style.display = 'none';
    } else {
      contextMenu.classList.add('closing');

      setTimeout(() => {
        contextMenu.style.display = 'none';
        contextMenu.classList.remove('closing');
      }, 150);
    }
  }

  showContextMenu(e, mod) {
    e.preventDefault();

    const contextMenu =
      document.querySelector<HTMLElement>('#mod-context-menu');
    if (!contextMenu) return;

    const toggleText = document.querySelector<HTMLElement>('#toggle-text');
    const toggleIcon = document.querySelector<HTMLElement>('#toggle-icon');

    const t = (key) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key) : key;
    };

    if (mod.status === 'disabled') {
      if (toggleText) toggleText.textContent = t('contextMenu.enable');
      if (toggleIcon) toggleIcon.className = 'bi bi-toggle-off';
    } else {
      if (toggleText) toggleText.textContent = t('contextMenu.disable');
      if (toggleIcon) toggleIcon.className = 'bi bi-toggle-on';
    }

    contextMenu.dataset.modId = mod.id;

    contextMenu.classList.remove('closing');
    contextMenu.style.display = 'none';
    void contextMenu.offsetWidth;

    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.display = 'block';

    setTimeout(() => {
      const rect = contextMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
      }
      if (rect.bottom > window.innerHeight) {
        contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
      }
    }, 0);
  }
}

if (typeof window !== 'undefined') {
  window.ModContextMenuHandler = ModContextMenuHandler;
}

export { type ModContextMenuHandler };
