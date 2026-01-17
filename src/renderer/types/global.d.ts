import type { ToastManager } from '../js/ui/toast-manager';
import type { ElectronAPI } from '../../main/preload';
import type { ModManager } from '../js/mods/mod-manager';
import type { ModalManager } from '../js/ui/modal-manager';
import type { UpdateManager } from '../js/ui/update-manager';

declare global {
  interface Window {
    toastManager: ToastManager;
    electronAPI: ElectronAPI;
    modManager: ModManager;
    modalManager: ModalManager;
    updateManager: UpdateManager;
  }
}

export {};
