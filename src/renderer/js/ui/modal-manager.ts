import type { MarketplacePlugin } from '../mods/plugin-marketplace';
import { Mod } from '../mods/mod-manager';
import { PathData, ScanModResult } from '../../../main/mod-utils/mod-scanner';

function slotStringToNumber(slot: string): number {
  return parseInt(slot.substring(1));
}

function slotNumberToString(slotNumber: number): string {
  return `c${slotNumber.toString().padStart(2, '0')}`;
}

/**
 * Represents the slot assignments for a single fighter, mapping original slot to new slot.
 * Example: { "c00": "c01", "c01": "c00", ... }
 */
type SlotAssignments = Map<string, string>;

/**
 * Represents the slot assignments for all fighters in a mod, mapping fighter name to its SlotAssignments.
 * Example: { "mario": {@link SlotAssignments}, "link": {@link SlotAssignments}, ... }
 */
type SlotAssignmentsByFighter = Map<string, SlotAssignments>;

/**
 * Represents the slot usage across all active mods for each fighter, mapping fighter name to a map of slot to mods using that slot.
 */
type SlotUsageMod = { name: string; path: string; files: string[] };
type SlotUsageByFighter = Map<string, Map<string, { mods: SlotUsageMod[] }>>;

// Fighter group definitions for multi-character fighters
const MULTI_CHAR_FIGHTER_GROUPS: Record<
  string,
  { members: string[]; displayName: string }
> = {
  'ptrainer-group': {
    members: ['ptrainer', 'pzenigame', 'pfushigisou', 'plizardon'],
    displayName: 'Pokemon Trainer',
  },

  'element-group': {
    members: [
      'element',
      'eflame',
      'elight',
      'flame_first',
      'light_first',
      'flame_only',
      'light_only',
    ],
    displayName: 'Pyra/Mythra',
  },
};

/**
 * Given a raw fighter name, returns the group id it belongs to, or null.
 */
function getFighterGroupId(fighterName: string): string | null {
  for (const [groupId, group] of Object.entries(MULTI_CHAR_FIGHTER_GROUPS)) {
    if (group.members.includes(fighterName)) {
      return groupId;
    }
  }

  return null;
}

/**
 * Given an array of raw fighter names, returns a deduplicated list where
 * grouped fighters are replaced by their group id, preserving order.
 */
function groupFighterNames(rawNames: string[]): string[] {
  const result: string[] = [];
  const groups = new Set<string>();

  for (const name of rawNames) {
    const groupId = getFighterGroupId(name);

    if (groupId) {
      if (!groups.has(groupId)) {
        groups.add(groupId);
        result.push(groupId);
      }
    } else {
      result.push(name);
    }
  }

  return result;
}

/**
 * Given a display fighter name (which may be a group id), returns the
 * actual fighter names present in the mod's pathData.
 */
function getActualFighterNames(
  displayName: string,
  allRawNames: string[],
): string[] {
  const group = MULTI_CHAR_FIGHTER_GROUPS[displayName];

  if (group) {
    return allRawNames.filter((name) => group.members.includes(name));
  }

  return [displayName];
}

/**
 * Returns a display name for a fighter or group.
 */
function getFighterDisplayName(fighterNameOrGroup: string): string {
  const group = MULTI_CHAR_FIGHTER_GROUPS[fighterNameOrGroup];

  if (group) {
    return group.displayName;
  }

  const resolvedFighterId = window.resolveFolderName
    ? window.resolveFolderName(fighterNameOrGroup)
    : fighterNameOrGroup.toLowerCase();

  const characterInfo = window.SSBU_CHARACTERS?.[resolvedFighterId];
  return characterInfo?.name || fighterNameOrGroup;
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

  changeSlotCallback?:
    | ((
      slotAssignments: SlotAssignmentsByFighter,
      deletedSlots: Map<string, Set<string>>,
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
      this.closeModal(overlay, {
        skipHideOverlay: true,

        onModalClosed: () => {
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
        },
      });
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

  closeRenameModal() {
    this.closeModal('rename-modal');
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
    this.closeModal('uninstall-modal');
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
    this.closeModal('alert-modal');
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
    this.closeModal('delete-plugin-modal');
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
      slotAssignments: SlotAssignmentsByFighter,
      deletedSlots: Map<string, Set<string>>,
    ) => void,
  ) {
    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    this.currentMod = mod;
    this.changeSlotCallback = callback;

    if (modData.fighterNames.length === 0) {
      throw new Error(
        'Cannot change slots for mods with no detected fighters.',
      );
    }

    this.rawFighterNames = modData.fighterNames;
    this.fighterNames = groupFighterNames(modData.fighterNames);

    this.slotAssignments = new Map<string, SlotAssignments>();

    for (const fighterName of modData.fighterNames) {
      const fighterSlots = Object.keys(modData.pathData[fighterName] || {});
      const assignments = new Map<string, string>();

      for (const slot of fighterSlots) {
        assignments.set(slot, slot);
      }

      this.slotAssignments.set(fighterName, assignments);
    }

    this.pathData = modData.pathData;

    const modal = document.querySelector<HTMLElement>('#change-slot-modal');
    const container = document.querySelector<HTMLElement>(
      '#slot-list-container',
    );

    if (modal && container) {
      modal.classList.remove('closing');

      // Update modal title to show mod name
      const modalHeader = modal.querySelector<HTMLElement>('.modal-header');
      const modalTitle = modalHeader?.querySelector<HTMLElement>('h3');

      if (modalTitle && modalHeader) {
        // Set title to mod name
        modalTitle.textContent = mod.name;

        // Remove existing subtitle if any
        const existingSubtitle = modalHeader.querySelector('.modal-subtitle');
        if (existingSubtitle) {
          existingSubtitle.remove();
        }

        // Wrap title in content div if not already wrapped
        let contentDiv = modalHeader.querySelector<HTMLElement>(
          '.modal-header-content',
        );

        if (!contentDiv) {
          contentDiv = document.createElement('div');
          contentDiv.className = 'modal-header-content';

          // Find close button to insert before it
          const closeButton = modalHeader.querySelector('.modal-close');
          if (closeButton) {
            modalHeader.insertBefore(contentDiv, closeButton);
          } else {
            modalHeader.appendChild(contentDiv);
          }

          // Move title into content div
          contentDiv.appendChild(modalTitle);
        }
      }

      this.selectedFighterName = this.fighterNames[0];

      this.renderFighterTabs();
      this.renderSlotList();

      // Show loading spinner for slot usage
      this.renderSlotUsageLoading();

      // Scan all active mods once and build slot usage per fighter
      this.scanAllModsSlotUsage().then(() => {
        this.renderSlotUsageForSelectedFighter();
        this.updateFighterTabConflicts();
      });

      this.showOverlay();
      modal.style.display = 'block';

      if (window.i18n && window.i18n.updateDOM) {
        window.i18n.updateDOM();
      }
    }
  }

  closeChangeSlotModal() {
    this.closeModal('change-slot-modal');

    // Reset modal title and remove subtitle/content wrapper
    const modal = document.querySelector<HTMLElement>('#change-slot-modal');
    const modalHeader = modal?.querySelector<HTMLElement>('.modal-header');
    const contentDiv = modalHeader?.querySelector<HTMLElement>(
      '.modal-header-content',
    );
    const modalTitle = modalHeader?.querySelector<HTMLElement>('h3');

    if (modalTitle) {
      modalTitle.textContent = 'Change Character Slot';
    }

    // Remove content wrapper and move title back to header
    if (contentDiv && modalTitle && modalHeader) {
      modalHeader.insertBefore(modalTitle, contentDiv);
      contentDiv.remove();
    }

    // Clean up slot usage tooltips from body
    document.querySelectorAll('.slot-usage-tooltip').forEach((tooltip) => {
      tooltip.remove();
    });

    // Clean up slot usage hint and overview
    const slotUsageHint = document.querySelector('#slot-usage-hint');
    const slotUsageOverview = document.querySelector('#slot-usage-overview');
    const fighterTabs = document.querySelector('#fighter-tabs-wrapper');

    if (slotUsageHint) slotUsageHint.remove();
    if (slotUsageOverview) slotUsageOverview.remove();
    if (fighterTabs) fighterTabs.remove();

    this.changeSlotCallback = null;
    this.slotAssignments = new Map();
    this.fighterNames = [];
    this.rawFighterNames = [];
    this.selectedFighterName = null;
    this.slotUsageByFighter = null;
  }

  renderSlotUsageLoading() {
    const modalBody = document.querySelector('#change-slot-modal .modal-body');
    const hintParagraph = document.querySelector('#slot-modal-hint');

    if (!modalBody || !hintParagraph) return;

    // Create hint
    const slotUsageHint = document.createElement('p');
    slotUsageHint.id = 'slot-usage-hint';
    slotUsageHint.className = 'modal-hint';
    slotUsageHint.textContent = 'Slot Usage:';
    modalBody.insertBefore(slotUsageHint, hintParagraph);

    // Create loading container
    const loadingContainer = document.createElement('div');
    loadingContainer.id = 'slot-usage-overview';
    loadingContainer.className = 'slot-usage-overview slot-usage-loading';

    const spinner = document.createElement('div');
    spinner.className = 'slot-usage-spinner';
    spinner.innerHTML = '<i class="bi bi-arrow-repeat"></i>';

    loadingContainer.appendChild(spinner);
    modalBody.insertBefore(loadingContainer, hintParagraph);
  }

  renderFighterTabs() {
    const modalBody = document.querySelector('#change-slot-modal .modal-body');
    if (!modalBody) return;

    // Remove existing tabs if any
    const existingTabs = document.querySelector('#fighter-tabs-wrapper');
    if (existingTabs) existingTabs.remove();

    const tabsWrapper = document.createElement('div');
    tabsWrapper.id = 'fighter-tabs-wrapper';
    tabsWrapper.className = 'slot-usage-fighter-tabs-wrapper';

    const tabsContainer = document.createElement('div');
    tabsContainer.id = 'fighter-tabs';
    tabsContainer.className = 'slot-usage-fighter-tabs';

    this.fighterNames.forEach((fighterName) => {
      const characterName = getFighterDisplayName(fighterName);

      const tab = document.createElement('button');
      tab.className = 'slot-usage-fighter-tab';
      tab.textContent = characterName;
      tab.dataset.fighter = fighterName;

      if (fighterName === this.selectedFighterName) {
        tab.classList.add('active');
      }

      tab.addEventListener('click', () => {
        this.selectFighter(fighterName);
      });

      tabsContainer.appendChild(tab);
    });

    tabsWrapper.appendChild(tabsContainer);

    // Update fade masks based on scroll position
    const updateFadeMasks = () => {
      const { scrollLeft, scrollWidth, clientWidth } = tabsContainer;
      const canScrollLeft = scrollLeft > 1;
      const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;

      tabsWrapper.classList.toggle('fade-left', canScrollLeft);
      tabsWrapper.classList.toggle('fade-right', canScrollRight);
    };

    tabsContainer.addEventListener('scroll', updateFadeMasks);
    requestAnimationFrame(updateFadeMasks);

    // Insert at the top of modal-body
    modalBody.insertBefore(tabsWrapper, modalBody.firstChild);

    // Allow vertical scroll wheel to scroll tabs horizontally with smooth momentum
    let scrollVelocity = 0;
    let scrollAnimationId: number | null = null;

    const animateScroll = () => {
      tabsContainer.scrollLeft += scrollVelocity;
      scrollVelocity *= 0.85;

      if (Math.abs(scrollVelocity) > 0.5) {
        scrollAnimationId = requestAnimationFrame(animateScroll);
      } else {
        scrollVelocity = 0;
        scrollAnimationId = null;
      }
    };

    tabsContainer.addEventListener(
      'wheel',
      (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          scrollVelocity += e.deltaY * 0.5;

          if (scrollAnimationId === null) {
            scrollAnimationId = requestAnimationFrame(animateScroll);
          }
        }
      },
      { passive: false },
    );
  }

  selectFighter(fighterName: string) {
    this.selectedFighterName = fighterName;

    // Update active tab
    const tabsContainer = document.querySelector('#fighter-tabs');

    if (tabsContainer) {
      tabsContainer
        .querySelectorAll<HTMLElement>('.slot-usage-fighter-tab')
        .forEach((tab) => {
          tab.classList.toggle('active', tab.dataset.fighter === fighterName);
        });
    }

    // Clean up existing tooltips before re-render
    document.querySelectorAll('.slot-usage-tooltip').forEach((tooltip) => {
      tooltip.remove();
    });

    // Re-render both sections for the selected fighter
    if (this.slotUsageByFighter) {
      this.renderSlotUsageForSelectedFighter();
    }

    this.renderSlotList();
  }

  renderSlotUsageForSelectedFighter() {
    if (
      !this.slotUsageByFighter ||
      !this.selectedFighterName ||
      !this.currentMod
    ) {
      return;
    }

    const fighterGroup = getActualFighterNames(
      this.selectedFighterName,
      this.rawFighterNames,
    );

    // Merge slot usage from all fighters in the group
    const mergedSlotUsage = new Map<string, { mods: SlotUsageMod[] }>();

    for (const fighter of fighterGroup) {
      const fighterUsage = this.slotUsageByFighter.get(fighter);

      if (!fighterUsage) continue;

      for (const [slot, usage] of fighterUsage) {
        if (!mergedSlotUsage.has(slot)) {
          mergedSlotUsage.set(slot, { mods: [] });
        }

        const existing = mergedSlotUsage.get(slot)!;

        for (const mod of usage.mods) {
          const existingMod = existing.mods.find((m) => m.path === mod.path);

          if (existingMod) {
            // Merge files from multiple fighters into same mod entry
            for (const file of mod.files) {
              if (!existingMod.files.includes(file)) {
                existingMod.files.push(file);
              }
            }
          } else {
            existing.mods.push({ ...mod, files: [...mod.files] });
          }
        }
      }
    }

    this.renderSlotUsageOverview(mergedSlotUsage, this.currentMod.path);
  }

  /**
   * Checks each fighter tab for file-level conflicts involving the current mod
   * and toggles the 'tab-conflict' CSS class accordingly.
   */
  updateFighterTabConflicts() {
    if (!this.slotUsageByFighter || !this.currentMod) return;

    const currentModPath = this.currentMod.path;
    const tabs = document.querySelectorAll<HTMLElement>(
      '.slot-usage-fighter-tab',
    );

    for (const tab of tabs) {
      const fighterName = tab.dataset.fighter;
      if (!fighterName) continue;

      const actualFighters = getActualFighterNames(
        fighterName,
        this.rawFighterNames,
      );

      let hasConflict = false;

      for (const fighter of actualFighters) {
        const fighterUsage = this.slotUsageByFighter.get(fighter);
        if (!fighterUsage) continue;

        for (const [, usage] of fighterUsage) {
          if (usage.mods.length < 2) continue;

          const currentModFiles = usage.mods
            .filter((m) => m.path === currentModPath)
            .flatMap((m) => m.files);

          if (currentModFiles.length === 0) continue;

          const currentFileSet = new Set(currentModFiles);
          const otherMods = usage.mods.filter((m) => m.path !== currentModPath);

          for (const other of otherMods) {
            if (other.files.some((f) => currentFileSet.has(f))) {
              hasConflict = true;
              break;
            }
          }

          if (hasConflict) break;
        }

        if (hasConflict) break;
      }

      tab.classList.toggle('tab-conflict', hasConflict);
    }
  }

  async scanAllModsSlotUsage(): Promise<void> {
    this.slotUsageByFighter = new Map();

    // Initialize empty maps for each raw fighter
    for (const fighterName of this.rawFighterNames) {
      this.slotUsageByFighter.set(fighterName, new Map());
    }

    if (!window.modManager || !window.modManager.mods) {
      return;
    }

    const activeMods = window.modManager.mods.filter(
      (m) => m.status === 'active' && m.path,
    );

    for (const mod of activeMods) {
      if (!mod.path || !window.electronAPI?.scanMod) continue;

      try {
        const scanResult = await window.electronAPI.scanMod(mod.path);
        if (!scanResult.success) continue;

        const modEntry = { name: mod.name, path: mod.path };

        for (const fighterName of this.rawFighterNames) {
          if (!scanResult.data.fighterNames.includes(fighterName)) continue;

          const fighterData = scanResult.data.pathData[fighterName] || {};
          const fighterSlots = Object.keys(fighterData);

          const fighterUsage = this.slotUsageByFighter.get(fighterName)!;

          for (const slot of fighterSlots) {
            if (!fighterUsage.has(slot)) {
              fighterUsage.set(slot, { mods: [] });
            }

            const slotData = fighterData[slot];

            const files = (slotData?.filesToBeModified || []).map(
              (f) => f.original,
            );

            fighterUsage.get(slot)!.mods.push({
              ...modEntry,
              files,
            });
          }
        }
      } catch (error) {
        console.warn(`Failed to scan mod ${mod.name}:`, error);
      }
    }
  }

  renderSlotUsageOverview(
    slotUsage: Map<string, { mods: SlotUsageMod[] }>,
    currentModPath: string,
  ) {
    const modalBody = document.querySelector('#change-slot-modal .modal-body');
    const hintParagraph = document.querySelector('#slot-modal-hint');

    if (!modalBody || !hintParagraph) return;

    // Find the overview container (should already exist from loading)
    let overviewContainer = document.querySelector<HTMLElement>(
      '#slot-usage-overview',
    );

    if (!overviewContainer) {
      overviewContainer = document.createElement('div');
      overviewContainer.id = 'slot-usage-overview';
      overviewContainer.className = 'slot-usage-overview';
      modalBody.insertBefore(overviewContainer, hintParagraph);
    }

    // Remove loading class and clear content
    overviewContainer.classList.remove('slot-usage-loading');
    overviewContainer.innerHTML = '';

    // Create grid for slots (show c00-c07 by default, can be expanded)
    const grid = document.createElement('div');
    grid.className = 'slot-usage-grid';

    const slotsToShow = 16; // Show c00-c15 for better visibility, can be adjusted as needed

    for (let i = 0; i < slotsToShow; i++) {
      const slotString = slotNumberToString(i);
      const usage = slotUsage.get(slotString);
      const isUsed = usage && usage.mods.length > 0;

      // Only consider it a conflict if mods have overlapping files, not just the same slot
      let hasCurrentModConflict = false;
      let hasOtherModsConflict = false;
      if (usage && usage.mods.length > 1) {
        const currentModFiles = usage.mods
          .filter((m) => m.path === currentModPath)
          .flatMap((m) => m.files);
        const currentModFileSet = new Set(currentModFiles);

        const otherMods = usage.mods.filter((m) => m.path !== currentModPath);

        // Check if current mod has file overlaps with any other mod
        if (currentModFileSet.size > 0) {
          for (const other of otherMods) {
            if (other.files.some((f) => currentModFileSet.has(f))) {
              hasCurrentModConflict = true;
              break;
            }
          }
        }

        // Check if other mods conflict with each other
        if (otherMods.length > 1) {
          const otherFileSets = otherMods.map((m) => new Set(m.files));
          outer: for (let a = 0; a < otherFileSets.length; a++) {
            for (let b = a + 1; b < otherFileSets.length; b++) {
              for (const file of otherFileSets[a]) {
                if (otherFileSets[b].has(file)) {
                  hasOtherModsConflict = true;
                  break outer;
                }
              }
            }
          }
        }
      }

      // Check if current mod is involved in the conflict
      const isCurrentModConflict = hasCurrentModConflict;
      const isOtherModsConflict =
        hasOtherModsConflict && !hasCurrentModConflict;

      const slotItem = document.createElement('div');
      slotItem.className = 'slot-usage-item';

      if (isUsed) {
        slotItem.classList.add('slot-used');
      }

      if (isCurrentModConflict) {
        slotItem.classList.add('slot-conflict-current');
      } else if (isOtherModsConflict) {
        slotItem.classList.add('slot-conflict-other');
      }

      slotItem.textContent = slotString;

      // Add tooltip on hover
      if (isUsed && usage) {
        slotItem.title = usage.mods.map((m) => m.name).join('\n');

        // Create custom tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'slot-usage-tooltip';
        tooltip.style.display = 'none';
        tooltip.style.position = 'fixed';

        const tooltipTitle = document.createElement('div');
        tooltipTitle.className = 'slot-usage-tooltip-title';
        tooltipTitle.textContent = `Slot ${slotString}`;
        tooltip.appendChild(tooltipTitle);

        usage.mods.forEach((mod) => {
          const modItem = document.createElement('div');
          modItem.className = 'slot-usage-tooltip-mod';
          modItem.innerHTML = `<i class="bi bi-folder-fill"></i> ${mod.name}`;
          tooltip.appendChild(modItem);
        });

        // Append tooltip to body to avoid clipping
        document.body.appendChild(tooltip);

        // Show/hide tooltip on hover with proper positioning
        slotItem.addEventListener('mouseenter', () => {
          const rect = slotItem.getBoundingClientRect();

          // Position tooltip above the slot item
          tooltip.style.left = `${rect.left + rect.width / 2}px`;
          tooltip.style.top = `${rect.top - 8}px`;
          tooltip.style.transform = 'translate(-50%, -100%)';
          tooltip.style.display = 'block';
        });

        slotItem.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });

        // Clean up tooltip when modal closes
        slotItem.dataset.tooltipId = `tooltip-${slotString}`;
      }

      grid.appendChild(slotItem);
    }

    overviewContainer.appendChild(grid);

    // Add legend
    const legend = document.createElement('div');
    legend.className = 'slot-usage-legend';
    legend.innerHTML = `
      <div class="slot-usage-legend-item">
        <span class="slot-usage-legend-box"></span>
        <span>Available</span>
      </div>
      <div class="slot-usage-legend-item">
        <span class="slot-usage-legend-box slot-used"></span>
        <span>In Use</span>
      </div>
      <div class="slot-usage-legend-item">
        <span class="slot-usage-legend-box slot-conflict-other"></span>
        <span>Conflict (Other Mods)</span>
      </div>
      <div class="slot-usage-legend-item">
        <span class="slot-usage-legend-box slot-conflict-current"></span>
        <span>Conflict (Current Mod)</span>
      </div>
    `;

    overviewContainer.appendChild(legend);
  }

  renderSlotList() {
    const container = document.querySelector<HTMLElement>(
      '#slot-list-container',
    );

    if (!container || !this.slotAssignments || !this.selectedFighterName)
      return;

    const t = (key, params = {}) => {
      return window.i18n && window.i18n.t ? window.i18n.t(key, params) : key;
    };

    container.innerHTML = '';

    // Clean up portaled dropdowns from previous renders
    document
      .querySelectorAll('.custom-select-dropdown[data-parent-id]')
      .forEach((dropdown) => dropdown.remove());

    // Get the actual fighter names for the selected tab (may be a group)
    const actualFighters = getActualFighterNames(
      this.selectedFighterName,
      this.rawFighterNames,
    );

    // Merge unique slots from all fighters in the group
    const mergedAssignments = new Map<string, string>();

    for (const fighter of actualFighters) {
      const assignments = this.slotAssignments.get(fighter);

      if (!assignments) continue;

      for (const [slot, target] of assignments) {
        if (!mergedAssignments.has(slot)) {
          mergedAssignments.set(slot, target);
        }
      }
    }

    const sortedAssignments = Array.from(mergedAssignments).sort(
      ([a], [b]) => slotStringToNumber(a) - slotStringToNumber(b),
    );

    for (const [
      index,
      [originalSlotString, selectedSlotString],
    ] of sortedAssignments.entries()) {
      const slotItem = document.createElement('div');

      slotItem.className = 'slot-item';
      slotItem.dataset.index = `${index}`;

      const content = document.createElement('div');
      content.className = 'slot-item-content';

      // Restore deleted state for this slot if any fighter in the group has it marked
      const isSlotDeleted = actualFighters.some((fighter) => {
        const fighterDeleted = this.deletedSlots.get(fighter);
        return fighterDeleted && fighterDeleted.has(originalSlotString);
      });

      if (isSlotDeleted) {
        content.classList.add('deleted');
      }

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
          // Update data for all fighters in the selected group
          const selectedActualFighters = getActualFighterNames(
            this.selectedFighterName!,
            this.rawFighterNames,
          );

          for (const fighter of selectedActualFighters) {
            const fighterAssignments = this.slotAssignments.get(fighter);

            if (
              fighterAssignments &&
              fighterAssignments.has(originalSlotString)
            ) {
              fighterAssignments.set(originalSlotString, slotString);
            }
          }

          // Update UI
          selectedValueSpan.textContent = t('modals.changeSlot.slotOption', {
            slot: slotString,
          });

          // Close dropdown
          selectContainer.classList.remove('open');
          selectDropdown.style.opacity = '0';
          selectDropdown.style.pointerEvents = 'none';
          selectDropdown.style.visibility = 'hidden';
          selectDropdown.style.transform = 'translateY(-10px)';

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

      // Portal dropdown to body immediately to prevent overflow issues
      selectDropdown.dataset.parentId = `${index}`;
      selectDropdown.style.position = 'fixed';
      selectDropdown.style.opacity = '0';
      selectDropdown.style.pointerEvents = 'none';
      selectDropdown.style.visibility = 'hidden';
      document.body.appendChild(selectDropdown);

      // Toggle dropdown
      selectTrigger.addEventListener('click', (e) => {
        e.stopPropagation();

        const wasOpen = selectContainer.classList.contains('open');

        // Close other open selects
        document
          .querySelectorAll<HTMLElement>('.custom-select.open')
          .forEach((el) => {
            if (el !== selectContainer) {
              el.classList.remove('open');
              const drop = document.body.querySelector<HTMLElement>(
                `.custom-select-dropdown[data-parent-id="${el.dataset.index}"]`,
              );

              if (drop) {
                drop.style.opacity = '0';
                drop.style.pointerEvents = 'none';
                drop.style.visibility = 'hidden';
                drop.style.transform = 'translateY(-10px)';
              }
            }
          });

        if (!wasOpen) {
          selectContainer.classList.add('open');

          // Position and show dropdown
          const rect = selectContainer.getBoundingClientRect();
          selectDropdown.style.top = `${rect.bottom + 5}px`;
          selectDropdown.style.left = `${rect.left}px`;
          selectDropdown.style.width = `${rect.width}px`;
          selectDropdown.style.zIndex = '100005';

          // Set start state for animation
          selectDropdown.style.transition = 'none';
          selectDropdown.style.opacity = '0';
          selectDropdown.style.transform = 'translateY(-10px)';
          selectDropdown.style.pointerEvents = 'all';
          selectDropdown.style.visibility = 'visible';

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
          // Hide dropdown
          selectDropdown.style.opacity = '0';
          selectDropdown.style.pointerEvents = 'none';
          selectDropdown.style.visibility = 'hidden';
          selectDropdown.style.transform = 'translateY(-10px)';
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
            // Hide dropdown
            selectDropdown.style.opacity = '0';
            selectDropdown.style.pointerEvents = 'none';
            selectDropdown.style.visibility = 'hidden';
            selectDropdown.style.transform = 'translateY(-10px)';
          }
        }
      });

      info.appendChild(label);
      info.appendChild(arrow);
      info.appendChild(selectContainer);

      const filesInfo = document.createElement('div');
      filesInfo.className = 'slot-item-files';

      // Collect paths from all fighters in the group for this slot
      const allPathsToBeModified: { original: string; type: string }[] = [];

      for (const fighter of actualFighters) {
        const fighterData = this.pathData[fighter];

        const pathDataForSlot =
          fighterData && fighterData[originalSlotString]
            ? fighterData[originalSlotString]
            : null;

        if (pathDataForSlot) {
          allPathsToBeModified.push(...pathDataForSlot.pathsToBeModified);
        }
      }

      if (allPathsToBeModified.length > 0) {
        const filesList = document.createElement('details');

        const summary = document.createElement('summary');
        summary.textContent = t('modals.changeSlot.filesWillBeModified', {
          count: allPathsToBeModified.length,
        });

        const fileListContainer = document.createElement('div');
        fileListContainer.className = 'slot-file-list';

        allPathsToBeModified.forEach((entry) => {
          const fileItem = document.createElement('div');
          fileItem.className = 'slot-file-item';

          const icon = entry.type === 'directory' ? '📁' : '📄';
          const typeLabel =
            entry.type === 'directory'
              ? t('modals.changeSlot.directory')
              : t('modals.changeSlot.file');

          fileItem.textContent = `${icon} ${typeLabel} ${entry.original}`;
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
    if (!this.deletedSlots || !this.selectedFighterName) return;

    const actualFighters = getActualFighterNames(
      this.selectedFighterName,
      this.rawFighterNames,
    );

    // Check if the slot is currently marked as deleted for all fighters in this group
    const isDeleted = actualFighters.every((fighter) => {
      const fighterDeleted = this.deletedSlots.get(fighter);
      return fighterDeleted && fighterDeleted.has(slot);
    });

    if (isDeleted) {
      // Undelete for all fighters in the group that have this slot
      for (const fighter of actualFighters) {
        const fighterDeleted = this.deletedSlots.get(fighter);

        if (fighterDeleted) {
          fighterDeleted.delete(slot);
        }
      }

      content.classList.remove('deleted');
    } else {
      // Mark as deleted for all fighters in the group that have this slot
      for (const fighter of actualFighters) {
        const assignments = this.slotAssignments.get(fighter);

        if (assignments && assignments.has(slot)) {
          if (!this.deletedSlots.has(fighter)) {
            this.deletedSlots.set(fighter, new Set());
          }

          this.deletedSlots.get(fighter)!.add(slot);
        }
      }

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
    this.closeModal('edit-info-modal');
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
    this.closeModal('advanced-info-modal');
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
    this.installQueue.push({ url, downloadId, modId, modType });

    if (this.installQueue.length === 1) {
      this._showInstallModal();
    } else {
      this._updateInstallQueueUI();
    }
  }

  private async _showInstallModal() {
    const item = this.installQueue[0];
    if (!item) return;

    const urlDisplay = document.querySelector<HTMLElement>('#install-url-display');
    if (urlDisplay) {
      urlDisplay.textContent = item.url;
    }

    const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
    if (modal) {
      modal.classList.remove('closing');
      this.showOverlay();
      modal.style.display = 'block';
    }

    const previewContainer = document.querySelector<HTMLElement>('#install-preview-container');
    if (previewContainer) {
      previewContainer.style.display = item.modType === 'Sound' ? 'none' : 'flex';
    }

    const previewImage = document.querySelector<HTMLImageElement>('#install-preview-image');
    const previewLoading = document.querySelector<HTMLElement>('.install-preview-loading');

    if (previewImage) {
      previewImage.src = '';
      previewImage.style.display = 'none';
      previewImage.classList.remove('loaded');
    }
    if (previewLoading) {
      previewLoading.style.display = 'flex';
    }

    if (item.modId && item.modType !== 'Sound' && window.electronAPI?.fetchGameBananaPreview) {
      try {
        const result = await window.electronAPI.fetchGameBananaPreview(item.modId);
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
    } else if (item.modType === 'Sound') {
      if (previewLoading) previewLoading.style.display = 'none';
    }

    this._updateInstallQueueUI();
  }

  private _updateInstallQueueUI() {
    const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
    if (!modal) return;

    const total = this.installQueue.length;

    // Update badge
    let badge = modal.querySelector<HTMLElement>('.install-queue-badge');
    if (total > 1) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'install-queue-badge';
        const header = modal.querySelector('.modal-header h3');
        if (header) header.appendChild(badge);
      }
      badge.textContent = `1 / ${total}`;
      badge.style.display = 'inline-flex';
    } else if (badge) {
      badge.style.display = 'none';
    }

    // Update cancel all button
    let cancelAllBtn = modal.querySelector<HTMLElement>('#install-cancel-all-btn');
    if (total > 1) {
      if (cancelAllBtn) cancelAllBtn.style.display = 'inline-flex';
    } else if (cancelAllBtn) {
      cancelAllBtn.style.display = 'none';
    }

    // Remove all existing stacked cards (we'll rebuild them to ensure fresh data)
    document.querySelectorAll('.install-stack-card').forEach((c) => c.remove());

    if (total > 1) {
      const cardsToShow = Math.min(total - 1, 2);
      for (let i = 1; i <= cardsToShow; i++) {
        const item = this.installQueue[i];
        if (!item) continue;

        const card = modal.cloneNode(true) as HTMLElement;
        card.removeAttribute('id');
        card.className = `modal install-stack-card install-stack-card-${i} install-stack-card-enter`;

        // Update URL
        const urlDisplay = card.querySelector('.install-url-display');
        if (urlDisplay) urlDisplay.textContent = item.url;

        // Update Badge
        const badge = card.querySelector('.install-queue-badge');
        if (badge) badge.textContent = `${i + 1} / ${total}`;

        // Reset and fetch preview
        const previewContainer = card.querySelector('.install-preview-container') as HTMLElement;
        const previewImage = card.querySelector('.install-preview-image') as HTMLImageElement;
        const previewLoading = card.querySelector('.install-preview-loading') as HTMLElement;

        if (previewContainer) {
          previewContainer.style.display = item.modType === 'Sound' ? 'none' : 'flex';
        }
        if (previewImage) {
          previewImage.src = '';
          previewImage.style.display = 'none';
          previewImage.classList.remove('loaded');
          // Important: clear duplicate IDs from clones
          previewImage.removeAttribute('id');
        }
        if (previewLoading) {
          previewLoading.style.display = 'flex';
        }

        if (item.modId && item.modType !== 'Sound' && window.electronAPI?.fetchGameBananaPreview) {
          window.electronAPI.fetchGameBananaPreview(item.modId).then(result => {
            if (result.success && result.imageUrl) {
              previewImage.onload = () => {
                previewImage.classList.add('loaded');
                if (previewLoading) previewLoading.style.display = 'none';
              };
              previewImage.src = result.imageUrl;
              previewImage.style.display = 'block';
            } else {
              if (previewLoading) previewLoading.style.display = 'none';
            }
          }).catch(() => {
            if (previewLoading) previewLoading.style.display = 'none';
          });
        }

        modal.parentElement?.insertBefore(card, modal);

        setTimeout(() => {
          card.classList.remove('install-stack-card-enter');
        }, 400);
      }
    }
  }

  private _clearInstallQueueUI() {
    const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
    if (modal) {
      const badge = modal.querySelector<HTMLElement>('.install-queue-badge');
      if (badge) badge.style.display = 'none';

      const cancelAllBtn = modal.querySelector<HTMLElement>('#install-cancel-all-btn');
      if (cancelAllBtn) cancelAllBtn.style.display = 'none';
    }

    document.querySelectorAll('.install-stack-card').forEach((c) => c.remove());
  }

  private _resetInstallPreview() {
    const previewContainer = document.querySelector<HTMLElement>('#install-preview-container');
    const previewImage = document.querySelector<HTMLImageElement>('#install-preview-image');
    const previewLoading = document.querySelector<HTMLElement>('.install-preview-loading');

    if (previewContainer) previewContainer.style.display = 'flex';
    if (previewImage) {
      previewImage.src = '';
      previewImage.style.display = 'none';
      previewImage.classList.remove('loaded');
    }
    if (previewLoading) previewLoading.style.display = 'flex';
  }

  closeInstallConfirmModal() {
    this._clearInstallQueueUI();

    this.closeModal('install-confirm-modal', {
      onModalClosed: () => {
        this._resetInstallPreview();
      },
    });

    this.installQueue = [];
  }

  private _advanceInstallQueue(useDynamicIsland = false) {
    this.installQueue.shift();

    if (this.installQueue.length > 0) {
      const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
      if (modal) {
        modal.classList.add('install-modal-advance');
        setTimeout(() => {
          modal.classList.remove('install-modal-advance');
        }, 350);
      }
      this._showInstallModal();
    } else {
      this._clearInstallQueueUI();
      if (useDynamicIsland) {
        this._animateModalToStatusBar();
      } else {
        this.closeModal('install-confirm-modal', {
          onModalClosed: () => {
            this._resetInstallPreview();
          },
        });
      }
    }
  }

  private _animateModalToStatusBar() {
    const modal = document.querySelector<HTMLElement>('#install-confirm-modal');
    const statusBar = document.getElementById('main-status-bar');
    if (!modal || !statusBar) {
      this.closeModal('install-confirm-modal', {
        onModalClosed: () => this._resetInstallPreview(),
      });
      return;
    }

    const noAnimations = document.body.classList.contains('no-animations');
    if (noAnimations) {
      this.closeModal('install-confirm-modal', {
        onModalClosed: () => this._resetInstallPreview(),
      });
      return;
    }

    if (window.statusBarManager) {
      window.statusBarManager.pendingDynamicIsland = true;
      const bottomBar = document.getElementById('main-status-bar');
      if (bottomBar) {
        bottomBar.classList.remove('expanded');
        const extContent = bottomBar.querySelector('.extended-content') as HTMLElement;
        if (extContent) extContent.style.display = 'none';
      }
    }

    modal.style.animation = 'none';
    modal.style.transition = 'none';
    modal.style.overflow = 'hidden';

    const statusBarRect = statusBar.getBoundingClientRect();
    const statusBarCenterX = statusBarRect.left + statusBarRect.width / 2;
    const statusBarCenterY = statusBarRect.top + statusBarRect.height / 2;

    const overlay = document.querySelector<HTMLElement>('#modal-overlay');

    const gsapRef = (window as any).gsap;

    gsapRef.set(modal, {
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
    });

    const tl = gsapRef.timeline({
      onComplete: () => {
        modal.style.display = 'none';
        modal.removeAttribute('style');
        modal.style.display = 'none';
        this._resetInstallPreview();

        if (overlay) {
          overlay.style.display = 'none';
          overlay.removeAttribute('style');
          overlay.style.display = 'none';
        }

        const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim() || '90,90,122';
        gsapRef.fromTo(statusBar, {
          boxShadow: `0 -2px 25px 6px rgba(${accentRgb}, 0.6)`,
          filter: 'brightness(1.2)',
        }, {
          duration: 0.8,
          boxShadow: `0 -2px 0px 0px rgba(${accentRgb}, 0)`,
          filter: 'brightness(1)',
          ease: 'power2.out',
          onComplete: () => {
            statusBar.style.boxShadow = '';
            statusBar.style.filter = '';
          },
        });

        setTimeout(() => {
          if (window.statusBarManager) {
            window.statusBarManager.pendingDynamicIsland = false;
            window.statusBarManager.userDismissedExtendedBar = false;
            window.statusBarManager.checkActiveDownloads();
          }
        }, 200);
      },
    });

    tl.to(modal, {
      duration: 0.45,
      top: statusBarCenterY,
      left: statusBarCenterX,
      scale: 0.12,
      borderRadius: '24px',
      opacity: 0.7,
      filter: 'blur(2px)',
      ease: 'power3.in',
    });

    tl.to(modal, {
      duration: 0.12,
      opacity: 0,
      scale: 0.05,
      filter: 'blur(12px)',
      ease: 'power2.in',
    });

    if (overlay) {
      overlay.style.animation = 'none';
      overlay.style.transition = 'none';
      gsapRef.to(overlay, {
        duration: 0.4,
        opacity: 0,
        ease: 'power2.inOut',
      });
    }
  }

  confirmInstall() {
    const item = this.installQueue[0];
    if (item && window.electronAPI?.confirmProtocolInstall) {
      window.electronAPI.confirmProtocolInstall(item.url, item.downloadId).catch((error) => {
        console.error('Error confirming install:', error);
        if (window.toastManager) {
          window.toastManager.error('toasts.failedToStartInstallation');
        }
      });
    }
    this._advanceInstallQueue(true);
  }

  cancelInstallConfirm() {
    const item = this.installQueue[0];
    if (item && window.electronAPI?.cancelProtocolInstall) {
      window.electronAPI.cancelProtocolInstall(item.downloadId);
    }
    this._advanceInstallQueue();
  }

  cancelAllInstalls() {
    for (const item of this.installQueue) {
      if (window.electronAPI?.cancelProtocolInstall) {
        window.electronAPI.cancelProtocolInstall(item.downloadId);
      }
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
    this.closeModal('plugin-update-modal');
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
    this.closeModal('plugin-marketplace-modal');
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

    enableBtn!.addEventListener('click', () => {
      if (onEnable) {
        // Pass close function to callback so it can control closure/overlay
        // Or just call it with keepOverlay = true if we know we are opening another modal?
        // Let's change the contract: onEnable returns true if it wants to keep overlay
        const keepOverlay = onEnable();

        this.closeModal(modal, {
          skipHideOverlay: keepOverlay,
        });
      } else {
        this.closeModal(modal);
      }
    });

    disableBtn!.addEventListener('click', () => {
      if (onDisable) onDisable();
      this.closeModal(modal);
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
