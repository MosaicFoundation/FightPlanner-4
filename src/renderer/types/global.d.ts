import type { LottiePlayer } from 'lottie-web';
import type * as gsap from 'gsap';

import type { ElectronAPI } from '../../main/preload';
import type { TutorialAPI } from '../../main/tutorial-preload';

import type { ToastManager } from '../js/ui/toast-manager';
import type { ModManager } from '../js/mods/mod-manager';
import type { ModalManager } from '../js/ui/modal-manager';
import type { UpdateManager } from '../js/ui/update-manager';
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
import type { CustomizationManager } from '../js/customization/customization-manager';
import type { ProtocolListener } from '../js/protocol/protocol-listener';
import type { DiscordRPCClient } from '../js/core/discord-rpc-client';
import type { ModDragDropHandler } from '../js/mods/mod-drag-drop';
import type { I18nClient } from '../js/i18n/i18n-client';

import type { ModOperations } from '../js/mods/mod-operations';
import type { ModContextMenuHandler } from '../js/mods/mod-context-menu';
import type { ModKeybindsHandler } from '../js/mods/mod-keybinds';
import type { ModListRenderer } from '../js/mods/mod-list-renderer';
import type { LanguageSelector } from '../js/i18n/language-selector';

import {
  ResolveSSBUFolderName,
  SSBUCharacterImages,
  SSBUCharacters,
  SSBUFolderAliases,
} from '../js/characters/characters-data';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    tutorialAPI: TutorialAPI;

    i18n: I18nClient;
    toastManager: ToastManager;
    modManager: ModManager;
    modalManager: ModalManager;
    updateManager: UpdateManager;
    statusBarManager: StatusBarManager;
    downloadManager: DownloadManager;
    settingsManager: SettingsManager;
    conflictModalManager: ConflictModalManager;
    charactersManager: CharactersManager;
    socialManager: SocialManager;
    pluginManager: PluginManager;
    resizeHandler: ResizeHandler;
    modInfoManager: ModInfoManager;
    pluginMarketplace: PluginMarketplace;
    logsManager: LogsManager;
    animationManager: AnimationManager;
    tutorialManager: TutorialManager;
    fightPlannerManager: FightPlannerManager;
    modInfoEditor: ModInfoEditor;
    customizationManager: CustomizationManager;
    protocolListener: ProtocolListener;
    discordRPCClient: DiscordRPCClient;
    modDragDropHandler: ModDragDropHandler;

    ModOperations: typeof ModOperations;
    ModContextMenuHandler: typeof ModContextMenuHandler;
    ModKeybindsHandler: typeof ModKeybindsHandler;
    ModListRenderer: typeof ModListRenderer;
    LanguageSelector: typeof LanguageSelector;

    tutorial: {
      show: () => void;
      reset: () => void;
      resetFirstLaunch: () => void;
    };

    tabLoader: {
      loadTabContent: (tabId: string) => Promise<void>;
      initializeTabs: () => void;
    };

    lottie: LottiePlayer;
    gsap: typeof gsap;

    SSBU_CHARACTERS: SSBUCharacters;
    CHARACTER_IMAGES: SSBUCharacterImages;
    FOLDER_ALIASES: SSBUFolderAliases;
    resolveFolderName: ResolveSSBUFolderName;
  }
}
