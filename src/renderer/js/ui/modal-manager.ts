import { PathData } from '../../../main/mod-utils/mod-scanner';
import type {
  EchoOperationOptions,
  SlotCustomNamesByFighter,
} from '../../../main/mod-utils/slot-changer';

type SlotAssignments = Map<string, string>;

type SlotAssignmentsByFighter = Map<string, SlotAssignments>;

type SlotUsageMod = { name: string; path: string; files: string[] };
type SlotUsageByFighter = Map<string, Map<string, { mods: SlotUsageMod[] }>>;

type EchoTakenName = {
  name: string;
  modName: string;
  modPath: string;
};

type ChangeSlotModalContext = {
  isEchoFighter?: boolean;
  preferredEchoName?: string;
  preferredEchoDisplayName?: string;
  preferredEchoIntroName?: string;
  nameSuggestions?: string[];
  takenNames?: EchoTakenName[];
  echoOperationOptions?: Partial<EchoOperationOptions>;
};

export interface CustomModalButton {
  text: string;
  type?: string;
  id?: string;
  onClick?: (e: MouseEvent, modal: HTMLElement) => void | boolean | Promise<void>;
  closeOnClick?: boolean;
}

export interface CustomModalOptions {
  id?: string;
  title: string;
  body: string | HTMLElement;
  size?: 'normal' | 'large' | 'small' | 'fullscreen' | string;
  buttons?: CustomModalButton[];
  onClose?: () => void;
  escapeToClose?: boolean;
  clickOverlayToClose?: boolean;
}

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
  fighterNames: string[];
  rawFighterNames: string[];
  selectedFighterName: string | null;
  pathData: PathData;
  slotUsageByFighter: SlotUsageByFighter | null;
  installQueue: {
    url: string;
    downloadId: string;
    modId: string;
    modType: string;
  }[];

  slotAssignments: SlotAssignmentsByFighter;
  deletedSlots: Map<string, Set<string>> = new Map();
  slotCustomNamesByFighter: SlotCustomNamesByFighter;
  echoOperationOptions: EchoOperationOptions;
  isEchoFlow: boolean;
  echoPreferredName: string;
  echoPreferredDisplayName: string;
  echoPreferredIntroName: string;
  echoNameSuggestions: string[];
  echoTakenNames: EchoTakenName[];

  changeSlotCallback?:
    | ((
      slotAssignments: SlotAssignmentsByFighter,
      deletedSlots: Map<string, Set<string>>,
      slotCustomNamesByFighter?: SlotCustomNamesByFighter,
      echoOperationOptions?: EchoOperationOptions,
    ) => void)
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
    this.installQueue = [];
    this.slotAssignments = new Map();
    this.slotCustomNamesByFighter = {};
    this.echoOperationOptions = {
      renameFolders: true,
      renameFiles: true,
      applyMetadata: true,
      generateConfig: true,
      duplicateCharacter: false,
      duplicateNIndexOffset: 8,
    };
    this.isEchoFlow = false;
    this.echoPreferredName = '';
    this.echoPreferredDisplayName = '';
    this.echoPreferredIntroName = '';
    this.echoNameSuggestions = [];
    this.echoTakenNames = [];
    this.fighterNames = [];
    this.rawFighterNames = [];
    this.selectedFighterName = null;
    this.slotUsageByFighter = null;
  }

  _getAnimationDelay() {
    const noAnimations = document.body.classList.contains('no-animations');
    return noAnimations ? 0 : 300;
  }

  showOverlay() {
    const overlay = document.querySelector<HTMLElement>('#modal-overlay');

    if (overlay) {
      overlay.classList.remove('closing');
      overlay.style.display = 'block';
      overlay.style.opacity = '1';
      overlay.style.zIndex = '9999';
    }
  }

  hideOverlay() {
    const visibleModals = Array.from(
      document.querySelectorAll<HTMLElement>('.modal'),
    ).filter(
      (m) => m.style.display === 'block' && !m.classList.contains('closing'),
    );

    if (visibleModals.length > 0) {
      return;
    }

    const overlay = document.querySelector<HTMLElement>('#modal-overlay');

    if (overlay) {
      this.closeModal(overlay, {
        skipHideOverlay: true,

        onModalClosed: () => {
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
            overlay.classList.remove('closing');
            overlay.style.display = 'block';
            overlay.style.opacity = '1';
          }
        },
      });
    }
  }

  closeModal(
    modalIdOrElement: string | HTMLElement,
    options: { onModalClosed?: () => void; skipHideOverlay?: boolean } = {},
  ) {
    const modal =
      typeof modalIdOrElement === 'string'
        ? document.querySelector<HTMLElement>(`#${modalIdOrElement}`)
        : modalIdOrElement;

    if (modal) {
      modal.classList.add('closing');

      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');

        options.onModalClosed?.();
      }, this._getAnimationDelay());
    }

    if (!options.skipHideOverlay) {
      this.hideOverlay();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  openRenameModal(_mod, _callback) {}
  closeRenameModal() {}
  confirmRename() {}

  openUninstallModal(_mod, _callback) {}
  closeUninstallModal() {}
  confirmUninstall() {}

  showAlert(_type, _title?, _message?, _params?) {}
  closeAlertModal() {}

  openDeletePluginModal(_plugin, _callback) {}
  closeDeletePluginModal() {}
  confirmDeletePlugin() {}

  openChangeSlotModal(_mod, _modData, _callback, _options?: Record<string, unknown>) {}
  closeChangeSlotModal() {}
  confirmChangeSlots() {}

  openEditInfoModal(_modPath, _currentInfo, _callback) {}
  closeEditInfoModal() {}
  confirmEditInfo() {}

  openAdvancedInfoModal(_modPath, _currentTomlContent) {}
  closeAdvancedInfoModal() {}
  async confirmAdvancedInfo() {}

  async openInstallConfirmModal(_url, _downloadId, _modId, _modType = 'Mod') {}
  closeInstallConfirmModal() {}
  confirmInstall() {}
  cancelInstallConfirm() {}
  cancelAllInstalls() {}

  openPluginUpdateModal(_updates, _plugins) {}
  closePluginUpdateModal() {}

  async openPluginMarketplaceModal() {}
  closePluginMarketplaceModal() {}
  renderMarketplaceResults(_plugins, _container, _installedRepos = []) {}

  openPluginUpdateIntroModal(_onEnable, _onDisable) {}

  showCustomModal(options: CustomModalOptions): HTMLElement {
    const modalId = options.id || `custom-modal-${Date.now()}`;

    const existingModal = document.getElementById(modalId);
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    const sizeClass = options.size && options.size !== 'normal' ? `modal-${options.size}` : '';
    modal.className = `modal ${sizeClass}`.trim();
    modal.id = modalId;
    if (options.clickOverlayToClose === false) {
      modal.dataset.blocking = 'true';
    }

    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h3');
    title.textContent = options.title;
    header.appendChild(title);

    const body = document.createElement('div');
    body.className = 'modal-body';
    if (typeof options.body === 'string') {
      body.innerHTML = options.body;
    } else if (options.body instanceof HTMLElement) {
      body.appendChild(options.body);
    }

    modal.appendChild(header);
    modal.appendChild(body);

    if (options.buttons && options.buttons.length > 0) {
      const footer = document.createElement('div');
      footer.className = 'modal-footer';

      options.buttons.forEach((btnConfig, index) => {
        const btn = document.createElement('button');
        const btnType = btnConfig.type || 'secondary';
        btn.className = `modal-btn modal-btn-${btnType}`;
        btn.textContent = btnConfig.text;
        if (btnConfig.id) btn.id = btnConfig.id;

        btn.addEventListener('click', async (e) => {
          let shouldClose = btnConfig.closeOnClick !== false;

          if (btnConfig.onClick) {
            try {
              const result = await btnConfig.onClick(e, modal);
              if (result === false) {
                shouldClose = false;
              }
            } catch (err) {
              shouldClose = false;
            }
          }

          if (shouldClose) {
            this.closeModal(modal, {
              onModalClosed: () => {
                modal.remove();
                if (options.onClose) options.onClose();
              }
            });
            if (escapeHandler) {
              document.removeEventListener('keydown', escapeHandler);
            }
          }
        });

        footer.appendChild(btn);
      });
      modal.appendChild(footer);
    } else {
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal-btn modal-btn-secondary';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', () => {
        this.closeModal(modal, {
          onModalClosed: () => {
            modal.remove();
            if (options.onClose) options.onClose();
          }
        });
        if (escapeHandler) {
          document.removeEventListener('keydown', escapeHandler);
        }
      });
      footer.appendChild(closeBtn);
      modal.appendChild(footer);
    }

    let overlay = document.querySelector<HTMLElement>('#modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      document.body.appendChild(overlay);
    }

    document.body.appendChild(modal);
    this.showOverlay();
    modal.style.display = 'block';

    if (window.i18n && window.i18n.updateDOM) {
      window.i18n.updateDOM();
    }

    let escapeHandler: ((e: KeyboardEvent) => void) | null = null;
    if (options.escapeToClose !== false) {
      escapeHandler = (e: KeyboardEvent) => {
        const visibleModals = Array.from(document.querySelectorAll<HTMLElement>('.modal')).filter(
          m => m.style.display === 'block' && !m.classList.contains('closing')
        );
        const isTopmost = visibleModals[visibleModals.length - 1] === modal;

        if (e.key === 'Escape' && isTopmost) {
          this.closeModal(modal, {
            onModalClosed: () => {
              modal.remove();
              if (options.onClose) options.onClose();
            }
          });
          document.removeEventListener('keydown', escapeHandler!);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    }

    return modal;
  }
}

if (typeof window !== 'undefined') {
  (window as any).ModalManagerClass = ModalManager;
  const modalManager = (window.modalManager = new ModalManager());
  console.log('[ModalManager] initialized');

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.querySelector<HTMLElement>('#modal-overlay');

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        const blockingModal = document.querySelector<HTMLElement>(
          '.modal[data-blocking="true"]',
        );

        if (
          blockingModal &&
          blockingModal.style.display !== 'none' &&
          !blockingModal.classList.contains('closing')
        ) {
          return;
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

        if (window.smartRenameManager) {
          window.smartRenameManager.closeSelectModal();
          window.smartRenameManager.closePreviewModal();
        }

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

        if (window.smartRenameManager) {
          window.smartRenameManager.closeSelectModal();
          window.smartRenameManager.closePreviewModal();
        }

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
