import type { Mod } from '../mods/mod-manager';
import type {
  EchoOperationOptions,
  UiCompatibilityCategory,
} from '../../../main/mod-utils/slot-changer';

type EchoTakenName = {
  name: string;
  modName: string;
  modPath: string;
};

type EchoUiCompatibilityCategoryPlan = {
  key: UiCompatibilityCategory;
  defaultEnabled: boolean;
  defaultTargetPath: string | null;
  defaultSourcePath: string | null;
};

type EchoUiCompatibilityCandidate = {
  name: string;
  path: string;
  status: string;
  signatures: {
    slotExpansionData: boolean;
    cssLayout: boolean;
    menuParams: boolean;
  };
};

type EchoUiCompatibilityPlan = {
  success: boolean;
  selectedModPath: string;
  profile: 'expanded-slots-theme-split' | 'single-mod-fallback';
  categories: EchoUiCompatibilityCategoryPlan[];
  candidates: EchoUiCompatibilityCandidate[];
  recommendedTargets: {
    slotExpansionTargetPath: string;
    uiThemeSourcePath: string | null;
    uiMergeTargetPath: string;
  };
  notes: string[];
};

type EchoUiCompatibilityState = {
  slotExpansionData: boolean;
  cssLayout: boolean;
  menuParams: boolean;
  slotTargetPath: string;
  uiSourcePath: string;
  uiTargetPath: string;
  autoSkipConflicts: boolean;
};

type VisualModType = 'fighter' | 'moveset' | 'echo';

type VisualModEntry = {
  id: string;
  name: string;
  path: string;
  status: string;
  type: VisualModType;
  fighterKeys: string[];
  previewUrl: string | null;
};

type VisualCharacterEntry = {
  fighterKey: string;
  name: string;
  imageUrl: string;
  modPreviewUrl: string | null;
  cardKind: 'fighter' | 'echo';
  baseFighterKey: string;
  sourceModPath: string | null;
  fighterMods: VisualModEntry[];
  movesetMods: VisualModEntry[];
  echoMods: VisualModEntry[];
};

type VisualPlannerPersistedState = {
  characterOrder?: string[];
  selectedCharacter?: string | null;
  disabledCharacters?: string[];
};

type EchoSubview = 'builder' | 'planner';

type EchoUiLayoutStatePayload = {
  characterOrder?: string[];
  selectedCharacter?: string | null;
  updatedAt?: string;
};

type EchoUiNameOption = {
  slot: string;
  labelIndex: string;
  namChr0: string;
  namChr1: string;
  namChr2: string;
  namChr3: string;
  namStageName: string;
  announcer: string;
};

type EchoUiCharaInspectorData = {
  sourcePath: string;
  fighterName: string;
  fighterIndex: number;
  fields: Record<string, string>;
  nameOptions: EchoUiNameOption[];
};

type VisualModScanCacheEntry = {
  cacheKey: string;
  entry: VisualModEntry | null;
};

const ECHO_VISUAL_STATE_KEY = 'echo.visualPlannerState.v1';
const ECHO_SUBVIEW_STATE_KEY = 'echo.activeSubview.v1';

class EchoManager {
  /**
   * Session cache for visual planner grid: { hash, html }
   */
  _visualPlannerCache = { hash: '', html: '' };
  initialized: boolean;
  selectedEchoModPath: string | null;
  lastAnalyzedModPath: string | null;
  isEchoFighter: boolean;
  nameSuggestions: string[];
  takenNames: EchoTakenName[];
  modEligibilityByPath: Map<string, boolean>;
  uiCompatibilityPlan: EchoUiCompatibilityPlan | null;
  uiCompatibilityState: EchoUiCompatibilityState | null;
  visualCharacterOrder: string[];
  visualDisabledCharacters: Set<string>;
  visualSelectedCharacter: string | null;
  visualCharactersByKey: Map<string, VisualCharacterEntry>;
  visualMods: VisualModEntry[];
  visualUnmappedMods: VisualModEntry[];
  visualLoading: boolean;
  visualDraggedCharacter: string | null;
  renderVisualPlanner() {
    const container = document.querySelector<HTMLElement>('#echo-visual-content');
    if (!container) return;

    // Hash the current visual planner state for cache key
    const stateHash = JSON.stringify({
      order: this.visualCharacterOrder,
      byKey: Array.from(this.visualCharactersByKey.entries()),
      unmapped: this.visualUnmappedMods.map((m) => m.id || m.name || m.path),
      disabled: Array.from(this.visualDisabledCharacters),
    });

    if (this._visualPlannerCache.hash === stateHash) {
      container.innerHTML = this._visualPlannerCache.html;
      return;
    }

    if (this.visualLoading) {
      container.innerHTML = `<p class="echo-loading">${this.t('echo.loading')}</p>`;
      return;
    }

    const selectedEntry = this.getSelectedVisualEntry();
    const selectedTitle = selectedEntry ? this.getVisualCardTitle(selectedEntry) : '';
    const selectedSubtitle = selectedEntry
      ? this.getVisualCardSubtitle(selectedEntry)
      : '';
    const selectedLabel = selectedSubtitle
      ? `${selectedTitle} - ${selectedSubtitle}`
      : selectedTitle;
    const selectedText = selectedEntry
      ? this.t('echo.visualSelectedCharacter', { name: selectedLabel })
      : this.t('echo.visualNoCharacterSelected');

    const selectedMods = selectedEntry
      ? [...selectedEntry.fighterMods, ...selectedEntry.movesetMods, ...selectedEntry.echoMods]
      : [];
    const selectedSummary = selectedEntry
      ? `${selectedText} (${selectedMods.length})`
      : selectedText;

    const renderTile = (fighterKey: string, isDisabledArea = false) => {
      // ...existing code...
      // return /* tile HTML */; (REMOVED: placeholder, not valid JS)
    };

    const activeOrder = this.visualCharacterOrder.filter(
      (fighterKey) => !this.visualDisabledCharacters.has(fighterKey),
    );
    const disabledOrder = this.visualCharacterOrder.filter((fighterKey) =>
      this.visualDisabledCharacters.has(fighterKey),
    );

    const activeTilesHtml = activeOrder.map((fighterKey) => renderTile(fighterKey)).join('');
    const disabledTilesHtml = disabledOrder
      .map((fighterKey) => renderTile(fighterKey, true))
      .join('');

    const unmappedModsHtml =
      this.visualUnmappedMods.length === 0
        ? ''
        : `
            <div class="echo-visual-unmapped">
              <p class="echo-visual-unmapped-title">${this.t('echo.visualUnmappedMods')}</p>
              <div class="echo-visual-mod-list">
                ${this.visualUnmappedMods
                  .slice(0, 10)
                  .map((mod) => this.renderUnmappedModItem(mod))
                  .join('')}
              </div>
            </div>
          `;

    const html = `
      <div class="echo-visual-board">
        ${activeTilesHtml}
        ${disabledTilesHtml}
      </div>
      ${unmappedModsHtml}
    `;
    container.innerHTML = html;
    this._visualPlannerCache = { hash: stateHash, html };
  }
  }

  async loadSubviewState() {
    try {
      if (!window.electronAPI?.store?.get) return;
      const stored = (await window.electronAPI.store.get(
        ECHO_SUBVIEW_STATE_KEY,
      )) as EchoSubview | null;

      if (stored === 'builder' || stored === 'planner') {
        this.activeSubview = stored;
      }
    } catch (error) {
      this.activeSubview = 'planner';
    }
  }

  async saveSubviewState() {
    try {
      if (!window.electronAPI?.store?.set) return;
      await window.electronAPI.store.set(ECHO_SUBVIEW_STATE_KEY, this.activeSubview);
    } catch (error) {
      console.warn('Failed to persist Echo subview state:', error);
    }
  }

  applySubviewState() {
    const builderView = document.querySelector<HTMLElement>('#echo-builder-view');
    const plannerView = document.querySelector<HTMLElement>('#echo-planner-view');
    const builderBtn = document.querySelector<HTMLElement>('#echo-view-builder-btn');
    const plannerBtn = document.querySelector<HTMLElement>('#echo-view-planner-btn');

    const isBuilder = this.activeSubview === 'builder';

    builderView?.classList.toggle('active', isBuilder);
    plannerView?.classList.toggle('active', !isBuilder);
    builderBtn?.classList.toggle('active', isBuilder);
    plannerBtn?.classList.toggle('active', !isBuilder);
  }

  async setActiveSubview(view: EchoSubview) {
    if (view === this.activeSubview) {
      this.applySubviewState();
      return;
    }

    this.activeSubview = view;
    this.applySubviewState();
    if (view === 'planner') {
      await this.refreshVisualPlanner();
    } else {
      this.closeCharacterQuickMenu();
      const selectedMod = this.getSelectedMod();
      const showBuilderResults = Boolean(
        selectedMod && this.builderCompletedModPath === selectedMod.path,
      );
      this.setBuilderResultsVisible(showBuilderResults);
    }
    await this.saveSubviewState();
  }

  setStepState(stepId: string, state: 'pending' | 'active' | 'complete') {
    const step = document.querySelector<HTMLElement>(`#${stepId}`);
    if (!step) return;

    step.classList.remove('is-pending', 'is-active', 'is-complete');
    step.classList.add(`is-${state}`);
  }

  updateStepProgress(hasMod: boolean, hasAnalysis: boolean) {
    if (!hasMod) {
      this.setStepState('echo-step-select', 'active');
      this.setStepState('echo-step-review', 'pending');
      this.setStepState('echo-step-apply', 'pending');
      return;
    }

    this.setStepState('echo-step-select', 'complete');

    if (!hasAnalysis) {
      this.setStepState('echo-step-review', 'active');
      this.setStepState('echo-step-apply', 'pending');
      return;
    }

    this.setStepState('echo-step-review', 'complete');
    this.setStepState('echo-step-apply', 'active');
  }

  setupEventListeners() {
    const refreshBtn = document.querySelector<HTMLElement>('#echo-refresh-btn');
    if (refreshBtn) {
      const newRefreshBtn = refreshBtn.cloneNode(true) as HTMLElement;
      refreshBtn.parentNode?.replaceChild(newRefreshBtn, refreshBtn);
      newRefreshBtn.addEventListener('click', () => this.refresh());
    }

    const builderSelect = document.querySelector<HTMLSelectElement>(
      '#echo-builder-mod-select',
    );
    if (builderSelect) {
      const nextBuilderSelect = builderSelect.cloneNode(true) as HTMLSelectElement;
      builderSelect.parentNode?.replaceChild(nextBuilderSelect, builderSelect);
      nextBuilderSelect.addEventListener('change', async () => {
        const nextPath = nextBuilderSelect.value || null;
        this.selectedEchoModPath = nextPath;
        this.builderCompletedModPath = null;
        this.setBuilderResultsVisible(false);

        const selectedMod = this.getSelectedMod();
        this.updateSelectedModView(selectedMod);

        if (selectedMod && window.modManager) {
          await window.modManager.selectMod(selectedMod.id, true);
        }
      });
    }

    const builderStartBtn = document.querySelector<HTMLElement>(
      '#echo-builder-start-btn',
    );
    if (builderStartBtn) {
      const nextBuilderStartBtn = builderStartBtn.cloneNode(true) as HTMLElement;
      builderStartBtn.parentNode?.replaceChild(nextBuilderStartBtn, builderStartBtn);
      nextBuilderStartBtn.addEventListener('click', () => this.launchBuilderEchoFlow());
    }

    const builderClearBtn = document.querySelector<HTMLElement>('#echo-builder-clear-btn');
    if (builderClearBtn) {
      const nextBuilderClearBtn = builderClearBtn.cloneNode(true) as HTMLElement;
      builderClearBtn.parentNode?.replaceChild(nextBuilderClearBtn, builderClearBtn);
      nextBuilderClearBtn.addEventListener('click', () => this.clearBuilderFlowState());
    }

    const visualRefreshBtn = document.querySelector<HTMLElement>(
      '#echo-visual-refresh-btn',
    );
    if (visualRefreshBtn) {
      const newVisualRefreshBtn = visualRefreshBtn.cloneNode(true) as HTMLElement;
      visualRefreshBtn.parentNode?.replaceChild(newVisualRefreshBtn, visualRefreshBtn);
      newVisualRefreshBtn.addEventListener('click', () => this.refreshVisualPlanner());
    }

    const visualSaveBtn = document.querySelector<HTMLElement>('#echo-visual-save-btn');
    if (visualSaveBtn) {
      const newVisualSaveBtn = visualSaveBtn.cloneNode(true) as HTMLElement;
      visualSaveBtn.parentNode?.replaceChild(newVisualSaveBtn, visualSaveBtn);
      newVisualSaveBtn.addEventListener('click', () => this.saveVisualPlannerState(true));
    }

    const visualApplyBtn = document.querySelector<HTMLElement>(
      '#echo-visual-apply-btn',
    );
    if (visualApplyBtn) {
      const newVisualApplyBtn = visualApplyBtn.cloneNode(true) as HTMLElement;
      visualApplyBtn.parentNode?.replaceChild(newVisualApplyBtn, visualApplyBtn);
      newVisualApplyBtn.addEventListener('click', () => {
        this.applyVisualPlannerToSelectedMod();
      });
    }

    const visualCreateBtn = document.querySelector<HTMLElement>(
      '#echo-visual-create-btn',
    );
    if (visualCreateBtn) {
      const newVisualCreateBtn = visualCreateBtn.cloneNode(true) as HTMLElement;
      visualCreateBtn.parentNode?.replaceChild(newVisualCreateBtn, visualCreateBtn);
      newVisualCreateBtn.addEventListener('click', () => {
        this.createEchoDraftFromVisualSelection();
      });
    }

    const openSaveDirBtn = document.querySelector<HTMLElement>(
      '#echo-open-save-dir-btn',
    );
    if (openSaveDirBtn) {
      const newOpenSaveDirBtn = openSaveDirBtn.cloneNode(true) as HTMLElement;
      openSaveDirBtn.parentNode?.replaceChild(newOpenSaveDirBtn, openSaveDirBtn);
      newOpenSaveDirBtn.addEventListener('click', async () => {
        const mod = this.getSelectedMod();
        const targetPath = this.resolveLayoutTargetModPath(mod) || mod?.path || null;

        if (!targetPath) {
          window.toastManager?.warning('echo.noSelectedMod');
          return;
        }

        const result = await window.electronAPI.openFolder(targetPath);
        if (!result?.success) {
          window.toastManager?.error('toasts.failedToOpenFolder');
        }
      });
    }

    const builderViewBtn = document.querySelector<HTMLElement>(
      '#echo-view-builder-btn',
    );
    if (builderViewBtn) {
      const newBuilderViewBtn = builderViewBtn.cloneNode(true) as HTMLElement;
      builderViewBtn.parentNode?.replaceChild(newBuilderViewBtn, builderViewBtn);
      newBuilderViewBtn.addEventListener('click', () => {
        this.setActiveSubview('builder');
      });
    }

    const plannerViewBtn = document.querySelector<HTMLElement>(
      '#echo-view-planner-btn',
    );
    if (plannerViewBtn) {
      const newPlannerViewBtn = plannerViewBtn.cloneNode(true) as HTMLElement;
      plannerViewBtn.parentNode?.replaceChild(newPlannerViewBtn, plannerViewBtn);
      newPlannerViewBtn.addEventListener('click', () => {
        this.setActiveSubview('planner');
      });
    }

    const characterMenuClose = document.querySelector<HTMLElement>(
      '#echo-character-menu-close',
    );
    if (characterMenuClose) {
      const newCharacterMenuClose = characterMenuClose.cloneNode(true) as HTMLElement;
      characterMenuClose.parentNode?.replaceChild(
        newCharacterMenuClose,
        characterMenuClose,
      );
      newCharacterMenuClose.addEventListener('click', () => {
        this.closeCharacterQuickMenu();
      });
    }

    const characterMenuBackdrop = document.querySelector<HTMLElement>(
      '#echo-character-menu',
    );
    if (characterMenuBackdrop) {
      characterMenuBackdrop.addEventListener('click', (event) => {
        if (event.target === characterMenuBackdrop) {
          this.closeCharacterQuickMenu();
        }
      });
    }

    const wizardClose = document.querySelector<HTMLElement>('#echo-wizard-close');
    if (wizardClose) {
      const nextWizardClose = wizardClose.cloneNode(true) as HTMLElement;
      wizardClose.parentNode?.replaceChild(nextWizardClose, wizardClose);
      nextWizardClose.addEventListener('click', () => this.closeEchoWizard());
    }

    // Intentionally do not close the Echo wizard when clicking the backdrop.
    // This flow should only close through the explicit close button.

    const wizardBack = document.querySelector<HTMLElement>('#echo-wizard-back-btn');
    if (wizardBack) {
      const nextWizardBack = wizardBack.cloneNode(true) as HTMLElement;
      wizardBack.parentNode?.replaceChild(nextWizardBack, wizardBack);
      nextWizardBack.addEventListener('click', () => {
        this.setEchoWizardStep(this.echoWizardStep - 1);
      });
    }

    const wizardNext = document.querySelector<HTMLElement>('#echo-wizard-next-btn');
    if (wizardNext) {
      const nextWizardNext = wizardNext.cloneNode(true) as HTMLElement;
      wizardNext.parentNode?.replaceChild(nextWizardNext, wizardNext);
      nextWizardNext.addEventListener('click', () => {
        this.syncEchoWizardInputs();
        this.setEchoWizardStep(this.echoWizardStep + 1);
      });
    }

    const wizardCreate = document.querySelector<HTMLElement>(
      '#echo-wizard-create-btn',
    );
    if (wizardCreate) {
      const nextWizardCreate = wizardCreate.cloneNode(true) as HTMLElement;
      wizardCreate.parentNode?.replaceChild(nextWizardCreate, wizardCreate);
      nextWizardCreate.addEventListener('click', async () => {
        await this.confirmEchoWizardCreate();
      });
    }
  }

  getAllMods(): Mod[] {
    const mods = window.modManager?.mods || [];
    return [...mods]
      .filter((mod) =>
        this.modEligibilityByPath.has(mod.path)
          ? this.modEligibilityByPath.get(mod.path) === true
          : this.isEligibleFighterMod(mod),
      )
      .sort((a, b) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      if (a.status === 'active') return -1;
      if (b.status === 'active') return 1;
      return a.name.localeCompare(b.name);
      });
  }

  isEligibleFighterMod(mod: Mod): boolean {
    const category = (mod.category || '').toLowerCase().trim();
    const name = (mod.name || '').toLowerCase();

    if (category === 'moveset' || category === 'movesets') {
      return false;
    }

    if (name.includes('moveset')) {
      return false;
    }

    if (category === 'fighter' || category === 'fighters' || category === 'skin' || category === 'skins') {
      return true;
    }

    return false;
  }

  async refreshModEligibility() {
    const mods = window.modManager?.mods || [];

    if (!window.electronAPI?.echoClassifyMod) {
      this.modEligibilityByPath.clear();
      return;
    }

    const classificationResults = await Promise.all(
      mods.map(async (mod) => {
        try {
          const response = await window.electronAPI.echoClassifyMod(mod.path);
          const eligible = Boolean(response?.success && response?.isEligible);
          return [mod.path, eligible] as const;
        } catch (error) {
          return [mod.path, this.isEligibleFighterMod(mod)] as const;
        }
      }),
    );

    this.modEligibilityByPath = new Map(classificationResults);
  }

  normalizeName(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10);
  }

  sanitizeEchoDisplayName(value: string): string {
    return `${value || ''}`
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 32);
  }

  sanitizeEchoIntroName(value: string): string {
    return this.sanitizeEchoDisplayName(value);
  }

  formatEchoDisplayNameFromId(token: string): string {
    if (!token) {
      return '';
    }

    return token.charAt(0).toUpperCase() + token.slice(1);
  }

  getEchoNameValue(): string {
    const input = document.querySelector<HTMLInputElement>('#echo-new-name-input');
    if (input) {
      const normalized = this.normalizeName(input.value || '');
      this.echoPreferredNameValue = normalized;
      return normalized;
    }

    this.echoPreferredNameValue = this.normalizeName(this.echoPreferredNameValue || '');
    return this.echoPreferredNameValue;
  }

  getEchoDisplayNameValue(): string {
    const input = document.querySelector<HTMLInputElement>(
      '#echo-ui-display-name-input',
    );

    if (input) {
      const sanitizedValue = this.sanitizeEchoDisplayName(input.value || '');
      if (input.value !== sanitizedValue) {
        input.value = sanitizedValue;
      }
      this.echoPreferredDisplayNameValue = sanitizedValue;

      if (sanitizedValue) {
        return sanitizedValue;
      }
    }

    const storedValue = this.sanitizeEchoDisplayName(
      this.echoPreferredDisplayNameValue || '',
    );
    this.echoPreferredDisplayNameValue = storedValue;
    if (storedValue) {
      return storedValue;
    }

    return this.formatEchoDisplayNameFromId(this.getEchoNameValue());
  }

  setEchoNameValue(value: string) {
    this.echoPreferredNameValue = this.normalizeName(value);
    const input = document.querySelector<HTMLInputElement>('#echo-new-name-input');
    if (input) {
      input.value = this.echoPreferredNameValue;
    }

    this.updateNameConflictView();
    this.syncEchoDisplayNameFromId();
  }

  setEchoDisplayNameValue(value: string) {
    this.echoPreferredDisplayNameValue = this.sanitizeEchoDisplayName(value);
    const input = document.querySelector<HTMLInputElement>(
      '#echo-ui-display-name-input',
    );

    if (!input) return;
    input.value = this.echoPreferredDisplayNameValue;
  }

  syncEchoDisplayNameFromId() {
    const input = document.querySelector<HTMLInputElement>(
      '#echo-ui-display-name-input',
    );

    if (!input) {
      if (!this.echoPreferredDisplayNameValue) {
        this.echoPreferredDisplayNameValue = this.formatEchoDisplayNameFromId(
          this.getEchoNameValue(),
        );
      }
      return;
    }

    const currentDisplayName = this.sanitizeEchoDisplayName(input.value);
    if (currentDisplayName.length > 0) {
      if (input.value !== currentDisplayName) {
        input.value = currentDisplayName;
      }
      return;
    }

    const fallbackDisplayName = this.formatEchoDisplayNameFromId(
      this.getEchoNameValue(),
    );
    if (fallbackDisplayName) {
      input.value = fallbackDisplayName;
      this.echoPreferredDisplayNameValue = fallbackDisplayName;
    }
  }

  getNameConflicts(name: string): EchoTakenName[] {
    const normalizedTarget = this.normalizeName(name);
    if (!normalizedTarget) return [];

    return this.takenNames.filter(
      (entry) => this.normalizeName(entry.name) === normalizedTarget,
    );
  }

  updateNameConflictView() {
    const conflictEl = document.querySelector<HTMLElement>('#echo-name-conflict');
    if (!conflictEl) return;

    const echoName = this.getEchoNameValue();
    const input = document.querySelector<HTMLInputElement>('#echo-new-name-input');
    if (input && input.value !== echoName) {
      input.value = echoName;
    }

    const conflicts = this.getNameConflicts(echoName);

    if (!echoName || conflicts.length === 0) {
      conflictEl.style.display = 'none';
      conflictEl.textContent = '';
      return;
    }

    const modList = Array.from(new Set(conflicts.map((entry) => entry.modName))).join(', ');
    conflictEl.style.display = 'block';
    conflictEl.textContent = this.t('echo.nameConflict', { mods: modList });
  }

  renderNameSuggestions() {
    const container = document.querySelector<HTMLElement>('#echo-name-suggestions');
    if (!container) return;

    container.innerHTML = '';

    const visibleSuggestions = this.nameSuggestions.slice(0, 8);

    visibleSuggestions.forEach((suggestion) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'echo-name-suggestion';
      button.textContent = suggestion;

      button.addEventListener('click', () => {
        this.setEchoNameValue(suggestion);
      });

      container.appendChild(button);
    });
  }

  renderModPicker(searchQuery = '') {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const allMods = this.getAllMods();

    const filteredMods = allMods.filter((mod) =>
      mod.name.toLowerCase().includes(normalizedQuery),
    );

    const builderSelect = document.querySelector<HTMLSelectElement>(
      '#echo-builder-mod-select',
    );

    if (builderSelect) {
      builderSelect.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = this.t('echo.builderSelectPlaceholder');
      builderSelect.appendChild(placeholder);

      filteredMods.forEach((mod) => {
        const option = document.createElement('option');
        option.value = mod.path;
        option.textContent = mod.name;
        if (mod.path === this.selectedEchoModPath) {
          option.selected = true;
        }
        builderSelect.appendChild(option);
      });

      builderSelect.disabled = filteredMods.length === 0;
    }

    const modList = document.querySelector<HTMLElement>('#echo-mod-list');
    if (!modList) return;

    modList.innerHTML = '';

    if (filteredMods.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'echo-empty';
      empty.textContent = this.t('echo.noModsAvailable');
      modList.appendChild(empty);
      return;
    }

    filteredMods.forEach((mod) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'echo-mod-item';

      if (mod.path === this.selectedEchoModPath) {
        item.classList.add('active');
      }

      const title = document.createElement('p');
      title.className = 'echo-mod-item-title';
      title.textContent = mod.name;

      const meta = document.createElement('p');
      meta.className = 'echo-mod-item-meta';
      meta.textContent = mod.status === 'active' ? this.t('echo.modStatusActive') : this.t('echo.modStatusDisabled');

      item.appendChild(title);
      item.appendChild(meta);

      item.addEventListener('click', async () => {
        this.selectedEchoModPath = mod.path;
        this.renderModPicker(
          document.querySelector<HTMLInputElement>('#echo-mod-search')?.value || '',
        );

        if (window.modManager) {
          await window.modManager.selectMod(mod.id, true);
        }

        this.updateSelectedModView(mod);
        await this.loadSelectedModAnalysis(mod);
      });

      modList.appendChild(item);
    });
  }

  setBuilderResultsVisible(visible: boolean) {
    const container = document.querySelector<HTMLElement>('#echo-builder-results');
    if (!container) return;
    container.style.display = visible ? 'block' : 'none';
  }

  clearBuilderFlowState() {
    const builderSelect = document.querySelector<HTMLSelectElement>(
      '#echo-builder-mod-select',
    );

    if (builderSelect) {
      builderSelect.value = '';
    }

    this.selectedEchoModPath = null;
    this.builderCompletedModPath = null;
    this.echoPreferredNameValue = '';
    this.echoPreferredDisplayNameValue = '';
    this.echoPreferredIntroName = '';

    this.setBuilderResultsVisible(false);
    this.renderModPicker();
    this.clearAnalysis();
    this.updateSelectedModView(null);
  }

  getSelectedMod(): Mod | null {
    const allMods = this.getAllMods();

    if (this.selectedEchoModPath) {
      const fromPicker = allMods.find((mod) => mod.path === this.selectedEchoModPath);
      if (fromPicker) return fromPicker;
    }

    const selectedFromTools = window.modManager?.selectedMod || null;
    if (selectedFromTools?.path && this.isEligibleFighterMod(selectedFromTools)) {
      this.selectedEchoModPath = selectedFromTools.path;
      return selectedFromTools;
    }

    return null;
  }

  updateSelectedModView(mod: Mod | null) {
    const selectedModEls = document.querySelectorAll<HTMLElement>(
      '[data-echo-selected-mod]',
    );
    if (selectedModEls.length === 0) return;

    if (!mod) {
      selectedModEls.forEach((el) => {
        el.textContent = this.t('echo.noSelectedMod');
      });
      this.updateStepProgress(false, false);
      return;
    }

    selectedModEls.forEach((el) => {
      el.textContent = this.t('echo.selectedMod', { name: mod.name });
    });
    this.updateStepProgress(true, false);
  }

  getCategoryPlan(
    key: UiCompatibilityCategory,
  ): EchoUiCompatibilityCategoryPlan | null {
    if (!this.uiCompatibilityPlan) return null;

    return (
      this.uiCompatibilityPlan.categories.find((category) => category.key === key) ||
      null
    );
  }

  getCandidateNameByPath(pathValue: string): string {
    if (!pathValue || !this.uiCompatibilityPlan) {
      return this.t('echo.compatibilityUnknownTarget');
    }

    const candidate = this.uiCompatibilityPlan.candidates.find(
      (entry) => entry.path === pathValue,
    );

    return candidate?.name || pathValue;
  }

  resolveDefaultSlotsModPath(): string | null {
    const allMods = window.modManager?.mods || [];

    const namedCandidate = allMods.find((mod) => {
      const modName = (mod.name || '').toLowerCase();
      const baseName = (mod.path || '').replace(/\\/g, '/').split('/').pop() || '';
      const normalizedBaseName = baseName.toLowerCase();

      return (
        modName.includes('css 91-255 slots') ||
        normalizedBaseName.includes('css 91-255 slots')
      );
    });

    if (namedCandidate?.path) {
      return namedCandidate.path;
    }

    const signatureCandidate = allMods.find((mod) => {
      const normalizedPath = (mod.path || '').replace(/\\/g, '/').toLowerCase();
      return normalizedPath.includes('/mods/[ui] css 91-255 slots');
    });

    return signatureCandidate?.path || null;
  }

  initializeCompatibilityState(mod: Mod, plan: EchoUiCompatibilityPlan) {
    const slotExpansionPlan =
      plan.categories.find((category) => category.key === 'slotExpansionData') ||
      null;
    const cssLayoutPlan =
      plan.categories.find((category) => category.key === 'cssLayout') || null;
    const menuParamsPlan =
      plan.categories.find((category) => category.key === 'menuParams') || null;

    this.uiCompatibilityState = {
      slotExpansionData: slotExpansionPlan?.defaultEnabled ?? true,
      cssLayout: cssLayoutPlan?.defaultEnabled ?? false,
      menuParams: menuParamsPlan?.defaultEnabled ?? false,
      slotTargetPath:
        slotExpansionPlan?.defaultTargetPath ||
        plan.recommendedTargets.slotExpansionTargetPath ||
        mod.path,
      uiSourcePath:
        plan.recommendedTargets.uiThemeSourcePath ||
        cssLayoutPlan?.defaultSourcePath ||
        menuParamsPlan?.defaultSourcePath ||
        '',
      uiTargetPath:
        plan.recommendedTargets.uiMergeTargetPath ||
        cssLayoutPlan?.defaultTargetPath ||
        menuParamsPlan?.defaultTargetPath ||
        plan.recommendedTargets.slotExpansionTargetPath ||
        mod.path,
      autoSkipConflicts: true,
    };
  }

  renderCompatibilityPlanner(mod: Mod | null, plan: EchoUiCompatibilityPlan | null) {
    const container = document.querySelector<HTMLElement>(
      '#echo-compatibility-content',
    );

    if (!container) return;

    if (!mod || !plan) {
      this.uiCompatibilityPlan = null;
      this.uiCompatibilityState = null;
      container.innerHTML = `<p class="echo-empty">${this.t('echo.compatibilityPlaceholder')}</p>`;
      return;
    }

    const previousModPath = this.uiCompatibilityPlan?.selectedModPath;
    this.uiCompatibilityPlan = plan;

    if (!this.uiCompatibilityState || previousModPath !== plan.selectedModPath) {
      this.initializeCompatibilityState(mod, plan);
    }

    const state = this.uiCompatibilityState;

    if (!state) return;

    if (!plan.candidates || plan.candidates.length === 0) {
      container.innerHTML = `
        <p class="echo-empty">${this.escapeHtml(this.t('echo.compatibilityPlaceholder'))}</p>
        <ul class="echo-compat-notes">
          ${plan.notes.map((note) => `<li>${this.escapeHtml(note)}</li>`).join('')}
        </ul>
      `;
      return;
    }

    const profileLabel =
      plan.profile === 'expanded-slots-theme-split'
        ? this.t('echo.compatibilityProfileSplit')
        : this.t('echo.compatibilityProfileSingle');

    const hasUiSource = Boolean(state.uiSourcePath);

    const renderCandidateOptions = (
      selectedPath: string,
      includeNone: boolean,
    ) => {
      const options: string[] = [];

      if (includeNone) {
        options.push(
          `<option value="">${this.escapeHtml(this.t('echo.compatibilityNone'))}</option>`,
        );
      }

      for (const candidate of plan.candidates) {
        const isSelected = candidate.path === selectedPath;
        const statusLabel =
          candidate.status === 'active'
            ? this.t('echo.modStatusActive')
            : this.t('echo.modStatusDisabled');
        options.push(
          `<option value="${this.escapeHtml(candidate.path)}" ${isSelected ? 'selected' : ''}>${this.escapeHtml(candidate.name)} (${this.escapeHtml(statusLabel)})</option>`,
        );
      }

      return options.join('');
    };

    container.innerHTML = `
      <div class="echo-compat-profile">
        <i class="bi bi-diagram-3"></i>
        <span>${this.escapeHtml(profileLabel)}</span>
      </div>

      <div class="echo-compat-top-row">
        <div class="echo-compat-control">
          <p class="echo-compat-control-label">${this.t('echo.compatibilitySlotTargetLabel')}</p>
          <select class="echo-compat-select" id="echo-compat-slot-target">
            ${renderCandidateOptions(state.slotTargetPath, false)}
          </select>
        </div>
        <div class="echo-compat-control">
          <p class="echo-compat-control-label">${this.t('echo.compatibilityUiSourceLabel')}</p>
          <select class="echo-compat-select" id="echo-compat-ui-source">
            ${renderCandidateOptions(state.uiSourcePath, true)}
          </select>
        </div>
        <div class="echo-compat-control">
          <p class="echo-compat-control-label">${this.t('echo.compatibilityUiTargetLabel')}</p>
          <select class="echo-compat-select" id="echo-compat-ui-target">
            ${renderCandidateOptions(state.uiTargetPath, false)}
          </select>
        </div>
      </div>

      <div class="echo-compatibility-grid">
        <div class="echo-compat-card">
          <div class="echo-compat-card-header">
            <h4 class="echo-compat-card-title">${this.t('echo.categorySlotExpansionTitle')}</h4>
            <input id="echo-cat-slot-expansion" type="checkbox" ${state.slotExpansionData ? 'checked' : ''} />
          </div>
          <p class="echo-compat-card-desc">${this.t('echo.categorySlotExpansionDesc')}</p>
        </div>
        <div class="echo-compat-card">
          <div class="echo-compat-card-header">
            <h4 class="echo-compat-card-title">${this.t('echo.categoryCssLayoutTitle')}</h4>
            <input id="echo-cat-css-layout" type="checkbox" ${state.cssLayout ? 'checked' : ''} ${hasUiSource ? '' : 'disabled'} />
          </div>
          <p class="echo-compat-card-desc">${this.t('echo.categoryCssLayoutDesc')}</p>
        </div>
        <div class="echo-compat-card">
          <div class="echo-compat-card-header">
            <h4 class="echo-compat-card-title">${this.t('echo.categoryMenuParamsTitle')}</h4>
            <input id="echo-cat-menu-params" type="checkbox" ${state.menuParams ? 'checked' : ''} ${hasUiSource ? '' : 'disabled'} />
          </div>
          <p class="echo-compat-card-desc">${this.t('echo.categoryMenuParamsDesc')}</p>
        </div>
      </div>

      <label class="echo-compat-auto-skip" for="echo-compat-auto-skip">
        <input id="echo-compat-auto-skip" type="checkbox" ${state.autoSkipConflicts ? 'checked' : ''} />
        <span>${this.t('echo.compatibilityAutoSkip')}</span>
      </label>

      <p class="echo-section-hint" id="echo-compat-summary"></p>
      <ul class="echo-compat-notes">
        ${plan.notes.map((note) => `<li>${this.escapeHtml(note)}</li>`).join('')}
      </ul>
    `;

    this.bindCompatibilityControls(mod);
    this.updateCompatibilitySummary();
  }

  bindCompatibilityControls(mod: Mod) {
    const slotTarget = document.querySelector<HTMLSelectElement>(
      '#echo-compat-slot-target',
    );
    const uiSource = document.querySelector<HTMLSelectElement>(
      '#echo-compat-ui-source',
    );
    const uiTarget = document.querySelector<HTMLSelectElement>(
      '#echo-compat-ui-target',
    );
    const slotCategory = document.querySelector<HTMLInputElement>(
      '#echo-cat-slot-expansion',
    );
    const cssCategory = document.querySelector<HTMLInputElement>(
      '#echo-cat-css-layout',
    );
    const menuCategory = document.querySelector<HTMLInputElement>(
      '#echo-cat-menu-params',
    );
    const autoSkip = document.querySelector<HTMLInputElement>(
      '#echo-compat-auto-skip',
    );

    const updateFromControls = () => {
      if (!this.uiCompatibilityState) return;

      this.uiCompatibilityState.slotTargetPath =
        slotTarget?.value || this.uiCompatibilityState.slotTargetPath || mod.path;
      this.uiCompatibilityState.uiSourcePath =
        uiSource?.value || this.uiCompatibilityState.uiSourcePath || '';
      this.uiCompatibilityState.uiTargetPath =
        uiTarget?.value || this.uiCompatibilityState.uiTargetPath || mod.path;
      this.uiCompatibilityState.autoSkipConflicts = autoSkip?.checked ?? true;

      const hasUiSource = Boolean(this.uiCompatibilityState.uiSourcePath);

      if (cssCategory) {
        cssCategory.disabled = !hasUiSource;
      }

      if (menuCategory) {
        menuCategory.disabled = !hasUiSource;
      }

      this.uiCompatibilityState.slotExpansionData = slotCategory?.checked ?? true;
      this.uiCompatibilityState.cssLayout = hasUiSource && (cssCategory?.checked ?? false);
      this.uiCompatibilityState.menuParams = hasUiSource && (menuCategory?.checked ?? false);

      if (cssCategory && !hasUiSource) cssCategory.checked = false;
      if (menuCategory && !hasUiSource) menuCategory.checked = false;

      this.updateCompatibilitySummary();
    };

    [
      slotTarget,
      uiSource,
      uiTarget,
      slotCategory,
      cssCategory,
      menuCategory,
      autoSkip,
    ].forEach((control) => {
      control?.addEventListener('change', updateFromControls);
    });
  }

  updateCompatibilitySummary() {
    const summary = document.querySelector<HTMLElement>('#echo-compat-summary');
    if (!summary || !this.uiCompatibilityState) return;

    const categories: string[] = [];

    if (this.uiCompatibilityState.slotExpansionData) {
      categories.push(this.t('echo.categorySlotExpansionTitle'));
    }

    if (this.uiCompatibilityState.cssLayout) {
      categories.push(this.t('echo.categoryCssLayoutTitle'));
    }

    if (this.uiCompatibilityState.menuParams) {
      categories.push(this.t('echo.categoryMenuParamsTitle'));
    }

    const categoryLabel =
      categories.length > 0
        ? categories.join(', ')
        : this.t('echo.compatibilityNone');

    const slotTargetName = this.getCandidateNameByPath(
      this.uiCompatibilityState.slotTargetPath,
    );

    summary.textContent = this.t('echo.compatibilitySummary', {
      categories: categoryLabel,
      slotTarget: slotTargetName,
    });
  }

  collectCompatibilityOptions(mod: Mod): Partial<EchoOperationOptions> {
    const sharedUiCompatOptions = window.uiCompatManager?.getCompatibilityOptions(
      mod.path,
    );

    if (sharedUiCompatOptions) {
      return sharedUiCompatOptions;
    }

    if (!this.uiCompatibilityState) {
      const defaultSlotsPath = this.resolveDefaultSlotsModPath() || mod.path;

      return {
        selectedCategories: ['slotExpansionData'],
        categoryOutputPaths: {
          slotExpansionData: defaultSlotsPath,
        },
        autoSkipConflictingCategories: true,
        uiOutputModPath: defaultSlotsPath,
      };
    }

    const state = this.uiCompatibilityState;
    const selectedCategories: UiCompatibilityCategory[] = [];

    if (state.slotExpansionData) {
      selectedCategories.push('slotExpansionData');
    }

    if (state.cssLayout && state.uiSourcePath) {
      selectedCategories.push('cssLayout');
    }

    if (state.menuParams && state.uiSourcePath) {
      selectedCategories.push('menuParams');
    }

    const categoryOutputPaths: NonNullable<
      EchoOperationOptions['categoryOutputPaths']
    > = {};
    const categorySourceModPaths: NonNullable<
      EchoOperationOptions['categorySourceModPaths']
    > = {};

    if (state.slotTargetPath) {
      categoryOutputPaths.slotExpansionData = state.slotTargetPath;
    }

    if (selectedCategories.includes('cssLayout')) {
      categoryOutputPaths.cssLayout = state.uiTargetPath || state.slotTargetPath;
      categorySourceModPaths.cssLayout = state.uiSourcePath;
    }

    if (selectedCategories.includes('menuParams')) {
      categoryOutputPaths.menuParams = state.uiTargetPath || state.slotTargetPath;
      categorySourceModPaths.menuParams = state.uiSourcePath;
    }

    return {
      selectedCategories,
      categoryOutputPaths,
      categorySourceModPaths,
      autoSkipConflictingCategories: state.autoSkipConflicts,
      uiCompatibilityProfile: this.uiCompatibilityPlan?.profile,
      uiOutputModPath: state.slotTargetPath || mod.path,
    };
  }

  getDefaultCharacterOrder(): string[] {
    return Object.keys(window.SSBU_CHARACTERS || {});
  }

  getCharacterInfoMap(): Record<
    string,
    { name: string; number: string; series: string }
  > {
    return (window.SSBU_CHARACTERS || {}) as Record<
      string,
      { name: string; number: string; series: string }
    >;
  }

  normalizeFighterKey(rawFighterId: string): string {
    if (!rawFighterId) return '';
    return window.resolveFolderName
      ? window.resolveFolderName(rawFighterId)
      : rawFighterId.toLowerCase();
  }

  hashString(input: string): number {
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  createEchoCardKey(baseFighterKey: string, modPath: string): string {
    return `echo:${baseFighterKey}:${this.hashString(modPath)}`;
  }

  isEchoCardKey(cardKey: string): boolean {
    return cardKey.startsWith('echo:');
  }

  findEchoCardKeyForModAndFighter(
    modPath: string,
    baseFighterKey: string,
  ): string | null {
    for (const [cardKey, entry] of this.visualCharactersByKey.entries()) {
      if (
        entry.cardKind === 'echo' &&
        entry.baseFighterKey === baseFighterKey &&
        entry.sourceModPath === modPath
      ) {
        return cardKey;
      }
    }

    return null;
  }

  isEchoModFromScan(scanData: {
    currentSlots?: string[];
    unknownFiles?: string[];
    pathData?: Record<
      string,
      Record<
        string,
        {
          pathsToBeModified?: { original: string }[];
          filesToBeModified?: { original: string }[];
        }
      >
    >;
  }): boolean {
    const hasHighSlots = (scanData.currentSlots || []).some((slot) => {
      if (!/^c\d{2,3}$/i.test(slot)) return false;
      return parseInt(slot.replace('c', ''), 10) > 7;
    });

    if (hasHighSlots) {
      return true;
    }

    const hasHighSlotInPathData = Object.values(scanData.pathData || {}).some(
      (fighterData) => {
        const slotKeys = Object.keys(fighterData || {});

        if (
          slotKeys.some(
            (slot) =>
              /^c\d{2,3}$/i.test(slot) && parseInt(slot.replace('c', ''), 10) > 7,
          )
        ) {
          return true;
        }

        return slotKeys.some((slot) => {
          const slotData = fighterData?.[slot] || {};
          const allPaths = [
            ...(slotData.pathsToBeModified || []),
            ...(slotData.filesToBeModified || []),
          ];

          return allPaths.some((entry) => {
            const slotMatch = `${entry.original || ''}`
              .replace(/\\/g, '/')
              .match(/(^|\/)c(\d{2,3})(\/|$)/i);

            if (!slotMatch) {
              return false;
            }

            return parseInt(slotMatch[2], 10) > 7;
          });
        });
      },
    );

    if (hasHighSlotInPathData) {
      return true;
    }

    return (scanData.unknownFiles || []).some((filePath) => {
      const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
      return (
        normalizedPath.endsWith('ui/message/msg_name.xmsbt') ||
        normalizedPath.endsWith('ui/param/database/ui_chara_db.prcxml') ||
        normalizedPath.endsWith('ui/message/msg_name.msbt') ||
        normalizedPath.endsWith('ui/param/database/ui_chara_db.prc')
      );
    });
  }

  async resolveCharacterImageUrl(fighterKey: string): Promise<string> {
    const cachedImage = this.visualCharacterImageCache.get(fighterKey);
    if (cachedImage) {
      return cachedImage;
    }

    const characterImages = (window.CHARACTER_IMAGES || {}) as Record<string, string>;
    const fallbackRemoteUrl = characterImages[fighterKey] || '';

    if (window.electronAPI?.echoResolveCharacterImage) {
      try {
        const resolvedUrl = await window.electronAPI.echoResolveCharacterImage(
          fighterKey,
          fallbackRemoteUrl,
        );

        if (resolvedUrl) {
          this.visualCharacterImageCache.set(fighterKey, resolvedUrl);
          return resolvedUrl;
        }
      } catch (error) {
        console.warn('Failed to resolve local character image', fighterKey, error);
      }
    }

    if (fallbackRemoteUrl) {
      this.visualCharacterImageCache.set(fighterKey, fallbackRemoteUrl);
      return fallbackRemoteUrl;
    }

    return '';
  }

  getVisualTileInitials(name: string): string {
    const words = (name || '').split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return '?';
    }

    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }

    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }

  preloadCharacterImages(urls: string[]) {
    const uniqueUrls = Array.from(new Set(urls.filter(Boolean))).filter(
      (url) => !this.visualImagePreloadSet.has(url),
    );

    if (uniqueUrls.length === 0) {
      return;
    }

    const queue = uniqueUrls.slice();
    const concurrency = 4;

    const loadNext = () => {
      const nextUrl = queue.shift();
      if (!nextUrl) {
        return;
      }

      this.visualImagePreloadSet.add(nextUrl);

      const img = new Image();
      img.loading = 'eager';
      img.decoding = 'async';
      img.src = nextUrl;

      if (typeof img.decode === 'function') {
        img.decode().catch(() => undefined);
      }

      img.onload = () => {
        loadNext();
      };

      img.onerror = () => {
        loadNext();
      };
    };

    for (let index = 0; index < concurrency; index += 1) {
      loadNext();
    }
  }

  resolveCharacterModPreview(entry: VisualCharacterEntry): string | null {
    const pickPreview = (mods: VisualModEntry[]) => {
      const activePreview = mods.find(
        (mod) => mod.status === 'active' && Boolean(mod.previewUrl),
      );
      if (activePreview?.previewUrl) {
        return activePreview.previewUrl;
      }

      const anyPreview = mods.find((mod) => Boolean(mod.previewUrl));
      return anyPreview?.previewUrl || null;
    };

    return (
      pickPreview(entry.echoMods) ||
      pickPreview(entry.fighterMods) ||
      pickPreview(entry.movesetMods)
    );
  }

  buildVisualModCacheKey(mod: Mod): string {
    return [mod.path || '', mod.name || '', mod.status || '', mod.hash || ''].join('|');
  }

  async scanVisualMod(mod: Mod): Promise<VisualModEntry | null> {
    if (!mod.path || !window.electronAPI?.scanMod) return null;

    const cacheKey = this.buildVisualModCacheKey(mod);
    const cached = this.visualModScanCache.get(mod.path);

    if (cached && cached.cacheKey === cacheKey) {
      return cached.entry;
    }

    try {
      const [scanResult, previewUrl] = await Promise.all([
        window.electronAPI.scanMod(mod.path),
        window.electronAPI.echoGetPreviewImage?.(mod.path),
      ]);

      if (!scanResult?.success) {
        this.visualModScanCache.set(mod.path, { cacheKey, entry: null });
        return null;
      }

      const fighterKeys = Array.from(
        new Set(
          (scanResult.data?.fighterNames || [])
            .map((rawName) => this.normalizeFighterKey(rawName))
            .filter((fighterKey) => Boolean(this.getCharacterInfoMap()[fighterKey])),
        ),
      );

      const isEcho = this.isEchoModFromScan(scanResult.data || {});
      const type = this.classifyVisualModType(mod, isEcho);

      const entry: VisualModEntry = {
        id: `${mod.path}:${type}`,
        name: mod.name,
        path: mod.path,
        status: mod.status,
        type,
        fighterKeys,
        previewUrl: previewUrl || null,
      };

      this.visualModScanCache.set(mod.path, { cacheKey, entry });
      return entry;
    } catch (error) {
      console.warn(`Failed to scan mod for visual planner: ${mod.name}`, error);
      this.visualModScanCache.set(mod.path, { cacheKey, entry: null });
      return null;
    }
  }

  getInspectorFieldValue(hash: string): string {
    if (!this.uiCharaInspectorData?.fields) {
      return '-';
    }

    const value = this.uiCharaInspectorData.fields[hash];
    return this.formatInspectorValue(value);
  }

  formatInspectorValue(value?: string | null): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return '-';
    }

    return value;
  }

  getVisualSlotLabel(cardKey: string | null): string | null {
    if (!cardKey) {
      return null;
    }

    const slotIndex = this.visualCharacterOrder.indexOf(cardKey);
    if (slotIndex < 0) {
      return null;
    }

    return `c${String(slotIndex).padStart(2, '0')}`;
  }

  getSelectedVisualSlotLabel(): string | null {
    return this.getVisualSlotLabel(this.visualSelectedCharacter);
  }

  getInspectorNameOptions(): EchoUiNameOption[] {
    const options = this.uiCharaInspectorData?.nameOptions || [];
    return [...options].sort((a, b) => a.slot.localeCompare(b.slot));
  }

  getSelectedInspectorNameOption(): EchoUiNameOption | null {
    const options = this.getInspectorNameOptions();
    if (options.length === 0) {
      return null;
    }

    const selectedSlot = this.getSelectedVisualSlotLabel();
    if (!selectedSlot) {
      return options[0];
    }

    return options.find((option) => option.slot === selectedSlot) || options[0];
  }

  shouldUseEchoDuplicateFlow(
    mod: Mod | null,
    selectedEntry: VisualCharacterEntry | null = null,
  ): boolean {
    if (
      selectedEntry &&
      mod?.path &&
      selectedEntry.movesetMods.some((movesetMod) => movesetMod.path === mod.path)
    ) {
      return true;
    }

    const modCategory = (mod?.category || '').toLowerCase();
    const modName = (mod?.name || '').toLowerCase();

    if (
      modCategory === 'moveset' ||
      modCategory === 'movesets' ||
      modName.includes('moveset')
    ) {
      return true;
    }

    if (selectedEntry?.cardKind === 'echo') {
      return true;
    }

    if (this.isEchoFighter) {
      return true;
    }

    const preferredToken = this.normalizeName(this.getEchoNameValue());
    if (!preferredToken) {
      return false;
    }

    if (this.activeSubview === 'builder') {
      return true;
    }

    const selectedModToken = this.normalizeName(mod?.name || '');
    return Boolean(selectedModToken && selectedModToken !== preferredToken);
  }

  async refreshUiCharaInspector() {
    const selectedEntry = this.getSelectedVisualEntry();

    if (!selectedEntry) {
      this.uiCharaInspectorLoading = false;
      this.uiCharaInspectorData = null;
      this.uiCharaInspectorError = null;
      return;
    }

    const selectedMod = this.getSelectedMod();
    const layoutTargetPath = this.resolveLayoutTargetModPath(selectedMod);
    const fighterName = selectedEntry.baseFighterKey || selectedEntry.fighterKey;

    if (!layoutTargetPath || !window.electronAPI?.echoReadUiCharaStruct) {
      this.uiCharaInspectorLoading = false;
      this.uiCharaInspectorData = null;
      this.uiCharaInspectorError = this.t('echo.inspectorUnavailable');
      return;
    }

    this.uiCharaInspectorLoading = true;
    this.uiCharaInspectorError = null;

    try {
      const result = (await window.electronAPI.echoReadUiCharaStruct(
        layoutTargetPath,
        fighterName,
      )) as EchoUiCharaInspectorData | null;

      if (!result) {
        this.uiCharaInspectorData = null;
        this.uiCharaInspectorError = this.t('echo.inspectorNoData');
      } else {
        this.uiCharaInspectorData = result;
        this.uiCharaInspectorError = null;
      }
    } catch (error) {
      this.uiCharaInspectorData = null;
      this.uiCharaInspectorError = this.t('echo.inspectorFailed');
    } finally {
      this.uiCharaInspectorLoading = false;
    }
  }

  classifyVisualModType(mod: Mod, isEchoMod: boolean): VisualModType {
    const category = (mod.category || '').toLowerCase();
    const modName = (mod.name || '').toLowerCase();

    if (
      category === 'moveset' ||
      category === 'movesets' ||
      modName.includes('moveset')
    ) {
      return 'moveset';
    }

    if (isEchoMod) {
      return 'echo';
    }

    return 'fighter';
  }

  ensureVisualCharacterOrder(availableKeys?: string[]) {
    const defaultOrder = this.getDefaultCharacterOrder();
    const allowedKeys = new Set(availableKeys || defaultOrder);

    const dynamicKeys = (availableKeys || []).filter(
      (key) => !defaultOrder.includes(key),
    );

    const dynamicByBaseFighter = new Map<string, string[]>();
    const orphanDynamicKeys: string[] = [];

    for (const dynamicKey of dynamicKeys) {
      const entry = this.visualCharactersByKey.get(dynamicKey);
      const baseFighterKey = entry?.baseFighterKey;

      if (!baseFighterKey || !defaultOrder.includes(baseFighterKey)) {
        orphanDynamicKeys.push(dynamicKey);
        continue;
      }

      if (!dynamicByBaseFighter.has(baseFighterKey)) {
        dynamicByBaseFighter.set(baseFighterKey, []);
      }

      dynamicByBaseFighter.get(baseFighterKey)?.push(dynamicKey);
    }

    const sortDynamicCards = (keys: string[]) => {
      keys.sort((a, b) => {
        const aName = this.visualCharactersByKey.get(a)?.name || a;
        const bName = this.visualCharactersByKey.get(b)?.name || b;
        return aName.localeCompare(bName);
      });
    };

    for (const keys of dynamicByBaseFighter.values()) {
      sortDynamicCards(keys);
    }
    sortDynamicCards(orphanDynamicKeys);

    const preferredOrder: string[] = [];

    for (const fighterKey of defaultOrder) {
      if (!allowedKeys.has(fighterKey)) {
        continue;
      }

      preferredOrder.push(fighterKey);
      const relatedEchoCards = dynamicByBaseFighter.get(fighterKey) || [];
      preferredOrder.push(...relatedEchoCards);
    }

    preferredOrder.push(...orphanDynamicKeys);

    if (!this.visualCharacterOrder || this.visualCharacterOrder.length === 0) {
      this.visualCharacterOrder = [...preferredOrder];
      return;
    }

    const nextOrder = this.visualCharacterOrder.filter((fighterKey) =>
      allowedKeys.has(fighterKey),
    );

    const seen = new Set(nextOrder);
    for (const fighterKey of preferredOrder) {
      if (seen.has(fighterKey)) {
        continue;
      }

      nextOrder.push(fighterKey);
      seen.add(fighterKey);
    }

    this.visualCharacterOrder = nextOrder;
  }

  async loadVisualPlannerState() {
    try {
      if (!window.electronAPI?.store?.get) return;

      const stored = (await window.electronAPI.store.get(
        ECHO_VISUAL_STATE_KEY,
      )) as VisualPlannerPersistedState | null;

      if (!stored) {
        this.visualCharacterOrder = this.getDefaultCharacterOrder();
        this.visualSelectedCharacter = null;
        return;
      }

      this.visualCharacterOrder = Array.isArray(stored.characterOrder)
        ? [...stored.characterOrder]
        : this.getDefaultCharacterOrder();
      this.visualDisabledCharacters = new Set(
        Array.isArray(stored.disabledCharacters) ? stored.disabledCharacters : [],
      );
      this.visualSelectedCharacter = stored.selectedCharacter || null;
      this.ensureVisualCharacterOrder();
    } catch (error) {
      console.warn('Failed to load visual planner state:', error);
      this.visualCharacterOrder = this.getDefaultCharacterOrder();
      this.visualDisabledCharacters = new Set();
      this.visualSelectedCharacter = null;
    }
  }

  async saveVisualPlannerState(showToast = false) {
    try {
      if (!window.electronAPI?.store?.set) return;

      const payload: VisualPlannerPersistedState = {
        characterOrder: this.visualCharacterOrder,
        selectedCharacter: this.visualSelectedCharacter,
        disabledCharacters: Array.from(this.visualDisabledCharacters),
      };

      await window.electronAPI.store.set(ECHO_VISUAL_STATE_KEY, payload);

      const selectedMod = this.getSelectedMod();
      await this.saveVisualLayoutStateToSlotTarget(selectedMod);

      if (showToast && window.toastManager) {
        window.toastManager.success('echo.visualSaved');
      }
    } catch (error) {
      console.warn('Failed to save visual planner state:', error);
    }
  }

  resolveLayoutTargetModPath(mod: Mod | null): string | null {
    if (this.uiCompatibilityState?.slotTargetPath) {
      return this.uiCompatibilityState.slotTargetPath;
    }

    if (this.uiCompatibilityPlan?.recommendedTargets?.slotExpansionTargetPath) {
      return this.uiCompatibilityPlan.recommendedTargets.slotExpansionTargetPath;
    }

    const defaultSlotsPath = this.resolveDefaultSlotsModPath();
    if (defaultSlotsPath) {
      return defaultSlotsPath;
    }

    return mod?.path || null;
  }

  async loadVisualLayoutStateFromSlotTarget(mod: Mod | null) {
    if (!window.electronAPI?.echoLoadUiLayoutState) {
      return;
    }

    const layoutTargetPath = this.resolveLayoutTargetModPath(mod);
    if (!layoutTargetPath) {
      return;
    }

    try {
      const payload =
        (await window.electronAPI.echoLoadUiLayoutState(
          layoutTargetPath,
        )) as EchoUiLayoutStatePayload | null;

      if (!payload) {
        return;
      }

      if (Array.isArray(payload.characterOrder) && payload.characterOrder.length > 0) {
        this.visualCharacterOrder = [...payload.characterOrder];
      }

      if (
        typeof payload.selectedCharacter === 'string' ||
        payload.selectedCharacter === null
      ) {
        this.visualSelectedCharacter = payload.selectedCharacter;
      }
    } catch (error) {
      console.warn('Failed to load visual layout state from slot target:', error);
    }
  }

  async saveVisualLayoutStateToSlotTarget(mod: Mod | null) {
    if (!window.electronAPI?.echoSaveUiLayoutState) {
      return;
    }

    const layoutTargetPath = this.resolveLayoutTargetModPath(mod);
    if (!layoutTargetPath) {
      return;
    }

    const payload: EchoUiLayoutStatePayload = {
      characterOrder: this.visualCharacterOrder,
      selectedCharacter: this.visualSelectedCharacter,
      updatedAt: new Date().toISOString(),
    };

    try {
      await window.electronAPI.echoSaveUiLayoutState(layoutTargetPath, payload);
    } catch (error) {
      console.warn('Failed to save visual layout state to slot target:', error);
    }
  }

  async refreshVisualPlanner() {
    const container = document.querySelector<HTMLElement>('#echo-visual-content');
    if (!container) return;

    this.visualLoading = true;
    this.renderVisualPlanner();

    const mods = window.modManager?.mods || [];
    const selectedMod = this.getSelectedMod();
    const defaultOrder = this.getDefaultCharacterOrder();

    if (!this.visualCharacterOrder || this.visualCharacterOrder.length === 0) {
      this.visualCharacterOrder = [...defaultOrder];
    }

    this.ensureVisualCharacterOrder();

    const visualCharacters = new Map<string, VisualCharacterEntry>();

    const baseCharacterEntries = await Promise.all(
      defaultOrder.map(async (fighterKey) => {
        const fighterInfo = this.getCharacterInfoMap()[fighterKey];
        const imageUrl = await this.resolveCharacterImageUrl(fighterKey);

        return {
          fighterKey,
          name: fighterInfo?.name || fighterKey,
          imageUrl,
          modPreviewUrl: null,
          cardKind: 'fighter',
          baseFighterKey: fighterKey,
          sourceModPath: null,
          fighterMods: [],
          movesetMods: [],
          echoMods: [],
        } as VisualCharacterEntry;
      }),
    );

    for (const entry of baseCharacterEntries) {
      visualCharacters.set(entry.fighterKey, entry);
    }

    // Warm up fighter portraits in the background to reduce scroll jank.
    this.preloadCharacterImages(baseCharacterEntries.map((entry) => entry.imageUrl));

    const visualMods: VisualModEntry[] = [];

    const activePaths = new Set(mods.map((mod) => mod.path));
    for (const cachedPath of Array.from(this.visualModScanCache.keys())) {
      if (!activePaths.has(cachedPath)) {
        this.visualModScanCache.delete(cachedPath);
      }
    }

    const modEntries = await Promise.all(mods.map((mod) => this.scanVisualMod(mod)));

    for (const visualMod of modEntries) {
      if (!visualMod) continue;

      visualMods.push(visualMod);

      for (const fighterKey of visualMod.fighterKeys) {
        const entry = visualCharacters.get(fighterKey);
        if (!entry) continue;

        if (visualMod.type === 'fighter') {
          entry.fighterMods.push(visualMod);
        } else if (visualMod.type === 'moveset') {
          entry.movesetMods.push(visualMod);
        } else {
          const echoCardKey = this.createEchoCardKey(fighterKey, visualMod.path);
          let echoCard = visualCharacters.get(echoCardKey);

          if (!echoCard) {
            echoCard = {
              fighterKey: echoCardKey,
              name: visualMod.name,
              imageUrl: entry.imageUrl,
              modPreviewUrl: visualMod.previewUrl || entry.modPreviewUrl,
              cardKind: 'echo',
              baseFighterKey: fighterKey,
              sourceModPath: visualMod.path,
              fighterMods: [],
              movesetMods: [],
              echoMods: [],
            };

            visualCharacters.set(echoCardKey, echoCard);
          }

          echoCard.echoMods.push(visualMod);
        }
      }
    }

    for (const entry of visualCharacters.values()) {
      entry.modPreviewUrl = this.resolveCharacterModPreview(entry);
    }

    this.visualMods = visualMods;
    this.visualUnmappedMods = visualMods.filter(
      (entry) => entry.fighterKeys.length === 0,
    );
    this.visualCharactersByKey = visualCharacters;
    await this.loadVisualLayoutStateFromSlotTarget(selectedMod);
    this.ensureVisualCharacterOrder(Array.from(this.visualCharactersByKey.keys()));

    this.visualDisabledCharacters = new Set(
      Array.from(this.visualDisabledCharacters).filter((fighterKey) =>
        this.visualCharactersByKey.has(fighterKey),
      ),
    );

    if (
      this.visualSelectedCharacter &&
      !this.visualCharactersByKey.has(this.visualSelectedCharacter)
    ) {
      this.visualSelectedCharacter = null;
    }

    this.visualLoading = false;
    this.renderVisualPlanner();
    await this.saveVisualPlannerState(false);
  }

  getVisualTypeLabel(type: VisualModType): string {
    if (type === 'moveset') return this.t('echo.visualTypeMoveset');
    if (type === 'echo') return this.t('echo.visualTypeEcho');
    return this.t('echo.visualTypeFighter');
  }

  getVisualSummaryCounts() {
    const fighters = this.visualCharacterOrder.length;
    const fighterMods = this.visualMods.filter((mod) => mod.type === 'fighter').length;
    const movesets = this.visualMods.filter((mod) => mod.type === 'moveset').length;
    const echoes = this.visualMods.filter((mod) => mod.type === 'echo').length;

    return { fighters, fighterMods, movesets, echoes };
  }

  getSelectedVisualEntry(): VisualCharacterEntry | null {
    if (!this.visualSelectedCharacter) return null;
    return this.visualCharactersByKey.get(this.visualSelectedCharacter) || null;
  }

  getPrimaryVisualModForEntry(entry: VisualCharacterEntry): VisualModEntry | null {
    const modGroups = [entry.echoMods, entry.fighterMods, entry.movesetMods];

    for (const group of modGroups) {
      const active = group.find((mod) => mod.status === 'active');
      if (active) {
        return active;
      }

      if (group.length > 0) {
        return group[0];
      }
    }

    return null;
  }

  getVisualCardTitle(entry: VisualCharacterEntry): string {
    if (entry.cardKind !== 'echo') {
      return entry.name;
    }

    const baseEntry = this.visualCharactersByKey.get(entry.baseFighterKey);
    if (baseEntry?.name) {
      return baseEntry.name;
    }

    return this.getCharacterInfoMap()[entry.baseFighterKey]?.name || entry.baseFighterKey;
  }

  getVisualCardSubtitle(entry: VisualCharacterEntry): string {
    if (entry.cardKind === 'echo') {
      const echoName = entry.name.trim();
      if (echoName) {
        return echoName;
      }
    }

    const primaryMod = this.getPrimaryVisualModForEntry(entry);
    if (primaryMod?.name) {
      return primaryMod.name;
    }

    const characterInfoMap = this.getCharacterInfoMap();
    const fighterInfo =
      characterInfoMap[entry.baseFighterKey] || characterInfoMap[entry.fighterKey];

    if (fighterInfo?.number && fighterInfo?.series) {
      return `#${fighterInfo.number} - ${fighterInfo.series}`;
    }

    if (fighterInfo?.series) {
      return fighterInfo.series;
    }

    return '';
  }

  getVisualEntryFighterName(entry: VisualCharacterEntry): string {
    const baseEntry = this.visualCharactersByKey.get(entry.baseFighterKey);
    if (baseEntry?.name) {
      return baseEntry.name;
    }

    const characterInfoMap = this.getCharacterInfoMap();
    return (
      characterInfoMap[entry.baseFighterKey]?.name ||
      characterInfoMap[entry.fighterKey]?.name ||
      entry.name
    );
  }

  getVisualTileTitle(entry: VisualCharacterEntry): string {
    if (entry.cardKind === 'echo' || entry.movesetMods.length > 0) {
      const primaryMod = this.getPrimaryVisualModForEntry(entry);
      if (primaryMod?.name) {
        return primaryMod.name;
      }
    }

    return this.getVisualCardTitle(entry);
  }

  getVisualTileSubtitle(entry: VisualCharacterEntry): string {
    if (entry.cardKind === 'echo' || entry.movesetMods.length > 0) {
      return this.getVisualEntryFighterName(entry);
    }

    return this.getVisualCardSubtitle(entry);
  }

  getVisualEntrySearchText(entry: VisualCharacterEntry): string {
    const slotLabel = this.getVisualSlotLabel(entry.fighterKey) || '';
    const modNames = [...entry.fighterMods, ...entry.movesetMods, ...entry.echoMods]
      .map((mod) => mod.name)
      .join(' ');

    return [
      this.getVisualCardTitle(entry),
      this.getVisualCardSubtitle(entry),
      entry.name,
      slotLabel,
      modNames,
    ]
      .join(' ')
      .toLowerCase();
  }

  getVisualModSearchText(mod: VisualModEntry): string {
    return [mod.name, this.getVisualTypeLabel(mod.type), mod.status]
      .join(' ')
      .toLowerCase();
  }

  getVisualCardImageUrl(entry: VisualCharacterEntry): string {
    // Echo cards should always prefer their mod preview when available.
    if (entry.cardKind === 'echo' && entry.modPreviewUrl) {
      return entry.modPreviewUrl;
    }

    // Moveset-backed tiles should use the moveset preview instead of portrait art.
    if (entry.movesetMods.length > 0) {
      const activeMovesetPreview = entry.movesetMods.find(
        (mod) => mod.status === 'active' && Boolean(mod.previewUrl),
      )?.previewUrl;
      if (activeMovesetPreview) {
        return activeMovesetPreview;
      }

      const anyMovesetPreview = entry.movesetMods.find((mod) =>
        Boolean(mod.previewUrl),
      )?.previewUrl;
      if (anyMovesetPreview) {
        return anyMovesetPreview;
      }
    }

    const candidateKeys = [entry.baseFighterKey, entry.fighterKey].filter(Boolean);

    for (const fighterKey of candidateKeys) {
      const cachedImage = this.visualCharacterImageCache.get(fighterKey);
      if (cachedImage) {
        return cachedImage;
      }

      const characterImages = (window.CHARACTER_IMAGES || {}) as Record<string, string>;
      const mappedImage = characterImages[fighterKey];
      if (mappedImage) {
        return mappedImage;
      }
    }

    const fallbackUrl = entry.imageUrl || '';
    
    // Debug logging to help troubleshoot image loading issues
    if (!fallbackUrl && entry.fighterKey) {
      console.debug(`No image URL found for character: ${entry.fighterKey}`, {
        baseFighterKey: entry.baseFighterKey,
        hasCache: this.visualCharacterImageCache.has(entry.fighterKey),
        hasWindowImages: Boolean(window.CHARACTER_IMAGES),
      });
    }
    
    return fallbackUrl;
  }

  isVisualEntryUsingCharacterPortrait(entry: VisualCharacterEntry): boolean {
    if (entry.cardKind === 'echo' && entry.modPreviewUrl) {
      return false;
    }

    if (entry.movesetMods.length > 0) {
      const hasMovesetPreview = entry.movesetMods.some((mod) =>
        Boolean(mod.previewUrl),
      );

      if (hasMovesetPreview) {
        return false;
      }
    }

    return true;
  }

  renderVisualPlanner() {
    const container = document.querySelector<HTMLElement>('#echo-visual-content');
    if (!container) return;

    if (this.visualLoading) {
      container.innerHTML = `<p class="echo-loading">${this.t('echo.loading')}</p>`;
      return;
    }

    const selectedEntry = this.getSelectedVisualEntry();
    const selectedTitle = selectedEntry ? this.getVisualCardTitle(selectedEntry) : '';
    const selectedSubtitle = selectedEntry
      ? this.getVisualCardSubtitle(selectedEntry)
      : '';
    const selectedLabel = selectedSubtitle
      ? `${selectedTitle} - ${selectedSubtitle}`
      : selectedTitle;
    const selectedText = selectedEntry
      ? this.t('echo.visualSelectedCharacter', { name: selectedLabel })
      : this.t('echo.visualNoCharacterSelected');

    const selectedMods = selectedEntry
      ? [...selectedEntry.fighterMods, ...selectedEntry.movesetMods, ...selectedEntry.echoMods]
      : [];
    const selectedSummary = selectedEntry
      ? `${selectedText} (${selectedMods.length})`
      : selectedText;


    const renderTile = (fighterKey: string, isDisabledArea = false) => {
      const entry = this.visualCharactersByKey.get(fighterKey);
      if (!entry) return '';

      const isActive = fighterKey === this.visualSelectedCharacter;
      const tileTitle = this.getVisualTileTitle(entry);
      const tileSubtitle = this.getVisualTileSubtitle(entry);
      const resolvedImageUrl = this.getVisualCardImageUrl(entry);
      const isCharacterPortrait = this.isVisualEntryUsingCharacterPortrait(entry);
      const imageUrl = this.escapeHtml(resolvedImageUrl);
      const fallbackInitials = this.escapeHtml(this.getVisualTileInitials(tileTitle));
      const searchText = this.escapeHtml(this.getVisualEntrySearchText(entry));
      const typeLabels: string[] = [];

      if (entry.cardKind === 'echo' || entry.echoMods.length > 0) {
        typeLabels.push(
          `${this.getVisualTypeLabel('echo')}${entry.echoMods.length > 1 ? ` x${entry.echoMods.length}` : ''}`,
        );
      }

      if (entry.movesetMods.length > 0) {
        typeLabels.push(
          `${this.getVisualTypeLabel('moveset')}${entry.movesetMods.length > 1 ? ` x${entry.movesetMods.length}` : ''}`,
        );
      }

      if (entry.fighterMods.length > 0) {
        typeLabels.push(
          `${this.getVisualTypeLabel('fighter')}${entry.fighterMods.length > 1 ? ` x${entry.fighterMods.length}` : ''}`,
        );
      }

      const typeSummary = typeLabels.join(' + ');
      const subtitleWithType = [tileSubtitle, typeSummary].filter(Boolean).join(' - ');

      const useOverlayInfo =
        isCharacterPortrait || entry.cardKind === 'echo' || typeLabels.length > 0;

      const nameBarHtml = `
        <div class="echo-tile-name-bar${isCharacterPortrait ? ' character-photo' : ''}${useOverlayInfo ? ' overlay-info' : ''}">
          <span class="echo-tile-title">${this.escapeHtml(tileTitle)}</span>
          ${
            subtitleWithType
              ? `<span class="echo-tile-subtitle">${this.escapeHtml(subtitleWithType)}</span>`
              : ''
          }
        </div>
      `;

      const tileClasses = [
        'echo-visual-tile',
        isActive ? 'active' : '',
        useOverlayInfo ? 'overlay-info' : '',
        isDisabledArea ? 'is-disabled' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `
        <div
          class="${tileClasses}"
          data-fighter="${this.escapeHtml(fighterKey)}"
          data-disabled="${isDisabledArea ? 'true' : 'false'}"
          data-search="${searchText}"
          draggable="${isDisabledArea ? 'false' : 'true'}"
        >
          <div class="echo-tile-image-bg${isCharacterPortrait ? ' character-photo' : ''}${useOverlayInfo ? ' overlay-info' : ''}">
            ${
              imageUrl
                ? `<img src="${imageUrl}" alt="${this.escapeHtml(tileTitle)}" class="echo-tile-img${isCharacterPortrait ? ' character-photo' : ''}" loading="lazy" />`
                : `<div class="echo-tile-placeholder">${fallbackInitials}</div>`
            }
            ${useOverlayInfo ? nameBarHtml : ''}
          </div>
          ${useOverlayInfo ? '' : nameBarHtml}
        </div>
      `;
    };

    const activeOrder = this.visualCharacterOrder.filter(
      (fighterKey) => !this.visualDisabledCharacters.has(fighterKey),
    );
    const disabledOrder = this.visualCharacterOrder.filter((fighterKey) =>
      this.visualDisabledCharacters.has(fighterKey),
    );

    const activeTilesHtml = activeOrder.map((fighterKey) => renderTile(fighterKey)).join('');
    const disabledTilesHtml = disabledOrder
      .map((fighterKey) => renderTile(fighterKey, true))
      .join('');

    const unmappedModsHtml =
      this.visualUnmappedMods.length === 0
        ? ''
        : `
            <div class="echo-visual-unmapped">
              <p class="echo-visual-unmapped-title">${this.t('echo.visualUnmappedMods')}</p>
              <div class="echo-visual-mod-list">
                ${this.visualUnmappedMods
                  .slice(0, 10)
                  .map(
                    (mod) => `
                      <div class="echo-visual-mod-item" data-mod-path="${this.escapeHtml(mod.path)}" data-search="${this.escapeHtml(this.getVisualModSearchText(mod))}">
                        <p class="echo-visual-mod-item-name">${this.escapeHtml(mod.name)}</p>
                        <span class="echo-visual-mod-item-type">${this.escapeHtml(this.getVisualTypeLabel(mod.type))}</span>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </div>
          `;

    container.innerHTML = `
      <div class="echo-visual-selected-inline">
        <p class="echo-visual-selected-inline-text">${this.escapeHtml(selectedSummary)}</p>
      </div>

      <div class="echo-visual-search">
        <input
          type="search"
          id="echo-visual-search-input"
          class="echo-visual-search-input"
          placeholder="${this.escapeHtml(this.t('echo.visualSearchPlaceholder'))}"
          value="${this.escapeHtml(this.visualSearchQuery)}"
        />
      </div>

      <p class="echo-empty echo-visual-search-empty" id="echo-visual-search-empty">${this.t('echo.visualSearchNoResults')}</p>

      <div class="echo-visual-board" id="echo-visual-board">${activeTilesHtml}</div>

      <div class="echo-visual-disabled-section" id="echo-visual-disabled-section">
        <p class="echo-visual-unmapped-title">${this.t('echo.visualDisabledArea')}</p>
        <div class="echo-visual-board echo-visual-board-disabled" id="echo-visual-board-disabled">
          ${
            disabledTilesHtml ||
            `<p class="echo-empty">${this.t('echo.visualDisabledEmpty')}</p>`
          }
        </div>
      </div>
      <div id="echo-visual-unmapped">${unmappedModsHtml}</div>
    `;

    this.bindVisualPlannerBoardEvents();
    this.bindVisualPlannerModItemEvents();
    this.bindVisualPlannerSearchEvents();
  }

  bindVisualPlannerSearchEvents() {
    const searchInput = document.querySelector<HTMLInputElement>('#echo-visual-search-input');
    if (!searchInput) return;

    searchInput.value = this.visualSearchQuery;

    searchInput.addEventListener('input', () => {
      this.visualSearchQuery = searchInput.value || '';
      this.applyVisualSearchFilter();
    });

    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        this.visualSearchQuery = '';
        this.applyVisualSearchFilter();
        event.preventDefault();
      }
    });

    this.applyVisualSearchFilter();
  }

  applyVisualSearchFilter() {
    const query = this.visualSearchQuery.trim().toLowerCase();
    const tiles = document.querySelectorAll<HTMLElement>('.echo-visual-tile');
    const modItems = document.querySelectorAll<HTMLElement>('.echo-visual-mod-item');

    let visibleTileCount = 0;
    let visibleDisabledTileCount = 0;
    let totalDisabledTileCount = 0;

    for (const tile of tiles) {
      const tileSearchText = (tile.dataset.search || '').toLowerCase();
      const isDisabledTile = tile.dataset.disabled === 'true';
      const matches = !query || tileSearchText.includes(query);

      tile.style.display = matches ? '' : 'none';

      if (isDisabledTile) {
        totalDisabledTileCount += 1;
      }

      if (matches) {
        visibleTileCount += 1;
        if (isDisabledTile) {
          visibleDisabledTileCount += 1;
        }
      }
    }

    let visibleModCount = 0;
    for (const modItem of modItems) {
      const modSearchText = (modItem.dataset.search || '').toLowerCase();
      const matches = !query || modSearchText.includes(query);

      modItem.style.display = matches ? '' : 'none';

      if (matches) {
        visibleModCount += 1;
      }
    }

    const disabledSection = document.querySelector<HTMLElement>(
      '#echo-visual-disabled-section',
    );
    if (disabledSection && totalDisabledTileCount > 0) {
      disabledSection.style.display = !query || visibleDisabledTileCount > 0 ? '' : 'none';
    }

    const unmappedSection = document.querySelector<HTMLElement>('#echo-visual-unmapped');
    if (unmappedSection && modItems.length > 0) {
      unmappedSection.style.display = !query || visibleModCount > 0 ? '' : 'none';
    }

    const searchEmpty = document.querySelector<HTMLElement>('#echo-visual-search-empty');
    if (searchEmpty) {
      const hasResults = visibleTileCount > 0 || visibleModCount > 0;
      searchEmpty.style.display = query && !hasResults ? 'block' : 'none';
    }
  }

  bindVisualPlannerModItemEvents() {
    const items = document.querySelectorAll<HTMLElement>('.echo-visual-mod-item');

    for (const item of items) {
      item.addEventListener('click', async () => {
        const modPath = item.dataset.modPath;
        if (!modPath || !window.modManager?.mods) return;

        const mod = window.modManager.mods.find((entry) => entry.path === modPath);
        if (!mod) return;

        this.selectedEchoModPath = mod.path;
        if (window.modManager) {
          await window.modManager.selectMod(mod.id, true);
        }

        this.updateSelectedModView(mod);
        await this.loadSelectedModAnalysis(mod);
        await this.refreshUiCharaInspector();
        this.renderVisualPlanner();
      });
    }
  }

  bindVisualPlannerBoardEvents() {
    const tiles = document.querySelectorAll<HTMLElement>('.echo-visual-tile');

    for (const tile of tiles) {
      const fighterKey = tile.dataset.fighter;
      const isDisabledTile = tile.dataset.disabled === 'true';
      if (!fighterKey) continue;

      tile.addEventListener('click', async () => {
        const entry = this.visualCharactersByKey.get(fighterKey);
        if (entry?.sourceModPath) {
          this.selectedEchoModPath = entry.sourceModPath;

          const sourceMod = window.modManager?.mods?.find(
            (modEntry) => modEntry.path === entry.sourceModPath,
          );

          if (sourceMod && window.modManager) {
            await window.modManager.selectMod(sourceMod.id, true);
            this.updateSelectedModView(sourceMod);
          }
        }

        this.visualSelectedCharacter = fighterKey;
        this.renderVisualPlanner();
        await this.saveVisualPlannerState(false);
        this.openCharacterQuickMenu(fighterKey);
      });

      tile.addEventListener('contextmenu', async (event) => {
        event.preventDefault();

        if (isDisabledTile) {
          await this.enableVisualCharacter(fighterKey);
          return;
        }

        await this.disableVisualCharacter(fighterKey);
      });

      tile.addEventListener('dragstart', (event) => {
        if (isDisabledTile) {
          event.preventDefault();
          return;
        }

        this.visualDraggedCharacter = fighterKey;
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', fighterKey);
        }
      });

      tile.addEventListener('dragover', (event) => {
        event.preventDefault();
        tile.classList.add('drop-target');
      });

      tile.addEventListener('dragleave', () => {
        tile.classList.remove('drop-target');
      });

      tile.addEventListener('drop', async (event) => {
        event.preventDefault();
        tile.classList.remove('drop-target');

        if (isDisabledTile) {
          this.visualDraggedCharacter = null;
          return;
        }

        const draggedKey = this.visualDraggedCharacter;
        const targetKey = fighterKey;

        if (!draggedKey || draggedKey === targetKey) {
          this.visualDraggedCharacter = null;
          return;
        }

        const draggedIndex = this.visualCharacterOrder.indexOf(draggedKey);
        const targetIndex = this.visualCharacterOrder.indexOf(targetKey);

        if (draggedIndex === -1 || targetIndex === -1) {
          this.visualDraggedCharacter = null;
          return;
        }

        this.visualCharacterOrder.splice(draggedIndex, 1);
        const adjustedTargetIndex =
          draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
        this.visualCharacterOrder.splice(adjustedTargetIndex, 0, draggedKey);

        this.visualDraggedCharacter = null;
        this.renderVisualPlanner();
        await this.saveVisualPlannerState(false);
      });

      tile.addEventListener('dragend', () => {
        this.visualDraggedCharacter = null;
        document
          .querySelectorAll<HTMLElement>('.echo-visual-tile.drop-target')
          .forEach((entry) => entry.classList.remove('drop-target'));
      });
    }
  }

  async disableVisualCharacter(fighterKey: string) {
    if (!fighterKey) return;

    this.visualDisabledCharacters.add(fighterKey);

    if (this.visualSelectedCharacter === fighterKey) {
      this.visualSelectedCharacter = null;
    }

    await this.refreshUiCharaInspector();
    this.renderVisualPlanner();
    await this.saveVisualPlannerState(false);
  }

  async enableVisualCharacter(fighterKey: string) {
    if (!fighterKey) return;

    this.visualDisabledCharacters.delete(fighterKey);
    this.visualSelectedCharacter = fighterKey;

    await this.refreshUiCharaInspector();
    this.renderVisualPlanner();
    await this.saveVisualPlannerState(false);
  }

  openEchoWizard(
    selectedEntry: VisualCharacterEntry,
    sourceModPath: string,
    preferredId?: string,
    preferredDisplayName?: string,
  ) {
    const modal = document.querySelector<HTMLElement>('#echo-create-wizard');
    if (!modal) return;

    this.echoWizardCharacterKey = selectedEntry.fighterKey;
    this.echoWizardSourceModPath = sourceModPath;
    this.echoWizardStep = 1;

    const normalizedId = this.normalizeName(
      preferredId || selectedEntry.name || selectedEntry.fighterKey,
    );
    const displayName = this.sanitizeEchoDisplayName(
      preferredDisplayName || selectedEntry.name || this.formatEchoDisplayNameFromId(normalizedId),
    );

    this.setEchoNameValue(normalizedId);
    this.setEchoDisplayNameValue(displayName);
    this.echoPreferredIntroName = this.sanitizeEchoIntroName(displayName);

    const idInput = document.querySelector<HTMLInputElement>('#echo-wizard-id-input');
    const uiInput = document.querySelector<HTMLInputElement>('#echo-wizard-ui-input');
    const introInput = document.querySelector<HTMLInputElement>('#echo-wizard-intro-input');

    if (idInput) idInput.value = normalizedId;
    if (uiInput) uiInput.value = displayName;
    if (introInput) introInput.value = this.echoPreferredIntroName;

    const characterLabel = document.querySelector<HTMLElement>('#echo-wizard-character-label');
    if (characterLabel) {
      characterLabel.textContent = this.getVisualCardTitle(selectedEntry);
    }

    const mod = window.modManager?.mods?.find((entry) => entry.path === sourceModPath);
    const modLabel = document.querySelector<HTMLElement>('#echo-wizard-mod-label');
    if (modLabel) {
      modLabel.textContent = mod?.name || sourceModPath;
    }

    this.setEchoWizardStep(1);
    modal.style.display = 'flex';
  }

  closeEchoWizard() {
    const modal = document.querySelector<HTMLElement>('#echo-create-wizard');
    if (!modal) return;
    modal.style.display = 'none';
  }

  setEchoWizardStep(step: number) {
    const clampedStep = Math.max(1, Math.min(4, step));
    this.echoWizardStep = clampedStep;

    for (let index = 1; index <= 4; index += 1) {
      const section = document.querySelector<HTMLElement>(`#echo-wizard-step-${index}`);
      section?.classList.toggle('active', index === clampedStep);
    }

    const backBtn = document.querySelector<HTMLElement>('#echo-wizard-back-btn');
    const nextBtn = document.querySelector<HTMLElement>('#echo-wizard-next-btn');
    const createBtn = document.querySelector<HTMLElement>('#echo-wizard-create-btn');

    if (backBtn) {
      backBtn.toggleAttribute('disabled', clampedStep === 1);
    }

    if (nextBtn) {
      nextBtn.style.display = clampedStep >= 4 ? 'none' : 'inline-flex';
    }

    if (createBtn) {
      createBtn.style.display = clampedStep >= 4 ? 'inline-flex' : 'none';
    }

    this.renderEchoWizardReview();
  }

  syncEchoWizardInputs() {
    const idInput = document.querySelector<HTMLInputElement>('#echo-wizard-id-input');
    const uiInput = document.querySelector<HTMLInputElement>('#echo-wizard-ui-input');
    const introInput = document.querySelector<HTMLInputElement>('#echo-wizard-intro-input');

    if (idInput) {
      const normalized = this.normalizeName(idInput.value);
      idInput.value = normalized;
      this.setEchoNameValue(normalized);
    }

    if (uiInput) {
      const sanitized = this.sanitizeEchoDisplayName(uiInput.value);
      uiInput.value = sanitized;
      this.setEchoDisplayNameValue(sanitized);
    }

    if (introInput) {
      const sanitizedIntro = this.sanitizeEchoIntroName(introInput.value);
      introInput.value = sanitizedIntro;
      this.echoPreferredIntroName = sanitizedIntro;
    }
  }

  renderEchoWizardReview() {
    const review = document.querySelector<HTMLElement>('#echo-wizard-review');
    if (!review) return;

    const mod = window.modManager?.mods?.find(
      (entry) => entry.path === this.echoWizardSourceModPath,
    );
    const characterEntry = this.echoWizardCharacterKey
      ? this.visualCharactersByKey.get(this.echoWizardCharacterKey)
      : null;

    review.innerHTML = `
      <p><strong>${this.t('echo.wizardCharacter')}</strong>: ${this.escapeHtml(
        characterEntry ? this.getVisualCardTitle(characterEntry) : '-',
      )}</p>
      <p><strong>${this.t('echo.wizardMod')}</strong>: ${this.escapeHtml(mod?.name || '-')}</p>
      <p><strong>${this.t('echo.wizardId')}</strong>: ${this.escapeHtml(this.getEchoNameValue() || '-')}</p>
      <p><strong>${this.t('echo.wizardUiName')}</strong>: ${this.escapeHtml(
        this.getEchoDisplayNameValue() || '-',
      )}</p>
      <p><strong>${this.t('echo.wizardIntro')}</strong>: ${this.escapeHtml(
        this.echoPreferredIntroName || this.getEchoDisplayNameValue() || '-',
      )}</p>
      <p class="echo-section-hint">${this.t('echo.wizardSlotHint')}</p>
    `;
  }

  async confirmEchoWizardCreate() {
    this.syncEchoWizardInputs();

    if (!this.echoWizardSourceModPath || !window.modManager?.mods) {
      window.toastManager?.warning('echo.visualNoModsForCharacter');
      return;
    }

    const mod = window.modManager.mods.find(
      (entry) => entry.path === this.echoWizardSourceModPath,
    );

    if (!mod) {
      window.toastManager?.warning('echo.visualNoModsForCharacter');
      return;
    }

    this.selectedEchoModPath = mod.path;
    await window.modManager.selectMod(mod.id, true);
    this.updateSelectedModView(mod);
    await this.loadSelectedModAnalysis(mod);

    await this.openChangeSlotFlow();
    this.closeEchoWizard();
  }

  closeCharacterQuickMenu() {
    const menu = document.querySelector<HTMLElement>('#echo-character-menu');
    if (!menu) return;
    menu.style.display = 'none';
  }

  openCharacterQuickMenu(fighterKey?: string) {
    if (fighterKey) {
      this.visualSelectedCharacter = fighterKey;
    }

    const selectedEntry = this.getSelectedVisualEntry();
    const menu = document.querySelector<HTMLElement>('#echo-character-menu');
    const title = document.querySelector<HTMLElement>('#echo-character-menu-title');
    const body = document.querySelector<HTMLElement>('#echo-character-menu-body');

    if (!menu || !title || !body) return;

    if (!selectedEntry) {
      body.innerHTML = `<p class="echo-character-menu-empty">${this.t('echo.visualNoCharacterSelected')}</p>`;
      title.textContent = this.t('echo.visualNoCharacterSelected');
      menu.style.display = 'flex';
      return;
    }

    const selectedMods = [
      ...selectedEntry.fighterMods,
      ...selectedEntry.movesetMods,
      ...selectedEntry.echoMods,
    ];

    const selectedSlot = this.getVisualSlotLabel(selectedEntry.fighterKey);
    const selectedCardTitle = this.getVisualCardTitle(selectedEntry);
    const selectedCardSubtitle = this.getVisualCardSubtitle(selectedEntry);
    const displayName =
      selectedEntry.cardKind === 'echo' && selectedSlot
        ? `${selectedCardTitle} (${selectedSlot.toUpperCase()})`
        : selectedCardTitle;

    const titleLabel = selectedCardSubtitle
      ? `${displayName} - ${selectedCardSubtitle}`
      : displayName;
    const isDisabled = this.visualDisabledCharacters.has(selectedEntry.fighterKey);

    title.textContent = this.t('echo.characterMenuTitle', {
      name: titleLabel,
    });

    const modsHtml =
      selectedMods.length === 0
        ? `<p class="echo-character-menu-empty">${this.t('echo.characterMenuNoMods')}</p>`
        : selectedMods
            .map(
              (mod) => `
                <div class="echo-character-menu-mod-item ${this.selectedEchoModPath === mod.path ? 'active' : ''}" data-character-menu-item="${this.escapeHtml(mod.path)}">
                  ${
                    mod.previewUrl
                      ? `<img class="echo-character-menu-mod-thumb" src="${this.escapeHtml(mod.previewUrl)}" alt="${this.escapeHtml(mod.name)}" loading="lazy" />`
                      : '<div class="echo-character-menu-mod-thumb placeholder"></div>'
                  }
                  <div>
                    <p class="echo-character-menu-mod-name">${this.escapeHtml(mod.name)}</p>
                    <p class="echo-character-menu-mod-meta">${this.escapeHtml(this.getVisualTypeLabel(mod.type))} - ${this.escapeHtml(mod.status)}</p>
                  </div>
                  <div class="echo-character-menu-mod-actions">
                    <button class="input-btn short" type="button" data-character-menu-details="${this.escapeHtml(mod.path)}">
                      ${this.t('echo.characterMenuSeeDetails')}
                    </button>
                    <button class="input-btn short" type="button" data-character-menu-create-mod="${this.escapeHtml(mod.path)}">
                      ${this.t('echo.characterMenuCreateFromMod')}
                    </button>
                  </div>
                </div>
              `,
            )
            .join('');

    body.innerHTML = `
      <div class="echo-character-menu-actions">
        <button class="input-btn short" type="button" id="echo-character-menu-disable-toggle">
          ${isDisabled ? this.t('echo.characterMenuReenable') : this.t('echo.characterMenuDisable')}
        </button>
      </div>
      <div class="echo-character-menu-details" id="echo-character-menu-details">
        <p class="echo-character-menu-empty">${this.t('echo.characterMenuDetailsPrompt')}</p>
      </div>
      <div class="echo-visual-mod-list">${modsHtml}</div>
    `;

    const detailsContainer = document.querySelector<HTMLElement>(
      '#echo-character-menu-details',
    );

    const renderModDetails = async (modPath: string) => {
      if (!detailsContainer) return;

      const modDetails = selectedMods.find((mod) => mod.path === modPath);
      if (!modDetails) {
        detailsContainer.innerHTML = `<p class="echo-character-menu-empty">${this.t('echo.characterMenuDetailsPrompt')}</p>`;
        return;
      }

      const fighterName = selectedEntry.baseFighterKey || selectedEntry.fighterKey;
      const selectedSlot = this.getVisualSlotLabel(selectedEntry.fighterKey);
      const selectedMod = window.modManager?.mods?.find(
        (entry) => entry.path === modDetails.path,
      ) || null;
      const layoutTargetPath = this.resolveLayoutTargetModPath(
        selectedMod || this.getSelectedMod(),
      );

      const getNameOptionPreview = (
        inspectorData: EchoUiCharaInspectorData,
      ): EchoUiNameOption | null => {
        const options = Array.isArray(inspectorData.nameOptions)
          ? inspectorData.nameOptions
          : [];
        if (options.length === 0) {
          return null;
        }

        if (selectedSlot) {
          const matchingOption = options.find((option) => option.slot === selectedSlot);
          if (matchingOption) {
            return matchingOption;
          }
        }

        return options[0];
      };

      const readInspectorForPath = async (
        sourcePath: string,
      ): Promise<EchoUiCharaInspectorData | null> => {
        if (!sourcePath || !window.electronAPI?.echoReadUiCharaStruct) {
          return null;
        }

        try {
          const result = (await window.electronAPI.echoReadUiCharaStruct(
            sourcePath,
            fighterName,
          )) as EchoUiCharaInspectorData | null;

          return result;
        } catch (_error) {
          return null;
        }
      };

      const renderInspectorSection = (
        sectionTitle: string,
        inspectorData: EchoUiCharaInspectorData | null,
      ): string => {
        if (!inspectorData) {
          return `
            <div class="echo-character-menu-param-block">
              <p class="echo-character-menu-mod-name">${this.escapeHtml(sectionTitle)}</p>
              <p class="echo-character-menu-empty">${this.t('echo.characterMenuDetailsNoParams')}</p>
            </div>
          `;
        }

        const nameOption = getNameOptionPreview(inspectorData);
        const getField = (hash: string) => this.formatInspectorValue(inspectorData.fields?.[hash]);

        return `
          <div class="echo-character-menu-param-block">
            <p class="echo-character-menu-mod-name">${this.escapeHtml(sectionTitle)}</p>
            <p class="echo-character-menu-mod-meta">${this.t('echo.inspectorSource')}: ${this.escapeHtml(inspectorData.sourcePath)}</p>
            <p class="echo-character-menu-mod-meta">ui_chara_id: ${this.escapeHtml(getField('ui_chara_id'))}</p>
            <p class="echo-character-menu-mod-meta">name_id: ${this.escapeHtml(getField('name_id'))}</p>
            <p class="echo-character-menu-mod-meta">fighter_kind: ${this.escapeHtml(getField('fighter_kind'))}</p>
            <p class="echo-character-menu-mod-meta">color_start_index: ${this.escapeHtml(getField('color_start_index'))}</p>
            <p class="echo-character-menu-mod-meta">color_num: ${this.escapeHtml(getField('color_num'))}</p>
            <p class="echo-character-menu-mod-meta">characall_label_c00: ${this.escapeHtml(getField('characall_label_c00'))}</p>
            ${
              nameOption
                ? `<p class="echo-character-menu-mod-meta">nam_chr2 (${this.escapeHtml(nameOption.slot)}): ${this.escapeHtml(this.formatInspectorValue(nameOption.namChr2))}</p>`
                : '<p class="echo-character-menu-mod-meta">nam_chr2: -</p>'
            }
          </div>
        `;
      };

      detailsContainer.innerHTML = `<p class="echo-loading">${this.t('echo.loading')}</p>`;

      const [modInspector, layoutInspector] = await Promise.all([
        readInspectorForPath(modDetails.path),
        layoutTargetPath && layoutTargetPath !== modDetails.path
          ? readInspectorForPath(layoutTargetPath)
          : Promise.resolve(null),
      ]);

      const inspectorSections: string[] = [];
      inspectorSections.push(
        renderInspectorSection(
          this.t('echo.characterMenuDetailsSourceMod'),
          modInspector,
        ),
      );

      if (layoutTargetPath && layoutTargetPath !== modDetails.path) {
        inspectorSections.push(
          renderInspectorSection(
            this.t('echo.characterMenuDetailsSourceTarget'),
            layoutInspector,
          ),
        );
      }

      detailsContainer.innerHTML = `
        <p class="echo-character-menu-mod-name">${this.escapeHtml(modDetails.name)}</p>
        <p class="echo-character-menu-mod-meta">${this.escapeHtml(this.getVisualTypeLabel(modDetails.type))} - ${this.escapeHtml(modDetails.status)}</p>
        <p class="echo-character-menu-mod-meta">${this.t('echo.characterMenuDetailsPath')}: ${this.escapeHtml(modDetails.path)}</p>
        <p class="echo-character-menu-mod-meta">${this.t('echo.characterMenuDetailsFighterCount')}: ${modDetails.fighterKeys.length}</p>
        ${inspectorSections.join('')}
      `;
    };

    const disableToggleButton = document.querySelector<HTMLElement>(
      '#echo-character-menu-disable-toggle',
    );
    if (disableToggleButton) {
      disableToggleButton.addEventListener('click', async () => {
        if (isDisabled) {
          await this.enableVisualCharacter(selectedEntry.fighterKey);
        } else {
          await this.disableVisualCharacter(selectedEntry.fighterKey);
        }

        this.closeCharacterQuickMenu();
      });
    }

    const selectCharacterMenuMod = async (modPath: string) => {
      if (!modPath || !window.modManager?.mods) return;

      const mod = window.modManager.mods.find((entry) => entry.path === modPath);
      if (!mod) return;

      this.selectedEchoModPath = mod.path;
      await window.modManager.selectMod(mod.id, true);
      this.updateSelectedModView(mod);
      await this.loadSelectedModAnalysis(mod);

      body
        .querySelectorAll<HTMLElement>('.echo-character-menu-mod-item')
        .forEach((item) => {
          item.classList.toggle('active', item.dataset.characterMenuItem === mod.path);
        });
    };

    body
      .querySelectorAll<HTMLElement>('.echo-character-menu-mod-item')
      .forEach((item) => {
        item.addEventListener('click', async (event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('button')) {
            return;
          }

          const modPath = item.dataset.characterMenuItem;
          if (!modPath) return;

          await selectCharacterMenuMod(modPath);
        });
      });

    body
      .querySelectorAll<HTMLElement>('[data-character-menu-details]')
      .forEach((button) => {
        button.addEventListener('click', async (event) => {
          event.stopPropagation();
          const modPath = button.dataset.characterMenuDetails;
          if (!modPath) return;
          await renderModDetails(modPath);
        });
      });

    body
      .querySelectorAll<HTMLElement>('[data-character-menu-create-mod]')
      .forEach((button) => {
        button.addEventListener('click', async () => {
          const modPath = button.dataset.characterMenuCreateMod;
          if (!modPath) return;

          await selectCharacterMenuMod(modPath);

          await this.createEchoDraftFromVisualSelection(modPath);
          this.closeCharacterQuickMenu();
        });
      });

    menu.style.display = 'flex';
  }

  async createEchoDraftFromVisualSelection(sourceModPath?: string) {
    const selectedEntry = this.getSelectedVisualEntry();

    if (!selectedEntry) {
      if (window.toastManager) {
        window.toastManager.warning('echo.visualNoSelectionToCreate');
      }
      return;
    }

    const token = this.normalizeName(selectedEntry.name || selectedEntry.fighterKey);
    if (token) {
      this.setEchoNameValue(token);
    }
    this.setEchoDisplayNameValue(selectedEntry.name || token);

    const sourceMod = sourceModPath
      ? selectedEntry.movesetMods.find((entry) => entry.path === sourceModPath) ||
        selectedEntry.fighterMods.find((entry) => entry.path === sourceModPath) ||
        selectedEntry.echoMods.find((entry) => entry.path === sourceModPath) ||
        null
      : selectedEntry.movesetMods.find((entry) => entry.status === 'active') ||
        selectedEntry.movesetMods[0] ||
        selectedEntry.fighterMods.find((entry) => entry.status === 'active') ||
        selectedEntry.fighterMods[0] ||
        selectedEntry.echoMods.find((entry) => entry.status === 'active') ||
        selectedEntry.echoMods[0] ||
        null;

    if (!sourceMod) {
      if (window.toastManager) {
        window.toastManager.warning('echo.visualNoModsForCharacter');
      }
      return;
    }

    if (selectedEntry.cardKind === 'echo' || sourceMod.type === 'echo') {
      if (window.toastManager) {
        window.toastManager.warning('echo.visualCannotCreateFromEcho');
      }
      return;
    }

    const mod = window.modManager?.mods?.find((entry) => entry.path === sourceMod.path);

    if (!mod) {
      if (window.toastManager) {
        window.toastManager.warning('echo.visualNoModsForCharacter');
      }
      return;
    }

    this.selectedEchoModPath = mod.path;
    if (window.modManager) {
      await window.modManager.selectMod(mod.id, true);
    }
    this.updateSelectedModView(mod);
    await this.loadSelectedModAnalysis(mod);
    this.setEchoDisplayNameValue(selectedEntry.name || token);

    this.openEchoWizard(selectedEntry, mod.path, token, selectedEntry.name || token);

    if (window.toastManager) {
      window.toastManager.success('echo.visualDraftCreated', 2500, {
        name: selectedEntry.name,
      });
    }
  }

  buildVisualSlotAssignments(
    pathData: Record<string, Record<string, unknown>>,
    selectedModPath?: string,
  ) {
    const slotAssignments = new Map<string, Map<string, string>>();
    let hasChanges = false;

    for (const fighterName of Object.keys(pathData || {})) {
      const fighterSlots = Object.keys(pathData[fighterName] || {})
        .filter((slot) => /^c\d{2,3}$/i.test(slot))
        .sort(
          (a, b) =>
            parseInt(a.replace('c', ''), 10) - parseInt(b.replace('c', ''), 10),
        );

      if (fighterSlots.length === 0) {
        continue;
      }

      const fighterKey = this.normalizeFighterKey(fighterName);
      let boardLookupKey = fighterKey;

      if (selectedModPath) {
        const echoCardKey = this.findEchoCardKeyForModAndFighter(
          selectedModPath,
          fighterKey,
        );

        if (echoCardKey && this.visualCharacterOrder.includes(echoCardKey)) {
          boardLookupKey = echoCardKey;
        }
      }

      const boardIndex = this.visualCharacterOrder.indexOf(boardLookupKey);

      if (boardIndex === -1) {
        continue;
      }

      const targetStart = boardIndex;
      const assignments = new Map<string, string>();

      fighterSlots.forEach((slot, slotIndex) => {
        const targetSlot = `c${String(targetStart + slotIndex).padStart(2, '0')}`;
        assignments.set(slot, targetSlot);
        if (slot !== targetSlot) {
          hasChanges = true;
        }
      });

      slotAssignments.set(fighterName, assignments);
    }

    return {
      slotAssignments,
      hasChanges,
    };
  }

  buildEchoCustomNamesForAssignments(
    slotAssignments: Map<string, Map<string, string>>,
  ): Record<
    string,
    Record<
      string,
      { cspName?: string; vsName?: string; boxingRing?: string; announcer?: string }
    >
  > {
    const customNames: Record<
      string,
      Record<
        string,
        { cspName?: string; vsName?: string; boxingRing?: string; announcer?: string }
      >
    > = {};

    const preferredToken = this.normalizeName(this.getEchoNameValue());
    if (!preferredToken) {
      return customNames;
    }

    const displayName =
      this.getEchoDisplayNameValue() ||
      this.formatEchoDisplayNameFromId(preferredToken);
    const introName =
      this.sanitizeEchoIntroName(this.echoPreferredIntroName) ||
      displayName;

    for (const [fighterName, assignments] of slotAssignments.entries()) {
      customNames[fighterName] = {};

      for (const targetSlot of assignments.values()) {
        customNames[fighterName][targetSlot] = {
          cspName: displayName,
          vsName: displayName.toUpperCase(),
          boxingRing: introName,
          announcer: 'vc_narration_characall',
        };
      }
    }

    return customNames;
  }

  async applyVisualPlannerToSelectedMod() {
    const mod = this.getSelectedMod();
    const selectedEntry = this.getSelectedVisualEntry();

    if (!mod || !mod.path) {
      if (window.toastManager) {
        window.toastManager.warning('echo.visualApplyNoMod');
      }
      return;
    }

    if (!window.electronAPI?.scanMod || !window.electronAPI?.changeSlots) {
      if (window.toastManager) {
        window.toastManager.error('echo.operationsUnavailable');
      }
      return;
    }

    if (this.lastAnalyzedModPath !== mod.path) {
      await this.loadSelectedModAnalysis(mod);
    }

    const scanResult = await window.electronAPI.scanMod(mod.path);

    if (!scanResult?.success) {
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToChangeSlot', 3000, {
          error: scanResult?.error || 'Unknown error',
        });
      }
      return;
    }

    const { slotAssignments, hasChanges } = this.buildVisualSlotAssignments(
      scanResult.data.pathData,
      mod.path,
    );

    if (slotAssignments.size === 0 || !hasChanges) {
      if (window.toastManager) {
        window.toastManager.warning('echo.visualApplyNoAssignments');
      }
      return;
    }

    const deletedSlots = new Map<string, Set<string>>();
    const compatibilityOptions = this.collectCompatibilityOptions(mod);

    if (
      compatibilityOptions.selectedCategories &&
      compatibilityOptions.selectedCategories.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.warning('echo.compatibilityNoCategories');
      }
      return;
    }

    const options: EchoOperationOptions = {
      ...compatibilityOptions,
      renameFolders: true,
      renameFiles: true,
      applyMetadata: true,
      generateConfig: true,
    };

    let slotCustomNamesByFighter: Record<
      string,
      Record<
        string,
        { cspName?: string; vsName?: string; boxingRing?: string; announcer?: string }
      >
    > = {};

    const isEchoFlow =
      this.shouldUseEchoDuplicateFlow(mod, selectedEntry) ||
      this.isEchoModFromScan(scanResult.data || {});

    if (isEchoFlow) {
      const preferredToken = this.normalizeName(this.getEchoNameValue());
      options.renameFiles = false;
      options.duplicateCharacter = true;
      options.duplicateNIndexOffset = 8;
      options.echoFighterName = preferredToken;
      options.echoSourceFighters = [...(scanResult.data.fighterNames || [])];
      slotCustomNamesByFighter = this.buildEchoCustomNamesForAssignments(
        slotAssignments,
      );
    }

    const applyResult = await window.electronAPI.changeSlots(
      mod.path,
      scanResult.data.pathData,
      slotAssignments,
      deletedSlots,
      slotCustomNamesByFighter,
      options,
    );

    if (applyResult?.success) {
      if (window.toastManager) {
        window.toastManager.success('echo.visualApplied');
      }

      await this.saveVisualPlannerState(false);
      await this.saveVisualLayoutStateToSlotTarget(mod);
      if (window.modManager) {
        await window.modManager.fetchMods();
      }
      await this.refresh();
      return;
    }

    if (window.toastManager) {
      window.toastManager.error('toasts.failedToChangeSlot', 3000, {
        error: applyResult?.error || 'Unknown error',
      });
    }
  }

  clearAnalysis() {
    const analysisContainer = document.querySelector<HTMLElement>('#echo-analysis-results');
    const previewImage = document.querySelector<HTMLImageElement>('#echo-preview-image');

    if (analysisContainer) {
      analysisContainer.innerHTML = `<p class="echo-empty">${this.t('echo.analysisPlaceholder')}</p>`;
    }

    if (previewImage) {
      previewImage.src = '';
      previewImage.style.display = 'none';
    }

    this.isEchoFighter = false;
    this.nameSuggestions = [];
    this.takenNames = [];
    this.uiCompatibilityPlan = null;
    this.uiCompatibilityState = null;
    this.setBuilderResultsVisible(false);
    this.renderNameSuggestions();
    this.renderCompatibilityPlanner(null, null);
    this.renderVisualPlanner();
    this.updateNameConflictView();
  }

  async refresh() {
    await this.refreshModEligibility();

    this.renderModPicker();

    const mod = this.getSelectedMod();
    this.updateSelectedModView(mod);

    if (!mod) {
      this.clearAnalysis();
      await this.refreshVisualPlanner();
      return;
    }

    const shouldShowAnalysis =
      this.activeSubview === 'planner' || this.builderCompletedModPath === mod.path;

    if (shouldShowAnalysis) {
      if (this.activeSubview === 'builder') {
        this.setBuilderResultsVisible(true);
      }
      await this.loadSelectedModAnalysis(mod);
    } else {
      this.setBuilderResultsVisible(false);
      const analysisContainer = document.querySelector<HTMLElement>(
        '#echo-analysis-results',
      );
      if (analysisContainer) {
        analysisContainer.innerHTML = `<p class="echo-empty">${this.t('echo.analysisPlaceholder')}</p>`;
      }
      const previewImage = document.querySelector<HTMLImageElement>('#echo-preview-image');
      if (previewImage) {
        previewImage.style.display = 'none';
        previewImage.src = '';
      }
    }

    await this.refreshVisualPlanner();
  }

  async loadSelectedModAnalysis(mod: Mod) {
    const analysisContainer = document.querySelector<HTMLElement>('#echo-analysis-results');
    const previewImage = document.querySelector<HTMLImageElement>('#echo-preview-image');

    if (!analysisContainer) return;

    analysisContainer.innerHTML = `<p class="echo-loading">${this.t('echo.loading')}</p>`;

    try {
      const [slotAnalysis, modInfo, previewUrl, compatibilityPlanResponse] = await Promise.all([
        window.electronAPI.echoGetSlotAnalysis?.(mod.path),
        window.electronAPI.echoGetModInfo?.(mod.path),
        window.electronAPI.echoGetPreviewImage?.(mod.path),
        window.electronAPI.echoPlanUiCompatibility?.(mod.path),
      ]);

      const analysisData = slotAnalysis?.success ? slotAnalysis : null;

      this.isEchoFighter = Boolean(analysisData?.isEchoFighter);
      this.nameSuggestions = Array.isArray(analysisData?.nameSuggestions)
        ? analysisData.nameSuggestions
          .map((suggestion) => this.normalizeName(suggestion))
          .filter((suggestion) => Boolean(suggestion))
        : [];
      this.takenNames = Array.isArray(analysisData?.takenNames)
        ? analysisData.takenNames
        : [];

      if (this.lastAnalyzedModPath !== mod.path) {
        this.setEchoNameValue(analysisData?.defaultEchoName || this.normalizeName(mod.name));
        this.setEchoDisplayNameValue(
          this.formatEchoDisplayNameFromId(this.getEchoNameValue()),
        );
      } else {
        this.updateNameConflictView();
      }

      this.renderNameSuggestions();
      this.lastAnalyzedModPath = mod.path;

      const compatibilityPlan = compatibilityPlanResponse?.success
        ? (compatibilityPlanResponse as EchoUiCompatibilityPlan)
        : null;

      this.renderCompatibilityPlanner(mod, compatibilityPlan);

      const hasAnalysisData = Boolean(analysisData || modInfo || previewUrl);
      this.updateStepProgress(true, hasAnalysisData);

      const fighterRows = analysisData
        ? analysisData.fighters
          .map(
            (fighter: { fighterName: string; slots: string[]; numColorSlots: number; suggestedName?: string }) =>
              `<tr><td>${this.escapeHtml(fighter.fighterName)}</td><td>${fighter.slots.map((slot: string) => this.escapeHtml(slot)).join(', ') || '-'}</td><td>${fighter.numColorSlots}</td><td>${this.escapeHtml(fighter.suggestedName || '-')}</td></tr>`,
          )
          .join('')
        : '';

      const modDisplayName = modInfo?.display_name || mod.name;
      const modAuthors = modInfo?.authors || '-';
      const modVersion = modInfo?.version || '-';

      analysisContainer.innerHTML = `
        <div class="echo-info-grid">
          <div><strong>${this.t('echo.infoName')}:</strong> ${this.escapeHtml(modDisplayName)}</div>
          <div><strong>${this.t('echo.infoAuthors')}:</strong> ${this.escapeHtml(modAuthors)}</div>
          <div><strong>${this.t('echo.infoVersion')}:</strong> ${this.escapeHtml(modVersion)}</div>
        </div>
        <div class="echo-table-wrapper">
          <table class="echo-table">
            <thead>
              <tr>
                <th>${this.t('echo.tableFighter')}</th>
                <th>${this.t('echo.tableSlots')}</th>
                <th>${this.t('echo.tableColors')}</th>
                <th>${this.t('echo.tableSuggestedName')}</th>
              </tr>
            </thead>
            <tbody>
              ${fighterRows || `<tr><td colspan="4">${this.t('echo.noAnalysis')}</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      if (previewImage) {
        if (previewUrl) {
          previewImage.src = previewUrl;
          previewImage.style.display = 'block';
        } else {
          previewImage.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('Failed to load echo analysis:', error);
      analysisContainer.innerHTML = `<p class="echo-error">${this.t('echo.failedToLoad')}</p>`;
      this.updateStepProgress(true, false);
    }
  }

  async launchBuilderEchoFlow() {
    const mod = this.getSelectedMod();

    if (!mod || !mod.path) {
      window.toastManager?.warning('echo.noSelectedMod');
      return;
    }

    if (!window.electronAPI?.scanMod || !window.electronAPI?.changeSlots) {
      window.toastManager?.error('echo.operationsUnavailable');
      return;
    }

    const scanResult = await window.electronAPI.scanMod(mod.path);
    if (!scanResult?.success) {
      window.toastManager?.error('toasts.failedToChangeSlot', 3000, {
        error: scanResult?.error || 'Unknown error',
      });
      return;
    }

    const defaultToken = this.normalizeName(
      this.getEchoNameValue() || mod.name || '',
    );
    this.setEchoNameValue(defaultToken);
    this.setEchoDisplayNameValue(
      this.getEchoDisplayNameValue() || this.formatEchoDisplayNameFromId(defaultToken),
    );

    const compatibilityOptions = this.collectCompatibilityOptions(mod);

    const forceEchoFlow = this.isEchoModFromScan(scanResult.data || {});

    window.modalManager?.openChangeSlotModal(
      mod,
      scanResult.data,
      async (
        slotAssignments,
        deletedSlots,
        slotCustomNamesByFighter,
        echoOperationOptions,
      ) => {
        const changeSlotsResult = await window.electronAPI.changeSlots(
          mod.path,
          scanResult.data.pathData,
          slotAssignments,
          deletedSlots,
          slotCustomNamesByFighter,
          echoOperationOptions,
        );

        if (!changeSlotsResult?.success) {
          window.toastManager?.error('toasts.failedToChangeSlot', 3000, {
            error: changeSlotsResult?.error || 'Unknown error',
          });
          return;
        }

        window.toastManager?.success('toasts.slotChanged');
        this.builderCompletedModPath = mod.path;
        this.setBuilderResultsVisible(true);
        await this.loadSelectedModAnalysis(mod);
        await window.modManager?.fetchMods();
        await this.refreshVisualPlanner();
      },
      {
        isEchoFighter: forceEchoFlow,
        preferredEchoName: this.getEchoNameValue(),
        preferredEchoDisplayName: this.getEchoDisplayNameValue(),
        preferredEchoIntroName:
          this.sanitizeEchoIntroName(this.echoPreferredIntroName) ||
          this.getEchoDisplayNameValue(),
        nameSuggestions: this.nameSuggestions,
        takenNames: this.takenNames,
        echoOperationOptions: compatibilityOptions,
      },
    );
  }

  async openChangeSlotFlow() {
    const mod =
      this.getSelectedMod() ||
      window.modManager?.mods?.find(
        (entry) => entry.path === this.selectedEchoModPath,
      ) ||
      null;
    const selectedEntry = this.getSelectedVisualEntry();

    if (!mod) {
      if (window.toastManager) {
        window.toastManager.warning('echo.noSelectedMod');
      }
      return;
    }

    if (!window.modManager?.operations) {
      if (window.toastManager) {
        window.toastManager.error('echo.operationsUnavailable');
      }
      return;
    }

    const preferredEchoName = this.getEchoNameValue();
    const preferredEchoDisplayName = this.getEchoDisplayNameValue();
    const preferredEchoIntroName =
      this.sanitizeEchoIntroName(this.echoPreferredIntroName) ||
      preferredEchoDisplayName;
    const nameConflicts = this.getNameConflicts(preferredEchoName);
    const forceEchoFlow = this.shouldUseEchoDuplicateFlow(mod, selectedEntry);

    if (nameConflicts.length > 0 && window.toastManager) {
      window.toastManager.warning('echo.nameConflictApplyWarning');
    }

    const compatibilityOptions = this.collectCompatibilityOptions(mod);

    if (
      compatibilityOptions.selectedCategories &&
      compatibilityOptions.selectedCategories.length === 0
    ) {
      if (window.toastManager) {
        window.toastManager.warning('echo.compatibilityNoCategories');
      }
      return;
    }

    await window.modManager.operations.startChangeSlotsFlow(mod, {
      isEchoFighter: forceEchoFlow,
      preferredEchoName,
      preferredEchoDisplayName,
      preferredEchoIntroName,
      nameSuggestions: this.nameSuggestions,
      takenNames: this.takenNames,
      echoOperationOptions: compatibilityOptions,
      onSlotsApplied: async () => {
        await this.refreshVisualPlanner();

        this.renderModPicker(
          document.querySelector<HTMLInputElement>('#echo-mod-search')?.value || '',
        );
      },
    });
  }

  escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

if (typeof window !== 'undefined') {
  window.echoManager = new EchoManager();
  console.log('Echo Manager initialized globally');
}

export { type EchoManager };
