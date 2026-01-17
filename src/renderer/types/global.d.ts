import type { LottiePlayer } from 'lottie-web';
import type * as gsap from 'gsap';

import type { ElectronAPI } from '../../main/preload';
import type { TutorialAPI } from '../../main/tutorial-preload';

import type { ToastManager } from '../js/ui/toast-manager';
import type { ModManager } from '../js/mods/mod-manager';
import type { ModalManager } from '../js/ui/modal-manager';
import type { UpdateManager } from '../js/ui/update-manager';
import type { I18n } from '../../locales/i18n';
import type { StatusBarManager } from '../js/ui/status-bar-manager';
import type { DownloadManager } from '../js/downloads/download-manager';
import type { SettingsManager } from '../js/settings/settings-manager';
import type { ConflictModalManager } from '../js/ui/conflict-modal-manager';
import type { CharactersManager } from '../js/characters/characters-manager';
import type { SocialManager } from '../js/social/social-manager';
import type { PluginManager } from '../js/mods/plugin-manager';
import type { ResizeHandler } from '../js/ui/resize-handler';
import type { ModInfoManager } from '../js/mods/mod-info';
import type { PluginMarketplace } from '../js/mods/plugin-marketplace';
import type { LogsManager } from '../js/logs/logs-manager';
import type { AnimationManager } from '../js/ui/animation-manager';
import type { TutorialManager } from '../js/tutorial/tutorial-manager';
import type { FightPlannerManager } from '../js/fightplanner/fightplanner-manager';
import type { ModInfoEditor } from '../js/mods/mod-info-editor';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    tutorialAPI?: TutorialAPI;

    toastManager?: ToastManager;
    modManager?: ModManager;
    modalManager?: ModalManager;
    updateManager?: UpdateManager;
    i18n?: I18n;
    statusBarManager?: StatusBarManager;
    downloadManager?: DownloadManager;
    settingsManager?: SettingsManager;
    conflictModalManager?: ConflictModalManager;
    charactersManager?: CharactersManager;
    socialManager?: SocialManager;
    pluginManager?: PluginManager;
    resizeHandler?: ResizeHandler;
    modInfoManager?: ModInfoManager;
    pluginMarketplace?: PluginMarketplace;
    logsManager?: LogsManager;
    animationManager?: AnimationManager;
    tutorialManager?: TutorialManager;
    fightPlannerManager?: FightPlannerManager;
    modInfoEditor?: ModInfoEditor;

    tutorial?: {
      show: () => void;
      reset: () => void;
      resetFirstLaunch: () => void;
    };

    tabLoader?: {
      loadTabContent: (tabId: string) => Promise<void>;
      initializeTabs: () => void;
    };

    lottie?: LottiePlayer;
    gsap?: typeof gsap;
  }
}

export {};
