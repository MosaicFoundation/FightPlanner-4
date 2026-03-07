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
  visualSelectedCharacter: string | null;
  visualCharactersByKey: Map<string, VisualCharacterEntry>;
  visualMods: VisualModEntry[];
  visualUnmappedMods: VisualModEntry[];
  visualLoading: boolean;
  visualDraggedCharacter: string | null;
  activeSubview: EchoSubview;
  visualCharacterImageCache: Map<string, string>;
  visualModScanCache: Map<string, VisualModScanCacheEntry>;
  uiCharaInspectorLoading: boolean;
  uiCharaInspectorData: EchoUiCharaInspectorData | null;
  uiCharaInspectorError: string | null;

  constructor() {
    this.initialized = false;
    this.selectedEchoModPath = null;
    this.lastAnalyzedModPath = null;
    this.isEchoFighter = false;
    this.nameSuggestions = [];
    this.takenNames = [];
    this.modEligibilityByPath = new Map();
    this.uiCompatibilityPlan = null;
    this.uiCompatibilityState = null;
    this.visualCharacterOrder = [];
    this.visualSelectedCharacter = null;
    this.visualCharactersByKey = new Map();
    this.visualMods = [];
    this.visualUnmappedMods = [];
    this.visualLoading = false;
    this.visualDraggedCharacter = null;
    this.activeSubview = 'planner';
    this.visualCharacterImageCache = new Map();
    this.visualModScanCache = new Map();
    this.uiCharaInspectorLoading = false;
    this.uiCharaInspectorData = null;
    this.uiCharaInspectorError = null;
    console.log('Echo Manager created');
  }

  t(key: string, params = {}) {
    if (window.i18n && window.i18n.t) {
      return window.i18n.t(key, params);
    }

    return key;
  }

  async initialize() {
    this.setupEventListeners();
    await this.loadSubviewState();
    await this.loadVisualPlannerState();
    await this.refreshModEligibility();
    await this.refresh();
    this.applySubviewState();
    this.initialized = true;
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

    const openSlotBtn = document.querySelector<HTMLElement>('#echo-open-slot-modal-btn');
    if (openSlotBtn) {
      const newOpenSlotBtn = openSlotBtn.cloneNode(true) as HTMLElement;
      openSlotBtn.parentNode?.replaceChild(newOpenSlotBtn, openSlotBtn);
      newOpenSlotBtn.addEventListener('click', () => this.openChangeSlotFlow());
    }

    const searchInput = document.querySelector<HTMLInputElement>('#echo-mod-search');
    if (searchInput) {
      const newSearchInput = searchInput.cloneNode(true) as HTMLInputElement;
      searchInput.parentNode?.replaceChild(newSearchInput, searchInput);
      newSearchInput.addEventListener('input', () => {
        this.renderModPicker(newSearchInput.value);
      });
    }

    const nameInput = document.querySelector<HTMLInputElement>('#echo-new-name-input');
    if (nameInput) {
      const newNameInput = nameInput.cloneNode(true) as HTMLInputElement;
      nameInput.parentNode?.replaceChild(newNameInput, nameInput);
      newNameInput.addEventListener('input', () => {
        this.updateNameConflictView();
        this.syncEchoDisplayNameFromId();
      });
    }

    const uiNameInput = document.querySelector<HTMLInputElement>(
      '#echo-ui-display-name-input',
    );
    if (uiNameInput) {
      const newUiNameInput = uiNameInput.cloneNode(true) as HTMLInputElement;
      uiNameInput.parentNode?.replaceChild(newUiNameInput, uiNameInput);
      newUiNameInput.addEventListener('input', () => {
        const normalizedValue = this.sanitizeEchoDisplayName(newUiNameInput.value);
        if (newUiNameInput.value !== normalizedValue) {
          newUiNameInput.value = normalizedValue;
        }
      });
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

  formatEchoDisplayNameFromId(token: string): string {
    if (!token) {
      return '';
    }

    return token.charAt(0).toUpperCase() + token.slice(1);
  }

  getEchoNameValue(): string {
    const input = document.querySelector<HTMLInputElement>('#echo-new-name-input');
    return this.normalizeName(input?.value || '');
  }

  getEchoDisplayNameValue(): string {
    const input = document.querySelector<HTMLInputElement>(
      '#echo-ui-display-name-input',
    );

    const sanitizedValue = this.sanitizeEchoDisplayName(input?.value || '');
    if (input && input.value !== sanitizedValue) {
      input.value = sanitizedValue;
    }

    if (sanitizedValue) {
      return sanitizedValue;
    }

    return this.formatEchoDisplayNameFromId(this.getEchoNameValue());
  }

  setEchoNameValue(value: string) {
    const input = document.querySelector<HTMLInputElement>('#echo-new-name-input');
    if (!input) return;

    input.value = this.normalizeName(value);
    this.updateNameConflictView();
    this.syncEchoDisplayNameFromId();
  }

  setEchoDisplayNameValue(value: string) {
    const input = document.querySelector<HTMLInputElement>(
      '#echo-ui-display-name-input',
    );

    if (!input) return;
    input.value = this.sanitizeEchoDisplayName(value);
  }

  syncEchoDisplayNameFromId() {
    const input = document.querySelector<HTMLInputElement>(
      '#echo-ui-display-name-input',
    );

    if (!input) {
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
    const modList = document.querySelector<HTMLElement>('#echo-mod-list');
    if (!modList) return;

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const allMods = this.getAllMods();

    const filteredMods = allMods.filter((mod) =>
      mod.name.toLowerCase().includes(normalizedQuery),
    );

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

    const remoteUrl = window.CHARACTER_IMAGES?.[fighterKey] || '';

    if (!window.electronAPI?.echoResolveCharacterImage || !remoteUrl) {
      return remoteUrl;
    }

    try {
      const resolved = await window.electronAPI.echoResolveCharacterImage(
        fighterKey,
        remoteUrl,
      );
      const finalUrl = resolved || remoteUrl;
      if (resolved && resolved.startsWith('file:')) {
        this.visualCharacterImageCache.set(fighterKey, resolved);
      }
      return finalUrl;
    } catch (error) {
      return remoteUrl;
    }
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
      const scanResult = await window.electronAPI.scanMod(mod.path);

      if (!scanResult?.success) {
        this.visualModScanCache.set(mod.path, { cacheKey, entry: null });
        return null;
      }

      const fighterKeys = Array.from(
        new Set(
          (scanResult.data?.fighterNames || [])
            .map((rawName) => this.normalizeFighterKey(rawName))
            .filter((fighterKey) => Boolean(window.SSBU_CHARACTERS?.[fighterKey])),
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
        previewUrl: null,
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
      this.visualSelectedCharacter = stored.selectedCharacter || null;
      this.ensureVisualCharacterOrder();
    } catch (error) {
      console.warn('Failed to load visual planner state:', error);
      this.visualCharacterOrder = this.getDefaultCharacterOrder();
      this.visualSelectedCharacter = null;
    }
  }

  async saveVisualPlannerState(showToast = false) {
    try {
      if (!window.electronAPI?.store?.set) return;

      const payload: VisualPlannerPersistedState = {
        characterOrder: this.visualCharacterOrder,
        selectedCharacter: this.visualSelectedCharacter,
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
        const fighterInfo = window.SSBU_CHARACTERS?.[fighterKey];
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

    if (
      this.visualSelectedCharacter &&
      !this.visualCharactersByKey.has(this.visualSelectedCharacter)
    ) {
      this.visualSelectedCharacter = null;
    }

    this.visualLoading = false;
    await this.refreshUiCharaInspector();
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

    return window.SSBU_CHARACTERS?.[entry.baseFighterKey]?.name || entry.baseFighterKey;
  }

  getVisualCardSubtitle(entry: VisualCharacterEntry): string {
    const primaryMod = this.getPrimaryVisualModForEntry(entry);
    return primaryMod?.name || '';
  }

  renderVisualPlanner() {
    const container = document.querySelector<HTMLElement>('#echo-visual-content');
    if (!container) return;

    if (this.visualLoading) {
      container.innerHTML = `<p class="echo-loading">${this.t('echo.loading')}</p>`;
      return;
    }

    const counts = this.getVisualSummaryCounts();
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

    const inspectorTargetLabel = this.resolveLayoutTargetModPath(this.getSelectedMod()) || '-';
    const selectedSlotLabel = this.getSelectedVisualSlotLabel() || '-';
    const selectedNameOption = this.getSelectedInspectorNameOption();
    const inspectorNameOptions = this.getInspectorNameOptions();

    const inspectorNameOptionsHtml =
      !selectedNameOption || inspectorNameOptions.length === 0
        ? `<p class="echo-empty">${this.t('echo.inspectorNameOptionsEmpty')}</p>`
        : `
          <div class="echo-inspector-name-grid">
            <div class="echo-inspector-name-card active">
              <p class="echo-inspector-name-card-title">${this.escapeHtml(selectedNameOption.slot.toUpperCase())} - #${this.escapeHtml(selectedNameOption.labelIndex)}</p>
              <div class="echo-inspector-name-card-row"><span>nam_chr0</span><code>${this.escapeHtml(this.formatInspectorValue(selectedNameOption.namChr0))}</code></div>
              <div class="echo-inspector-name-card-row"><span>nam_chr1</span><code>${this.escapeHtml(this.formatInspectorValue(selectedNameOption.namChr1))}</code></div>
              <div class="echo-inspector-name-card-row"><span>nam_chr2</span><code>${this.escapeHtml(this.formatInspectorValue(selectedNameOption.namChr2))}</code></div>
              <div class="echo-inspector-name-card-row"><span>nam_chr3</span><code>${this.escapeHtml(this.formatInspectorValue(selectedNameOption.namChr3))}</code></div>
              <div class="echo-inspector-name-card-row"><span>nam_stage_name</span><code>${this.escapeHtml(this.formatInspectorValue(selectedNameOption.namStageName))}</code></div>
              <div class="echo-inspector-name-card-row"><span>characall_label</span><code>${this.escapeHtml(this.formatInspectorValue(selectedNameOption.announcer))}</code></div>
            </div>
          </div>
        `;

    const inspectorContent = this.uiCharaInspectorLoading
      ? `<p class="echo-loading">${this.t('echo.loading')}</p>`
      : this.uiCharaInspectorError
        ? `<p class="echo-empty">${this.escapeHtml(this.uiCharaInspectorError)}</p>`
        : this.uiCharaInspectorData
          ? `
            <div class="echo-inspector-grid">
              <div class="echo-inspector-row"><span>${this.t('echo.inspectorSelectedSlot')}</span><code>${this.escapeHtml(selectedSlotLabel.toUpperCase())}</code></div>
              <div class="echo-inspector-row"><span>${this.t('echo.inspectorLabelIndex')}</span><code>${this.escapeHtml(this.formatInspectorValue(selectedNameOption?.labelIndex || ''))}</code></div>
              <div class="echo-inspector-row"><span>ui_chara_id</span><code>${this.escapeHtml(this.getInspectorFieldValue('ui_chara_id'))}</code></div>
              <div class="echo-inspector-row"><span>name_id</span><code>${this.escapeHtml(this.getInspectorFieldValue('name_id'))}</code></div>
              <div class="echo-inspector-row"><span>fighter_kind</span><code>${this.escapeHtml(this.getInspectorFieldValue('fighter_kind'))}</code></div>
              <div class="echo-inspector-row"><span>fighter_kind_corps</span><code>${this.escapeHtml(this.getInspectorFieldValue('fighter_kind_corps'))}</code></div>
              <div class="echo-inspector-row"><span>alt_chara_id</span><code>${this.escapeHtml(this.getInspectorFieldValue('alt_chara_id'))}</code></div>
              <div class="echo-inspector-row"><span>color_start_index</span><code>${this.escapeHtml(this.getInspectorFieldValue('color_start_index'))}</code></div>
              <div class="echo-inspector-row"><span>color_num</span><code>${this.escapeHtml(this.getInspectorFieldValue('color_num'))}</code></div>
              <div class="echo-inspector-row"><span>c00_index</span><code>${this.escapeHtml(this.getInspectorFieldValue('c00_index'))}</code></div>
              <div class="echo-inspector-row"><span>n00_index</span><code>${this.escapeHtml(this.getInspectorFieldValue('n00_index'))}</code></div>
              <div class="echo-inspector-row"><span>characall_label_c00</span><code>${this.escapeHtml(this.getInspectorFieldValue('characall_label_c00'))}</code></div>
            </div>
            <div class="echo-inspector-name-options">
              <p class="echo-inspector-name-options-title">${this.t('echo.inspectorNameOptionsTitle')}</p>
              ${inspectorNameOptionsHtml}
            </div>
            <p class="echo-section-hint">${this.t('echo.inspectorSource')}: ${this.escapeHtml(this.uiCharaInspectorData.sourcePath)}</p>
          `
          : `<p class="echo-empty">${this.t('echo.inspectorNoData')}</p>`;

    const tilesHtml = this.visualCharacterOrder
      .map((fighterKey) => {
        const entry = this.visualCharactersByKey.get(fighterKey);
        if (!entry) return '';

        const isActive = fighterKey === this.visualSelectedCharacter;
        const slotLabel = this.getVisualSlotLabel(fighterKey);

        const badges: string[] = [];
        if (entry.fighterMods.length > 0) {
          badges.push(
            `<span class="echo-visual-badge fighter">${this.t('echo.visualTypeFighter')}: ${entry.fighterMods.length}</span>`,
          );
        }
        if (entry.movesetMods.length > 0) {
          badges.push(
            `<span class="echo-visual-badge moveset">${this.t('echo.visualTypeMoveset')}: ${entry.movesetMods.length}</span>`,
          );
        }
        if (entry.echoMods.length > 0) {
          badges.push(
            `<span class="echo-visual-badge echo">${this.t('echo.visualTypeEcho')}: ${entry.echoMods.length}</span>`,
          );
        }

        if (entry.cardKind === 'echo') {
          const baseName =
            this.visualCharactersByKey.get(entry.baseFighterKey)?.name ||
            entry.baseFighterKey;
          badges.unshift(
            `<span class="echo-visual-badge echo">Echo of ${this.escapeHtml(baseName)}</span>`,
          );

          if (slotLabel) {
            badges.unshift(
              `<span class="echo-visual-badge echo">${this.escapeHtml(slotLabel.toUpperCase())}</span>`,
            );
          }
        }

        const tileTitle = this.getVisualCardTitle(entry);
        const tileSubtitle = this.getVisualCardSubtitle(entry);
        const imageUrl = this.escapeHtml(entry.modPreviewUrl || entry.imageUrl || '');
        const fallbackInitials = this.escapeHtml(this.getVisualTileInitials(tileTitle));

        return `
          <div
            class="echo-visual-tile ${isActive ? 'active' : ''}"
            data-fighter="${this.escapeHtml(fighterKey)}"
            draggable="true"
          >
            <div class="echo-visual-tile-media">
              <img
                class="echo-visual-tile-image"
                src="${imageUrl}"
                alt="${this.escapeHtml(tileTitle)}"
                loading="lazy"
                onerror="this.style.display='none'; this.parentElement.querySelector('.echo-visual-tile-image-fallback').classList.add('visible');"
              />
              <div class="echo-visual-tile-image-fallback">${fallbackInitials}</div>
              <div class="echo-visual-tile-subtitle">${this.escapeHtml(tileTitle)}</div>
            </div>
            ${
              tileSubtitle
                ? `<div class="echo-visual-tile-body"><p class="echo-visual-tile-submeta">${this.escapeHtml(tileSubtitle)}</p></div>`
                : ''
            }
            <div class="echo-visual-tile-badges">${badges.join('')}</div>
          </div>
        `;
      })
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
                      <div class="echo-visual-mod-item" data-mod-path="${this.escapeHtml(mod.path)}">
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
      <div class="echo-visual-summary">
        <div class="echo-visual-summary-item">
          <p class="echo-visual-summary-title">${this.t('echo.visualSummaryFighters')}</p>
          <p class="echo-visual-summary-value">${counts.fighters}</p>
        </div>
        <div class="echo-visual-summary-item">
          <p class="echo-visual-summary-title">${this.t('echo.visualSummaryFighterMods')}</p>
          <p class="echo-visual-summary-value">${counts.fighterMods}</p>
        </div>
        <div class="echo-visual-summary-item">
          <p class="echo-visual-summary-title">${this.t('echo.visualSummaryMovesets')}</p>
          <p class="echo-visual-summary-value">${counts.movesets}</p>
        </div>
        <div class="echo-visual-summary-item">
          <p class="echo-visual-summary-title">${this.t('echo.visualSummaryEchoes')}</p>
          <p class="echo-visual-summary-value">${counts.echoes}</p>
        </div>
      </div>

      <div class="echo-visual-selected-inline">
        <p class="echo-visual-selected-inline-text">${this.escapeHtml(selectedSummary)}</p>
        <button
          id="echo-visual-open-menu-btn"
          class="input-btn short"
          type="button"
          ${selectedEntry ? '' : 'disabled'}
        >
          ${this.t('echo.visualOpenCharacterMenu')}
        </button>
      </div>

      <div class="echo-inspector-panel">
        <h4 class="echo-inspector-title">${this.t('echo.inspectorTitle')}</h4>
        <p class="echo-section-hint">${this.t('echo.inspectorTarget')}: ${this.escapeHtml(inspectorTargetLabel)}</p>
        ${inspectorContent}
      </div>

      <div class="echo-visual-board" id="echo-visual-board">${tilesHtml}</div>
      ${unmappedModsHtml}
    `;

    this.bindVisualPlannerBoardEvents();
    this.bindVisualPlannerModItemEvents();

    const openMenuBtn = document.querySelector<HTMLElement>('#echo-visual-open-menu-btn');
    if (openMenuBtn) {
      openMenuBtn.addEventListener('click', () => {
        this.openCharacterQuickMenu();
      });
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
            await this.loadSelectedModAnalysis(sourceMod);
          }
        }

        this.visualSelectedCharacter = fighterKey;
        await this.refreshUiCharaInspector();
        this.renderVisualPlanner();
        await this.saveVisualPlannerState(false);
        this.openCharacterQuickMenu(fighterKey);
      });

      tile.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        const entry = this.visualCharactersByKey.get(fighterKey);
        if (entry?.sourceModPath) {
          this.selectedEchoModPath = entry.sourceModPath;

          const sourceMod = window.modManager?.mods?.find(
            (modEntry) => modEntry.path === entry.sourceModPath,
          );

          if (sourceMod && window.modManager) {
            await window.modManager.selectMod(sourceMod.id, true);
            this.updateSelectedModView(sourceMod);
            await this.loadSelectedModAnalysis(sourceMod);
          }
        }

        this.visualSelectedCharacter = fighterKey;
        await this.refreshUiCharaInspector();
        this.renderVisualPlanner();
        await this.saveVisualPlannerState(false);
        this.openCharacterQuickMenu(fighterKey);
      });

      tile.addEventListener('dragstart', (event) => {
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

    title.textContent = this.t('echo.characterMenuTitle', {
      name: titleLabel,
    });

    const modsHtml =
      selectedMods.length === 0
        ? `<p class="echo-character-menu-empty">${this.t('echo.characterMenuNoMods')}</p>`
        : selectedMods
            .map(
              (mod) => `
                <div class="echo-character-menu-mod-item">
                  ${
                    mod.previewUrl
                      ? `<img class="echo-character-menu-mod-thumb" src="${this.escapeHtml(mod.previewUrl)}" alt="${this.escapeHtml(mod.name)}" loading="lazy" />`
                      : '<div class="echo-character-menu-mod-thumb placeholder"></div>'
                  }
                  <div>
                    <p class="echo-character-menu-mod-name">${this.escapeHtml(mod.name)}</p>
                    <p class="echo-character-menu-mod-meta">${this.escapeHtml(this.getVisualTypeLabel(mod.type))} - ${this.escapeHtml(mod.status)}</p>
                  </div>
                  <button class="input-btn short" type="button" data-character-menu-mod="${this.escapeHtml(mod.path)}">
                    ${this.t('echo.characterMenuSelectMod')}
                  </button>
                </div>
              `,
            )
            .join('');

    body.innerHTML = `
      <div class="echo-character-menu-actions">
        <button class="input-btn short" type="button" id="echo-character-menu-create">
          ${this.t('echo.characterMenuCreateEcho')}
        </button>
      </div>
      <div class="echo-visual-mod-list">${modsHtml}</div>
    `;

    const createButton = document.querySelector<HTMLElement>(
      '#echo-character-menu-create',
    );
    if (createButton) {
      createButton.addEventListener('click', async () => {
        await this.createEchoDraftFromVisualSelection();
        this.closeCharacterQuickMenu();
      });
    }

    body
      .querySelectorAll<HTMLElement>('[data-character-menu-mod]')
      .forEach((button) => {
        button.addEventListener('click', async () => {
          const modPath = button.dataset.characterMenuMod;
          if (!modPath || !window.modManager?.mods) return;

          const mod = window.modManager.mods.find((entry) => entry.path === modPath);
          if (!mod) return;

          this.selectedEchoModPath = mod.path;
          await window.modManager.selectMod(mod.id, true);
          this.updateSelectedModView(mod);
          await this.loadSelectedModAnalysis(mod);
          this.closeCharacterQuickMenu();
        });
      });

    menu.style.display = 'flex';
  }

  async createEchoDraftFromVisualSelection() {
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

    const sourceMod =
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
    await this.setActiveSubview('builder');
    this.updateSelectedModView(mod);
    await this.loadSelectedModAnalysis(mod);
    this.setEchoDisplayNameValue(selectedEntry.name || token);

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

    for (const [fighterName, assignments] of slotAssignments.entries()) {
      customNames[fighterName] = {};

      for (const targetSlot of assignments.values()) {
        customNames[fighterName][targetSlot] = {
          cspName: displayName,
          vsName: displayName.toUpperCase(),
          boxingRing: displayName.toUpperCase(),
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
    this.renderNameSuggestions();
    this.renderCompatibilityPlanner(null, null);
    this.renderVisualPlanner();
    this.updateNameConflictView();
  }

  async refresh() {
    await this.refreshModEligibility();

    this.renderModPicker(
      document.querySelector<HTMLInputElement>('#echo-mod-search')?.value || '',
    );

    const mod = this.getSelectedMod();
    this.updateSelectedModView(mod);

    if (!mod) {
      this.clearAnalysis();
      await this.refreshVisualPlanner();
      return;
    }

    await this.loadSelectedModAnalysis(mod);
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

  async openChangeSlotFlow() {
    const mod = this.getSelectedMod();
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
      nameSuggestions: this.nameSuggestions,
      takenNames: this.takenNames,
      echoOperationOptions: compatibilityOptions,
    });

    await this.refreshVisualPlanner();

    this.renderModPicker(
      document.querySelector<HTMLInputElement>('#echo-mod-search')?.value || '',
    );
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
