import type { Mod } from '../mods/mod-manager';

type EchoTakenName = {
  name: string;
  modName: string;
  modPath: string;
};

class EchoManager {
  initialized: boolean;
  selectedEchoModPath: string | null;
  lastAnalyzedModPath: string | null;
  isEchoFighter: boolean;
  nameSuggestions: string[];
  takenNames: EchoTakenName[];
  modEligibilityByPath: Map<string, boolean>;

  constructor() {
    this.initialized = false;
    this.selectedEchoModPath = null;
    this.lastAnalyzedModPath = null;
    this.isEchoFighter = false;
    this.nameSuggestions = [];
    this.takenNames = [];
    this.modEligibilityByPath = new Map();
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
    await this.refreshModEligibility();
    await this.refresh();
    this.initialized = true;
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
      newNameInput.addEventListener('input', () => this.updateNameConflictView());
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

  getEchoNameValue(): string {
    const input = document.querySelector<HTMLInputElement>('#echo-new-name-input');
    return this.normalizeName(input?.value || '');
  }

  setEchoNameValue(value: string) {
    const input = document.querySelector<HTMLInputElement>('#echo-new-name-input');
    if (!input) return;

    input.value = this.normalizeName(value);
    this.updateNameConflictView();
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
    const selectedModEl = document.querySelector<HTMLElement>('#echo-selected-mod');
    if (!selectedModEl) return;

    if (!mod) {
      selectedModEl.textContent = this.t('echo.noSelectedMod');
      this.updateStepProgress(false, false);
      return;
    }

    selectedModEl.textContent = this.t('echo.selectedMod', { name: mod.name });
    this.updateStepProgress(true, false);
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
    this.renderNameSuggestions();
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
      return;
    }

    await this.loadSelectedModAnalysis(mod);
  }

  async loadSelectedModAnalysis(mod: Mod) {
    const analysisContainer = document.querySelector<HTMLElement>('#echo-analysis-results');
    const previewImage = document.querySelector<HTMLImageElement>('#echo-preview-image');

    if (!analysisContainer) return;

    analysisContainer.innerHTML = `<p class="echo-loading">${this.t('echo.loading')}</p>`;

    try {
      const [slotAnalysis, modInfo, previewUrl] = await Promise.all([
        window.electronAPI.echoGetSlotAnalysis?.(mod.path),
        window.electronAPI.echoGetModInfo?.(mod.path),
        window.electronAPI.echoGetPreviewImage?.(mod.path),
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
      } else {
        this.updateNameConflictView();
      }

      this.renderNameSuggestions();
      this.lastAnalyzedModPath = mod.path;

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
    const nameConflicts = this.getNameConflicts(preferredEchoName);

    if (nameConflicts.length > 0 && window.toastManager) {
      window.toastManager.warning('echo.nameConflictApplyWarning');
    }

    await window.modManager.operations.startChangeSlotsFlow(mod, {
      isEchoFighter: this.isEchoFighter,
      preferredEchoName,
      nameSuggestions: this.nameSuggestions,
      takenNames: this.takenNames,
    });

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
