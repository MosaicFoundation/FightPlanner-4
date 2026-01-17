import type { ToastManager } from '../js/ui/toast-manager';
import type { ElectronAPI } from '../../main/preload';
import type { ModManager } from '../js/mods/mod-manager';
import type { ModalManager } from '../js/ui/modal-manager';
import type { UpdateManager } from '../js/ui/update-manager';
import type { I18n } from '../../locales/i18n';
import type { StatusBarManager } from '../js/ui/status-bar-manager';
import type { DownloadManager } from '../js/downloads/download-manager';
import type { SettingsManager } from '../js/settings/settings-manager';
import type { ConflictModalManager } from '../js/ui/conflict-modal-manager';
import type { CharactersManager } from '../js/characters/characters-manager';

declare global {
  interface Window {
    toastManager: ToastManager;
    electronAPI: ElectronAPI;
    modManager: ModManager;
    modalManager: ModalManager;
    updateManager: UpdateManager;
    i18n: I18n;
    statusBarManager: StatusBarManager;
    downloadManager: DownloadManager;
    settingsManager: SettingsManager;
    conflictModalManager: ConflictModalManager;
    charactersManager: CharactersManager;
  }
}

export {};
